import { describe, expect, it } from 'vitest';
import { type Justificatif, stockageMemoireJustificatifs } from './justificatifs';
import { type NavigateurPieces, type OngletPiece, ouvrirPiece } from './justificatifs.ouverture';

const piece = (typeMime: string, contenu = '%PDF-1.4 facture factice'): Justificatif => ({
  id: 'p1', nomFichier: 'facture.pdf', typeMime, taille: contenu.length, empreinte: 'e',
  deposeLe: '2026-09-02T09:00:00.000Z', fait: { nature: 'recette', id: 'r1' },
  contenu: new Blob([contenu], { type: typeMime })
});

/** Un navigateur factice : il note ce qu'on lui demande, et exécute les attentes à la demande. */
function navigateur(bloque = false) {
  const onglet: OngletPiece & { ferme: boolean; closed: boolean } = {
    opener: { fenetre: 'FREEL' }, closed: false, ferme: false, location: { href: '' },
    close() { this.ferme = true; this.closed = true; }
  };
  const creees: Blob[] = [];
  const revoquees: string[] = [];
  const attentes: (() => void)[] = [];
  const nav: NavigateurPieces = {
    ouvrirOnglet: () => (bloque ? null : onglet),
    creerAdresse: (b) => { creees.push(b); return `blob:piece-${creees.length}`; },
    revoquerAdresse: (a) => { revoquees.push(a); },
    differer: (action) => { attentes.push(action); }
  };
  const avancer = () => { const a = attentes.shift(); a?.(); };
  return { nav, onglet, creees, revoquees, attentes, avancer };
}

describe('ouvrir une pièce conservée', () => {
  it('l’ouvre dans un onglet coupé de FREEL, par une adresse locale', async () => {
    const stockage = stockageMemoireJustificatifs();
    await stockage.deposer(piece('application/pdf'));
    const n = navigateur();

    expect(await ouvrirPiece(stockage, 'p1', n.nav)).toBeNull();
    expect(n.onglet.location.href).toBe('blob:piece-1');
    // L'onglet ne peut pas remonter vers FREEL : son `opener` est coupé.
    expect(n.onglet.opener).toBeNull();
    expect(n.creees[0]?.type).toBe('application/pdf');
  });

  /*
   * L'ADRESSE SE RÉVOQUE APRÈS USAGE. Oubliée, elle garde la pièce en mémoire
   * aussi longtemps que FREEL reste ouvert — des journées, sur un poste qu'on
   * ne ferme pas.
   */
  it('révoque l’adresse quand l’onglet se ferme, et pas avant', async () => {
    const stockage = stockageMemoireJustificatifs();
    await stockage.deposer(piece('application/pdf'));
    const n = navigateur();
    await ouvrirPiece(stockage, 'p1', n.nav);

    n.avancer();
    expect(n.revoquees).toEqual([]);
    n.onglet.closed = true;
    n.avancer();
    expect(n.revoquees).toEqual(['blob:piece-1']);
  });

  it('la révoque au plus tard au bout de dix minutes, onglet ouvert ou non', async () => {
    const stockage = stockageMemoireJustificatifs();
    await stockage.deposer(piece('application/pdf'));
    const n = navigateur();
    await ouvrirPiece(stockage, 'p1', n.nav);
    for (let i = 0; i < 300 && n.revoquees.length === 0; i += 1) n.avancer();
    expect(n.revoquees).toEqual(['blob:piece-1']);
    expect(n.attentes).toHaveLength(0);
  });

  /*
   * CE QUI VIENT D'UN FICHIER EST HOSTILE. Une adresse `blob:` créée ici a
   * l'origine de FREEL : ouverte en `text/html`, la pièce exécuterait ses
   * scripts avec l'accès au dossier entier. Elle ne s'ouvre pas, et l'onglet
   * vierge se referme.
   */
  it('n’ouvre jamais une pièce d’un type que le dépôt refuserait', async () => {
    const stockage = stockageMemoireJustificatifs();
    await stockage.deposer(piece('text/html', '<script>localStorage.clear()</script>'));
    const n = navigateur();

    expect(await ouvrirPiece(stockage, 'p1', n.nav)).toMatch(/ni un PDF ni une image/);
    expect(n.creees).toHaveLength(0);
    expect(n.onglet.ferme).toBe(true);
  });

  /* Le type ouvert est celui que le dépôt a contrôlé, reposé sur une copie :
     jamais celui que porte le binaire stocké. */
  it('ouvre sous le type contrôlé, pas sous celui du binaire', async () => {
    const stockage = stockageMemoireJustificatifs();
    await stockage.deposer({ ...piece('image/png'), contenu: new Blob(['<svg onload=alert(1)>'], { type: 'text/html' }) });
    const n = navigateur();
    await ouvrirPiece(stockage, 'p1', n.nav);
    expect(n.creees[0]?.type).toBe('image/png');
  });

  it('dit ce qui manque : une pièce absente de cet appareil, un onglet bloqué', async () => {
    const vide = stockageMemoireJustificatifs();
    const n = navigateur();
    expect(await ouvrirPiece(vide, 'p1', n.nav)).toMatch(/pas sur cet appareil/);
    expect(n.onglet.ferme).toBe(true);
    expect(await ouvrirPiece(vide, 'p1', navigateur(true).nav)).toMatch(/bloqué/);
  });
});
