import { Recherche } from './Recherche';
import { Exporter } from './Exporter';

/**
 * Les services transverses de la barre du haut, en un seul module différé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ILS NE SONT PAS DANS L'ENTRÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le paquet d'entrée a franchi son budget au lot 6 (83,4 / 80 Ko) en les
 * accueillant, et l'invariant n°7 dit d'extraire. Ils sont sûrs à différer,
 * comme les pastilles système : ce sont des boutons de la barre, pas le
 * contenu qu'on vient lire, et ils arrivent quelques millisecondes après lui.
 * Le raccourci ⌘K n'est écouté qu'à leur arrivée — personne ne le tape avant
 * d'avoir vu l'écran.
 */
export function BarreActions({ annee }: { readonly annee: number }) {
  return (
    <>
      <Recherche />
      <Exporter annee={annee} />
    </>
  );
}
