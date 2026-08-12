import { describe, expect, it } from 'vitest';
import {
  decoderFichier, decouper, detecterSeparateur, formatDe, lireDate,
  lireMontant, lireReleve
} from './releveCsv';

/** Raccourci : les lignes lues, ou l'échec si la lecture a refusé. */
function lignes(csv: string) {
  const r = lireReleve(csv);
  if (r.statut !== 'lu') throw new Error(`lecture refusée : ${r.motif}`);
  return r.rapport;
}

describe('découpage', () => {
  // Un libellé contenant une virgule ferait choisir le mauvais séparateur si
  // l'on se contentait d'un ordre de préférence.
  it('choisit le séparateur le plus fréquent dans la ligne de titres', () => {
    expect(detecterSeparateur('Date;Libellé;Montant')).toBe(';');
    expect(detecterSeparateur('Date,Libellé,Montant')).toBe(',');
    expect(detecterSeparateur('Date\tLibellé\tMontant')).toBe('\t');
  });

  // Les libellés bancaires contiennent régulièrement le séparateur ; un split
  // naïf décalerait toutes les colonnes suivantes en silence.
  it('respecte les guillemets', () => {
    expect(decouper('2026-07-15;"VIR SEPA DUPONT; JEAN";-120,50', ';'))
      .toEqual(['2026-07-15', 'VIR SEPA DUPONT; JEAN', '-120,50']);
  });

  it('rend un guillemet doublé comme un guillemet', () => {
    expect(decouper('a;"dit ""bonjour""";c', ';')).toEqual(['a', 'dit "bonjour"', 'c']);
  });
});

describe('lecture des montants', () => {
  it('lit la virgule décimale française', () => {
    expect(lireMontant('-120,50')).toBe(-120.5);
    expect(lireMontant('1 234,56')).toBe(1234.56);
  });

  it('lit la notation anglo-saxonne', () => {
    expect(lireMontant('1,234.56')).toBe(1234.56);
    expect(lireMontant('-1234.56')).toBe(-1234.56);
  });

  // « 1.234,56 » et « 1,234.56 » se distinguent par le dernier séparateur.
  it('distingue le séparateur décimal du séparateur de milliers', () => {
    expect(lireMontant('1.234,56')).toBe(1234.56);
  });

  it('accepte le symbole euro et les espaces insécables', () => {
    expect(lireMontant('1 234,56 €')).toBe(1234.56);
    expect(lireMontant('1 234,56€')).toBe(1234.56);
  });

  it('lit un négatif entre parenthèses', () => {
    expect(lireMontant('(120,50)')).toBe(-120.5);
  });

  // Un montant lu à zéro fausserait le solde en silence.
  it('rend null sur ce qu’il ne comprend pas, jamais zéro', () => {
    expect(lireMontant('')).toBeNull();
    expect(lireMontant('n/a')).toBeNull();
    expect(lireMontant('—')).toBeNull();
  });
});

describe('lecture des dates', () => {
  it('reconnaît les trois formats acceptés', () => {
    expect(formatDe('15/07/2026')).toBe('JJ/MM/AAAA');
    expect(formatDe('2026-07-15')).toBe('AAAA-MM-JJ');
    expect(formatDe('15-07-26')).toBe('JJ-MM-AA');
    expect(formatDe('juillet 2026')).toBeNull();
  });

  it('convertit vers l’ISO', () => {
    expect(lireDate('15/07/2026', 'JJ/MM/AAAA')).toBe('2026-07-15');
    expect(lireDate('2026-07-15', 'AAAA-MM-JJ')).toBe('2026-07-15');
    expect(lireDate('15-07-26', 'JJ-MM-AA')).toBe('2026-07-15');
  });

  // Une date syntaxiquement correcte mais inexistante entrerait au grand
  // livre sans que rien ne la signale.
  it('rejette le 31 février', () => {
    expect(lireDate('31/02/2026', 'JJ/MM/AAAA')).toBeNull();
  });

  it('accepte le 29 février d’une bissextile', () => {
    expect(lireDate('29/02/2028', 'JJ/MM/AAAA')).toBe('2028-02-29');
  });
});

describe('relevé à colonne de montant signée', () => {
  const CSV = [
    'Date;Libellé;Montant',
    '15/07/2026;VIR SEPA CLIENT A;4 000,00',
    '16/07/2026;PRLV ABONNEMENT;-120,50'
  ].join('\n');

  it('lit les opérations avec leur signe', () => {
    const r = lignes(CSV);
    expect(r.lignes).toHaveLength(2);
    expect(r.lignes[0]).toMatchObject({ date: '2026-07-15', montant: 4000 });
    expect(r.lignes[1]).toMatchObject({ date: '2026-07-16', montant: -120.5 });
  });

  // Un import qui échoue sans dire pourquoi conduit à ressaisir un relevé à
  // la main. Ce qui a été compris doit pouvoir être relu.
  it('rend compte de ce qu’il a compris', () => {
    expect(lignes(CSV).interpretation).toMatchObject({
      separateur: ';',
      colonneDate: 'Date',
      colonneLibelle: 'Libellé',
      colonneMontant: 'Montant',
      formatDate: 'JJ/MM/AAAA'
    });
  });
});

describe('relevé à colonnes Débit et Crédit', () => {
  // Certaines banques exportent le débit positif, d'autres négatif :
  // additionner les deux conventions donnerait un solde faux une fois sur deux.
  it('rend le débit négatif, qu’il soit exporté positif ou négatif', () => {
    const positif = lignes([
      'Date;Nature;Débit;Crédit',
      '15/07/2026;ACHAT;120,50;',
      '16/07/2026;VIREMENT;;4000,00'
    ].join('\n'));
    expect(positif.lignes.map((l) => l.montant)).toEqual([-120.5, 4000]);

    const negatif = lignes([
      'Date;Nature;Débit;Crédit',
      '15/07/2026;ACHAT;-120,50;'
    ].join('\n'));
    expect(negatif.lignes[0]?.montant).toBe(-120.5);
  });

  it('nomme les deux colonnes dans son interprétation', () => {
    const r = lignes([
      'Date;Nature;Débit;Crédit',
      '15/07/2026;ACHAT;120,50;'
    ].join('\n'));
    expect(r.interpretation.colonneMontant).toBe('Débit / Crédit');
  });
});

describe('en-têtes décoratifs', () => {
  // Plusieurs banques font précéder leurs exports d'un bloc d'identification
  // du compte.
  it('trouve la ligne de titres au-delà de la première ligne', () => {
    const r = lignes([
      'Relevé de compte',
      'Compte n° 0000000000',
      'Période du 01/07/2026 au 31/07/2026',
      '',
      'Date;Libellé;Montant',
      '15/07/2026;VIR SEPA;4 000,00'
    ].join('\n'));
    expect(r.lignes).toHaveLength(1);
  });

  it('refuse un fichier sans colonnes reconnaissables, en disant ce qu’il attend', () => {
    const r = lireReleve('Colonne A;Colonne B\n1;2');
    expect(r.statut).toBe('refuse');
    if (r.statut === 'refuse') expect(r.motif).toMatch(/date.*montant/i);
  });
});

describe('lignes écartées', () => {
  const CSV = [
    'Date;Libellé;Montant',
    '15/07/2026;VIR SEPA;4 000,00',
    'TOTAL;;4 000,00',
    '16/07/2026;REGULARISATION;0,00',
    '17/07/2026;SANS MONTANT;'
  ].join('\n');

  // Les écarter en silence ferait croire à un relevé complet.
  it('les compte et dit pourquoi', () => {
    const r = lignes(CSV);
    expect(r.lignes).toHaveLength(1);
    expect(r.ignorees).toHaveLength(3);
    expect(r.ignorees.map((i) => i.motif).join(' ')).toMatch(/date illisible/);
    expect(r.ignorees.map((i) => i.motif).join(' ')).toMatch(/montant nul/);
    expect(r.ignorees.map((i) => i.motif).join(' ')).toMatch(/montant illisible/);
  });

  it('donne le numéro de ligne, pour la retrouver dans le fichier', () => {
    expect(lignes(CSV).ignorees[0]?.ligne).toBe(3);
  });

  it('refuse quand rien n’est exploitable, plutôt que de rendre un relevé vide', () => {
    const r = lireReleve('Date;Libellé;Montant\nTOTAL;;100,00');
    expect(r.statut).toBe('refuse');
  });
});

describe('encodage', () => {
  // Plusieurs banques françaises exportent encore en ISO-8859-1 ; décodé en
  // UTF-8, le libellé devient illisible.
  it('relit en latin-1 un fichier que l’UTF-8 ne sait pas décoder', async () => {
    const latin1 = new Uint8Array([
      ...'Date;Libell'.split('').map((c) => c.charCodeAt(0)),
      0xe9, // é en ISO-8859-1
      ...';Montant\n15/07/2026;SOCI'.split('').map((c) => c.charCodeAt(0)),
      0xc9, // É
      ...'T'.split('').map((c) => c.charCodeAt(0)),
      0xc9,
      ...';100,00'.split('').map((c) => c.charCodeAt(0))
    ]);
    const texte = await decoderFichier(new Blob([latin1]));
    expect(texte).toContain('Libellé');
    expect(texte).toContain('SOCIÉTÉ');
    expect(texte).not.toContain('�');
  });

  it('laisse l’UTF-8 intact', async () => {
    const texte = await decoderFichier(new Blob(['Date;Libellé;Montant']));
    expect(texte).toBe('Date;Libellé;Montant');
  });
});
