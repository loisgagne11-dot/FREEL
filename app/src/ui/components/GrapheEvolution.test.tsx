/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GrapheEvolution, type MoisEvolution } from './GrapheEvolution';

afterEach(cleanup);

const formater = (v: number) => `${v} €`;
const formaterCourt = (v: number) => `${(v / 1000).toFixed(1).replace('.', ',')}k`;

const MOIS: readonly MoisEvolution[] = [
  { mois: '2026-06', libelle: 'JUIN', entrees: 6000, sorties: 5200, niveau: 8900 },
  { mois: '2026-07', libelle: 'JUIL', entrees: 7200, sorties: 5800, niveau: 10300 }
];

function rendre(mois: readonly MoisEvolution[] = MOIS) {
  return render(
    <GrapheEvolution
      mois={mois} seuil={null} libelleNiveau="disponible"
      formater={formater} formaterCourt={formaterCourt}
    />
  );
}

/**
 * LE TROU QUE CE LOT BOUCHE.
 *
 * Les entrées et les sorties n'existaient qu'en `aria-label` sur les barres :
 * lisibles par un lecteur d'écran, invisibles à l'œil. Le graphe dessinait
 * trois séries et n'en montrait qu'une. Sans ce test, retirer les deux `<span>`
 * ajoutés ici ne fait tomber aucun test — c'est exactement ce qui s'est produit
 * la première fois que le montant est passé du texte à l'`aria-label`.
 */
// Le « + » et la « − » vivent dans un nœud de texte séparé du montant, qui
// lui est enveloppé dans `<Montant>` — donc dans un élément fils. Le texte
// exact n'est donc porté par AUCUN nœud unique, ce que confirme un matcher
// par égalité stricte : il faut comparer le `textContent` complet de
// l'élément conteneur, pas chercher une chaîne toute faite dans le document.
const parExactTexte = (texte: string) =>
  (_: string, node: Element | null) => node?.textContent === texte;

describe('lisibilité des entrées et des sorties', () => {
  it('écrit l’entrée de chaque mois en clair, au format court', () => {
    rendre();
    expect(screen.getByText(parExactTexte('+6,0k'))).toBeTruthy();
    expect(screen.getByText(parExactTexte('+7,2k'))).toBeTruthy();
  });

  it('écrit la sortie de chaque mois en clair, au format court', () => {
    rendre();
    // Signe moins typographique (−), comme le reste du graphe : un simple
    // trait d'union romprait la cohérence avec le net, juste en dessous.
    expect(screen.getByText(parExactTexte('−5,2k'))).toBeTruthy();
    expect(screen.getByText(parExactTexte('−5,8k'))).toBeTruthy();
  });

  it('marque l’entrée du montant confidentiel', () => {
    rendre();
    const entree = screen.getByText(parExactTexte('+6,0k'));
    expect(entree.querySelector('[data-montant]')).toBeTruthy();
  });

  it('marque la sortie du montant confidentiel', () => {
    rendre();
    const sortie = screen.getByText(parExactTexte('−5,2k'));
    expect(sortie.querySelector('[data-montant]')).toBeTruthy();
  });

  // Les pixels des barres ne portent plus l'information : elle est déjà en
  // texte juste à côté. Les laisser exposées à l'aide technique redirait deux
  // fois le même chiffre.
  it('rend les barres décoratives plutôt que porteuses de l’information', () => {
    const { container } = rendre();
    const barres = [...container.querySelectorAll('[aria-hidden="true"]')]
      .find((el) => el instanceof HTMLElement && el.className.includes('barres'));
    expect(barres).toBeTruthy();
    expect(barres?.hasAttribute('role')).toBe(false);
  });

  it('affiche le niveau au-dessus de son point sur la courbe', () => {
    const { container } = rendre();
    const etiquette = [...container.querySelectorAll('span')]
      .find((el) => el.className.includes('etiquetteNiveau') && el.textContent === '8,9k');
    expect(etiquette).toBeTruthy();
    expect(etiquette?.querySelector('[data-montant]')).toBeTruthy();
  });

  /**
   * LA RÈGLE QUE CE LOT IMPOSE : UN MÊME NOMBRE, UN SEUL ENDROIT.
   *
   * Le niveau vivait sous la colonne ; il vit maintenant sur la courbe. Sans
   * ce test, rien n'empêche de le remettre aux deux endroits à la prochaine
   * modification — exactement le défaut que le projet a déjà corrigé deux
   * fois ailleurs (occupation en double, « Reste à rentrer » à deux sources).
   */
  it('n’écrit plus le niveau dans la colonne, seulement sur la courbe', () => {
    const { container } = rendre();
    const colonnes = container.querySelector('[class*="colonnes"]');
    expect(colonnes).toBeTruthy();
    // Aucun texte de colonne ne doit valoir exactement « 8,9k » : ce serait le
    // niveau, redit une seconde fois là où seuls l'entrée, la sortie et le net
    // doivent figurer.
    expect([...colonnes!.querySelectorAll('span')].some((el) => el.textContent === '8,9k'))
      .toBe(false);
  });
});
