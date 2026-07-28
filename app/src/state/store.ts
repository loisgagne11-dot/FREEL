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
import { type Euros, type Mois, euros } from '../domain/types';
import { CLE_STOCKAGE, type Faits, faitsVides } from './schema';
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
  }
}));
