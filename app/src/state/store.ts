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
import { type DateISO, type Euros, type Ratio, euros, ratio } from '../domain/types';
import {
  CLE_AVANT_REMPLACEMENT, CLE_STOCKAGE, PART_GARDEE_MAX, type Entreprise,
  VERSION_SCHEMA, type Faits, completerFaitsCourants, faitsVides, motifRefusFaits
} from './schema';
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
  + 'Télécharge une sauvegarde depuis Config → Données & export, puis libère de l’espace.';

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
    readonly impositionCommune?: boolean | null;
  }) => void;

  /* Les écritures des PÉRIODES DÉCLARÉES et des ÉCHÉANCES ont migré dans
     `ecritures.echeances`, celles des DÉPENSES et du RELEVÉ dans
     `ecritures.achats` : aucune n'est déclenchable depuis le Pilote, et le
     code d'entrée dépassait son budget au lot 2. */

  /* ── Compte distant ───────────────────────────────────────────────────── */

  /**
   * Remplace les faits par ceux d'un bundle distant.
   *
   * Écrase l'état local : c'est délibéré, et c'est pourquoi l'écran montre
   * d'abord ce qui serait chargé et demande confirmation. Charger en silence
   * ferait disparaître une saisie faite hors ligne sans que personne le voie.
   */
  readonly remplacerParBundle: (bundle: Readonly<Record<string, unknown>>) => Promise<string | null>;

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

  /* Les écritures d'ACTIVITÉ — congés, notes de CRA, planning, missions — et
     celles du BARÈME saisi ont migré dans `ecritures.activite`. */

  /* ── Profil et barème ─────────────────────────────────────────────────── */

  readonly modifierEntreprise: (modification: Partial<Entreprise>) => void;

  /* Les écritures du LIVRE DES RECETTES — émettre, envoyer, encaisser,
     relancer, annuler, supprimer un brouillon, joindre une pièce — ont migré
     dans `ecritures.recettes` : aucune n'est déclenchable depuis le Pilote, et
     elles emportaient la numérotation dans le paquet d'entrée. */

  /* ── Carnet : clients et missions ─────────────────────────────────────── */

  /* Les écritures du CARNET — ajout, modification, suppression d'un client,
     suppression d'une mission — ont migré dans `ecritures.carnet` : leurs
     gardes emportaient `calculs/carnet` dans le paquet d'entrée pour un écran
     chargé à la demande. Elles n'ont pas changé, seulement de fichier. */

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

/**
 * Garde une copie de l'état local avant de le remplacer en entier.
 *
 * Restaurer une sauvegarde, charger le compte, reprendre l'ancienne
 * application : trois gestes qui ÉCRASENT tout, précédés d'un aperçu de ce
 * qui arrive mais d'aucune copie de ce qui part. Un mauvais fichier choisi, et
 * la saisie du jour était irrécupérable.
 *
 * Une seule copie, la dernière : c'est un « annuler », pas un historique.
 * Rien n'est copié quand l'état actuel est vide — sinon remplir un appareil
 * neuf effacerait la copie utile d'avant. Et si la copie ne peut pas s'écrire
 * (stockage plein), le remplacement est REFUSÉ : c'est le seul moment où l'on
 * peut encore choisir de télécharger une sauvegarde d'abord.
 */
function garderInstantane(): string | null {
  const s = stockageActif;
  const brut = s?.getItem(CLE_STOCKAGE) ?? null;
  const f = useFaits.getState().faits;
  if (s === null || brut === null
    || f.recettes.length + f.depenses.length + f.clients.length + f.missions.length === 0) {
    return null;
  }
  try {
    s.setItem(CLE_AVANT_REMPLACEMENT, JSON.stringify({ le: new Date().toISOString(), brut }));
    return null;
  } catch {
    return 'Impossible de mettre de côté tes données actuelles avant de les remplacer '
      + '(stockage plein). Télécharge d’abord une sauvegarde depuis Config → Données & export.';
  }
}

/** La copie prise avant le dernier remplacement, si elle existe et se lit. */
export function instantaneAvantRemplacement(): { readonly le: string; readonly brut: string } | null {
  try {
    const o = JSON.parse(stockageActif?.getItem(CLE_AVANT_REMPLACEMENT) ?? 'null') as
      { le?: unknown; brut?: unknown } | null;
    return typeof o?.le === 'string' && typeof o.brut === 'string' ? { le: o.le, brut: o.brut } : null;
  } catch {
    return null;
  }
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

  remplacerParBundle: async (bundle) => {
    // Le convertisseur est chargé à la demande : restaurer une sauvegarde de
    // l'ancienne application est un geste rare, et son code n'a rien à faire
    // dans le paquet d'entrée.
    const { convertirBundle } = await import('../infra/migration.legacy');
    const refus = garderInstantane();
    if (refus !== null) return refus;
    const faits = convertirBundle(bundle).faits;
    set({ faits });
    persister(stockageActif, faits);
    return null;
  },

  adopterFaitsDistants: async (brut) => {
    const motif = motifRefusFaits(brut);
    if (motif !== null) return motif;
    const refus = garderInstantane();
    if (refus !== null) return refus;
    // Chargé à la demande : voir le commentaire de la déclaration ci-dessus.
    const { completerFaits } = await import('./schema.migrations');
    const faits = completerFaits(brut);
    set({ faits });
    persister(stockageActif, faits);
    return null;
  },

  modifierEntreprise: (modification) => {
    const actuel = get().faits;
    const faits: Faits = { ...actuel, entreprise: { ...actuel.entreprise, ...modification } };
    set({ faits });
    persister(stockageActif, faits);
  }
}));
