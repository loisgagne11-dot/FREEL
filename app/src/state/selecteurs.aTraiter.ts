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

import type { DateISO, Euros, Mois, Resolution } from '../domain/types';
import { euros, moisDe } from '../domain/types';
import { voletAProvisionner } from '../domain/calculs/provisions';
import {
  type EcranCible, type EntreeATraiter, type SujetATraiter, compteursParEcran, sujetsATraiter
} from '../domain/calculs/aTraiter';
import {
  acompteCfe, cfeDue, declaration1447C, paiementCfe, regimeCfe
} from '../domain/bareme/cfe';
import { moisDeLaPeriode } from '../domain/calculs/declarations';
import { moisDeclares } from '../domain/calculs/declarations.declarees';
import { type PreneurService, declarationsEnRetard } from '../domain/calculs/des';
import { tauxImpotEtContributions } from '../domain/bareme';
import type { Faits } from './schema';

// Servi ici pour que le rail le calcule avec les sujets, dans le même paquet différé.
export { compteursParEcran };
import {
  caEncaisseAnnee, echeanceDesFactures, periodesUrssafEffectives, recettesEncaissees, regimeDe,
  sousAcreLe, tvaDueDepuisDe
} from './selecteurs';

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
  echeancesReglementaires: EntreeATraiter['echeancesReglementaires'] = [],
  maintenant: Date = new Date()
): EntreeATraiter {
  const echeance = echeanceDesFactures(faits);
  const tvaDue = tvaDueDepuisDe(faits);
  return {
    aujourdhui: dateISOde(maintenant),
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
    periodesDeclarees: moisDeclares(faits.periodesDeclarees),
    echeancesSaisies: faits.echeances.length,
    periodicite: faits.entreprise.urssafPeriodicite,
    periodesUrssaf: periodesUrssafEffectives(faits),
    desEnRetard: declarationsEnRetard(
      faits.recettes, preneursDeServices(faits), dateISOde(maintenant)
    ),
    debutActiviteLe: faits.entreprise.debutActivite,
    debutActivite: faits.entreprise.debutActivite === null
      ? null
      : moisDe(faits.entreprise.debutActivite),
    echeancesReglementaires,
    tvaDueDepuis: tvaDue,
    facturesSansTva: tvaDue === null ? 0 : facturesEmisesSansTva(faits, tvaDue)
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
 * Échéances réglementaires à date fixe, filtrées sur leur préavis.
 *
 * Ces obligations ne dépendent d'aucun calcul : elles tombent à une date, que
 * l'utilisateur soit prêt ou non.
 */
export const ECHEANCES_REGLEMENTAIRES: readonly {
  readonly id: string;
  readonly intitule: string;
  readonly date: DateISO;
  readonly preavisJours: number;
  /**
   * Combien de jours le rappel survit à sa date.
   *
   * Aucun fait ne dit qu'une de ces obligations est remplie : rien ne
   * l'efface. La date passée, le rappel devenait « en retard » pour toujours —
   * en rouge sur le Pilote de tout le monde depuis le 1er septembre 2026, prêt
   * ou pas. Un rappel qu'on ne peut pas traiter apprend à ignorer les
   * rappels : celui-ci dit « en vigueur » pendant un mois, puis se tait.
   */
  readonly rappelApresJours: number;
}[] = [
  {
    id: 'facturation-electronique-reception',
    intitule: 'Facturation électronique : réception obligatoire',
    date: '2026-09-01' as DateISO,
    preavisJours: 120,
    rappelApresJours: 30
  }
];

export function echeancesReglementairesActives(
  faits: Faits,
  maintenant: Date = new Date()
): EntreeATraiter['echeancesReglementaires'] {
  const aujourdhui = dateISOde(maintenant);
  const dansLePreavis = (date: DateISO, preavisJours: number): boolean => {
    const jours = Math.round(
      (new Date(date).getTime() - new Date(aujourdhui).getTime()) / 86400000
    );
    return jours <= preavisJours;
  };

  const joursAvant = (date: DateISO): number => Math.round(
    (new Date(date).getTime() - new Date(aujourdhui).getTime()) / 86400000
  );
  const fixes = ECHEANCES_REGLEMENTAIRES
    .filter((e) => dansLePreavis(e.date, e.preavisJours) && joursAvant(e.date) >= -e.rappelApresJours)
    .map((e) => ({ id: e.id, intitule: e.intitule, date: e.date, sansSuivi: true }));

  const cfe = echeancesCfe(faits, maintenant)
    .filter((e) => dansLePreavis(e.date, e.preavisJours))
    // `preavisJours` a servi au filtrage : il n'a plus rien à dire au sujet.
    .map(({ preavisJours: _, ...reste }) => reste);

  return [...fixes, ...cfe];
}

/**
 * Les obligations de CFE, déduites de la situation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA CHARGE QUE L'APPLICATION IGNORAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La CFE est annuelle, payable au 15 décembre, et n'apparaît nulle part avant
 * la parution de l'avis en novembre. Rien ne la signalait : quelqu'un qui se
 * verse tout son disponible en octobre se verse la CFE de décembre. C'est
 * l'erreur qui va dans le sens dangereux — celle qui invite à se verser de
 * l'argent déjà dû.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE SUJET DISPARAÎT QUAND IL EST RÉGLÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le rappel de paiement n'apparaît que si AUCUNE échéance de nature `cfe` n'est
 * enregistrée pour l'année. Dès qu'elle l'est, la dette entre dans les
 * provisions par le chemin normal et le sujet s'efface. Un rappel qui reste
 * affiché après avoir été traité apprend à ignorer les rappels.
 *
 * Aucun MONTANT n'est avancé ici : la base minimum est fixée par la commune, le
 * taux voté par elle, et seul l'avis les porte. Voir `bareme/cfe.ts`.
 */
interface EcheanceCfeDatee {
  readonly id: string;
  readonly intitule: string;
  readonly date: DateISO;
  readonly preavisJours: number;
  readonly ecran?: EcranCible;
  readonly action?: string;
  readonly contexte?: string;
}

function echeancesCfe(faits: Faits, maintenant: Date): readonly EcheanceCfeDatee[] {
  const annee = maintenant.getFullYear();
  const debut = faits.entreprise.debutActivite;

  const sujets: EcheanceCfeDatee[] = [];

  // La déclaration initiale, l'année de la création. Ne pas la déposer ne
  // supprime pas la CFE : cela fait perdre l'exonération de première année.
  const declaration = declaration1447C(debut, annee);
  if (declaration !== null) {
    sujets.push({
      ...declaration,
      ecran: 'config',
      action: 'Se préparer',
      contexte: 'C’est elle qui établit ta base d’imposition ; l’omettre fait perdre '
        + 'l’exonération de première année.'
    });
  }

  const regime = regimeCfe(debut, annee, caDeReferenceCfe(faits, annee));
  if (!cfeDue(regime)) return sujets;

  // « Provisionnée » veut dire : une échéance de nature `cfe` existe pour cette
  // année. Son montant, lui, vient de l'avis — jamais d'un calcul d'ici.
  const provisionnee = faits.echeances.some(
    (e) => e.nature === 'cfe' && e.echeanceLe.startsWith(String(annee))
  );
  if (!provisionnee) {
    const paiement = paiementCfe(annee);
    sujets.push({
      ...paiement,
      ecran: 'argent',
      action: 'Saisir l’échéance',
      contexte: regime.type === 'base-reduite-moitie'
        ? 'Première année d’imposition : la base est réduite de moitié, mais la CFE est '
          + 'due. Sans montant saisi, ton disponible est surestimé.'
        : 'L’avis paraît en novembre sur ton espace professionnel. Sans montant saisi, '
          + 'ton disponible est surestimé.'
    });
  }

  // L'acompte de juin découle de la CFE de l'an passé, telle qu'elle a été
  // saisie — pas d'une estimation.
  const cfePrecedente = euros(faits.echeances
    .filter((e) => e.nature === 'cfe' && e.echeanceLe.startsWith(String(annee - 1)))
    .reduce((t, e) => t + e.montant, 0));
  const acompte = acompteCfe(annee, cfePrecedente);
  if (acompte !== null) {
    sujets.push({ ...acompte, ecran: 'argent', action: 'Voir les échéances' });
  }

  return sujets;
}

/**
 * Le chiffre d'affaires de référence pour situer la base minimum : celui de
 * l'année N−2.
 *
 * Rend `null` quand l'entreprise est trop jeune pour en avoir un : une
 * entreprise sans N−2 n'a pas « 0 € de recettes en N−2 », elle n'a pas de N−2.
 * La traiter comme un zéro la dispenserait à tort de cotisation minimum, en
 * surestimant son disponible.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE GARDE-FOU EST AUJOURD'HUI INATTEIGNABLE, ET C'EST ASSUMÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Vérifié par mutation : le supprimer ne casse aucun test, et ce n'est pas une
 * lacune des tests. Quand le N−2 manque, l'entreprise a été créée l'année
 * courante ou la précédente — donc `regimeCfe` a déjà conclu à l'exonération de
 * création ou à la base réduite de moitié, sans jamais regarder le chiffre de
 * référence. Les deux conditions ne peuvent pas être vraies en même temps.
 *
 * Il est gardé quand même : il rend cette fonction juste PRISE SEULE, sans
 * rien supposer des branches de `regimeCfe`. Le jour où l'une d'elles change,
 * un zéro passerait ici pour une absence — et la dispense de cotisation
 * minimum s'appliquerait à tort, dans le sens dangereux. La règle elle-même est
 * couverte, côté domaine, par `regimeCfe(…, null)`.
 */
function caDeReferenceCfe(faits: Faits, annee: number): Euros | null {
  const debut = faits.entreprise.debutActivite;
  if (debut === null) return null;
  const reference = annee - 2;
  if (Number(debut.slice(0, 4)) > reference) return null;
  return caEncaisseAnnee(faits, reference);
}

/** Les sujets à traiter, calculés depuis les faits. Jamais stockés. */
export function aTraiter(
  faits: Faits,
  maintenant: Date = new Date()
): readonly SujetATraiter[] {
  return sujetsATraiter(
    entreeATraiter(faits, echeancesReglementairesActives(faits, maintenant), maintenant)
  ).map((s) => {
    // La déclaration arrive avec ce qu'il faut payer : c'est la question qu'on
    // se pose en ouvrant le site de l'URSSAF. Calculé ici et non dans le
    // domaine des sujets, qui ne connaît pas les barèmes.
    if (s.id !== 'periodes-a-declarer' || typeof s.donnees['periode'] !== 'string') return s;
    const m = montantDeclaration(
      faits, moisDeLaPeriode(s.donnees['periode'], faits.entreprise.urssafPeriodicite)
    );
    return { ...s, donnees: { ...s.donnees, montant: m.statut === 'refuse' ? null : m.valeur } };
  });
}

/**
 * Ce que coûte la déclaration d'une période : cotisations, plus le versement
 * libératoire s'il y a lieu, plus la CFP, sur les encaissements de la période
 * — la même règle que le volet « à provisionner », taux au mois de chaque
 * encaissement.
 *
 * Refusé si un taux manque : un montant calculé avec un taux à zéro se lirait
 * comme un fait, et se recopierait sur le formulaire. Une période sans
 * encaissement, elle, coûte un vrai zéro — elle se déclare quand même.
 */
export function montantDeclaration(faits: Faits, mois: readonly Mois[]): Resolution<Euros> {
  const dans = new Set<string>(mois);
  const dernier = mois[mois.length - 1];
  if (dernier === undefined) return { statut: 'refuse', motif: 'Période vide.' };
  const taux = tauxImpotEtContributions(regimeDe(faits), dernier, faits.entreprise.typeActivite);
  if (taux.statut === 'refuse') return taux;
  const calcul = voletAProvisionner(
    recettesEncaissees(faits).filter((r) => dans.has(r.encaisseeLe.slice(0, 7))),
    { mois: [] },
    {
      typeActivite: faits.entreprise.typeActivite,
      sousAcreLe: sousAcreLe(faits),
      debutActivite: faits.entreprise.debutActivite,
      periodesUrssaf: periodesUrssafEffectives(faits),
      tauxImpotEtContributions: taux.valeur
    }
  );
  const refus = calcul.nonCalculables[0];
  if (refus !== undefined) return { statut: 'refuse', motif: refus.motif };
  return { statut: 'publie', valeur: calcul.montant, source: taux.source, verifieLe: taux.verifieLe };
}

/** Les clients, indexés par nom, au format attendu par le calcul de DES. */
export function preneursDeServices(faits: Faits): ReadonlyMap<string, PreneurService> {
  return new Map(faits.clients.map((c) => [
    c.nom,
    { nom: c.nom, pays: c.pays, tvaIntracom: c.tvaIntracom }
  ]));
}
