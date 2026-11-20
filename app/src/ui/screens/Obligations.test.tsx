/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { type Client, type Faits, type Recette, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { chargerJeu, faitsAu, le } from '../../test/jeu-d-essai';
import { useCompteursATraiter } from '../useATraiter';
import { RailNav } from '../components/RailNav';
import { FournisseurToasts } from '../components/Toasts';
import { Obligations, reprendreLePli } from './Obligations';

const telecharger = vi.fn();
vi.mock('../../infra/telechargement', async (original) => ({
  ...(await original<typeof import('../../infra/telechargement')>()),
  telecharger: (...args: unknown[]) => { telecharger(...args); }
}));

afterEach(() => {
  cleanup(); vi.useRealTimers(); window.location.hash = ''; telecharger.mockReset(); window.localStorage.clear();
});
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

/** L'écran dans ses fournisseurs, à une date du jeu d'essai ou sur des faits donnés. */
function poser(faits: Faits, annee = 2026) {
  useFaits.setState({ faits });
  return render(<FournisseurToasts><Obligations annee={annee} onAnnee={() => {}} /></FournisseurToasts>);
}

const carteListe = () => screen.getByRole('button', { name: /À faire et à venir/u }).closest('section') as HTMLElement;
const lignes = () => within(within(carteListe()).getAllByRole('list')[0] as HTMLElement).getAllByRole('button');

/**
 * « À FAIRE ET À VENIR » (lot 53, 3c) : une liste à la place de deux cartes.
 */
describe('la liste « À faire et à venir »', () => {
  // Un trimestre déclaré dans « Périodes URSSAF », son appel dans
  // « Échéances reçues » : la même dette, deux lignes. Une obligation, une
  // ligne — la CFE prévue et son avis saisi se rejoignent.
  it('ne montre qu’une ligne par obligation, prévue et saisie réunies', () => {
    poser(essai());
    const cfe = lignes().filter((b) => /CFE 2026/u.test(b.textContent ?? ''));
    expect(cfe).toHaveLength(1);
    expect(cfe[0]?.textContent).toMatch(/214/u);
    expect(cfe[0]?.textContent).toMatch(/À payer/u);
  });

  // Ce qui reste à faire, avec son bloc date, son montant, sa pastille ; le
  // retard d'abord.
  it('montre ce qui reste, par date, avec le retard en clair', () => {
    poser(essai());
    const textes = lignes().map((b) => b.textContent ?? '');
    expect(textes[0]).toMatch(/Facturation électronique/u);
    const t3 = textes.find((t) => /URSSAF, T3 2026/u.test(t));
    expect(t3).toMatch(/En retard/u);
    expect(t3).toMatch(/4\u202f598\s€|4 598/u);
  });

  // « ≈ » : un montant estimé ne se lit pas comme un fait.
  it('marque d’un « ≈ » ce qui est estimé', () => {
    poser(essai(), 2027);
    const t4 = lignes().find((b) => /URSSAF, T4 2026/u.test(b.textContent ?? ''));
    expect(t4?.textContent).toMatch(/≈/u);
  });

  // Les faites se replient ; dépliées, elles disent leur avance — « deux
  // jours avant la limite », la phrase de la maquette.
  it('replie les faites, et les déplie avec l’avance de leur déclaration', async () => {
    poser(essai());
    const bouton = within(carteListe()).getByRole('button', { name: /^Voir les \d+ faites cette année$/u });
    expect(within(carteListe()).queryByRole('list', { name: 'Faites cette année' })).toBeNull();
    await userEvent.click(bouton);
    const faites = within(carteListe()).getByRole('list', { name: 'Faites cette année' });
    expect(faites.textContent).toMatch(/URSSAF, T4 2025.*Déclarée le 30 janvier, trois jours avant la limite/u);
  });

  // L'automne de qui n'a pas encore son avis : le solde de l'an passé, que
  // la provision garde déjà, posé aux dates où l'administration le prélève.
  it('place le solde estimé de l’an passé à ses dates officielles', () => {
    vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
    poser({
      ...faitsVides(),
      recettes: [{
        id: 'r1', clientNom: 'Client démo', libelle: 'Mission', montant: euros(40_000),
        emiseLe: dateISO('2025-06-01'), encaisseeLe: dateISO('2025-06-10'),
        modeReglement: 'virement', numero: '2025-001'
      }],
      partsFiscales: 1, autresRevenusFoyer: euros(0), versementPerDeductible: euros(0)
    } as Faits);
    const soldes = lignes().filter((b) => /solde 2025/u.test(b.textContent ?? ''));
    expect(soldes).toHaveLength(4);
    expect(soldes.every((b) => /≈/u.test(b.textContent ?? ''))).toBe(true);
    expect(soldes[0]?.textContent).toMatch(/25 septembre/u);
    expect(soldes[3]?.textContent).toMatch(/28 décembre/u);
  });

  // Une liste sans échéance saisie se lirait « rien à payer » : c'est
  // l'inverse, le dû ne connaît que des estimations.
  it('dit que le disponible est surestimé tant qu’aucune échéance n’est saisie', () => {
    vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
    poser({ ...faitsVides(), soldeInitial: euros(10_000) } as Faits);
    expect(within(carteListe()).getByText(/surestimés/u)).toBeTruthy();
  });
});

/**
 * « + SAISIR » : le formulaire de l'ancienne carte, chargé au clic, avec la
 * période d'un appel URSSAF.
 */
describe('saisir une échéance', () => {
  // Un appel saisi à la main ne réglait aucune période : la déclaration en
  // créait un second, et le dû le comptait deux fois.
  it('dit la période qu’un appel URSSAF règle, proposée d’après sa date', async () => {
    vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
    poser({ ...faitsVides(), entreprise: { ...faitsVides().entreprise, urssafPeriodicite: 'trimestriel' } } as Faits);
    await userEvent.click(within(carteListe()).getByRole('button', { name: '+ Saisir' }));
    const panneau = await screen.findByRole('dialog', { name: 'Saisir une échéance' });
    await userEvent.type(await within(panneau).findByLabelText('Montant appelé (€)'), '1484');
    await userEvent.type(within(panneau).getByLabelText('Date d’échéance'), '2026-04-30');
    expect((within(panneau).getByLabelText('Période réglée') as HTMLSelectElement).value).toBe('2026-T1');
    await userEvent.click(within(panneau).getByRole('button', { name: 'Enregistrer l’échéance' }));
    expect(useFaits.getState().faits.echeances).toMatchObject([
      { nature: 'urssaf', montant: 1484, echeanceLe: '2026-04-30', periode: '2026-T1', payeeLe: null }
    ]);
  });

  // « Aucune » est un choix, pas un oubli : une régularisation ne règle
  // aucune période, et la suggestion ne doit pas la rattacher en douce.
  it('garde « aucune période » quand on la choisit', async () => {
    vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
    poser({ ...faitsVides(), entreprise: { ...faitsVides().entreprise, urssafPeriodicite: 'trimestriel' } } as Faits);
    await userEvent.click(within(carteListe()).getByRole('button', { name: '+ Saisir' }));
    const panneau = await screen.findByRole('dialog', { name: 'Saisir une échéance' });
    await userEvent.type(await within(panneau).findByLabelText('Montant appelé (€)'), '120');
    await userEvent.type(within(panneau).getByLabelText('Date d’échéance'), '2026-04-30');
    await userEvent.selectOptions(within(panneau).getByLabelText('Période réglée'), '');
    await userEvent.click(within(panneau).getByRole('button', { name: 'Enregistrer l’échéance' }));
    expect(useFaits.getState().faits.echeances[0]?.periode).toBeNull();
  });
});

/**
 * LE PLI DE LA LISTE QUITTE LA CLÉ DE LA TRÉSORERIE.
 *
 * L'échéancier vivait sous la Trésorerie (`freel.pli.argent`) : une liste
 * repliée exprès là-bas ne doit pas se rouvrir d'elle-même ici.
 */
describe('le pli de la liste', () => {
  it('reprend l’état de l’ancienne clé, une fois, et le retire de la Trésorerie', () => {
    window.localStorage.setItem('freel.pli.argent', JSON.stringify({ echeancier: true, tresorerie: false }));
    window.localStorage.removeItem('freel.pli.obligations');
    reprendreLePli.reinitialiser();
    reprendreLePli();
    expect(JSON.parse(window.localStorage.getItem('freel.pli.obligations') ?? '{}')).toEqual({ echeancier: true });
    expect(JSON.parse(window.localStorage.getItem('freel.pli.argent') ?? '{}')).toEqual({ tresorerie: false });
    poser(essai());
    expect(within(carteListe()).queryByRole('list')).toBeNull();
    window.localStorage.clear();
  });
});

const dossier = () => screen.getByRole('region', { name: 'Dossier' });
const titreDuDossier = async (): Promise<string> =>
  (await within(dossier()).findByRole('heading', { level: 2 })).textContent ?? '';

/**
 * LE DOSSIER (lot 53, 3d) : à droite au bureau, celui de la prochaine chose
 * à faire tant que rien n'est choisi ; ouvert par son adresse depuis les
 * autres écrans.
 */
describe('le dossier', () => {
  // L'écran s'ouvrait sur la dernière chose faite : on lisait le passé avant
  // ce qui attend.
  it('montre par défaut la prochaine chose à faire', async () => {
    poser(essai());
    expect(await titreDuDossier()).toBe('Facturation électronique : réception obligatoire');
  });

  it('montre celui de la ligne choisie, et la marque', async () => {
    poser(essai());
    const u = userEvent.setup();
    const ligne = within(carteListe()).getByRole('button', { name: /URSSAF, T3 2026/u });
    await u.click(ligne);
    expect(await titreDuDossier()).toBe('URSSAF, T3 2026');
    expect(ligne.getAttribute('aria-current')).toBe('true');
  });

  /*
   * L'ADRESSE D'UN DOSSIER.
   *
   * Le flux du Pilote et la Trésorerie ne connaissent que l'échéance : leur
   * lien `#/obligations/saisie-<id>` doit ouvrir l'obligation qui la porte.
   * Arriver en haut de l'écran obligeait à chercher la ligne une seconde fois.
   */
  it('s’ouvre par son adresse — une obligation, ou l’échéance qu’elle porte —, puis rend l’adresse de l’écran', async () => {
    window.location.hash = '#/obligations/urssaf-2026-T2';
    const { unmount } = poser(essai());
    expect(await titreDuDossier()).toBe('URSSAF, T2 2026');
    await waitFor(() => expect(window.location.hash).toBe('#/obligations'));
    unmount();
    window.location.hash = '#/obligations/saisie-ech-cfe-2026';
    poser(essai());
    expect(await titreDuDossier()).toBe('CFE 2026');
  });

  it('change d’année pour montrer le dossier demandé', async () => {
    const onAnnee = vi.fn();
    window.location.hash = '#/obligations/urssaf-2025-T3';
    useFaits.setState({ faits: essai() });
    render(<FournisseurToasts><Obligations annee={2026} onAnnee={onAnnee} /></FournisseurToasts>);
    await waitFor(() => expect(onAnnee).toHaveBeenCalledWith(2025));
  });
});

const clientDe = (): Client => ({
  id: 'c1', nom: 'ClientDE', adresse: '', siret: '', email: '',
  delaiPaiement: 'net_30', pays: 'DE', tvaIntracom: 'DE123456789'
});

/** Ouvre une ligne et rend son dossier. */
async function ouvrirLigne(nom: RegExp): Promise<HTMLElement> {
  await userEvent.click(within(carteListe()).getByRole('button', { name: nom }));
  await within(dossier()).findByRole('heading', { name: nom });
  return dossier();
}

/** Chaque nature a son dossier, sur le modèle URSSAF, et son geste daté. */
describe('les dossiers des autres natures', () => {
  // L'amende est par déclaration manquante : « Marquer déposée » l'éteint.
  it('DES : marque déposée à la date du jour', async () => {
    vi.setSystemTime(new Date('2026-08-05T09:00:00Z'));
    poser({
      ...faitsVides(), clients: [clientDe()],
      recettes: [{ ...recetteSansMode(), clientNom: 'ClientDE', emiseLe: dateISO('2026-07-15'), encaisseeLe: null, montant: euros(4000) }]
    } as Faits);
    const d = await ouvrirLigne(/Déclaration européenne de services, juillet 2026/u);
    await userEvent.click(within(d).getByRole('button', { name: 'Marquer déposée' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    expect(useFaits.getState().faits.periodesDeclarees).toEqual([{ nature: 'des', periode: '2026-07', declareeLe: '2026-08-05' }]);
  });

  // La case du formulaire, le montant brut, et rien de déduit.
  it('déclaration de revenus : la case, le montant brut, et « Je l’ai déclarée le… »', async () => {
    vi.setSystemTime(new Date('2027-05-10T09:00:00Z'));
    const faits = essai();
    poser({ ...faits, entreprise: { ...faits.entreprise, codePostal: '69001' } }, 2027);
    const d = await ouvrirLigne(/Déclaration des revenus 2026/u);
    expect(within(d).getByText(/5HQ|5TE/u)).toBeTruthy();
    expect(within(d).getByText(/Ne déduis rien/u)).toBeTruthy();
    await userEvent.click(within(d).getByRole('button', { name: 'Je l’ai déclarée le…' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    expect(useFaits.getState().faits.periodesDeclarees).toContainEqual({ nature: 'revenus', periode: '2027', declareeLe: '2027-05-10' });
  });

  // Saisie, la CFE entre dans le dû ; le dossier prépare la saisie.
  it('CFE : « Saisir l’avis » ouvre la saisie, nature et date posées', async () => {
    vi.setSystemTime(new Date('2026-11-20T09:00:00Z'));
    const faits = essai();
    poser({ ...faits, echeances: faits.echeances.filter((e) => e.nature !== 'cfe') });
    const d = await ouvrirLigne(/CFE 2026/u);
    await userEvent.click(within(d).getByRole('button', { name: 'Saisir l’avis' }));
    const panneau = await screen.findByRole('dialog', { name: 'Saisir une échéance' });
    expect((await within(panneau).findByLabelText<HTMLSelectElement>('Nature')).value).toBe('cfe');
    expect(within(panneau).getByLabelText<HTMLInputElement>('Date d’échéance').value).toBe('2026-12-15');
  });

  // Le jour de la CA3 dépend de l'initiale du nom : demandée, jamais devinée.
  it('TVA : demande le nom qui date la CA3, là où il manque', async () => {
    vi.setSystemTime(new Date('2027-04-02T09:00:00Z'));
    const faits = essai();
    poser({ ...faits, entreprise: { ...faits.entreprise, nomExploitant: '' } }, 2027);
    const d = await ouvrirLigne(/TVA, T1 2027 \(CA3\)/u);
    await userEvent.type(within(d).getByLabelText('Ton nom de famille'), 'Essai');
    await userEvent.click(within(d).getByRole('button', { name: 'Enregistrer le nom' }));
    expect(useFaits.getState().faits.entreprise.nomExploitant).toBe('Essai');
  });

  // Une attestation se renouvelle en changeant sa date, pas en en empilant une.
  it('pièce : se modifie sur place', async () => {
    poser(essai(), 2027);
    const d = await ouvrirLigne(/Attestation de vigilance URSSAF/u);
    const champ = within(d).getByLabelText('Obtenue le');
    await userEvent.clear(champ);
    await userEvent.type(champ, '2026-12-01');
    await userEvent.click(within(d).getByRole('button', { name: 'Enregistrer' }));
    const vigilance = useFaits.getState().faits.pieces.find((p) => p.id === 'piece-vigilance');
    expect(vigilance?.obtenueLe).toBe('2026-12-01');
    expect(useFaits.getState().faits.pieces).toHaveLength(essai().pieces.length);
  });

  it('formalité : mène au réglage de la plateforme', async () => {
    poser(essai());
    const d = await ouvrirLigne(/Facturation électronique/u);
    expect(within(d).getByRole('link', { name: 'Renseigner ma plateforme' }).getAttribute('href')).toBe('#/reglages/facturation');
  });
});

/**
 * « PIÈCES À FOURNIR À TES CLIENTS » (lot 53, 3e).
 */
describe('les pièces à fournir', () => {
  const pieces = () => screen.getByRole('heading', { name: 'Pièces à fournir à tes clients' }).closest('section') as HTMLElement;
  const demo = (): Faits => ({
    ...faitsVides(),
    pieces: [
      { id: 'v', sorte: 'vigilance', libelle: 'Attestation', obtenueLe: dateISO('2026-05-04'), valableJusquau: null, provisoire: false },
      { id: 'rc', sorte: 'rc_pro', libelle: 'RC', obtenueLe: dateISO('2026-01-05'), valableJusquau: dateISO('2026-12-31'), provisoire: false },
      { id: 's', sorte: 'sirene', libelle: 'Avis', obtenueLe: dateISO('2026-04-15'), valableJusquau: null, provisoire: false }
    ]
  } as Faits);

  // L'avis SIRENE n'a aucune durée officielle : « à jour » serait affirmer ce
  // que personne n'a dit (décision 25). La vigilance se juge à sa date
  // d'obtention, pas à une fin qu'elle ne porte pas.
  it('dit chaque pièce telle que sa règle la lit — et jamais l’avis SIRENE « à jour »', () => {
    vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
    poser(demo());
    const boutons = within(pieces()).getAllByRole('button');
    expect(boutons[0]?.textContent).toMatch(/Obtenue le 4 mai 2026 · à refaire tous les six mois.*À jour/u);
    expect(boutons[1]?.textContent).toMatch(/Valable jusqu’au 31 décembre 2026.*À jour/u);
    expect(boutons[2]?.textContent).toMatch(/Téléchargé le 15 avril 2026.*Pas de validité/u);
    expect(boutons[2]?.textContent).not.toMatch(/À jour/u);
    const plateforme = within(pieces()).getByRole('link');
    expect(plateforme.textContent).toMatch(/Obligatoire au 1ᵉʳ septembre 2026 pour recevoir.*À inscrire/u);
    expect(plateforme.getAttribute('href')).toBe('#/reglages/facturation');
  });

  // Six mois et un jour : le client la redemande.
  it('passe une attestation de plus de six mois en « expirée »', () => {
    vi.setSystemTime(new Date('2026-11-05T09:00:00Z'));
    poser(demo());
    expect(within(pieces()).getAllByRole('button')[0]?.textContent).toMatch(/Expirée/u);
  });

  // Une pièce se modifie sur place : la carte devient son formulaire.
  it('se modifie sur place', async () => {
    vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
    poser(demo());
    const u = userEvent.setup();
    await u.click(within(pieces()).getAllByRole('button')[0] as HTMLElement);
    const champ = await within(pieces()).findByLabelText('Obtenue le');
    await u.clear(champ);
    await u.type(champ, '2026-06-01');
    await u.click(within(pieces()).getByRole('button', { name: 'Enregistrer' }));
    expect(useFaits.getState().faits.pieces.find((p) => p.id === 'v')?.obtenueLe).toBe('2026-06-01');
    expect(within(pieces()).getAllByRole('button')[0]?.textContent).toMatch(/Obtenue le 1ᵉʳ juin 2026/u);
  });

  // Une pièce qu'on n'a pas n'est pas en retard : rien n'oblige à l'avoir
  // avant qu'un client la demande.
  it('crée la pièce qui manque', async () => {
    vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
    poser(faitsVides());
    const u = userEvent.setup();
    const sirene = within(pieces()).getAllByRole('button')[2] as HTMLElement;
    expect(sirene.textContent).toMatch(/À télécharger/u);
    await u.click(sirene);
    await u.type(await within(pieces()).findByLabelText('Téléchargé le'), '2026-06-09');
    await u.click(within(pieces()).getByRole('button', { name: 'Enregistrer' }));
    expect(useFaits.getState().faits.pieces).toMatchObject([{ sorte: 'sirene', obtenueLe: '2026-06-09' }]);
  });
});
