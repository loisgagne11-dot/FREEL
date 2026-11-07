/**
 * Recherche transversale : retrouver une facture, un client, une mission ou une
 * dépense sans savoir dans quel écran elle vit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ACCENTS, CASSE, ESPACES : TAPER COMME ON PARLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Personne ne tape « Hélène » avec l'accent sur un téléphone, ni « 1 200 »
 * avec une espace insécable. Une recherche qui exige la forme exacte rend
 * « aucun résultat » pour un client qui existe — et l'utilisateur conclut qu'il
 * l'a mal saisi. Tout est donc ramené à une forme commune, des deux côtés.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN MONTANT SE CHERCHE COMME UN MONTANT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « 1200 » doit retrouver une facture de 1 200,00 € : la comparaison se fait
 * sur la valeur, pas sur le texte affiché (qui varie avec la locale, l'espace
 * insécable et le nombre de décimales). Sans décimales saisies, on compare la
 * partie entière — « 1200 » trouve aussi 1 200,50 € ; avec décimales, la valeur
 * exacte. Le signe est ignoré : une annulation de 500 € se cherche par « 500 ».
 *
 * Ce module ne dépend ni de React ni du magasin : il reçoit les faits qu'il
 * indexe, ce qui le rend testable sans écran.
 */

export type NatureResultat = 'facture' | 'client' | 'mission' | 'depense';

/** Ordre d'affichage des groupes : ce qu'on cherche le plus souvent d'abord. */
export const NATURES: readonly NatureResultat[] = ['facture', 'client', 'mission', 'depense'];

export const LIBELLE_NATURE: Readonly<Record<NatureResultat, string>> = {
  facture: 'Factures',
  client: 'Clients',
  mission: 'Missions',
  depense: 'Dépenses'
};

/** Plafond par groupe : au-delà, la liste cesse d'aider à choisir. */
export const MAX_PAR_NATURE = 8;

/**
 * Ce que la recherche lit des faits — une forme structurelle plutôt que `Faits`,
 * pour que le domaine ne dépende pas du schéma de stockage.
 */
export interface SourcesRecherche {
  readonly clients: readonly { readonly id: string; readonly nom: string }[];
  readonly recettes: readonly {
    readonly id: string;
    readonly numero: string;
    readonly clientNom: string;
    readonly libelle: string;
    readonly montant: number;
    readonly emiseLe: string | null;
  }[];
  readonly missions: readonly {
    readonly id: string;
    readonly description: string;
    readonly clientNom: string;
  }[];
  readonly depenses: readonly {
    readonly id: string;
    readonly libelle: string;
    readonly fournisseur: string;
    readonly montantTtc: number;
  }[];
}

export interface EntreeIndex {
  readonly nature: NatureResultat;
  readonly id: string;
  readonly titre: string;
  readonly detail: string;
  /** `null` pour ce qui n'a pas de montant (client, mission). */
  readonly montant: number | null;
  readonly href: string;
  /** Texte normalisé dans lequel on cherche. Calculé une fois, pas à chaque frappe. */
  readonly texte: string;
}

export type ResultatRecherche = Omit<EntreeIndex, 'texte'>;

/** Minuscules, sans accents, espaces insécables ramenées à une espace. */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const entree = (
  e: Omit<EntreeIndex, 'texte'>, champs: readonly string[]
): EntreeIndex => ({ ...e, texte: normaliser(champs.join(' ')) });

/** Construit l'index depuis les faits. À mémoïser par l'appelant. */
export function construireIndex(faits: SourcesRecherche): readonly EntreeIndex[] {
  const index: EntreeIndex[] = [];

  for (const r of faits.recettes) {
    const numero = r.numero.trim();
    // Une recette sans date d'émission est un brouillon : son numéro n'est pas
    // encore attribué, et `#/facture/<numéro>` ne l'ouvrirait pas. Elle mène à
    // la liste des factures, où les brouillons se retrouvent.
    const emise = r.emiseLe !== null && numero !== '';
    index.push(entree({
      nature: 'facture',
      id: r.id,
      titre: emise ? `Facture ${numero}` : `Brouillon — ${r.libelle || r.clientNom || 'sans titre'}`,
      detail: [r.clientNom, r.libelle].filter((s) => s.trim() !== '').join(' · '),
      montant: r.montant,
      href: emise ? `#/facture/${encodeURIComponent(numero)}` : '#/activite/factures'
    }, [numero, r.clientNom, r.libelle]));
  }

  for (const c of faits.clients) {
    index.push(entree({
      nature: 'client', id: c.id, titre: c.nom, detail: '', montant: null,
      href: '#/activite/clients'
    }, [c.nom]));
  }

  for (const m of faits.missions) {
    index.push(entree({
      nature: 'mission', id: m.id, titre: m.description, detail: m.clientNom,
      montant: null, href: '#/activite/missions'
    }, [m.description, m.clientNom]));
  }

  for (const d of faits.depenses) {
    index.push(entree({
      nature: 'depense', id: d.id, titre: d.libelle, detail: d.fournisseur,
      montant: d.montantTtc, href: '#/achats'
    }, [d.libelle, d.fournisseur]));
  }

  return index;
}

/**
 * La requête, si elle s'écrit comme un montant, en centimes ET en euros entiers.
 * « 1 200 € », « 1200,50 », « 1200.5 » sont des montants ; « 12ab » n'en est pas un.
 */
function lireMontant(requete: string): { entier: number; centimes: number | null } | null {
  const brut = requete.replace(/\s/g, '').replace(/€|eur(os?)?$/g, '');
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(brut);
  if (m === null) return null;
  const entier = Number(m[1]);
  const centimes = m[2] === undefined ? null : Math.round(Number(`${m[1]}.${m[2]}`) * 100);
  return { entier, centimes };
}

function montantCorrespond(
  montant: number | null, voulu: { entier: number; centimes: number | null }
): boolean {
  if (montant === null) return false;
  const centimes = Math.round(Math.abs(montant) * 100);
  return voulu.centimes === null
    ? Math.floor(centimes / 100) === voulu.entier
    : centimes === voulu.centimes;
}

/** 2 : un mot commence par le jeton ; 1 : le jeton est au milieu ; 0 : absent. */
function scoreJeton(texte: string, jeton: string): number {
  let meilleur = 0;
  for (let i = texte.indexOf(jeton); i !== -1; i = texte.indexOf(jeton, i + 1)) {
    if (i === 0 || !/[a-z0-9]/.test(texte.charAt(i - 1))) return 2;
    meilleur = 1;
  }
  return meilleur;
}

/** Le meilleur score de l'entrée pour cette requête, ou 0 si elle ne correspond pas. */
function scoreEntree(e: EntreeIndex, jetons: readonly string[]): number {
  let total = 0;
  for (const jeton of jetons) {
    const s = scoreJeton(e.texte, jeton);
    if (s === 0) return 0;
    total += s;
  }
  return total;
}

/**
 * Les résultats d'une requête, groupés par nature (dans l'ordre de `NATURES`),
 * les plus pertinents d'abord, `MAX_PAR_NATURE` au plus par nature.
 *
 * Une correspondance au DÉBUT d'un mot passe avant une correspondance au milieu :
 * « mar » doit proposer « Martin » avant « Supermarché ». Un montant exact passe
 * avant tout, parce que celui qui tape un montant sait ce qu'il cherche.
 */
export function rechercher(
  index: readonly EntreeIndex[], requete: string
): readonly ResultatRecherche[] {
  const q = normaliser(requete);
  if (q === '') return [];

  const jetons = q.split(' ');
  const montant = lireMontant(q);

  const parNature = new Map<NatureResultat, { e: EntreeIndex; score: number; rang: number }[]>();
  index.forEach((e, rang) => {
    let score = scoreEntree(e, jetons);
    if (montant !== null && montantCorrespond(e.montant, montant)) score += 3;
    if (score === 0) return;
    const groupe = parNature.get(e.nature);
    if (groupe) groupe.push({ e, score, rang }); else parNature.set(e.nature, [{ e, score, rang }]);
  });

  return NATURES.flatMap((nature) =>
    (parNature.get(nature) ?? [])
      // À score égal, l'ordre des faits : stable, donc prévisible d'une frappe à l'autre.
      .sort((a, b) => b.score - a.score || a.rang - b.rang)
      .slice(0, MAX_PAR_NATURE)
      .map(({ e }): ResultatRecherche => {
        const { texte: _texte, ...resultat } = e;
        return resultat;
      }));
}
