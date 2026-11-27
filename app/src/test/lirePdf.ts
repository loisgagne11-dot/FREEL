/**
 * Relire, dans un test, un PDF écrit par `infra/pdf` — sans bibliothèque.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN LECTEUR QUI REFUSE AU LIEU DE RÉPARER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La plupart des lecteurs PDF « réparent » en silence un fichier dont la
 * table des renvois est fausse : un test qui ouvrirait le fichier avec l'un
 * d'eux resterait vert sur un document cassé. Celui-ci LÈVE à la première
 * incohérence — décalage, longueur de flux, entrée de renvoi qui n'a pas ses
 * vingt octets.
 *
 * Il décode les octets par `TextDecoder('windows-1252')`, pas par la table
 * de l'écrivain : un test qui relirait avec la table qu'il vérifie ne
 * prouverait rien.
 */

/** Un texte posé par un seul appel à `texte()` : un bloc BT … ET. */
export interface TexteRelu {
  readonly texte: string;
  readonly x: number;
  /** La ligne de base, en points depuis le HAUT de la page. */
  readonly y: number;
  /** Les ressources de police employées, dans l'ordre (`F1`…`F5`). */
  readonly polices: readonly string[];
  readonly taille: number;
}

export interface PdfRelu {
  /** Le fichier, octet pour caractère. */
  readonly brut: string;
  /** Le corps de chaque objet, par numéro. */
  readonly objets: ReadonlyMap<number, string>;
  /** Le flux de contenu de chaque page, dans l'ordre des pages. */
  readonly flux: readonly string[];
  /** Les textes de chaque page, dans l'ordre où ils ont été posés. */
  readonly pages: readonly (readonly TexteRelu[])[];
}

const windows1252 = new TextDecoder('windows-1252');

/** Les octets d'une chaîne littérale, `(` d'ouverture à la position `debut`. */
function lireLitterale(s: string, debut: number): { octets: number[]; fin: number } {
  const octets: number[] = [];
  let i = debut + 1;
  let profondeur = 1;
  while (i < s.length) {
    const c = s[i] as string;
    if (c === '\\') {
      const suivant = s[i + 1] as string;
      const octal = /^[0-7]{1,3}/.exec(s.slice(i + 1, i + 4));
      if (octal !== null) {
        octets.push(parseInt(octal[0], 8));
        i += 1 + octal[0].length;
        continue;
      }
      const echappes: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
      octets.push(echappes[suivant] ?? suivant.charCodeAt(0));
      i += 2;
      continue;
    }
    if (c === '(') profondeur += 1;
    if (c === ')') {
      profondeur -= 1;
      if (profondeur === 0) return { octets, fin: i + 1 };
    }
    octets.push(c.charCodeAt(0));
    i += 1;
  }
  throw new Error('Chaîne littérale non refermée');
}

type Jeton = { readonly chaine: number[] } | { readonly mot: string };

/**
 * Les jetons d'un flux. Les chaînes sont lues en entier AVANT de chercher un
 * opérateur : un client qui s'appelle « BT » ne doit pas ouvrir un bloc.
 */
function jetons(flux: string): Jeton[] {
  const sortie: Jeton[] = [];
  let i = 0;
  while (i < flux.length) {
    const c = flux[i] as string;
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '(') {
      const { octets, fin } = lireLitterale(flux, i);
      sortie.push({ chaine: octets });
      i = fin;
      continue;
    }
    if (c === '[' || c === ']') { sortie.push({ mot: c }); i += 1; continue; }
    const mot = /^\/?[^\s()[\]/]+/.exec(flux.slice(i))?.[0] ?? c;
    sortie.push({ mot });
    i += mot.length;
  }
  return sortie;
}

function textesDuFlux(flux: string, hauteur: number): TexteRelu[] {
  const textes: TexteRelu[] = [];
  let pile: Jeton[] = [];
  let bloc: { texte: string; polices: string[]; taille: number; x: number; y: number } | null = null;
  let police = '';
  const nombreA = (k: number): number => {
    const j = pile[pile.length - k];
    return j !== undefined && 'mot' in j ? Number(j.mot) : NaN;
  };

  for (const j of jetons(flux)) {
    if ('chaine' in j || /^[-\d.[\]/]/.test(j.mot)) { pile.push(j); continue; }
    switch (j.mot) {
      case 'BT':
        bloc = { texte: '', polices: [], taille: 0, x: NaN, y: NaN };
        break;
      case 'Tf': {
        const nom = pile[pile.length - 2];
        police = nom !== undefined && 'mot' in nom ? nom.mot.slice(1) : '';
        if (bloc !== null) { bloc.polices.push(police); bloc.taille = nombreA(1); }
        break;
      }
      case 'Tm':
        if (bloc !== null) { bloc.x = nombreA(2); bloc.y = hauteur - nombreA(1); }
        break;
      case 'Tj': {
        const s = pile[pile.length - 1];
        if (bloc !== null && s !== undefined && 'chaine' in s) {
          // Symbol (F5) n'a qu'un caractère dans ce projet : la flèche.
          bloc.texte += police === 'F5'
            ? s.chaine.map((o) => (o === 0xAE ? '→' : '�')).join('')
            : windows1252.decode(new Uint8Array(s.chaine));
        }
        break;
      }
      case 'ET':
        if (bloc !== null) textes.push(bloc);
        bloc = null;
        break;
      default:
        break;
    }
    pile = [];
  }
  return textes;
}

export function relirePdf(octets: Uint8Array): PdfRelu {
  let brut = '';
  for (const o of octets) brut += String.fromCharCode(o);
  if (!brut.startsWith('%PDF-1.4\n')) throw new Error('En-tête %PDF-1.4 absent');

  const fin = /startxref\n(\d+)\n%%EOF\n$/.exec(brut);
  if (fin === null) throw new Error('startxref / %%EOF absents ou mal placés');
  const debutRenvois = Number(fin[1]);
  if (!brut.startsWith('xref\n', debutRenvois)) {
    throw new Error(`startxref (${debutRenvois}) ne désigne pas la table des renvois`);
  }

  const entete = /^xref\n0 (\d+)\n/.exec(brut.slice(debutRenvois));
  if (entete === null) throw new Error('Sous-section de renvois illisible');
  const taille = Number(entete[1]);
  const debutEntrees = debutRenvois + entete[0].length;
  const objets = new Map<number, string>();
  for (let n = 0; n < taille; n += 1) {
    const entree = brut.slice(debutEntrees + 20 * n, debutEntrees + 20 * (n + 1));
    if (!/^\d{10} \d{5} [nf] \n$/.test(entree)) {
      throw new Error(`Entrée de renvoi ${n} sans ses vingt octets : ${JSON.stringify(entree)}`);
    }
    if (n === 0) continue;
    const decalage = Number(entree.slice(0, 10));
    const attendu = `${n} 0 obj\n`;
    if (!brut.startsWith(attendu, decalage)) {
      throw new Error(`Objet ${n} : le renvoi pointe sur ${JSON.stringify(brut.slice(decalage, decalage + 12))}`);
    }
    const finObjet = brut.indexOf('\nendobj\n', decalage);
    objets.set(n, brut.slice(decalage + attendu.length, finObjet));
  }

  const trailer = /trailer\n<< \/Size (\d+) \/Root (\d+) 0 R \/Info (\d+) 0 R >>/.exec(brut);
  if (trailer === null || Number(trailer[1]) !== taille) throw new Error('Trailer incohérent');

  const catalogue = objets.get(Number(trailer[2])) ?? '';
  const arbre = objets.get(Number(/\/Pages (\d+) 0 R/.exec(catalogue)?.[1])) ?? '';
  const enfants = [...(/\/Kids \[([^\]]*)\]/.exec(arbre)?.[1] ?? '').matchAll(/(\d+) 0 R/g)]
    .map((m) => Number(m[1]));
  if (Number(/\/Count (\d+)/.exec(arbre)?.[1]) !== enfants.length) throw new Error('/Count faux');

  const flux: string[] = [];
  const pages: TexteRelu[][] = [];
  for (const numero of enfants) {
    const page = objets.get(numero) ?? '';
    const boite = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(page);
    const hauteur = Number(boite?.[2]);
    const contenu = objets.get(Number(/\/Contents (\d+) 0 R/.exec(page)?.[1])) ?? '';
    const forme = /^<< \/Length (\d+) >>\nstream\n/.exec(contenu);
    if (forme === null) throw new Error(`Page ${numero} : flux illisible`);
    const longueur = Number(forme[1]);
    const donnees = contenu.slice(forme[0].length);
    if (donnees.length !== longueur + '\nendstream'.length || !donnees.endsWith('\nendstream')) {
      throw new Error(`Page ${numero} : /Length ${longueur} ne tombe pas sur endstream`);
    }
    const corps = donnees.slice(0, longueur);
    flux.push(corps);
    pages.push(textesDuFlux(corps, hauteur));
  }

  return { brut, objets, flux, pages };
}

/** Le titre du document, décodé de son UTF-16BE. */
export function titreDuPdf(relu: PdfRelu): string {
  const hex = /\/Title <FEFF([0-9A-F]*)>/.exec(relu.brut)?.[1] ?? '';
  let titre = '';
  for (let i = 0; i < hex.length; i += 4) titre += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return titre;
}
