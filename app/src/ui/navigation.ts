/**
 * Définition des 6 écrans de l'application — source unique de vérité pour
 * la navigation.
 *
 * L'ancienne version (v1.11-shell.js) n'avait pas de notion d'écran stable :
 * `screenTab()` devinait l'écran courant par une expression régulière sur
 * `document.title`, et les badges de navigation étaient appariés au libellé
 * visible par préfixe de texte (`lbl.indexOf(tab) === 0`). Un renommage ou
 * une traduction cassait silencieusement les deux. Ici, l'identifiant est
 * la seule clé qui compte : le libellé peut changer sans rien casser.
 */

/** Identifiant stable d'un écran. Ne varie jamais, contrairement au libellé affiché. */
export type IdEcran = 'pilote' | 'activite' | 'argent' | 'achats' | 'outils' | 'config';

/** Icône sobre au trait, exprimée comme l'attribut `d` d'un unique `<path>` sur un viewBox 24x24. */
export interface Ecran {
  readonly id: IdEcran;
  readonly libelle: string;
  /** Chemin de route, sous forme de hash — l'app est servie en statique, sans routeur d'historique. */
  readonly chemin: string;
  readonly icone: string;
}

/** Écran affiché quand le hash est vide ou ne correspond à aucun écran connu. */
export const ID_ECRAN_PAR_DEFAUT: IdEcran = 'pilote';

export const ECRANS: readonly Ecran[] = [
  {
    id: 'pilote',
    libelle: 'Pilote',
    chemin: '#/pilote',
    // Ligne de flux (pouls) : la décision du jour, en un coup d'œil.
    icone: 'M2 13 L6 13 L8 20 L12 5 L14 13 L18 13 L20 9'
  },
  {
    id: 'activite',
    libelle: 'Activité & congés',
    chemin: '#/activite',
    // Calendrier : plan de charge et congés.
    icone: 'M4 5 H20 V20 H4 Z M4 10 H20 M8 3 V7 M16 3 V7'
  },
  {
    id: 'argent',
    libelle: 'Argent',
    chemin: '#/argent',
    // Portefeuille : trésorerie et performance.
    icone: 'M3 6 H18 V19 H3 Z M3 6 L6 3 L15 3 L18 6 M14 12 H17 V15 H14 Z'
  },
  {
    id: 'achats',
    libelle: 'Achats',
    chemin: '#/achats',
    // Panier : justificatifs et banque.
    icone: 'M3 4 H6 L8.5 15 H18 L20 7 H7.5 M8 19 H10 V21 H8 Z M14 19 H16 V21 H14 Z'
  },
  {
    id: 'outils',
    libelle: 'Outils',
    chemin: '#/outils',
    // Calculatrice : simulateurs.
    icone: 'M5 3 H19 V21 H5 Z M8 7 H16 M8 11 H10 M12 11 H14 M16 11 H18 M8 15 H10 M12 15 H14 M16 15 H18'
  },
  {
    id: 'config',
    libelle: 'Config',
    chemin: '#/config',
    // Écrou : réglages.
    icone: 'M8 3 H16 L21 8 V16 L16 21 H8 L3 16 V8 Z M10 12 H14 M12 10 V14'
  }
];

/** L'écran par défaut, garanti présent par les tests — sinon la config de navigation est invalide. */
function ecranParDefaut(): Ecran {
  const defaut = ECRANS.find((e) => e.id === ID_ECRAN_PAR_DEFAUT);
  if (!defaut) {
    throw new Error(`Écran par défaut "${ID_ECRAN_PAR_DEFAUT}" introuvable dans ECRANS.`);
  }
  return defaut;
}

/**
 * Résout un hash d'URL (ex. `"#/argent"`) vers l'écran correspondant.
 * Retombe sur l'écran par défaut si le hash est vide ou inconnu — jamais
 * d'écran blanc, jamais d'exception pour un hash mal formé.
 */
export function resoudreEcran(hash: string): Ecran {
  return ECRANS.find((e) => e.chemin === hash) ?? ecranParDefaut();
}
