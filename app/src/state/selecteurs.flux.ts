import type { DateISO, Euros, Mois } from '../domain/types';
import { euros } from '../domain/types';
import type { Faits } from './schema';
import {
  type LigneFlux, LIBELLE_NATURE, dateDuJour, echeanceDesFactures, remunerationDuMois,
  soldeEstSuivi
} from './selecteurs';
import { estPayee } from '../domain/calculs/provisions';

/**
 * Le flux d'un mois qui n'est pas le mois courant.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SECOND SÉLECTEUR, ET PAS UN MODE DE `fluxDuMois`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `fluxDuMois` répond à « où j'en suis AUJOURD'HUI » : ses sorties sont les
 * provisions du jour, sa rémunération le versable du jour. Ce sont des
 * chiffres INSTANTANÉS, et les afficher sous « mai 2026 » ferait lire en mai
 * un versable calculé en juin — un montant qu'on ne pouvait pas se verser.
 *
 * Un mois passé se lit en CONSTAT : ce qui est rentré, ce qui est sorti, ce
 * qu'on s'est versé. Un mois à venir se lit en ÉCHÉANCES : ce qui est attendu,
 * ce qui est dû. Ni l'un ni l'autre n'a de versable. Ce sont d'autres
 * questions ; elles ont leur propre sélecteur, chargé avec la carte qui les
 * pose — le paquet d'entrée n'a pas à les porter pour qui ne quitte jamais le
 * mois courant.
 */
export interface FluxDUnAutreMois {
  readonly temps: 'passe' | 'futur';
  readonly entrees: {
    /** Encaissé sur le mois — toujours nul pour un mois à venir. */
    readonly encaisse: Euros;
    /**
     * Factures non encaissées dont l'échéance tombe dans le mois : en retard
     * pour un mois passé, attendues pour un mois à venir.
     */
    readonly attendu: Euros;
    readonly lignes: readonly LigneFlux[];
  };
  readonly sorties: {
    readonly total: Euros;
    readonly regle: Euros;
    readonly lignes: readonly LigneFlux[];
  };
  /**
   * Ce qu'on s'est versé sur le mois, lu sur le relevé. `null` pour un mois à
   * venir, ou sans relevé suivi : écrire « 0 € » dirait qu'on ne s'est rien
   * versé, ce que personne ne sait.
   */
  readonly verse: Euros | null;
}

export function fluxDUnAutreMois(
  faits: Faits, m: Mois, aujourdhui: DateISO = dateDuJour()
): FluxDUnAutreMois {
  const temps = m < aujourdhui.slice(0, 7) ? 'passe' : 'futur';
  const echeance = echeanceDesFactures(faits);
  const libelle = (r: Faits['recettes'][number]): string => (r.clientNom !== '' ? r.clientNom : r.libelle);
  const total = (liste: readonly { readonly montant: Euros }[]): Euros =>
    euros(liste.reduce((s, x) => s + x.montant, 0));

  const encaissees = faits.recettes.filter((r) => r.encaisseeLe?.startsWith(m) === true);
  const attendues = faits.recettes.filter((r) => {
    if (r.emiseLe === null || r.encaisseeLe !== null) return false;
    return echeance(r)?.startsWith(m) === true;
  });
  const echeances = faits.echeances.filter((e) => e.echeanceLe.startsWith(m));
  const reglees = echeances.filter((e) => estPayee(e));

  return {
    temps,
    entrees: {
      encaisse: total(encaissees),
      attendu: total(attendues),
      lignes: [
        ...encaissees.map((r) => ({
          id: r.id, libelle: libelle(r), montant: r.montant, date: r.encaisseeLe, regle: true
        })),
        ...attendues.map((r) => ({
          id: r.id, libelle: libelle(r), montant: r.montant, date: echeance(r),
          regle: false, enRetard: temps === 'passe'
        }))
      ]
    },
    sorties: {
      total: total(echeances),
      regle: total(reglees),
      lignes: echeances.map((e) => ({
        id: e.id, libelle: LIBELLE_NATURE[e.nature], montant: e.montant, date: e.echeanceLe,
        regle: estPayee(e),
        // Une échéance d'un mois passé qui n'est pas payée est en retard ;
        // celle d'un mois à venir est seulement à venir.
        enRetard: temps === 'passe' && !estPayee(e)
      }))
    },
    verse: temps === 'passe' && soldeEstSuivi(faits) ? remunerationDuMois(faits, m) : null
  };
}
