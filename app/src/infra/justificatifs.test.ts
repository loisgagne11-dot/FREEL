import { describe, expect, it } from 'vitest';
import {
  TAILLE_MAX_OCTETS, deposerJustificatif, empreinteDe,
  stockageMemoireJustificatifs, typeAccepte, verifierIntegrite
} from './justificatifs';

function pdf(contenu = 'facture', nom = 'facture.pdf') {
  return { nom, typeMime: 'application/pdf', contenu: new Blob([contenu]) };
}

const LE_10_JUILLET = new Date('2026-07-10T09:30:00.000Z');

describe('empreinte', () => {
  // Sans empreinte reproductible, rien de ce qui suit ne tient : ni
  // l'identifiant, ni la preuve de non-altération.
  it('est stable pour un même contenu', async () => {
    expect(await empreinteDe(new Blob(['abc'])))
      .toBe(await empreinteDe(new Blob(['abc'])));
  });

  it('change dès qu\'un octet change', async () => {
    expect(await empreinteDe(new Blob(['abc'])))
      .not.toBe(await empreinteDe(new Blob(['abd'])));
  });

  // Valeur de référence : un SHA-256 correct, pas seulement « une chaîne ».
  // Un condensat maison qui aurait l'air d'un hachage échouerait ici.
  it('produit le SHA-256 hexadécimal attendu', async () => {
    expect(await empreinteDe(new Blob(['abc']))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('fait 64 caractères hexadécimaux, zéros de tête compris', async () => {
    const e = await empreinteDe(new Blob(['freel']));
    expect(e).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('contrôles au dépôt', () => {
  it('accepte un PDF ordinaire', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(stockage, pdf(), 'dep-1', LE_10_JUILLET);
    expect(r.statut).toBe('depose');
  });

  // Un fichier vide passe tous les contrôles de type et de taille maximale,
  // et ne prouve rien du tout.
  it('refuse un fichier vide', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(
      stockage, { nom: 'vide.pdf', typeMime: 'application/pdf', contenu: new Blob([]) },
      'dep-1', LE_10_JUILLET
    );
    expect(r.statut).toBe('refuse');
    expect(stockage.contenu.size).toBe(0);
  });

  it('refuse au-delà de la taille maximale', async () => {
    const stockage = stockageMemoireJustificatifs();
    const trop = new Blob([new Uint8Array(TAILLE_MAX_OCTETS + 1)]);
    const r = await deposerJustificatif(
      stockage, { nom: 'gros.pdf', typeMime: 'application/pdf', contenu: trop },
      'dep-1', LE_10_JUILLET
    );
    expect(r.statut).toBe('refuse');
    // Le motif doit dire la taille réelle et la limite : « fichier trop
    // volumineux » seul n'aide pas à choisir quoi faire.
    if (r.statut === 'refuse') expect(r.motif).toContain('12 Mo');
  });

  it('accepte exactement la taille maximale', async () => {
    const stockage = stockageMemoireJustificatifs();
    const pile = new Blob([new Uint8Array(TAILLE_MAX_OCTETS)]);
    const r = await deposerJustificatif(
      stockage, { nom: 'pile.pdf', typeMime: 'application/pdf', contenu: pile },
      'dep-1', LE_10_JUILLET
    );
    expect(r.statut).toBe('depose');
  });

  it('refuse un format hors liste, et dit lesquels sont acceptés', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(
      stockage, { nom: 'notes.docx', typeMime: 'application/msword', contenu: new Blob(['x']) },
      'dep-1', LE_10_JUILLET
    );
    expect(r.statut).toBe('refuse');
    if (r.statut === 'refuse') expect(r.motif).toContain('PDF');
    expect(stockage.contenu.size).toBe(0);
  });

  // Les photos de tickets prises au téléphone arrivent en HEIC sur iOS : les
  // refuser reviendrait à ne conserver aucune pièce pour tout un parc.
  it('accepte les formats photo courants, HEIC compris', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/heic', 'image/webp']) {
      expect(typeAccepte(t)).toBe(true);
    }
    expect(typeAccepte('text/html')).toBe(false);
  });
});

describe('métadonnées du dépôt', () => {
  it('conserve nom, type, taille, dépense et horodatage', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(stockage, pdf('abc', 'ticket.pdf'), 'dep-7', LE_10_JUILLET);
    expect(r.statut).toBe('depose');
    if (r.statut !== 'depose') return;
    expect(r.meta).toMatchObject({
      nomFichier: 'ticket.pdf',
      typeMime: 'application/pdf',
      taille: 3,
      depenseId: 'dep-7',
      deposeLe: '2026-07-10T09:30:00.000Z'
    });
  });

  // L'empreinte enregistrée doit porter sur ce qui est réellement stocké,
  // sinon la vérification d'intégrité ne vérifie rien.
  it('enregistre l\'empreinte du contenu effectivement stocké', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(stockage, pdf('abc'), 'dep-1', LE_10_JUILLET);
    if (r.statut !== 'depose') throw new Error('dépôt attendu');
    const stocke = await stockage.lire(r.meta.id);
    expect(stocke).not.toBeNull();
    expect(await empreinteDe(stocke!.contenu)).toBe(r.meta.empreinte);
  });

  it('rend la pièce relisable avec son binaire', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(stockage, pdf('contenu de la facture'), 'dep-1', LE_10_JUILLET);
    if (r.statut !== 'depose') throw new Error('dépôt attendu');
    const relu = await stockage.lire(r.meta.id);
    expect(await relu!.contenu.text()).toBe('contenu de la facture');
  });
});

describe('identité d\'une pièce', () => {
  // Rattacher deux fois la même facture à la même dépense est un geste
  // ordinaire (double clic, ré-import) ; le résultat ne doit pas être deux
  // pièces prétendant chacune justifier la dépense.
  it('déposer deux fois le même fichier sur la même dépense ne crée qu\'une pièce', async () => {
    const stockage = stockageMemoireJustificatifs();
    const a = await deposerJustificatif(stockage, pdf('abc'), 'dep-1', LE_10_JUILLET);
    const b = await deposerJustificatif(stockage, pdf('abc'), 'dep-1', new Date('2026-08-01T00:00:00.000Z'));
    if (a.statut !== 'depose' || b.statut !== 'depose') throw new Error('dépôts attendus');
    expect(b.meta.id).toBe(a.meta.id);
    expect(stockage.contenu.size).toBe(1);
    expect(await stockage.lister()).toHaveLength(1);
  });

  it('deux fichiers différents sur la même dépense font deux pièces', async () => {
    const stockage = stockageMemoireJustificatifs();
    await deposerJustificatif(stockage, pdf('facture'), 'dep-1', LE_10_JUILLET);
    await deposerJustificatif(stockage, pdf('avoir'), 'dep-1', LE_10_JUILLET);
    expect(stockage.contenu.size).toBe(2);
  });

  // Le même fichier peut légitimement justifier deux dépenses distinctes
  // (une facture groupée, par exemple) : les pièces restent séparées.
  it('le même fichier sur deux dépenses fait deux pièces', async () => {
    const stockage = stockageMemoireJustificatifs();
    const a = await deposerJustificatif(stockage, pdf('abc'), 'dep-1', LE_10_JUILLET);
    const b = await deposerJustificatif(stockage, pdf('abc'), 'dep-2', LE_10_JUILLET);
    if (a.statut !== 'depose' || b.statut !== 'depose') throw new Error('dépôts attendus');
    expect(b.meta.id).not.toBe(a.meta.id);
    expect(stockage.contenu.size).toBe(2);
  });
});

describe('valeur probante', () => {
  it('une pièce intacte est reconnue comme telle', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(stockage, pdf('abc'), 'dep-1', LE_10_JUILLET);
    if (r.statut !== 'depose') throw new Error('dépôt attendu');
    expect(await verifierIntegrite(stockage, r.meta.id)).toEqual({ intacte: true, motif: null });
  });

  // C'est le test qui donne son sens à l'empreinte. Sans lui, on stockerait un
  // condensat que personne ne recalcule jamais — exactement le `piece: true`
  // de l'ancienne version, en plus long.
  it('détecte un contenu remplacé sous le même identifiant', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(stockage, pdf('abc'), 'dep-1', LE_10_JUILLET);
    if (r.statut !== 'depose') throw new Error('dépôt attendu');
    const original = stockage.contenu.get(r.meta.id)!;
    stockage.contenu.set(r.meta.id, { ...original, contenu: new Blob(['contenu falsifié']) });

    const verdict = await verifierIntegrite(stockage, r.meta.id);
    expect(verdict.intacte).toBe(false);
    expect(verdict.motif).toContain('modifiée');
  });

  it('une pièce absente n\'est pas déclarée intacte', async () => {
    const stockage = stockageMemoireJustificatifs();
    const verdict = await verifierIntegrite(stockage, 'inexistante');
    expect(verdict.intacte).toBe(false);
    expect(verdict.motif).toContain('introuvable');
  });
});

describe('listage', () => {
  // Charger tous les binaires pour afficher une liste ferait tenir en mémoire
  // plusieurs centaines de mégaoctets de PDF.
  it('ne renvoie pas les binaires', async () => {
    const stockage = stockageMemoireJustificatifs();
    await deposerJustificatif(stockage, pdf('abc'), 'dep-1', LE_10_JUILLET);
    const [meta] = await stockage.lister();
    expect(meta).toBeDefined();
    expect('contenu' in meta!).toBe(false);
    expect(meta!.empreinte).toMatch(/^[0-9a-f]{64}$/);
  });

  it('un stockage vide se liste sans échouer', async () => {
    expect(await stockageMemoireJustificatifs().lister()).toEqual([]);
  });
});
