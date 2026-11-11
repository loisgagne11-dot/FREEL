import type { ModeReglement } from '../domain/calculs/livreRecettes';
import type { Faits } from './schema';

/**
 * Le mode de règlement à proposer pour un client : celui de son dernier
 * paiement, sinon le virement.
 *
 * Un client règle presque toujours de la même façon. Proposer « virement » à
 * celui qui paie par chèque depuis deux ans, c'est un champ à corriger à chaque
 * pointage — ou, plus souvent, un mode faux porté au livre des recettes parce
 * qu'on a validé sans regarder. Le défaut n'est qu'une proposition : le champ
 * reste modifiable, et rien n'est écrit avant la confirmation.
 */
export function dernierModeDeReglement(faits: Faits, clientNom: string): ModeReglement {
  let dernier: { readonly le: string; readonly mode: ModeReglement } | null = null;
  for (const r of faits.recettes) {
    if (r.clientNom !== clientNom || r.encaisseeLe === null || r.modeReglement === null) continue;
    // Une écriture d'annulation recopie le mode de la facture qu'elle annule :
    // elle ne dit rien de la façon dont le client paie.
    if (typeof r.annuleEcriture === 'string') continue;
    if (dernier === null || r.encaisseeLe > dernier.le) dernier = { le: r.encaisseeLe, mode: r.modeReglement };
  }
  return dernier?.mode ?? 'virement';
}
