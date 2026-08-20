/**
 * Sélecteurs : les valeurs dérivées.
 *
 * Rien ici n'est stocké. Tout est recalculé depuis les faits à chaque lecture,
 * ce qui rend impossible la divergence entre un total et les lignes qui le
 * composent — le défaut qui produisait trois totaux différents pour les mêmes
 * recettes dans l'ancienne application.
 *
 * Ces fonctions sont pures et prennent les faits en paramètre : elles se
 * testent sans React et sans magasin.
 */

import {
  type DateISO, type Euros, type Mois, type Resolution, type TypeActivite,
  euros, moisDe
} from '../domain/types';
import { dernierMoisAcre, moisSousAcre, tauxImpotEtContributions } from '../domain/bareme';
import type { RegimeImposition } from '../domain/bareme';
import {
  type Echeance, type NatureDette, type RecetteEncaissee,
  type VentilationProvisions,
  estPayee, provisions as calculerProvisions
} from '../domain/calculs/provisions';
import { type ResultatTresorerie, autonomieMois, calculerTresorerie } from '../domain/calculs/tresorerie';
import {
  type ProvisionImpotRevenu, provisionImpotRevenu
} from '../domain/calculs/provisionImpotRevenu';
import {
  type EcranCible, type EntreeATraiter, type SujetATraiter,
  sujetsATraiter
} from '../domain/calculs/aTraiter';
import {
  acompteCfe, cfeDue, declaration1447C, paiementCfe, regimeCfe
} from '../domain/bareme/cfe';
import {
  PERIODES_URSSAF, type PeriodeBareme, fusionnerPeriodes
} from '../domain/bareme/urssaf';
import { soldeBancaire } from '../domain/calculs/banque';
import { type PreneurService, declarationsEnRetard } from '../domain/calculs/des';
import type { Faits } from './schema';
import {
  FORMULE_PAR_DEFAUT, echeanceDe
} from '../domain/calculs/delaiPaiement';

/**
 * Le barème URSSAF effectivement appliqué.
 *
 * Une seule source pour toute l'application : les périodes livrées avec le
 * code, complétées par celles que l'utilisateur a saisies. Tout calcul qui
 * lirait `PERIODES_URSSAF` directement verrait un barème différent de celui
 * affiché dans Config — exactement le genre de divergence que la refonte
 * cherche à rendre impossible.
 */
export function periodesUrssafEffectives(faits: Faits): readonly PeriodeBareme[] {
  return fusionnerPeriodes(PERIODES_URSSAF, faits.periodesUrssafAjoutees);
}

/** Le mois courant, dérivé de l'horloge et jamais codé en dur. */
export function moisCourant(maintenant: Date = new Date()): Mois {
  const mm = String(maintenant.getMonth() + 1).padStart(2, '0');
  return `${maintenant.getFullYear()}-${mm}` as Mois;
}

/** Le régime d'imposition, tel qu'il découle des faits (discriminant D2). */
export function regimeDe(faits: Faits, acomptePasSaisi: Euros = euros(0)): RegimeImposition {
  return faits.entreprise.versementLiberatoire
    ? { regime: 'versement_liberatoire' }
    : { regime: 'bareme', acomptePasSaisi };
}

/**
 * Les recettes encaissées, au format attendu par le calcul de provisions.
 *
 * Seules les recettes réellement encaissées comptent : c'est l'encaissement
 * qui fait naître la dette sociale, pas l'émission de la facture.
 */
export function recettesEncaissees(faits: Faits): readonly RecetteEncaissee[] {
  return faits.recettes
    .filter((r): r is typeof r & { encaisseeLe: DateISO } => r.encaisseeLe !== null)
    .map((r) => ({ id: r.id, montant: r.montant, encaisseeLe: r.encaisseeLe }));
}

/** Chiffre d'affaires encaissé sur une année civile. */
export function caEncaisseAnnee(faits: Faits, annee: number): Euros {
  const prefixe = String(annee);
  return euros(
    recettesEncaissees(faits)
      .filter((r) => r.encaisseeLe.startsWith(prefixe))
      .reduce<number>((somme, r) => somme + r.montant, 0)
  );
}

/**
 * Le solde bancaire.
 *
 * Solde initial plus les mouvements importés. Cette fonction avait été isolée
 * dès le départ pour que l'arrivée des mouvements n'ait qu'un seul endroit à
 * changer : c'est ce qui vient de se produire, et aucun écran n'a eu à être
 * touché.
 *
 * Sans relevé importé, elle rend le solde initial — et l'écran doit alors dire
 * que le solde n'est pas suivi, plutôt que d'afficher un chiffre figé comme
 * s'il était à jour. Voir `soldeEstSuivi`.
 */
export function solde(faits: Faits): Euros {
  return soldeBancaire(faits.soldeInitial, faits.mouvementsBancaires);
}

/**
 * Un relevé est-il disponible ?
 *
 * Dérivé, jamais stocké : un booléen `banqueReliee` à `true` pourrait
 * coexister avec une liste de mouvements vide, et rien ne le signalerait.
 */
export function soldeEstSuivi(faits: Faits): boolean {
  return faits.mouvementsBancaires.length > 0;
}

/**
 * Ce qu'on s'est effectivement versé sur un mois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DÉRIVÉ DU RELEVÉ, JAMAIS SAISI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Se verser de l'argent n'est pas une opération comptable en micro : la
 * personne et l'entreprise sont la même, et un virement du compte pro vers le
 * compte perso ne crée ni charge ni recette.
 *
 * L'audit demandait « un versement de rémunération à enregistrer ». Ç'aurait
 * été un fait de trop : le virement figure déjà au relevé, le solde le reflète
 * déjà, et le saisir une seconde fois le compterait deux fois. Ce qui manquait
 * n'était pas un fait mais un NOM — savoir lequel des mouvements sortants est
 * une rémunération.
 *
 * L'ancienne application n'avait pas ce choix : elle simulait un solde à
 * partir des encaissements moins les charges, et devait donc enregistrer le
 * salaire pour le retrancher. Ici le solde est réel.
 *
 * Rend zéro tant qu'aucun relevé n'est importé — et l'écran doit alors dire
 * qu'il ne sait pas, pas afficher zéro comme un constat.
 */
export function remunerationDuMois(faits: Faits, m: Mois): Euros {
  return euros(
    faits.mouvementsBancaires
      .filter((mv) => mv.sansContrepartie === 'remuneration' && mv.date.startsWith(m))
      // Les versements sont des débits, donc négatifs : on rend le montant
      // versé, pas son opposé.
      .reduce<number>((somme, mv) => somme + Math.abs(mv.montant), 0)
  );
}

/**
 * Sous ACRE à ce mois, d'après la date de début d'activité.
 *
 * La durée ne se calcule plus ici : elle était écrite en dur — quatre
 * trimestres pleins à compter du mois de début — sans source ni date de
 * vérification, ce que l'invariant n°3 interdit. Elle vit maintenant dans
 * `bareme/acre.ts`, avec sa provenance, et elle est TRIMESTRIELLE : un début
 * en février 2025 s'arrête au 31/12/2025, non au 31/01/2026.
 */
export function sousAcreLe(faits: Faits): (m: Mois) => boolean {
  const debut = faits.entreprise.debutActivite;
  if (!faits.entreprise.acre || debut === null) return () => false;

  const moisDebut = moisDe(debut);
  return (m) => moisSousAcre(moisDebut, m);
}

/**
 * Le dernier mois d'ACRE, pour que l'écran Config puisse l'écrire en clair.
 *
 * `null` quand l'ACRE n'est pas déclarée ou que le début d'activité manque :
 * il n'y a alors rien à afficher, et une date inventée serait recoupée contre
 * l'attestation URSSAF puis crue.
 */
export function finAcreDe(faits: Faits): Resolution<Mois> | null {
  const debut = faits.entreprise.debutActivite;
  if (!faits.entreprise.acre || debut === null) return null;
  return dernierMoisAcre(moisDe(debut));
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
  echeancesReglementaires: EntreeATraiter['echeancesReglementaires'] = [],
  maintenant: Date = new Date()
): EntreeATraiter {
  /* L'échéance vient de la recette : elle est imprimée sur le document. Le
     secours ne sert qu'à une facture qu'aucune migration n'aurait comblée —
     une facture émise sans échéance serait réputée jamais échue, et les
     retards les plus anciens seraient précisément ceux qu'on ne verrait pas. */
  const formules = new Map(faits.clients.map((c) => [c.nom, c.delaiPaiement]));
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
      echeanceLe: r.emiseLe === null
        ? null
        : r.echeanceLe
          ?? echeanceDe(r.emiseLe, formules.get(r.clientNom) ?? FORMULE_PAR_DEFAUT)
    })),
    periodesDeclarees: faits.periodesDeclarees,
    echeancesSaisies: faits.echeances.length,
    periodicite: faits.entreprise.urssafPeriodicite,
    periodesUrssaf: periodesUrssafEffectives(faits),
    desEnRetard: declarationsEnRetard(
      faits.recettes, preneursDeServices(faits), dateISOde(maintenant)
    ),
    debutActivite: faits.entreprise.debutActivite === null
      ? null
      : moisDe(faits.entreprise.debutActivite),
    echeancesReglementaires
  };
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
}[] = [
  {
    id: 'facturation-electronique-reception',
    intitule: 'Facturation électronique : réception obligatoire',
    date: '2026-09-01' as DateISO,
    preavisJours: 120
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

  const fixes = ECHEANCES_REGLEMENTAIRES
    .filter((e) => dansLePreavis(e.date, e.preavisJours))
    .map((e) => ({ id: e.id, intitule: e.intitule, date: e.date }));

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
  );
}

/**
 * Les acomptes de prélèvement à la source déjà saisis pour l'année.
 *
 * Payés ou non, et c'est ce qui rend les deux volets étanches : le volet 1
 * reprend déjà les acomptes appelés et non payés, donc la provision d'impôt
 * doit tous les retrancher. N'en retrancher que les payés compterait deux fois
 * ceux qui sont appelés et pas encore réglés.
 *
 * Le montant réellement débité l'emporte quand il diffère de celui appelé :
 * c'est lui qui est sorti du compte.
 */
function acomptesPasDeLAnnee(faits: Faits, annee: number): Euros {
  const prefixe = String(annee);
  return euros(faits.echeances
    .filter((e) => e.nature === 'impot' && e.echeanceLe.startsWith(prefixe))
    .reduce<number>((somme, e) => somme + (e.montantPaye ?? e.montant), 0));
}

/**
 * La provision d'impôt sur le revenu de l'année en cours.
 *
 * `null` sous le versement libératoire : l'impôt y est acquitté avec les
 * cotisations, et une seconde ligne le compterait deux fois. Les deux régimes
 * sont exclusifs par construction (`bareme/impot.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `caAttendu` EST EXPLICITE, ET N'A PAS DE DÉFAUT CACHÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les encaissements attendus du reste de l'année viennent du pipeline
 * construit par `etatProjection` — factures émises non réglées et revenu prévu
 * au planning. Ce pipeline ne peut pas être appelé d'ici : `etatProjection`
 * appelle lui-même `etatPilote`, et le lire ici formerait un cycle. L'appelant
 * qui l'a sous la main le passe ; les autres passent `null`, et le module
 * calcule alors un PLANCHER en le disant.
 */
export function provisionIrDe(
  faits: Faits,
  maintenant: Date = new Date(),
  caAttendu: Euros | null = null
): Resolution<ProvisionImpotRevenu> | null {
  if (faits.entreprise.versementLiberatoire) return null;

  const m = moisCourant(maintenant);
  const annee = Number(m.slice(0, 4));
  return provisionImpotRevenu({
    annee,
    moisCourant: m,
    typeActivite: faits.entreprise.typeActivite,
    caEncaisseConstate: caEncaisseAnnee(faits, annee),
    caAttendu,
    foyer: {
      partsFiscales: faits.partsFiscales,
      autresRevenusFoyer: faits.autresRevenusFoyer,
      versementPerDeductible: faits.versementPerDeductible
    },
    acomptesPasSaisis: acomptesPasDeLAnnee(faits, annee)
  });
}

/** Le reste à provisionner, dans la résolution qu'attend le volet 2. */
function resteAProvisionnerDe(
  r: Resolution<ProvisionImpotRevenu> | null
): Resolution<Euros> | undefined {
  if (r === null) return undefined;
  if (r.statut === 'refuse') return r;
  return r.statut === 'publie'
    ? { statut: 'publie', valeur: r.valeur.resteAProvisionner, source: r.source, verifieLe: r.verifieLe }
    : { statut: 'hypothese', valeur: r.valeur.resteAProvisionner, source: r.source, verifieLe: r.verifieLe, depuis: r.depuis };
}

export interface EtatPilote {
  readonly tresorerie: ResultatTresorerie;
  readonly voletConstate: Euros;
  readonly voletAProvisionner: Euros;
  /**
   * Le total de provision, ventilé par nature.
   *
   * « Sur cette somme totale, combien j'ai de provision et sur quelle
   * catégorie » : un total ne dit pas ce qu'il faut en faire, et ne permet ni
   * de vérifier une provision contre l'avis reçu, ni de savoir ce qui se
   * libère après une déclaration.
   */
  readonly provisionsParNature: VentilationProvisions;
  readonly autonomie: number | null;
  /**
   * `true` quand le taux d'impôt n'a pas pu être résolu : le calcul est alors
   * incomplet et l'interface doit le dire au lieu d'afficher un chiffre qui a
   * l'air fini.
   */
  readonly tauxImpotIndisponible: boolean;
  readonly motifTauxImpot: string | null;
  /**
   * La provision d'impôt sur le revenu, avec ce qu'elle ignore.
   *
   * `null` sous le versement libératoire, où l'impôt est déjà dans le taux.
   * L'écran s'en sert pour ne jamais présenter le montant comme un résultat
   * quand les parts, les autres revenus ou le barème manquent.
   */
  readonly provisionImpotRevenu: Resolution<ProvisionImpotRevenu> | null;
}

/**
 * L'état de l'écran Pilote : « combien je peux me verser, et qu'est-ce qui
 * coince ». Aucun nombre n'est écrit ici : tout vient des faits et du domaine.
 */
/**
 * Les échéances par défaut viennent des FAITS, plus d'une liste vide.
 *
 * Le paramètre existait avec `= []` pour défaut, et aucun appelant ne le
 * renseignait : le volet « échéances émises » valait donc zéro en permanence,
 * et le flux du mois n'avait aucune sortie. L'erreur allait dans le sens
 * dangereux — moins de provisions, donc plus de disponible, donc plus de
 * versable. L'application invitait à se verser de l'argent déjà dû.
 *
 * Le paramètre reste, pour les tests qui veulent poser un jeu précis ; mais
 * son défaut est désormais ce que porte le compte.
 */
export function etatPilote(
  faits: Faits,
  echeances: readonly Echeance[] = faits.echeances,
  maintenant: Date = new Date()
): EtatPilote {
  const m = moisCourant(maintenant);
  const type: TypeActivite = faits.entreprise.typeActivite;
  const regime = regimeDe(faits);

  const tauxImpotR = tauxImpotEtContributions(regime, m, type);
  const tauxImpot = tauxImpotR.statut === 'refuse' ? 0 : tauxImpotR.valeur;

  // Sous le barème, `tauxImpot` ne vaut que la CFP : l'impôt sur le revenu
  // entre séparément, en montant annuel. Sans lui, le versable était surévalué
  // de tout l'impôt de l'année pour qui n'a pas opté pour le versement
  // libératoire.
  const provisionIr = provisionIrDe(faits, maintenant);

  const detail = calculerProvisions(
    echeances,
    recettesEncaissees(faits),
    { mois: faits.periodesDeclarees },
    {
      typeActivite: type,
      sousAcreLe: sousAcreLe(faits),
      tauxImpotEtContributions: tauxImpot,
      impotRevenu: resteAProvisionnerDe(provisionIr),
      periodesUrssaf: periodesUrssafEffectives(faits)
    }
  );

  const tresorerie = calculerTresorerie(
    { solde: solde(faits), reserve: faits.reserve },
    detail
  );

  return {
    tresorerie,
    voletConstate: detail.voletConstate,
    voletAProvisionner: detail.voletAProvisionner,
    provisionsParNature: detail.parNature,
    autonomie: autonomieMois(tresorerie.versable, faits.besoinMensuel),
    tauxImpotIndisponible: tauxImpotR.statut === 'refuse',
    motifTauxImpot: tauxImpotR.statut === 'refuse' ? tauxImpotR.motif : null,
    provisionImpotRevenu: provisionIr
  };
}


/* ─────────────────────────────────────────────────────────────────────────
   Le flux du mois
   ───────────────────────────────────────────────────────────────────────── */

/** Une ligne du flux : une facture attendue, ou une échéance à payer. */
export interface LigneFlux {
  readonly id: string;
  readonly libelle: string;
  readonly montant: Euros;
  readonly date: DateISO | null;
  /** Ce qui est fait, et ce qui ne l'est pas encore. */
  readonly regle: boolean;
}

export interface FluxDuMois {
  readonly entrees: {
    /** Encaissé sur le mois observé. */
    readonly encaisse: Euros;
    /** Émis et non encore encaissé, tous mois confondus : l'argent qui manque. */
    readonly enAttente: Euros;
    readonly lignes: readonly LigneFlux[];
  };
  readonly sorties: {
    readonly total: Euros;
    /** Échéances déjà émises et non payées : la dette est chiffrée par l'appelant. */
    readonly constate: Euros;
    /** Charges nées d'encaissements non encore déclarés : la dette existe déjà. */
    readonly aProvisionner: Euros;
    readonly lignes: readonly LigneFlux[];
  };
  readonly remuneration: {
    readonly versable: Euros;
    /** Ce qui reste de côté, et qui explique l'écart avec le solde. */
    readonly provisions: Euros;
  };
}

const LIBELLE_NATURE: Readonly<Record<NatureDette, string>> = {
  urssaf: 'Cotisations URSSAF',
  tva: 'TVA',
  impot: 'Impôt sur le revenu',
  cfe: 'CFE',
  cfp: 'Contribution à la formation'
};

/**
 * Le flux du mois : ce qui rentre, ce qui sort, ce qui reste.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS COLONNES PARCE QUE CE SONT TROIS QUESTIONS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Combien est rentré ce mois-ci », « combien doit sortir », « combien
 * reste-t-il pour moi » ne se répondent pas avec le même chiffre, et les
 * empiler dans une seule liste oblige à faire la soustraction de tête. La
 * spec de design les met côte à côte ; ce sélecteur les produit d'un seul
 * calcul, pour qu'aucune colonne ne puisse diverger d'une autre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * « EN ATTENTE » N'EST PAS BORNÉ AU MOIS, ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'encaissement est daté : le limiter au mois observé a un sens. Une facture
 * impayée, elle, n'appartient à aucun mois — elle traîne. La borner au mois
 * ferait disparaître de l'écran la facture de mars toujours pas réglée en
 * août, c'est-à-dire précisément celle qu'il faut relancer.
 */
export function fluxDuMois(
  faits: Faits,
  m: Mois,
  etat: EtatPilote,
  echeances: readonly Echeance[] = faits.echeances
): FluxDuMois {
  const encaisseesDuMois = faits.recettes.filter(
    (r) => r.encaisseeLe !== null && r.encaisseeLe.startsWith(m)
  );
  // Une écriture d'annulation porte un montant négatif : elle doit diminuer
  // l'encaissé, pas s'y ajouter comme une recette de plus.
  const enAttente = faits.recettes.filter((r) => r.emiseLe !== null && r.encaisseeLe === null);

  const echeancesDuMois = echeances.filter((e) => e.echeanceLe.startsWith(m));

  const total = (liste: readonly { readonly montant: Euros }[]): Euros =>
    euros(liste.reduce((s, x) => s + x.montant, 0));

  return {
    entrees: {
      encaisse: total(encaisseesDuMois),
      enAttente: total(enAttente),
      lignes: [
        ...encaisseesDuMois.map((r) => ({
          id: r.id,
          libelle: r.clientNom !== '' ? r.clientNom : r.libelle,
          montant: r.montant,
          date: r.encaisseeLe,
          regle: true
        })),
        ...enAttente.map((r) => ({
          id: r.id,
          libelle: r.clientNom !== '' ? r.clientNom : r.libelle,
          montant: r.montant,
          date: r.emiseLe,
          regle: false
        }))
      ]
    },
    sorties: {
      // Le total vient des PROVISIONS, pas de la liste d'échéances.
      //
      // Tant qu'aucune échéance n'est saisie, la liste est vide — mais la
      // dette, elle, existe : elle naît de l'encaissement. Additionner la
      // liste afficherait « 0 € de sorties » à quelqu'un qui doit plusieurs
      // milliers d'euros de cotisations, ce qui est le pire chiffre possible
      // sur cet écran.
      total: etat.tresorerie.provisions,
      constate: etat.voletConstate,
      aProvisionner: etat.voletAProvisionner,
      lignes: echeancesDuMois.map((e) => ({
        id: e.id,
        libelle: LIBELLE_NATURE[e.nature],
        montant: e.montant,
        date: e.echeanceLe,
        regle: estPayee(e)
      }))
    },
    remuneration: {
      versable: etat.tresorerie.versable,
      provisions: etat.tresorerie.provisions
    }
  };
}

/** Les clients, indexés par nom, au format attendu par le calcul de DES. */
export function preneursDeServices(faits: Faits): ReadonlyMap<string, PreneurService> {
  return new Map(faits.clients.map((c) => [
    c.nom,
    { nom: c.nom, pays: c.pays, tvaIntracom: c.tvaIntracom }
  ]));
}

/* ─────────────────────────────────────────────────────────────────────────
   Écran Activité
   ───────────────────────────────────────────────────────────────────────── */


/** La date du jour, au format ISO, sans passer par le fuseau local. */
export function dateDuJour(maintenant: Date = new Date()): DateISO {
  return maintenant.toISOString().slice(0, 10) as DateISO;
}
