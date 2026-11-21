/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Faits, type Mission, completerFaitsCourants, faitsVides } from '../../state/schema';
import { entiteVide } from '../../state/schema.entite';
import { useFaits } from '../../state/store';
import { eur } from '../format';
import { Tresorerie } from './Tresorerie';

afterEach(() => { cleanup(); vi.useRealTimers(); window.location.hash = ''; });
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  window.location.hash = '#/tresorerie';
});

const DEMO = completerFaitsCourants(
  JSON.parse(readFileSync('public/jeu-de-demonstration.json', 'utf8')) as Record<string, unknown>
);

function poser(m: Partial<Faits> = {}): void {
  useFaits.setState({
    faits: {
      ...faitsVides(),
      entreprise: { ...faitsVides().entreprise, urssafPeriodicite: 'trimestriel' },
      soldeInitial: euros(10_000),
      soldeInitialAu: dateISO('2026-01-01'),
      ...m
    } as Faits
  });
}

/** La valeur d'une ligne de la cascade : le `<dd>` qui suit son libellé. */
function ligneCascade(libelle: RegExp): string {
  const carte = screen.getByRole('region', { name: 'Du solde à ce que tu peux te verser' });
  const dt = within(carte).getAllByRole('term').find((t) => libelle.test(t.textContent ?? ''));
  return dt?.nextElementSibling?.textContent ?? '';
}

const attendreLaVue = () => screen.findByRole('heading', { name: 'Du solde à ce que tu peux te verser' });

/**
 * LES NOMBRES DE LA MAQUETTE SONT CEUX DE LA DÉMONSTRATION.
 *
 * `direction/tresorerie.html` a été dessinée sur ce jeu, au 10 juin 2026 : si
 * un calcul changeait l'un d'eux, la capture cesserait de se comparer à la
 * maquette — et c'est la maquette qui serait accusée.
 */
describe('la démonstration, au 10 juin 2026', () => {
  beforeEach(() => { useFaits.setState({ faits: DEMO }); });

  it('descend du solde à ce que tu peux te verser : 11 996, 1 999, 9 997, 2 470, 7 527', async () => {
    render(<Tresorerie />);
    await attendreLaVue();
    expect(ligneCascade(/Solde du compte/)).toBe(eur(11_996));
    expect(ligneCascade(/Dû, à garder de côté/)).toBe(eur(1_999));
    expect(ligneCascade(/Disponible/)).toBe(eur(9_997));
    expect(ligneCascade(/Réserve de sécurité/)).toBe(eur(2_470));
    expect(ligneCascade(/À te verser/)).toBe(eur(7_527));
  });

  it('dit le dû par charge : URSSAF et formation 1 685, impôt 285, TVA 29, CFE 0', async () => {
    render(<Tresorerie />);
    await attendreLaVue();
    const du = screen.getByRole('region', { name: 'Ce qui est dû' });
    expect(within(du).getByText('● Tout est couvert')).toBeTruthy();
    const ligne = (nom: RegExp) => within(du).getByRole('button', { name: nom }).textContent ?? '';
    expect(ligne(/^URSSAF et formation/)).toContain(eur(1_685));
    expect(ligne(/^URSSAF et formation/)).toMatch(/Sur tes encaissements depuis avril · à payer le 31 juillet/);
    expect(ligne(/^Impôt sur le revenu/)).toContain(eur(285));
    expect(ligne(/^Impôt sur le revenu/)).toMatch(/Versement libératoire, payé avec l’URSSAF/);
    expect(ligne(/^TVA à reverser/)).toContain(eur(29));
    expect(ligne(/^CFE/)).toMatch(/Avis en novembre · rien à garder avant/);
  });

  it('met le versement tenable en titre : 1 896 € par mois jusqu’en mai 2027', async () => {
    render(<Tresorerie />);
    expect((await screen.findByRole('heading', { name: /^Tu peux te verser/ })).textContent)
      .toBe(`Tu peux te verser ${eur(1_896)} par mois jusqu’en mai 2027`);
    expect(screen.getByText(/C’est mai qui limite/)).toBeTruthy();
  });

  it('dit le versé du mois, le besoin et l’autonomie au pied de la cascade', async () => {
    render(<Tresorerie />);
    await attendreLaVue();
    const pied = screen.getByText(/Déjà versé en juin/).textContent ?? '';
    expect(pied).toContain(`Ton besoin est de ${eur(2_300)} par mois`);
    expect(pied).toMatch(/de quoi tenir 3,3 mois/u);
  });

  /*
   * La phrase de juillet : ce qui entre (factures émises, planning signé),
   * ce qui sort (pour toi, l'URSSAF à sa date, les dépenses). Sans elle, les
   * barres disent qu'un mois est lourd sans dire pourquoi.
   */
  it('écrit la phrase du mois choisi sous les barres, et les flèches changent de mois', async () => {
    render(<Tresorerie />);
    const carte = (await screen.findByRole('heading', { name: /Ce qui entre et ce qui sort/ })).closest('section') as HTMLElement;
    const phrase = () => within(carte).getByText(/^Juillet|^Août/).parentElement?.textContent ?? '';
    expect(phrase()).toMatch(/^Juillet — .*de factures à échéance.*du planning signé\. Il sort .* pour toi, .* d’URSSAF le 31 et .* de dépenses/u);
    fireEvent.keyDown(within(carte).getByRole('img'), { key: 'ArrowRight' });
    expect(phrase()).toMatch(/^Août/u);
  });

  it('ouvre « Le détail de juillet » en tableau, sans quitter la carte', async () => {
    render(<Tresorerie />);
    await userEvent.click(await screen.findByRole('button', { name: 'Le détail de juillet' }));
    const table = screen.getByRole('table', { name: /Le détail de juillet/ });
    expect(within(table).getByText(/URSSAF, le 31/)).toBeTruthy();
    expect(within(table).getByText('Net du mois')).toBeTruthy();
  });

  it('montre les trois seuils, leurs deux dates et les jours facturables', async () => {
    render(<Tresorerie />);
    const carte = (await screen.findByRole('heading', { name: 'Tes seuils de l’année' })).closest('section') as HTMLElement;
    expect(within(carte).getByText('Plafond micro-BNC')).toBeTruthy();
    const franchise = within(carte).getByText('Franchise de TVA').parentElement?.textContent ?? '';
    expect(franchise).toMatch(/Par ce qui est émis et signé\s?: franchi en août 2026/u);
    expect(franchise).toMatch(/Au rythme de l’encaissé depuis janvier\s?: vers septembre 2026/u);
    expect(franchise).toMatch(/◇ encore 29 jours facturables/u);
  });
});

describe('la cascade', () => {
  /*
   * Solde 10 000 €, réserve 4 000 €, rien de dû : on peut se verser 6 000 €,
   * en entier — jamais la réserve avec.
   */
  it('propose ce qui dépasse la réserve, jamais la réserve avec', async () => {
    poser({ reserve: euros(4_000) });
    render(<Tresorerie />);
    await attendreLaVue();
    expect(ligneCascade(/À te verser/)).toBe(eur(6_000));
  });

  /* Une réserve que le disponible ne couvre pas se montre à ce qu'elle est : pleine, elle mentirait. */
  it('borne la réserve à ce que le disponible permet, et le dit', async () => {
    poser({ soldeInitial: euros(1_000), reserve: euros(4_000) });
    render(<Tresorerie />);
    await attendreLaVue();
    expect(ligneCascade(/Réserve de sécurité/)).toBe(eur(1_000));
    expect(screen.getByText(/constituée sur/).textContent).toContain(eur(4_000));
  });

  /*
   * Un disponible négatif ne se borne pas : c'est le signal le plus fort de
   * l'écran. Sans la phrase, « 0 € à te verser » ne dirait pas si c'est le
   * réglage ou le compte qui l'impose.
   */
  it('dit qu’un disponible négatif est la cause, au lieu de laisser lire zéro', async () => {
    poser({
      soldeInitial: euros(500),
      echeances: [{ id: 'e1', nature: 'urssaf', montant: euros(3_000), montantPaye: null, echeanceLe: dateISO('2026-07-05'), payeeLe: null }]
    });
    render(<Tresorerie />);
    await attendreLaVue();
    expect(ligneCascade(/Disponible/)).toBe(eur(-2_500));
    expect(screen.getByText(/disponible est/).textContent).toMatch(/négatif.*dépasse le solde/u);
    expect(screen.getByText(/non couverts/).textContent).toContain(eur(2_500));
  });

  /* Un besoin à zéro ne se divise pas : ni besoin, ni autonomie — jamais « Infinity ». */
  it('ne dit ni besoin ni autonomie sans besoin mensuel', async () => {
    poser();
    render(<Tresorerie />);
    await attendreLaVue();
    const pied = screen.getByText(/Déjà versé en juin/).textContent ?? '';
    expect(pied).not.toMatch(/besoin|tenir|Infinity/u);
  });

  /* Sans relevé, le versé est INCONNU, pas nul. */
  it('ne dit pas « 0 € » versé sans relevé', async () => {
    poser();
    render(<Tresorerie />);
    await attendreLaVue();
    expect(screen.getByText(/Déjà versé en juin/).textContent).toMatch(/à lire sur ton relevé/u);
  });

  it('dit d’où vient le solde : une date à poser, ou le relevé', async () => {
    poser({ soldeInitialAu: null });
    render(<Tresorerie />);
    await attendreLaVue();
    expect(screen.getByText(/date-le dans Réglages/)).toBeTruthy();
  });

  /* Les quatre chiffres s'enchaînent : chacun s'ouvre sur sa formule, comme au Pilote. */
  it('ouvre la formule du solde au clic sur son libellé', async () => {
    poser();
    render(<Tresorerie />);
    await attendreLaVue();
    await userEvent.click(screen.getByRole('button', { name: /Solde du compte : d’où vient ce chiffre/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  /*
   * LE BOUTON NE CRÉE PAS DE FAIT : le virement figure déjà au relevé. Le
   * dialogue garde l'aide, et le geste reste « pointer au relevé ».
   */
  it('« Verser sur mon compte » renvoie au relevé, avec son aide, sans rien enregistrer', async () => {
    poser();
    render(<Tresorerie />);
    await attendreLaVue();
    await userEvent.click(screen.getByRole('button', { name: 'Verser sur mon compte' }));
    const dialogue = screen.getByRole('dialog', { name: 'Verser sur mon compte' });
    expect(within(dialogue).getByText(/il n’y a rien à saisir, il n’y a qu’à le nommer/)).toBeTruthy();
    await userEvent.click(within(dialogue).getByRole('button', { name: 'Pointer le versement au relevé' }));
    // `#/tresorerie/releve` est un geste : le relevé s'ouvre, l'adresse redevient celle de l'écran.
    expect(await screen.findByRole('dialog', { name: 'Relevé bancaire' })).toBeTruthy();
    expect(useFaits.getState().faits.mouvementsBancaires).toEqual([]);
  });

  it('rend chaque montant masquable', async () => {
    poser();
    render(<Tresorerie />);
    await attendreLaVue();
    const carte = screen.getByRole('region', { name: 'Du solde à ce que tu peux te verser' });
    for (const dd of within(carte).getAllByRole('definition')) expect(dd.querySelector('[data-montant]')).toBeTruthy();
  });
});

describe('ce qui est dû', () => {
  /* La CFE n'a pas d'avis avant novembre : une ligne qui disparaît ferait croire que la dette n'existe pas. */
  it('garde ses quatre lignes, même à zéro', async () => {
    poser();
    render(<Tresorerie />);
    await attendreLaVue();
    const du = screen.getByRole('region', { name: 'Ce qui est dû' });
    expect(within(du).getAllByRole('listitem')).toHaveLength(4);
  });

  /*
   * Le détail des enveloppes reste à un clic : les deux volets, ce que le
   * solde couvre, le mois par mois — sans quoi un total ne se vérifie pas
   * contre l'avis reçu.
   */
  it('ouvre le détail d’une ligne : les volets du dû, ce qui est couvert, le mois par mois', async () => {
    poser({ recettes: [{ id: 'r1', clientNom: 'Client', libelle: 'Prestation', montant: euros(3_000),
      emiseLe: dateISO('2026-04-01'), encaisseeLe: dateISO('2026-04-10'), modeReglement: 'virement', numero: 'F1' }] });
    render(<Tresorerie />);
    await attendreLaVue();
    await userEvent.click(screen.getByRole('button', { name: /^URSSAF et formation/ }));
    const dialogue = screen.getByRole('dialog', { name: 'URSSAF et formation — le détail' });
    expect(await within(dialogue).findByText('Charges sur recettes encaissées non déclarées')).toBeTruthy();
    expect(within(dialogue).getByText(/Couvert par le solde/)).toBeTruthy();
  });

  /* Un impôt refusé laisse la ligne à zéro : le détail dit pourquoi, sans quoi « à te verser » est trop haut sans un mot. */
  it('dit pourquoi l’impôt n’est pas compté quand les parts manquent', async () => {
    poser({ recettes: [{ id: 'r1', clientNom: 'Client', libelle: 'Prestation', montant: euros(3_000),
      emiseLe: dateISO('2026-04-01'), encaisseeLe: dateISO('2026-04-10'), modeReglement: 'virement', numero: 'F1' }] });
    render(<Tresorerie />);
    await attendreLaVue();
    await userEvent.click(screen.getByRole('button', { name: /^Impôt sur le revenu/ }));
    const dialogue = screen.getByRole('dialog', { name: 'Impôt sur le revenu — le détail' });
    expect(await within(dialogue).findByText(/parts/i)).toBeTruthy();
  });
});

/**
 * LES « ET SI » (lot 49, phase D) — un état d'écran, jamais un fait.
 */
describe('les « et si »', () => {
  const mission = (id: string, statut: Mission['statut'], du: string, au: string): Mission => ({
    id, clientId: null, clientNom: 'Client d’essai', description: id === 'p' ? 'Catalogue' : 'Refonte',
    tjm: euros(500), debut: dateISO(du), fin: dateISO(au), statut, probabilite: statut === 'prospect' ? 40 : null,
    entites: [{ ...entiteVide(), id: `${id}-co1`, nom: 'Client d’essai',
      rythmes: [{ du: dateISO(du), au: dateISO(au), parJour: { lun: 1, mar: 1, mer: 1 }, tjm: null, facturerA: null }] }]
  });
  const avecProspect = () => poser({
    reserve: euros(2_000),
    missions: [mission('s', 'active', '2026-06-01', '2026-12-31'), mission('p', 'prospect', '2026-09-01', '2026-11-30')]
  });

  it('comptent le prospect quand on le demande, le titre le dit, et rien n’est enregistré', async () => {
    avecProspect();
    const avant = JSON.stringify(useFaits.getState().faits);
    render(<Tresorerie />);
    const bouton = await screen.findByRole('button', { name: '+ Compter le prospect' });
    expect(bouton.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(bouton);
    expect(bouton.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: /^Si le prospect est signé, tu pourrais te verser/ })).toBeTruthy();
    expect(screen.getByText(/Sans «\s?et si\s?»/u)).toBeTruthy();
    expect(JSON.stringify(useFaits.getState().faits)).toBe(avant);
  });

  /* Remis à zéro en quittant l'écran : un « et si » oublié afficherait une trésorerie qui n'existe pas. */
  it('se remettent à zéro en quittant l’écran', async () => {
    avecProspect();
    const { unmount } = render(<Tresorerie />);
    const bouton = await screen.findByRole('button', { name: '+ Compter le prospect' });
    expect(bouton.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(bouton);
    expect(bouton.getAttribute('aria-pressed')).toBe('true');
    unmount();
    render(<Tresorerie />);
    expect((await screen.findByRole('button', { name: '+ Compter le prospect' })).getAttribute('aria-pressed')).toBe('false');
  });

  it('arrêtent une mission à une date choisie', async () => {
    avecProspect();
    render(<Tresorerie />);
    await userEvent.click(await screen.findByRole('button', { name: 'Et si une mission s’arrête…' }));
    const formulaire = screen.getByRole('form', { name: 'Et si une mission s’arrête' });
    fireEvent.change(within(formulaire).getByLabelText(/s’arrête le/), { target: { value: '2026-08-31' } });
    await userEvent.click(within(formulaire).getByRole('button', { name: 'Voir' }));
    expect(screen.getByRole('heading', { name: /^Si Refonte s’arrête le 31 août/ })).toBeTruthy();
  });
});

describe('le tableau', () => {
  it('« Voir en tableau » donne les mêmes nombres, « Dans un an » et les hypothèses', async () => {
    useFaits.setState({ faits: DEMO });
    render(<Tresorerie />);
    await userEvent.click(await screen.findByRole('button', { name: 'Voir en tableau' }));
    expect(await screen.findByRole('table', { name: /Trésorerie, mois par mois/ })).toBeTruthy();
    expect(screen.getByText(/Dans un an/).textContent).toMatch(/sans rien te verser.*en t’étant versé/u);
    expect(screen.getByText(/Dépenses courantes/)).toBeTruthy();
  });

  /*
   * Au barème et redevable (le jeu d'essai, au 15 décembre), le dû grandit de
   * plus que le taux : l'impôt sur le revenu et la TVA des encaissements à
   * venir (lot 50). La phrase du taux seule les tairait ; la démonstration,
   * sous le versement libératoire et en franchise, n'en dit rien.
   */
  it('dit l’impôt et la TVA que les encaissements à venir ajoutent au dû', async () => {
    vi.setSystemTime(new Date('2026-12-15T09:00:00Z'));
    useFaits.setState({
      faits: completerFaitsCourants(JSON.parse(readFileSync('src/test/jeu-d-essai.json', 'utf8')) as Record<string, unknown>)
    });
    render(<Tresorerie />);
    await userEvent.click(await screen.findByRole('button', { name: 'Voir en tableau' }));
    expect((await screen.findByText(/S’y ajoute l’impôt sur le revenu/)).textContent).toMatch(/à l’automne suivant/);
    expect(screen.getByText(/La TVA encaissée/).textContent).toMatch(/déclaration qui la reverse/);
  });

  it('n’en dit rien sous le versement libératoire et en franchise', async () => {
    useFaits.setState({ faits: DEMO });
    render(<Tresorerie />);
    await userEvent.click(await screen.findByRole('button', { name: 'Voir en tableau' }));
    await screen.findByRole('table', { name: /Trésorerie, mois par mois/ });
    expect(screen.queryByText(/S’y ajoute l’impôt/)).toBeNull();
    expect(screen.queryByText(/La TVA encaissée/)).toBeNull();
  });

  /* Sans trois mois d'historique, la projection ignore les dépenses : elle est trop haute, et le dit. */
  it('dit que les dépenses courantes ne sont pas estimées, faute d’historique', async () => {
    poser();
    render(<Tresorerie />);
    await userEvent.click(await screen.findByRole('button', { name: 'Voir en tableau' }));
    expect(await screen.findByText(/Dépenses courantes non estimées/)).toBeTruthy();
  });
});

/**
 * TES SEUILS DE L'ANNÉE — reprise des règles de l'ancienne carte « Seuils » :
 * l'abstention dite, le seuil dépassé qui ne projette plus, la redevabilité
 * venue de l'an dernier.
 */
describe('les seuils', () => {
  const carte = async () =>
    (await screen.findByRole('heading', { name: 'Tes seuils de l’année' })).closest('section') as HTMLElement;
  const encaisse = (montant: number, le: string) => ({
    id: `r-${le}`, clientNom: 'Client', libelle: 'Prestation', montant: euros(montant),
    emiseLe: dateISO(le), encaisseeLe: dateISO(le), modeReglement: 'virement' as const, numero: le
  });

  it('dit pourquoi il ne projette pas au rythme, au lieu d’afficher une date', async () => {
    vi.setSystemTime(new Date('2026-02-10T09:00:00Z'));
    poser({ recettes: [encaisse(5_000, '2026-01-20')] });
    render(<Tresorerie />);
    expect((await carte()).textContent).toMatch(/pas de projection, moins d’un trimestre/u);
  });

  it('ne projette rien sur un seuil déjà franchi', async () => {
    poser({ recettes: [encaisse(40_000, '2026-03-10')] });
    render(<Tresorerie />);
    const franchise = within(await carte()).getByText('Franchise de TVA').parentElement?.textContent ?? '';
    expect(franchise).toMatch(/▲ Seuil franchi/u);
    expect(franchise).not.toMatch(/Par ce qui est émis/u);
  });

  /* Un encaissement de l'an dernier au-delà de la franchise : les anneaux ne regardent que cette année, seule la phrase le dit. */
  it('dit être redevable depuis le 1ᵉʳ janvier quand l’an dernier a déjà dépassé la franchise', async () => {
    poser({ soldeInitialAu: dateISO('2025-01-01'), recettes: [encaisse(45_000, '2025-06-10')] });
    render(<Tresorerie />);
    expect((await carte()).textContent).toMatch(/Redevable de la TVA depuis le 1ᵉʳ janvier 2026/u);
  });

  /* Sans mission signée qui porte un tarif, pas de « jour » à compter : on le dit plutôt que de diviser par un tarif inventé. */
  it('s’abstient sur les jours facturables sans tarif, avec son motif', async () => {
    poser({ recettes: [encaisse(10_000, '2026-03-10')] });
    render(<Tresorerie />);
    expect((await carte()).textContent).toMatch(/Jours facturables\s?: pas de calcul, aucune mission signée/u);
  });
});

/*
 * Un trimestre dont la limite est passée presse plus que le suivant : la
 * ligne le dit en premier. Le jeu d'essai, au 15 décembre, cachait son
 * troisième trimestre non déclaré derrière « à payer le 1ᵉʳ février ».
 */
describe('une charge en retard', () => {
  it('se dit « était à payer », avant la suivante', async () => {
    vi.setSystemTime(new Date('2026-12-15T09:00:00Z'));
    poser({
      recettes: [
        { id: 'r1', clientNom: 'Client', libelle: 'Prestation', montant: euros(3_000), emiseLe: dateISO('2026-08-01'),
          encaisseeLe: dateISO('2026-08-10'), modeReglement: 'virement', numero: 'F1' },
        { id: 'r2', clientNom: 'Client', libelle: 'Prestation', montant: euros(3_000), emiseLe: dateISO('2026-11-01'),
          encaisseeLe: dateISO('2026-11-10'), modeReglement: 'virement', numero: 'F2' }
      ]
    });
    render(<Tresorerie />);
    await attendreLaVue();
    expect(screen.getByRole('button', { name: /^URSSAF et formation/ }).textContent)
      .toMatch(/Sur tes encaissements depuis août · ▲ était à payer le 31 octobre/u);
  });
});
