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

import { moisDeclares } from '../domain/calculs/declarations.declarees';
import {
  type DateISO, type Euros, type Mois, type Resolution, type TypeActivite,
  euros, moisDe
} from '../domain/types';
import { moisSousAcre, tauxImpotEtContributions } from '../domain/bareme';
import { tvaDueDepuis } from '../domain/bareme/tva';
import type { RegimeImposition } from '../domain/bareme';
import {
  type Echeance, type NatureDette, type RecetteEncaissee,
  type VentilationProvisions,
  estPayee, exerciceDe, provisions as calculerProvisions
} from '../domain/calculs/provisions';
import { type ResultatTresorerie, autonomieMois, calculerTresorerie } from '../domain/calculs/tresorerie';
import {
  type ProvisionImpotRevenu, provisionImpotRevenu
} from '../domain/calculs/provisionImpotRevenu';
import {
  type PeriodeBareme, baremeDeLaCaisse, fusionnerPeriodes
} from '../domain/bareme/urssaf';
import { soldeDerive } from '../domain/calculs/solde';
import { optionVlAu } from '../domain/calculs/optionVl';
import type { RegimeTva } from '../domain/calculs/depenses';
import { tvaDeDepense } from '../domain/calculs/depenses.tva';
import type { Faits } from './schema';
import { encaissementsAttendusDeLAnnee, facturesAEncaisser } from './selecteurs.pipeline';

/**
 * Le barème URSSAF effectivement appliqué.
 *
 * Une seule source pour toute l'application : les périodes livrées avec le
 * code pour la caisse de l'entreprise, complétées par celles que l'utilisateur
 * a saisies. Tout calcul qui lirait `PERIODES_URSSAF` directement verrait un
 * barème différent de celui affiché dans Config — exactement le genre de
 * divergence que la refonte cherche à rendre impossible —, et un affilié
 * Cipav y cotiserait au taux de la SSI.
 *
 * Les périodes saisies s'appliquent à la caisse du moment : elles se lisent
 * sur l'avis d'appel de sa propre caisse.
 */
export function periodesUrssafEffectives(faits: Faits): readonly PeriodeBareme[] {
  const { caisseRetraite, typeActivite } = faits.entreprise;
  return fusionnerPeriodes(baremeDeLaCaisse(caisseRetraite, typeActivite), faits.periodesUrssafAjoutees);
}

/** Le mois courant, dérivé de l'horloge et jamais codé en dur. */
export function moisCourant(maintenant: Date = new Date()): Mois {
  const mm = String(maintenant.getMonth() + 1).padStart(2, '0');
  return `${maintenant.getFullYear()}-${mm}` as Mois;
}


/**
 * Le mois depuis lequel la TVA est due d'après les seuils, `null` si elle ne
 * l'a jamais été ou si les seuils manquent pour en juger.
 */
export function tvaDueDepuisDe(faits: Faits): Mois | null {
  /* Gardé par objet de faits. `regimeTvaAu` le demande pour chaque dépense
     de chaque période de TVA : sur trois ans d'historique, les obligations du
     lot 53 recalculaient le franchissement des seuils des centaines de fois,
     et chaque écran mettait 600 à 850 ms à s'afficher au lieu de 25 à 140.
     Les faits sont immuables : une écriture donne un nouvel objet, donc un
     calcul neuf. */
  if (memoTvaDue.has(faits)) return memoTvaDue.get(faits) ?? null;
  const r = tvaDueDepuis(
    recettesEncaissees(faits), faits.entreprise.typeActivite, faits.entreprise.debutActivite
  );
  const v = r.statut === 'refuse' ? null : r.valeur;
  memoTvaDue.set(faits, v);
  return v;
}
const memoTvaDue = new WeakMap<Faits, Mois | null>();

/**
 * Le mois depuis lequel l'entreprise applique la TVA : l'OPTION saisie dans
 * Réglages, ou le FRANCHISSEMENT des seuils, le plus tôt des deux.
 *
 * Une seule source pour les factures et la TVA déductible des dépenses. Le
 * mois saisi décidait seul : sans lui, les factures partaient en franchise
 * alors que la TVA était due depuis le franchissement.
 */
export function debutTvaEffectif(faits: Faits): Mois | null {
  const option = faits.entreprise.tvaDepuis;
  const due = tvaDueDepuisDe(faits);
  if (due === null) return option;
  return option !== null && option < due ? option : due;
}

/**
 * L'option pour le versement libératoire à un mois : la SEULE lecture de
 * l'option. Le booléen de l'entreprise est la dernière choisie, qui peut ne
 * valoir qu'au 1er janvier prochain ; le lire directement faisait recalculer
 * l'année passée sous l'option du jour (voir `calculs/optionVl`).
 */
export function vlAu(faits: Faits, m: Mois): boolean {
  return optionVlAu(faits.entreprise.historiqueVl, faits.entreprise.versementLiberatoire, m);
}

/** Le régime d'imposition d'un mois, tel qu'il découle des faits (discriminant D2). */
export function regimeDe(faits: Faits, m: Mois, acomptePasSaisi: Euros = euros(0)): RegimeImposition {
  return vlAu(faits, m)
    ? { regime: 'versement_liberatoire' }
    : { regime: 'bareme', acomptePasSaisi };
}

/**
 * Le taux d'impôt et de contributions de chaque mois, pour le volet « à
 * provisionner » : versement libératoire compris ou non selon l'option de CE
 * mois. Au taux du mois courant, un décembre sous l'option encore à déclarer
 * en janvier — l'option quittée au 1er — perdait ses 2,2 %, et l'année
 * écoulée, toute sous l'option, n'avait pas d'impôt au barème pour les
 * reprendre : le dû baissait d'autant. Refusé, il vaut zéro, comme avant.
 */
export function tauxImpotAu(faits: Faits): (m: Mois) => number {
  return (m) => {
    const r = tauxImpotEtContributions(regimeDe(faits, m), m, faits.entreprise.typeActivite);
    return r.statut === 'refuse' ? 0 : r.valeur;
  };
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
    .map((r) => ({
      id: r.id, montant: r.montant, encaisseeLe: r.encaisseeLe, tva: euros(r.tvaCollectee ?? 0)
    }));
}

/**
 * Le régime de TVA en vigueur à un mois donné.
 *
 * Résolu par période, comme les taux URSSAF, et pour la même raison : une
 * entreprise qui franchit le seuil en cours d'année relève de la franchise
 * avant, et de l'assujettissement après. Appliquer le régime d'aujourd'hui à
 * une dépense de mars rendrait déductible une TVA qui ne l'était pas.
 */
export function regimeTvaAu(faits: Faits, m: Mois): RegimeTva {
  // L'option OU le franchissement : voir `debutTvaEffectif`.
  const depuis = debutTvaEffectif(faits);
  return depuis !== null && m >= depuis ? 'assujetti' : 'franchise';
}

/**
 * La TVA encaissée et pas encore appelée : collectée sur les encaissements,
 * MOINS LA TVA DÉDUCTIBLE des dépenses payées, moins les échéances de TVA
 * saisies (payées ou non — le volet 1 reprend déjà celles qui ne le sont
 * pas). Jamais négative.
 *
 * La déductible manquait : une échéance de TVA est le montant NET d'un
 * trimestre — collectée moins déductible — et la retrancher de la seule
 * collectée laissait la déductible en provision pour toujours. Le jeu d'essai
 * l'a vu : 1 300 € provisionnés quand le dossier du trimestre en dit 1 140.
 * Même règle que le dossier : régime au mois de paiement, pièce exigée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA TVA AUTOLIQUIDÉE S'AJOUTE À LA COLLECTÉE, AVANT LE RETRANCHEMENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un achat de service à un fournisseur de l'Union fait naître une TVA due par
 * l'acheteur (art. 283-2 CGI), franchisé compris. Elle ne passait dans aucune
 * provision : le versable était trop haut d'autant.
 *
 * Elle se déclare sur la MÊME déclaration que la collectée, donc une échéance
 * de TVA saisie règle les deux d'un seul montant. L'ajouter APRÈS le
 * retranchement des échéances compterait deux fois : un assujetti avec 300 €
 * collectés et 20 € autoliquidés, qui règle 320 €, verrait 20 € rester
 * provisionnés pour toujours. Même fenêtre et même « réglé » que la collectée :
 * tout l'historique, toutes les échéances `tva` (les non payées sont reprises
 * par le volet 1, pas ici).
 *
 * Chez un assujetti, cette TVA est en principe aussi déductible sur la même
 * déclaration (neutre) ; `recuperable` ne la reprend pas, de sorte que le
 * montant reste un plafond prudent — l'erreur va dans le sens d'en mettre de
 * côté, pas d'en laisser se verser.
 */
export function tvaAReverserDe(faits: Faits): Euros {
  const collectee = faits.recettes
    .filter((r) => r.encaisseeLe !== null)
    .reduce<number>((t, r) => t + (r.tvaCollectee ?? 0), 0);
  const { deductible, autoliquidee } = tvaDesDepensesPayees(faits);
  const appelee = faits.echeances
    .filter((e) => e.nature === 'tva')
    .reduce<number>((t, e) => t + (e.montantPaye ?? e.montant), 0);
  return euros(Math.max(0, collectee + autoliquidee - deductible - appelee));
}

/** La TVA déductible et la TVA autoliquidée des dépenses payées : une règle, un passage. */
export function tvaDesDepensesPayees(faits: Faits): { deductible: number; autoliquidee: number } {
  const banqueSynchronisee = soldeEstSuivi(faits);
  let deductible = 0;
  let autoliquidee = 0;
  for (const d of faits.depenses) {
    if (d.payeeLe === null) continue;
    const regime = regimeTvaAu(faits, moisDe(d.payeeLe));
    const tva = tvaDeDepense(d, { regimeTva: regime, banqueSynchronisee });
    deductible += tva.recuperable;
    // Chez un redevable, la TVA autoliquidée est due ET déductible sur la même
    // déclaration : elle s'annule. La compter due sans la compter déductible
    // provisionnait en trop chaque achat de service européen d'un assujetti.
    // Seul un franchisé, qui ne déduit rien, la doit vraiment.
    if (regime === 'franchise') autoliquidee += tva.aAutoliquider;
  }
  return { deductible, autoliquidee };
}

/** Chiffre d'affaires encaissé sur une année civile. */
export function caEncaisseAnnee(faits: Faits, annee: number): Euros {
  return encaisseDeLAnnee(faits, annee, () => true);
}

function encaisseDeLAnnee(faits: Faits, annee: number, retenir: (m: Mois) => boolean): Euros {
  const prefixe = String(annee);
  return euros(
    recettesEncaissees(faits)
      .filter((r) => r.encaisseeLe.startsWith(prefixe) && retenir(moisDe(r.encaisseeLe)))
      .reduce<number>((somme, r) => somme + r.montant, 0)
  );
}

/**
 * Ce qu'une année a encaissé HORS versement libératoire : l'assiette de
 * l'impôt au barème, la case 5HQ de la déclaration. `null` quand l'option a
 * couvert l'année entière — il n'y a alors pas d'impôt au barème du tout, et
 * l'estimer recompterait un impôt déjà payé à chaque déclaration.
 */
function encaisseAuBareme(faits: Faits, annee: number): Euros | null {
  const mois = Array.from({ length: 12 }, (_, i) => `${annee}-${String(i + 1).padStart(2, '0')}` as Mois);
  if (mois.every((m) => vlAu(faits, m))) return null;
  return encaisseDeLAnnee(faits, annee, (m) => !vlAu(faits, m));
}

/**
 * Le solde du compte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IL NE VALAIT LE SOLDE INITIAL QUE PARCE QU'ON NE LUI DONNAIT RIEN D'AUTRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Cette fonction ne sommait autrefois que le solde initial et les mouvements
 * d'un relevé importé : tant qu'aucun relevé n'existait, elle ne bougeait
 * jamais, quoi que l'utilisateur enregistre par ailleurs — des recettes
 * encaissées, des dépenses payées, des échéances URSSAF ou de TVA réglées.
 * Elle dérive maintenant de TOUS ces faits, pas seulement du relevé ; voir
 * `soldeDerive` (`domain/calculs/solde.ts`) pour la règle qui évite de les
 * compter deux fois quand un relevé existe.
 *
 * Isolée ici pour la même raison qu'avant : un seul endroit à changer.
 */
export function solde(faits: Faits): Euros {
  return soldeDerive(
    faits.soldeInitial, faits.soldeInitialAu,
    recettesEncaissees(faits), faits.depenses, echeancesDuComptePro(faits),
    faits.mouvementsBancaires
  ).montant;
}

/* ── L'impôt réglé depuis le compte personnel (lot 35, décision 17) ─────── */

/**
 * Ce qui a été viré vers le compte personnel POUR L'IMPÔT d'un exercice —
 * mouvements « mis de côté pour l'impôt », rattachés par leur date.
 *
 * Par la date, faute de mieux : un virement ne dit pas quel exercice il
 * finance. Celui de janvier pour le solde de l'an passé compterait pour
 * l'année nouvelle ; le cas est dit à l'écran du relevé, et un avis saisi
 * le corrige de toute façon (voir `soldeImpotPrecedentDe`).
 */
export function virementsImpotDe(faits: Faits, annee: number): Euros {
  const prefixe = String(annee);
  return euros(faits.mouvementsBancaires
    .filter((m) => m.sansContrepartie === 'impot' && !m.ignoree && m.date.startsWith(prefixe))
    .reduce((t, m) => t - m.montant, 0));
}

/**
 * L'impôt de cet exercice est-il réglé depuis le compte PERSONNEL ?
 *
 * Oui dès qu'un virement « pour l'impôt » de cet exercice existe : c'est le
 * geste qui le dit, et il n'y a rien d'autre à régler. Un acompte prélevé sur
 * le compte personnel ne sort alors pas du compte professionnel — le
 * retrancher du solde en plus du virement qui l'a financé comptait la même
 * somme deux fois. Sans virement de ce type, rien ne change : l'impôt est
 * réputé payé depuis le compte professionnel, comme avant.
 */
function impotRegleDepuisLePerso(faits: Faits, annee: number): boolean {
  return virementsImpotDe(faits, annee) > 0;
}

/**
 * Les échéances qui sortent du compte PROFESSIONNEL : toutes, sauf l'impôt
 * sur le revenu d'un exercice réglé depuis le compte personnel. La SEULE
 * porte par laquelle solde, provisions et flux lisent les échéances : deux
 * filtres écrits à part finiraient par ne pas exclure les mêmes.
 */
export function echeancesDuComptePro(
  faits: Faits, echeances: readonly Echeance[] = faits.echeances
): readonly Echeance[] {
  return echeances.filter((e) => e.nature !== 'impot' || !impotRegleDepuisLePerso(faits, exerciceDe(e)));
}


/**
 * Un relevé est-il disponible ?
 *
 * NOTE : distinct de la provenance du solde (`provenanceSoldeDe`), qui peut
 * valoir `'derive'` même quand cette fonction rend `false` — le solde se
 * dérive désormais des faits seuls, sans qu'un relevé soit nécessaire.
 * `soldeEstSuivi` répond à une question plus étroite : la banque est-elle
 * synchronisée, au sens où l'écran Relevé et le rapprochement en ont besoin.
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
  // Réglé depuis le compte personnel : ce qui est déjà parti pour l'impôt est
  // ce qui a été VIRÉ, pas ce qui a été prélevé — les acomptes l'ont été avec
  // cet argent-là. Retrancher les deux comptait la même somme deux fois.
  if (impotRegleDepuisLePerso(faits, annee)) return virementsImpotDe(faits, annee);
  // Par l'exercice réglé, pas par la date : le solde de l'an dernier, prélevé
  // à l'automne, n'est pas un acompte de cette année (voir `Echeance.exercice`).
  return euros(faits.echeances
    .filter((e) => e.nature === 'impot' && exerciceDe(e) === annee)
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
 * `caAttendu` EST CALCULÉ ICI, POUR LES TROIS LECTEURS À LA FOIS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les encaissements attendus du reste de l'année viennent du pipeline de
 * `selecteurs.pipeline.ts` — factures émises non réglées et revenu prévu au
 * planning —, le même que celui de la projection de trésorerie. Il ne dépend
 * plus d'`etatProjection` : Pilote, composition et dette passent tous par
 * `impotRevenuAProvisionner` et lisent donc un seul chiffre. Quand l'appelant
 * lui laissait le soin de les fournir, aucun ne le faisait, et l'impôt se
 * calculait au taux d'un revenu de demi-année.
 *
 * Le paramètre `caAttendu` subsiste pour les tests qui veulent poser un
 * pipeline connu sans bâtir des factures ; en production personne ne le
 * passe, et `undefined` — pas `null` — déclenche le calcul : `null` y dit
 * explicitement « non fourni ».
 */
export function provisionIrDe(
  faits: Faits,
  maintenant: Date = new Date(),
  caAttendu?: Euros | null
): Resolution<ProvisionImpotRevenu> | null {
  const m = moisCourant(maintenant);
  const annee = Number(m.slice(0, 4));
  const assiette = encaisseAuBareme(faits, annee);
  if (assiette === null) return null;

  return provisionImpotRevenu({
    annee,
    moisCourant: m,
    typeActivite: faits.entreprise.typeActivite,
    caEncaisseConstate: assiette,
    // Le reste de l'année suit l'option de ce mois : elle ne change qu'au
    // 1er janvier.
    caAttendu: vlAu(faits, m) ? euros(0)
      : caAttendu === undefined ? encaissementsAttendusDeLAnnee(faits, maintenant) : caAttendu,
    foyer: {
      partsFiscales: faits.partsFiscales,
      autresRevenusFoyer: faits.autresRevenusFoyer,
      versementPerDeductible: faits.versementPerDeductible,
      impositionCommune: faits.impositionCommune
    },
    acomptesPasSaisis: acomptesPasDeLAnnee(faits, annee)
  });
}

/**
 * Le solde estimé de l'impôt de l'ANNÉE PRÉCÉDENTE, tant que son avis n'est
 * pas saisi.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AU 1ᴱᴿ JANVIER, L'IMPÔT DE L'ANNÉE ÉCOULÉE DISPARAISSAIT DE LA PROVISION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La provision ne regardait que l'année de l'horloge. Le 2 janvier, son
 * assiette repartait de zéro : l'impôt des revenus de l'année écoulée — dont
 * le solde ne se paie qu'à l'automne suivant — sortait des provisions, et le
 * « tu peux te verser » montait d'autant jusqu'à la saisie de l'avis, l'été
 * venu. C'est le moment de l'année où l'écran invitait le plus à se verser
 * de l'argent dû.
 *
 * L'estimation tient jusqu'à ce qu'une échéance d'impôt portant cet exercice
 * soit saisie : l'avis est alors un fait, au volet 1, et le garder ici le
 * compterait deux fois. Elle cesse aussi d'elle-même l'année suivante — le
 * solde a été prélevé ou remboursé entre-temps. Rien n'est inventé pour une
 * année sans encaissement.
 */
export function soldeImpotPrecedentDe(
  faits: Faits,
  maintenant: Date = new Date()
): Resolution<ProvisionImpotRevenu> | null {
  const precedente = Number(moisCourant(maintenant).slice(0, 4)) - 1;
  // L'option de CETTE année-là, pas celle du jour : quitter le versement
  // libératoire en janvier inventait un solde d'impôt sur une année déjà
  // imposée à chaque déclaration.
  const assiette = encaisseAuBareme(faits, precedente);
  if (assiette === null || assiette <= 0) return null;
  if (faits.echeances.some((e) => e.nature === 'impot' && e.exercice === precedente)) return null;

  return provisionImpotRevenu({
    annee: precedente,
    moisCourant: `${precedente}-12` as Mois,
    typeActivite: faits.entreprise.typeActivite,
    caEncaisseConstate: assiette,
    // L'année est close : il n'y a plus rien à attendre, et le dire évite que
    // l'estimation se présente comme un plancher.
    caAttendu: euros(0),
    anneeClose: true,
    foyer: {
      partsFiscales: faits.partsFiscales,
      autresRevenusFoyer: faits.autresRevenusFoyer,
      versementPerDeductible: faits.versementPerDeductible,
      impositionCommune: faits.impositionCommune
    },
    acomptesPasSaisis: acomptesPasDeLAnnee(faits, precedente)
  });
}

/**
 * L'impôt sur le revenu que le volet 2 doit retenir : le reste de l'année en
 * cours, plus le solde estimé de l'année précédente tant que son avis manque.
 *
 * Une seule fonction pour les trois appelants (Pilote, composition, dette) :
 * l'oubli du solde dans l'un d'eux aurait fait dire deux versables différents
 * au même écran.
 */
export function impotRevenuAProvisionner(
  faits: Faits,
  maintenant: Date = new Date()
): Resolution<Euros> | undefined {
  const parts = [provisionIrDe(faits, maintenant), soldeImpotPrecedentDe(faits, maintenant)]
    .map(resteAProvisionnerDe)
    .filter((r): r is Resolution<Euros> => r !== undefined);
  if (parts.length === 0) return undefined;
  const refus = parts.find((r) => r.statut === 'refuse');
  if (refus !== undefined) return refus;
  const valeur = euros(parts.reduce<number>((t, r) => t + (r.statut === 'refuse' ? 0 : r.valeur), 0));
  const hypothese = parts.find((r) => r.statut === 'hypothese');
  if (hypothese !== undefined && hypothese.statut === 'hypothese') return { ...hypothese, valeur };
  const premiere = parts[0];
  return premiere !== undefined && premiere.statut === 'publie' ? { ...premiere, valeur } : undefined;
}

/** Le reste à provisionner, dans la résolution qu'attend le volet 2. */
export function resteAProvisionnerDe(
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
  /** Le solde estimé de l'impôt de l'année précédente, tant que son avis manque. */
  readonly soldeImpotPrecedent: Resolution<ProvisionImpotRevenu> | null;
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
  toutesEcheances: readonly Echeance[] = faits.echeances,
  maintenant: Date = new Date()
): EtatPilote {
  // L'impôt réglé depuis le compte personnel ne pèse pas sur le compte pro :
  // voir `echeancesDuComptePro`.
  const echeances = echeancesDuComptePro(faits, toutesEcheances);
  const m = moisCourant(maintenant);
  const type: TypeActivite = faits.entreprise.typeActivite;
  const tauxImpotR = tauxImpotEtContributions(regimeDe(faits, m), m, type);

  // Sous le barème, le taux d'impôt ne vaut que la CFP : l'impôt sur le revenu
  // entre séparément, en montant annuel. Sans lui, le versable était surévalué
  // de tout l'impôt de l'année pour qui n'a pas opté pour le versement
  // libératoire.
  const provisionIr = provisionIrDe(faits, maintenant);

  const detail = calculerProvisions(
    echeances,
    recettesEncaissees(faits),
    { mois: moisDeclares(faits.periodesDeclarees) },
    {
      typeActivite: type,
      sousAcreLe: sousAcreLe(faits),
      debutActivite: faits.entreprise.debutActivite,
      tauxImpotEtContributions: tauxImpotAu(faits),
      impotRevenu: impotRevenuAProvisionner(faits, maintenant),
      tvaAReverser: tvaAReverserDe(faits),
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
    provisionImpotRevenu: provisionIr,
    soldeImpotPrecedent: soldeImpotPrecedentDe(faits, maintenant)
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
  /** Non réglé et passé son échéance : la pastille « en retard ». */
  readonly enRetard?: boolean;
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
    /**
     * Dont l'impôt sur le revenu encore à mettre de côté — à virer vers le
     * compte personnel quand c'est de là qu'il se paie (décision 17). Il
     * grandit à chaque encaissement et baisse à chaque virement « pour
     * l'impôt ». `null` sous versement libératoire ou sans provision.
     */
    readonly impotAMettreDeCote: Euros | null;
  };
}

export const LIBELLE_NATURE: Readonly<Record<NatureDette, string>> = {
  urssaf: 'Cotisations URSSAF',
  tva: 'TVA',
  impot: 'Impôt sur le revenu',
  cfe: 'CFE',
  cfp: 'Contribution à la formation'
};

/** Une échéance qui attend son paiement, et si son jour est passé. */
export interface EcheanceAPayer extends Echeance {
  readonly enRetard: boolean;
}

export interface EcheancesAPayer {
  /** Jusqu'à la fin du mois courant, retards compris : la plus ancienne d'abord. */
  readonly maintenant: readonly EcheanceAPayer[];
  /** Plus tard : un échéancier annuel saisi d'un coup n'a pas à remplir l'écran. */
  readonly plusTard: readonly Echeance[];
}

/**
 * Les échéances non payées : celles du mois et les retards, puis le reste.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN APPEL IMPAYÉ N'APPARTIENT À AUCUN MOIS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le flux ne listait que les échéances DU MOIS. Un prélèvement URSSAF de mai
 * resté impayé disparaissait de la colonne Sorties le 1ᵉʳ juin — alors que le
 * total, tiré des provisions, le comptait toujours. La colonne montrait donc
 * un chiffre sans la ligne qui le faisait, et cachait précisément la sortie
 * qui demande un geste. Côté Entrées, la règle est la même depuis le début :
 * une facture impayée ne quitte pas l'écran parce que le mois a changé.
 *
 * Le flux et le panneau qui pointe un paiement lisent cette liste ; aucun des
 * deux ne la recalcule.
 */
export function echeancesAPayer(
  echeances: readonly Echeance[],
  aujourdhui: DateISO = dateDuJour(),
  /** Le mois jusqu'au bout duquel on regarde : celui du flux affiché. */
  jusquA: Mois = aujourdhui.slice(0, 7) as Mois
): EcheancesAPayer {
  // Borne haute en texte : « 2026-06-31 » n'existe pas, mais il suit bien
  // toutes les dates de juin et précède toutes celles de juillet.
  const finDuMois = `${jusquA}-31`;
  const ouvertes = echeances
    .filter((e) => !estPayee(e))
    .sort((a, b) => a.echeanceLe.localeCompare(b.echeanceLe));
  return {
    // Strictement : une échéance n'est pas en retard LE jour où elle tombe.
    maintenant: ouvertes
      .filter((e) => e.echeanceLe <= finDuMois)
      .map((e) => ({ ...e, enRetard: aujourdhui > e.echeanceLe })),
    plusTard: ouvertes.filter((e) => e.echeanceLe > finDuMois)
  };
}

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
  toutesEcheances: readonly Echeance[] = faits.echeances,
  aujourdhui: DateISO = dateDuJour()
): FluxDuMois {
  // Un acompte d'impôt prélevé sur le compte personnel n'est pas une sortie
  // du compte pro : voir `echeancesDuComptePro`.
  const echeances = echeancesDuComptePro(faits, toutesEcheances);
  const encaisseesDuMois = faits.recettes.filter(
    (r) => r.encaisseeLe !== null && r.encaisseeLe.startsWith(m)
  );
  // Une écriture d'annulation porte un montant négatif : elle doit diminuer
  // l'encaissé, pas s'y ajouter comme une recette de plus.
  //
  // L'attente, elle, vient de la liste que pointe le panneau d'encaissement :
  // voir `facturesAEncaisser` pour la facture annulée qui y apparaissait deux
  // fois.
  const enAttente = facturesAEncaisser(faits, aujourdhui);

  const echeancesDuMois = echeances.filter((e) => e.echeanceLe.startsWith(m));

  const total = (liste: readonly { readonly montant: Euros }[]): Euros =>
    euros(liste.reduce((s, x) => s + x.montant, 0));

  return {
    entrees: {
      encaisse: total(encaisseesDuMois),
      enAttente: total(enAttente.map((f) => f.recette)),
      lignes: [
        ...encaisseesDuMois.map((r) => ({
          id: r.id,
          libelle: r.clientNom !== '' ? r.clientNom : r.libelle,
          montant: r.montant,
          date: r.encaisseeLe,
          regle: true
        })),
        ...enAttente.map(({ recette: r, statut }) => ({
          id: r.id,
          libelle: r.clientNom !== '' ? r.clientNom : r.libelle,
          montant: r.montant,
          date: r.emiseLe,
          regle: false,
          enRetard: statut === 'en_retard'
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
      // Les payées du mois, puis tout ce qui reste à payer d'ici la fin du
      // mois, retards des mois passés compris : voir `echeancesAPayer`.
      lignes: [
        ...echeancesDuMois.filter(estPayee).map((e) => ({
          id: e.id,
          libelle: LIBELLE_NATURE[e.nature],
          montant: e.montant,
          date: e.echeanceLe,
          regle: true
        })),
        ...echeancesAPayer(echeances, aujourdhui, m).maintenant.map((e) => ({
          id: e.id,
          libelle: LIBELLE_NATURE[e.nature],
          montant: e.montant,
          date: e.echeanceLe,
          regle: false,
          enRetard: e.enRetard
        }))
      ]
    },
    remuneration: {
      versable: etat.tresorerie.versable,
      provisions: etat.tresorerie.provisions,
      // Les deux parts que lit le versable, et rien d'autre : la même règle
      // que `impotRevenuAProvisionner`, sur l'état déjà calculé.
      impotAMettreDeCote: (() => {
        const parts = [etat.provisionImpotRevenu, etat.soldeImpotPrecedent]
          .map(resteAProvisionnerDe)
          .filter((r): r is Resolution<Euros> => r !== undefined && r.statut !== 'refuse');
        const total = parts.reduce((t, r) => t + (r.statut === 'refuse' ? 0 : r.valeur), 0);
        return total > 0 ? euros(total) : null;
      })()
    }
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   Écran Activité
   ───────────────────────────────────────────────────────────────────────── */


/**
 * La date du jour, au format ISO, dans le fuseau de l'utilisateur.
 *
 * Elle passait par `toISOString`, donc par l'heure UTC, quand `moisCourant` lit
 * l'heure locale. Le 1er janvier à 0 h 30 à Paris, l'application était en
 * janvier et datée du 31 décembre : une facture émise ou annulée à ce
 * moment-là tombait dans l'année précédente — chiffre d'affaires, seuils,
 * numérotation. Le jour est celui du calendrier de la personne, pas de
 * Greenwich.
 */
export function dateDuJour(maintenant: Date = new Date()): DateISO {
  const mm = String(maintenant.getMonth() + 1).padStart(2, '0');
  const jj = String(maintenant.getDate()).padStart(2, '0');
  return `${maintenant.getFullYear()}-${mm}-${jj}` as DateISO;
}
