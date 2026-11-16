import { Recherche } from './Recherche';
import { PastillesSysteme } from './PastillesSysteme';
import { Nouveau } from './Nouveau';

/**
 * La barre du haut, telle que la maquette `navigation.html` la dessine :
 * chercher, l'état de la synchronisation, masquer les montants, créer — et
 * rien d'autre (lot 51, décision 2).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI EN EST PARTI, ET OÙ CELA VIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * · La PÉRIODE : chaque écran porte la sienne dans son en-tête, et une seule.
 *   Une période en haut de page commandait des écrans qui ne s'en servaient
 *   pas, et doublait celle que d'autres portaient déjà.
 * · « EXPORTER » : un export vit là où sont ses données — le compte rendu sous
 *   Outils, une facture dans le facturier, le livre des recettes, la
 *   sauvegarde et l'archive dans Config › Données.
 * · La pastille « À TRAITER » : ce qui attend se lit aux compteurs du rail et
 *   dans les décisions du Pilote, qui en sont la même source.
 * · Le THÈME : dans Config › Affichage. On le choisit une fois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ILS NE SONT PAS DANS L'ENTRÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le paquet d'entrée a franchi son budget au lot 6 (83,4 / 80 Ko) en les
 * accueillant, et l'invariant n°7 dit d'extraire. Ils sont sûrs à différer :
 * ce sont des boutons de la barre, pas le contenu qu'on vient lire, et ils
 * arrivent quelques millisecondes après lui. Le mode confidentiel est posé
 * AVANT React par le script de `index.html` : les montants ne sont jamais
 * visibles le temps que l'icône arrive. Le raccourci ⌘K n'est écouté qu'à leur
 * arrivée — personne ne le tape avant d'avoir vu l'écran.
 */
export function BarreActions() {
  return (
    <>
      <Recherche />
      <PastillesSysteme />
      <Nouveau />
    </>
  );
}
