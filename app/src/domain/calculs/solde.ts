/**
 * Le solde du compte, dérivé de TOUS les faits enregistrés — pas seulement du
 * relevé importé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE BUG QUE CE MODULE CORRIGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `soldeBancaire` (voir `banque.ts`) sommait le solde initial et les
 * mouvements importés — correctement, mais sur une assiette trop étroite.
 * Tant qu'aucun relevé n'était importé, le solde ne bougeait JAMAIS, quoi que
 * l'utilisateur enregistre par ailleurs : des recettes encaissées, des
 * dépenses payées, des échéances URSSAF ou de TVA réglées. La tuile avouait
 * « saisi, aucun relevé importé », mais l'aveu ne corrigeait rien — l'argent
 * réellement entré et sorti restait invisible du calcul.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI « LES FAITS FONT FOI, LE RELEVÉ NE SERT QU'AU RAPPROCHEMENT »
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Deux règles étaient possibles. La première ferait DU RELEVÉ la source dès
 * qu'il existe : `soldeInitial + Σ mouvements`, les faits ne servant que de
 * repli en son absence. Elle échoue sur un cas ordinaire de cette
 * application : les ÉCHÉANCES (URSSAF, TVA, CFE) n'ont aucun mécanisme de
 * rapprochement — `EcritureRapprochable` ne connaît que les recettes et les
 * dépenses (voir `banque.ts`). Un débit d'échéance qui traîne « à traiter »
 * dans le relevé, une fois classé « sans contrepartie » faute de mieux,
 * s'ajouterait à un montant d'échéance déjà retranché côté faits — doublant
 * l'écart dans le sens le plus dangereux : un solde plus haut qu'il ne l'est,
 * qui invite à se verser de l'argent déjà sorti.
 *
 * La règle retenue est l'inverse : LES FAITS FONT TOUJOURS FOI — une recette
 * encaissée, une dépense payée, une échéance payée comptent, rapprochées ou
 * non. Le relevé, lui, ne sert qu'à VÉRIFIER ces faits (le rapprochement) et
 * à révéler ce qu'aucun fait ne représente : virements de rémunération, frais
 * bancaires, remboursements — les mouvements que l'utilisateur a
 * explicitement déclarés `sansContrepartie`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COMMENT ÇA ÉVITE LE DOUBLE COMPTAGE — Y COMPRIS PENDANT LE RAPPROCHEMENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un mouvement bancaire a trois états, mutuellement exclusifs par
 * construction (voir `MouvementBancaire`) :
 *
 *   - RAPPROCHÉ (`rapprocheAvec` posé)   : sa somme est DÉJÀ comptée, via le
 *     fait auquel il est rattaché. L'ajouter en plus doublerait.
 *   - SANS CONTREPARTIE (`sansContrepartie` posé) : par définition, AUCUN
 *     fait ne le représente ailleurs — c'est le seul cas où le mouvement
 *     brut doit entrer dans la somme.
 *   - À TRAITER (ni l'un ni l'autre) : on ignore encore s'il double un fait
 *     déjà compté ou représente un mouvement inconnu. Le compter par défaut
 *     recréerait exactement le risque que ce calcul doit éviter ; l'écran
 *     Relevé existe pour lever cette ambiguïté, pas ce module.
 *
 * Seul le second cas contribue au solde. Le premier est exclu — le fait
 * associé porte déjà sa valeur. Le troisième est exclu aussi, ce qui répond
 * du même geste au trou des échéances : tant qu'un débit d'échéance n'est
 * classé nulle part, il ne compte pas deux fois, il ne compte simplement pas
 * en plus du fait — qui, lui, compte toujours.
 */

import { type DateISO, type Euros, euros } from '../types';
import { type MouvementBancaire, soldeBancaire } from './banque';
import type { Depense } from './depenses';
import { type Echeance, type RecetteEncaissee, estPayee } from './provisions';

/**
 * D'où vient le chiffre affiché — jamais tu, toujours vrai.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS `Resolution<Euros>`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `Resolution<T>` exige de son variant `publie` une `source` et un
 * `verifieLe` — pertinents pour un barème daté, publié par une autorité à
 * une date précise. Un solde n'a rien de tel : sa « source » est l'ensemble
 * mouvant des faits que l'utilisateur vient de saisir, pas un texte officiel
 * qu'on pourrait citer. Forcer `Resolution<T>` obligerait à fabriquer une
 * fausse source — exactement le genre de mensonge que le type existe pour
 * empêcher.
 *
 * Le solde, par ailleurs, n'est JAMAIS « refusé » : une somme de faits connus
 * (fût-elle vide) est toujours défendable, contrairement à un taux qui peut
 * manquer. Ce qui varie, c'est la CONFIANCE qu'on peut lui accorder — d'où ce
 * type dédié, à quatre états qui correspondent aux quatre phrases que l'écran
 * doit pouvoir dire.
 */
export type ProvenanceSolde =
  /**
   * Au moins un fait (recette, dépense ou échéance) ou un mouvement contribue,
   * mais le relevé — s'il existe — laisse des mouvements « à traiter » : la
   * somme est juste, mais elle n'a pas encore été vérifiée contre la banque.
   */
  | 'derive'
  /**
   * Un relevé existe ET chaque mouvement qu'il porte est classé — rapproché
   * à un fait ou déclaré sans contrepartie. Rien n'y attend de décision : le
   * chiffre est celui de la banque autant que celui des faits.
   */
  | 'rapproche'
  /**
   * Ni fait ni relevé : le seul chiffre disponible est celui saisi une fois,
   * en Config. Il peut être juste, mais rien ne le confirme.
   */
  | 'saisi'
  /**
   * Le montant est saisi, mais SANS DATE : `soldeInitialAu` vaut `null`.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI C'EST UN ÉTAT À PART, ET PAS UNE VARIANTE DE « saisi »
   * ─────────────────────────────────────────────────────────────────────────
   *
   * Sans date, l'application ne peut pas savoir si une recette encaissée ou
   * une dépense payée est déjà comptée dans le montant saisi ou si elle est
   * arrivée APRÈS — c'est le bug corrigé par ce lot : un utilisateur qui
   * reportait le solde de sa banque « aujourd'hui » voyait ensuite ses
   * recettes s'y rajouter, alors qu'elles y étaient déjà. Le cas `saisi`
   * (rien d'autre à recouper, la question ne se pose même pas) ne dit pas la
   * même chose que celui-ci, où des faits existent peut-être mais où
   * l'application s'abstient délibérément de les recouper plutôt que de
   * deviner. L'écran doit pouvoir le dire, et inviter à dater le solde plutôt
   * que de laisser croire qu'il est déjà à jour des faits saisis depuis.
   */
  | 'sansDate';

/**
 * D'où vient chaque euro du solde, part par part.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI C'EST RENDU ICI ET NON RECALCULÉ AILLEURS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'écran doit pouvoir répondre à « d'où sort ce solde ». Le refaire dans un
 * module de présentation supposerait de recopier les trois règles de tri de
 * `soldeDerive` — la borne de date, le sort des mouvements rapprochés, et
 * l'abstention totale quand aucune date n'est posée. Elles sont subtiles, et
 * elles ont déjà produit deux bugs à elles seules. Une copie qui en oublierait
 * une afficherait un détail qui ne retombe pas sur son propre total : le
 * lecteur venu vérifier son chiffre repartirait avec une raison de plus de ne
 * pas y croire.
 *
 * La somme signée `depart + recettes − depenses − echeances + releve` vaut
 * `montant`, par construction et non par accord. Un test le vérifie quand
 * même, parce que c'est cette identité que l'écran donne à lire.
 *
 * `depenses` et `echeances` sont POSITIVES : ce sont des montants sortis, et
 * le signe est porté par la formule, pas par la valeur. Les rendre négatives
 * ferait écrire « − −1 200 € » à l'écran le jour où quelqu'un les additionne
 * dans le mauvais sens.
 */
export interface PartsSolde {
  /** Le solde de départ, tel que saisi en Config. */
  readonly depart: Euros;
  /** Ce qui est entré depuis : recettes encaissées retenues. */
  readonly recettes: Euros;
  /** Ce qui est sorti depuis : dépenses payées retenues. Positif. */
  readonly depenses: Euros;
  /** Ce qui est sorti depuis : échéances réglées retenues. Positif. */
  readonly echeances: Euros;
  /**
   * Le net des mouvements du relevé qui ne doublent aucun fait. Signé : un
   * relevé peut aussi bien ajouter un remboursement que retrancher des frais
   * bancaires, et les séparer en deux parts donnerait deux lignes qui ne
   * correspondent à rien de nommable.
   */
  readonly releve: Euros;
  /**
   * Combien de faits chaque part recouvre.
   *
   * « 12 encaissements » sous un montant permet de reconnaître son propre
   * dossier ; « 43 030 € » seul ne se vérifie contre rien.
   */
  readonly nombres: {
    readonly recettes: number;
    readonly depenses: number;
    readonly echeances: number;
    readonly mouvements: number;
  };
}

export interface SoldeDetaille {
  readonly montant: Euros;
  readonly provenance: ProvenanceSolde;
  readonly parts: PartsSolde;
}

/**
 * D'où vient le solde, avant même de le calculer.
 *
 * Séparée de `soldeDerive` pour se tester seule : la provenance est une
 * question de FAITS PRÉSENTS OU NON, indépendante de leur somme.
 *
 * `soldeInitialAu` gouverne tout : `null`, la fonction rend `sansDate` sans
 * même regarder les faits — voir `ProvenanceSolde['sansDate']` pour pourquoi
 * la question ne se pose pas avant d'avoir une date à laquelle la comparer.
 */
export function provenanceSolde(
  soldeInitialAu: DateISO | null,
  recettesEncaissees: readonly RecetteEncaissee[],
  depenses: readonly Depense[],
  echeances: readonly Echeance[],
  mouvements: readonly MouvementBancaire[]
): ProvenanceSolde {
  if (soldeInitialAu === null) return 'sansDate';

  // Seuls les faits POSTÉRIEURS à la date du solde de départ comptent : ceux
  // d'avant ou du jour même sont déjà dans le montant saisi (voir
  // `soldeDerive`). Sans ce filtre, la provenance dirait « derive » pour une
  // recette d'hier qui n'a en réalité rien à dériver — mensonge d'autant plus
  // trompeur qu'il porterait sur la CONFIANCE affichée, pas sur un montant.
  const recettesPosterieures = recettesEncaissees.filter((r) => r.encaisseeLe > soldeInitialAu);
  const depensesPosterieures = depenses.some(
    (d) => d.payeeLe !== null && d.payeeLe > soldeInitialAu
  );
  const echeancesPosterieures = echeances.some(
    (e) => estPayee(e) && (e.payeeLe as DateISO) > soldeInitialAu
  );
  const aDesFaits = recettesPosterieures.length > 0 || depensesPosterieures || echeancesPosterieures;
  const aUnReleve = mouvements.length > 0;

  if (!aDesFaits && !aUnReleve) return 'saisi';

  const toutClasse = mouvements.every(
    (m) => m.rapprocheAvec !== null || m.sansContrepartie !== null
  );
  if (aUnReleve && toutClasse) return 'rapproche';

  return 'derive';
}

/**
 * Le solde, dérivé du solde initial et de tous les faits qui l'ont fait
 * bouger depuis.
 *
 * `soldeInitial` reste le point de départ : le solde À LA DATE `soldeInitialAu`,
 * avant tout fait enregistré depuis (voir `Faits.soldeInitial`). Tout ce qui
 * suit est une somme de faits STRICTEMENT postérieurs à cette date — jamais
 * une seconde façon de calculer le même solde.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SANS DATE, ON S'ABSTIENT DE DÉRIVER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `soldeInitialAu` à `null` — un solde saisi avant que ce lot n'existe, ou
 * jamais redaté depuis — ne dit pas si une recette encaissée ou une dépense
 * payée est déjà comprise dans le montant. Les compter quand même reproduit
 * EXACTEMENT le bug que ce module corrige : un solde « aujourd'hui » de
 * 20 000 €, une recette de 10 000 € encaissée hier et donc déjà dans ces
 * 20 000 €, redonnerait 30 000 € — 10 000 € qui n'existent nulle part sur le
 * compte réel. Le calcul revient alors à celui d'avant la dérivation par les
 * faits : le solde initial, plus les seuls mouvements bancaires déclarés
 * SANS CONTREPARTIE (un relevé importé reste toujours postérieur au solde de
 * départ qu'il prolonge, daté ou non — voir Config, « avant le premier
 * mouvement importé »).
 */
export function soldeDerive(
  soldeInitial: Euros,
  soldeInitialAu: DateISO | null,
  recettesEncaissees: readonly RecetteEncaissee[],
  depenses: readonly Depense[],
  echeances: readonly Echeance[],
  mouvements: readonly MouvementBancaire[]
): SoldeDetaille {
  // Seuls les mouvements SANS CONTREPARTIE s'ajoutent au solde bancaire brut :
  // les rapprochés sont déjà comptés via leur fait, les « à traiter »
  // resteraient ambigus (voir l'en-tête du fichier). `soldeBancaire` est
  // réutilisée telle quelle : une seule fonction somme un solde initial et des
  // mouvements, qu'ils soient TOUS les mouvements d'un relevé complet ou,
  // comme ici, le seul sous-ensemble qui ne double aucun fait. Ce sous-ensemble
  // ne dépend pas de la date : voir l'en-tête de la fonction.
  /*
   * L'ABSTENTION EST TOTALE, OU ELLE FAIT DISPARAÎTRE DE L'ARGENT.
   *
   * Une première version ne retenait JAMAIS que les mouvements sans
   * contrepartie, y compris sans date de solde de départ. Les deux exclusions
   * se cumulaient alors : le mouvement rapproché était écarté parce que « son
   * fait le compte déjà », pendant que le fait était écarté lui aussi, faute
   * de date. Le contrôle visuel l'a vu sur le jeu de démonstration — le solde
   * tombait de plusieurs milliers d'euros et les provisions passaient à
   * découvert, sans qu'aucun test ne bronche.
   *
   * Sans date, on ne dérive donc RIEN : le relevé redevient la seule source et
   * TOUS ses mouvements comptent, exactement comme avant que ce module
   * existe. Aucun double compte n'est possible, puisqu'aucun fait n'est
   * compté en face.
   *
   * Avec une date, le tri reprend son sens : les rapprochés sont portés par
   * leur fait, les « à traiter » restent ambigus, seuls les « sans
   * contrepartie » s'ajoutent au brut.
   */
  const mouvementsRetenus = soldeInitialAu === null
    ? mouvements
    : mouvements.filter((m) => m.sansContrepartie !== null);
  const partBanque = soldeBancaire(soldeInitial, mouvementsRetenus);

  // Sans date, aucun fait n'est retenu : voir l'en-tête de la fonction. Avec
  // une date, seuls ceux STRICTEMENT postérieurs le sont — le solde d'un soir
  // contient déjà la journée entière, y compris une recette encaissée ce
  // jour-là.
  const recettesRetenues = soldeInitialAu === null
    ? []
    : recettesEncaissees.filter((r) => r.encaisseeLe > soldeInitialAu);
  const depensesRetenues = soldeInitialAu === null
    ? []
    : depenses.filter((d) => d.payeeLe !== null && d.payeeLe > soldeInitialAu);
  const echeancesRetenues = soldeInitialAu === null
    ? []
    : echeances.filter((e) => estPayee(e) && (e.payeeLe as DateISO) > soldeInitialAu);

  const partRecettes = recettesRetenues.reduce<number>((s, r) => s + r.montant, 0);
  const partDepenses = depensesRetenues.reduce<number>((s, d) => s + d.montantTtc, 0);
  const partEcheances = echeancesRetenues.reduce<number>(
    (s, e) => s + (e.montantPaye ?? e.montant), 0
  );

  return {
    montant: euros(partBanque + partRecettes - partDepenses - partEcheances),
    provenance: provenanceSolde(soldeInitialAu, recettesEncaissees, depenses, echeances, mouvements),
    parts: {
      depart: soldeInitial,
      recettes: euros(partRecettes),
      depenses: euros(partDepenses),
      echeances: euros(partEcheances),
      // Le net du relevé se déduit du brut plutôt que de se resommer : c'est
      // `soldeBancaire` qui fait l'addition, et la refaire ici en donnerait une
      // seconde version qui finirait par ne plus tomber d'accord avec elle.
      releve: euros(partBanque - soldeInitial),
      nombres: {
        recettes: recettesRetenues.length,
        depenses: depensesRetenues.length,
        echeances: echeancesRetenues.length,
        mouvements: mouvementsRetenus.length
      }
    }
  };
}

/**
 * Le solde tel qu'il était à la fin d'un mois donné — un FAIT, pas une
 * hypothèse, dès lors que le mois est déjà passé ou en cours.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE BORNE HAUTE, ET POURQUOI PAS UN SECOND CALCUL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `soldeDerive` ne connaît qu'une borne — `soldeInitialAu`, la borne BASSE —
 * et somme tout ce qui la suit sans jamais s'arrêter. C'est le bon calcul
 * pour AUJOURD'HUI : rien n'est jamais daté dans le futur, donc « tout ce qui
 * suit » s'arrête naturellement à maintenant. Un mois déjà clos a besoin
 * d'une borne HAUTE en plus, faute de quoi une recette encaissée le mois
 * suivant se retrouverait comptée dans le solde du mois précédent.
 *
 * La fonction ne réimplémente pas l'addition : elle filtre les quatre
 * collections à la borne haute puis délègue entièrement à `soldeDerive`, qui
 * reste l'unique endroit où la somme se fait. Deux additions du même solde
 * auraient fini par diverger le jour où l'une des deux change de règle sans
 * l'autre — exactement l'écart que l'invariant « une source unique par
 * notion » interdit.
 */
export function soldeAuDernierJourDe(
  finDeMois: DateISO,
  soldeInitial: Euros,
  soldeInitialAu: DateISO | null,
  recettesEncaissees: readonly RecetteEncaissee[],
  depenses: readonly Depense[],
  echeances: readonly Echeance[],
  mouvements: readonly MouvementBancaire[]
): Euros {
  return soldeDerive(
    soldeInitial,
    soldeInitialAu,
    recettesEncaissees.filter((r) => r.encaisseeLe <= finDeMois),
    depenses.filter((d) => d.payeeLe !== null && d.payeeLe <= finDeMois),
    echeances.filter((e) => estPayee(e) && (e.payeeLe as DateISO) <= finDeMois),
    mouvements.filter((m) => m.date <= finDeMois)
  ).montant;
}
