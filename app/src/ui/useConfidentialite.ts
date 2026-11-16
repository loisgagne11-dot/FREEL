import { useCallback, useEffect, useState } from 'react';
import {
  EVENEMENT_CONFIDENTIALITE, appliquerConfidentialite, lireConfidentialite
} from './confidentialite';

/**
 * Le mode confidentialité, tel qu'un composant l'affiche et le bascule.
 *
 * Partagé par les deux commandes qui le basculent — l'icône de la barre du haut
 * et l'interrupteur de Réglages › Affichage. Chacune suit les bascules de
 * l'autre par `EVENEMENT_CONFIDENTIALITE` : deux commandes du même mode qui ne
 * s'accordent pas font masquer en croyant démasquer.
 *
 * L'état suivi est l'ATTRIBUT du document, pas le stockage : c'est lui qui
 * floute, et il reste juste quand le stockage refuse d'écrire.
 */
export function useConfidentialite(): readonly [boolean, (actif: boolean) => void] {
  const [actif, setActif] = useState<boolean>(() => lireConfidentialite());

  useEffect(() => {
    const suivre = (): void => setActif(document.documentElement.hasAttribute('data-confidentiel'));
    window.addEventListener(EVENEMENT_CONFIDENTIALITE, suivre);
    return () => window.removeEventListener(EVENEMENT_CONFIDENTIALITE, suivre);
  }, []);

  const changer = useCallback((valeur: boolean): void => {
    appliquerConfidentialite(valeur);
    setActif(valeur);
  }, []);

  return [actif, changer];
}
