import { useMemo } from 'react';
import type { Mois } from '../../domain/types';
import { useFaits } from '../../state/store';
import { fluxDUnAutreMois } from '../../state/selecteurs.flux';
import { moisLong } from '../format';
import { FluxAutreMois } from './FluxAutreMois';

/**
 * La carte d'un autre mois, avec son calcul — le point d'entrée différé du
 * Pilote. Le sélecteur vit dans ce paquet, pas dans celui de l'entrée.
 */
export function FluxAutreMoisCarte(
  { mois, courant, onRevenir }: {
    readonly mois: Mois;
    readonly courant: Mois;
    readonly onRevenir: () => void;
  }
) {
  const faits = useFaits((e) => e.faits);
  const flux = useMemo(() => fluxDUnAutreMois(faits, mois), [faits, mois]);
  return (
    <FluxAutreMois
      flux={flux}
      periode={moisLong(mois)}
      courant={moisLong(courant)}
      onRevenir={onRevenir}
    />
  );
}
