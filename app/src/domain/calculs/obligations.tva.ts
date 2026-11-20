import { type DateISO, type Mois, type Resolution, dateISO } from '../types';
import { dateDe } from './calendrier';
import { reporterAuJourOuvre } from './calendrier.ouvres';

/**
 * Les dates de la TVA d'un micro-entrepreneur : quelle déclaration, et quel
 * jour.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS RÉGIMES EN DEUX ANS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Jusqu'au 31/12/2026, un redevable relève du régime simplifié — une CA12
 * annuelle et deux acomptes — ou du réel normal sur option — une CA3
 * mensuelle. Le régime simplifié est supprimé au 01/01/2027 (loi 2025-127,
 * art. 38) : tout redevable dépose alors une CA3, TRIMESTRIELLE tant que son
 * chiffre d'affaires ne dépasse pas 1 000 000 €, mensuelle sur option. La
 * dernière CA12 — l'exercice 2026 — se dépose au plus tard le 04/05/2027, et
 * aucun acompte n'est dû en 2027. Annonce de la DGFiP du 22/09/2026, relevée
 * le 17/11/2026 :
 * https://www.impots.gouv.fr/actualite/le-regime-simplifie-dimposition-la-tva-est-supprime-compter-du-1er-janvier-2027
 *
 * Le dossier « par trimestre » qu'affichait l'application ne correspondait à
 * aucune déclaration réelle de 2026 : ni la CA12, ni la CA3 mensuelle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE JOUR SE CALCULE, IL NE SE PUBLIE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le jour de dépôt d'une CA3 d'entreprise individuelle dépend de l'initiale du
 * nom de l'exploitant et de son département (CIBS A161-29) : à Paris et dans
 * les Hauts-de-Seine, la Seine-Saint-Denis et le Val-de-Marne, le 15 de A à
 * H, le 17 de I à Z ; ailleurs, le 16 et le 19. Reporté au premier jour
 * ouvrable quand il tombe un samedi, un dimanche ou un jour férié (CGI
 * ann. IV art. 199-0 ; BOI-TVA-DECLA-20-20-10-10 § 220). Relevé le 17/11/2026 :
 * https://www.legifrance.gouv.fr/codes/id/LEGISCTA000049803706/
 *
 * Tout ce qui sort d'ici est donc un CALCUL, pas une date publiée : une
 * `hypothese`, et le calendrier fiscal le dit lui-même — « à la date figurant
 * dans votre espace professionnel ».
 */

/** La première année sans régime simplifié de TVA. */
export const FIN_REGIME_SIMPLIFIE = 2027;

/** Ce qu'un redevable déclare, une année donnée. */
export type DeclarationTva = 'ca12' | 'ca3_mensuelle' | 'ca3_trimestrielle';

/**
 * La déclaration d'un redevable pour une année. `regimeTva` et
 * `ca3Mensuelle` sont des FAITS (schéma 25) : le réel normal se choisit sur
 * option, le régime simplifié est celui de droit commun ; à partir de 2027,
 * le trimestre est le défaut et le mois une option.
 */
export function declarationTvaDe(
  annee: number,
  regimeTva: 'simplifie' | 'reel_normal',
  ca3Mensuelle: boolean
): DeclarationTva {
  if (annee < FIN_REGIME_SIMPLIFIE) return regimeTva === 'reel_normal' ? 'ca3_mensuelle' : 'ca12';
  return ca3Mensuelle ? 'ca3_mensuelle' : 'ca3_trimestrielle';
}

/**
 * L'initiale qui compte : la première lettre du nom, accents ôtés. `null`
 * quand le nom n'en porte pas — on demande, on ne devine pas.
 */
export function initialeDuNom(nom: string): string | null {
  const lettre = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().match(/[A-Z]/);
  return lettre === null ? null : lettre[0] ?? null;
}

/**
 * Le groupe de départements de A161-29, lu sur le code postal de
 * l'entreprise. `null` quand le code postal ne se lit pas.
 */
export function groupeDuDepartement(codePostal: string): 'paris_petite_couronne' | 'autres' | null {
  const cp = codePostal.trim();
  if (!/^\d{5}$/.test(cp)) return null;
  return ['75', '92', '93', '94'].includes(cp.slice(0, 2)) ? 'paris_petite_couronne' : 'autres';
}

const VERIFIE_LE = dateISO('2026-11-17');
const SOURCE_A161_29 = 'CIBS A161-29 — jour selon l’initiale du nom et le département, reporté au jour ouvré '
  + '(CGI ann. IV art. 199-0) : date calculée, ton espace professionnel fait foi';

/**
 * Le jour de dépôt d'une CA3 déposée en `moisDepot` (le mois qui suit la
 * période), reporté au jour ouvré.
 *
 * Refusé quand le nom ou le code postal manque : « indique ton nom » est
 * une réponse, une date tirée de l'enseigne (« Atelier … ») serait fausse
 * une fois sur deux.
 */
export function jourCa3(moisDepot: Mois, nomExploitant: string, codePostal: string): Resolution<DateISO> {
  const initiale = initialeDuNom(nomExploitant);
  if (initiale === null) {
    return {
      statut: 'refuse',
      motif: 'Indique ton nom de famille dans Réglages : le jour de dépôt dépend de son '
        + 'initiale (de A à H, ou de I à Z).'
    };
  }
  const groupe = groupeDuDepartement(codePostal);
  if (groupe === null) {
    return {
      statut: 'refuse',
      motif: 'Indique le code postal de ton entreprise dans Réglages : le jour de dépôt '
        + 'dépend du département.'
    };
  }
  const premiereMoitie = initiale <= 'H';
  const jour = groupe === 'paris_petite_couronne' ? (premiereMoitie ? 15 : 17) : (premiereMoitie ? 16 : 19);
  return {
    statut: 'hypothese',
    valeur: reporterAuJourOuvre(dateDe(Number(moisDepot.slice(0, 4)), Number(moisDepot.slice(5, 7)), jour)),
    source: SOURCE_A161_29,
    verifieLe: VERIFIE_LE,
    depuis: moisDepot
  };
}

/**
 * Les dates limites PUBLIÉES de la CA12, par exercice clos le 31 décembre.
 * Elles ne se calculent pas d'une règle relevée : on les lit au calendrier
 * fiscal (« 05 mai 2026 » pour l'exercice 2025) et à l'annonce de la DGFiP
 * (« au plus tard le 4 mai 2027 » pour 2026, la dernière). Relevées le
 * 17/11/2026 : https://www.impots.gouv.fr/professionnel/calendrier-fiscal/2026-05
 */
const LIMITES_CA12: Readonly<Record<number, DateISO>> = {
  2025: dateISO('2026-05-05'),
  2026: dateISO('2027-05-04')
};

/** La limite de la CA12 d'un exercice ; refusée pour un exercice dont la date n'est pas relevée. */
export function limiteCa12(exercice: number): Resolution<DateISO> {
  const publiee = LIMITES_CA12[exercice];
  if (publiee !== undefined) {
    return {
      statut: 'publie',
      valeur: publiee,
      source: 'impots.gouv.fr — calendrier fiscal et annonce de la DGFiP du 22/09/2026',
      verifieLe: VERIFIE_LE
    };
  }
  return {
    statut: 'refuse',
    motif: `Début mai ${exercice + 1} : la date est au calendrier fiscal de l’année.`
  };
}

/**
 * Le seuil des acomptes du régime simplifié : dus en juillet et en décembre
 * quand la TVA de l'exercice précédent « excède 1 000 € » — les mots de
 * l'annonce de la DGFiP du 22/09/2026 (voir l'en-tête). Payés « entre les
 * 15 et 24 » du mois, « à la date limite figurant dans votre espace
 * professionnel » (calendrier fiscal de juillet et décembre 2026) : la
 * fenêtre est publiée, le jour ne l'est pas, et rien ici ne dit que A161-29
 * vaut pour les acomptes — on ne l'invente donc pas.
 */
export const SEUIL_ACOMPTES_SIMPLIFIE = 1000;

/** Les mois d'un acompte du régime simplifié, et ce qu'on sait de sa limite. */
export function limiteAcompteSimplifie(annee: number, moisDuMois: 7 | 12): Resolution<DateISO> {
  const nom = moisDuMois === 7 ? 'juillet' : 'décembre';
  return {
    statut: 'refuse',
    motif: `Entre le 15 et le 24 ${nom} ${annee} : la date de ton espace professionnel fait foi.`
  };
}
