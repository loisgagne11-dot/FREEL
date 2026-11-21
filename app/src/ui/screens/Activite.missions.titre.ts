import type { FinDeVisibilite } from '../../domain/calculs/carnetDeCommandes.echeance';
import type { DateISO } from '../../domain/types';

/**
 * Le titre de l'onglet Missions, et ce dont il a besoin pour dire une date.
 *
 * À part du reste de la mise en mots (`Activite.missions.lecture`) : l'écran
 * Activité affiche ce titre avant que l'onglet ne soit chargé, et n'a pas à
 * emporter les états, les phrases et les sous-titres de la liste pour une
 * ligne d'en-tête.
 */

export const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'] as const;

/* Les mois de l'axe, comme les maquettes ; partagés par les frises
   d'Activité et les graphes de la Trésorerie (lot 49), d'où ce module neutre. */
export const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août',
  'sept.', 'oct.', 'nov.', 'déc.'] as const;
/** Les mois en une lettre : un graphe au téléphone réduit ses graduations, pas sa hauteur. */
export const MOIS_LETTRES = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const;

export const rangDuMois = (d: string): number => Number(d.slice(5, 7)) - 1;

/** « 1ᵉʳ » : « le 1 juillet » se lit comme une coquille. */
export const jour = (d: DateISO): string => {
  const j = Number(d.slice(8, 10));
  return j === 1 ? '1ᵉʳ' : String(j);
};

/** L'année, seulement quand ce n'est pas celle d'aujourd'hui : « 31 juillet », « 31 janvier 2027 ». */
export const annee = (d: string, aujourdhui: DateISO): string =>
  (d.slice(0, 4) === aujourdhui.slice(0, 4) ? '' : ` ${d.slice(0, 4)}`);

export const jourEtMoisLong = (d: DateISO, aujourdhui: DateISO): string =>
  `${jour(d)} ${MOIS_LONGS[rangDuMois(d)] ?? ''}${annee(d, aujourdhui)}`;

/**
 * Le titre de l'onglet : jusqu'où ce qui est signé couvre l'avenir.
 *
 * Il répond à la question qu'on vient poser — « jusqu'à quand suis-je
 * tranquille ? » — avant les tuiles qui l'expliquent (« un chiffre par
 * écran »). Une mission signée sans fin ne se transforme pas en date.
 */
export function titreDuCarnet(v: FinDeVisibilite, aujourdhui: DateISO): string {
  switch (v.type) {
    case 'rien': return 'Rien de signé.';
    case 'sans_fin': return 'Couvert, sans fin fixée.';
    case 'date': return `Couvert jusqu’au ${jourEtMoisLong(v.date, aujourdhui)}.`;
  }
}
