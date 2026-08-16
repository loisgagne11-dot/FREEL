/**
 * Écrire au livre des recettes : le numéro suivant, et l'annulation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CES DEUX FONCTIONS ONT QUITTÉ `livreRecettes.ts`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le magasin des faits les appelle — donc l'empaqueteur emportait
 * `livreRecettes.ts` ENTIER dans le lot de premier rendu : trois kilo-octets
 * de contrôle de conformité que l'écran d'accueil ne peut pas exécuter, et
 * dont il n'affiche rien. Le budget d'entrée l'a signalé en dépassant, comme
 * les fois précédentes ; relever le seuil aurait masqué la cause.
 *
 * La coupure n'est pas seulement technique, et c'est ce qui la rend tenable :
 * ce module PRODUIT une écriture, `livreRecettes.ts` VÉRIFIE le registre. Le
 * second est appelé par un écran qu'on ouvre, le premier par une saisie.
 *
 * Le type `EcritureRecette` reste défini là-bas et n'est importé ici qu'en
 * `import type` : un type disparaît à la compilation, il ne recrée donc pas
 * la dépendance qu'on vient de couper.
 */

import { type DateISO, euros } from '../types';
import type { EcritureRecette } from './livreRecettes';

/**
 * Le numéro suivant de l'année, au format `AAAA-NNN`.
 *
 * Reprend le plus grand numéro déjà émis pour l'année plutôt que de compter
 * les écritures : un trou dans la numérotation ne doit pas se refermer, sinon
 * deux factures porteraient le même numéro et le registre deviendrait
 * incontrôlable.
 */
export function prochainNumero(
  recettes: readonly EcritureRecette[],
  annee: number
): string {
  const prefixe = String(annee);
  let maximum = 0;
  for (const r of recettes) {
    const correspond = new RegExp(`^${prefixe}-(\\d+)$`).exec(r.numero.trim());
    if (correspond === null) continue;
    maximum = Math.max(maximum, Number(correspond[1]));
  }
  return `${prefixe}-${String(maximum + 1).padStart(3, '0')}`;
}

/**
 * L'écriture qui annule une recette.
 *
 * Le montant est l'opposé, la référence renvoie à l'originale, et la date
 * d'encaissement est celle de la correction — pas celle de l'écriture annulée.
 * Antidater l'annulation ferait disparaître la recette de la période où elle
 * avait été déclarée.
 */
export function ecritureDAnnulation(
  origine: EcritureRecette,
  aujourdhui: DateISO,
  identifiant: string
): EcritureRecette {
  return {
    id: identifiant,
    clientNom: origine.clientNom,
    libelle: `Annulation — ${origine.libelle}`,
    montant: euros(-origine.montant),
    emiseLe: origine.emiseLe,
    encaisseeLe: aujourdhui,
    modeReglement: origine.modeReglement,
    numero: origine.numero,
    annuleEcriture: origine.id
  };
}
