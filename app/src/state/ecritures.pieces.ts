import type { PieceAFournir } from '../domain/calculs/pieces';
import { ecrireFaits, useFaits } from './store';

/**
 * Les écritures des pièces à fournir (schéma 25) : la grille d'Obligations
 * et le dossier d'une pièce les appellent, chargés à la demande.
 *
 * Une pièce se MODIFIE sur place : renouveler son attestation de vigilance,
 * c'est en changer la date d'obtention, pas en empiler une seconde. Rien ne
 * se perd — l'état se dérive des dates, et l'ancienne date ne réclamait plus
 * rien dès qu'une plus récente existait.
 */
export function enregistrerPiece(saisie: Omit<PieceAFournir, 'id'> & { readonly id?: string }): string {
  const actuel = useFaits.getState().faits;
  const id = saisie.id ?? `piece-${saisie.sorte}-${Date.now()}`;
  const piece: PieceAFournir = {
    id, sorte: saisie.sorte, libelle: saisie.libelle, obtenueLe: saisie.obtenueLe,
    valableJusquau: saisie.valableJusquau, provisoire: saisie.provisoire
  };
  const existe = actuel.pieces.some((p) => p.id === id);
  ecrireFaits({
    ...actuel,
    pieces: existe ? actuel.pieces.map((p) => (p.id === id ? piece : p)) : [...actuel.pieces, piece]
  });
  return id;
}
