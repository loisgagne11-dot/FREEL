import { useEffect, useMemo } from 'react';
import { useFaits } from '../../state/store';
import { anneesDisponibles } from '../../state/selecteurs.argent';
import { useRoute } from '../useRoute';
import { SelecteurAnnee } from './SelecteurAnnee';

export interface ProprietesSelecteurPeriodeArgent {
  /**
   * Le couple `[valeur, setter]` renvoyé par le `useState` de `App.tsx`, tel
   * quel — plutôt que deux props `valeur`/`onChange` séparées, qui coûtaient
   * chacune un nom de propriété non minifiable au seul site d'appel qui
   * compte (`App.tsx`, jamais différé). Voir l'en-tête du budget plus bas.
   */
  readonly etat: readonly [number, (annee: number) => void];
}

/**
 * Le sélecteur d'année de la barre du haut, avec ses bornes et sa condition
 * d'affichage — chargé à la demande depuis `App.tsx`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE À PART, ET PAS DANS `App.tsx`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `anneesDisponibles` vit dans `selecteurs.argent.ts`, chargé à la demande
 * comme ce module (voir son en-tête). L'appeler depuis `App.tsx` — qui, lui,
 * n'est jamais différé — a été essayé et mesuré : la fonction se serait alors
 * retrouvée dans le paquet que l'utilisateur attend avant de voir quoi que ce
 * soit, pour un contrôle que cinq écrans sur six n'affichent jamais, et a
 * fait franchir son budget de 0,4 Ko.
 *
 * `App.tsx` ne garde donc que le NOMBRE choisi (`useState`), qui doit
 * survivre au changement d'écran ; tout ce qui sait BORNER ce nombre —
 * `anneesDisponibles`, le repli si le choix sort des bornes, et même la
 * question « suis-je sur Argent ? » — vit ici.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE COMPOSANT SE TAIT LUI-MÊME, PLUTÔT QUE D'ÊTRE MONTÉ AU BESOIN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `Shell` documente explicitement qu'elle ignore tout du métier — pas même le
 * nom d'un écran. Faire porter la condition « seulement sur Argent » par
 * `App.tsx` aurait donc obligé `App` à lire la route une seconde fois (`Ecran`
 * la lit déjà) pour une question que ce module peut se poser lui-même. Il est
 * monté sur les sept écrans, mais ne rend rien hors d'Argent : le coût, un
 * chargement anticipé de son petit paquet dès l'ouverture — négligeable au
 * regard du budget qu'il évite de faire franchir à l'entrée.
 */
export function SelecteurPeriodeArgent({ etat: [valeur, onChange] }: ProprietesSelecteurPeriodeArgent) {
  const { ecran } = useRoute();
  const faits = useFaits((e) => e.faits);
  const annees = useMemo(() => anneesDisponibles(faits), [faits]);

  // Si les faits changent sous le pied du choix courant — le dossier vient
  // d'être rechargé, ou la dernière recette d'une année future vient d'être
  // supprimée — et que l'année choisie n'a plus rien à montrer, on retombe
  // sur l'année courante plutôt que de garder un sélecteur qui pointe sur une
  // option qui n'existe plus. L'année courante est TOUJOURS dans les bornes
  // (voir `anneesDisponibles`), ce repli est donc toujours valide.
  useEffect(() => {
    if (!annees.includes(valeur)) onChange(new Date().getFullYear());
  }, [annees, valeur, onChange]);

  if (ecran.id !== 'argent') return null;
  return <SelecteurAnnee annees={annees} valeur={valeur} onChange={onChange} />;
}
