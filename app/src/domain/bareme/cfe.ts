import type { DateISO, Euros } from '../types';
import { euros } from '../types';
import { reporterAuJourOuvre } from '../calculs/calendrier.ouvres';

/**
 * Cotisation foncière des entreprises (CFE).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE MODULE NE CALCULE PAS LE MONTANT DE LA CFE, ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La CFE d'un micro-entrepreneur repose sur une **base minimum fixée par sa
 * commune** (art. 1647 D du CGI) à l'intérieur d'une fourchette nationale, puis
 * multipliée par un **taux communal**. Deux valeurs que seule sa commune
 * connaît, et que seul son avis de CFE porte.
 *
 * L'ancienne application affichait pourtant un montant : elle portait une
 * grille en dur (`CFE_SCALE`) que l'audit comptable a jugée non conforme à la
 * structure réelle — mauvaises tranches, plafonds non revalorisés — et un
 * montant plat de 410 € dans l'échéancier, sans rapport avec ce que le
 * simulateur aurait calculé. Deux vérités pour la même dette.
 *
 * Ce module fait donc l'inverse : il porte les **règles**, qui sont stables et
 * vérifiables, et laisse les **montants** venir de l'avis. Concrètement :
 *
 *  · il dit si l'année est exonérée, et à quel titre ;
 *  · il dit si la cotisation minimum est due ;
 *  · il calcule base × taux quand l'utilisateur a son avis sous les yeux ;
 *  · il donne le calendrier — avis, paiement, acompte, déclaration initiale.
 *
 * Aucune fourchette de base minimum n'est écrite ici. Les inscrire supposerait
 * de les revaloriser chaque année sans source automatisable, et une grille
 * périmée qui affiche un montant est pire qu'une absence de grille : elle
 * engage.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LA CFE COMPTE POUR « JE PEUX ME VERSER »
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle est annuelle, payable au 15 décembre, et elle n'apparaît nulle part
 * avant novembre. Quelqu'un qui se verse tout son disponible en octobre se
 * verse la CFE de décembre. C'est l'erreur qui va dans le sens dangereux —
 * celle qui invite à se verser de l'argent déjà dû.
 */

/** Le régime CFE d'une année donnée. */
export type RegimeCfe =
  /** Année de création de l'établissement : exonération totale (art. 1478 II CGI). */
  | { readonly type: 'exonere-creation' }
  /**
   * Première année d'imposition : la base est réduite de moitié
   * (art. 1478 II CGI). Il y a donc une CFE, mais deux fois moindre.
   */
  | { readonly type: 'base-reduite-moitie' }
  /**
   * Cotisation minimum non due, le chiffre d'affaires de référence étant au
   * plus égal à 5 000 € (art. 1647 D CGI).
   */
  | { readonly type: 'sous-le-seuil-de-cotisation-minimum' }
  /** Régime de droit commun : base minimum communale × taux communal. */
  | { readonly type: 'droit-commun' };

/**
 * Chiffre d'affaires au plus égal auquel la cotisation minimum n'est pas due.
 *
 * Art. 1647 D du CGI, vérifié le 07/11/2026 :
 * https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000038686433.
 * C'est un seuil de **dispense**, pas un abattement : au
 * premier euro au-dessus, la cotisation minimum est due en entier.
 */
export const CA_SANS_COTISATION_MINIMUM = euros(5000);

/**
 * Montant de CFE de l'année précédente à partir duquel un acompte est dû.
 *
 * CGI art. 1679 quinquies, al. 2 et suivants : un acompte est dû par le
 * redevable non mensualisé dont la CFE (et l'IFER) de l'année précédente
 * atteint 3 000 €, seuil apprécié PAR ÉTABLISSEMENT. Lu au BOFiP le
 * 17/11/2026 (BOI-IF-CFE-40-10 du 25/09/2024) — l'article du CGI lui-même
 * n'a pas été ouvert :
 * https://bofip.impots.gouv.fr/bofip/291-PGP.html/identifiant=BOI-IF-CFE-40-10-20240925
 *
 * Un micro-entrepreneur n'atteint presque jamais ce seuil : la règle reste
 * écrite pour qu'un avis exceptionnel ne passe pas sans son acompte, et
 * n'a pas d'écran à elle.
 */
export const CFE_DECLENCHANT_ACOMPTE = euros(3000);

/** Part de la CFE de l'année précédente appelée en acompte : 50 % (même source). */
export const PART_ACOMPTE = 0.5;

/** « 15 décembre », « 17 décembre » : le jour réellement retenu, report compris. */
const jourEnLettres = (d: DateISO, mois: string): string => `${Number(d.slice(8, 10))} ${mois}`;

/**
 * Le régime CFE applicable, pour une année et une entreprise données.
 *
 * `caDeReference` est le chiffre d'affaires de l'année N−2, celui qui sert à
 * situer la base minimum. Il vaut `null` quand l'entreprise est trop jeune pour
 * en avoir un — et dans ce cas on ne conclut PAS à la dispense : une
 * entreprise sans N−2 n'est pas une entreprise à 0 € de recettes.
 *
 * L'ordre des cas n'est pas arbitraire. L'exonération de l'année de création
 * l'emporte sur tout, la réduction de moitié sur la dispense de cotisation
 * minimum : ce sont deux mécanismes distincts, et cumuler « base réduite » et
 * « rien à payer » afficherait zéro là où il y a une CFE.
 */
export function regimeCfe(
  debutActivite: DateISO | null,
  annee: number,
  caDeReference: Euros | null
): RegimeCfe {
  if (debutActivite !== null) {
    const anneeCreation = Number(debutActivite.slice(0, 4));
    if (annee === anneeCreation) return { type: 'exonere-creation' };
    if (annee === anneeCreation + 1) return { type: 'base-reduite-moitie' };
  }
  if (caDeReference !== null && caDeReference <= CA_SANS_COTISATION_MINIMUM) {
    return { type: 'sous-le-seuil-de-cotisation-minimum' };
  }
  return { type: 'droit-commun' };
}

/** Y a-t-il une CFE à payer cette année ? */
export function cfeDue(regime: RegimeCfe): boolean {
  return regime.type !== 'exonere-creation'
    && regime.type !== 'sous-le-seuil-de-cotisation-minimum';
}

/**
 * La cotisation, à partir des DEUX valeurs que porte l'avis.
 *
 * `base` est la base minimum notifiée par la commune, `tauxCommunal` le taux
 * voté par elle — l'un et l'autre se lisent sur l'avis, jamais ne se
 * devinent. La réduction de moitié de la première année d'imposition est
 * appliquée ici, parce qu'elle porte sur la base et non sur le résultat.
 *
 * Arrondi à l'euro : c'est ainsi que l'administration liquide la cotisation, et
 * afficher des centimes donnerait une précision que le calcul n'a pas.
 */
export function cotisationCfe(
  base: Euros,
  tauxCommunal: number,
  regime: RegimeCfe
): Euros {
  if (!cfeDue(regime)) return euros(0);
  const baseRetenue = regime.type === 'base-reduite-moitie' ? base / 2 : base;
  return euros(Math.round(baseRetenue * tauxCommunal));
}

/** Une date du calendrier CFE, et ce qu'elle oblige à faire. */
export interface DateCfe {
  readonly id: string;
  readonly intitule: string;
  readonly date: DateISO;
  /** Combien de jours avant l'échéance il devient utile de la voir venir. */
  readonly preavisJours: number;
}

/**
 * Le paiement du solde : le 15 décembre, reporté au premier jour ouvré quand
 * il tombe un samedi, un dimanche ou un jour férié — CGI ann. IV art. 199-0
 * (« prorogée jusqu'au premier jour ouvrable suivant »), relevé le 17/11/2026 :
 * https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006301997
 *
 * Le 15/12/2029 est un samedi : sans le report, la CFE se serait affichée en
 * retard le lundi 17, jour où elle est encore payable.
 */
export function paiementCfe(annee: number): DateCfe {
  const date = reporterAuJourOuvre(`${annee}-12-15` as DateISO);
  return {
    id: `cfe-paiement-${annee}`,
    intitule: `CFE ${annee} — paiement au ${jourEnLettres(date, 'décembre')}`,
    date,
    // Un mois et demi : l'avis paraît en novembre, et provisionner en octobre
    // suppose de savoir dès octobre qu'il y aura quelque chose à payer.
    preavisJours: 75
  };
}

/**
 * L'acompte de juin, dû quand la CFE de l'année précédente atteint 3 000 €
 * (CGI 1679 quinquies, voir `CFE_DECLENCHANT_ACOMPTE`) : exigible le 31 mai,
 * payable au plus tard le 15 juin, reporté comme le solde (ann. IV 199-0).
 *
 * Rendu `null` en dessous : annoncer un acompte qui n'est pas dû ferait
 * provisionner deux fois la même CFE.
 */
export function acompteCfe(annee: number, cfeAnneePrecedente: Euros): DateCfe | null {
  if (cfeAnneePrecedente < CFE_DECLENCHANT_ACOMPTE) return null;
  const date = reporterAuJourOuvre(`${annee}-06-15` as DateISO);
  return {
    id: `cfe-acompte-${annee}`,
    intitule: `CFE ${annee} — acompte de 50 % au ${jourEnLettres(date, 'juin')}`,
    date,
    preavisJours: 45
  };
}

/**
 * La déclaration initiale 1447-C, et pourquoi elle mérite une échéance à elle.
 *
 * Elle est à souscrire avant le 1er janvier de l'année qui suit la création —
 * donc au plus tard le 31 décembre de l'année de création. C'est elle qui
 * établit la base d'imposition ; ne pas la déposer n'annule pas la CFE, mais
 * fait perdre le bénéfice de l'exonération de première année et expose à une
 * taxation d'office.
 *
 * Rendue `null` hors de l'année de création : une échéance passée qui reste
 * affichée devient un reproche permanent, et on cesse de lire les autres.
 */
export function declaration1447C(debutActivite: DateISO | null, annee: number): DateCfe | null {
  if (debutActivite === null) return null;
  const anneeCreation = Number(debutActivite.slice(0, 4));
  if (annee !== anneeCreation) return null;
  return {
    id: `cfe-1447c-${anneeCreation}`,
    intitule: `Déclaration initiale de CFE (1447-C) avant le 31 décembre ${anneeCreation}`,
    date: `${anneeCreation}-12-31` as DateISO,
    // Large : c'est une formalité de création, et la découvrir le 20 décembre
    // laisse peu de marge pour réunir les éléments de l'établissement.
    preavisJours: 120
  };
}
