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

/**
 * Le thème d'un nouvel utilisateur — et de quiconque n'a jamais choisi.
 *
 * Calme depuis le 16/11 (décision 5) : c'est le préféré du propriétaire, et la
 * direction visuelle est dessinée dans ce thème d'abord. Il était « sombre ».
 *
 * Le même défaut est écrit à DEUX autres endroits, qui ne peuvent pas importer
 * ce module : le script en ligne de `index.html`, qui le pose avant React, et
 * le repli `:root` de `tokens.css`, qui vaut tant qu'aucun attribut n'est posé.
 * S'ils divergeaient, l'écran s'ouvrirait dans un thème puis basculerait dans
 * un autre au montage. `theme.test.ts` les relit tous les trois.
 *
 * Un thème déjà mémorisé n'est pas touché : le défaut ne sert qu'à qui n'a
 * rien choisi.
 */
export const THEME_PAR_DEFAUT: Theme = 'calme';

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

/**
 * Les quatre thèmes, dans l'ordre des Réglages › Affichage — celui de la
 * maquette `navigation.html` : le défaut d'abord, puis sa version sombre.
 *
 * « Nuit » et non plus « Calme sombre » (décision 7, 16/11) : un nom de deux
 * mots dont l'un est celui d'un autre thème se lisait comme une variante de
 * réglage, pas comme un thème. L'identifiant reste `nuit` — c'est lui qui est
 * mémorisé, et le renommer ferait perdre leur choix à ceux qui l'ont fait.
 *
 * La description dit ce qui distingue le thème des trois autres, en deux mots.
 */
export const themesDisponibles: ReadonlyArray<{
  readonly id: Theme;
  readonly libelle: string;
  readonly description: string;
}> = [
  { id: 'calme', libelle: 'Calme', description: 'clair, doux' },
  { id: 'nuit', libelle: 'Nuit', description: 'le calme, en sombre' },
  { id: 'sombre', libelle: 'Sombre', description: 'contrasté' },
  { id: 'clair', libelle: 'Clair', description: 'blanc, net' }
];
