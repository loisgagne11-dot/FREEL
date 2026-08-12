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
import { type DateISO, type Euros, type Mois, euros } from '../domain/types';
import {
  CLE_STOCKAGE, type Depense, type Entreprise, type Faits, type Recette, faitsVides
} from './schema';
import {
  type ModeReglement, ecritureDAnnulation, prochainNumero
} from '../domain/calculs/livreRecettes';
import { importerMouvements } from '../domain/calculs/banque';
import {
  PERIODES_URSSAF, type PeriodeBareme, fusionnerPeriodes, validerAjout
} from '../domain/bareme/urssaf';
import type { EtatRapprochement } from '../domain/calculs/depenses';
import { type Stockage, migrer } from '../infra/migration';

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

  /** Seul écrivain de la réserve (D4). */
  readonly definirReserve: (montant: Euros) => void;
  readonly definirBesoinMensuel: (montant: Euros) => void;
  readonly definirSoldeInitial: (montant: Euros) => void;

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

  /** Déclare qu'aucune écriture ne correspond : frais bancaires, apport… */
  readonly marquerSansContrepartie: (mouvementId: string, sans: boolean) => void;

  /** Efface tous les mouvements importés. Ne touche à aucune écriture. */
  readonly viderReleve: () => void;

  /* ── Congés ───────────────────────────────────────────────────────────── */

  /**
   * Pose ou retire un congé sur une date. Un seul geste dans les deux sens :
   * corriger une erreur de saisie doit coûter le même clic que la faire.
   */
  readonly basculerConge: (jour: DateISO) => void;
  /** Pose ou retire une plage entière, sans jamais dupliquer une date déjà posée. */
  readonly poserPlageDeConges: (jours: readonly DateISO[], pose: boolean) => void;

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
    switch (resultat.statut) {
      case 'migre':
        set({ faits: resultat.faits, chargement: { phase: 'pret', migrationEffectuee: true } });
        break;
      case 'deja-migre':
      case 'rien-a-migrer':
        set({ faits: resultat.faits, chargement: { phase: 'pret', migrationEffectuee: false } });
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
  },

  definirReserve: (montant) => {
    const faits: Faits = { ...get().faits, reserve: euros(Math.max(0, montant)) };
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
          ? { ...m, rapprocheAvec: ecritureId, sansContrepartie: false }
          : m))
    };
    set({ faits });
    persister(stockageActif, faits);
  },

  marquerSansContrepartie: (mouvementId, sans) => {
    const actuel = get().faits;
    const faits: Faits = {
      ...actuel,
      mouvementsBancaires: actuel.mouvementsBancaires.map((m) =>
        (m.id === mouvementId ? { ...m, sansContrepartie: sans, rapprocheAvec: null } : m))
    };
    set({ faits });
    persister(stockageActif, faits);
  },

  viderReleve: () => {
    const faits: Faits = { ...get().faits, mouvementsBancaires: [] };
    set({ faits });
    persister(stockageActif, faits);
  },

  basculerConge: (jour) => {
    const actuel = get().faits;
    get().poserPlageDeConges([jour], !actuel.conges.includes(jour));
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

  poserPlageDeConges: (jours, pose) => {
    const actuel = get().faits;
    // Un ensemble, puis un tri : poser deux fois la même date ne doit pas
    // créer deux congés, et l'ordre stable rend les comparaisons lisibles.
    const dates = new Set(actuel.conges);
    for (const j of jours) {
      if (pose) dates.add(j); else dates.delete(j);
    }
    const faits: Faits = { ...actuel, conges: [...dates].sort() };
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
