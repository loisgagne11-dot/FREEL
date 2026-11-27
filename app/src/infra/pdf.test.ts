import { describe, expect, it } from 'vitest';
import {
  DocumentPdf, FilPdf, couperEnLignes, couperParagraphe, encoderWinAnsi, largeurTexte
} from './pdf';
import { relirePdf, titreDuPdf } from '../test/lirePdf';

const CREATION = new Date(Date.UTC(2026, 10, 27, 9, 30, 0));
const nouveau = (titre = 'Essai'): DocumentPdf => new DocumentPdf({ titre, creation: CREATION });
const windows1252 = new TextDecoder('windows-1252');

/*
 * L'ENCODAGE : CE QUI N'Y EST PAS NE S'AFFICHE PAS.
 *
 * Un « é » mal encodé, et le client lit « activitÃ© » sur le papier qu'on
 * lui demande de signer. Les octets attendus sont relus par le décodeur
 * windows-1252 du moteur JavaScript, pas par la table de l'écrivain.
 */
describe('l’encodage des caractères', () => {
  it('encode les accents, l’apostrophe, les guillemets, les tirets et l’euro en WinAnsi', () => {
    const texte = 'éèàçôÉœ’«»—–…€ ';
    const octets = encoderWinAnsi(texte);
    expect(octets).toEqual([
      0xE9, 0xE8, 0xE0, 0xE7, 0xF4, 0xC9, 0x9C, 0x92, 0xAB, 0xBB, 0x97, 0x96, 0x85, 0x80, 0xA0
    ]);
    expect(windows1252.decode(new Uint8Array(octets))).toBe(texte);
  });

  // Le séparateur de milliers d'Intl en français : sans traitement, chaque
  // nombre de quatre chiffres se lirait « 1?234 ».
  it('rend l’espace fine insécable d’Intl comme une espace', () => {
    const mille = new Intl.NumberFormat('fr-FR').format(1234);
    expect(mille).toContain(' ');
    expect(encoderWinAnsi(mille)).toEqual([0x31, 0x20, 0x32, 0x33, 0x34]);
  });

  /* Un octet hors table, et chaque lecteur l'affiche à sa façon — ou refuse
     la ligne. Un « ? » se voit, se comprend, et se corrige. */
  it('remplace un caractère hors table par un seul point d’interrogation', () => {
    expect(encoderWinAnsi('ałb')).toEqual([0x61, 0x3F, 0x62]);
    expect(encoderWinAnsi('😀')).toEqual([0x3F]);
    expect(encoderWinAnsi('\u0007')).toEqual([0x3F]);
  });

  /* Un nom de client est saisi — ou collé — par l'utilisateur. S'il pouvait
     fermer la chaîne, il écrirait des instructions dans la page. */
  it('échappe les parenthèses et la barre oblique inverse', () => {
    const hostile = 'Dupont (SARL) \\ a) Tj /F1 99 Tf (b';
    const pdf = nouveau();
    pdf.texte(40, 100, hostile, { taille: 10 });
    const relu = relirePdf(pdf.terminer());

    expect(relu.flux[0]).toContain('(Dupont \\(SARL\\) \\\\ a\\) Tj /F1 99 Tf \\(b) Tj');
    expect(relu.pages[0]?.[0]?.texte).toBe(hostile);
    expect(relu.pages[0]?.[0]?.polices).toEqual(['F1']);
  });

  // « 01 → 05 juin » sur chaque ligne de semaine : en « ? », le document
  // ne dirait plus quelle semaine il atteste.
  it('emprunte la flèche à Symbol plutôt que d’en faire un « ? »', () => {
    const pdf = nouveau();
    pdf.texte(40, 100, '01 → 05 juin', { taille: 10, police: 'gras' });
    const texte = relirePdf(pdf.terminer()).pages[0]?.[0];
    expect(texte?.texte).toBe('01 → 05 juin');
    expect(texte?.polices).toEqual(['F2', 'F5', 'F2']);
  });
});

describe('les mesures', () => {
  it('mesure un texte avec les chasses de sa graisse', () => {
    // T 611, o 611, t 333, a 556, l 278 en gras ; T 611, o 556, t 278, a 556, l 222 en maigre.
    expect(largeurTexte('Total', 'gras', 10)).toBeCloseTo(23.89, 5);
    expect(largeurTexte('Total', 'normal', 10)).toBeCloseTo(22.23, 5);
    expect(largeurTexte('Total', 'italique', 10)).toBeCloseTo(22.23, 5);
  });

  it('ajoute l’interlettrage après chaque caractère, comme le navigateur', () => {
    expect(largeurTexte('AB', 'gras', 10, 0.05))
      .toBeCloseTo(largeurTexte('AB', 'gras', 10) + 2 * 0.5, 5);
  });

  // Une colonne de totaux qui ne tombe pas d'aplomb se relit comme une
  // erreur de calcul.
  it('aligne à droite sur le bord donné', () => {
    const pdf = nouveau();
    pdf.texte(500, 100, '10,5 j', { taille: 10, police: 'gras' }, 'droite');
    const texte = relirePdf(pdf.terminer()).pages[0]?.[0];
    expect((texte?.x ?? 0) + largeurTexte('10,5 j', 'gras', 10)).toBeCloseTo(500, 2);
    expect(texte?.y).toBeCloseTo(100, 2);
  });
});

describe('la découpe des lignes', () => {
  const phrase = 'Intégration des maquettes d’accueil · cadrage de la refonte du catalogue';

  it('coupe un texte long sous la largeur donnée, sans perdre un mot', () => {
    const lignes = couperEnLignes(phrase, 'italique', 8, 120);
    expect(lignes.length).toBeGreaterThan(1);
    for (const l of lignes) expect(largeurTexte(l, 'italique', 8)).toBeLessThanOrEqual(120);
    expect(lignes.join(' ')).toBe(phrase);
  });

  // « renseigné ; » et « 4,5 j » se tiennent à l'écran : le papier ne doit
  // pas les séparer.
  it('ne coupe jamais à une espace insécable', () => {
    const lignes = couperEnLignes('aa bb cc', 'normal', 10, largeurTexte('aa bb', 'normal', 10) + 1);
    expect(lignes).toEqual(['aa', 'bb cc']);
  });

  it('coupe à la lettre un mot plus long que la ligne', () => {
    const lignes = couperEnLignes('x'.repeat(40), 'normal', 10, 50);
    expect(lignes.length).toBeGreaterThan(1);
    expect(lignes.join('')).toBe('x'.repeat(40));
    for (const l of lignes) expect(largeurTexte(l, 'normal', 10)).toBeLessThanOrEqual(50);
  });

  // La phrase de tâches vient d'une zone de texte : un retour à la ligne y
  // est une espace à l'écran, il l'est aussi sur le papier.
  it('fait d’un saut de ligne tapé une simple espace', () => {
    expect(couperEnLignes('Cadrage\n\net  recette', 'normal', 10, 1000)).toEqual(['Cadrage et recette']);
  });

  it('garde le gras d’un fragment à travers la découpe', () => {
    const lignes = couperParagraphe([
      { texte: 'Suivi uniquement — ', police: 'normal' },
      { texte: 'aucun montant', police: 'gras' },
      { texte: ' : la facturation se fait ailleurs.', police: 'normal' }
    ], 10, 1000);
    expect(lignes).toEqual([[
      { texte: 'Suivi uniquement — ', police: 'normal' },
      { texte: 'aucun montant', police: 'gras' },
      { texte: ' : la facturation se fait ailleurs.', police: 'normal' }
    ]]);
  });
});

describe('le fichier', () => {
  function deuxPages(): Uint8Array {
    const pdf = nouveau('Compte-rendu d’activité — novembre 2026 — Client (Démo)');
    pdf.texte(40, 60, 'Première page', { taille: 12, police: 'gras', couleur: '#1d1d1b' });
    pdf.filet(40, 70, 555, 70, { epaisseur: 1.125, couleur: '#1d1d1b' });
    pdf.aplat(40, 80, 515, 20, '#f6f6f2', 4.5);
    pdf.cadre(40, 110, 200, 40, { epaisseur: 0.75, couleur: '#c8c8c0', pointilles: [3, 2] }, 4.5);
    pdf.nouvellePage();
    pdf.texte(40, 60, 'Seconde page', { taille: 12, espacement: 0.06 });
    return pdf.terminer();
  }

  /* Le défaut que ce test rend impossible : un décalage faux d'un octet, et
     le fichier ne s'ouvre plus que dans les lecteurs qui « réparent » — ce
     que fait le navigateur, mais pas forcément l'outil d'archivage du client. */
  it('tient sa table des renvois aux octets près', () => {
    const octets = deuxPages();
    const relu = relirePdf(octets);
    // 3 objets de structure, 5 polices, 2 × (page + contenu).
    expect(relu.objets.size).toBe(12);
    const debut = Number(/startxref\n(\d+)/.exec(relu.brut)?.[1]);
    expect(String.fromCharCode(...octets.slice(debut, debut + 4))).toBe('xref');
  });

  it('est écrit tout en ASCII, octets hauts en octal', () => {
    const octets = deuxPages();
    expect([...octets].every((o) => o === 0x0A || (o >= 0x20 && o <= 0x7E))).toBe(true);
  });

  it('porte son titre en Unicode, son producteur et sa date de création', () => {
    const relu = relirePdf(deuxPages());
    expect(titreDuPdf(relu)).toBe('Compte-rendu d’activité — novembre 2026 — Client (Démo)');
    expect(relu.brut).toContain('/Producer (FREEL)');
    expect(relu.brut).toContain('/CreationDate (D:20261127093000Z)');
  });

  // Un document qui part chez un client ne doit rien pouvoir exécuter.
  it('ne contient ni JavaScript, ni formulaire, ni action', () => {
    const { brut } = relirePdf(deuxPages());
    for (const cle of ['/JavaScript', '/JS', '/AcroForm', '/OpenAction', '/AA', '/Launch', '/URI', '/Annots']) {
      expect(brut).not.toContain(cle);
    }
  });

  // Le pied dit au client qu'aucune page ne manque — « 1 / 1 » compris.
  it('numérote chaque page sur le total, en pied', () => {
    const relu = relirePdf(deuxPages());
    expect(relu.pages.map((p) => p[p.length - 1]?.texte)).toEqual(['1 / 2', '2 / 2']);
    const seul = nouveau();
    seul.texte(40, 60, 'x', { taille: 10 });
    const pages = relirePdf(seul.terminer()).pages;
    expect(pages[0]?.[pages[0].length - 1]?.texte).toBe('1 / 1');
  });

  it('ne double pas le pied quand on termine deux fois', () => {
    const pdf = nouveau();
    pdf.texte(40, 60, 'x', { taille: 10 });
    pdf.terminer();
    expect(relirePdf(pdf.terminer()).pages[0]?.map((t) => t.texte)).toEqual(['x', '1 / 1']);
  });

  it('refuse d’écrire un nombre qui n’en est pas un', () => {
    expect(() => nouveau().texte(NaN, 10, 'x', { taille: 10 })).toThrow(/non finie/);
  });
});

/*
 * LE SAUT DE PAGE REDESSINE L'EN-TÊTE.
 *
 * Une deuxième page de colonnes sans intitulés oblige le client à revenir à
 * la première pour savoir ce que « 2 j » veut dire.
 */
describe('le fil d’écriture', () => {
  it('passe à la page suivante quand le bloc ne tient plus, et y redessine l’en-tête', () => {
    const pdf = nouveau();
    const fil = new FilPdf(pdf, { haut: 40, bas: 60 });
    const enTete = (): void => {
      pdf.texte(40, fil.y + 10, 'EN-TÊTE', { taille: 10 });
      fil.y += 20;
    };
    enTete();
    fil.enTete = enTete;
    for (let i = 0; i < 40; i += 1) {
      fil.reserver(30);
      pdf.texte(40, fil.y + 20, `Ligne ${i + 1}`, { taille: 10 });
      fil.y += 30;
    }
    const relu = relirePdf(pdf.terminer());
    expect(relu.pages.length).toBeGreaterThan(1);
    for (const page of relu.pages) {
      expect(page[0]?.texte).toBe('EN-TÊTE');
      // Rien ne déborde dans le pied.
      for (const t of page.slice(0, -1)) expect(t.y).toBeLessThanOrEqual(pdf.hauteur - 60);
    }
    const lignes = relu.pages.flatMap((p) => p.map((t) => t.texte)).filter((t) => t.startsWith('Ligne'));
    expect(lignes).toHaveLength(40);
  });
});
