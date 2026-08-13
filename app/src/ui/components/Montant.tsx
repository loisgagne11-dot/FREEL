import type { ReactNode } from 'react';

/**
 * Un montant affiché à l'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CHAQUE MONTANT PORTE UNE MARQUE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le mode confidentialité floute les montants pour qu'on puisse partager son
 * écran, travailler dans un train ou montrer l'application à quelqu'un sans
 * exposer son chiffre d'affaires. Le CSS ne sait pas reconnaître un montant
 * dans du texte : il ne peut cibler que ce qui est marqué.
 *
 * D'où cette marque, posée à la source. `data-montant` plutôt qu'une classe :
 * la feuille de style globale doit pouvoir l'atteindre depuis la racine du
 * document, ce qu'un nom de classe de module CSS — haché à la compilation —
 * ne permet pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN FLOU PARTIEL SERAIT PIRE QU'AUCUN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Si un seul montant échappait au masquage, l'utilisateur se croirait couvert
 * et ne le serait pas — c'est la promesse de confidentialité qui deviendrait
 * le danger. La complétude n'est donc pas affirmée : `verifier-confidentialite`
 * charge les sept écrans dans un navigateur, cherche tout texte ressemblant à
 * un montant, et vérifie qu'aucun n'est lisible.
 */
export function Montant({ children }: { readonly children: ReactNode }) {
  return <span data-montant="">{children}</span>;
}
