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
  CLE_STOCKAGE, PART_GARDEE_MAX, type Client, type Depense, type Entreprise,
  type Faits, type Mission, type Recette, completerFaits, faitsVides, motifRefusFaits
} from './schema';
import {
  nomAPropager, peutSupprimerClient, peutSupprimerMission, validerNomClient
} from '../domain/calculs/carnet';
import type { ModeReglement } from '../domain/calculs/livreRecettes';
import { ecritureDAnnulation, prochainNumero } from '../domain/calculs/ecritureRecette';
import { importerMouvements } from '../domain/calculs/banque';
import type { MotifSansContrepartie } from '../domain/calculs/banque';
import {
  PERIODES_URSSAF, type PeriodeBareme, fusionnerPeriodes, validerAjout
} from '../domain/bareme/urssaf';
import type { EtatRapprochement } from '../domain/calculs/depenses';
import type { Echeance } from '../domain/calculs/provisions';
import { type ResultatMigration, type Stockage, migrer } from '../infra/migration';

/** Le stockage du navigateur, ou `null` quand il est indisponible. */
function stockageNavigateur(): Stockage | null {
  try {
    // L'accès seul peut lever en navigation privée ou stockage bloqué.
    const test = '__freel_test__';
    window.localStorage.setItem(test, '1');
    window.localStorage.removeItem(test);
    return window.localStorage;
  } catch {
    return null;
  }
}

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

  /**
   * Ajoute les opérations d'un relevé.
   *
   * Idempotent : réimporter un relevé qui chevauche le précédent — le cas
   * ordinaire — n'ajoute que ce qui manque et ne double pas le solde. Rend le
   * nombre d'opérations ajoutées et le nombre déjà connues.
   */
  readonly importerReleve: (
    lignes: readonly { readonly date: DateISO; readonly libelle: string; readonly montant: Euros }[]
  ) => { readonly ajoutes: number; readonly deja: number };

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
   */
  readonly adopterFaitsDistants: (brut: unknown) => string | null;

  /* ── Congés ───────────────────────────────────────────────────────────── */

  /**
   * Pose ou retire un congé sur une date. Un seul geste dans les deux sens :
   * corriger une erreur de saisie doit coûter le même clic que la faire.
   */
  readonly basculerConge: (jour: DateISO) => void;
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

  /* ── Planning ─────────────────────────────────────────────────────────── */

  /**
   * Ajuste ce qui a été travaillé un jour donné, pour une mission.
   *
   * `quotite` à `null` EFFACE l'ajustement : le jour redevient ce que le
   * rythme prévoit. C'est un état distinct de « zéro », qui déclare au
   * contraire « ce jour prévu, je n'ai pas travaillé ». Les confondre
   * rendrait impossible de revenir au rythme après une correction.
   */
  readonly ajusterJour: (
    missionId: string, entiteId: string, date: DateISO, quotite: number | null
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

  /* ── Livre des recettes ───────────────────────────────────────────────── */

  /**
   * Ajoute une recette. Le numéro est attribué ici s'il n'est pas fourni :
   * la continuité de la numérotation est une exigence du registre, pas une
   * commodité d'affichage.
   */
  readonly ajouterRecette: (
    saisie: Omit<Recette, 'id' | 'numero'> & { readonly numero?: string }
  ) => string;

  /**
   * Passe une recette en encaissé.
   *
   * La date ET le mode de règlement sont exigés ensemble : ce sont deux
   * mentions obligatoires du livre des recettes, et l'ancienne application
   * n'en portait aucune. Rend le motif du refus, ou `null`.
   */
  readonly encaisserRecette: (
    id: string,
    encaisseeLe: DateISO,
    modeReglement: ModeReglement
  ) => string | null;

  /**
   * Consigne qu'une facture a été relancée, à cette date.
   *
   * C'est un FAIT, au même titre qu'un encaissement : on l'a fait ou on ne l'a
   * pas fait. Il commande le ton de la relance suivante — rappel, puis ferme,
   * puis mise en demeure — et répond à « je l'ai relancé quand ? », qui est la
   * question qu'on se pose au téléphone.
   *
   * L'application n'envoie rien : elle rédige, et consigne que vous avez
   * envoyé. Prétendre expédier sans savoir ni tracer ni prouver l'envoi ne
   * vaudrait rien le jour où il faudrait démontrer qu'on a relancé.
   */
  readonly consignerRelance: (id: string, le: DateISO) => void;

  /**
   * Consigne qu'une facture a été ENVOYÉE au client, à cette date.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ÉMISE N'EST PAS ENVOYÉE
   * ─────────────────────────────────────────────────────────────────────────
   *
   * Le document peut exister, porter son numéro et sa date, et dormir dans un
   * dossier — c'est le cas courant en fin de mois, où l'on établit les
   * factures d'un coup avant de les envoyer.
   *
   * Les confondre coûte deux choses. On relance un client qui n'a jamais reçu
   * la facture, ce qui est la pire des relances. Et on ne sait pas répondre à
   * « je ne l'ai jamais reçue », qui est la réponse la plus courante à une
   * relance.
   *
   * Une DATE et non un booléen, comme partout ailleurs ici : un statut
   * qu'aucune date ne prouve ne prouve rien. Rend le motif du refus, ou `null`.
   */
  readonly marquerEnvoyee: (id: string, le: DateISO) => string | null;

  /**
   * Annule une recette ÉMISE par une écriture inverse.
   *
   * Rien n'est supprimé : les deux écritures restent visibles et leur somme
   * est nulle. Un registre qu'on peut réécrire ne prouve rien.
   *
   * Une facture émise mais jamais encaissée s'annule elle aussi — c'est un
   * avoir. L'écriture inverse reste alors hors du livre (`encaisseeLe` à
   * `null`), le livre des recettes n'enregistrant que des encaissements, mais
   * elle neutralise le montant resté à rentrer.
   */
  readonly annulerRecette: (id: string, aujourdhui?: DateISO) => string | null;

  /**
   * Supprime un BROUILLON — une recette jamais émise.
   *
   * Le critère est l'émission, pas l'encaissement : un numéro porté par une
   * facture sortie de chez l'utilisateur ne peut plus disparaître, sous peine
   * de laisser un trou dans la numérotation. Un brouillon, lui, n'a jamais
   * circulé : le supprimer libère son numéro, et c'est ce qu'il faut — le
   * réserver créerait précisément le trou qu'on cherche à éviter.
   */
  readonly supprimerBrouillon: (id: string) => string | null;

  /* ── Carnet : clients et missions ─────────────────────────────────────── */

  /**
   * Ajoute un client. Rend le motif du refus, ou `null`.
   *
   * Le nom est contrôlé par le domaine : il sert de clé de rattachement, donc
   * il ne peut être ni vide ni homonyme d'un client existant.
   */
  readonly ajouterClient: (saisie: Omit<Client, 'id'>) => string | null;

  /**
   * Modifie un client, en PROPAGEANT un éventuel renommage.
   *
   * Missions et recettes rattachées suivent, dans la même écriture. Sans cela,
   * renommer « Dupont » en « Dupont SARL » laisserait derrière lui des recettes
   * attachées à un nom que plus aucun client ne porte : elles sortiraient des
   * délais de paiement et de la déclaration européenne de services sans que
   * rien ne le signale.
   */
  readonly modifierClient: (
    id: string, modification: Partial<Omit<Client, 'id'>>
  ) => string | null;

  /** Supprime un client, si rien ne lui est rattaché. */
  readonly supprimerClient: (id: string) => string | null;

  readonly ajouterMission: (saisie: Omit<Mission, 'id'>) => string;
  readonly modifierMission: (
    id: string, modification: Partial<Omit<Mission, 'id'>>
  ) => void;
  /** Supprime une mission, si aucune recette de son client ne relève de sa période. */
  readonly supprimerMission: (id: string) => string | null;
}

/**
 * Persistance. Volontairement silencieuse en cas d'échec côté écriture :
 * l'utilisateur a déjà été averti par `chargement`, et faire échouer chaque
 * saisie ne l'aiderait pas. L'absence de persistance est signalée une fois,
 * à l'endroit qui compte.
 */
function persister(stockage: Stockage | null, faits: Faits): void {
  if (!stockage) return;
  try {
    stockage.setItem(CLE_STOCKAGE, JSON.stringify(faits));
  } catch {
    // Quota dépassé : l'état en mémoire reste juste, seule la conservation
    // échoue. Voir `chargement.phase === 'sans-persistance'`.
  }
}

let stockageActif: Stockage | null = null;

/** Porte le résultat d'une migration dans le magasin. Partagée par les deux chemins. */
function appliquerMigration(
  set: (partiel: Partial<MagasinFaits>) => void,
  resultat: ResultatMigration
): void {
  switch (resultat.statut) {
    case 'migre':
      set({ faits: resultat.faits, chargement: { phase: 'pret', migrationEffectuee: true } });
      break;
    case 'deja-migre':
    case 'rien-a-migrer':
      set({ faits: resultat.faits, chargement: { phase: 'pret', migrationEffectuee: false } });
      break;
    case 'reprise-requise':
      // Ne peut pas arriver : l'appelant l'intercepte avant. Le compilateur
      // exige néanmoins que le cas soit couvert, et c'est tant mieux.
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
      break;
  }
}

export const useFaits = create<MagasinFaits>((set, get) => ({
  faits: faitsVides(),
  chargement: { phase: 'initial' },

  initialiser: (stockage) => {
    const s = stockage === undefined ? stockageNavigateur() : stockage;
    stockageActif = s;

    if (!s) {
      set({
        chargement: {
          phase: 'sans-persistance',
          motif: 'Le stockage du navigateur est indisponible (navigation privée '
            + 'ou stockage bloqué). Vos saisies ne seront pas conservées.'
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
                + 'chargée. Vos anciennes données sont intactes ; réessayez en '
                + 'rechargeant la page.'
            }
          });
        });
      return;
    }

    appliquerMigration(set, resultat);
  },

  marquerEnvoyee: (id, le) => {
    const actuel = get().faits;
    const recette = actuel.recettes.find((r) => r.id === id);
    if (recette === undefined) return 'Recette introuvable.';

    // Un brouillon n'a pas de document à envoyer : il n'a ni numéro définitif
    // ni date. L'envoyer d'abord et l'émettre ensuite mettrait la date d'envoi
    // avant la date de la facture.
    if (recette.emiseLe === null) {
      return 'Ce brouillon n’a pas encore été émis : émettez-le d’abord, '
        + 'il prendra son numéro et sa date.';
    }
    if (le < recette.emiseLe) {
      return 'Une facture ne peut pas partir avant d’exister : la date d’envoi '
        + 'est antérieure à sa date d’émission.';
    }

    const faits: Faits = {
      ...actuel,
      recettes: actuel.recettes.map((r) => (r.id === id ? { ...r, envoyeeLe: le } : r))
    };
    set({ faits });
    persister(stockageActif, faits);
    return null;
  },

  consignerRelance: (id, le) => {
    const actuel = get().faits;
    const faits: Faits = {
      ...actuel,
      recettes: actuel.recettes.map((r) => {
        if (r.id !== id) return r;
        const faites = r.relancesLe ?? [];
        // Deux relances le même jour sont une double frappe, pas deux
        // démarches : les compter ferait passer au ton suivant sans qu'un
        // second message soit parti.
        if (faites.includes(le)) return r;
        return { ...r, relancesLe: [...faites, le] };
      })
    };
    set({ faits });
    persister(stockageActif, faits);
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

  importerReleve: (lignes) => {
    const actuel = get().faits;
    const resultat = importerMouvements(actuel.mouvementsBancaires, lignes);
    const faits: Faits = { ...actuel, mouvementsBancaires: resultat.mouvements };
    set({ faits });
    persister(stockageActif, faits);
    return { ajoutes: resultat.ajoutes, deja: resultat.deja };
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

  ajouterClient: (saisie) => {
    const actuel = get().faits;
    const refus = validerNomClient(saisie.nom, actuel.clients);
    if (refus !== null) return refus.message;

    const client: Client = {
      ...saisie,
      nom: saisie.nom.trim(),
      id: `cli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    };
    const faits: Faits = { ...actuel, clients: [...actuel.clients, client] };
    set({ faits });
    persister(stockageActif, faits);
    return null;
  },

  modifierClient: (id, modification) => {
    const actuel = get().faits;
    const existant = actuel.clients.find((c) => c.id === id);
    if (existant === undefined) return 'Client introuvable.';

    if (modification.nom !== undefined) {
      const refus = validerNomClient(modification.nom, actuel.clients, id);
      if (refus !== null) return refus.message;
    }

    const nouveauNom = modification.nom === undefined
      ? null
      : nomAPropager(existant.nom, modification.nom);

    const clients = actuel.clients.map((c) =>
      (c.id === id ? { ...c, ...modification, nom: nouveauNom ?? c.nom } : c));

    // La propagation est faite ici, dans la même écriture que la modification :
    // un renommage à moitié appliqué serait pire que pas de renommage du tout.
    const faits: Faits = nouveauNom === null
      ? { ...actuel, clients }
      : {
        ...actuel,
        clients,
        missions: actuel.missions.map((m) =>
          (m.clientNom === existant.nom ? { ...m, clientNom: nouveauNom, clientId: id } : m)),
        recettes: actuel.recettes.map((r) =>
          (r.clientNom === existant.nom ? { ...r, clientNom: nouveauNom } : r))
      };

    set({ faits });
    persister(stockageActif, faits);
    return null;
  },

  supprimerClient: (id) => {
    const actuel = get().faits;
    const existant = actuel.clients.find((c) => c.id === id);
    if (existant === undefined) return 'Client introuvable.';

    const refus = peutSupprimerClient(existant.nom, actuel.missions, actuel.recettes);
    if (refus !== null) return refus.message;

    const faits: Faits = { ...actuel, clients: actuel.clients.filter((c) => c.id !== id) };
    set({ faits });
    persister(stockageActif, faits);
    return null;
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

  supprimerMission: (id) => {
    const actuel = get().faits;
    const existante = actuel.missions.find((m) => m.id === id);
    if (existante === undefined) return 'Mission introuvable.';

    const refus = peutSupprimerMission(existante, actuel.recettes);
    if (refus !== null) return refus.message;

    const faits: Faits = { ...actuel, missions: actuel.missions.filter((m) => m.id !== id) };
    set({ faits });
    persister(stockageActif, faits);
    return null;
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

  adopterFaitsDistants: (brut) => {
    const motif = motifRefusFaits(brut);
    if (motif !== null) return motif;
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

  basculerConge: (jour) => {
    const actuel = get().faits;
    const pose = actuel.conges.some((c) => c.date === jour);
    get().poserPlageDeConges([jour], !pose);
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

  ajouterRecette: (saisie) => {
    const actuel = get().faits;
    const id = `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const annee = Number((saisie.emiseLe ?? saisie.encaisseeLe ?? '')
      .slice(0, 4)) || new Date().getFullYear();
    const recette: Recette = {
      ...saisie,
      id,
      numero: saisie.numero?.trim() || prochainNumero(actuel.recettes, annee)
    };
    const faits: Faits = { ...actuel, recettes: [...actuel.recettes, recette] };
    set({ faits });
    persister(stockageActif, faits);
    return id;
  },

  encaisserRecette: (id, encaisseeLe, modeReglement) => {
    const actuel = get().faits;
    const recette = actuel.recettes.find((r) => r.id === id);
    if (recette === undefined) return 'Recette introuvable.';
    if (recette.encaisseeLe !== null) {
      // Réencaisser reviendrait à modifier une écriture déjà portée au
      // registre. La correction passe par une annulation.
      return 'Cette recette est déjà encaissée. Pour la corriger, annulez-la : '
        + 'le livre des recettes se tient en ajout seul.';
    }
    const faits: Faits = {
      ...actuel,
      recettes: actuel.recettes.map((r) =>
        (r.id === id ? { ...r, encaisseeLe, modeReglement } : r))
    };
    set({ faits });
    persister(stockageActif, faits);
    return null;
  },

  annulerRecette: (id, aujourdhui) => {
    const actuel = get().faits;
    const origine = actuel.recettes.find((r) => r.id === id);
    if (origine === undefined) return 'Recette introuvable.';
    if (origine.emiseLe === null) {
      return 'Ce brouillon n’a jamais été émis : il se supprime, il n’y a rien '
        + 'à annuler.';
    }
    const jour = aujourdhui ?? (new Date().toISOString().slice(0, 10) as DateISO);
    const inverse = ecritureDAnnulation(origine, jour, `${origine.id}-annulation`);
    if (actuel.recettes.some((r) => r.id === inverse.id)) {
      return 'Cette recette a déjà été annulée.';
    }

    // Une facture jamais encaissée n'a pas d'écriture au livre : l'avoir n'en
    // crée donc pas non plus. Il neutralise le reste à rentrer, sans inscrire
    // au registre un encaissement qui n'a pas eu lieu.
    const ecriture = origine.encaisseeLe === null
      ? { ...inverse, encaisseeLe: null }
      : inverse;

    const faits: Faits = { ...actuel, recettes: [...actuel.recettes, ecriture] };
    set({ faits });
    persister(stockageActif, faits);
    return null;
  },

  supprimerBrouillon: (id) => {
    const actuel = get().faits;
    const recette = actuel.recettes.find((r) => r.id === id);
    if (recette === undefined) return 'Recette introuvable.';
    if (recette.emiseLe !== null) {
      return 'Cette facture a été émise : son numéro est sorti, et le supprimer '
        + 'laisserait un trou dans la numérotation. Annulez-la par un avoir.';
    }
    const faits: Faits = { ...actuel, recettes: actuel.recettes.filter((r) => r.id !== id) };
    set({ faits });
    persister(stockageActif, faits);
    return null;
  },

  ajusterJour: (missionId, entiteId, date, quotite) => {
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
          if (quotite === null) delete ajustements[date];
          else ajustements[date] = quotite;
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
        const ajustements: Record<string, number> = {};
        for (const [date, quotite] of Object.entries(e.ajustements)) {
          if (cibles.has(date)) { retires += 1; continue; }
          ajustements[date] = quotite;
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
