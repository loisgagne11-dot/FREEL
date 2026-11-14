import type { Mois } from '../domain/types';

/**
 * L'adresse qui ouvre l'éditeur de facture prérempli depuis le brouillon d'un
 * mois : `#/facture/brouillon:2026-08:Client%20France`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI DANS L'ADRESSE, ET PAS DANS UN ÉTAT PARTAGÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le brouillon est DÉRIVÉ : il se recalcule depuis le planning. Le passer d'un
 * écran à l'autre par un état caché, c'était en garder une copie qui ne suit
 * plus les faits, et la perdre au premier rechargement — l'éditeur s'ouvrait
 * alors vide sans dire pourquoi. Dans l'adresse, il ne voyage que ce qui le
 * désigne (le mois, le client) ; l'éditeur le recalcule, et un rechargement le
 * retrouve.
 */

const PREFIXE = 'brouillon:';

export interface DesignationBrouillon {
  readonly mois: Mois;
  readonly clientNom: string;
}

/** La sous-route de l'écran Facture qui désigne ce brouillon. */
export function sousRouteDuBrouillon(d: DesignationBrouillon): string {
  return `${PREFIXE}${d.mois}:${encodeURIComponent(d.clientNom)}`;
}

/** Le brouillon que désigne une sous-route, ou `null` si elle n'en désigne pas. */
export function brouillonDeLaSousRoute(sousRoute: string): DesignationBrouillon | null {
  if (!sousRoute.startsWith(PREFIXE)) return null;
  const reste = sousRoute.slice(PREFIXE.length);
  const separateur = reste.indexOf(':');
  if (separateur === -1) return null;
  const mois = reste.slice(0, separateur);
  if (!/^\d{4}-\d{2}$/.test(mois)) return null;
  try {
    return { mois: mois as Mois, clientNom: decodeURIComponent(reste.slice(separateur + 1)) };
  } catch {
    // Un « % » isolé collé à la main dans l'adresse : rien ne s'y désigne.
    return null;
  }
}

/*
 * Un brouillon ENREGISTRÉ (lot 29) se désigne par son identifiant : il n'a ni
 * numéro — l'émission le lui donnera — ni mois propre. Préfixe distinct de
 * celui du brouillon du mois, qui se recalcule depuis le planning : les
 * confondre rouvrirait un calcul là où l'utilisateur a saisi des lignes.
 */
const PREFIXE_ENREGISTRE = 'reprendre:';

export function sousRouteDuBrouillonEnregistre(id: string): string {
  return `${PREFIXE_ENREGISTRE}${encodeURIComponent(id)}`;
}

export function brouillonEnregistreDeLaSousRoute(sousRoute: string): string | null {
  if (!sousRoute.startsWith(PREFIXE_ENREGISTRE)) return null;
  try {
    const id = decodeURIComponent(sousRoute.slice(PREFIXE_ENREGISTRE.length));
    return id === '' ? null : id;
  } catch {
    return null;
  }
}
