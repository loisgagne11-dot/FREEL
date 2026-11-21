import { type RefObject, useLayoutEffect, useState } from 'react';

/**
 * La largeur d'un élément, suivie quand la fenêtre change ; `null` tant
 * qu'elle n'est pas mesurée — ou là où rien ne se mesure (tests).
 *
 * Les frises se dessinent à la largeur RÉELLE de leur carte, sans mise à
 * l'échelle : un gabarit étiré écrivait ses mois en 20 px sur un bureau
 * étroit, un gabarit tassé en 7 px. Celle d'Obligations l'a écrit la première
 * (lot 53) ; celle du carnet (lot 48) en a eu besoin à son tour — un seul
 * crochet, pour que les deux ne mesurent pas différemment.
 */
export function useLargeur(ref: RefObject<HTMLElement | null>): number | null {
  const [largeur, setLargeur] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return undefined;
    const mesurer = () => setLargeur(el.clientWidth > 0 ? el.clientWidth : null);
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    return () => observateur.disconnect();
  }, [ref]);
  return largeur;
}
