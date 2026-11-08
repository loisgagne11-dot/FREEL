/**
 * Date de la dernière archive des justificatifs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN FAIT DE CET ENVIRONNEMENT, PAS UN FAIT MÉTIER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Cette date ne figure ni dans `Faits`, ni dans l'export JSON, ni dans la
 * synchronisation — et c'est ce qui répond à l'invariant « seuls les faits sont
 * stockés » : ce n'est pas un fait de l'activité, c'est une propriété de CE
 * navigateur. Les pièces vivent dans l'IndexedDB d'un seul navigateur ; une
 * archive faite sur un autre appareil ne protège aucune pièce d'ici. Si la date
 * voyageait avec les faits, un second appareil croirait ses pièces sauvegardées
 * parce que le premier l'a été — exactement l'illusion que l'archive doit dissiper.
 *
 * Le module n'échoue jamais : un stockage absent (navigation privée, quota,
 * politique du navigateur) ne doit pas empêcher de télécharger une archive.
 * Au pire on redemande une sauvegarde de trop, ce qui est la bonne erreur.
 */

import type { MetaJustificatif } from './justificatifs';

export const CLE_DERNIERE_ARCHIVE = 'freel.derniere-archive.v1';

function stockageParDefaut(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** La date ISO de la dernière archive faite ici, ou `null` si aucune. */
export function lireDerniereArchive(
  stockage: Pick<Storage, 'getItem'> | null = stockageParDefaut()
): string | null {
  try {
    const v = stockage?.getItem(CLE_DERNIERE_ARCHIVE) ?? null;
    // Une valeur illisible vaut « jamais » : prendre une date invalide pour
    // récente ferait croire à des pièces protégées.
    return v !== null && !Number.isNaN(Date.parse(v)) ? v : null;
  } catch {
    return null;
  }
}

export function noterArchive(
  le: Date,
  stockage: Pick<Storage, 'setItem'> | null = stockageParDefaut()
): void {
  try {
    stockage?.setItem(CLE_DERNIERE_ARCHIVE, le.toISOString());
  } catch {
    // Voir l'en-tête : ne pas noter est sans gravité, planter est pire.
  }
}

/** Pièces déposées après la dernière archive ; toutes si aucune n'a été faite. */
export function piecesNonArchivees(
  metas: readonly MetaJustificatif[], derniere: string | null
): number {
  if (derniere === null) return metas.length;
  const seuil = Date.parse(derniere);
  if (Number.isNaN(seuil)) return metas.length;
  return metas.filter((m) => {
    const depot = Date.parse(m.deposeLe);
    // Une date de dépôt illisible ne peut pas être prouvée antérieure.
    return Number.isNaN(depot) || depot > seuil;
  }).length;
}
