import { describe, expect, it } from 'vitest';
import {
  TAILLE_MAX_OCTETS, deposerJustificatif, empreinteDe, migrerMeta,
  motifRefusSuppression, stockageMemoireJustificatifs, supprimerJustificatif,
  typeAccepte, verifierIntegrite
} from './justificatifs';

function pdf(contenu = 'facture', nom = 'facture.pdf') {
  return { nom, typeMime: 'application/pdf', contenu: new Blob([contenu]) };
}

const DEPENSE = { nature: 'depense', id: 'dep-1' } as const;
const RECETTE = { nature: 'recette', id: 'rec-1' } as const;

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
    const r = await deposerJustificatif(stockage, pdf(), DEPENSE, LE_10_JUILLET);
    expect(r.statut).toBe('depose');
  });

  // Un fichier vide passe tous les contrôles de type et de taille maximale,
  // et ne prouve rien du tout.
  it('refuse un fichier vide', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(
      stockage, { nom: 'vide.pdf', typeMime: 'application/pdf', contenu: new Blob([]) },
      DEPENSE, LE_10_JUILLET
    );
    expect(r.statut).toBe('refuse');
    expect(stockage.contenu.size).toBe(0);
  });

  it('refuse au-delà de la taille maximale', async () => {
    const stockage = stockageMemoireJustificatifs();
    const trop = new Blob([new Uint8Array(TAILLE_MAX_OCTETS + 1)]);
    const r = await deposerJustificatif(
      stockage, { nom: 'gros.pdf', typeMime: 'application/pdf', contenu: trop },
      DEPENSE, LE_10_JUILLET
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
      DEPENSE, LE_10_JUILLET
    );
    expect(r.statut).toBe('depose');
  });

  it('refuse un format hors liste, et dit lesquels sont acceptés', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(
      stockage, { nom: 'notes.docx', typeMime: 'application/msword', contenu: new Blob(['x']) },
      DEPENSE, LE_10_JUILLET
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
  it('conserve nom, type, taille, fait rattaché et horodatage', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(
      stockage, pdf('abc', 'ticket.pdf'), { nature: 'depense', id: 'dep-7' }, LE_10_JUILLET
    );
    expect(r.statut).toBe('depose');
    if (r.statut !== 'depose') return;
    expect(r.meta).toMatchObject({
      nomFichier: 'ticket.pdf',
      typeMime: 'application/pdf',
      taille: 3,
      fait: { nature: 'depense', id: 'dep-7' },
      deposeLe: '2026-07-10T09:30:00.000Z'
    });
  });

  // L'empreinte enregistrée doit porter sur ce qui est réellement stocké,
  // sinon la vérification d'intégrité ne vérifie rien.
  it('enregistre l\'empreinte du contenu effectivement stocké', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(stockage, pdf('abc'), DEPENSE, LE_10_JUILLET);
    if (r.statut !== 'depose') throw new Error('dépôt attendu');
    const stocke = await stockage.lire(r.meta.id);
    expect(stocke).not.toBeNull();
    expect(await empreinteDe(stocke!.contenu)).toBe(r.meta.empreinte);
  });

  it('rend la pièce relisable avec son binaire', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(stockage, pdf('contenu de la facture'), DEPENSE, LE_10_JUILLET);
    if (r.statut !== 'depose') throw new Error('dépôt attendu');
    const relu = await stockage.lire(r.meta.id);
    expect(await relu!.contenu.text()).toBe('contenu de la facture');
  });
});

describe('identité d\'une pièce', () => {
  // Rattacher deux fois la même facture au même fait est un geste ordinaire
  // (double clic, ré-import) ; le résultat ne doit pas être deux pièces
  // prétendant chacune justifier le même document.
  it('déposer deux fois le même fichier sur la même dépense ne crée qu\'une pièce', async () => {
    const stockage = stockageMemoireJustificatifs();
    const a = await deposerJustificatif(stockage, pdf('abc'), DEPENSE, LE_10_JUILLET);
    const b = await deposerJustificatif(stockage, pdf('abc'), DEPENSE, new Date('2026-08-01T00:00:00.000Z'));
    if (a.statut !== 'depose' || b.statut !== 'depose') throw new Error('dépôts attendus');
    expect(b.meta.id).toBe(a.meta.id);
    expect(stockage.contenu.size).toBe(1);
    expect(await stockage.lister()).toHaveLength(1);
  });

  it('deux fichiers différents sur la même dépense font deux pièces', async () => {
    const stockage = stockageMemoireJustificatifs();
    await deposerJustificatif(stockage, pdf('facture'), DEPENSE, LE_10_JUILLET);
    await deposerJustificatif(stockage, pdf('avoir'), DEPENSE, LE_10_JUILLET);
    expect(stockage.contenu.size).toBe(2);
  });

  // Le même fichier peut légitimement justifier deux dépenses distinctes
  // (une facture groupée, par exemple) : les pièces restent séparées.
  it('le même fichier sur deux dépenses fait deux pièces', async () => {
    const stockage = stockageMemoireJustificatifs();
    const a = await deposerJustificatif(stockage, pdf('abc'), { nature: 'depense', id: 'dep-1' }, LE_10_JUILLET);
    const b = await deposerJustificatif(stockage, pdf('abc'), { nature: 'depense', id: 'dep-2' }, LE_10_JUILLET);
    if (a.statut !== 'depose' || b.statut !== 'depose') throw new Error('dépôts attendus');
    expect(b.meta.id).not.toBe(a.meta.id);
    expect(stockage.contenu.size).toBe(2);
  });

  // Une dépense et une recette peuvent porter le même identifiant applicatif
  // dans l'absolu (deux séquences distinctes) : la nature entre dans
  // l'identité de la pièce pour que cette coïncidence ne fusionne jamais deux
  // documents sans rapport.
  it('le même identifiant sur une dépense et sur une recette fait deux pièces', async () => {
    const stockage = stockageMemoireJustificatifs();
    const a = await deposerJustificatif(stockage, pdf('abc'), { nature: 'depense', id: 'x' }, LE_10_JUILLET);
    const b = await deposerJustificatif(stockage, pdf('abc'), { nature: 'recette', id: 'x' }, LE_10_JUILLET);
    if (a.statut !== 'depose' || b.statut !== 'depose') throw new Error('dépôts attendus');
    expect(b.meta.id).not.toBe(a.meta.id);
    expect(stockage.contenu.size).toBe(2);
  });
});

/**
 * Le manque que ce lot comble : jusqu'ici, `depenseId` était la SEULE forme de
 * rattachement possible, et une facture de vente établie hors de
 * l'application n'avait aucun moyen d'être jointe à sa recette.
 */
describe('rattachement à une recette', () => {
  it('une pièce se rattache à une recette', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(stockage, pdf('facture de vente'), RECETTE, LE_10_JUILLET);
    expect(r.statut).toBe('depose');
    if (r.statut !== 'depose') return;
    expect(r.meta.fait).toEqual({ nature: 'recette', id: 'rec-1' });
  });

  // L'empreinte ne connaît pas la nature du fait qu'elle accompagne : elle ne
  // regarde que des octets. Un calcul distinct pour les recettes serait une
  // seconde source pour la même notion — exactement ce que le projet interdit.
  it('l’empreinte est calculée pour une pièce de recette comme pour une pièce de dépense', async () => {
    const stockage = stockageMemoireJustificatifs();
    const surRecette = await deposerJustificatif(stockage, pdf('même contenu'), RECETTE, LE_10_JUILLET);
    const surDepense = await deposerJustificatif(stockage, pdf('même contenu'), DEPENSE, LE_10_JUILLET);
    if (surRecette.statut !== 'depose' || surDepense.statut !== 'depose') {
      throw new Error('dépôts attendus');
    }
    const attendue = await empreinteDe(new Blob(['même contenu']));
    expect(surRecette.meta.empreinte).toBe(attendue);
    expect(surDepense.meta.empreinte).toBe(attendue);
  });

  it('vérifie l’intégrité d’une pièce de recette comme celle d’une dépense', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(stockage, pdf('abc'), RECETTE, LE_10_JUILLET);
    if (r.statut !== 'depose') throw new Error('dépôt attendu');
    expect(await verifierIntegrite(stockage, r.meta.id)).toEqual({ intacte: true, motif: null });
  });
});

/**
 * Le refus de suppression, généralisé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE TEST PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les durées de conservation légales se comptent en années (voir
 * `ANNEES_CONSERVATION`, `domain/bareme/recettes.ts`) et portent aussi bien
 * sur les factures de vente que sur les factures d'achat. Si ce refus sautait,
 * une pièce de recette pourrait disparaître alors que la facture qu'elle
 * justifie existe encore — exactement la perte que le module existe pour
 * empêcher côté dépenses.
 */
describe('refus de suppression', () => {
  it('une pièce rattachée à une dépense qui existe encore ne se supprime pas', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(stockage, pdf('abc'), DEPENSE, LE_10_JUILLET);
    if (r.statut !== 'depose') throw new Error('dépôt attendu');

    const motif = await supprimerJustificatif(
      stockage, r.meta.id, { depenses: [{ id: 'dep-1' }], recettes: [] }
    );
    expect(motif).not.toBeNull();
    expect(await stockage.lire(r.meta.id)).not.toBeNull();
  });

  it('une pièce rattachée à une recette qui existe encore ne se supprime pas', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(stockage, pdf('abc'), RECETTE, LE_10_JUILLET);
    if (r.statut !== 'depose') throw new Error('dépôt attendu');

    const motif = await supprimerJustificatif(
      stockage, r.meta.id, { depenses: [], recettes: [{ id: 'rec-1' }] }
    );
    expect(motif).not.toBeNull();
    expect(motif).toContain('recette');
    expect(await stockage.lire(r.meta.id)).not.toBeNull();
  });

  // Le pendant positif : une pièce dont le fait a disparu redevient
  // supprimable. Sans ce cas, le refus deviendrait indéfini plutôt que
  // protecteur — aucune pièce ne pourrait jamais être retirée.
  it('une pièce dont la recette a été supprimée peut l’être', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(stockage, pdf('abc'), RECETTE, LE_10_JUILLET);
    if (r.statut !== 'depose') throw new Error('dépôt attendu');

    const motif = await supprimerJustificatif(
      stockage, r.meta.id, { depenses: [], recettes: [] }
    );
    expect(motif).toBeNull();
    expect(await stockage.lire(r.meta.id)).toBeNull();
  });

  it('une pièce déjà absente n’est pas un échec', async () => {
    const stockage = stockageMemoireJustificatifs();
    const motif = await supprimerJustificatif(
      stockage, 'inexistante', { depenses: [], recettes: [] }
    );
    expect(motif).toBeNull();
  });

  it('le motif du refus nomme la nature du fait', () => {
    const meta = {
      id: 'recette-rec-1-abc', nomFichier: 'f.pdf', typeMime: 'application/pdf',
      taille: 10, empreinte: 'x', deposeLe: LE_10_JUILLET.toISOString(),
      fait: { nature: 'recette' as const, id: 'rec-1' }
    };
    const motif = motifRefusSuppression(meta, { depenses: [], recettes: [{ id: 'rec-1' }] });
    expect(motif).toContain('recette');
  });
});

describe('valeur probante', () => {
  it('une pièce intacte est reconnue comme telle', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(stockage, pdf('abc'), DEPENSE, LE_10_JUILLET);
    if (r.statut !== 'depose') throw new Error('dépôt attendu');
    expect(await verifierIntegrite(stockage, r.meta.id)).toEqual({ intacte: true, motif: null });
  });

  // C'est le test qui donne son sens à l'empreinte. Sans lui, on stockerait un
  // condensat que personne ne recalcule jamais — exactement le `piece: true`
  // de l'ancienne version, en plus long.
  it('détecte un contenu remplacé sous le même identifiant', async () => {
    const stockage = stockageMemoireJustificatifs();
    const r = await deposerJustificatif(stockage, pdf('abc'), DEPENSE, LE_10_JUILLET);
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
    await deposerJustificatif(stockage, pdf('abc'), DEPENSE, LE_10_JUILLET);
    const [meta] = await stockage.lister();
    expect(meta).toBeDefined();
    expect('contenu' in meta!).toBe(false);
    expect(meta!.empreinte).toMatch(/^[0-9a-f]{64}$/);
  });

  it('un stockage vide se liste sans échouer', async () => {
    expect(await stockageMemoireJustificatifs().lister()).toEqual([]);
  });
});

/**
 * Migration des métadonnées IndexedDB, du format 1 (`depenseId`) vers le
 * format généralisé (`fait`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE FONCTION PURE, ET PAS UN TEST SUR `stockageIndexedDB`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * IndexedDB n'existe pas dans l'environnement de test (`node`, sans jsdom ni
 * `fake-indexeddb` — voir `vitest.config.ts`) : c'est déjà le cas pour le
 * reste de ce module, qui teste `stockageMemoireJustificatifs` et jamais
 * `stockageIndexedDB` directement. `migrerMeta` porte TOUTE la logique de
 * conversion ; `onupgradeneeded` ne fait que l'appliquer à chaque
 * enregistrement via un curseur, ce que ce test ne peut pas rejouer sans un
 * vrai navigateur.
 */
describe('migration d’une base à l’ancien format', () => {
  const ancienne = (depenseId: string) => ({
    id: `${depenseId}-abc123`, nomFichier: 'facture.pdf', typeMime: 'application/pdf',
    taille: 1024, empreinte: 'abc123', deposeLe: '2025-01-10T00:00:00.000Z', depenseId
  });

  it('une base à l’ancien format se migre sans perdre le rattachement aux dépenses', () => {
    const migree = migrerMeta(ancienne('dep-9'));
    expect(migree.fait).toEqual({ nature: 'depense', id: 'dep-9' });
    expect('depenseId' in migree).toBe(false);
    // Rien d'autre n'a bougé : nom, type, taille, empreinte, horodatage.
    expect(migree).toMatchObject({
      nomFichier: 'facture.pdf', typeMime: 'application/pdf',
      taille: 1024, empreinte: 'abc123', deposeLe: '2025-01-10T00:00:00.000Z'
    });
  });

  // Idempotence : le curseur de migration rappelle `migrerMeta` sans
  // condition (voir `onupgradeneeded`) ; une pièce déjà migrée doit donc
  // traverser sans changer, sinon une seconde ouverture de la base la casse.
  it('laisse passer une pièce déjà au format courant', () => {
    const dejaMigree = {
      id: 'depense-dep-1-abc', nomFichier: 'f.pdf', typeMime: 'application/pdf',
      taille: 10, empreinte: 'abc', deposeLe: '2026-01-01T00:00:00.000Z',
      fait: { nature: 'depense' as const, id: 'dep-1' }
    };
    expect(migrerMeta(dejaMigree)).toEqual(dejaMigree);
  });
});
