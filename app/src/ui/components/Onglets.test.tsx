/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Onglets, PanneauOnglet } from './Onglets';

afterEach(cleanup);

type Section = 'tres' | 'perf';

const ONGLETS = [
  { id: 'tres' as Section, libelle: 'Trésorerie' },
  { id: 'perf' as Section, libelle: 'Performance' }
];

const ID = 'groupe';

function Hote() {
  const [actif, setActif] = useState<Section>('tres');
  return (
    <>
      <button type="button">Avant</button>
      <Onglets
        idGroupe={ID}
        onglets={ONGLETS}
        actif={actif}
        onChange={setActif}
        libelle="Sections de l’écran Argent"
      />
      <PanneauOnglet idGroupe={ID} id="tres" actif={actif === 'tres'}>
        Contenu trésorerie
      </PanneauOnglet>
      <PanneauOnglet idGroupe={ID} id="perf" actif={actif === 'perf'}>
        Contenu performance
      </PanneauOnglet>
    </>
  );
}

describe('sémantique d\'onglets', () => {
  // Le prototype posait des div cliquables : un lecteur d'écran annonçait une
  // suite de textes sans dire qu'il s'agissait d'un choix.
  it('expose une liste d\'onglets nommée', () => {
    render(<Hote />);
    expect(screen.getByRole('tablist', { name: 'Sections de l’écran Argent' })).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('marque l\'onglet actif par aria-selected', () => {
    render(<Hote />);
    expect(screen.getByRole('tab', { name: 'Trésorerie' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Performance' }).getAttribute('aria-selected')).toBe('false');
  });

  it('relie chaque onglet à son panneau, dans les deux sens', () => {
    render(<Hote />);
    const onglet = screen.getByRole('tab', { name: 'Trésorerie' });
    const panneau = screen.getByRole('tabpanel');

    expect(onglet.getAttribute('aria-controls')).toBe(panneau.id);
    expect(panneau.getAttribute('aria-labelledby')).toBe(onglet.id);
  });

  it('n\'affiche que le panneau actif', () => {
    render(<Hote />);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel').textContent).toBe('Contenu trésorerie');
  });
});

describe('ordre de tabulation', () => {
  // La règle contre-intuitive du modèle ARIA : un seul onglet est tabulable.
  // Sans cela, franchir un groupe de six onglets imposerait six tabulations.
  it('un seul onglet est dans l\'ordre de tabulation', () => {
    render(<Hote />);
    expect(screen.getByRole('tab', { name: 'Trésorerie' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'Performance' }).getAttribute('tabindex')).toBe('-1');
  });

  it('l\'onglet tabulable suit l\'onglet actif', async () => {
    const u = userEvent.setup();
    render(<Hote />);
    await u.click(screen.getByRole('tab', { name: 'Performance' }));
    expect(screen.getByRole('tab', { name: 'Performance' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'Trésorerie' }).getAttribute('tabindex')).toBe('-1');
  });

  it('Tab entre dans le groupe puis dans le panneau, sans parcourir chaque onglet', async () => {
    const u = userEvent.setup();
    render(<Hote />);
    await u.tab(); // « Avant »
    await u.tab(); // l'onglet actif
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Trésorerie' }));
    await u.tab(); // le panneau, pas le second onglet
    expect(document.activeElement).toBe(screen.getByRole('tabpanel'));
  });
});

describe('navigation aux flèches', () => {
  it('la flèche droite passe à l\'onglet suivant et l\'active', async () => {
    const u = userEvent.setup();
    render(<Hote />);
    await u.click(screen.getByRole('tab', { name: 'Trésorerie' }));
    await u.keyboard('{ArrowRight}');

    const perf = screen.getByRole('tab', { name: 'Performance' });
    expect(perf.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(perf);
    expect(screen.getByRole('tabpanel').textContent).toBe('Contenu performance');
  });

  it('la flèche gauche revient en arrière', async () => {
    const u = userEvent.setup();
    render(<Hote />);
    await u.click(screen.getByRole('tab', { name: 'Performance' }));
    await u.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Trésorerie' }).getAttribute('aria-selected')).toBe('true');
  });

  // Le bouclage évite le cul-de-sac : arrivé au bout, on repart au début.
  it('boucle aux deux extrémités', async () => {
    const u = userEvent.setup();
    render(<Hote />);
    await u.click(screen.getByRole('tab', { name: 'Performance' }));
    await u.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Trésorerie' }).getAttribute('aria-selected')).toBe('true');

    await u.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Performance' }).getAttribute('aria-selected')).toBe('true');
  });

  it('Origine et Fin vont au premier et au dernier onglet', async () => {
    const u = userEvent.setup();
    render(<Hote />);
    await u.click(screen.getByRole('tab', { name: 'Trésorerie' }));
    await u.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Performance' }).getAttribute('aria-selected')).toBe('true');
    await u.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Trésorerie' }).getAttribute('aria-selected')).toBe('true');
  });

  it('ignore les touches qui ne concernent pas la navigation', async () => {
    const u = userEvent.setup();
    render(<Hote />);
    await u.click(screen.getByRole('tab', { name: 'Trésorerie' }));
    await u.keyboard('{ArrowDown}');
    expect(screen.getByRole('tab', { name: 'Trésorerie' }).getAttribute('aria-selected')).toBe('true');
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Le compte de chaque onglet
   ───────────────────────────────────────────────────────────────────────── */

describe('compte affiché sur un onglet', () => {
  const avecComptes = [
    { id: 'charge' as const, libelle: 'Plan de charge' },
    { id: 'missions' as const, libelle: 'Missions', compte: 5 },
    { id: 'clients' as const, libelle: 'Clients', compte: 0 }
  ];

  const rendre = () => render(
    <Onglets
      idGroupe="t"
      onglets={avecComptes}
      actif="charge"
      onChange={() => { /* testé ailleurs */ }}
      libelle="Sections"
    />
  );

  /**
   * LE COMPTE ENTRE DANS LE NOM ACCESSIBLE, ET C'EST VOULU.
   *
   * La pastille n'est pas `aria-hidden` : son nombre rejoint naturellement le
   * nom de l'onglet. La masquer aurait obligé à le redire hors écran, donc à
   * maintenir deux fois la même valeur — et un lecteur d'écran aurait fini par
   * entendre « Missions 5, 5 » le jour où l'une des deux aurait été oubliée.
   */
  it('joint le compte au nom de l’onglet', () => {
    rendre();
    expect(screen.getByRole('tab', { name: 'Missions 5' })).toBeTruthy();
  });

  /**
   * ZÉRO EST UNE RÉPONSE, ET IL S'AFFICHE.
   *
   * « Clients 0 » dit qu'il n'y en a pas encore. Une pastille absente laisserait
   * croire que le compte n'est pas su — deux situations que rien ne
   * distinguerait ensuite.
   */
  it('affiche zéro plutôt que de taire le compte', () => {
    rendre();
    expect(screen.getByRole('tab', { name: 'Clients 0' })).toBeTruthy();
  });

  /**
   * Un onglet qui n'est pas une liste n'a pas de compte. Une pastille sur
   * « Plan de charge » afficherait un nombre dont on chercherait ce qu'il
   * dénombre.
   */
  it('ne pose aucune pastille sur un onglet qui ne se compte pas', () => {
    rendre();
    expect(screen.getByRole('tab', { name: 'Plan de charge' })).toBeTruthy();
  });
});
