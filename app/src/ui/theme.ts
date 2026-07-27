/**
 * Thème visuel de l'app : lecture, application et persistance.
 *
 * Volontairement sans dépendance à React : la même logique doit pouvoir
 * tourner dans le script inline de index.html, exécuté avant que React
 * n'existe, pour poser data-theme avant le premier rendu et éviter le
 * flash de thème par défaut.
 */

export type Theme = 'sombre' | 'nuit' | 'clair' | 'calme';

const THEMES: readonly Theme[] = ['sombre', 'nuit', 'clair', 'calme'];

/** Nom exact venu du design (README du handoff) : ne pas renommer, une
 * bascule de clé ferait perdre le thème choisi à tous les utilisateurs
 * déjà servis (rien ne migre l'ancienne clé). */
export const CLE_STOCKAGE_THEME = 'freel-v111-theme';

const THEME_PAR_DEFAUT: Theme = 'sombre';

function estTheme(valeur: unknown): valeur is Theme {
  return typeof valeur === 'string' && (THEMES as readonly string[]).includes(valeur);
}

/**
 * Lit le thème persisté. Ne lève jamais : localStorage peut être
 * indisponible (navigation privée, quota dépassé, contexte de test sans
 * DOM) et une valeur absente ou issue d'un ancien schéma ne doit jamais
 * faire échouer l'app — juste retomber sur le défaut, silencieusement.
 */
export function lireTheme(): Theme {
  try {
    const valeur = localStorage.getItem(CLE_STOCKAGE_THEME);
    return estTheme(valeur) ? valeur : THEME_PAR_DEFAUT;
  } catch {
    return THEME_PAR_DEFAUT;
  }
}

/**
 * Applique le thème au document et le persiste pour la prochaine visite.
 * La pose de l'attribut et la persistance sont volontairement découplées :
 * si le stockage échoue, le rendu visuel de la session en cours reste
 * correct, seule la mémorisation pour plus tard est perdue.
 */
export function appliquerTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(CLE_STOCKAGE_THEME, theme);
  } catch {
    // Stockage indisponible : dégradation silencieuse, cf. lireTheme().
  }
}

/** Libellés UI exacts du README du handoff (§ palettes). */
export const themesDisponibles: ReadonlyArray<{ readonly id: Theme; readonly libelle: string }> = [
  { id: 'sombre', libelle: 'Sombre' },
  { id: 'nuit', libelle: 'Calme sombre' },
  { id: 'clair', libelle: 'Clair' },
  { id: 'calme', libelle: 'Calme' }
];
