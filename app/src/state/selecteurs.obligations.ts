/**
 * `obligationsEntre` : toutes les obligations d'une plage de dates, prévues et
 * saisies, fusionnées, chacune avec ses étapes. Chargé à la demande : la
 * requête « à traiter », l'écran Obligations et le calendrier `.ics` le lisent
 * — et plus tard le solde prévu (lot 49) et les prochaines échéances
 * (lot 52). Rien de ceci n'a sa place au premier rendu.
 *
 * Les règles sont au domaine (`calculs/obligations`, `obligations.tva`,
 * `bareme/revenus`, `bareme/cfe`, `calculs/declarations`, `calculs/des`) ; ce
 * module ne fait que les appliquer aux faits.
 */

import { type DateISO, type Euros, type Mois, type Resolution, dateISO, euros, moisDe } from '../domain/types';
import { type Echeance, exerciceDe } from '../domain/calculs/provisions';
import { voletAProvisionner } from '../domain/calculs/provisions';
import {
  type Periodicite, type PeriodeUrssaf, dateDeDeclaration, limiteOfficielleToleree,
  moisDeLaPeriode, periodeDuMois, periodesADeclarer
} from '../domain/calculs/declarations';
import { moisDeclares } from '../domain/calculs/declarations.declarees';
import { type PreneurService, declarationDuMois } from '../domain/calculs/des';
import {
  type Etape, type Obligation, etape, finDuMois, fusionner, montantDesSaisies,
  ouvertureParPreavis, paiementDesSaisies
} from '../domain/calculs/obligations';
import {
  FIN_REGIME_SIMPLIFIE, SEUIL_ACOMPTES_SIMPLIFIE, declarationTvaDe, jourCa3, limiteAcompteSimplifie,
  limiteCa12
} from '../domain/calculs/obligations.tva';
import { casesDeclarationRevenus, limiteDeclarationRevenus } from '../domain/bareme/revenus';
import {
  type DateCfe, acompteCfe, cfeDue, declaration1447C, paiementCfe, regimeCfe
} from '../domain/bareme/cfe';
import { type PieceAFournir, etatDePiece } from '../domain/calculs/pieces';
import { tauxImpotEtContributions } from '../domain/bareme';
import type { Faits } from './schema';
import {
  caEncaisseAnnee, periodesUrssafEffectives, recettesEncaissees, regimeDe, regimeTvaAu, sousAcreLe
} from './selecteurs';
import { dossierTvaDuTrimestre } from './selecteurs.dossierTva';
import { soldeImpotPrevuDe } from './selecteurs.impotCalendrier';

/**
 * Le jour où l'application a su noter ces déclarations : le schéma 25, livré
 * le 17/11/2026. Une CA3, une CA12, une déclaration de revenus, une 1447-C ou
 * une CFE dont la limite précède ce jour n'a jamais pu être dite faite —
 * l'afficher « en retard » ferait rougir le Pilote de tout compte qui a de
 * l'histoire, pour des déclarations faites depuis longtemps. Elles sont
 * `non_suivi` : on ne sait pas.
 *
 * L'URSSAF et la DES ne passent pas par là : elles se notaient déjà.
 */
export const SUIVI_DEPUIS = dateISO('2026-11-17');

const VERIFIE_LE = dateISO('2026-11-17');

/* ─────────────────────────────────────────────────────────────────────────
   Ce que coûte une déclaration URSSAF — déplacé ici de `selecteurs.aTraiter`,
   qui lit désormais ce module : les deux se seraient importés l'un l'autre.
   ───────────────────────────────────────────────────────────────────────── */

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

/**
 * Échéances réglementaires à date fixe : elles tombent à une date, que
 * l'utilisateur soit prêt ou non.
 *
 * `remplie` est le fait qui dit l'obligation remplie (lot 46) : le rappel
 * n'est pas un compte à rebours mais un ÉTAT, qui reste tant que le fait
 * manque — date passée comprise — et s'éteint dès qu'il est saisi.
 */
export const ECHEANCES_REGLEMENTAIRES: readonly {
  readonly id: string;
  readonly intitule: string;
  readonly detail: string;
  readonly date: DateISO;
  readonly preavisJours: number;
  readonly remplie: (faits: Faits) => DateISO | null | false;
}[] = [
  {
    id: 'facturation-electronique-reception',
    intitule: 'Facturation électronique : réception obligatoire',
    detail: 'Choisir une plateforme agréée et l’inscrire dans Réglages › Facturation.',
    date: dateISO('2026-09-01'),
    preavisJours: 120,
    remplie: (faits) => (faits.entreprise.plateformeAgreee === null
      ? false
      : faits.entreprise.plateformeAgreee.depuis)
  }
];

/* ─────────────────────────────────────────────────────────────────────────
   Outils
   ───────────────────────────────────────────────────────────────────────── */

const ajouterMois = (m: string, n: number): Mois => {
  const total = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}` as Mois;
};
const premierJour = (m: string): DateISO => `${m.slice(0, 7)}-01` as DateISO;
const declaree = (faits: Faits, nature: string, periode: string) =>
  faits.periodesDeclarees.find((p) => p.nature === nature && p.periode === periode);
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];
const nomDuMois = (m: string): string => MOIS_LONGS[Number(m.slice(5, 7)) - 1] ?? m;
/** « de juin », « d’octobre » : l'élision devant avril, août, octobre. */
const deMois = (m: string): string => (/^[aeiou]/u.test(nomDuMois(m)) ? `d’${nomDuMois(m)}` : `de ${nomDuMois(m)}`);

const publie = (valeur: DateISO, source: string): Resolution<DateISO> =>
  ({ statut: 'publie', valeur, source, verifieLe: VERIFIE_LE });

/** Un montant estimé : « ≈ », jamais un fait. */
function estime(r: Resolution<Euros>, source: string, depuis: Mois): Resolution<Euros> {
  if (r.statut === 'refuse') return r;
  return { statut: 'hypothese', valeur: r.valeur, source, verifieLe: r.verifieLe, depuis };
}

/** Une étape sans période à clore : ouverte `PREAVIS_A_FAIRE` jours avant sa limite. */
function etapeDatee(
  limite: Resolution<DateISO>, mois: Mois, aujourdhui: DateISO,
  options: { faiteLe?: DateISO | null; faite?: boolean; suivi?: boolean; ouverture?: DateISO; retardPossible?: boolean } = {}
): Etape {
  const repere = limite.statut === 'refuse' ? finDuMois(mois) : limite.valeur;
  return etape({
    limite, mois, aujourdhui,
    ouverture: options.ouverture ?? ouvertureParPreavis(repere),
    faite: options.faite ?? false,
    faiteLe: options.faiteLe ?? null,
    ...(options.suivi === false ? {} : { suiviDepuis: SUIVI_DEPUIS }),
    ...(options.retardPossible === false ? { retardPossible: false } : {})
  });
}

type Prevue = { readonly cle: string; readonly obligation: Obligation };

/* ─────────────────────────────────────────────────────────────────────────
   URSSAF — une obligation par période, déclaration puis paiement
   ───────────────────────────────────────────────────────────────────────── */

const SOURCE_URSSAF = 'Urssaf — dernier jour du mois qui suit la période, reporté au jour ouvré';

function urssaf(faits: Faits, jusquA: Mois, aujourdhui: DateISO): readonly Prevue[] {
  const periodicite: Periodicite = faits.entreprise.urssafPeriodicite;
  const debut = faits.entreprise.debutActivite;
  const declares = periodesADeclarer(
    recettesEncaissees(faits), periodicite, moisDeclares(faits.periodesDeclarees), aujourdhui,
    debut === null ? null : moisDe(debut)
  );
  const parId = new Map<string, PeriodeUrssaf & { encaisse?: Euros; declaree?: boolean }>(
    declares.map((p) => [p.id, p])
  );
  // Les périodes à venir : celles que la frise de l'année montre « à venir »,
  // et que `periodesADeclarer` — qui ne rend que ce qui a commencé — ignore.
  const depuis = debut !== null ? moisDe(debut) : aujourdhui.slice(0, 7);
  for (let m = depuis as string; m <= jusquA; m = ajouterMois(m, 1)) {
    const p = periodeDuMois(m as Mois, periodicite, aujourdhui);
    if (!parId.has(p.id)) parId.set(p.id, p);
  }

  return [...parId.values()].map((p) => {
    const dernier = p.mois[p.mois.length - 1] as Mois;
    const estDeclaree = p.declaree ?? p.mois.every((m) => declaree(faits, 'urssaf', m) !== undefined);
    const encaisse = p.encaisse ?? euros(0);
    const limite = publie(p.limite, SOURCE_URSSAF);
    const commun = {
      limite, mois: p.limite.slice(0, 7) as Mois, aujourdhui, ouverture: premierJour(ajouterMois(dernier, 1))
    };
    const declaration = etape({
      ...commun, faite: estDeclaree, faiteLe: dateDeDeclaration(p.mois, faits.periodesDeclarees)
    });
    // Déclarée sans appel — à zéro, ou reprise d'avant le geste unique —,
    // rien ne dit un paiement : on ne l'invente pas, dans un sens ni l'autre.
    const paiement = estDeclaree ? undefined : etape({ ...commun, faite: false, faiteLe: null });
    const calcul = estDeclaree || (!p.close && encaisse === 0) ? null : montantDeclaration(faits, p.mois);
    const officielle = limiteOfficielleToleree(dernier);
    const obligation: Obligation = {
      id: `urssaf-${p.id}`,
      nature: 'urssaf',
      dossier: 'urssaf',
      libelle: `URSSAF, ${p.libelle}`,
      detail: [
        periodicite === 'trimestriel'
          ? `${nomDuMois(p.mois[0] as string)} à ${nomDuMois(dernier)}`.replace(/^./u, (c) => c.toUpperCase())
          : '',
        officielle === null ? '' : `Limite officielle le ${Number(officielle.slice(8, 10))} ${nomDuMois(officielle)}, `
          + `tolérée jusqu’au ${Number(p.limite.slice(8, 10))} ${nomDuMois(p.limite)} après la panne de l’Urssaf`
      ].filter((t) => t !== '').join(' · '),
      periode: p.id,
      declaration,
      ...(paiement === undefined ? {} : { paiement }),
      // Close, c'est le montant à recopier ; en cours, une estimation sur ce
      // qui est encaissé à ce jour.
      montant: calcul === null ? null
        : p.close ? calcul : estime(calcul, 'estimé sur les encaissements à ce jour', dernier),
      assiette: encaisse,
      saisies: []
    };
    return { cle: `urssaf:${p.id}`, obligation };
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   DES — une déclaration par mois de prestation à l'Union
   ───────────────────────────────────────────────────────────────────────── */

function des(faits: Faits, jusquA: Mois, aujourdhui: DateISO): readonly Prevue[] {
  const emissions = faits.recettes.flatMap((r) => (r.emiseLe === null ? [] : [r.emiseLe.slice(0, 7)])).sort();
  const premier = emissions[0];
  if (premier === undefined) return [];
  const preneurs = preneursDeServices(faits);
  const prevues: Prevue[] = [];
  for (let m = premier; m < jusquA; m = ajouterMois(m, 1)) {
    const d = declarationDuMois(faits.recettes, preneurs, m as Mois);
    if (d.sansObjet) continue;
    const depot = declaree(faits, 'des', m);
    prevues.push({
      cle: `des:${m}`,
      obligation: {
        id: `des-${m}`,
        nature: 'des',
        dossier: 'des',
        libelle: `Déclaration européenne de services, ${nomDuMois(m)} ${m.slice(0, 4)}`,
        detail: d.anomalies.length > 0
          ? 'Un numéro de TVA de client manque : sans lui, la déclaration serait inexacte.'
          : 'Amende de 750 € par déclaration manquante — la franchise en base n’en dispense pas.',
        periode: m,
        declaration: etape({
          limite: publie(d.limiteLe, 'CGI ann. III art. 96 N — dixième jour ouvrable du mois suivant'),
          mois: d.limiteLe.slice(0, 7) as Mois,
          ouverture: premierJour(ajouterMois(m, 1)),
          faite: depot !== undefined,
          faiteLe: depot?.declareeLe ?? null,
          aujourdhui
        }),
        montant: null,
        assiette: d.total,
        saisies: []
      }
    });
  }
  return prevues;
}

/* ─────────────────────────────────────────────────────────────────────────
   TVA — CA12 et acomptes, CA3, TVA autoliquidée d'un franchisé
   ───────────────────────────────────────────────────────────────────────── */

function tva(faits: Faits, depuis: Mois, jusquA: Mois, aujourdhui: DateISO): readonly Prevue[] {
  const e = faits.entreprise;
  const maintenant = new Date(`${aujourdhui}T12:00:00`);
  const dossier = (du: string, au: string) => dossierTvaDuTrimestre(faits, du as DateISO, au as DateISO, maintenant);
  const prevues: Prevue[] = [];
  const ca3 = (periode: string, mois: readonly Mois[], libelle: string, detail: string, montant: Resolution<Euros> | null) => {
    const dernier = mois[mois.length - 1] as Mois;
    const depot = ajouterMois(dernier, 1);
    const limite = jourCa3(depot, e.nomExploitant, e.codePostal);
    const fait = declaree(faits, 'ca3', periode);
    const commun = { mois: depot, aujourdhui, ouverture: premierJour(depot) };
    const declaration = etapeDatee(limite, depot, aujourdhui, {
      ...commun, faite: fait !== undefined, faiteLe: fait?.declareeLe ?? null
    });
    const aPayer = montant !== null && montant.statut !== 'refuse' && montant.valeur > 0;
    prevues.push({
      cle: `tva:${depot}`,
      obligation: {
        id: `ca3-${periode}`, nature: 'tva', dossier: 'tva', libelle, detail, periode,
        declaration,
        // Un crédit ou une déclaration néant ne se paie pas.
        ...(aPayer ? { paiement: etapeDatee(limite, depot, aujourdhui, { ...commun }) } : {}),
        montant, saisies: []
      }
    });
  };

  const annees = new Set<number>();
  for (let m = depuis as string; m <= jusquA; m = ajouterMois(m, 1)) annees.add(Number(m.slice(0, 4)));

  for (const annee of annees) {
    const moisDeLAnnee = Array.from({ length: 12 }, (_, i) => `${annee}-${String(i + 1).padStart(2, '0')}` as Mois)
      .filter((m) => m >= depuis && m <= jusquA);
    const assujettis = moisDeLAnnee.filter((m) => regimeTvaAu(faits, m) === 'assujetti');
    const sorte = declarationTvaDe(annee, e.regimeTva, e.ca3Mensuelle);

    if (assujettis.length > 0 && sorte === 'ca12') {
      const d = dossier(`${annee}-01-01`, `${annee}-12-31`);
      const limite = limiteCa12(annee);
      const fait = declaree(faits, 'ca12', String(annee));
      const montant: Resolution<Euros> = {
        statut: 'hypothese', valeur: d.aPayer, verifieLe: VERIFIE_LE, depuis: `${annee}-12` as Mois,
        source: 'estimé sur tes encaissements et tes achats de l’année, avant déduction des acomptes versés'
      };
      const mois = `${annee + 1}-05` as Mois;
      prevues.push({
        cle: `tva:${limite.statut === 'refuse' ? mois : limite.valeur.slice(0, 7)}`,
        obligation: {
          id: `ca12-${annee}`, nature: 'tva', dossier: 'tva',
          libelle: `TVA, déclaration annuelle ${annee} (CA12)`,
          detail: annee + 1 === FIN_REGIME_SIMPLIFIE
            ? 'La dernière : le régime simplifié est supprimé au 1ᵉʳ janvier 2027.'
            : 'Régime simplifié : une déclaration pour l’année, les acomptes versés s’en déduisent.',
          periode: String(annee),
          declaration: etapeDatee(limite, mois, aujourdhui, {
            ouverture: `${annee + 1}-01-01` as DateISO, faite: fait !== undefined, faiteLe: fait?.declareeLe ?? null
          }),
          ...(d.aPayer > 0 ? { paiement: etapeDatee(limite, mois, aujourdhui, { ouverture: `${annee + 1}-01-01` as DateISO }) } : {}),
          montant, saisies: []
        }
      });
      // Les acomptes de juillet et de décembre, quand la TVA de l'année
      // précédente dépassait le seuil. Aucun en 2027 : le régime n'existe plus.
      const precedente = dossier(`${annee - 1}-01-01`, `${annee - 1}-12-31`).aPayer;
      if (precedente > SEUIL_ACOMPTES_SIMPLIFIE) {
        for (const m of [7, 12] as const) {
          const moisAcompte = `${annee}-${String(m).padStart(2, '0')}` as Mois;
          prevues.push({
            cle: `tva:${moisAcompte}`,
            obligation: {
              id: `tva-acompte-${moisAcompte}`, nature: 'tva', dossier: 'tva',
              libelle: `TVA, acompte ${deMois(moisAcompte)} ${annee}`,
              detail: 'Régime simplifié : le montant est sur ton espace professionnel.',
              periode: moisAcompte,
              paiement: etapeDatee(limiteAcompteSimplifie(annee, m), moisAcompte, aujourdhui, {
                ouverture: premierJour(moisAcompte)
              }),
              montant: null, saisies: []
            }
          });
        }
      }
    }

    if (sorte !== 'ca12') {
      const trimestriel = sorte === 'ca3_trimestrielle';
      const groupes = new Map<string, Mois[]>();
      for (const m of assujettis) {
        const cle = trimestriel ? `${annee}-T${Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1}` : m;
        groupes.set(cle, [...(groupes.get(cle) ?? []), m]);
      }
      for (const [periode, mois] of groupes) {
        const tous = trimestriel ? moisDeLaPeriode(periode, 'trimestriel') : mois;
        const d = dossier(`${tous[0]}-01`, finDuMois(tous[tous.length - 1] as Mois));
        // Une période à venir sans rien d'encaissé n'a pas de montant à dire :
        // « ≈ 0 € » se lirait comme une déclaration néant annoncée.
        const aVenir = (tous[tous.length - 1] as string) >= aujourdhui.slice(0, 7);
        ca3(
          periode, tous,
          trimestriel ? `TVA, ${periode.slice(5)} ${annee} (CA3)` : `TVA, ${nomDuMois(periode)} ${annee} (CA3)`,
          trimestriel ? 'Réel normal trimestriel.' : 'Réel normal mensuel.',
          aVenir && d.aPayer === 0 ? null : {
            statut: 'hypothese', valeur: d.aPayer, verifieLe: VERIFIE_LE, depuis: tous[tous.length - 1] as Mois,
            source: 'estimé sur tes encaissements et tes achats de la période'
          }
        );
      }
    }

    // Franchisé qui achète un service hors de France : la TVA est due par
    // lui (autoliquidation), sur la CA3 du mois où elle devient exigible —
    // à la réalisation de la prestation. L'application ne connaît que le
    // jour du paiement : elle le retient pour le mois de la prestation, et le
    // dit. Une CA3 pour ce seul mois ; aucune les autres mois.
    //
    // Les deux maquettes la dataient du 31 juillet : c'était la fin du mois
    // suivant, une date qu'aucun texte ne donne. Le micro-entrepreneur doit
    // « auto-liquider, déclarer et verser en France la TVA relative à ses
    // achats de [...] prestations de services intracommunautaires » —
    // impots.gouv.fr, page micro-entrepreneur et TVA, modifiée le 14/10/2026,
    // relue le 17/11/2026 :
    // https://www.impots.gouv.fr/professionnel/questions/je-suis-micro-entrepreneur-ou-la-tete-dune-micro-entreprise-ai-je-des
    // L'exigibilité à la réalisation tient à la directive 2006/112, art. 66
    // et 196, et au CGI art. 269 : cités d'après l'avis du 17/11, NON relus —
    // Légifrance et EUR-Lex refusent la lecture automatisée. Le calcul reste
    // donc une hypothèse, et le dit.
    for (const m of moisDeLAnnee) {
      if (regimeTvaAu(faits, m) !== 'franchise') continue;
      const d = dossier(`${m}-01`, finDuMois(m));
      if (d.autoliquideeDue <= 0) continue;
      ca3(
        m, [m],
        'TVA sur un achat hors de France',
        `CA3 ${deMois(m)} ${m.slice(0, 4)}, au titre de ce seul mois · mois du paiement retenu pour celui `
          + 'de la prestation · date calculée',
        {
          statut: 'hypothese', valeur: d.autoliquideeDue, verifieLe: VERIFIE_LE, depuis: m,
          source: 'TVA due par l’acheteur d’un service venu d’un autre État (autoliquidation)'
        }
      );
    }
  }
  return prevues;
}

/* ─────────────────────────────────────────────────────────────────────────
   Impôt — déclaration de revenus ; solde prévu tant que l'avis manque
   ───────────────────────────────────────────────────────────────────────── */

function revenus(faits: Faits, depuis: Mois, jusquA: Mois, aujourdhui: DateISO): readonly Prevue[] {
  const e = faits.entreprise;
  const encaissees = recettesEncaissees(faits);
  const prevues: Prevue[] = [];
  for (let annee = Number(depuis.slice(0, 4)); annee <= Number(jusquA.slice(0, 4)); annee++) {
    const precedente = annee - 1;
    const active = (e.debutActivite !== null && Number(e.debutActivite.slice(0, 4)) <= precedente)
      || caEncaisseAnnee(faits, precedente) !== 0;
    if (!active) continue;
    const { limite, mois } = limiteDeclarationRevenus(annee, e.codePostal);
    const fait = declaree(faits, 'revenus', String(annee));
    prevues.push({
      cle: `revenus:${annee}`,
      obligation: {
        id: `revenus-${annee}`, nature: 'impot', dossier: 'revenus',
        libelle: `Déclaration des revenus ${precedente}`,
        detail: 'Recettes hors taxes, sans abattement : les 34 % (305 € au moins) sont retirés par '
          + 'l’administration.',
        periode: String(annee),
        declaration: etapeDatee(limite, mois, aujourdhui, { faite: fait !== undefined, faiteLe: fait?.declareeLe ?? null }),
        montant: null,
        // L'option se lit telle qu'elle est aujourd'hui : le schéma ne garde
        // pas son histoire, et une option prise ou quittée en cours d'année ne
        // se partagerait pas ici sans elle.
        cases: casesDeclarationRevenus(encaissees, precedente, () => e.versementLiberatoire),
        saisies: []
      }
    });
  }
  return prevues;
}

function impotPrevu(faits: Faits, aujourdhui: DateISO): readonly Prevue[] {
  return soldeImpotPrevuDe(faits, new Date(`${aujourdhui}T12:00:00`)).map((p) => {
    const exercice = Number(p.date.slice(0, 4)) - 1;
    const limite: Resolution<DateISO> = {
      statut: 'hypothese', valeur: p.date, verifieLe: VERIFIE_LE, depuis: p.date.slice(0, 7) as Mois,
      source: 'impots.gouv.fr — calendrier du prélèvement du solde ; la date exacte est sur l’avis'
    };
    return {
      cle: `impot:${exercice}:${p.date.slice(0, 7)}`,
      obligation: {
        id: p.id, nature: 'impot', dossier: 'impot',
        libelle: `Impôt sur le revenu, solde ${exercice}`,
        detail: 'Estimé tant que l’avis n’est pas saisi.',
        periode: String(exercice),
        paiement: etape({
          limite, mois: p.date.slice(0, 7) as Mois, ouverture: ouvertureParPreavis(p.date),
          faite: false, faiteLe: null, aujourdhui, prelevee: true
        }),
        montant: {
          statut: 'hypothese', valeur: p.montant, verifieLe: VERIFIE_LE, depuis: p.date.slice(0, 7) as Mois,
          source: 'estimé sur la provision d’impôt de l’année'
        },
        saisies: []
      }
    };
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   CFE — solde, acompte, déclaration initiale
   ───────────────────────────────────────────────────────────────────────── */

function cfe(faits: Faits, depuis: Mois, jusquA: Mois, aujourdhui: DateISO): readonly Prevue[] {
  const debut = faits.entreprise.debutActivite;
  const prevues: Prevue[] = [];
  const obligationCfe = (d: DateCfe, extra: Partial<Obligation> & Pick<Obligation, 'libelle' | 'detail'>) => ({
    id: d.id, nature: 'cfe' as const, dossier: 'cfe' as const, periode: d.date.slice(0, 4),
    montant: null, saisies: [], preavisJours: d.preavisJours, ...extra
  });
  for (let annee = Number(depuis.slice(0, 4)); annee <= Number(jusquA.slice(0, 4)); annee++) {
    const d1447 = declaration1447C(debut, annee);
    if (d1447 !== null) {
      const fait = declaree(faits, 'cfe_1447c', String(annee));
      prevues.push({
        cle: `cfe-1447c:${annee}`,
        obligation: obligationCfe(d1447, {
          libelle: 'Déclaration initiale de CFE (1447-C)',
          detail: 'C’est elle qui établit ta base d’imposition ; l’omettre fait perdre l’exonération '
            + 'de première année.',
          declaration: etapeDatee(publie(d1447.date, 'CGI 1477 — avant le 1ᵉʳ janvier qui suit la création'),
            d1447.date.slice(0, 7) as Mois, aujourdhui, { faite: fait !== undefined, faiteLe: fait?.declareeLe ?? null })
        })
      });
    }
    const reference = annee - 2;
    const caReference = debut === null || Number(debut.slice(0, 4)) > reference
      ? null
      : caEncaisseAnnee(faits, reference);
    const regime = regimeCfe(debut, annee, caReference);
    if (cfeDue(regime)) {
      const p = paiementCfe(annee);
      prevues.push({
        cle: `cfe:${annee}`,
        obligation: obligationCfe(p, {
          libelle: `CFE ${annee}`,
          detail: regime.type === 'base-reduite-moitie'
            ? 'Première année d’imposition : la base est réduite de moitié, mais la CFE est due. '
              + 'Sans montant saisi, ton disponible est surestimé.'
            : 'L’avis paraît en novembre sur ton espace professionnel. Sans montant saisi, ton '
              + 'disponible est surestimé.',
          paiement: etapeDatee(publie(p.date, 'CGI ann. IV art. 199-0 — 15 décembre, reporté au jour ouvré'),
            p.date.slice(0, 7) as Mois, aujourdhui)
        })
      });
    }
    // L'acompte découle de la CFE de l'an passé TELLE QU'ELLE A ÉTÉ SAISIE —
    // pas d'une estimation (CGI 1679 quinquies, voir `acompteCfe`).
    const cfePrecedente = euros(faits.echeances
      .filter((e) => e.nature === 'cfe' && e.echeanceLe.startsWith(String(annee - 1)))
      .reduce((t, e) => t + e.montant, 0));
    const acompte = acompteCfe(annee, cfePrecedente);
    if (acompte !== null) {
      prevues.push({
        cle: `cfe-acompte:${annee}`,
        obligation: obligationCfe(acompte, {
          libelle: `CFE ${annee}, acompte de 50 %`,
          detail: 'Dû quand la CFE de l’an passé atteignait 3 000 €.',
          paiement: etapeDatee(publie(acompte.date, 'CGI 1679 quinquies — 15 juin, reporté au jour ouvré'),
            acompte.date.slice(0, 7) as Mois, aujourdhui)
        })
      });
    }
  }
  return prevues;
}

/* ─────────────────────────────────────────────────────────────────────────
   Formalités et pièces
   ───────────────────────────────────────────────────────────────────────── */

function formalites(faits: Faits, aujourdhui: DateISO): readonly Prevue[] {
  return ECHEANCES_REGLEMENTAIRES.map((r) => {
    const remplie = r.remplie(faits);
    return {
      cle: `formalite:${r.id}`,
      obligation: {
        id: r.id, nature: 'formalite', dossier: 'formalite',
        libelle: r.intitule, detail: r.detail, periode: r.date,
        // Passée, elle est « en vigueur », pas « en retard » : aucune
        // sanction n'est datée, et le rappel dure tant que le fait manque.
        // La date est celle que l'application retient depuis le lot 46 ; le
        // texte qui la fixe n'a pas été relu dans ce lot — la source le dit.
        formalite: etapeDatee(publie(r.date, 'réforme de la facturation électronique — date retenue au lot 46'),
          r.date.slice(0, 7) as Mois, aujourdhui, {
            suivi: false, retardPossible: false, faite: remplie !== false,
            faiteLe: remplie === false ? null : remplie
          }),
        montant: null, saisies: [], preavisJours: r.preavisJours
      }
    };
  });
}

/**
 * La première limite URSSAF qui suit un jour : la fin de validité d'une
 * attestation provisoire (CSS L243-15, « jusqu'à la première échéance »).
 */
function premiereEcheanceUrssaf(faits: Faits, le: DateISO, aujourdhui: DateISO): DateISO {
  // Une période d'avant le début d'activité n'a pas d'échéance : la
  // provisoire d'un débutant installé le 1ᵉʳ avril ne s'arrête pas au
  // 30 avril du trimestre précédent.
  const debut = faits.entreprise.debutActivite?.slice(0, 7) ?? '';
  const candidates = [-3, -2, -1, 0, 1, 2, 3]
    .map((k) => periodeDuMois(ajouterMois(le.slice(0, 7), k), faits.entreprise.urssafPeriodicite, aujourdhui))
    .filter((p) => (p.mois[p.mois.length - 1] as string) >= debut && p.limite >= le)
    .map((p) => p.limite)
    .sort();
  return candidates[0] as DateISO;
}

/**
 * Une pièce que remplace une autre de la même sorte, obtenue plus tard, n'a
 * plus rien à réclamer : l'attestation provisoire de 2025 n'est pas « à
 * renouveler » quand celle d'août 2026 est en main. Les pièces « autres » se
 * distinguent par leur libellé, et ne se remplacent pas entre elles.
 */
function remplacee(piece: PieceAFournir, toutes: readonly PieceAFournir[]): boolean {
  if (piece.sorte === 'autre' || piece.obtenueLe === null) return false;
  const obtenueLe = piece.obtenueLe;
  return toutes.some((p) => p.sorte === piece.sorte && p.obtenueLe !== null && p.obtenueLe > obtenueLe);
}

function pieces(faits: Faits, aujourdhui: DateISO): readonly Prevue[] {
  return faits.pieces.flatMap((piece) => {
    if (remplacee(piece, faits.pieces)) return [];
    const premiere = piece.obtenueLe === null ? null : premiereEcheanceUrssaf(faits, piece.obtenueLe, aujourdhui);
    const etat = etatDePiece(piece, aujourdhui, premiere);
    if (etat.finValidite === null || etat.rappelLe === null) return [];
    const fin = etat.finValidite;
    return [{
      cle: `piece:${piece.id}`,
      obligation: {
        // La fin dans l'identifiant : une pièce renouvelée est une autre
        // échéance, et le calendrier doit remplacer l'ancienne, pas la garder.
        id: `piece-${piece.id}-${fin}`, nature: 'formalite' as const, dossier: 'piece' as const,
        libelle: piece.libelle,
        detail: piece.sorte === 'vigilance'
          ? (piece.provisoire
            ? 'Provisoire : elle vaut jusqu’à ta première échéance URSSAF.'
            : 'Le client la demande datée de moins de six mois.')
          : 'Fin de validité inscrite sur l’attestation.',
        periode: piece.id,
        formalite: etape({
          limite: publie(fin, piece.sorte === 'vigilance' ? 'C. trav. D8222-5 ; CSS L243-15' : 'attestation saisie'),
          mois: fin.slice(0, 7) as Mois, ouverture: etat.rappelLe, faite: false, faiteLe: null, aujourdhui,
          // Expirée, une pièce reste « à renouveler » : aucun texte ne date
          // une faute, c'est le client qui la redemande.
          retardPossible: false
        }),
        montant: null, saisies: []
      }
    }];
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   Les saisies : à quelle obligation prévue chacune se rattache
   ───────────────────────────────────────────────────────────────────────── */

/**
 * La clé de fusion d'une échéance saisie — nature, puis période ou exercice :
 *
 *  · URSSAF : la période de l'appel (`Echeance.periode`, schéma 25) — un lien,
 *    plus le mois d'une limite que le report déplace ;
 *  · CFE : l'année, l'acompte se reconnaissant à son mois de juin ;
 *  · TVA : le mois où elle se paie, celui de la limite de la déclaration —
 *    une CA3 se dépose entre le 15 et le 24, et aucun report n'en sort ;
 *  · impôt : l'exercice et le mois du prélèvement.
 *
 * `null` pour ce qui ne règle aucune obligation prévue : un appel URSSAF sans
 * période (régularisation), la CFP.
 */
export function cleDeSaisie(e: Echeance): string | null {
  const mois = e.echeanceLe.slice(0, 7);
  switch (e.nature) {
    case 'urssaf': return typeof e.periode === 'string' ? `urssaf:${e.periode}` : null;
    case 'cfe': return mois.endsWith('-06') ? `cfe-acompte:${mois.slice(0, 4)}` : `cfe:${mois.slice(0, 4)}`;
    case 'tva': return `tva:${mois}`;
    case 'impot': return `impot:${exerciceDe(e)}:${mois}`;
    case 'cfp': return null;
  }
}

const LIBELLE_SAISIE: Readonly<Record<Echeance['nature'], string>> = {
  urssaf: 'URSSAF, appel', tva: 'TVA, paiement', impot: 'Impôt sur le revenu', cfe: 'CFE', cfp: 'CFP, formation professionnelle'
};

/** Une échéance saisie que rien de prévu ne porte : une obligation à elle seule. */
function obligationDeSaisie(e: Echeance, aujourdhui: DateISO): Obligation {
  const impot = e.nature === 'impot';
  const exercice = exerciceDe(e);
  return {
    id: `saisie-${e.id}`,
    // La CFP se paie à l'URSSAF : elle vit sur sa ligne.
    nature: e.nature === 'cfp' ? 'urssaf' : e.nature,
    dossier: e.nature === 'cfp' ? 'urssaf' : e.nature,
    libelle: impot && exercice !== Number(e.echeanceLe.slice(0, 4))
      ? `Impôt sur le revenu, solde ${exercice}`
      : LIBELLE_SAISIE[e.nature],
    detail: impot ? 'Prélevé par l’administration : à pointer quand il passe.' : 'Échéance saisie.',
    periode: e.echeanceLe.slice(0, 7),
    paiement: paiementDesSaisies([e], aujourdhui, impot),
    montant: montantDesSaisies([e]),
    saisies: [e]
  };
}

/** Une obligation prévue, réglée par les échéances saisies qui la portent. */
function reunir(prevue: Obligation, saisies: readonly Echeance[], aujourdhui: DateISO): Obligation {
  // Saisie, elle n'a plus rien à annoncer : son montant est dans le dû, le
  // préavis « sans montant saisi, ton disponible est surestimé » ne vaut plus.
  const { preavisJours: _, ...reste } = prevue;
  return {
    ...reste,
    // « Sans montant saisi, ton disponible est surestimé » ne vaut plus.
    detail: prevue.dossier === 'cfe' ? 'Avis saisi : son montant est compté dans le dû.' : prevue.detail,
    paiement: paiementDesSaisies(saisies, aujourdhui, prevue.dossier === 'impot'),
    montant: montantDesSaisies(saisies),
    saisies
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   L'assemblage
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Les obligations dont l'étape principale tombe entre `du` et `au` (bornes
 * comprises) — ou qu'une échéance saisie dans la plage porte —, état calculé
 * au jour `aujourdhui`.
 *
 * Les règles s'appliquent sur une plage élargie à toutes les saisies avant
 * la fusion : une échéance de janvier qui règle une période de décembre doit
 * retrouver sa période, même quand la plage commence en janvier.
 */
export function obligationsEntre(
  faits: Faits,
  du: DateISO,
  au: DateISO,
  aujourdhui: DateISO
): readonly Obligation[] {
  const dates = faits.echeances.map((e) => e.echeanceLe).sort();
  // Rien n'est dû avant le premier fait : une plage ouverte sur le passé ne
  // fait pas chercher des CFE en l'an 1970.
  const premierFait = [
    faits.entreprise.debutActivite,
    ...faits.recettes.flatMap((r) => [r.emiseLe, r.encaisseeLe]),
    ...faits.depenses.map((d) => d.payeeLe),
    dates[0]
  ].filter((d): d is DateISO => d !== null && d !== undefined).sort()[0] ?? aujourdhui;
  const plusTot = [du, dates[0] ?? du].sort()[0] as string;
  const depuis = (plusTot > premierFait ? plusTot : premierFait).slice(0, 7) as Mois;
  const jusquA = [au.slice(0, 7), dates.at(-1)?.slice(0, 7)]
    .filter((m): m is string => m !== undefined)
    .sort()
    .at(-1) as Mois;

  const prevues: Prevue[] = [
    ...urssaf(faits, jusquA, aujourdhui),
    ...des(faits, ajouterMois(jusquA, 1), aujourdhui),
    ...tva(faits, depuis, jusquA, aujourdhui),
    ...revenus(faits, depuis, jusquA, aujourdhui),
    ...impotPrevu(faits, aujourdhui),
    ...cfe(faits, depuis, jusquA, aujourdhui),
    ...formalites(faits, aujourdhui),
    ...pieces(faits, aujourdhui)
  ];

  const toutes = fusionner(
    prevues, faits.echeances, cleDeSaisie,
    (p, s) => reunir(p, s, aujourdhui),
    (e) => obligationDeSaisie(e, aujourdhui)
  );

  const dans = (d: string) => d >= du && d <= au;
  return toutes
    .filter((o) => {
      const principale = o.declaration ?? o.paiement ?? o.formalite;
      const date = principale === undefined ? null
        : principale.limite.statut === 'refuse' ? finDuMois(principale.mois) : principale.limite.valeur;
      return (date !== null && dans(date)) || o.saisies.some((e) => dans(e.echeanceLe));
    })
    .sort((a, b) => dateDe(a).localeCompare(dateDe(b)) || a.id.localeCompare(b.id));
}

function dateDe(o: Obligation): string {
  const e = o.declaration ?? o.paiement ?? o.formalite;
  if (e === undefined) return '';
  return e.limite.statut === 'refuse' ? finDuMois(e.mois) : e.limite.valeur;
}
