/**
 * Magasin des faits.
 *
 * Deux règles, qui sont des invariants du projet et non des préférences :
 *
 *  1. **Seuls les faits sont stockés.** Aucun dérivé — ni `dispo`, ni
 *     `versable`, ni provisions, ni total de recettes. L'ancienne application
 *     stockait des valeurs calculées à côté des faits qui les produisaient, ce
 *     qui garantit qu'elles divergent : c'est l'origine des trois totaux
 *     différents pour les mêmes recettes relevés par l'audit.
 *  2. **Un seul écrivain par fait.** La réserve, en particulier, a une seule
 *     source (décision D4), là où l'ancienne version en avait trois
 *     concurrentes.
 *
 * Les valeurs dérivées vivent dans `selecteurs.ts`, qui lit ce magasin et
 * appelle le domaine. Elles ne sont jamais persistées.
 */

import { create } from 'zustand';
import { type DateISO, type Euros, type Mois, type Ratio, euros, ratio } from '../domain/types';
import {
  CLE_STOCKAGE, PART_GARDEE_MAX, type Depense, type Entreprise,
  VERSION_SCHEMA, type Faits, type Mission, completerFaitsCourants, faitsVides, motifRefusFaits
} from './schema';
import type { MotifSansContrepartie } from '../domain/calculs/banque';
import {
  PERIODES_URSSAF, type PeriodeBareme, fusionnerPeriodes, validerAjout
} from '../domain/bareme/urssaf';
import type { EtatRapprochement } from '../domain/calculs/depenses';
import type { Echeance } from '../domain/calculs/provisions';
import type { AjustementJour } from '../domain/calculs/planning';
import { type ResultatMigration, type Stockage, migrer } from '../infra/migration';

/**
 * Le stockage du navigateur, `null` quand il est indisponible — et s'il est
 * PLEIN.
 *
 * On lit avant d'essayer d'écrire. L'ancienne détection ne faisait qu'une
 * écriture d'essai : un stockage plein la faisait échouer, et l'application
 * partait VIDE avec le message « navigation privée », alors que les données
 * étaient intactes et lisibles. Plein se lit, et se dit autrement.
 */
function stockageNavigateur(): { readonly stockage: Stockage | null; readonly plein: boolean } {
  let ls: Storage;
  try {
    // L'accès seul peut lever en navigation privée ou stockage bloqué.
    ls = window.localStorage;
    ls.getItem(CLE_STOCKAGE);
  } catch {
    return { stockage: null, plein: false };
  }
  try {
    const test = '__freel_test__';
    ls.setItem(test, '1');
    ls.removeItem(test);
    return { stockage: ls, plein: false };
  } catch {
    return { stockage: ls, plein: true };
  }
}

const MOTIF_PLEIN = 'Le stockage du navigateur est plein (ou bloqué en écriture) : '
  + 'tes données s’affichent, mais tes dernières saisies ne sont plus enregistrées. '
  + 'Télécharge une sauvegarde depuis Réglages → Données, puis libère de l’espace.';

export type EtatChargement =
  | { readonly phase: 'initial' }
  | { readonly phase: 'pret'; readonly migrationEffectuee: boolean }
  /**
   * Le stockage est indisponible ou la migration a refusé d'écrire. On
   * fonctionne en mémoire : l'utilisateur peut consulter et saisir, mais rien
   * n'est conservé — et il doit le savoir, plutôt que de perdre son travail en
   * fermant l'onglet.
   */
  | { readonly phase: 'sans-persistance'; readonly motif: string };

interface MagasinFaits {
  readonly faits: Faits;
  readonly chargement: EtatChargement;
  /**
   * Saisies écartées parce qu'un autre onglet avait écrit entre-temps. Un
   * compteur et non un booléen : chaque écart doit pouvoir se signaler, même
   * deux de suite.
   */
  readonly saisiesEcartees: number;

  /** Charge depuis le stockage, en migrant l'ancien format si nécessaire. */
  readonly initialiser: (stockage?: Stockage | null) => void;

  /** Seul écrivain du seuil de sécurité — le fait s'appelle `reserve` (D4). */
  readonly definirReserve: (montant: Euros) => void;
  /**
   * Seul écrivain de la part gardée au versement.
   *
   * Le bornage est ICI et non dans l'écran : un curseur borné côté interface
   * laisse passer tout ce qui n'est pas saisi au curseur — un import, un compte
   * distant, un jeu de démonstration. Une part supérieure à 1 rendrait
   * `versable × (1 − part)` négatif, c'est-à-dire un versement proposé à
   * l'envers.
   */
  readonly definirPartGardee: (part: Ratio) => void;
  readonly definirBesoinMensuel: (montant: Euros) => void;
  readonly definirSoldeInitial: (montant: Euros) => void;
  /**
   * Seul écrivain de la date à laquelle `soldeInitial` était vrai.
   *
   * `null` efface la date — c'est un retour délibéré à l'abstention
   * (`ProvenanceSolde['sansDate']`), pas une valeur à combler ailleurs : si le
   * montant a changé sans qu'on sache depuis quand, redater serait mentir.
   */
  readonly definirSoldeInitialAu: (date: DateISO | null) => void;
  /** `null` efface l'objectif ; c'est autre chose que de le mettre à zéro. */
  readonly definirObjectifCaAnnuel: (montant: Euros | null) => void;
  /**
   * Les faits du foyer fiscal, un à la fois.
   *
   * `null` est une valeur légitime et distincte de zéro : « je n'ai pas
   * renseigné mes parts » n'est pas « j'en ai zéro ». L'action l'accepte donc
   * telle quelle, et n'a pas le droit de la remplacer par un défaut — c'est
   * cette absence qui fait REFUSER la provision d'impôt, donc qui la rend
   * visible.
   */
  readonly definirFoyerFiscal: (modification: {
    readonly partsFiscales?: number | null;
    readonly autresRevenusFoyer?: Euros | null;
    readonly versementPerDeductible?: Euros | null;
  }) => void;

  /**
   * Marque une période comme déclarée. C'est ce fait qui fait basculer la
   * dette du volet « à provisionner » vers le volet « constaté » — sans lui,
   * les provisions surestiment la dette (voir `calculs/provisions.ts`).
   */
  readonly marquerPeriodeDeclaree: (m: Mois) => void;
  readonly annulerPeriodeDeclaree: (m: Mois) => void;

  /* ── Dépenses ─────────────────────────────────────────────────────────── */

  /**
   * Ajoute une dépense. L'identifiant est attribué ici, jamais par l'écran :
   * deux écrans qui les fabriqueraient chacun de leur côté finiraient par en
   * produire deux identiques.
   */
  /* ── Échéances émises ─────────────────────────────────────────────────── */

  /**
   * Enregistre une échéance reçue : appel de cotisations, avis d'impôt, CFE.
   *
   * C'est un FAIT — elle existe parce qu'un appel est arrivé. Elle ne se
   * calcule pas : le volet 2 des provisions estime la dette pas encore
   * appelée, ce volet-ci porte ce qui l'a été.
   */
  /**
   * Enregistre une ou plusieurs échéances d'un seul geste.
   *
   * ───────────────────────────────────────────────────────────────────────
   * IL N'Y A PLUS DE VERSION AU SINGULIER, ET C'EST DÉLIBÉRÉ
   * ───────────────────────────────────────────────────────────────────────
   *
   * `ajouterEcheance` a existé. `verifier:cablage` l'a trouvée morte : l'écran
   * des échéances passe toujours par ici, y compris pour une seule. Deux
   * chemins pour le même fait finissent par diverger — l'un persiste, l'autre
   * oublie — et le second n'est jamais testé puisque personne ne l'emprunte.
   *
   * Une commodité de SAISIE, pas un nouveau fait : elle crée N échéances
   * ordinaires et s'efface. Chacune reste ensuite corrigeable, supprimable et
   * marquable payée indépendamment — parce que c'est ce qui va arriver : un
   * trimestre régularisé, un taux qui change, un mois reporté.
   *
   * Une seule écriture pour toute la série : N écritures séparées
   * persisteraient N fois, et une interruption au milieu laisserait un
   * échéancier à moitié saisi.
   */
  readonly ajouterEcheances: (saisies: readonly Omit<Echeance, 'id'>[]) => number;
  readonly modifierEcheance: (
    id: string, modification: Partial<Omit<Echeance, 'id'>>
  ) => void;
  readonly supprimerEcheance: (id: string) => void;
  /**
   * Enregistre le paiement d'une échéance — ou l'annule avec `null`.
   *
   * La DATE est exigée, pas un booléen : c'est elle qui permet de rapprocher
   * le paiement du relevé, de savoir de quel mois la sortie relève, et de
   * constater après coup un règlement en retard. Exiger une date pour
   * encaisser une recette et se contenter d'une case pour une échéance serait
   * incohérent.
   *
   * `montantPaye` recueille l'écart quand ce qui est parti diffère de ce qui
   * était appelé — régularisation, changement de taux, majoration. `null`
   * quand les deux coïncident.
   *
   * Payée, l'échéance sort des provisions : le solde bancaire la reflète déjà.
   */
  readonly enregistrerPaiement: (
    id: string, payeeLe: DateISO | null, montantPaye: Euros | null
  ) => void;

  readonly ajouterDepense: (saisie: Omit<Depense, 'id'>) => string;
  readonly modifierDepense: (id: string, modification: Partial<Omit<Depense, 'id'>>) => void;
  readonly supprimerDepense: (id: string) => void;

  /**
   * Rattache une pièce à une dépense — ou la détache avec `null`.
   *
   * C'est la seule action qui rend une TVA récupérable, et c'est voulu :
   * l'invariant « pas de TVA récupérable sans pièce » n'est pas contournable
   * par une autre porte.
   */
  readonly attacherJustificatif: (id: string, justificatifId: string | null) => void;

  /** Corrige l'état de rapprochement d'une dépense. */
  readonly definirRapprochement: (id: string, etat: EtatRapprochement) => void;

  /* ── Relevé bancaire ──────────────────────────────────────────────────── */

  /* `importerReleve` a migré dans `ecritures.carnet` : elle emportait
     `calculs/banque` dans le paquet d'entrée pour un écran chargé à la
     demande. Voir l'en-tête de ce module. */

  /**
   * Rattache un mouvement à une écriture — ou le détache avec `null`.
   *
   * L'appariement est une décision de l'utilisateur, jamais une déduction :
   * l'ancienne application appariait seule et n'en laissait aucune trace.
   */
  readonly rapprocherMouvement: (mouvementId: string, ecritureId: string | null) => void;

  /**
   * Déclare qu'aucune écriture ne correspond, et POURQUOI.
   *
   * `remuneration` pour un virement qu'on s'est versé, `autre` pour des frais
   * bancaires ou un remboursement, `null` pour remettre le mouvement dans la
   * file « à traiter ».
   *
   * Le motif ne change aucun total : le virement figure déjà au relevé et le
   * solde le reflète déjà. Il permet seulement de répondre à « combien me
   * suis-je versé ce mois-ci » — que rien ne savait dire.
   */
  readonly marquerSansContrepartie: (
    mouvementId: string, motif: MotifSansContrepartie | null
  ) => void;

  /** Efface tous les mouvements importés. Ne touche à aucune écriture. */
  readonly viderReleve: () => void;

  /* ── Compte distant ───────────────────────────────────────────────────── */

  /**
   * Remplace les faits par ceux d'un bundle distant.
   *
   * Écrase l'état local : c'est délibéré, et c'est pourquoi l'écran montre
   * d'abord ce qui serait chargé et demande confirmation. Charger en silence
   * ferait disparaître une saisie faite hors ligne sans que personne le voie.
   */
  readonly remplacerParBundle: (bundle: Readonly<Record<string, unknown>>) => Promise<void>;

  /**
   * Remplace les faits par un bloc venu du compte distant.
   *
   * Contrairement à `remplacerParBundle`, qui convertit la structure de
   * l'ancienne application, ce bloc est DÉJÀ au format de celle-ci — il a été
   * écrit par elle, depuis un autre appareil. Il est validé avant d'entrer :
   * un bloc écrit par une version plus récente est refusé, plutôt que rogné
   * des champs que ce code ne connaît pas.
   *
   * Rend le motif du refus, ou `null` si l'adoption a eu lieu.
   *
   * ASYNCHRONE : la conversion (`completerFaits`) vit dans
   * `schema.migrations.ts`, chargé à la demande. L'importer statiquement ici
   * ramènerait tout le module de migrations dans le paquet d'entrée pour une
   * action que seul l'écran Compte déclenche — voir son en-tête.
   */
  readonly adopterFaitsDistants: (brut: unknown) => Promise<string | null>;

  /* ── Congés ───────────────────────────────────────────────────────────── */

  /*
   * `basculerConge` a été RETIRÉE, et c'est la règle d'une source unique.
   *
   * Elle posait ou retirait un jour entier, et n'avait qu'un appelant : le
   * calendrier de la carte « Congés du mois ». Cette carte a disparu — le plan
   * de charge pose désormais les congés lui-même, à la demi-journée, par
   * `poserPlageDeConges`. Garder les deux aurait laissé deux écritures
   * concurrentes sur la même notion, dont l'une arrondit à la journée.
   */
  /** Pose ou retire une plage entière, sans jamais dupliquer une date déjà posée. */
  /**
   * Pose ou retire une plage de congés.
   *
   * `quotite` vaut 1 par défaut — la journée entière est le cas courant. La
   * demi-journée existe parce que l'ancienne application la gère depuis
   * longtemps, et qu'un solde de congés qui compte 0,5 pour 1 est faux.
   */
  readonly poserPlageDeConges: (
    jours: readonly DateISO[], pose: boolean, quotite?: number
  ) => void;

  /**
   * Écrit la phrase de tâches accomplies d'une semaine, sur un CRA.
   *
   * Une phrase VIDE efface la note au lieu d'en enregistrer une sans contenu :
   * une liste qui accumulerait des chaînes vides ferait grossir le compte
   * distant à chaque frappe corrigée, et rendrait « y a-t-il une note ? »
   * indécidable sans inspecter le texte.
   */
  readonly noterSemaineCra: (
    semaine: DateISO, destinataire: string, texte: string
  ) => void;

  /* ── Planning ─────────────────────────────────────────────────────────── */

  /**
   * Pose l'ajustement d'une journée, pour un client opérationnel.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * UN SEUL ÉCRIVAIN POUR UN SEUL CHAMP
   * ─────────────────────────────────────────────────────────────────────────
   *
   * `ajusterJour` l'a précédée : elle n'écrivait qu'une quotité et FUSIONNAIT
   * avec les créneaux déjà posés. C'était le bon comportement pour corriger
   * « 1 j » en « 0,5 j », et le mauvais pour un clic qui DÉPLACE la
   * demi-journée du matin vers l'après-midi — les créneaux d'avant survivaient
   * au geste qui visait justement à les changer.
   *
   * Les deux ont coexisté le temps d'un lot, et c'est exactement la
   * configuration que l'invariant n°4 interdit : deux façons d'écrire le même
   * champ finissent par ne pas tomber d'accord. `poserAjustement` REMPLACE, et
   * l'appelant lui donne la journée entière — c'est au domaine de dire ce
   * qu'elle devient, pas au magasin de le deviner.
   *
   * `null` EFFACE l'ajustement : la journée redevient ce que le rythme prévoit.
   * C'est un état distinct de « zéro », qui déclare au contraire « ce jour
   * prévu, je n'ai pas travaillé ». Les confondre rendrait impossible de
   * revenir au rythme après une correction.
   */
  readonly poserAjustement: (
    missionId: string, entiteId: string, date: DateISO, pose: AjustementJour | null
  ) => void;

  /**
   * Efface les ajustements posés sur une plage de dates, toutes missions et
   * tous clients opérationnels confondus.
   *
   * Les journées y redeviennent ce que le RYTHME prévoit — ce n'est pas les
   * mettre à zéro, c'est retirer la correction. Une semaine corrigée par
   * erreur, ou un rythme changé après coup, se rattrape en un geste au lieu de
   * sept.
   *
   * Rend le nombre d'ajustements retirés, pour que l'écran puisse le dire.
   */
  readonly retirerAjustements: (dates: readonly DateISO[]) => number;

  /* ── Profil et barème ─────────────────────────────────────────────────── */

  readonly modifierEntreprise: (modification: Partial<Entreprise>) => void;

  /**
   * Ajoute une période de barème URSSAF.
   *
   * Rend le motif du refus, ou `null` si l'ajout a été enregistré. Le contrôle
   * vit dans le domaine (`validerAjout`) : un écran ne doit pas pouvoir
   * réécrire un barème passé, sous peine de faire diverger l'application des
   * déclarations déjà envoyées.
   */
  readonly ajouterPeriodeUrssaf: (periode: PeriodeBareme) => string | null;
  readonly retirerPeriodeUrssaf: (du: Mois) => void;

  /* Les écritures du LIVRE DES RECETTES — émettre, envoyer, encaisser,
     relancer, annuler, supprimer un brouillon, joindre une pièce — ont migré
     dans `ecritures.recettes` : aucune n'est déclenchable depuis le Pilote, et
     elles emportaient la numérotation dans le paquet d'entrée. */

  /* ── Carnet : clients et missions ─────────────────────────────────────── */

  /* Les écritures du CARNET — ajout, modification, suppression d'un client,
     suppression d'une mission — ont migré dans `ecritures.carnet` : leurs
     gardes emportaient `calculs/carnet` dans le paquet d'entrée pour un écran
     chargé à la demande. Elles n'ont pas changé, seulement de fichier. */

  readonly ajouterMission: (saisie: Omit<Mission, 'id'>) => string;
  readonly modifierMission: (
    id: string, modification: Partial<Omit<Mission, 'id'>>
  ) => void;
}

/**
 * Pose un état de faits ET le persiste, en une seule opération.
 *
 * Exportée pour `ecritures.carnet`, qui porte les écritures sorties du
 * magasin pour ne plus peser sur le premier rendu (voir son en-tête). C'est
 * la SEULE porte vers le disque : une écriture qui appellerait `setState`
 * sans elle laisserait l'état en mémoire et le compte inchangé au rechargement
 * — le pire des deux mondes, puisque tout aurait eu l'air de marcher.
 */
export function ecrireFaits(faits: Faits): void {
  useFaits.setState({ faits });
  persister(stockageActif, faits);
}

/**
 * Persistance — et les deux façons dont elle perdait des données sans le dire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN ÉCHEC D'ÉCRITURE EN COURS DE SESSION ÉTAIT AVALÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le commentaire d'origine disait l'utilisateur « déjà averti par
 * `chargement` » : vrai au démarrage seulement. Un quota atteint en cours de
 * session laissait l'écran dire que tout allait bien, et tout ce qu'on
 * saisissait ensuite disparaissait à la fermeture de l'onglet. L'échec passe
 * désormais en « sans persistance » au premier coup, et une écriture qui
 * réussit à nouveau — l'espace a été libéré — lève l'alerte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX ONGLETS : LE DERNIER QUI ÉCRIVAIT EFFAÇAIT L'AUTRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chaque écriture réécrit l'état complet. L'onglet B ajoutait une recette,
 * l'onglet A ajoutait ensuite une dépense sur son état d'avant : la recette
 * disparaissait. Pire, la numérotation se calculait sur l'état en mémoire, et
 * deux onglets pouvaient émettre deux factures du même numéro.
 *
 * Deux défenses. L'écoute de l'événement `storage` tient chaque onglet à jour
 * de ce que l'autre écrit (voir `initialiser`). Et avant d'écrire, on vérifie
 * que le disque porte encore ce que cet onglet y a lu ou écrit en dernier : si
 * ce n'est plus le cas, l'autre onglet l'emporte, cet onglet se recharge, et
 * la saisie écartée est SIGNALÉE (`saisiesEcartees`). Perdre une saisie qu'on
 * voit est réparable ; effacer en silence celle d'un autre onglet ne l'est pas.
 */
function persister(stockage: Stockage | null, faits: Faits): void {
  if (!stockage) return;
  try {
    const surLeDisque = stockage.getItem(CLE_STOCKAGE);
    if (surLeDisque !== null && dernierConnu !== undefined && surLeDisque !== dernierConnu) {
      reprendreDuDisque(surLeDisque);
      useFaits.setState((e) => ({ saisiesEcartees: e.saisiesEcartees + 1 }));
      return;
    }
    const contenu = JSON.stringify(faits);
    stockage.setItem(CLE_STOCKAGE, contenu);
    dernierConnu = contenu;
    if (ecritureEnEchec) {
      ecritureEnEchec = false;
      useFaits.setState({ chargement: { phase: 'pret', migrationEffectuee: false } });
    }
  } catch {
    // L'état en mémoire reste juste ; seule la conservation échoue — et cela
    // se dit, sur tous les écrans.
    ecritureEnEchec = true;
    useFaits.setState({ chargement: { phase: 'sans-persistance', motif: MOTIF_PLEIN } });
  }
}

/**
 * Adopte ce qu'un autre onglet a écrit.
 *
 * Seulement s'il est lisible ET au schéma courant. Un bloc d'un schéma
 * postérieur veut dire qu'une version plus récente de l'application tourne à
 * côté : continuer à écrire depuis celle-ci raboterait ses champs. Cet onglet
 * cesse donc d'écrire et demande à être rechargé.
 */
function reprendreDuDisque(brut: string): void {
  let bloc: unknown;
  try { bloc = JSON.parse(brut); } catch { bloc = null; }
  const lisible = motifRefusFaits(bloc) === null
    && (bloc as { version?: unknown }).version === VERSION_SCHEMA;
  if (!lisible) {
    stockageActif = null;
    useFaits.setState({
      chargement: {
        phase: 'sans-persistance',
        motif: 'Une autre fenêtre de l’application a enregistré des données que cette '
          + 'page ne sait pas lire, sans doute une version plus récente. Recharge cette '
          + 'page : rien de ce qui est enregistré n’a été touché.'
      }
    });
    return;
  }
  dernierConnu = brut;
  useFaits.setState({ faits: completerFaitsCourants(bloc as Record<string, unknown>) });
}

let stockageActif: Stockage | null = null;
/**
 * Ce que cet onglet sait être sur le disque : lu au démarrage, ou écrit par
 * lui. `undefined` tant qu'aucune lecture n'a eu lieu — rien à comparer.
 */
let dernierConnu: string | null | undefined;
let ecritureEnEchec = false;
let ecouteOnglets = false;

/** Porte le résultat d'une migration dans le magasin. Partagée par les deux chemins. */
function appliquerMigration(
  set: (partiel: Partial<MagasinFaits>) => void,
  resultat: ResultatMigration
): void {
  dernierConnu = stockageActif?.getItem(CLE_STOCKAGE) ?? null;
  switch (resultat.statut) {
    case 'migre':
      set({ faits: resultat.faits, chargement: { phase: 'pret', migrationEffectuee: true } });
      break;
    case 'deja-migre':
    case 'rien-a-migrer':
      set({ faits: resultat.faits, chargement: { phase: 'pret', migrationEffectuee: false } });
      break;
    case 'reprise-requise':
    case 'migration-requise':
      // Ne peut pas arriver : l'appelant intercepte les deux avant. Le
      // compilateur exige néanmoins que le cas soit couvert, et c'est tant
      // mieux.
      break;
    case 'echec':
      // On ne repart PAS de zéro : écraser des données qu'on n'a pas su lire
      // serait la pire issue possible. On fonctionne sans persistance et on
      // le dit.
      stockageActif = null;
      set({
        faits: faitsVides(),
        chargement: { phase: 'sans-persistance', motif: resultat.motif }
      });
      return;
  }
  // Un stockage plein au démarrage : les données se lisent, l'alerte reste.
  if (ecritureEnEchec) set({ chargement: { phase: 'sans-persistance', motif: MOTIF_PLEIN } });
}

export const useFaits = create<MagasinFaits>((set, get) => ({
  faits: faitsVides(),
  chargement: { phase: 'initial' },
  saisiesEcartees: 0,

  initialiser: (stockage) => {
    const navigateur = stockage === undefined ? stockageNavigateur() : null;
    const s = navigateur === null ? (stockage ?? null) : navigateur.stockage;
    stockageActif = s;
    dernierConnu = undefined;
    ecritureEnEchec = navigateur?.plein ?? false;

    // Ce qu'un autre onglet écrit arrive ici ; jamais ce que celui-ci écrit
    // lui-même (le navigateur ne renvoie pas l'événement à son auteur).
    if (s !== null && !ecouteOnglets && typeof window !== 'undefined') {
      ecouteOnglets = true;
      window.addEventListener('storage', (e) => {
        if (e.key === CLE_STOCKAGE && e.newValue !== null && stockageActif !== null
          && e.storageArea === stockageActif) {
          reprendreDuDisque(e.newValue);
        }
      });
    }

    if (!s) {
      set({
        chargement: {
          phase: 'sans-persistance',
          motif: 'Le stockage du navigateur est indisponible (navigation privée '
            + 'ou stockage bloqué). Tes saisies ne seront pas conservées.'
        }
      });
      return;
    }

    const resultat = migrer(s);

    /**
     * Le cas de la reprise, et pourquoi il est asynchrone.
     *
     * Le convertisseur de l'ancienne application ne sert qu'une fois, et
     * jamais à qui n'a pas connu la version précédente. Il vit donc dans un
     * module chargé à la demande (`migration.legacy`), et seulement ici.
     *
     * L'attente n'est pas invisible et c'est très bien ainsi : l'écran reste
     * en phase « initial » le temps du chargement, plutôt que d'afficher un
     * état vide qu'on remplacerait une seconde plus tard — ce qui aurait donné
     * à voir « 0 € » à quelqu'un qui a trois ans d'activité.
     */
    if (resultat.statut === 'reprise-requise') {
      void import('../infra/migration.legacy')
        .then(({ reprendreLegacy }) => { appliquerMigration(set, reprendreLegacy(s)); })
        .catch(() => {
          stockageActif = null;
          set({
            faits: faitsVides(),
            chargement: {
              phase: 'sans-persistance',
              motif: 'La reprise des données de l\'ancienne version n\'a pas pu être '
                + 'chargée. Tes anciennes données sont intactes ; réessaie en '
                + 'rechargeant la page.'
            }
          });
        });
      return;
    }

    /**
     * Même motif que la reprise ci-dessus, pour un compte d'un schéma
     * antérieur de CETTE application plutôt que de l'ancienne version : les
     * fonctions de `schema.migrations.ts` ne servent qu'au passage d'un
     * schéma à l'autre, jamais à un compte déjà courant — la quasi-totalité
     * des ouvertures. Les embarquer dans le paquet d'entrée les ferait
     * télécharger par tout le monde pour ne les exécuter presque jamais.
     *
     * `migrationEffectuee` reste à `false` : cette bannière-là ne dit
     * « données reprises de l'ancienne version » que pour la reprise
     * ci-dessus, jamais pour une simple mise à jour de schéma interne.
     */
    if (resultat.statut === 'migration-requise') {
      void import('./schema.migrations')
        .then(({ completerFaits }) => {
          appliquerMigration(set, { statut: 'deja-migre', faits: completerFaits(resultat.brut) });
        })
        .catch(() => {
          stockageActif = null;
          set({
            faits: faitsVides(),
            chargement: {
              phase: 'sans-persistance',
              motif: 'Les migrations de schéma n\'ont pas pu être chargées. Tes données '
                + 'sont intactes ; réessaie en rechargeant la page.'
            }
          });
        });
      return;
    }

    appliquerMigration(set, resultat);
  },

  definirReserve: (montant) => {
    const faits: Faits = { ...get().faits, reserve: euros(Math.max(0, montant)) };
    set({ faits });
    persister(stockageActif, faits);
  },

  definirPartGardee: (part) => {
    // `NaN` retombe à zéro plutôt qu'à la borne haute : une saisie illisible
    // ne doit pas se traduire par « je garde tout », qui est une décision.
    const borne = Number.isFinite(part)
      ? Math.min(PART_GARDEE_MAX, Math.max(0, part))
      : 0;
    const faits: Faits = { ...get().faits, partGardeeAuVersement: ratio(borne) };
    set({ faits });
    persister(stockageActif, faits);
  },

  definirBesoinMensuel: (montant) => {
    const faits: Faits = { ...get().faits, besoinMensuel: euros(Math.max(0, montant)) };
    set({ faits });
    persister(stockageActif, faits);
  },

  definirSoldeInitial: (montant) => {
    const faits: Faits = { ...get().faits, soldeInitial: euros(montant) };
    set({ faits });
    persister(stockageActif, faits);
  },

  definirSoldeInitialAu: (date) => {
    const faits: Faits = { ...get().faits, soldeInitialAu: date };
    set({ faits });
    persister(stockageActif, faits);
  },

  /**
   * Un objectif négatif n'existe pas, mais on ne le remonte pas à zéro pour
   * autant : zéro serait un objectif fixé, et l'écran l'afficherait. Une
   * saisie absurde efface donc l'objectif au lieu d'en inventer un.
   */
  definirObjectifCaAnnuel: (montant) => {
    const objectif = montant === null || montant <= 0 ? null : euros(montant);
    const faits: Faits = { ...get().faits, objectifCaAnnuel: objectif };
    set({ faits });
    persister(stockageActif, faits);
  },

  definirFoyerFiscal: (modification) => {
    const faits: Faits = { ...get().faits, ...modification };
    set({ faits });
    persister(stockageActif, faits);
  },

  marquerPeriodeDeclaree: (m) => {
    const actuel = get().faits;
    if (actuel.periodesDeclarees.includes(m)) return; // idempotent
    const faits: Faits = {
      ...actuel,
      periodesDeclarees: [...actuel.periodesDeclarees, m].sort()
    };
    set({ faits });
    persister(stockageActif, faits);
  },

  annulerPeriodeDeclaree: (m) => {
    const actuel = get().faits;
    const faits: Faits = {
      ...actuel,
      periodesDeclarees: actuel.periodesDeclarees.filter((p) => p !== m)
    };
    set({ faits });
    persister(stockageActif, faits);
  },

  ajouterEcheances: (saisies) => {
    if (saisies.length === 0) return 0;
    const actuel = get().faits;
    const base = Date.now();
    const nouvelles = saisies.map((saisie, i) => ({
      ...saisie, id: `ech-${base}-${actuel.echeances.length + i}`
    }));
    const faits: Faits = { ...actuel, echeances: [...actuel.echeances, ...nouvelles] };
    set({ faits });
    persister(stockageActif, faits);
    return nouvelles.length;
  },

  modifierEcheance: (id, modification) => {
    const actuel = get().faits;
    const faits: Faits = {
      ...actuel,
      echeances: actuel.echeances.map((e) => (e.id === id ? { ...e, ...modification } : e))
    };
    set({ faits });
    persister(stockageActif, faits);
  },

  supprimerEcheance: (id) => {
    const actuel = get().faits;
    const faits: Faits = {
      ...actuel, echeances: actuel.echeances.filter((e) => e.id !== id)
    };
    set({ faits });
    persister(stockageActif, faits);
  },

  enregistrerPaiement: (id, payeeLe, montantPaye) => {
    get().modifierEcheance(id, { payeeLe, montantPaye });
  },

  ajouterDepense: (saisie) => {
    const actuel = get().faits;
    const id = identifiantDepense(actuel.depenses);
    const faits: Faits = { ...actuel, depenses: [...actuel.depenses, { ...saisie, id }] };
    set({ faits });
    persister(stockageActif, faits);
    return id;
  },

  modifierDepense: (id, modification) => {
    const actuel = get().faits;
    const faits: Faits = {
      ...actuel,
      // `id` est retiré de la modification par le type : une dépense ne change
      // pas d'identité, sinon les pièces qui la référencent la perdent.
      depenses: actuel.depenses.map((d) => (d.id === id ? { ...d, ...modification } : d))
    };
    set({ faits });
    persister(stockageActif, faits);
  },

  supprimerDepense: (id) => {
    const actuel = get().faits;
    const faits: Faits = { ...actuel, depenses: actuel.depenses.filter((d) => d.id !== id) };
    set({ faits });
    persister(stockageActif, faits);
  },

  attacherJustificatif: (id, justificatifId) => {
    get().modifierDepense(id, { justificatifId });
  },

  definirRapprochement: (id, etat) => {
    get().modifierDepense(id, { rapprochement: etat });
  },

  rapprocherMouvement: (mouvementId, ecritureId) => {
    const actuel = get().faits;
    const faits: Faits = {
      ...actuel,
      mouvementsBancaires: actuel.mouvementsBancaires.map((m) =>
        (m.id === mouvementId
          // Rapprocher lève l'état « sans contrepartie » : les deux se
          // contrediraient, et l'écran devrait alors arbitrer.
          ? { ...m, rapprocheAvec: ecritureId, sansContrepartie: null }
          : m))
    };
    set({ faits });
    persister(stockageActif, faits);
  },

  marquerSansContrepartie: (mouvementId, motif) => {
    const actuel = get().faits;
    const faits: Faits = {
      ...actuel,
      mouvementsBancaires: actuel.mouvementsBancaires.map((m) =>
        (m.id === mouvementId ? { ...m, sansContrepartie: motif, rapprocheAvec: null } : m))
    };
    set({ faits });
    persister(stockageActif, faits);
  },

  ajouterMission: (saisie) => {
    const actuel = get().faits;
    const id = `mis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    // Le client est rattaché par identifiant quand il existe au carnet, tout
    // en conservant son nom : c'est le nom qui porte le rattachement des
    // recettes, et le perdre couperait la mission de son chiffre d'affaires.
    const client = actuel.clients.find((c) => c.nom === saisie.clientNom.trim());
    const mission: Mission = {
      ...saisie,
      id,
      clientNom: saisie.clientNom.trim(),
      clientId: client?.id ?? null
    };
    const faits: Faits = { ...actuel, missions: [...actuel.missions, mission] };
    set({ faits });
    persister(stockageActif, faits);
    return id;
  },

  modifierMission: (id, modification) => {
    const actuel = get().faits;
    const faits: Faits = {
      ...actuel,
      missions: actuel.missions.map((m) => (m.id === id ? { ...m, ...modification } : m))
    };
    set({ faits });
    persister(stockageActif, faits);
  },

  remplacerParBundle: async (bundle) => {
    // Le convertisseur est chargé à la demande : restaurer une sauvegarde de
    // l'ancienne application est un geste rare, et son code n'a rien à faire
    // dans le paquet d'entrée.
    const { convertirBundle } = await import('../infra/migration.legacy');
    const faits = convertirBundle(bundle).faits;
    set({ faits });
    persister(stockageActif, faits);
  },

  adopterFaitsDistants: async (brut) => {
    const motif = motifRefusFaits(brut);
    if (motif !== null) return motif;
    // Chargé à la demande : voir le commentaire de la déclaration ci-dessus.
    const { completerFaits } = await import('./schema.migrations');
    const faits = completerFaits(brut);
    set({ faits });
    persister(stockageActif, faits);
    return null;
  },

  viderReleve: () => {
    const faits: Faits = { ...get().faits, mouvementsBancaires: [] };
    set({ faits });
    persister(stockageActif, faits);
  },

  modifierEntreprise: (modification) => {
    const actuel = get().faits;
    const faits: Faits = { ...actuel, entreprise: { ...actuel.entreprise, ...modification } };
    set({ faits });
    persister(stockageActif, faits);
  },

  ajouterPeriodeUrssaf: (periode) => {
    const actuel = get().faits;
    const effectives = fusionnerPeriodes(PERIODES_URSSAF, actuel.periodesUrssafAjoutees);
    const refus = validerAjout(effectives, periode);
    if (refus !== null) return refus;

    // Une saisie sur un début de période déjà ajouté la remplace, plutôt que
    // d'empiler deux versions dont on ne saurait laquelle fait foi.
    const ajoutees = [
      ...actuel.periodesUrssafAjoutees.filter((p) => p.du !== periode.du),
      periode
    ].sort((a, b) => a.du.localeCompare(b.du));

    const faits: Faits = { ...actuel, periodesUrssafAjoutees: ajoutees };
    set({ faits });
    persister(stockageActif, faits);
    return null;
  },

  retirerPeriodeUrssaf: (du) => {
    const actuel = get().faits;
    const faits: Faits = {
      ...actuel,
      periodesUrssafAjoutees: actuel.periodesUrssafAjoutees.filter((p) => p.du !== du)
    };
    set({ faits });
    persister(stockageActif, faits);
  },

  poserAjustement: (missionId, entiteId, date, pose) => {
    const actuel = get().faits;
    const missions = actuel.missions.map((m) => {
      if (m.id !== missionId) return m;
      // L'ajustement vise UN client opérationnel : deux d'entre eux peuvent
      // travailler le même jour, et corriger l'un ne doit rien changer à
      // l'autre.
      return {
        ...m,
        entites: m.entites.map((e) => {
          if (e.id !== entiteId) return e;
          const ajustements = { ...e.ajustements };
          // Remplacement, et non fusion : le geste vise les créneaux eux-mêmes.
          if (pose === null) delete ajustements[date];
          else ajustements[date] = pose;
          return { ...e, ajustements };
        })
      };
    });
    const faits: Faits = { ...actuel, missions };
    set({ faits });
    persister(stockageActif, faits);
  },

  retirerAjustements: (dates) => {
    const actuel = get().faits;
    const cibles = new Set<string>(dates);
    let retires = 0;

    const missions = actuel.missions.map((m) => ({
      ...m,
      entites: m.entites.map((e) => {
        const ajustements: Record<string, AjustementJour> = {};
        for (const [date, pose] of Object.entries(e.ajustements)) {
          if (cibles.has(date)) { retires += 1; continue; }
          ajustements[date] = pose;
        }
        return { ...e, ajustements };
      })
    }));

    // Rien à retirer : on n'écrit pas. Persister pour rien ferait remonter une
    // version sur le compte distant, et un autre appareil croirait à une
    // modification.
    if (retires === 0) return 0;

    const faits: Faits = { ...actuel, missions };
    set({ faits });
    persister(stockageActif, faits);
    return retires;
  },

  poserPlageDeConges: (jours, pose, quotite = 1) => {
    const actuel = get().faits;
    // Une table par date, puis un tri : poser deux fois la même date ne doit
    // pas créer deux congés, et l'ordre stable rend les comparaisons lisibles.
    const parDate = new Map(actuel.conges.map((c) => [c.date, c]));
    for (const j of jours) {
      if (pose) parDate.set(j, { date: j, quotite });
      else parDate.delete(j);
    }
    const faits: Faits = {
      ...actuel,
      conges: [...parDate.values()].sort((a, b) => a.date.localeCompare(b.date))
    };
    set({ faits });
    persister(stockageActif, faits);
  },

  noterSemaineCra: (semaine, destinataire, texte) => {
    const actuel = get().faits;
    const propre = texte.trim();
    const autres = actuel.notesCra
      .filter((n) => !(n.semaine === semaine && n.destinataire === destinataire));

    // Rien n'a changé : on n'écrit pas. Persister à l'identique ferait monter
    // une version sur le compte distant, et l'autre appareil croirait à une
    // modification qui n'a pas eu lieu — le même motif que pour les congés.
    const avant = actuel.notesCra
      .find((n) => n.semaine === semaine && n.destinataire === destinataire);
    if ((avant?.texte ?? '') === propre) return;

    const notesCra = propre === ''
      ? autres
      : [...autres, { semaine, destinataire, texte: propre }]
        .sort((a, b) => a.semaine.localeCompare(b.semaine)
          || a.destinataire.localeCompare(b.destinataire, 'fr'));

    const faits: Faits = { ...actuel, notesCra };
    set({ faits });
    persister(stockageActif, faits);
  }
}));

/**
 * Identifiant d'une nouvelle dépense.
 *
 * L'horloge seule ne suffit pas : deux ajouts dans la même milliseconde — un
 * import de plusieurs lignes, par exemple — produiraient le même identifiant,
 * et la seconde dépense écraserait la première à la relecture. Le suffixe
 * aléatoire rend la collision négligeable, et le préfixe temporel garde
 * l'ordre de création lisible.
 */
function identifiantDepense(existantes: readonly Depense[]): string {
  const connus = new Set(existantes.map((d) => d.id));
  let id = '';
  do {
    id = `dep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  } while (connus.has(id));
  return id;
}
