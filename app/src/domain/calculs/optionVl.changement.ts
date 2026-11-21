/**
 * Écrire une histoire de l'option pour le versement libératoire.
 *
 * Deux gestes, que rien dans le booléen ne distinguait :
 *
 *  · CORRIGER une erreur — « j'ai toujours été sous versement libératoire » :
 *    l'option vaut depuis le début, l'histoire s'efface, et tout ce qui a été
 *    calculé sur la mauvaise option se recalcule. C'est ce que faisait la case
 *    jusqu'ici, et c'est le seul geste juste l'année de création, où l'option
 *    demandée dans les trois mois vaut dès le début ;
 *  · CHANGER d'option — elle vaut au 1er janvier qui suit : ce qui valait
 *    cette année reste jusqu'en décembre, et ne se recalcule pas.
 *
 * Chargé avec les Réglages, seuls à l'écrire : la lecture (`optionVl`) est au
 * premier rendu, ceci n'a rien à y faire.
 */

import type { Mois } from '../types';
import { decalerMois } from './periode';
import { type PeriodeOptionVl, optionVlAu } from './optionVl';

export type DepuisQuand = 'debut' | 'janvier';

export interface OptionVl {
  /** L'option qui vaut après la dernière période close. */
  readonly versementLiberatoire: boolean;
  readonly historiqueVl: readonly PeriodeOptionVl[];
}

/**
 * L'option après un changement demandé pendant l'année `annee`.
 *
 * Une histoire qui ne dit rien de plus que l'option se réduit : deux périodes
 * qui se suivent avec la même valeur se fondent, et une dernière période égale
 * à l'option finale s'efface. Sans cela, revenir sur un changement demandé par
 * erreur — cocher puis décocher en novembre — laisserait une période close qui
 * ne change rien, et que l'écran annoncerait comme un changement.
 */
export function changerOptionVl(
  actuelle: OptionVl, nouvelle: boolean, depuis: DepuisQuand, annee: number
): OptionVl {
  if (depuis === 'debut') return { versementLiberatoire: nouvelle, historiqueVl: [] };

  const decembre = `${annee}-12` as Mois;
  const cetteAnnee = optionVlAu(actuelle.historiqueVl, actuelle.versementLiberatoire, decembre);
  const periodes: PeriodeOptionVl[] = [];
  for (const p of [...actuelle.historiqueVl.filter((h) => h.jusquA < decembre), { jusquA: decembre, actif: cetteAnnee }]) {
    const precedente = periodes[periodes.length - 1];
    if (precedente !== undefined && precedente.actif === p.actif) periodes[periodes.length - 1] = p;
    else periodes.push(p);
  }
  while (periodes[periodes.length - 1]?.actif === nouvelle) periodes.pop();
  return { versementLiberatoire: nouvelle, historiqueVl: periodes };
}

/**
 * Le prochain changement d'option après ce mois, ou `null` s'il n'y en a pas.
 *
 * C'est ce que Réglages annonce — « à partir du 1er janvier 2027 » — tant que
 * l'option choisie ne vaut pas encore : une option prise en novembre pour
 * janvier ne s'affiche ni au rail ni dans le régime avant janvier.
 */
export function prochainChangementVl(
  actuelle: OptionVl, courant: Mois
): { readonly le: Mois; readonly actif: boolean } | null {
  const { historiqueVl, versementLiberatoire } = actuelle;
  const maintenant = optionVlAu(historiqueVl, versementLiberatoire, courant);
  for (const p of historiqueVl) {
    if (p.jusquA < courant) continue;
    const le = decalerMois(p.jusquA, 1);
    const actif = optionVlAu(historiqueVl, versementLiberatoire, le);
    if (actif !== maintenant) return { le, actif };
  }
  return null;
}
