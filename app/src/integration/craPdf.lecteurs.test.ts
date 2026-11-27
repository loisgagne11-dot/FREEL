import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pourDestinataire, syntheseHebdomadaire } from '../domain/calculs/cra';
import { mois as moisDe } from '../domain/types';
import type { Faits } from '../state/schema';
import { completerFaits } from '../state/schema.migrations';
import { journeesDuMois } from '../state/selecteurs.cra';
import { chargerJeu } from '../test/jeu-d-essai';
import { pdfDuCra } from '../ui/documents/craPdf';
import { modeleDuCra, type ModeleCra } from '../ui/documents/modeleCra';

/**
 * Le PDF du compte rendu, relu par les lecteurs dont un client se servira.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI DES LECTEURS EXTÉRIEURS, EN PLUS DU NÔTRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `test/lirePdf` vérifie le format tel que nous l'avons compris. Une erreur
 * de compréhension — un opérateur mal placé, une police mal déclarée — y
 * passerait, puisque l'écrivain et le lecteur la partageraient. Poppler
 * (`pdfinfo`, `pdftotext`) et pypdf en mode strict ont été écrits par
 * d'autres, sur la norme : s'ils relisent sans un avertissement, le fichier
 * s'ouvre ailleurs que chez nous.
 *
 * Ces outils ne sont pas des dépendances du projet. Là où ils manquent, le
 * test s'abstient et LE DIT dans son nom ; la structure du fichier reste
 * vérifiée partout par `infra/pdf.test.ts`.
 */

const POPPLER = spawnSync('pdfinfo', ['-v']).error === undefined;
const PYPDF = spawnSync('python3', ['-I', '-c', 'import pypdf']).status === 0;

const CREATION = new Date(Date.UTC(2026, 10, 27, 9, 30));
const DOSSIER = mkdtempSync(join(tmpdir(), 'freel-cra-pdf-'));

function demonstration(): Faits {
  const chemin = join(import.meta.dirname, '../../public/jeu-de-demonstration.json');
  return completerFaits(JSON.parse(readFileSync(chemin, 'utf8')));
}

/** Le CRA du mois tel que l'atelier le compose : synthèse, destinataire, notes. */
function modeleDe(faits: Faits, m: string, destinataire: string | null): ModeleCra {
  const leMois = moisDe(m);
  const synthese = pourDestinataire(syntheseHebdomadaire(leMois, journeesDuMois(faits, leMois)), destinataire);
  const taches: Record<string, string> = {};
  for (const n of faits.notesCra) if (n.destinataire === (destinataire ?? '')) taches[n.semaine] = n.texte;
  return modeleDuCra(synthese, faits.entreprise, destinataire, taches);
}

const CAS = [
  { nom: 'démonstration, un client', faits: demonstration, mois: '2026-06', destinataire: 'Studio Lumen' },
  { nom: 'démonstration, tous clients', faits: demonstration, mois: '2026-06', destinataire: null },
  { nom: 'jeu d’essai', faits: chargerJeu, mois: '2026-12', destinataire: 'Client Final Démo' }
] as const;

/** Les textes que le lecteur doit retrouver : chaque ligne du modèle. */
function attendus(m: ModeleCra): string[] {
  return [
    m.periode, m.destinataire,
    ...m.semaines.flatMap((s) => [s.libelle, s.plage, ...s.volumes.map((v) => v.client)]),
    m.grandTotal.libelle, m.grandTotal.valeur, ...m.signatures
  ];
}

describe.each(CAS)('le PDF du compte rendu ($nom)', ({ nom, faits, mois, destinataire }) => {
  const modele = modeleDe(faits(), mois, destinataire);
  const chemin = join(DOSSIER, `${nom.replace(/\W+/g, '-')}.pdf`);
  writeFileSync(chemin, pdfDuCra(modele, CREATION));

  // Le cas doit dire quelque chose : un mois vide passerait sans rien prouver.
  it('porte des semaines', () => {
    expect(modele.semaines.length).toBeGreaterThan(0);
  });

  it.skipIf(!POPPLER)(`se relit par pdfinfo sans avertissement${POPPLER ? '' : ' (pdfinfo absent : non vérifié ici)'}`, () => {
    const r = spawnSync('pdfinfo', ['-enc', 'UTF-8', chemin], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/^PDF version:\s+1\.4$/m);
    expect(r.stdout).toMatch(/^JavaScript:\s+no$/m);
    expect(r.stdout).toMatch(/^Form:\s+none$/m);
    expect(r.stdout).toMatch(/^Page size:\s+595\.28 x 841\.89 pts \(A4\)$/m);
    expect(/^Title:\s+(.*)$/m.exec(r.stdout)?.[1]).toBe(modele.titre);
    expect(/^Producer:\s+(.*)$/m.exec(r.stdout)?.[1]).toBe('FREEL');
  });

  it.skipIf(!POPPLER)(`se relit par pdftotext, chaque ligne du modèle comprise${POPPLER ? '' : ' (pdftotext absent : non vérifié ici)'}`, () => {
    const r = spawnSync('pdftotext', ['-enc', 'UTF-8', chemin, '-'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
    const texte = r.stdout.replace(/[  ]/g, ' ');
    for (const t of attendus(modele)) expect(texte).toContain(t.replace(/[  ]/g, ' '));
    // La flèche des plages vient de Symbol : elle doit se relire « → ».
    expect(texte).toMatch(/\d{2} → \d{2} /);
    expect(texte).not.toContain('?');
  });

  it.skipIf(!PYPDF)(`se relit par pypdf en mode strict${PYPDF ? '' : ' (pypdf absent : non vérifié ici)'}`, () => {
    const script = [
      'import sys, json',
      'from pypdf import PdfReader',
      'r = PdfReader(sys.argv[1], strict=True)',
      'print(json.dumps({"pages": len(r.pages), "titre": r.metadata.title,',
      '  "producteur": r.metadata.producer, "creation": r.metadata.creation_date.isoformat(),',
      '  "texte": "\\n".join(p.extract_text() for p in r.pages)}))'
    ].join('\n');
    const r = spawnSync('python3', ['-I', '-c', script, chemin], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const lu = JSON.parse(r.stdout) as {
      pages: number; titre: string; producteur: string; creation: string; texte: string;
    };
    expect(lu.titre).toBe(modele.titre);
    expect(lu.producteur).toBe('FREEL');
    expect(lu.creation).toBe('2026-11-27T09:30:00+00:00');
    expect(lu.texte).toContain(`1 / ${lu.pages}`);
    for (const s of modele.semaines) expect(lu.texte).toContain(s.plage);
  });
});
