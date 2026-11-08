import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ErreurArchive, crc32, ecrireZip, lireZip, nomDeFichierSur, type EntreeZip } from './archive.zip';

const DATE = new Date(2026, 6, 10, 9, 30, 12);
const NOM_ACCENTUE = 'justificatifs/2026/Café € 89,00.pdf';

function tousLesOctets(): Uint8Array<ArrayBuffer> {
  return Uint8Array.from({ length: 256 }, (_, i) => i);
}

function exemple(): EntreeZip[] {
  return [
    { nom: 'faits.json', contenu: new Blob(['{"a":1}']), date: DATE },
    { nom: 'bin/tout.bin', contenu: new Blob([tousLesOctets()]), date: DATE },
    { nom: NOM_ACCENTUE, contenu: new Blob(['%PDF-fictif']), date: DATE }
  ];
}

async function octetsDe(b: Blob): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await b.arrayBuffer());
}

async function enOctets(): Promise<Uint8Array<ArrayBuffer>> {
  return octetsDe(await ecrireZip(exemple()));
}

const commande = (c: string, args: string[]): boolean => {
  try { execFileSync(c, args, { stdio: 'ignore' }); return true; } catch { return false; }
};
const aUnzip = commande('unzip', ['-v']);
const aPython = commande('python3', ['--version']);

describe('crc32', () => {
  // Valeur de référence publiée : une table fausse produirait des archives que
  // tous les autres outils déclarent corrompues.
  it('donne la valeur standard pour « 123456789 »', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('se chaîne par morceaux comme d\'un seul tenant', () => {
    const o = new TextEncoder().encode('123456789');
    expect(crc32(o.subarray(4), crc32(o.subarray(0, 4)))).toBe(0xcbf43926);
  });
});

describe('aller-retour', () => {
  // Si un octet change à la restauration, une pièce comptable est perdue sans
  // que personne le sache.
  it('restitue noms, contenus octet à octet et dates à 2 s près', async () => {
    const lues = await lireZip(await ecrireZip(exemple()));
    expect(lues.map(e => e.nom)).toEqual(exemple().map(e => e.nom));
    for (const [i, e] of exemple().entries()) {
      const l = lues[i]!;
      expect(await octetsDe(await l.lire())).toEqual(await octetsDe(e.contenu));
      expect(l.taille).toBe(e.contenu.size);
      expect(Math.abs(l.date.getTime() - DATE.getTime())).toBeLessThanOrEqual(2000);
    }
  });

  it('accepte une source asynchrone et une archive vide', async () => {
    async function* source() { yield* exemple(); }
    expect(await lireZip(await ecrireZip(source()))).toHaveLength(3);
    expect(await lireZip(await ecrireZip([]))).toHaveLength(0);
  });

  // Avant 1980 le format DOS déborde sur les bits voisins : la date doit être bornée.
  it('ramène une date antérieure à 1980 à 1980', async () => {
    const [e] = await lireZip(await ecrireZip([
      { nom: 'a', contenu: new Blob(['x']), date: new Date(1970, 0, 1) }
    ]));
    expect(e!.date.getFullYear()).toBe(1980);
  });
});

describe('structure', () => {
  it('porte les signatures et le drapeau UTF-8 (local et annuaire)', async () => {
    const o = await enOctets();
    const v = new DataView(o.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint16(6, true) & 0x0800).toBe(0x0800);
    expect(v.getUint16(8, true)).toBe(0);
    const fin = o.length - 22;
    expect(v.getUint32(fin, true)).toBe(0x06054b50);
    expect(v.getUint16(fin + 10, true)).toBe(3);
    const debutAnnuaire = v.getUint32(fin + 16, true);
    expect(v.getUint32(debutAnnuaire, true)).toBe(0x02014b50);
    expect(v.getUint16(debutAnnuaire + 8, true) & 0x0800).toBe(0x0800);
  });
});

describe('intégrité', () => {
  // Sans cette vérification, une pièce abîmée serait restaurée comme saine.
  it('un octet modifié dans le contenu fait échouer lire()', async () => {
    const o = await enOctets();
    const lues = await lireZip(new Blob([o]));
    // Le contenu de la première entrée suit son en-tête local (30 + nom).
    const position = 30 + 'faits.json'.length;
    o[position] = o[position]! ^ 0xff;
    const abimees = await lireZip(new Blob([o]));
    await expect(abimees[0]!.lire()).rejects.toBeInstanceOf(ErreurArchive);
    await expect(abimees[0]!.lire()).rejects.toThrow(/altéré/);
    await expect(lues[1]!.lire()).resolves.toBeInstanceOf(Blob);
  });
});

describe('archives refusées', () => {
  it('un fichier qui n\'est pas un ZIP', async () => {
    const faux = new Blob([new TextEncoder().encode('ceci est un texte assez long pour dépasser la taille minimale')]);
    await expect(lireZip(faux)).rejects.toThrow(ErreurArchive);
    await expect(lireZip(new Blob(['x']))).rejects.toThrow(/pas une archive ZIP/);
  });

  it('une archive tronquée', async () => {
    const o = await enOctets();
    await expect(lireZip(new Blob([o.subarray(0, o.length - 30)]))).rejects.toThrow(/tronquée/);
  });

  it('une entrée compressée (méthode 8)', async () => {
    const o = await enOctets();
    const v = new DataView(o.buffer);
    const debut = v.getUint32(o.length - 22 + 16, true);
    v.setUint16(debut + 10, 8, true);
    await expect(lireZip(new Blob([o]))).rejects.toThrow(
      'Cette archive est compressée : seules celles produites par l’application se relisent ici.'
    );
  });

  it('une archive multi-volume', async () => {
    const o = await enOctets();
    new DataView(o.buffer).setUint16(o.length - 22 + 4, 1, true);
    await expect(lireZip(new Blob([o]))).rejects.toThrow(/plusieurs volumes/);
  });

  // « Zip slip » : une archive reçue ne doit jamais écrire hors du dossier cible.
  it('un nom qui remonte d\'un dossier, lu dans une archive', async () => {
    const o = await octetsDe(await ecrireZip([{ nom: 'aa/x', contenu: new Blob(['x']), date: DATE }]));
    // Même longueur : « aa/x » devient « ../x » dans l'annuaire.
    const t = new TextEncoder();
    const fin = new DataView(o.buffer).getUint32(o.length - 22 + 16, true);
    await expect(lireZip(new Blob([o]))).resolves.toHaveLength(1);
    o.set(t.encode('../x'), fin + 46);
    await expect(lireZip(new Blob([o]))).rejects.toThrow(ErreurArchive);
  });
});

describe('noms refusés à l\'écriture', () => {
  it.each(['../x', 'a/../x', '/x', '', 'a\\b'])('refuse « %s »', async nom => {
    await expect(ecrireZip([{ nom, contenu: new Blob(['x']), date: DATE }])).rejects.toThrow(ErreurArchive);
  });

  it('refuse deux entrées de même nom', async () => {
    const e = { nom: 'a', contenu: new Blob(['x']), date: DATE };
    await expect(ecrireZip([e, e])).rejects.toThrow(/deux fois/);
  });
});

describe('nomDeFichierSur', () => {
  it('retire les caractères interdits', () => {
    expect(nomDeFichierSur('a/b:c?.pdf')).toBe('abc.pdf');
    expect(nomDeFichierSur('a\u0001  b\t c')).toBe('a b c');
  });

  // Windows refuse « CON.txt » : l'export serait impossible à extraire là-bas.
  it('préfixe les noms réservés Windows', () => {
    expect(nomDeFichierSur('CON.txt')).toBe('_CON.txt');
    expect(nomDeFichierSur('lpt1')).toBe('_lpt1');
    expect(nomDeFichierSur('console.txt')).toBe('console.txt');
  });

  it('rend « sans-nom » quand il ne reste rien', () => {
    expect(nomDeFichierSur('  .  ')).toBe('sans-nom');
    expect(nomDeFichierSur('')).toBe('sans-nom');
    expect(nomDeFichierSur('///')).toBe('sans-nom');
  });

  it('garde accents et euro, coupe points et espaces de fin', () => {
    expect(nomDeFichierSur('Café € 89,00.pdf. ')).toBe('Café € 89,00.pdf');
  });

  it('tronque à 120 caractères en gardant l\'extension', () => {
    const r = nomDeFichierSur(`${'é'.repeat(300)}.pdf`);
    expect(Array.from(r)).toHaveLength(120);
    expect(r.endsWith('.pdf')).toBe(true);
    expect(Array.from(nomDeFichierSur('x'.repeat(300)))).toHaveLength(120);
  });
});

describe('interopérabilité', () => {
  async function ecrireTemp(): Promise<{ dossier: string; chemin: string }> {
    const dossier = mkdtempSync(join(tmpdir(), 'freel-zip-'));
    const chemin = join(dossier, 'archive.zip');
    writeFileSync(chemin, await enOctets());
    return { dossier, chemin };
  }

  // Sans outil indépendant, on ne prouve que la cohérence avec soi-même.
  // (si ni unzip ni python3 n'existent, ces tests sont sautés)
  it.skipIf(!aUnzip)('unzip -t déclare l\'archive saine', async () => {
    const { dossier, chemin } = await ecrireTemp();
    try {
      const sortie = execFileSync('unzip', ['-t', chemin]).toString();
      expect(sortie).toMatch(/No errors detected/);
    } finally { rmSync(dossier, { recursive: true, force: true }); }
  });

  it.skipIf(!aPython)('python3 -m zipfile teste et liste le nom accentué', async () => {
    const { dossier, chemin } = await ecrireTemp();
    try {
      execFileSync('python3', ['-I', '-m', 'zipfile', '-t', chemin]);
      const liste = execFileSync('python3', ['-I', '-m', 'zipfile', '-l', chemin], {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      }).toString('utf-8');
      expect(liste).toContain(NOM_ACCENTUE);
    } finally { rmSync(dossier, { recursive: true, force: true }); }
  });
});
