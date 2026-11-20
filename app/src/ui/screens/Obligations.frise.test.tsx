/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { type Mois, dateISO } from '../../domain/types';
import type { Etape, EtatEtape, Obligation } from '../../domain/calculs/obligations';
import { FriseObligations, marquesDeLaLigne } from './Obligations.frise';
import styles from './Obligations.module.css';

afterEach(cleanup);

const AUJ = dateISO('2026-06-10');

const etape = (etat: EtatEtape, limite: string): Etape => ({
  limite: { statut: 'publie', valeur: dateISO(limite), source: 'essai', verifieLe: dateISO(limite) },
  mois: limite.slice(0, 7) as Mois, ouverture: dateISO(`${limite.slice(0, 7)}-01`),
  faiteLe: etat === 'fait' ? dateISO(limite) : null, etat, avance: null
});

const ob = (id: string, nature: Obligation['nature'], etat: EtatEtape, limite: string): Obligation => ({
  id, nature, dossier: nature === 'des' ? 'des' : 'urssaf', libelle: id, detail: '', periode: id, montant: null,
  saisies: [], declaration: etape(etat, limite)
});

const dessin = () => screen.getByRole('img');
const classe = (nom: string): string => {
  const c = (styles as Record<string, string>)[nom];
  if (c === undefined) throw new Error(`classe ${nom} absente de Obligations.module.css`);
  return c;
};

/**
 * LA FRISE DE L'ANNÉE (lot 53, 3b).
 */
describe('la frise de l’année', () => {
  const annee = [
    ob('t4-2025', 'urssaf', 'fait', '2026-01-31'), ob('t1', 'urssaf', 'fait', '2026-04-30'),
    ob('t2', 'urssaf', 'a_venir', '2026-07-31'), ob('ca3', 'tva', 'a_faire', '2026-07-16'),
    ob('des-mars', 'des', 'en_retard', '2026-04-14')
  ];

  // Une frise est une image : à qui ne la voit pas, elle se dit en une
  // phrase — et ses nombres sont dans la liste juste en dessous.
  it('se dit en une phrase : chaque ligne, ses signes, leurs mois', () => {
    render(<FriseObligations obligations={annee} annee={2026} aujourdhui={AUJ} />);
    expect(dessin().getAttribute('aria-label')).toBe(
      'L’année 2026, URSSAF : à venir en juillet, fait en janvier et avril ; TVA : en retard en avril, à faire en juillet.'
    );
  });

  // La DES est une déclaration de TVA : une sixième ligne pour une DES par
  // an aurait fait une frise à moitié vide.
  it('a une ligne par nature présente, la DES sur la ligne TVA', () => {
    render(<FriseObligations obligations={annee} annee={2026} aujourdhui={AUJ} />);
    const noms = [...dessin().querySelectorAll(`.${classe('nomLigne')}`)].map((t) => t.textContent);
    expect(noms).toEqual(['URSSAF', 'TVA']);
  });

  // Quatre signes, et aucun ne se confond : le retard est la seule forme
  // rouge, le à-faire le seul losange.
  it('dessine ● fait, ◇ à faire, ○ à venir et ▲ en retard', () => {
    render(<FriseObligations obligations={annee} annee={2026} aujourdhui={AUJ} />);
    expect(dessin().querySelectorAll(`.${classe('plein')}`)).toHaveLength(2);
    expect(dessin().querySelectorAll(`.${classe('losange')}`)).toHaveLength(1);
    expect(dessin().querySelectorAll(`.${classe('creux')}`)).toHaveLength(1);
    expect(dessin().querySelectorAll(`.${classe('triangle')}`)).toHaveLength(1);
  });

  // Un rond gris que la légende ne nommait pas : une année d'avant le
  // schéma 25 en était couverte, sans un mot pour le lire.
  it('nomme « non suivi » dans la légende quand la frise en porte un, et seulement alors', () => {
    const { rerender } = render(<FriseObligations obligations={annee} annee={2026} aujourdhui={AUJ} />);
    expect(screen.queryByText('◌ non suivi')).toBeNull();
    rerender(
      <FriseObligations obligations={[...annee, ob('ca12', 'tva', 'non_suivi', '2026-05-05')]} annee={2026} aujourdhui={AUJ} />
    );
    expect(dessin().querySelectorAll(`.${classe('inconnu')}`)).toHaveLength(1);
    expect(screen.getByText('◌ non suivi')).toBeTruthy();
  });

  // Douze acomptes d'impôt et une CA3 au même mois se recouvraient en un
  // pâté : le mois prend le plus pressant, et son infobulle les nomme tous.
  it('ne pose qu’un signe par mois et par ligne, le plus pressant', () => {
    const juillet = [ob('ca3', 'tva', 'a_venir', '2026-07-16'), ob('des', 'des', 'en_retard', '2026-07-14')];
    const marques = marquesDeLaLigne(juillet, 'tva');
    expect(marques).toHaveLength(1);
    expect(marques[0]?.signe).toBe('en_retard');
    expect(marques[0]?.obligations).toHaveLength(2);
  });

  // Sans repère, la frise se lirait pareil en février et en novembre.
  it('met le mois courant en bande, et seulement dans l’année en cours', () => {
    render(<FriseObligations obligations={annee} annee={2026} aujourdhui={AUJ} />);
    expect(dessin().querySelectorAll(`.${classe('bande')}`)).toHaveLength(1);
    expect(dessin().querySelector(`.${classe('moisCourant')}`)?.textContent).toBe('juin');
    cleanup();
    render(<FriseObligations obligations={annee} annee={2025} aujourdhui={AUJ} />);
    expect(dessin().querySelectorAll(`.${classe('bande')}`)).toHaveLength(0);
  });

  // Le trait plein dit ce qui est tenu : jusqu'au dernier rond plein.
  it('tire le trait plein jusqu’au dernier fait', () => {
    render(<FriseObligations obligations={annee} annee={2026} aujourdhui={AUJ} />);
    const traits = dessin().querySelectorAll(`.${classe('tenu')}`);
    expect(traits).toHaveLength(1);
    const pleins = [...dessin().querySelectorAll(`.${classe('plein')}`)].map((c) => c.getAttribute('cx'));
    expect(traits[0]?.getAttribute('x2')).toBe(pleins.at(-1));
  });

  it('dit une année vide en toutes lettres', () => {
    render(<FriseObligations obligations={[]} annee={2024} aujourdhui={AUJ} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Aucune obligation en 2024.')).toBeTruthy();
  });
});

/**
 * UNE CHARGE GARDE SA COULEUR PARTOUT — ICI, SUR SA LIGNE DE FRISE.
 *
 * Le mécanisme venait du handoff ; la carte « Échéances reçues » le portait
 * par un filet, et elle est partie (lot 53). Les jetons `--c-urssaf`,
 * `--c-tva`, `--c-impot`, `--c-cfe` ont longtemps existé sans être câblés
 * nulle part : jsdom n'applique pas les modules CSS, on lit donc la feuille —
 * un plancher, mais qui échoue si quelqu'un décâble.
 */
describe('câblage des jetons de couleur de la frise', () => {
  it('lie chaque ligne à son jeton de charge', async () => {
    const { readFile } = await import('node:fs/promises');
    const feuille = await readFile('src/ui/screens/Obligations.module.css', 'utf8');
    for (const [ligne, jeton] of [['urssaf', '--c-urssaf'], ['tva', '--c-tva'], ['impot', '--c-impot'], ['cfe', '--c-cfe']]) {
      expect(new RegExp(`\\.${ligne} \\{ --teinte: var\\(${jeton}\\); \\}`, 'u').test(feuille), `${ligne} → ${jeton}`).toBe(true);
    }
    // Le signe plein et le trait tenu prennent la teinte de leur ligne.
    expect(/\.plein \{ fill: var\(--teinte\)/u.test(feuille)).toBe(true);
    expect(/\.tenu \{ stroke: var\(--teinte\)/u.test(feuille)).toBe(true);
  });
});
