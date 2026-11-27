/**
 * Ouvrir une pièce conservée, dans un nouvel onglet.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'ÉTAIT PAS POSSIBLE, ET CE QUE ÇA COÛTAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une pièce se déposait, se remplaçait, se vérifiait, se détachait — et ne se
 * lisait pas. Pour une facture émise dans Tiime, c'est pourtant le seul
 * document que FREEL en garde : le client qui dit ne pas l'avoir reçue, le
 * contrôle qui la demande, et l'on ne pouvait que constater qu'elle était
 * « intacte depuis son dépôt ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI VIENT D'UN FICHIER EST HOSTILE, Y COMPRIS QUAND ON LE RELIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une adresse `blob:` créée ici a l'ORIGINE de FREEL. Un fichier ouvert sous
 * le type `text/html` y exécuterait ses scripts avec l'accès au dossier
 * entier — le stockage local, la session du compte. Le type n'est donc jamais
 * celui que le fichier prétend : c'est l'un des types que le dépôt accepte
 * (`typeAccepte`), reposé sur une copie du contenu, ou rien. Un PDF qui n'en
 * est pas un s'ouvre en PDF illisible, pas en page.
 *
 * L'onglet est ouvert AVANT de lire la pièce, au clic : ouvert après une
 * attente, il serait pris pour une fenêtre surgissante et bloqué — Safari le
 * fait toujours. Son lien vers FREEL (`opener`) est coupé avant d'y charger
 * quoi que ce soit, et l'adresse est révoquée quand l'onglet se ferme, au plus
 * tard au bout de dix minutes : une adresse oubliée garde la pièce en mémoire
 * aussi longtemps que FREEL reste ouvert.
 */

import { type StockageJustificatifs, typeAccepte } from './justificatifs';

/** Ce que l'ouverture demande au navigateur — remplaçable dans les tests. */
export interface NavigateurPieces {
  /** Un onglet vierge, ouvert pendant le clic ; `null` s'il est bloqué. */
  ouvrirOnglet(): OngletPiece | null;
  creerAdresse(contenu: Blob): string;
  revoquerAdresse(adresse: string): void;
  differer(action: () => void, ms: number): void;
}

/** Le peu d'un onglet dont l'ouverture se sert. */
export interface OngletPiece {
  opener: unknown;
  readonly closed: boolean;
  readonly location: { href: string };
  close(): void;
}

const SURVEILLANCE_MS = 2000;
/** Dix minutes : le temps de lire, d'imprimer, d'enregistrer sous. */
const SURVEILLANCES_MAX = 300;

export function navigateurReel(): NavigateurPieces {
  return {
    ouvrirOnglet: () => window.open('', '_blank') as OngletPiece | null,
    creerAdresse: (contenu) => URL.createObjectURL(contenu),
    revoquerAdresse: (adresse) => URL.revokeObjectURL(adresse),
    differer: (action, ms) => { window.setTimeout(action, ms); }
  };
}

/**
 * Ouvre la pièce dans un nouvel onglet. Rend le motif d'un échec, ou `null`.
 *
 * À appeler DIRECTEMENT dans le gestionnaire du clic : l'onglet s'ouvre avant
 * la première attente (voir l'en-tête).
 */
export async function ouvrirPiece(
  stockage: StockageJustificatifs,
  id: string,
  navigateur: NavigateurPieces = navigateurReel()
): Promise<string | null> {
  const onglet = navigateur.ouvrirOnglet();
  if (onglet === null) {
    return 'Ton navigateur a bloqué le nouvel onglet : autorise les fenêtres pour FREEL, puis réessaie.';
  }
  let piece;
  try {
    piece = await stockage.lire(id);
  } catch {
    onglet.close();
    return 'La pièce n’a pas pu être relue sur cet appareil.';
  }
  if (piece === null) {
    onglet.close();
    return 'Cette pièce n’est pas sur cet appareil : elle a été déposée ailleurs, ou effacée avec lui.';
  }
  if (!typeAccepte(piece.typeMime)) {
    onglet.close();
    return 'Cette pièce n’est ni un PDF ni une image : FREEL ne l’ouvre pas.';
  }

  const adresse = navigateur.creerAdresse(new Blob([piece.contenu], { type: piece.typeMime }));
  onglet.opener = null;
  onglet.location.href = adresse;

  const surveiller = (restantes: number): void => {
    navigateur.differer(() => {
      if (onglet.closed || restantes <= 1) navigateur.revoquerAdresse(adresse);
      else surveiller(restantes - 1);
    }, SURVEILLANCE_MS);
  };
  surveiller(SURVEILLANCES_MAX);
  return null;
}
