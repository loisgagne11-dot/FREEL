/**
 * Un écrivain PDF minimal : du texte, des filets, des aplats, des pages.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ÉCRIRE LE FORMAT PLUTÔT QUE CHARGER UNE BIBLIOTHÈQUE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application chargeait jsPDF — 419 Ko bloquants — pour produire
 * des documents faits de texte, de filets et d'aplats. Ce module en fait
 * autant en quelques kilo-octets, chargé au clic, et sans dépendance qu'il
 * faudrait auditer avant la publication. Ce qu'il sait faire est exactement
 * ce qu'un compte rendu d'activité demande ; rien de plus.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES QUATRE POLICES QUE TOUT LECTEUR CONNAÎT, ET AUCUNE AUTRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Helvetica (droite, grasse, oblique, grasse oblique) et Symbol font partie
 * des quatorze polices qu'un lecteur PDF doit fournir : rien à embarquer, et
 * le fichier reste léger. Le prix : leur encodage, WinAnsi, ne couvre que le
 * latin d'Europe de l'Ouest. Chaque caractère passe donc par une table ; ce
 * qui n'y est pas devient « ? », jamais un octet invalide qu'un lecteur
 * afficherait n'importe comment. La flèche des plages de semaine
 * (« 01 → 05 juin ») n'est pas dans WinAnsi : elle vient de Symbol, sans
 * quoi chaque ligne de semaine afficherait « 01 ? 05 juin ».
 *
 * Les chasses de la table AFM (Adobe Core14) sont déclarées dans le fichier :
 * le lecteur espace les lettres comme on les a mesurées, et ce qu'on aligne
 * à droite tombe à droite, quelle que soit la police qu'il substitue.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN FICHIER QUI SE RELIT SANS RÉPARATION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La table des renvois donne la position de chaque objet, à l'octet près.
 * Un décalage faux, et la plupart des lecteurs « réparent » en silence —
 * mais pas tous, et pas un service comptable qui archive. Le fichier est
 * donc tout en ASCII (les octets hauts des chaînes s'écrivent en octal) :
 * une longueur de chaîne y est une longueur en octets, sans conversion qui
 * pourrait la fausser. Les flux ne sont pas compressés : un CRA pèse
 * quelques kilo-octets, et un fichier lisible se vérifie à l'œil.
 *
 * Aucun JavaScript, aucun formulaire, aucune action : un document qui part
 * chez un client ne doit rien pouvoir exécuter.
 */

/** Une page A4 portrait, en points. */
export const A4 = { largeur: 595.28, hauteur: 841.89 } as const;

export type Police = 'normal' | 'gras' | 'italique' | 'grasItalique';

const RESSOURCE: Readonly<Record<Police | 'symbole', string>> = {
  normal: 'F1', gras: 'F2', italique: 'F3', grasItalique: 'F4', symbole: 'F5'
};
const NOM_DE_BASE: Readonly<Record<Police | 'symbole', string>> = {
  normal: 'Helvetica',
  gras: 'Helvetica-Bold',
  italique: 'Helvetica-Oblique',
  grasItalique: 'Helvetica-BoldOblique',
  symbole: 'Symbol'
};

/*
 * Chasses AFM d'Helvetica et d'Helvetica-Bold, en millièmes d'em, pour les
 * codes WinAnsi 0x20 à 0xFF (Adobe Core14 AFM, recoupées sur deux relevés
 * indépendants). Les obliques ont les chasses de leur droite. Un zéro marque
 * un code que WinAnsi n'attribue pas : `octetWinAnsi` ne le produit jamais.
 */
const CHASSES_NORMAL: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 0,
  556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
  0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667,
  278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
  400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500
];
const CHASSES_GRAS: readonly number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 0,
  556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
  0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667,
  278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333,
  400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278,
  611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556
];

/*
 * Ce que WinAnsi range entre 0x80 et 0x9F, là où il s'écarte de Latin-1 :
 * l'apostrophe typographique, les tirets, les points de suspension, l'euro,
 * « œ »… Tout le reste du latin courant (é, è, à, ç, ô, « », l'espace
 * insécable) a en WinAnsi le même code qu'en Unicode.
 */
const WINANSI_HAUT: ReadonlyMap<number, number> = new Map([
  [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88], [0x2030, 0x89], [0x0160, 0x8A],
  [0x2039, 0x8B], [0x0152, 0x8C], [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92],
  [0x201C, 0x93], [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B], [0x0153, 0x9C],
  [0x017E, 0x9E], [0x0178, 0x9F]
]);

/** Ce que Symbol fournit et que WinAnsi n'a pas : code, chasse en millièmes. */
const SYMBOLE: ReadonlyMap<number, readonly [number, number]> = new Map([
  [0x2192, [0xAE, 987]] // →, la plage d'une semaine
]);

const POINT_D_INTERROGATION = 0x3F;

/**
 * L'octet WinAnsi d'un caractère, ou `null` s'il n'en a pas.
 *
 * L'espace fine insécable (U+202F) est le séparateur de milliers d'`Intl` en
 * français : WinAnsi ne l'a pas, et la rendre « ? » ferait lire « 1?234 j ».
 * Elle devient une espace ordinaire — la découpe des lignes, qui travaille
 * AVANT l'encodage, la tient toujours pour insécable.
 */
export function octetWinAnsi(point: number): number | null {
  if (point >= 0x20 && point <= 0x7E) return point;
  if (point >= 0xA0 && point <= 0xFF) return point;
  if (point === 0x202F) return 0x20;
  return WINANSI_HAUT.get(point) ?? null;
}

/** Le texte en octets WinAnsi ; un caractère hors table devient « ? ». */
export function encoderWinAnsi(texte: string): number[] {
  // `for…of` parcourt les points de code : un émoji (deux unités UTF-16)
  // donne UN « ? », pas deux.
  const octets: number[] = [];
  for (const c of texte) octets.push(octetWinAnsi(c.codePointAt(0) as number) ?? POINT_D_INTERROGATION);
  return octets;
}

const chasses = (police: Police): readonly number[] =>
  police === 'gras' || police === 'grasItalique' ? CHASSES_GRAS : CHASSES_NORMAL;

/** Un morceau de texte d'une seule police, prêt à écrire. */
interface Morceau {
  readonly police: Police | 'symbole';
  readonly octets: readonly number[];
  readonly milliemes: number;
}

/** Le texte coupé là où il change de police : WinAnsi, puis Symbol pour la flèche. */
function morceaux(texte: string, police: Police): Morceau[] {
  const sortie: { police: Police | 'symbole'; octets: number[]; milliemes: number }[] = [];
  const table = chasses(police);
  for (const c of texte) {
    const point = c.codePointAt(0) as number;
    const octet = octetWinAnsi(point);
    const symbole = octet === null ? SYMBOLE.get(point) : undefined;
    const cible: Police | 'symbole' = symbole === undefined ? police : 'symbole';
    const code = symbole?.[0] ?? octet ?? POINT_D_INTERROGATION;
    const chasse = symbole?.[1] ?? (table[code - 0x20] as number);
    const dernier = sortie[sortie.length - 1];
    if (dernier !== undefined && dernier.police === cible) {
      dernier.octets.push(code);
      dernier.milliemes += chasse;
    } else {
      sortie.push({ police: cible, octets: [code], milliemes: chasse });
    }
  }
  return sortie;
}

/**
 * La largeur d'un texte, en points.
 *
 * `espacement` est l'interlettrage en em, comme le `letter-spacing` de la
 * feuille : il s'ajoute après CHAQUE caractère, le dernier compris — c'est
 * aussi ce que fait le navigateur, et l'alignement à droite reste le même.
 */
export function largeurTexte(texte: string, police: Police, taille: number, espacement = 0): number {
  let milliemes = 0;
  let n = 0;
  for (const m of morceaux(texte, police)) {
    milliemes += m.milliemes;
    n += m.octets.length;
  }
  return (milliemes * taille) / 1000 + espacement * taille * n;
}

/** Un fragment de paragraphe : un texte, sa police. */
export interface Fragment {
  readonly texte: string;
  readonly police: Police;
}

/*
 * Les espaces où une ligne peut se couper : celles qu'un navigateur réduit
 * (`white-space: normal`). PAS `\s` : il compte l'espace insécable, et
 * couperait « 4,5 j » ou « renseigné ; » là où l'aperçu les tient ensemble.
 * Un saut de ligne tapé dans une phrase de tâches redevient une espace,
 * comme à l'écran.
 */
const ESPACES = /[ \t\n\r\f]/;

/**
 * Un paragraphe en lignes d'au plus `largeurMax` points, polices mêlées.
 *
 * Un mot plus long que la ligne se coupe à la lettre : une adresse collée
 * sans espace ne doit pas déborder du cadre, ni disparaître.
 */
export function couperParagraphe(
  fragments: readonly Fragment[], taille: number, largeurMax: number
): Fragment[][] {
  type Mot = { morceaux: Fragment[]; avantEspace: Police | null };
  const mots: Mot[] = [];
  let espaceEnAttente: Police | null = null;
  let courant: Mot | null = null;

  for (const f of fragments) {
    for (const c of f.texte) {
      if (ESPACES.test(c)) {
        if (courant !== null) { mots.push(courant); courant = null; }
        espaceEnAttente ??= f.police;
        continue;
      }
      if (courant === null) {
        courant = { morceaux: [], avantEspace: mots.length === 0 ? null : espaceEnAttente };
        espaceEnAttente = null;
      }
      const dernier = courant.morceaux[courant.morceaux.length - 1];
      if (dernier !== undefined && dernier.police === f.police) {
        courant.morceaux[courant.morceaux.length - 1] = { texte: dernier.texte + c, police: f.police };
      } else {
        courant.morceaux.push({ texte: c, police: f.police });
      }
    }
  }
  if (courant !== null) mots.push(courant);

  const largeurDe = (frs: readonly Fragment[]): number =>
    frs.reduce((s, x) => s + largeurTexte(x.texte, x.police, taille), 0);

  const lignes: Fragment[][] = [];
  let ligne: Fragment[] = [];
  let largeur = 0;
  const ajouter = (x: Fragment): void => {
    const dernier = ligne[ligne.length - 1];
    if (dernier !== undefined && dernier.police === x.police) {
      ligne[ligne.length - 1] = { texte: dernier.texte + x.texte, police: x.police };
    } else {
      ligne.push(x);
    }
  };

  for (const mot of mots) {
    const largeurMot = largeurDe(mot.morceaux);
    const espace: Fragment | null = mot.avantEspace === null || ligne.length === 0
      ? null
      : { texte: ' ', police: mot.avantEspace };
    const largeurEspace = espace === null ? 0 : largeurDe([espace]);

    if (ligne.length > 0 && largeur + largeurEspace + largeurMot > largeurMax) {
      lignes.push(ligne);
      ligne = [];
      largeur = 0;
    }
    if (ligne.length > 0 && espace !== null) {
      ajouter(espace);
      largeur += largeurEspace;
    }
    if (largeurMot <= largeurMax - largeur) {
      mot.morceaux.forEach(ajouter);
      largeur += largeurMot;
      continue;
    }
    // Le mot ne tient sur aucune ligne : on le coupe à la lettre.
    for (const m of mot.morceaux) {
      for (const c of m.texte) {
        const l = largeurTexte(c, m.police, taille);
        if (ligne.length > 0 && largeur + l > largeurMax) {
          lignes.push(ligne);
          ligne = [];
          largeur = 0;
        }
        ajouter({ texte: c, police: m.police });
        largeur += l;
      }
    }
  }
  if (ligne.length > 0) lignes.push(ligne);
  return lignes;
}

/** Un texte d'une seule police en lignes ; aucune ligne pour un texte vide. */
export function couperEnLignes(
  texte: string, police: Police, taille: number, largeurMax: number
): string[] {
  return couperParagraphe([{ texte, police }], taille, largeurMax)
    .map((l) => l.map((f) => f.texte).join(''));
}

export interface StyleTexte {
  readonly police?: Police;
  readonly taille: number;
  /** `#rrggbb`. */
  readonly couleur?: string;
  /** Interlettrage, en em (le `letter-spacing` de la feuille). */
  readonly espacement?: number;
}

export interface StyleTrait {
  readonly epaisseur: number;
  readonly couleur: string;
  /** Longueur du trait et de l'intervalle, pour un pointillé. */
  readonly pointilles?: readonly [number, number];
}

/** Un nombre tel que le format l'accepte : ni exposant, ni « NaN ». */
function nombre(n: number): string {
  if (!Number.isFinite(n)) {
    // Un NaN dans un flux, c'est un fichier que le lecteur refuse ou
    // dessine faux sans le dire : mieux vaut échouer ici, bruyamment.
    throw new Error(`Valeur non finie dans le PDF : ${n}`);
  }
  const arrondi = Math.round(n * 1000) / 1000;
  return Object.is(arrondi, -0) ? '0' : String(arrondi);
}

function teinte(couleur: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(couleur);
  if (m === null) throw new Error(`Couleur illisible : ${couleur}`);
  return [m[1], m[2], m[3]].map((h) => nombre(parseInt(h as string, 16) / 255)).join(' ');
}

/**
 * Une chaîne littérale du format : `(`, `)` et `\` échappés, octets hauts
 * en octal. Un nom de client est choisi par l'utilisateur — et peut-être
 * collé depuis un courriel : « Dupont (SARL) » ou « a) Tj /F1 99 Tf (b »
 * doit rester du texte, jamais devenir une instruction.
 */
function chaineLitterale(octets: readonly number[]): string {
  let s = '(';
  for (const o of octets) {
    if (o === 0x28 || o === 0x29 || o === 0x5C) s += `\\${String.fromCharCode(o)}`;
    else if (o >= 0x20 && o <= 0x7E) s += String.fromCharCode(o);
    else s += `\\${o.toString(8).padStart(3, '0')}`;
  }
  return `${s})`;
}

/** Un texte quelconque en chaîne hexadécimale UTF-16BE : le titre accepte tout Unicode. */
function chaineUtf16(texte: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < texte.length; i += 1) {
    hex += texte.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  }
  return `<${hex}>`;
}

/** La date au format du PDF, en temps universel : `D:20261127093000Z`. */
function datePdf(d: Date): string {
  const deux = (n: number): string => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${deux(d.getUTCMonth() + 1)}${deux(d.getUTCDate())}`
    + `${deux(d.getUTCHours())}${deux(d.getUTCMinutes())}${deux(d.getUTCSeconds())}Z`;
}

/** Un rectangle aux coins arrondis, en coordonnées du format (origine en bas). */
function chemin(x: number, y: number, l: number, h: number, rayon: number): string {
  const r = Math.max(0, Math.min(rayon, l / 2, h / 2));
  if (r === 0) return `${nombre(x)} ${nombre(y)} ${nombre(l)} ${nombre(h)} re`;
  // 0,5523 : la poignée de Bézier qui approche un quart de cercle.
  const k = r * 0.5523;
  const p = (...v: number[]): string => v.map(nombre).join(' ');
  return [
    `${p(x + r, y)} m`,
    `${p(x + l - r, y)} l`,
    `${p(x + l - r + k, y, x + l, y + r - k, x + l, y + r)} c`,
    `${p(x + l, y + h - r)} l`,
    `${p(x + l, y + h - r + k, x + l - r + k, y + h, x + l - r, y + h)} c`,
    `${p(x + r, y + h)} l`,
    `${p(x + r - k, y + h, x, y + h - r + k, x, y + h - r)} c`,
    `${p(x, y + r)} l`,
    `${p(x, y + r - k, x + r - k, y, x + r, y)} c`,
    'h'
  ].join('\n');
}

export interface MetaPdf {
  /** Le titre que le lecteur affiche à la place du nom du fichier. */
  readonly titre: string;
  readonly creation: Date;
  /** Le pied « 1 / 2 » : taille, couleur, et sa ligne de base depuis le bas. */
  readonly pied?: { readonly taille: number; readonly couleur: string; readonly depuisLeBas: number };
}

/**
 * Le document en cours d'écriture. Les coordonnées partent du HAUT de la
 * page, comme dans la feuille de style ; la conversion vers l'origine du
 * format (en bas) se fait ici et nulle part ailleurs.
 */
export class DocumentPdf {
  readonly largeur = A4.largeur;
  readonly hauteur = A4.hauteur;
  private readonly pages: string[][] = [[]];
  private readonly meta: MetaPdf;

  constructor(meta: MetaPdf) {
    this.meta = meta;
  }

  get nombreDePages(): number {
    return this.pages.length;
  }

  nouvellePage(): void {
    this.pages.push([]);
  }

  private ecrire(operations: string): void {
    (this.pages[this.pages.length - 1] as string[]).push(operations);
  }

  /** Un texte sur une ligne de base ; `aligne` dit si `x` est son début ou sa fin. */
  texte(
    x: number, ligneDeBase: number, texte: string, style: StyleTexte,
    aligne: 'gauche' | 'droite' | 'centre' = 'gauche'
  ): void {
    const police = style.police ?? 'normal';
    const espacement = style.espacement ?? 0;
    const largeur = largeurTexte(texte, police, style.taille, espacement);
    const depart = aligne === 'droite' ? x - largeur : aligne === 'centre' ? x - largeur / 2 : x;
    const corps = morceaux(texte, police)
      .map((m) => `/${RESSOURCE[m.police]} ${nombre(style.taille)} Tf ${chaineLitterale(m.octets)} Tj`)
      .join('\n');
    if (corps === '') return;
    this.ecrire([
      'q BT',
      `${teinte(style.couleur ?? '#000000')} rg`,
      ...(espacement === 0 ? [] : [`${nombre(espacement * style.taille)} Tc`]),
      `1 0 0 1 ${nombre(depart)} ${nombre(this.hauteur - ligneDeBase)} Tm`,
      corps,
      'ET Q'
    ].join('\n'));
  }

  filet(x1: number, y1: number, x2: number, y2: number, style: StyleTrait): void {
    this.ecrire([
      'q',
      ...this.trait(style),
      `${nombre(x1)} ${nombre(this.hauteur - y1)} m ${nombre(x2)} ${nombre(this.hauteur - y2)} l S`,
      'Q'
    ].join('\n'));
  }

  /** Un rectangle plein ; `y` est son bord haut. */
  aplat(x: number, y: number, largeur: number, hauteur: number, couleur: string, rayon = 0): void {
    this.ecrire([
      'q',
      `${teinte(couleur)} rg`,
      chemin(x, this.hauteur - y - hauteur, largeur, hauteur, rayon),
      'f',
      'Q'
    ].join('\n'));
  }

  /** Le contour d'un rectangle ; `y` est son bord haut. */
  cadre(
    x: number, y: number, largeur: number, hauteur: number, style: StyleTrait, rayon = 0
  ): void {
    this.ecrire([
      'q',
      ...this.trait(style),
      chemin(x, this.hauteur - y - hauteur, largeur, hauteur, rayon),
      'S',
      'Q'
    ].join('\n'));
  }

  private trait(style: StyleTrait): string[] {
    return [
      `${nombre(style.epaisseur)} w`,
      `${teinte(style.couleur)} RG`,
      ...(style.pointilles === undefined
        ? []
        : [`[${nombre(style.pointilles[0])} ${nombre(style.pointilles[1])}] 0 d`])
    ];
  }

  /**
   * Le fichier, numéroté « 1 / 2 » en pied.
   *
   * Le numéro se pose À LA FIN, quand on connaît le total : c'est lui qui dit
   * au client qu'aucune page ne manque — « 1 / 1 » compris.
   */
  terminer(): Uint8Array<ArrayBuffer> {
    const pied = this.meta.pied ?? { taille: 7.5, couleur: '#808080', depuisLeBas: 24 };
    const total = this.pages.length;
    // Une copie, pas un ajout : un second `terminer()` ne doit pas poser
    // deux pieds l'un sur l'autre.
    const pages = this.pages.map((page, i) => {
      const numero = `${i + 1} / ${total}`;
      return [...page, [
        'q BT',
        `${teinte(pied.couleur)} rg`,
        `1 0 0 1 ${nombre(this.largeur / 2 - largeurTexte(numero, 'normal', pied.taille) / 2)} ${nombre(pied.depuisLeBas)} Tm`,
        `/F1 ${nombre(pied.taille)} Tf ${chaineLitterale(encoderWinAnsi(numero))} Tj`,
        'ET Q'
      ].join('\n')];
    });

    const polices = (['normal', 'gras', 'italique', 'grasItalique'] as const).map((p) =>
      `<< /Type /Font /Subtype /Type1 /BaseFont /${NOM_DE_BASE[p]} /Encoding /WinAnsiEncoding`
      + ` /FirstChar 32 /LastChar 255 /Widths [${chasses(p).join(' ')}] >>`);
    const symbole = SYMBOLE.get(0x2192) as readonly [number, number];
    polices.push(
      `<< /Type /Font /Subtype /Type1 /BaseFont /${NOM_DE_BASE.symbole}`
      + ` /FirstChar ${symbole[0]} /LastChar ${symbole[0]} /Widths [${symbole[1]}] >>`
    );

    // 1 catalogue, 2 arbre des pages, 3 informations, 4 à 8 polices, puis
    // chaque page suivie de son contenu.
    const premierePage = 4 + polices.length;
    const numeroPage = (i: number): number => premierePage + 2 * i;
    const ressources = `<< /Font << ${(['normal', 'gras', 'italique', 'grasItalique', 'symbole'] as const)
      .map((p, i) => `/${RESSOURCE[p]} ${4 + i} 0 R`).join(' ')} >> >>`;

    const objets: string[] = [
      '<< /Type /Catalog /Pages 2 0 R /Lang (fr-FR) /ViewerPreferences << /DisplayDocTitle true >> >>',
      `<< /Type /Pages /Kids [${pages.map((_, i) => `${numeroPage(i)} 0 R`).join(' ')}] /Count ${total} >>`,
      `<< /Title ${chaineUtf16(this.meta.titre)} /Producer (FREEL) /CreationDate (${datePdf(this.meta.creation)}) >>`,
      ...polices
    ];
    pages.forEach((page, i) => {
      const flux = page.join('\n');
      objets.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${nombre(this.largeur)} ${nombre(this.hauteur)}]`
        + ` /Resources ${ressources} /Contents ${numeroPage(i) + 1} 0 R >>`,
        `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`
      );
    });

    let fichier = '%PDF-1.4\n';
    const decalages: number[] = [];
    objets.forEach((corps, i) => {
      decalages.push(fichier.length);
      fichier += `${i + 1} 0 obj\n${corps}\nendobj\n`;
    });
    const debutRenvois = fichier.length;
    fichier += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
    // Vingt octets par entrée, fin de ligne comprise (« espace, saut ») :
    // c'est la forme fixe que le lecteur attend pour sauter d'un objet à l'autre.
    for (const d of decalages) fichier += `${String(d).padStart(10, '0')} 00000 n \n`;
    fichier += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R /Info 3 0 R >>\n`
      + `startxref\n${debutRenvois}\n%%EOF\n`;

    const octets = new Uint8Array(fichier.length);
    for (let i = 0; i < fichier.length; i += 1) {
      const code = fichier.charCodeAt(i);
      // Le garde-fou des décalages : un seul caractère hors ASCII, et une
      // longueur de chaîne cesserait d'être une longueur en octets.
      if (code > 0x7E) throw new Error('Octet hors ASCII dans le PDF');
      octets[i] = code;
    }
    return octets;
  }
}

/**
 * Le fil d'écriture d'un document qui peut changer de page.
 *
 * `reserver` garantit la place d'un bloc qui ne se coupe pas — une ligne de
 * tableau, un cadre de signature. Quand il n'y en a plus, le fil passe à la
 * page suivante et y redessine l'en-tête du tableau en cours : une deuxième
 * page de colonnes sans intitulés obligerait le client à revenir à la
 * première pour savoir ce qu'il signe.
 */
export class FilPdf {
  /** La position courante, en points depuis le haut de la page. */
  y: number;
  /** Ce qui se redessine en haut d'une nouvelle page ; il avance `y` lui-même. */
  enTete: (() => void) | null = null;
  readonly pdf: DocumentPdf;
  private readonly marges: { readonly haut: number; readonly bas: number };

  constructor(pdf: DocumentPdf, marges: { readonly haut: number; readonly bas: number }) {
    this.pdf = pdf;
    this.marges = marges;
    this.y = marges.haut;
  }

  /** La limite basse du contenu, au-dessus du pied. */
  get bas(): number {
    return this.pdf.hauteur - this.marges.bas;
  }

  reserver(hauteur: number): void {
    if (this.y + hauteur <= this.bas) return;
    this.pdf.nouvellePage();
    this.y = this.marges.haut;
    this.enTete?.();
  }
}
