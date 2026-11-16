import { useCallback, useEffect, useState } from 'react';
import type { Ecran, IdEcran, Route } from './navigation';
import { ECRANS, redirection, resoudreRoute } from './navigation';

/**
 * L'adresse courante, une ancienne adresse ramenée à la nouvelle au passage.
 *
 * `replace` et non une affectation : l'ancienne adresse ne doit pas rester
 * dans l'historique, sinon « retour » y ramènerait — et elle renverrait
 * aussitôt ici, si bien qu'on ne pourrait plus reculer du tout. La
 * redirection se fait AVANT de résoudre l'écran : `#/activite/factures`
 * désigne un écran qui existe, et le résoudre d'abord ouvrirait le planning.
 */
function lireHashCourant(): string {
  // `window` est absent en environnement de test sans DOM ; on ne blinde
  // pas ce cas ici — useRoute est un hook React, il ne s'exécute que côté
  // navigateur, à la différence de navigation.ts qui reste pur et testable.
  const hash = window.location.hash;
  const nouvelle = redirection(hash);
  if (nouvelle === null) return hash;
  window.location.replace(nouvelle);
  return nouvelle;
}

/**
 * Routage minimal par hash. Pas de routeur d'historique : l'app est servie
 * en fichiers statiques sur GitHub Pages, où une route type `/tresorerie`
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
