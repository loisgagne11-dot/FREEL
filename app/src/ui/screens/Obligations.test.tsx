/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Faits, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { chargerJeu, faitsAu, le } from '../../test/jeu-d-essai';
import { useCompteursATraiter } from '../useATraiter';
import { RailNav } from '../components/RailNav';
import { Obligations } from './Obligations';

const telecharger = vi.fn();
vi.mock('../../infra/telechargement', async (original) => ({
  ...(await original<typeof import('../../infra/telechargement')>()),
  telecharger: (...args: unknown[]) => { telecharger(...args); }
}));

afterEach(() => { cleanup(); vi.useRealTimers(); window.location.hash = ''; telecharger.mockReset(); });
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-12-15T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  window.location.hash = '#/obligations';
});

/** Le jeu d'essai au 15 décembre 2026 : un trimestre URSSAF en retard, une CFE, la facture électronique. */
const essai = (): Faits => faitsAu(chargerJeu(), le(2026, 12, 15));

const recetteSansMode = (): Recette => ({
  id: 'sans-mode', clientNom: 'Client de démonstration', libelle: 'Prestation', montant: euros(500),
  emiseLe: dateISO('2026-11-02'), encaisseeLe: dateISO('2026-11-20'), modeReglement: null, numero: 'F-ESSAI'
});

/** Ce que fait le Shell : le rail lit les compteurs par le même crochet. */
function Rail() {
  const faits = useFaits((e) => e.faits);
  const compteurs = useCompteursATraiter(faits);
  return <RailNav ecranActif="obligations" {...(compteurs === undefined ? {} : { compteurs })} />;
}

/**
 * L'EN-TÊTE (lot 53, 3a) : un titre dérivé, les années, le calendrier.
 */
describe('l’en-tête d’Obligations', () => {
  /*
   * LE TITRE ET LA PASTILLE DU RAIL COMPTENT LA MÊME CHOSE.
   *
   * Un livre des recettes incomplet n'est pas une obligation datée, mais il
   * se règle ici et le rail le compte : un titre qui compterait les seules
   * obligations à traiter dirait « trois » sous une pastille « 4 ».
   */
  it('dit le nombre de la pastille du rail', async () => {
    useFaits.setState({ faits: { ...essai(), recettes: [...essai().recettes, recetteSansMode()] } });
    render(<><Rail /><Obligations annee={2026} onAnnee={() => {}} /></>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Quatre choses à faire, dont une en retard.');
    const entree = within(screen.getByRole('navigation', { name: 'Navigation principale' }))
      .getByRole('link', { name: 'Obligations' });
    await waitFor(() => expect(entree.textContent).toContain('4'));
  });

  // Un dossier qui commence : la déclaration de juin s'ouvre en juillet.
  it('dit jusqu’à quand rien ne presse', () => {
    vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
    render(<Obligations annee={2026} onAnnee={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Rien à faire avant le 31 juillet.');
  });

  // Un menu déroulant cachait l'année regardée ; le segment la montre.
  it('offre les années qui portent une obligation, la regardée enfoncée', async () => {
    const onAnnee = vi.fn();
    useFaits.setState({ faits: essai() });
    render(<Obligations annee={2026} onAnnee={onAnnee} />);
    const segment = screen.getByRole('group', { name: 'Année' });
    expect(within(segment).getAllByRole('button').map((b) => b.textContent)).toEqual(['2025', '2026', '2027']);
    expect(within(segment).getByRole('button', { name: '2026' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(within(segment).getByRole('button', { name: '2025' }));
    expect(onAnnee).toHaveBeenCalledWith(2025);
  });

  // Sans serveur, rien ne s'abonne : le bouton le dit avant, le message après.
  it('« Ajouter au calendrier » télécharge un .ics, et dit qu’il ne se met pas à jour seul', async () => {
    useFaits.setState({ faits: essai() });
    render(<Obligations annee={2026} onAnnee={() => {}} />);
    const bouton = screen.getByRole('button', { name: 'Ajouter au calendrier' });
    expect(bouton.getAttribute('aria-describedby')).not.toBeNull();
    expect(document.getElementById(bouton.getAttribute('aria-describedby') ?? '')?.textContent)
      .toMatch(/sans serveur, il ne se met pas à jour seul/u);
    await userEvent.click(bouton);
    await waitFor(() => expect(telecharger).toHaveBeenCalledTimes(1));
    const [nom, contenu, type] = telecharger.mock.calls[0] as [string, string, string];
    expect(nom).toBe('freel-obligations-2026-12-15.ics');
    expect(type).toMatch(/^text\/calendar/u);
    expect(contenu).toMatch(/^BEGIN:VCALENDAR\r\n/u);
  });
});

describe('les registres', () => {
  it.each([
    ['Préparer ma déclaration de TVA', 'Déclaration de TVA'],
    ['Livre des recettes', 'Livre des recettes'],
    ['Déclaration européenne de services', 'Déclaration européenne de services']
  ])('ouvre « %s » en panneau', async (bouton, titre) => {
    vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
    render(<Obligations annee={2026} />);
    const registres = screen.getByRole('group', { name: 'Registres' });
    await userEvent.click(within(registres).getByRole('button', { name: bouton }));
    expect(await screen.findByRole('dialog', { name: titre })).toBeTruthy();
  });
});
