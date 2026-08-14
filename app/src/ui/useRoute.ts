import { useCallback, useEffect, useState } from 'react';
import type { Ecran, IdEcran, Route } from './navigation';
import { ECRANS, resoudreRoute } from './navigation';

function lireHashCourant(): string {
  // `window` est absent en environnement de test sans DOM ; on ne blinde
  // pas ce cas ici — useRoute est un hook React, il ne s'exécute que côté
  // navigateur, à la différence de navigation.ts qui reste pur et testable.
  return window.location.hash;
}

/**
 * Routage minimal par hash. Pas de routeur d'historique : l'app est servie
 * en fichiers statiques sur GitHub Pages, où une route type `/argent`
 * renverrait une 404 sans configuration serveur dédiée (réécriture
 * d'URL), qu'on ne maîtrise pas sur ce type d'hébergement.
 */
export function useRoute(): {
  readonly ecran: Ecran;
  /** Le segment qui suit l'écran (`#/facture/nouvelle` → `'nouvelle'`), ou `''`. */
  readonly sousRoute: string;
  readonly naviguerVers: (id: IdEcran, sousRoute?: string) => void;
} {
  const [route, setRoute] = useState<Route>(() => resoudreRoute(lireHashCourant()));

  useEffect(() => {
    const surChangementHash = (): void => {
      setRoute(resoudreRoute(lireHashCourant()));
    };
    window.addEventListener('hashchange', surChangementHash);
    return () => window.removeEventListener('hashchange', surChangementHash);
  }, []);

  const naviguerVers = useCallback((id: IdEcran, sousRoute = ''): void => {
    const cible = ECRANS.find((e) => e.id === id);
    if (cible) {
      window.location.hash = sousRoute === '' ? cible.chemin : `${cible.chemin}/${sousRoute}`;
    }
  }, []);

  return { ecran: route.ecran, sousRoute: route.sousRoute, naviguerVers };
}
