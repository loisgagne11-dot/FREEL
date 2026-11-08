import { describe, expect, it } from 'vitest';
import {
  CHEMIN_MANIFESTE, construireArchive, lireArchive, nomDeLArchive, orphelinesApres,
  restaurerPieces, type Manifeste
} from './justificatifs.archive';
import { ecrireZip, lireZip, ErreurArchive } from './archive.zip';
import {
  deposerJustificatif, stockageMemoireJustificatifs, type StockageJustificatifs
} from './justificatifs';
import { faitsVides, type Faits } from '../state/schema';
import type { Depense } from '../domain/calculs/depenses';

const MAINTENANT = new Date('2026-09-01T08:00:00Z');

function octetsDe(taille: number, graine: number): Blob {
  const o = new Uint8Array(taille);
  for (let i = 0; i < taille; i++) o[i] = (i * 31 + graine) & 255;
  return new Blob([o]);
}

const depense = (id: string, payeeLe: string | null, montant: number): Depense => ({
  id, libelle: 'achat', fournisseur: 'Fournisseur démo', provenance: 'france',
  montantTtc: montant, tauxTva: 0.2, payeeLe, justificatifId: null, rapprochement: 'aucun'
} as unknown as Depense);

function faitsDemo(): Faits {
  return {
    ...faitsVides(),
    depenses: [depense('d1', '2026-03-14', 89), depense('d2', '2025-12-02', 1234.5)],
    recettes: [{
      id: 'r1', clientNom: 'Client démo', libelle: 'mission', montant: 500,
      emiseLe: '2026-02-10', encaisseeLe: null, modeReglement: null, numero: 'F-001'
    }]
  } as unknown as Faits;
}

async function pieceDe(
  s: StockageJustificatifs, nature: 'depense' | 'recette', id: string, graine: number,
  nom = 'facture.pdf', quand = new Date('2026-04-01T00:00:00Z')
) {
  const r = await deposerJustificatif(
    s, { nom, typeMime: 'application/pdf', contenu: octetsDe(50 + graine, graine) },
    { nature, id }, quand
  );
  if (r.statut !== 'depose') throw new Error('dépôt refusé');
  return r.meta;
}

async function octets(b: Blob): Promise<number[]> {
  return [...new Uint8Array(await b.arrayBuffer())];
}

describe('archive des justificatifs', () => {
  it('aller-retour : faits identiques, pièces restituées à l’octet près avec leurs métadonnées', async () => {
    // Coût : une restauration qui change l'id, la date de dépôt ou un octet ruine la preuve de non-altération.
    const s = stockageMemoireJustificatifs();
    const m1 = await pieceDe(s, 'depense', 'd1', 1);
    const m2 = await pieceDe(s, 'recette', 'r1', 2, 'vente.pdf', new Date('2026-05-05T00:00:00Z'));
    const faits = faitsDemo();
    const { archive } = await construireArchive(faits, s, MAINTENANT);
    const lue = await lireArchive(archive);
    expect(lue.faits).toEqual(JSON.parse(JSON.stringify(faits)));

    const neuf = stockageMemoireJustificatifs();
    const bilan = await restaurerPieces(lue, neuf);
    expect(bilan).toEqual({ ajoutees: 2, dejaPresentes: 0, refusees: [] });
    for (const m of [m1, m2]) {
      const a = (await s.lire(m.id))!;
      const b = (await neuf.lire(m.id))!;
      expect(b.empreinte).toBe(a.empreinte);
      expect(b.deposeLe).toBe(a.deposeLe);
      expect(b.fait).toEqual(a.fait);
      expect(await octets(b.contenu)).toEqual(await octets(a.contenu));
    }
  });

  it('range par année du fait, nature, date, libellé et montant ; suffixe les collisions ; isole les orphelines', async () => {
    // Coût : des pièces introuvables sans l'application, ou deux fichiers qui s'écrasent.
    const s = stockageMemoireJustificatifs();
    await pieceDe(s, 'depense', 'd1', 1);
    await pieceDe(s, 'depense', 'd1', 2, 'autre.pdf');
    await pieceDe(s, 'depense', 'd2', 3);
    await pieceDe(s, 'recette', 'r1', 4);
    await pieceDe(s, 'depense', 'disparue', 5, 'ticket.PDF', new Date('2026-04-09T00:00:00Z'));
    const { manifeste, bilan } = await construireArchive(faitsDemo(), s, MAINTENANT);
    const chemins = manifeste.pieces.map((p) => p.chemin);
    expect(chemins).toContain('justificatifs/2026/depenses/2026-03-14 Fournisseur démo 89,00 €.pdf');
    expect(chemins).toContain('justificatifs/2026/depenses/2026-03-14 Fournisseur démo 89,00 € (2).pdf');
    expect(chemins).toContain('justificatifs/2025/depenses/2025-12-02 Fournisseur démo 1 234,50 €.pdf');
    expect(chemins).toContain('justificatifs/2026/recettes/2026-02-10 F-001 Client démo 500,00 €.pdf');
    const orph = manifeste.pieces.find((p) => p.orpheline)!;
    expect(orph.chemin).toBe('justificatifs/sans-fait/2026-04-09 ticket.pdf');
    expect(bilan.orphelines).toBe(1);
    expect(manifeste.pieces.filter((p) => !p.orpheline)).toHaveLength(4);
  });

  it('une dépense sans date va sous « sans-date »', async () => {
    const s = stockageMemoireJustificatifs();
    await pieceDe(s, 'depense', 'dx', 1);
    const f = { ...faitsDemo(), depenses: [depense('dx', null, 10)] } as Faits;
    const { manifeste } = await construireArchive(f, s, MAINTENANT);
    expect(manifeste.pieces[0]!.chemin).toBe('justificatifs/sans-date/depenses/sans-date Fournisseur démo 10,00 €.pdf');
  });

  it('une pièce altérée est incluse et signalée ; une pièce illisible n’a pas de chemin', async () => {
    // Coût : jeter une pièce altérée détruit la seule copie ; la taire fait croire à une preuve intacte.
    const s = stockageMemoireJustificatifs();
    const alteree = await pieceDe(s, 'depense', 'd1', 1);
    const illisible = await pieceDe(s, 'depense', 'd2', 2);
    s.contenu.set(alteree.id, { ...s.contenu.get(alteree.id)!, contenu: octetsDe(10, 99) });
    const lireOrig = s.lire;
    s.lire = async (id) => (id === illisible.id ? null : lireOrig(id));
    const { manifeste, bilan, archive } = await construireArchive(faitsDemo(), s, MAINTENANT);
    const pa = manifeste.pieces.find((p) => p.id === alteree.id)!;
    const pi = manifeste.pieces.find((p) => p.id === illisible.id)!;
    expect(pa.etat).toBe('alteree');
    expect(pa.chemin).not.toBeNull();
    expect(pi.etat).toBe('illisible');
    expect(pi.chemin).toBeNull();
    expect(bilan).toMatchObject({ pieces: 2, alterees: 1, illisibles: 1 });
    const lue = await lireArchive(archive);
    expect(lue.entrees.has(pa.chemin!)).toBe(true);
    // la pièce altérée sera refusée à la restauration, avec un motif qui le dit
    const r = await restaurerPieces(lue, stockageMemoireJustificatifs());
    expect(r.ajoutees).toBe(0);
    expect(r.refusees.find((x) => x.nomFichier === 'facture.pdf')?.motif).toMatch(/déjà altérée/);
  });

  it('restauration : une pièce déjà présente n’est pas dupliquée ; une autre empreinte sous le même id est refusée', async () => {
    // Coût : écraser une pièce existante par une autre détruirait un justificatif en place.
    const s = stockageMemoireJustificatifs();
    const m1 = await pieceDe(s, 'depense', 'd1', 1);
    const m2 = await pieceDe(s, 'depense', 'd2', 2);
    const lue = await lireArchive((await construireArchive(faitsDemo(), s, MAINTENANT)).archive);

    const cible = stockageMemoireJustificatifs();
    await cible.deposer((await s.lire(m1.id))!);
    const autre = octetsDe(20, 77);
    await cible.deposer({ ...(await s.lire(m2.id))!, empreinte: 'autre', contenu: autre });
    let depots = 0;
    const deposer = cible.deposer;
    cible.deposer = async (j) => { depots++; return deposer(j); };

    const r = await restaurerPieces(lue, cible);
    expect(r.dejaPresentes).toBe(1);
    expect(r.ajoutees).toBe(0);
    expect(r.refusees).toHaveLength(1);
    expect(r.refusees[0]!.motif).toMatch(/autre pièce porte déjà cet identifiant/);
    expect(depots).toBe(0);
    expect((await cible.lire(m2.id))!.contenu).toBe(autre);
  });

  it('une entrée modifiée dans le ZIP est refusée, les autres sont restaurées', async () => {
    // Coût : restaurer sans recontrôle ferait entrer une pièce falsifiée sous l'empreinte d'origine.
    const s = stockageMemoireJustificatifs();
    const m1 = await pieceDe(s, 'depense', 'd1', 1);
    const m2 = await pieceDe(s, 'depense', 'd2', 2);
    const { archive, manifeste } = await construireArchive(faitsDemo(), s, MAINTENANT);
    const cible = manifeste.pieces.find((p) => p.id === m1.id)!.chemin!;
    // Réécriture complète : le CRC est recalculé par ecrireZip, seul le manifeste peut déceler la modification.
    const entrees = await lireZip(archive);
    const refait = await ecrireZip(await Promise.all(entrees.map(async (e) => ({
      nom: e.nom, date: e.date,
      contenu: e.nom === cible ? octetsDe(60, 200) : await e.lire()
    }))));
    const r = await restaurerPieces(await lireArchive(refait), stockageMemoireJustificatifs());
    expect(r.ajoutees).toBe(1);
    expect(r.refusees).toHaveLength(1);
    expect(r.refusees[0]!.motif).toMatch(/modifiée depuis l’archive/);
    void m2;
  });

  it('lireArchive refuse ce qui n’est pas une archive de l’application', async () => {
    const sansManifeste = await ecrireZip([
      { nom: 'a.txt', contenu: new Blob(['x']), date: MAINTENANT }
    ]);
    await expect(lireArchive(sansManifeste)).rejects.toThrow('Ce fichier ZIP n’est pas une archive de l’application.');

    const format2 = await ecrireZip([
      { nom: 'freel-donnees.json', contenu: new Blob(['{}']), date: MAINTENANT },
      { nom: CHEMIN_MANIFESTE, contenu: new Blob([JSON.stringify({ format: 2 })]), date: MAINTENANT }
    ]);
    await expect(lireArchive(format2)).rejects.toThrow(/version plus récente/);

    await expect(lireArchive(new Blob(['pas un zip du tout, vraiment pas, non']))).rejects.toBeInstanceOf(ErreurArchive);

    const forme = await ecrireZip([
      { nom: 'freel-donnees.json', contenu: new Blob(['{}']), date: MAINTENANT },
      { nom: CHEMIN_MANIFESTE, contenu: new Blob([JSON.stringify(
        { format: 1, application: 'FREEL', produiteLe: 'x', pieces: [{ id: 3 }] })]), date: MAINTENANT }
    ]);
    await expect(lireArchive(forme)).rejects.toBeInstanceOf(ErreurArchive);
  });

  it('orphelinesApres compte les pièces dont le fait disparaît, en lisant défensivement', async () => {
    const s = stockageMemoireJustificatifs();
    await pieceDe(s, 'depense', 'd1', 1);
    await pieceDe(s, 'recette', 'r1', 2);
    const metas = await s.lister();
    expect(orphelinesApres(metas, { depenses: [{ id: 'd1' }], recettes: [] })).toBe(1);
    expect(orphelinesApres(metas, {})).toBe(2);
    expect(orphelinesApres(metas, null)).toBe(2);
    expect(orphelinesApres(metas, { depenses: [{ id: 'd1' }], recettes: [{ id: 'r1' }] })).toBe(0);
  });

  it('le LISEZMOI dit la conservation et la limite de l’empreinte', async () => {
    const s = stockageMemoireJustificatifs();
    await pieceDe(s, 'depense', 'd1', 1);
    const lue = await lireArchive((await construireArchive(faitsDemo(), s, MAINTENANT)).archive);
    const texte = await (await lue.entrees.get('LISEZMOI.txt')!.lire()).text();
    expect(texte).toContain('L102 B');
    expect(texte).toContain('L123-22');
    expect(texte).toContain('ne remplace ni l’original');
    // Coût : promettre une valeur probante que l'empreinte seule n'a pas.
    expect(texte.replace('à valeur probante', '')).not.toContain('valeur probante');
    expect(texte).toMatch(/1 pièce\(s\), dont 0 altérée/);
  });

  it('lit chaque pièce une seule fois', async () => {
    // Coût : une double lecture doublerait les E/S sur des pièces de plusieurs Mo.
    const s = stockageMemoireJustificatifs();
    const contenu = octetsDe(1024, 3);
    for (let i = 0; i < 200; i++) {
      await s.deposer({
        id: `p${i}`, nomFichier: `p${i}.pdf`, typeMime: 'application/pdf', taille: 1024,
        empreinte: 'x', deposeLe: '2026-01-01T00:00:00.000Z', fait: { nature: 'depense', id: 'd1' },
        contenu
      });
    }
    let lectures = 0;
    const lire = s.lire;
    s.lire = async (id) => { lectures++; return lire(id); };
    const { bilan } = await construireArchive(faitsDemo(), s, MAINTENANT);
    expect(lectures).toBe(200);
    expect(bilan.pieces).toBe(200);
  });

  it('nomme l’archive comme la sauvegarde, en .zip', () => {
    expect(nomDeLArchive('Atelier Démo', '2026-09-01')).toBe('freel-atelier-démo-archive-2026-09-01.zip');
    expect(nomDeLArchive('  ', '2026-09-01')).toBe('freel-donnees-archive-2026-09-01.zip');
  });

  it('le manifeste écrit est relu à l’identique', async () => {
    const s = stockageMemoireJustificatifs();
    await pieceDe(s, 'depense', 'd1', 1);
    const { archive, manifeste } = await construireArchive(faitsDemo(), s, MAINTENANT);
    const lue = await lireArchive(archive);
    expect(lue.manifeste).toEqual(JSON.parse(JSON.stringify(manifeste)) as Manifeste);
  });
});
