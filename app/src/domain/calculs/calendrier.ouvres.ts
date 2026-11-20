/**
 * Jours ouvrés et jours ouvrables : la source unique des dates limites qui se
 * reportent ou se comptent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX MOTS QUI NE DISENT PAS LA MÊME CHOSE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un jour OUVRÉ va du lundi au vendredi ; un jour OUVRABLE, du lundi au
 * SAMEDI. Les deux excluent le dimanche et les fêtes légales. La différence
 * n'est pas de vocabulaire : elle décale des échéances.
 *
 *  · Le REPORT d'une échéance qui tombe un samedi, un dimanche ou un férié va
 *    au premier jour ouvré qui suit — CGI ann. IV art. 199-0 pour un paiement
 *    à l'administration fiscale (la date « est prorogée jusqu'au premier jour
 *    ouvrable suivant », le samedi étant nommé parmi les jours qui reportent) ;
 *    la doctrine de l'Urssaf pour les cotisations (« reportée au jour qui
 *    suit », exemple : le 31/08/2025 reporté au 01/09/2025). Sources relevées
 *    le 17/11/2026 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006301997
 *    et https://www.autoentrepreneur.urssaf.fr/portail/accueil/une-question/toutes-les-fiches-pratiques/declarer-et-payer-mes-cotisation.html
 *  · Le COMPTE de la DES — « au plus tard le dixième jour ouvrable du mois qui
 *    suit » (CGI ann. III art. 96 N) — compte les samedis. Aucun texte ne
 *    définit le mot ; la définition est déduite du calendrier de la douane,
 *    dont les vingt-quatre dates de 2025 et 2026 concordent toutes avec un
 *    compte du lundi au samedi, et aucune avec un compte du lundi au vendredi.
 *    Le samedi 11 juillet 2026 y est une date limite, non reportée.
 *
 * Deux règles qui se ressemblent assez pour qu'on recopie l'une en croyant
 * écrire l'autre : la DES au « 10 du mois » était faux d'un à cinq jours,
 * chaque mois, depuis le premier jour.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA ZONE GÉNÉRALE, MÊME EN ALSACE-MOSELLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les fériés comptés ici sont les onze de C. trav. L3133-1. Le Vendredi saint
 * et le 26 décembre du droit local (L3134-13) ne reportent ni ne décalent
 * rien : les échéances fiscales et sociales sont nationales. Le calendrier
 * 2026 de la douane le montre — la DES de mars y tombe le 13 avril, alors que
 * le Vendredi saint (3 avril) compté comme chômé l'aurait poussée au 14.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI À CÔTÉ DE `calendrier.ts`, ET NON DEDANS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `calendrier.ts` est dans le paquet de premier rendu (le planning en a
 * besoin). Ses lecteurs ici — dates de déclaration, DES, CFE, solde d'impôt —
 * sont tous chargés à la demande : rangées dans le même fichier, ces
 * fonctions seraient téléchargées à chaque ouverture pour servir une fois par
 * mois.
 */

import type { DateISO, Mois } from '../types';
import { dateDe, decaler, joursFeries } from './calendrier';

/** Les fêtes légales des années d'une date et de la suivante : un report de fin décembre franchit l'an. */
function feriesAutourDe(d: DateISO): ReadonlySet<string> {
  const annee = Number(d.slice(0, 4));
  return new Set<string>([...joursFeries(annee), ...joursFeries(annee + 1)]);
}

/** 0 = dimanche, 6 = samedi. */
const jourDeSemaine = (d: DateISO): number => new Date(`${d}T00:00:00Z`).getUTCDay();

/**
 * La date elle-même si c'est un jour ouvré, sinon le premier jour ouvré qui
 * la suit (samedi, dimanche et fêtes légales reportent).
 */
export function reporterAuJourOuvre(d: DateISO): DateISO {
  const feries = feriesAutourDe(d);
  let jour = d;
  while (jourDeSemaine(jour) === 0 || jourDeSemaine(jour) === 6 || feries.has(jour)) {
    jour = decaler(jour, 1);
  }
  return jour;
}

/**
 * Le `rang`-ième jour ouvrable d'un mois : du lundi au samedi, hors dimanches
 * et fêtes légales. Un rang inférieur à 1 compte pour le premier : la boucle
 * ne doit pas pouvoir chercher un jour qui n'existe pas.
 */
export function nemeJourOuvrable(m: Mois, rang: number): DateISO {
  const cible = Math.max(1, Math.floor(rang));
  const premier = dateDe(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1);
  const feries = feriesAutourDe(premier);
  let jour = premier;
  let compte = 0;
  for (;;) {
    if (jourDeSemaine(jour) !== 0 && !feries.has(jour)) {
      compte += 1;
      if (compte === cible) return jour;
    }
    jour = decaler(jour, 1);
  }
}
