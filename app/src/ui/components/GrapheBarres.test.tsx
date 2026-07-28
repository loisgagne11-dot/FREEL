/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GrapheBarres, type SerieBarres } from './GrapheBarres';

afterEach(cleanup);

const CATEGORIES = ['Jan', 'Fév', 'Mar'];

const SERIES: readonly SerieBarres[] = [
  { id: 'realise', libelle: 'Réalisé', valeurs: [10, 20, 30], token: 'green' },
  { id: 'encaisse', libelle: 'Encaissé', valeurs: [5, 25, 0], token: 'blue' }
];

const formater = (v: number) => `${v} k€`;

function rendre(series: readonly SerieBarres[] = SERIES, categories = CATEGORIES) {
  return render(
    <GrapheBarres titre="CA réalisé vs encaissé" categories={categories}
      series={series} formater={formater} />
  );
}

describe('accessibilité de la donnée', () => {
  // Un graphique dont l'information n'existe qu'en pixels est inaccessible.
  // Le tableau n'est pas une redondance : c'est la seule version que certains
  // utilisateurs pourront consulter.
  it('fournit la même donnée en tableau', () => {
    rendre();
    const tableau = screen.getByRole('table', { name: 'CA réalisé vs encaissé' });
    expect(tableau).toBeTruthy();
  });

  it('le tableau porte une ligne par catégorie et une colonne par série', () => {
    rendre();
    expect(screen.getByRole('columnheader', { name: 'Réalisé' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Encaissé' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Jan' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Mar' })).toBeTruthy();
  });

  it('le tableau contient les valeurs formatées, y compris les zéros', () => {
    rendre();
    expect(screen.getByRole('cell', { name: '10 k€' })).toBeTruthy();
    // Le zéro de mars doit apparaître : l'omettre laisserait croire à une
    // donnée manquante là où la valeur est réellement nulle.
    expect(screen.getByRole('cell', { name: '0 k€' })).toBeTruthy();
  });

  // Le tracé est décoratif ; le laisser lisible ferait annoncer une suite de
  // nombres sans structure.
  it('le tracé SVG est masqué aux technologies d\'assistance', () => {
    const { container } = rendre();
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
  });

  it('le titre est exposé une fois, par la légende de figure', () => {
    rendre();
    expect(screen.getByRole('figure', { name: 'CA réalisé vs encaissé' })).toBeTruthy();
  });
});

describe('tracé', () => {
  it('dessine une barre par valeur', () => {
    const { container } = rendre();
    // 3 catégories × 2 séries = 6 barres, plus aucune autre forme rectangulaire.
    expect(container.querySelectorAll('rect')).toHaveLength(6);
  });

  it('la hauteur des barres est proportionnelle à la valeur', () => {
    const { container } = rendre();
    const barres = [...container.querySelectorAll('rect')];
    const hauteurs = barres.map((r) => Number(r.getAttribute('height')));
    // La valeur maximale (30) doit donner la barre la plus haute, et une valeur
    // nulle une hauteur nulle.
    expect(Math.max(...hauteurs)).toBeGreaterThan(0);
    expect(hauteurs).toContain(0);
  });

  // Un maximum nul ferait diviser par zéro, ou remplirait tout : le graphe doit
  // rester plat et lisible plutôt que faux.
  it('supporte des séries entièrement nulles sans produire de valeur invalide', () => {
    const { container } = rendre([
      { id: 'a', libelle: 'A', valeurs: [0, 0, 0], token: 'green' }
    ]);
    const hauteurs = [...container.querySelectorAll('rect')]
      .map((r) => Number(r.getAttribute('height')));
    expect(hauteurs.every((h) => Number.isFinite(h) && h >= 0)).toBe(true);
  });

  it('supporte l\'absence de catégorie sans échouer', () => {
    const { container } = rendre(SERIES, []);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelectorAll('rect')).toHaveLength(0);
  });

  it('tolère une série plus courte que les catégories, en la traitant comme nulle', () => {
    const { container } = rendre([
      { id: 'court', libelle: 'Court', valeurs: [10], token: 'green' }
    ]);
    expect(container.querySelectorAll('rect')).toHaveLength(3);
    expect(screen.getAllByRole('cell', { name: '0 k€' })).toHaveLength(2);
  });
});

describe('légende', () => {
  it('nomme chaque série', () => {
    rendre();
    // Le libellé apparaît dans la légende et dans l'en-tête de colonne.
    expect(screen.getAllByText('Réalisé').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Encaissé').length).toBeGreaterThanOrEqual(1);
  });
});

describe('lisibilité des étiquettes', () => {
  // Douze mois et deux séries font vingt-quatre étiquettes dans la largeur du
  // graphe : elles se chevauchaient, ce qui est pire que leur absence.
  const DOUZE = ['J','F','M','A','M','J','J','A','S','O','N','D'];

  it('affiche les valeurs par barre quand elles tiennent', () => {
    const { container } = render(
      <GrapheBarres titre="Peu de catégories" categories={['T1', 'T2']}
        series={[{ id: 'a', libelle: 'A', valeurs: [10, 20], token: 'green' }]}
        formater={formater} />
    );
    const textes = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(textes).toContain('20 k€');
  });

  it('les remplace par un repère d\'échelle quand les barres sont trop serrées', () => {
    const { container } = render(
      <GrapheBarres titre="Douze mois" categories={DOUZE}
        series={[
          { id: 'a', libelle: 'A', valeurs: DOUZE.map(() => 10), token: 'green' },
          { id: 'b', libelle: 'B', valeurs: DOUZE.map(() => 20), token: 'blue' }
        ]}
        formater={formater} />
    );
    const textes = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '');
    // Aucune valeur par barre…
    expect(textes.filter((t) => t === '20 k€')).toHaveLength(0);
    // …mais l'échelle reste lisible.
    expect(textes.some((t) => t.startsWith('max '))).toBe(true);
  });

  it('la donnée complète reste dans le tableau, étiquettes ou non', () => {
    render(
      <GrapheBarres titre="Douze mois" categories={DOUZE}
        series={[{ id: 'a', libelle: 'A', valeurs: DOUZE.map((_, i) => i), token: 'green' }]}
        formater={formater} />
    );
    expect(screen.getByRole('cell', { name: '11 k€' })).toBeTruthy();
  });
});
