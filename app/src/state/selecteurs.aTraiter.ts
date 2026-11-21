/**
 * Les sujets « à traiter » : un calcul chargé à la demande.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODULE À PART
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ces sujets nourrissent trois affichages secondaires — les pastilles du rail,
 * l'indicateur de la barre, les décisions du Pilote — et aucun ne porte le
 * versable. Les laisser dans `selecteurs.ts` emportait dans le paquet de
 * premier rendu la CFE, les déclarations, la DES et les échéances
 * réglementaires. Le budget d'entrée l'a signalé quand la provision d'impôt a
 * dû y lire le planning ; relever le seuil aurait masqué la cause.
 */

import type { DateISO, Mois } from '../domain/types';
import { euros } from '../domain/types';
import {
  type EcranCible, type EntreeATraiter, type Gravite, type PeriodeATraiter, type SujetATraiter,
  compteursParEcran, sujetsATraiter
} from '../domain/calculs/aTraiter';
import { decaler } from '../domain/calculs/calendrier';
import { moisDeLaPeriode, periodeDuMois } from '../domain/calculs/declarations';
import {
  type Etape, type Obligation, dateDeLEtape, estPrevue, etapePrincipale, obligationsATraiter
} from '../domain/calculs/obligations';
import type { Faits, Recette } from './schema';
import { montantDeclaration, obligationsEntre, preneursDeServices } from './selecteurs.obligations';
import { FORMULE_PAR_DEFAUT, echeanceDe } from '../domain/calculs/delaiPaiement';
import { finAnnoncee } from '../domain/calculs/carnetDeCommandes.echeance';

// Servi ici pour que le rail le calcule avec les sujets, dans le même paquet différé.
export { compteursParEcran };
// Déplacés dans `selecteurs.obligations`, qui ne peut pas importer ce module ;
// leurs lecteurs les trouvent toujours ici.
export { montantDeclaration, preneursDeServices };
import { periodesUrssafEffectives, tvaDueDepuisDe } from './selecteurs';

/**
 * L'échéance d'une facture, pour le sujet « en retard » : une seule règle.
 *
 * Elle vient de la recette : elle est imprimée sur le document. Le secours ne
 * sert qu'à une facture qu'aucune migration n'aurait comblée — une facture
 * émise sans échéance serait réputée jamais échue, et les retards les plus
 * anciens seraient précisément ceux qu'on ne verrait pas.
 *
 * Venue de `selecteurs.ts` au lot 34-bis : ce module en est le seul lecteur,
 * et le paquet d'entrée, qui a franchi son plafond, n'en a pas l'usage.
 */
export function echeanceDesFactures(faits: Faits): (r: Recette) => DateISO | null {
  const formules = new Map(faits.clients.map((c) => [c.nom, c.delaiPaiement]));
  return (r) => (r.emiseLe === null
    ? null
    : r.echeanceLe ?? echeanceDe(r.emiseLe, formules.get(r.clientNom) ?? FORMULE_PAR_DEFAUT));
}

/**
 * Construit l'entrée de la requête « à traiter » depuis les faits.
 *
 * Le délai de paiement vient du client quand il est connu, sinon d'un défaut :
 * une facture sans délai renseigné ne doit pas être réputée jamais échue, sinon
 * les retards les plus anciens seraient précisément ceux qu'on ne verrait pas.
 *
 * Le défaut et le calcul d'échéance viennent de `calculs/facturier` : le suivi
 * des factures applique la MÊME règle, et deux lectures de l'exigibilité
 * finiraient par diverger d'un jour — celui qui décide d'une relance.
 */

export function entreeATraiter(
  faits: Faits,
  obligations: readonly Obligation[],
  maintenant: Date = new Date()
): EntreeATraiter {
  const echeance = echeanceDesFactures(faits);
  const tvaDue = tvaDueDepuisDe(faits);
  const aujourdhui = dateISOde(maintenant);
  return {
    aujourdhui,
    typeActivite: faits.entreprise.typeActivite,
    recettes: faits.recettes.map((r) => ({
      id: r.id,
      montant: r.montant,
      emiseLe: r.emiseLe,
      encaisseeLe: r.encaisseeLe,
      modeReglement: r.modeReglement,
      clientNom: r.clientNom,
      echeanceLe: echeance(r)
    })),
    echeancesSaisies: faits.echeances.length,
    periodesUrssaf: periodesUrssafEffectives(faits),
    debutActiviteLe: faits.entreprise.debutActivite,
    ...sujetsDesObligations(faits, obligations, aujourdhui),
    tvaDueDepuis: tvaDue,
    facturesSansTva: tvaDue === null ? 0 : facturesEmisesSansTva(faits, tvaDue),
    finsAnnoncees: finsAnnonceesDe(faits, aujourdhui)
  };
}

/**
 * Les fins de mission à préparer : la règle du préavis est celle de l'écran
 * (`finAnnoncee`), et une seule. Une reconduction tacite dite n'est pas une
 * fin — le contrat continue sans geste —, elle n'entre donc pas ici ; le
 * bandeau de l'onglet Missions, lui, la rappelle.
 */
function finsAnnonceesDe(faits: Faits, aujourdhui: DateISO): NonNullable<EntreeATraiter['finsAnnoncees']> {
  return faits.missions.flatMap((m) => {
    const f = finAnnoncee(m, aujourdhui);
    if (f === null || f.reconduitLe !== null) return [];
    return [{
      missionId: m.id,
      nom: m.description || m.clientNom || 'Mission sans description',
      echeance: f.echeance,
      jours: f.jours
    }];
  });
}

const enCours = (e: Etape | undefined): e is Etape =>
  e !== undefined && (e.etat === 'a_faire' || e.etat === 'en_retard');

/**
 * Ce que les obligations disent à la requête « à traiter » — la seule source
 * de ce qui est à déclarer, à payer ou à fournir.
 *
 *  · les périodes URSSAF à déclarer, réunies en un sujet sur le Pilote (qui
 *    en lit le nombre et la première limite) ;
 *  · les DES en retard, réunies : l'amende est par déclaration ;
 *  · toute autre obligation à traiter, un sujet chacune ;
 *  · les obligations à venir qui méritent d'être annoncées (une CFE sans
 *    avis saisi, en octobre) : de l'information, que le compteur ne compte pas.
 *
 * L'ensemble des trois premiers pèse au compteur exactement
 * `obligationsATraiter` — la même liste que le titre d'Obligations.
 */
function sujetsDesObligations(
  faits: Faits,
  obligations: readonly Obligation[],
  aujourdhui: DateISO
): Pick<EntreeATraiter, 'periodesADeclarer' | 'desEnRetard' | 'echeancesReglementaires'> {
  const periodicite = faits.entreprise.urssafPeriodicite;
  const periodes: PeriodeATraiter[] = [];
  const desEnRetard: { mois: Mois }[] = [];
  const autres: EntreeATraiter['echeancesReglementaires'][number][] = [];
  const aTraiter = new Set(obligationsATraiter(obligations, aujourdhui));

  for (const o of obligations) {
    if (aTraiter.has(o)) {
      if (o.dossier === 'urssaf' && enCours(o.declaration)) {
        const limite = dateDeLEtape(o.declaration);
        periodes.push({
          id: o.periode,
          libelle: periodeDuMois(moisDeLaPeriode(o.periode, periodicite)[0] as Mois, periodicite, aujourdhui).libelle,
          premierMois: moisDeLaPeriode(o.periode, periodicite)[0] as Mois,
          limite,
          encaisse: o.assiette ?? euros(0),
          montant: o.montant === null || o.montant.statut === 'refuse' ? null : o.montant.valeur,
          enRetard: o.declaration.etat === 'en_retard'
        });
        continue;
      }
      if (o.dossier === 'des' && o.declaration?.etat === 'en_retard') {
        desEnRetard.push({ mois: o.periode as Mois });
        continue;
      }
      autres.push(sujetDeLObligation(o, aujourdhui));
      continue;
    }
    // À venir : annoncée seulement dans son préavis, et seulement si rien
    // n'est saisi (la règle de `preavisJours`).
    const principale = etapePrincipale(o);
    if (o.preavisJours !== undefined && principale.etat === 'a_venir' && principale.limite.statut !== 'refuse'
        && principale.limite.valeur <= decaler(aujourdhui, o.preavisJours)) {
      autres.push({ ...sujetDeLObligation(o, aujourdhui), gravite: 'information' });
    }
  }
  return {
    periodesADeclarer: periodes.sort((a, b) => a.id.localeCompare(b.id)),
    desEnRetard: desEnRetard.sort((a, b) => a.mois.localeCompare(b.mois)),
    echeancesReglementaires: autres
  };
}

/** Le geste qu'une obligation attend, selon l'étape en cours. */
function actionDe(o: Obligation): string {
  if (o.id === 'facturation-electronique-reception') return 'Renseigner ma plateforme';
  if (o.dossier === 'piece') return 'Renouveler';
  if (enCours(o.declaration)) return o.dossier === 'des' ? 'Déposer' : 'Déclarer';
  // Une CFE sans avis saisi se règle en saisissant l'échéance : c'est elle
  // qui fait entrer la dette dans les provisions.
  if (estPrevue(o) && o.dossier === 'cfe') return 'Saisir l’échéance';
  return 'Payer';
}

/** Une obligation en sujet générique — ses textes viennent d'elle, pas d'ici. */
function sujetDeLObligation(o: Obligation, aujourdhui: DateISO): EntreeATraiter['echeancesReglementaires'][number] {
  const etape = [o.declaration, o.paiement, o.formalite].find(enCours) ?? etapePrincipale(o);
  const gravite: Gravite = etape.etat === 'en_retard' ? 'retard' : 'a_faire';
  const date = etape.limite.statut === 'refuse' ? null : etape.limite.valeur;
  return {
    id: o.id,
    intitule: o.libelle,
    date,
    gravite,
    ecran: 'obligations',
    action: actionDe(o),
    // Le jour qui manque se dit : « indique ton nom », « fin mai ».
    contexte: etape.limite.statut === 'refuse' ? `${etape.limite.motif} ${o.detail}`.trim() : o.detail,
    sansSuivi: etape.etat === 'a_faire' && date !== null && date < aujourdhui
  };
}

/**
 * Les factures émises depuis le mois où la TVA est due, sans TVA, à un client
 * établi en France — et non annulées.
 *
 * Elles sont réputées TTC : la TVA est à reverser sur ce qui a été encaissé.
 * Un client hors de France n'en fait pas partie (autoliquidation ou
 * exonération), ni une facture déjà annulée par un avoir — c'est précisément
 * ainsi qu'on régularise, et le compteur doit alors retomber.
 */
function facturesEmisesSansTva(faits: Faits, depuis: Mois): number {
  const pays = new Map(faits.clients.map((c) => [c.nom, c.pays.trim().toLowerCase()]));
  const annulees = new Set(faits.recettes.flatMap((r) =>
    (typeof r.annuleEcriture === 'string' ? [r.annuleEcriture] : [])));
  return faits.recettes.filter((r) =>
    r.emiseLe !== null && r.emiseLe.slice(0, 7) >= depuis
    && typeof r.annuleEcriture !== 'string' && !annulees.has(r.id)
    && !((r.tvaCollectee ?? 0) > 0)
    && ['', 'france', 'fr'].includes(pays.get(r.clientNom) ?? '')).length;
}

/** Date du jour au format ISO, dérivée de l'horloge locale. */
function dateISOde(d: Date): DateISO {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const jj = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${jj}` as DateISO;
}

/**
 * Jusqu'où regarder devant : une année. Une CA12 se déclare dès janvier pour
 * une limite en mai, et une CFE s'annonce soixante-quinze jours avant.
 */
const HORIZON_JOURS = 366;

/** Les sujets à traiter, calculés depuis les faits. Jamais stockés. */
export function aTraiter(
  faits: Faits,
  maintenant: Date = new Date()
): readonly SujetATraiter[] {
  const aujourdhui = dateISOde(maintenant);
  const obligations = obligationsEntre(
    faits, '1970-01-01' as DateISO, decaler(aujourdhui, HORIZON_JOURS), aujourdhui
  );
  return sujetsATraiter(entreeATraiter(faits, obligations, maintenant));
}

/**
 * Le nombre de choses à faire sous Obligations : ce que dit la pastille du
 * rail, et ce que dira le titre de l'écran. La même fonction pour les deux.
 */
export function nombreAFaire(faits: Faits, ecran: EcranCible = 'obligations', maintenant: Date = new Date()): number {
  return compteursParEcran(aTraiter(faits, maintenant))[ecran] ?? 0;
}
