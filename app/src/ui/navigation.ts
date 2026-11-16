/**
 * Définition des écrans de l'application — source unique de vérité pour la
 * navigation.
 *
 * L'ancienne version (v1.11-shell.js) n'avait pas de notion d'écran stable :
 * `screenTab()` devinait l'écran courant par une expression régulière sur
 * `document.title`, et les badges de navigation étaient appariés au libellé
 * visible par préfixe de texte (`lbl.indexOf(tab) === 0`). Un renommage ou
 * une traduction cassait silencieusement les deux. Ici, l'identifiant est
 * la seule clé qui compte : le libellé peut changer sans rien casser.
 */

/** Identifiant stable d'un écran. Ne varie jamais, contrairement au libellé affiché. */
export type IdEcran =
  | 'pilote' | 'activite' | 'factures' | 'tresorerie' | 'obligations' | 'achats'
  | 'simulateurs' | 'reglages' | 'facture';

/** Icône sobre au trait, exprimée comme l'attribut `d` d'un unique `<path>` sur un viewBox 24x24. */
export interface Ecran {
  readonly id: IdEcran;
  readonly libelle: string;
  /** Chemin de route, sous forme de hash — l'app est servie en statique, sans routeur d'historique. */
  readonly chemin: string;
  readonly icone: string;
  /**
   * L'entrée du rail qui s'allume quand on est sur cet écran, s'il n'a pas
   * la sienne : une facture qu'on rédige ou qu'on rouvre allume « Factures ».
   */
  readonly rattacheA?: IdEcran;
  /**
   * Sous le filet du rail (décision 1 du 16/11) : on y vient simuler ou
   * régler, pas travailler. Six entrées pour ce qu'on vient faire, deux pour
   * le reste — mêlées, les huit se liraient comme huit questions de même rang.
   */
  readonly pied?: true;
  /**
   * Dans la barre basse du téléphone (décision 3). Les autres entrées passent
   * dans le volet « Plus » : cinq cibles nommées tiennent dans 360 px, huit non.
   */
  readonly barre?: true;
}

/** Écran affiché quand le hash est vide ou ne correspond à aucun écran connu. */
export const ID_ECRAN_PAR_DEFAUT: IdEcran = 'pilote';

/*
 * Les tracés sont ceux de la maquette `navigation.html`, ramenés à un seul
 * `<path>` : un rectangle arrondi s'y écrit en arcs, un cercle en deux
 * demi-cercles. Un `<rect>` ou un `<circle>` par icône aurait demandé un
 * composant d'icône dans le paquet d'entrée, pour le même dessin.
 */
export const ECRANS: readonly Ecran[] = [
  {
    id: 'pilote',
    libelle: 'Pilote',
    chemin: '#/pilote',
    barre: true,
    icone: 'M2 12h4l3-8 4 16 3-8h6'
  },
  {
    id: 'activite',
    libelle: 'Activité',
    chemin: '#/activite',
    barre: true,
    icone: 'M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM3 10h18M8 3v4M16 3v4'
  },
  {
    id: 'factures',
    libelle: 'Factures',
    chemin: '#/factures',
    barre: true,
    icone: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6'
  },
  {
    id: 'tresorerie',
    libelle: 'Trésorerie',
    chemin: '#/tresorerie',
    barre: true,
    icone: 'M6 6h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3zM16 12.5h2M3 9.5h14'
  },
  {
    id: 'obligations',
    libelle: 'Obligations',
    chemin: '#/obligations',
    icone: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M8 12.5l2.5 2.5L16 9.5'
  },
  {
    id: 'achats',
    libelle: 'Achats',
    chemin: '#/achats',
    icone: 'M5 8h14l-1.2 12H6.2zM9 8V6a3 3 0 0 1 6 0v2'
  },
  {
    id: 'simulateurs',
    libelle: 'Simulateurs',
    chemin: '#/simulateurs',
    pied: true,
    icone: 'M8 3h8a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM8.5 7.5h7M8.5 12h1M12 12h1M8.5 16h1M12 16h1'
  },
  {
    id: 'reglages',
    libelle: 'Réglages',
    chemin: '#/reglages',
    pied: true,
    icone: 'M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7'
  },
  {
    /* La rédaction et la réédition d'une facture : `#/facture/nouvelle`,
       `#/facture/2026-001`. Ce ne sont pas des onglets de la liste mais des
       gestes, avec leur propre adresse que les actions rapides visent. */
    id: 'facture',
    libelle: 'Facture',
    rattacheA: 'factures',
    chemin: '#/facture',
    icone: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6'
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

/** Un écran, et ce qui suit son nom dans l'URL. */
export interface Route {
  readonly ecran: Ecran;
  /**
   * Le segment qui suit l'écran, ou `''`.
   *
   * `#/facture/nouvelle` donne `'nouvelle'`. C'est ce qui permet à une action
   * rapide du Pilote d'ouvrir directement la rédaction d'une facture, plutôt
   * que de déposer l'utilisateur sur la liste en le laissant chercher le
   * bouton — le reproche exact fait à l'ancienne version.
   */
  readonly sousRoute: string;
}

/** Les segments d'une adresse : `#/argent/tva` donne `['argent', 'tva']`. */
function segmentsDe(hash: string): string[] {
  return hash.replace(/^#\/?/, '').split('/').filter((s) => s.length > 0);
}

/**
 * Résout un hash d'URL (ex. `"#/tresorerie"`, `"#/facture/nouvelle"`).
 *
 * La découpe se fait sur les SEGMENTS, jamais sur les caractères : `"#/pi"`
 * n'est pas un début de `"#/pilote"`, c'est un segment inconnu. C'est ce qui
 * évite de réintroduire l'appariement par préfixe de texte de l'ancienne
 * version, où « Achat » sélectionnait « Achats » et « Arg » « Argent ».
 *
 * Retombe sur l'écran par défaut si le hash est vide ou inconnu — jamais
 * d'écran blanc, jamais d'exception pour un hash mal formé.
 */
export function resoudreRoute(hash: string): Route {
  const segments = segmentsDe(hash);
  const ecran = ECRANS.find((e) => e.chemin === `#/${segments[0] ?? ''}`);
  if (ecran === undefined) return { ecran: ecranParDefaut(), sousRoute: '' };
  return { ecran, sousRoute: segments[1] ?? '' };
}

/** L'écran seul, quand la sous-route n'intéresse pas l'appelant. */
export function resoudreEcran(hash: string): Ecran {
  return resoudreRoute(hash).ecran;
}

/**
 * Les adresses d'avant le lot 51, et où elles mènent désormais.
 *
 * Elles vivent dans les favoris, dans les liens recollés d'un courriel, dans
 * l'historique du navigateur — `#/argent` est la première page que la bascule
 * de la v2 a rendue. Les laisser retomber sur le Pilote, comme toute adresse
 * inconnue, ferait croire que la page a disparu.
 *
 * Les PAIRES passent avant les noms : `#/activite/factures` désigne un écran
 * qui existe toujours (Activité), et sans elles la liste des factures
 * s'ouvrirait sur le planning. Un `Map` et non un objet : l'adresse est saisie
 * par n'importe qui, et `#/constructor` ne doit pas trouver la fonction que
 * tout objet hérite sous ce nom.
 */
const ANCIENNES_ADRESSES: ReadonlyMap<string, string> = new Map([
  ['activite/factures', 'factures'],
  ['activite/clients', 'factures/clients'],
  ['achats/releve', 'tresorerie/releve'],
  ['argent/tva', 'obligations/tva'],
  ['argent/livre', 'obligations/livre'],
  ['config/livre', 'obligations/livre'],
  ['outils/cra', 'activite/compte-rendu'],
  ['argent', 'tresorerie'],
  ['outils', 'simulateurs'],
  ['config', 'reglages'],
  // `#/facture` seul : la liste, qui a quitté cette adresse au lot 6. Ses
  // sous-routes — rédiger, rouvrir — restent, et ne sont pas des paires.
  ['facture', 'factures']
]);

/**
 * La nouvelle adresse d'une ancienne, ou `null` quand l'adresse est actuelle.
 *
 * Un nom renommé garde sa sous-route : `#/config/compte` mène à
 * `#/reglages/compte`, la section que la pastille de synchronisation visait.
 */
export function redirection(hash: string): string | null {
  const [premier = '', second] = segmentsDe(hash);
  const paire = second === undefined ? undefined : ANCIENNES_ADRESSES.get(`${premier}/${second}`);
  if (paire !== undefined) return `#/${paire}`;
  // `#/facture/nouvelle` est actuelle : seul `#/facture` nu a déménagé.
  if (premier === 'facture' && second !== undefined) return null;
  const nom = ANCIENNES_ADRESSES.get(premier);
  if (nom === undefined) return null;
  return second === undefined ? `#/${nom}` : `#/${nom}/${second}`;
}

/**
 * Les huit entrées du rail (décision 1 du 16/11) : Pilote, Activité, Factures,
 * Trésorerie, Obligations, Achats ; sous un filet, Simulateurs et Réglages.
 * La rédaction d'une facture n'a pas d'entrée : elle allume « Factures ».
 */
export const ECRANS_DU_RAIL: readonly Ecran[] = ECRANS.filter((e) => e.rattacheA === undefined);

/** L'entrée du rail allumée pour un écran : la sienne, ou celle qui l'accueille. */
export function entreeDuRail(id: IdEcran): IdEcran {
  return ECRANS.find((e) => e.id === id)?.rattacheA ?? id;
}
