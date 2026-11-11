import { lazy, useState, type ComponentType } from 'react';
import { resoudreRoute } from './navigation';
import type { IdEcran } from './navigation';

/**
 * Un composant chargé à la demande, qui ne suspend plus une fois son code arrivé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI NE PAS SE CONTENTER DE `lazy`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Mesuré dans le navigateur (lot 14) : un écran dont le code est déjà en
 * cache s'ouvrait en ~320 ms alors que ses requêtes finissaient en moins de
 * 30 ms. `lazy` suspend TOUJOURS à la première lecture, même sur une promesse
 * résolue ; React monte alors le repli « Chargement… » et retient la
 * révélation du contenu 300 ms après l'avoir montré (anti-clignotement). Le
 * repli ne servait à rien, et il coûtait dix fois le chargement.
 *
 * Contre-exemple écarté : `startTransition` sur le changement de route. Il
 * supprime le repli, mais l'écran qu'on quitte reste affiché pendant le
 * chargement — le titre de l'ancien écran satisfait alors « un titre est
 * visible », et `verifier:vitesse` ne mesurerait plus rien. Pire pour
 * l'utilisateur : un clic sur un écran lent paraît sans effet.
 *
 * Ici : une fois le module arrivé (`precharger()` le fait au repos, après le
 * premier rendu), le composant est rendu directement, sans frontière à
 * franchir. Tant qu'il n'est pas arrivé — lien direct vers un écran, réseau
 * lent — on retombe sur `lazy` et son repli, donc le comportement visible est
 * celui d'avant.
 *
 * Le choix est fait au MONTAGE et ne change plus : basculer de `lazy` au
 * composant direct en cours de vie changerait le type de l'élément et
 * démonterait l'écran, avec la saisie en cours.
 */
const lanceurs: Array<() => Promise<unknown>> = [];
/**
 * Vrai une fois le repos atteint. Les composants d'un écran sont déclarés quand
 * LE MODULE DE L'ÉCRAN s'évalue, c'est-à-dire pendant le préchargement lui-même :
 * sans ce drapeau, la trésorerie d'Argent, déclarée après le départ de la
 * boucle, n'aurait jamais été lancée et l'écran retombait à ~320 ms.
 */
let reposAtteint = false;

/**
 * @param auRepos Vrai pour ce que l'écran affiche TOUJOURS : un écran Argent
 *   sans sa trésorerie n'existe pas, autant la télécharger avec lui. Faux pour
 *   ce qui dépend de l'adresse ou d'un clic (sections de Config, formulaires) :
 *   on ne télécharge pas ce qu'on ne regarde pas. Ceux-là se lancent par
 *   `lancer()`, à l'évaluation du module parent, si l'adresse les désigne.
 */
export function composantALaDemande<C extends ComponentType<never>>(
  charger: () => Promise<C>,
  auRepos = false
): C & { readonly lancer: () => void } {
  let charge: C | null = null;
  let promesse: Promise<C> | null = null;
  // Une seule promesse : le préchargement et `lazy` partagent le même import.
  const lancer = (): Promise<C> =>
    (promesse ??= charger().then((c) => { charge = c; return c; }));
  if (auRepos) {
    if (reposAtteint) lancer().catch(() => undefined);
    else lanceurs.push(lancer);
  }

  const Differe = lazy(() => lancer().then((c) => ({ default: c as ComponentType<object> })));

  // `C` est le type du composant lui-même : les props de l'appelant restent
  // vérifiées à l'appel, sans que ce module n'ait à les connaître.
  function ComposantALaDemande(props: object) {
    const [Direct] = useState<C | null>(() => charge);
    const Rendu = (Direct ?? Differe) as ComponentType<object>;
    return <Rendu {...props} />;
  }
  return Object.assign(ComposantALaDemande as unknown as C, {
    // Un échec réseau n'est pas rapporté ici : `lazy` le relèvera, avec son
    // filet d'erreur, au moment où l'utilisateur ouvre vraiment la chose.
    lancer: (): void => { lancer().catch(() => undefined); }
  });
}

/**
 * La sous-route de l'adresse SI elle désigne cet écran, sinon `null`.
 *
 * Pour décider, à l'évaluation d'un module d'écran, quelle section charger :
 * `#/config/fiscal` ne doit pas déclencher `Config.reserve`, ni quoi que ce
 * soit quand l'adresse désigne un autre écran (le module peut arriver au repos,
 * pendant qu'on lit le Pilote). Même analyseur que `useRoute` : un second
 * finirait par lire autrement les adresses mal formées.
 */
export function sousRouteSiEcran(id: IdEcran, hash: string): string | null {
  const route = resoudreRoute(hash);
  return route.ecran.id === id ? route.sousRoute : null;
}

/** L'adresse du navigateur ; vide hors navigateur (tests sans DOM). */
export function adresseCourante(): string {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

/**
 * Télécharge au repos ce que les écrans affichent toujours.
 *
 * Appelé depuis `main.tsx`, pas à l'évaluation de ce module : les tests
 * importent les écrans sans vouloir que tout le reste se charge derrière.
 * Après le premier rendu et à l'idle, donc sans toucher au poids du premier
 * affichage (voir `verifier:budget`).
 */
export function precharger(): void {
  const lancerTout = (): void => {
    reposAtteint = true;
    for (const lancer of lanceurs) lancer().catch(() => undefined);
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(lancerTout);
  } else {
    window.setTimeout(lancerTout, 200);
  }
}
