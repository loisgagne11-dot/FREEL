import { type DateISO, type Euros, type Mois, type Resolution, dateISO, euros } from '../types';

/**
 * La déclaration des revenus d'un micro-entrepreneur en BNC : quand, et
 * quelles cases de la 2042-C-PRO.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DATE DÉPEND DU DOMICILE, QUE L'APPLICATION NE CONNAÎT PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La date limite de la déclaration en ligne dépend du département du
 * DOMICILE au 1ᵉʳ janvier. L'application ne connaît que l'adresse de
 * l'entreprise : elle s'en sert, et le dit — la date est une `hypothese`,
 * même pour une année publiée. Le plus souvent les deux adresses sont dans
 * le même département ; quand elles ne le sont pas, c'est le domicile qui
 * fait foi.
 *
 * Les dates se publient année par année, au printemps. Pour une année non
 * relevée, aucun jour n'est avancé — ni à l'écran ni dans le calendrier :
 * « fin mai ou début juin » est ce qu'on sait, et un jour précis inventé
 * serait indiscernable d'un vrai.
 *
 * Notice 2042 de 2026, relevée le 17/11/2026 :
 * https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2026/2042_5477.pdf
 */

const VERIFIE_LE = dateISO('2026-11-17');

/** Les dates publiées, par année de DÉCLARATION et par zone (1 : 01 à 19, 2 : 20 à 54, 3 : 55 à 976). */
const DATES_PUBLIEES: Readonly<Record<number, readonly [DateISO, DateISO, DateISO]>> = {
  2026: [dateISO('2026-05-21'), dateISO('2026-05-28'), dateISO('2026-06-04')]
};

/**
 * La zone d'un code postal : les départements 01 à 19, puis 20 (la Corse) à
 * 54, puis 55 à 976 — l'outre-mer compris. `null` quand il ne se lit pas.
 */
export function zoneDeDeclaration(codePostal: string): 1 | 2 | 3 | null {
  const cp = codePostal.trim();
  if (!/^\d{5}$/.test(cp)) return null;
  const departement = Number(cp.slice(0, 2));
  if (departement < 1) return null;
  return departement <= 19 ? 1 : departement <= 54 ? 2 : 3;
}

/**
 * La limite de la déclaration de revenus déposée en `annee` (revenus de
 * l'année précédente), et le mois où la placer quand son jour manque.
 */
export function limiteDeclarationRevenus(
  annee: number,
  codePostal: string
): { readonly limite: Resolution<DateISO>; readonly mois: Mois } {
  const publiees = DATES_PUBLIEES[annee];
  const zone = zoneDeDeclaration(codePostal);
  if (publiees === undefined) {
    return {
      limite: {
        statut: 'refuse',
        motif: `Fin mai ou début juin ${annee}, selon ton département : les dates sont publiées au printemps.`
      },
      mois: `${annee}-05` as Mois
    };
  }
  if (zone === null) {
    return {
      limite: {
        statut: 'refuse',
        motif: `Le ${jourMois(publiees[0])}, le ${jourMois(publiees[1])} ou le ${jourMois(publiees[2])} ${annee}, `
          + 'selon le département de ton domicile au 1ᵉʳ janvier.'
      },
      mois: `${annee}-05` as Mois
    };
  }
  const valeur = publiees[zone - 1] as DateISO;
  return {
    limite: {
      statut: 'hypothese',
      valeur,
      source: 'impots.gouv.fr — notice 2042 : date publiée pour le département de ton entreprise ; '
        + 'c’est celui de ton domicile au 1ᵉʳ janvier qui fait foi',
      verifieLe: VERIFIE_LE,
      depuis: valeur.slice(0, 7) as Mois
    },
    mois: valeur.slice(0, 7) as Mois
  };
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];
const jourMois = (d: DateISO): string => `${Number(d.slice(8, 10))} ${MOIS[Number(d.slice(5, 7)) - 1] ?? ''}`;

/**
 * Les cases de la 2042-C-PRO pour les recettes d'une année.
 *
 *  · `5TE` — micro-entrepreneur AVEC versement libératoire, BNC : « total des
 *    recettes réalisées » ;
 *  · `5HQ` — BNC PROFESSIONNELS au régime déclaratif spécial, recettes brutes
 *    sans abattement. Professionnels, parce qu'ils supposent la
 *    participation personnelle, continue et directe à l'activité — le cas de
 *    quiconque facture des journées. Le non professionnel (`5KU`, CGI
 *    art. 156-I-2°, tel que la brochure IR 2026 le cite) n'est pas deviné :
 *    il se demande, il n'est pas proposé par défaut.
 *
 * Le montant est HORS TAXES — la TVA collectée par un redevable n'est pas
 * une recette —, encaissé dans l'année, avoirs compris. RIEN n'est déduit :
 * l'abattement de 34 % (305 € au moins) est appliqué par l'administration.
 * Le retrancher ici le ferait appliquer deux fois.
 *
 * Quand le versement libératoire commence ou cesse en cours d'année, les
 * recettes se partagent entre les deux cases à la date d'encaissement.
 *
 * Formulaire 2042-C-PRO de 2026 (n° 11222*28), relevé le 17/11/2026 :
 * https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2026/2042_5474.pdf
 */
export function casesDeclarationRevenus(
  recettes: readonly { readonly encaisseeLe: DateISO; readonly montant: Euros }[],
  annee: number,
  sousVersementLiberatoire: (d: DateISO) => boolean
): { readonly '5TE': Euros; readonly '5HQ': Euros } {
  let te = 0;
  let hq = 0;
  for (const r of recettes) {
    if (!r.encaisseeLe.startsWith(String(annee))) continue;
    if (sousVersementLiberatoire(r.encaisseeLe)) te += r.montant; else hq += r.montant;
  }
  return { '5TE': euros(te), '5HQ': euros(hq) };
}
