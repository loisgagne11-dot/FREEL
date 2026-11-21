import type { DateISO, Euros, Mois } from '../types';
import { euros } from '../types';
import type { NatureDette } from './provisions';

/**
 * Le dû, posé au jour où il quitte le compte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX DATES POUR UNE MÊME CHARGE, ET AUCUNE N'EST DE TROP
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une cotisation NAÎT le jour où l'argent entre : c'est là que le disponible
 * la retire, et c'est ce qui l'empêche de passer dans « à te verser ». Elle
 * SORT du compte le jour où l'URSSAF la prélève — la limite de la déclaration
 * de sa période. Entre les deux, elle est sur le compte et elle n'est pas à
 * soi.
 *
 * Une projection de solde qui la retirait à l'encaissement montrait un compte
 * plus pauvre qu'il ne l'est pendant un trimestre, puis rien le 31 juillet ;
 * une projection qui l'oubliait montait jusqu'au trimestre où elle
 * s'effondrait. Celle-ci la pose à sa date : le solde prévu fait la marche que
 * le relevé fera, et le disponible — solde moins dû — ne bouge pas ce jour-là.
 */
export interface SortieDeCharge {
  readonly nature: NatureDette;
  /** Le jour où elle quitte le compte : limite de la déclaration, CA3, prélèvement, 15 décembre. */
  readonly le: DateISO;
  readonly montant: Euros;
  /** `du` : déjà dans le dû d'aujourd'hui ; `a_venir` : née d'un encaissement attendu. */
  readonly origine: 'du' | 'a_venir';
}

/**
 * Les sorties de charges de chaque mois de l'horizon, dans son ordre.
 *
 * Une sortie dont la date est passée et qui n'est pas réglée tombe sur le
 * PREMIER mois : elle est due maintenant, la perdre la ferait disparaître du
 * solde prévu comme si elle avait été payée. Une sortie au-delà de l'horizon
 * n'y entre pas — elle reste dans le dû de la fin, où le dessin la montre.
 */
export function sortiesParMois(
  sorties: readonly SortieDeCharge[],
  horizon: readonly Mois[]
): readonly (readonly SortieDeCharge[])[] {
  const premier = horizon[0];
  const parMois = new Map<string, SortieDeCharge[]>(horizon.map((m) => [m, []]));
  if (premier === undefined) return [];
  for (const s of sorties) {
    const m = s.le.slice(0, 7);
    parMois.get(m < premier ? premier : m)?.push(s);
  }
  return horizon.map((m) => parMois.get(m) ?? []);
}

/** Le total d'un mois de sorties. */
export const totalDesSorties = (sorties: readonly SortieDeCharge[]): Euros =>
  euros(sorties.reduce<number>((t, s) => t + s.montant, 0));
