/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import type { Echeance } from '../../domain/calculs/provisions';
import { type Faits, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { etatPilote } from '../../state/selecteurs';
import { FournisseurToasts } from '../components/Toasts';
import { Obligations } from './Obligations';
import { Tresorerie } from './Tresorerie';

/**
 * LES GESTES DES DEUX ANCIENNES CARTES, À LEUR NOUVELLE PLACE (lot 53, 3d).
 *
 * « Échéances reçues » et « Périodes URSSAF » portaient chacune leurs
 * boutons ; leurs tests sont repris ici, geste pour geste, à travers l'écran
 * — la liste, le dossier à droite, la saisie au clic. Un geste que ces tests
 * ne trouvent plus serait une fonction perdue, pas un test à retirer.
 */

// Le pli de la liste se garde d'un rendu à l'autre : un test qui la replie
// ne doit pas la laisser repliée au suivant.
afterEach(() => { cleanup(); vi.useRealTimers(); window.location.hash = ''; window.localStorage.clear(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-13T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
  window.location.hash = '#/obligations';
});

const echeance = (p: Partial<Echeance> & { readonly id: string }): Echeance => ({
  nature: 'urssaf', montant: euros(2400), echeanceLe: dateISO('2026-09-05'),
  payeeLe: null, montantPaye: null, ...p
});

const encaissee = (id: string, le: string): Recette => ({
  id, clientNom: 'Client', libelle: 'Prestation', montant: euros(3000),
  emiseLe: dateISO('2026-04-01'), encaisseeLe: dateISO(le),
  modeReglement: 'virement', numero: `2026-${id}`
});

function semer(modifications: Partial<Faits> = {}): void {
  useFaits.setState({
    faits: {
      ...faitsVides(),
      entreprise: { ...faitsVides().entreprise, urssafPeriodicite: 'trimestriel' },
      ...modifications
    }
  });
}

const rendre = () => render(<FournisseurToasts><Obligations annee={2026} onAnnee={() => {}} /></FournisseurToasts>);

const dossier = () => screen.getByRole('region', { name: 'Dossier' });
const carteListe = () => screen.getByRole('button', { name: /^À faire et à venir/u }).closest('section') as HTMLElement;

/** Ouvre le dossier d'une ligne, et attend qu'il soit arrivé. */
async function ouvrir(nom: RegExp, u = userEvent.setup()): Promise<HTMLElement> {
  await u.click(within(carteListe()).getByRole('button', { name: nom }));
  const titre = await within(dossier()).findByRole('heading', { name: nom });
  return titre.closest('section') as HTMLElement;
}

/** « + Saisir », et le formulaire chargé. */
async function saisir(u = userEvent.setup()): Promise<HTMLElement> {
  await u.click(within(carteListe()).getByRole('button', { name: '+ Saisir' }));
  const panneau = await screen.findByRole('dialog', { name: 'Saisir une échéance' });
  await within(panneau).findByLabelText('Nature');
  return panneau;
}

/* ═════════════════════════════════════════════════════════════════════════
   Périodes URSSAF → le dossier URSSAF
   ═════════════════════════════════════════════════════════════════════════ */

/** Ouvre le geste « Déclarée le … pour … € » et l'enregistre tel que prérempli. */
async function declarerTelQuel(d: HTMLElement, u = userEvent.setup()): Promise<void> {
  await u.click(within(d).getByRole('button', { name: 'Je l’ai déclarée le…' }));
  await u.click(within(d).getByRole('button', { name: 'Enregistrer la déclaration' }));
}

describe('le dossier URSSAF', () => {
  it('marque les trois mois d’un trimestre d’un seul geste', async () => {
    semer({ recettes: [encaissee('r1', '2026-04-10')] });
    rendre();
    await declarerTelQuel(await ouvrir(/URSSAF, T2 2026/u));
    // Les trois mois, et la date du jour sur chacun : on la remplit en
    // sortant du site de l'URSSAF.
    expect(useFaits.getState().faits.periodesDeclarees).toEqual([
      { nature: 'urssaf', periode: '2026-04', declareeLe: '2026-08-13' },
      { nature: 'urssaf', periode: '2026-05', declareeLe: '2026-08-13' },
      { nature: 'urssaf', periode: '2026-06', declareeLe: '2026-08-13' }
    ]);
  });

  /* La période se déclare sous Obligations, la dette se lit sous la
     Trésorerie : les deux écrans montés ensemble, pour voir l'une suivre l'autre. */
  /* Lu sur la Trésorerie (lot 49) : la ligne « URSSAF et formation » dit
     d'où vient sa dette — des encaissements pas encore déclarés, puis l'appel
     que la déclaration a créé. */
  it('fait basculer la dette d’un volet à l’autre', async () => {
    semer({ recettes: [encaissee('r1', '2026-04-10')] });
    render(<FournisseurToasts><Tresorerie /></FournisseurToasts>);
    const ligne = () => screen.getByRole('button', { name: /^URSSAF et formation/u });
    await screen.findByRole('heading', { name: 'Ce qui est dû' });
    rendre();
    const d = await ouvrir(/URSSAF, T2 2026/u);
    expect(ligne().textContent).toMatch(/Sur tes encaissements depuis avril/u);
    await declarerTelQuel(d);
    expect(ligne().textContent).toMatch(/Appel reçu/u);
  });

  /* L'appel créé par la déclaration part avec elle — sinon il resterait dans
     le dû en plus de l'estimation qui revient : sa disparition se confirme. */
  it('revient sur une déclaration marquée par erreur, avec son appel', async () => {
    semer({ recettes: [encaissee('r1', '2026-04-10')] });
    rendre();
    const u = userEvent.setup();
    const d = await ouvrir(/URSSAF, T2 2026/u, u);
    await declarerTelQuel(d, u);
    await u.click(within(d).getByRole('button', { name: /Annuler la déclaration/u }));
    expect(within(d).getByText(/quitte le dû/u)).toBeTruthy();
    await u.click(within(d).getByRole('button', { name: 'Annuler la déclaration' }));
    expect(useFaits.getState().faits.periodesDeclarees).toEqual([]);
    expect(useFaits.getState().faits.echeances).toEqual([]);
  });

  // L'URSSAF ouvre la déclaration après la clôture : cocher un trimestre en
  // cours sortirait du volet « à provisionner » ce qu'on va encore encaisser.
  it('ne propose pas de déclarer une période en cours', async () => {
    semer({ recettes: [encaissee('r1', '2026-08-05')] });
    rendre();
    const d = await ouvrir(/URSSAF, T3 2026/u);
    expect(within(d).queryByRole('button', { name: 'Je l’ai déclarée le…' })).toBeNull();
    expect(within(d).getByText(/Période en cours, pas encore déclarable/u)).toBeTruthy();
  });

  // Sans recette ni début d'activité, rien n'est à déclarer : aucune période
  // URSSAF n'attend de geste.
  it('ne demande aucune déclaration tant que rien n’est encaissé', () => {
    semer();
    rendre();
    const urssaf = within(carteListe()).getAllByRole('button', { name: /URSSAF/u });
    expect(urssaf.length).toBeGreaterThan(0);
    expect(urssaf.every((b) => !/À déclarer|En retard/u.test(b.textContent ?? ''))).toBe(true);
  });

  it('suit la périodicité déclarée dans Réglages', async () => {
    semer({
      entreprise: { ...faitsVides().entreprise, urssafPeriodicite: 'mensuel' },
      recettes: [encaissee('r1', '2026-04-10')]
    });
    rendre();
    expect(await ouvrir(/URSSAF, avril 2026/u)).toBeTruthy();
  });

  // Les chiffres que le site demande, ligne par ligne : la maquette.
  it('montre les recettes à déclarer et ce qu’elles coûtent, ligne par ligne', async () => {
    semer({ recettes: [encaissee('r1', '2026-04-10'), encaissee('r2', '2026-05-12')] });
    rendre();
    const u = userEvent.setup();
    const d = await ouvrir(/URSSAF, T2 2026/u, u);
    expect(within(d).getByText('Recettes à déclarer')).toBeTruthy();
    expect(within(d).getByText(/2 factures encaissées d’avril à juin/u)).toBeTruthy();
    expect(within(d).getByText('Cotisations')).toBeTruthy();
    await u.click(within(d).getByRole('button', { name: 'Voir les 2 factures' }));
    expect(within(within(d).getByRole('list', { name: 'Factures encaissées sur la période' })).getAllByRole('listitem'))
      .toHaveLength(2);
  });
});

/**
 * « DÉCLARÉE LE … POUR … € » : LA DÉCLARATION CRÉE SON APPEL.
 *
 * Déclarer sans appel faisait sortir la période du volet « à provisionner »
 * sans rien mettre au volet « constaté » : le dû baissait de toute la
 * déclaration, et « à te verser » montait d'autant.
 */
describe('le geste « Déclarée le … pour … € »', () => {
  it('crée l’appel lié à la période, au montant prérempli, à payer à la limite', async () => {
    semer({ recettes: [encaissee('r1', '2026-04-10')] });
    rendre();
    const d = await ouvrir(/URSSAF, T2 2026/u);
    await declarerTelQuel(d);
    const [appel] = useFaits.getState().faits.echeances;
    expect(appel).toMatchObject({ nature: 'urssaf', periode: '2026-T2', echeanceLe: '2026-07-31', payeeLe: null });
    expect(appel?.montant).toBeGreaterThan(0);
    // La suite du cycle : l'appel est à payer — ici, déjà en retard.
    expect(within(d).getByText('Paiement en retard')).toBeTruthy();
    expect(within(d).getByRole('button', { name: 'Enregistrer le paiement' })).toBeTruthy();
  });

  it('garde le montant corrigé, et la date saisie — jamais une date future', async () => {
    semer({ recettes: [encaissee('r1', '2026-04-10')] });
    rendre();
    const u = userEvent.setup();
    const d = await ouvrir(/URSSAF, T2 2026/u, u);
    await u.click(within(d).getByRole('button', { name: 'Je l’ai déclarée le…' }));
    fireEvent.change(within(d).getByLabelText('Déclarée le'), { target: { value: '2026-08-20' } });
    await u.click(within(d).getByRole('button', { name: 'Enregistrer la déclaration' }));
    expect(within(d).getByRole('alert').textContent).toMatch(/pas encore arrivée/u);
    expect(useFaits.getState().faits.periodesDeclarees).toEqual([]);

    fireEvent.change(within(d).getByLabelText('Déclarée le'), { target: { value: '2026-07-29' } });
    fireEvent.change(within(d).getByLabelText('Pour (€)'), { target: { value: '812,40' } });
    await u.click(within(d).getByRole('button', { name: 'Enregistrer la déclaration' }));
    expect(useFaits.getState().faits.periodesDeclarees.map((p) => p.declareeLe))
      .toEqual(['2026-07-29', '2026-07-29', '2026-07-29']);
    expect(useFaits.getState().faits.echeances[0]?.montant).toBe(812.4);
    // L'avance se lit dans le dossier : deux jours avant la limite du 31.
    expect(within(d).getByText(/Déclarée le 29 juillet, deux jours avant la limite/u)).toBeTruthy();
  });

  // Une date corrigée se corrige où elle se lit ; jamais dans le futur.
  it('corrige la date d’une déclaration, jamais vers le futur', async () => {
    semer({
      recettes: [encaissee('r1', '2026-04-10')],
      periodesDeclarees: ['2026-04', '2026-05', '2026-06'].map((periode) => ({ nature: 'urssaf' as const, periode, declareeLe: null }))
    });
    rendre();
    // Déclarée sans appel : rien ne reste à faire, elle est repliée avec les faites.
    const u = userEvent.setup();
    await u.click(within(carteListe()).getByRole('button', { name: /^Voir (la|les \d+) faites?/u }));
    const d = await ouvrir(/URSSAF, T2 2026/u, u);
    const champ = within(d).getByLabelText('Date de déclaration de T2 2026') as HTMLInputElement;
    // Vide : « date non enregistrée », le cas de toute période cochée avant le lot 28.
    expect(champ.value).toBe('');
    fireEvent.change(champ, { target: { value: '2026-09-01' } });
    expect(useFaits.getState().faits.periodesDeclarees.every((p) => p.declareeLe === null)).toBe(true);
    fireEvent.change(champ, { target: { value: '2026-07-30' } });
    expect(useFaits.getState().faits.periodesDeclarees.every((p) => p.declareeLe === '2026-07-30')).toBe(true);
  });

  /* La déclaration à zéro est obligatoire ; elle n'appelle rien. */
  it('déclare à zéro sans créer d’appel, et le dit obligatoire', async () => {
    semer({ entreprise: { ...faitsVides().entreprise, urssafPeriodicite: 'trimestriel', debutActivite: dateISO('2026-01-01') } });
    rendre();
    const u = userEvent.setup();
    const d = await ouvrir(/URSSAF, T1 2026/u, u);
    expect(within(d).getByText(/à déclarer à zéro, c’est obligatoire/u)).toBeTruthy();
    await u.click(within(d).getByRole('button', { name: 'Je l’ai déclarée le…' }));
    expect((within(d).getByLabelText('Pour (€)') as HTMLInputElement).value).toBe('0');
    await u.click(within(d).getByRole('button', { name: 'Enregistrer la déclaration' }));
    expect(useFaits.getState().faits.periodesDeclarees).toHaveLength(3);
    expect(useFaits.getState().faits.echeances).toEqual([]);
  });

  /* Un appel déjà saisi pour la période la règle : la déclaration n'en crée
     pas un second, qui doublerait le dû. */
  it('ne crée pas de second appel quand la période en porte déjà un', async () => {
    const saisi = {
      id: 'ech-saisi', nature: 'urssaf' as const, montant: euros(900), echeanceLe: dateISO('2026-07-31'),
      payeeLe: dateISO('2026-07-31'), montantPaye: null, periode: '2026-T2'
    };
    semer({ recettes: [encaissee('r1', '2026-04-10')], echeances: [saisi] });
    rendre();
    const u = userEvent.setup();
    const d = await ouvrir(/URSSAF, T2 2026/u, u);
    await u.click(within(d).getByRole('button', { name: 'Je l’ai déclarée le…' }));
    expect(within(d).getByText(/déjà saisi pour T2 2026/u)).toBeTruthy();
    await u.click(within(d).getByRole('button', { name: 'Enregistrer la déclaration' }));
    expect(useFaits.getState().faits.echeances).toEqual([saisi]);
    expect(within(d).getByText(/Payée le 31 juil\./u)).toBeTruthy();
  });

  // Un montant calculé à taux zéro se lirait comme un fait : il se refuse.
  // Ici, un encaissement d'avant le premier barème saisi (janvier 2024).
  it('dit « taux manquant » plutôt qu’un montant faux', async () => {
    semer({ recettes: [{ ...encaissee('r1', '2023-11-10'), emiseLe: dateISO('2023-11-01') }] });
    rendre();
    const d = await ouvrir(/URSSAF, T4 2023/u);
    expect(within(d).getByText(/taux manquant/u)).toBeTruthy();
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   Échéances reçues → la saisie et le dossier
   ═════════════════════════════════════════════════════════════════════════ */

/**
 * Le volet « échéances émises » se calculait sur une liste vide, parce
 * qu'aucun écran ne pouvait créer une échéance : plus de disponible, donc plus
 * de versable — l'application invitait à se verser de l'argent déjà dû.
 */
describe('saisir une échéance', () => {
  it('la fait entrer dans les provisions', async () => {
    rendre();
    const u = userEvent.setup();
    expect(etatPilote(useFaits.getState().faits).voletConstate).toBe(0);
    const p = await saisir(u);
    await u.type(within(p).getByLabelText('Montant appelé (€)'), '2400');
    await u.type(within(p).getByLabelText('Date d’échéance'), '2026-09-05');
    await u.click(within(p).getByRole('button', { name: 'Enregistrer l’échéance' }));
    expect(etatPilote(useFaits.getState().faits).voletConstate).toBe(2400);
  });

  // Sans date, la somme pèserait sur les provisions sans apparaître dans aucun mois.
  it('refuse une échéance sans date plutôt que de la dater d’office', async () => {
    rendre();
    const u = userEvent.setup();
    const p = await saisir(u);
    await u.type(within(p).getByLabelText('Montant appelé (€)'), '2400');
    await u.click(within(p).getByRole('button', { name: 'Enregistrer l’échéance' }));
    expect(within(p).getByRole('alert')).toBeTruthy();
    expect(useFaits.getState().faits.echeances).toEqual([]);
  });

  it('refuse un montant nul', async () => {
    rendre();
    const u = userEvent.setup();
    const p = await saisir(u);
    await u.type(within(p).getByLabelText('Montant appelé (€)'), '0');
    await u.type(within(p).getByLabelText('Date d’échéance'), '2026-09-05');
    await u.click(within(p).getByRole('button', { name: 'Enregistrer l’échéance' }));
    expect(useFaits.getState().faits.echeances).toEqual([]);
  });
});

/**
 * Une échéance payée sort des provisions : l'argent a quitté le compte. Le
 * paiement se PROUVE par une date et ce qui est réellement parti.
 */
describe('enregistrer un paiement', () => {
  async function payer(u: ReturnType<typeof userEvent.setup>, date: string | null, montant?: string): Promise<HTMLElement> {
    const d = await ouvrir(/URSSAF, appel/u, u);
    await u.click(within(d).getByRole('button', { name: 'Enregistrer le paiement' }));
    await u.clear(within(d).getByLabelText('Date du débit'));
    if (date !== null) await u.type(within(d).getByLabelText('Date du débit'), date);
    if (montant !== undefined) {
      const champ = within(d).getByLabelText('Montant réellement débité (€)');
      await u.clear(champ);
      await u.type(champ, montant);
    }
    await u.click(within(d).getAllByRole('button', { name: 'Enregistrer le paiement' }).at(-1) as HTMLElement);
    return d;
  }

  it('la sort des provisions, et la garde au dossier', async () => {
    semer({ echeances: [echeance({ id: 'e1' })] });
    rendre();
    expect(etatPilote(useFaits.getState().faits).voletConstate).toBe(2400);
    const d = await payer(userEvent.setup(), '2026-08-08');
    expect(etatPilote(useFaits.getState().faits).voletConstate).toBe(0);
    expect(useFaits.getState().faits.echeances[0]?.payeeLe).toBe('2026-08-08');
    expect(within(d).getAllByText('Payée le 8 août').length).toBeGreaterThan(0);
  });

  // L'écart n'est pas une erreur : il explique un solde qui ne tombe pas juste.
  it('conserve l’écart entre le montant appelé et le montant débité', async () => {
    semer({ echeances: [echeance({ id: 'e1', montant: euros(2400) })] });
    rendre();
    const d = await payer(userEvent.setup(), '2026-08-08', '2512.40');
    expect(useFaits.getState().faits.echeances[0]?.montantPaye).toBe(2512.4);
    expect(within(d).getByText(/sur l’appel de/u)).toBeTruthy();
  });

  it('ne stocke aucun écart quand le débit correspond à l’appel', async () => {
    semer({ echeances: [echeance({ id: 'e1', montant: euros(2400) })] });
    rendre();
    await payer(userEvent.setup(), '2026-08-08');
    expect(useFaits.getState().faits.echeances[0]?.montantPaye).toBeNull();
  });

  // Pointer d'avance sortirait l'échéance des provisions avant que l'argent parte.
  it('refuse une date de débit qui n’est pas encore arrivée', async () => {
    semer({ echeances: [echeance({ id: 'e1' })] });
    rendre();
    const d = await payer(userEvent.setup(), '2026-09-08');
    expect(within(d).getByRole('alert').textContent).toMatch(/pas encore arrivée/u);
    expect(useFaits.getState().faits.echeances[0]?.payeeLe).toBeNull();
  });

  it('refuse un paiement sans date', async () => {
    semer({ echeances: [echeance({ id: 'e1' })] });
    rendre();
    const d = await payer(userEvent.setup(), null);
    expect(within(d).getByRole('alert')).toBeTruthy();
    expect(useFaits.getState().faits.echeances[0]?.payeeLe).toBeNull();
  });

  it('se dépaie, pour rattraper une erreur — après confirmation', async () => {
    semer({ echeances: [echeance({ id: 'e1', payeeLe: dateISO('2026-08-05'), montantPaye: euros(2450) })] });
    rendre();
    const u = userEvent.setup();
    await u.click(within(carteListe()).getByRole('button', { name: /^Voir la faite/u }));
    const d = await ouvrir(/URSSAF, appel/u, u);
    await u.click(within(d).getByRole('button', { name: /^Repasser à payer/u }));
    const confirmation = within(d).getByRole('group', { name: /sera oublié/u });
    expect(confirmation.textContent).toMatch(/5 août 2026.*2\s450.*revient dans le dû/su);
    await u.click(within(confirmation).getByRole('button', { name: 'Garder le paiement' }));
    expect(useFaits.getState().faits.echeances[0]?.payeeLe).toBe('2026-08-05');
    await u.click(within(d).getByRole('button', { name: /^Repasser à payer/u }));
    await u.click(within(d).getByRole('button', { name: 'Repasser à payer' }));
    expect(useFaits.getState().faits.echeances[0]?.payeeLe).toBeNull();
  });
});

describe('états d’une échéance', () => {
  // Le jour même de l'échéance, on a la journée pour payer.
  it('n’est pas en retard le jour de l’échéance, l’est le lendemain', () => {
    semer({ echeances: [echeance({ id: 'e1', echeanceLe: dateISO('2026-08-13') }), echeance({ id: 'e2', nature: 'cfe', echeanceLe: dateISO('2026-08-12') })] });
    rendre();
    expect(within(carteListe()).getByRole('button', { name: /URSSAF, appel/u }).textContent).toMatch(/À payer/u);
    expect(within(carteListe()).getByRole('button', { name: /^.*CFE/u }).textContent).toMatch(/En retard/u);
  });

  // Replié, l'écran dit ce qui reste à payer — pas ce qui a été appelé.
  it('replié, ne totalise que ce qui reste à payer', async () => {
    semer({
      echeances: [
        echeance({ id: 'e1', montant: euros(2400) }),
        echeance({ id: 'e2', montant: euros(900), payeeLe: dateISO('2026-08-05'), montantPaye: null })
      ]
    });
    rendre();
    await userEvent.setup().click(screen.getByRole('button', { name: /^À faire et à venir/u }));
    const resume = carteListe().textContent ?? '';
    expect(resume).toMatch(/2\s400\s€ à payer/u);
    expect(resume).not.toMatch(/3\s300/u);
  });
});

describe('corriger', () => {
  it('ouvre le formulaire déjà rempli', async () => {
    semer({ echeances: [echeance({ id: 'e1', nature: 'cfe', montant: euros(510), echeanceLe: dateISO('2026-12-15') })] });
    rendre();
    const u = userEvent.setup();
    const d = await ouvrir(/CFE 2026/u, u);
    await u.click(within(d).getByRole('button', { name: 'Corriger' }));
    const p = await screen.findByRole('dialog', { name: 'Corriger l’échéance' });
    expect((await within(p).findByLabelText<HTMLInputElement>('Montant appelé (€)')).value).toBe('510');
    expect(within(p).getByLabelText<HTMLSelectElement>('Nature').value).toBe('cfe');
    // Corriger une échéance d'une série ne doit pas en recréer une autre.
    expect(within(p).queryByLabelText('Répéter')).toBeNull();
  });

  async function supprimer(e: Echeance, nom: RegExp): Promise<HTMLElement> {
    semer({ echeances: [e] });
    rendre();
    const u = userEvent.setup();
    if (e.payeeLe !== null) await u.click(within(carteListe()).getByRole('button', { name: /^Voir la faite/u }));
    const d = await ouvrir(nom, u);
    await u.click(within(d).getByRole('button', { name: 'Corriger' }));
    const p = await screen.findByRole('dialog', { name: 'Corriger l’échéance' });
    await u.click(await within(p).findByRole('button', { name: 'Supprimer cette échéance' }));
    return p;
  }

  it('supprime une échéance saisie par erreur, après confirmation', async () => {
    const p = await supprimer(echeance({ id: 'e1' }), /URSSAF, appel/u);
    expect(useFaits.getState().faits.echeances).toHaveLength(1);
    await userEvent.setup().click(within(p).getByRole('button', { name: 'Supprimer l’échéance' }));
    expect(useFaits.getState().faits.echeances).toEqual([]);
  });

  // Non payée, l'échéance est l'appel que le dû retient : la supprimer fait
  // monter l'« à te verser ». Payée, elle emporte son paiement.
  it('dit d’un appel non payé qu’il quitte le dû', async () => {
    const p = await supprimer(echeance({ id: 'e1', nature: 'tva', montant: euros(300) }), /TVA, paiement/u);
    const confirmation = within(p).getByRole('group', { name: /quitte l’échéancier et le dû/u });
    expect(confirmation.textContent).toMatch(/L’appel de TVA de 300/u);
    expect(confirmation.textContent).toMatch(/te verser monte/u);
  });

  it('dit d’une échéance payée qu’elle emporte son paiement', async () => {
    const p = await supprimer(
      echeance({ id: 'e1', nature: 'impot', payeeLe: dateISO('2026-08-05'), echeanceLe: dateISO('2026-08-05'), montantPaye: null }),
      /Impôt sur le revenu/u
    );
    const confirmation = within(p).getByRole('group', { name: /avec son paiement du 5 août 2026/u });
    expect(confirmation.textContent).toMatch(/L’échéance d’impôt/u);
    expect(confirmation.textContent).toMatch(/le dû remontera/u);
  });
});

/**
 * UN ÉCHÉANCIER SE SAISIT EN UNE FOIS, MAIS RESTE N ÉCHÉANCES : la
 * répétition crée des échéances ordinaires et s'efface.
 */
describe('répéter une échéance', () => {
  async function serie(u: ReturnType<typeof userEvent.setup>, cadence: string, combien?: string): Promise<void> {
    const p = await saisir(u);
    await u.type(within(p).getByLabelText('Montant appelé (€)'), '2400');
    await u.type(within(p).getByLabelText('Date d’échéance'), '2026-09-05');
    if (cadence !== 'aucune') await u.selectOptions(within(p).getByLabelText('Répéter'), cadence);
    if (combien !== undefined) {
      const champ = within(p).getByLabelText('Combien d’échéances');
      await u.clear(champ);
      await u.type(champ, combien);
    }
    await u.click(within(p).getByRole('button', { name: cadence === 'aucune' ? 'Enregistrer l’échéance' : 'Enregistrer les échéances' }));
  }

  it('crée toute la série d’un seul geste, chaque échéance à part', async () => {
    rendre();
    await serie(userEvent.setup(), 'trimestrielle');
    const echeances = useFaits.getState().faits.echeances;
    expect(echeances.map((e) => e.echeanceLe)).toEqual(['2026-09-05', '2026-12-05', '2027-03-05', '2027-06-05']);
    expect(new Set(echeances.map((e) => e.id)).size).toBe(4);
  });

  it('respecte le nombre demandé', async () => {
    rendre();
    await serie(userEvent.setup(), 'mensuelle', '2');
    expect(useFaits.getState().faits.echeances).toHaveLength(2);
  });

  it('n’en crée qu’une quand la répétition n’est pas demandée', async () => {
    rendre();
    await serie(userEvent.setup(), 'aucune');
    expect(useFaits.getState().faits.echeances).toHaveLength(1);
  });

  // Une série d'appels URSSAF règle une période chacun : celle dont la
  // limite tombe le mois de l'appel.
  it('rattache chaque appel d’une série à sa période', async () => {
    useFaits.setState({ faits: faitsVides() });
    rendre();
    const u = userEvent.setup();
    const p = await saisir(u);
    await u.type(within(p).getByLabelText('Montant appelé (€)'), '600');
    await u.type(within(p).getByLabelText('Date d’échéance'), '2027-03-31');
    await u.selectOptions(within(p).getByLabelText('Répéter'), 'mensuelle');
    await u.click(within(p).getByRole('button', { name: 'Enregistrer les échéances' }));
    expect(useFaits.getState().faits.echeances.map((e) => e.periode)).toEqual(['2027-02', '2027-03', '2027-04', '2027-05']);
  });
});

/**
 * LE SOLDE DE L'AVIS SE SAISIT TEL QU'IL EST ÉCRIT : un montant, que la
 * règle de l'administration découpe et date.
 */
describe('saisir le solde d’un avis d’imposition', () => {
  async function solde(u: ReturnType<typeof userEvent.setup>, montant: string): Promise<HTMLElement> {
    const p = await saisir(u);
    await u.selectOptions(within(p).getByLabelText('Nature'), 'impot');
    await u.selectOptions(within(p).getByLabelText('Ce qu’elle règle'), 'solde');
    await u.type(within(p).getByLabelText('Reste à payer sur l’avis (€)'), montant);
    return p;
  }

  it('le découpe en quatre prélèvements aux dates publiées, sur l’exercice des revenus', async () => {
    rendre();
    const u = userEvent.setup();
    const p = await solde(u, '1200');
    expect(within(p).queryByLabelText('Date d’échéance')).toBeNull();
    expect(within(p).queryByLabelText('Répéter')).toBeNull();
    expect(within(p).getByText(/Prélevé en 4 fois · impôt des revenus 2025/u)).toBeTruthy();
    await u.click(within(p).getByRole('button', { name: 'Enregistrer les 4 prélèvements' }));
    expect(useFaits.getState().faits.echeances.map((e) => [e.echeanceLe, e.montant, e.exercice])).toEqual([
      ['2026-09-25', 300, 2025], ['2026-10-26', 300, 2025], ['2026-11-26', 300, 2025], ['2026-12-28', 300, 2025]
    ]);
  });

  it('ne l’étale pas jusqu’à 300 €', async () => {
    rendre();
    const u = userEvent.setup();
    const p = await solde(u, '280');
    await u.click(within(p).getByRole('button', { name: 'Enregistrer le prélèvement' }));
    expect(useFaits.getState().faits.echeances.map((e) => e.echeanceLe)).toEqual(['2026-09-25']);
  });

  it('le prélève en novembre et décembre pour un avis tardif', async () => {
    rendre();
    const u = userEvent.setup();
    const p = await solde(u, '900');
    await u.click(within(p).getByLabelText('Avis reçu tardivement, à l’automne'));
    await u.click(within(p).getByRole('button', { name: 'Enregistrer les 2 prélèvements' }));
    expect(useFaits.getState().faits.echeances.map((e) => [e.echeanceLe, e.montant])).toEqual([
      ['2026-11-25', 450], ['2026-12-28', 450]
    ]);
  });

  it('dit qu’il suppose les dates d’une année qu’il n’a pas relevée', async () => {
    rendre();
    const u = userEvent.setup();
    const p = await solde(u, '1200');
    await u.selectOptions(within(p).getByLabelText('Revenus de l’année'), '2024');
    expect(within(p).getByText(/pas relevé les dates officielles de 2025/u)).toBeTruthy();
  });

  // L'acompte garde sa date : il tombe le 15, et c'est l'année de sa date qu'il règle.
  it('laisse l’acompte se saisir à la date, sur l’exercice de sa date', async () => {
    rendre();
    const u = userEvent.setup();
    const p = await saisir(u);
    await u.selectOptions(within(p).getByLabelText('Nature'), 'impot');
    expect(within(p).getByText(/le 15 de chaque mois/u)).toBeTruthy();
    await u.type(within(p).getByLabelText('Montant appelé (€)'), '150');
    await u.type(within(p).getByLabelText('Date d’échéance'), '2026-09-15');
    await u.click(within(p).getByRole('button', { name: 'Enregistrer l’échéance' }));
    expect(useFaits.getState().faits.echeances[0]?.exercice).toBeUndefined();
  });

  it('se corrige prélèvement par prélèvement, sans redécouper l’avis', async () => {
    semer({ echeances: [echeance({ id: 'e1', nature: 'impot', montant: euros(300), echeanceLe: dateISO('2026-09-25'), exercice: 2025 })] });
    rendre();
    const u = userEvent.setup();
    const d = await ouvrir(/solde 2025/u, u);
    await u.click(within(d).getByRole('button', { name: 'Corriger' }));
    const p = await screen.findByRole('dialog', { name: 'Corriger l’échéance' });
    expect(await within(p).findByLabelText('Date d’échéance')).toBeTruthy();
    expect(within(p).queryByLabelText('Reste à payer sur l’avis (€)')).toBeNull();
  });
});
