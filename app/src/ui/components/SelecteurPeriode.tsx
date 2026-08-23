import { useEffect, useMemo } from 'react';
import { useFaits } from '../../state/store';
import { anneesDisponibles } from '../../state/selecteurs.argent';
import { useRoute } from '../useRoute';
import type { IdEcran } from '../navigation';
import { SelecteurAnnee } from './SelecteurAnnee';

export interface ProprietesSelecteurPeriode {
  /**
   * Le couple `[valeur, setter]` renvoyé par le `useState` de `App.tsx`, tel
   * quel — plutôt que deux props `valeur`/`onChange` séparées, qui coûtaient
   * chacune un nom de propriété non minifiable au seul site d'appel qui
   * compte (`App.tsx`, jamais différé). Voir l'en-tête du budget plus bas.
   */
  readonly etat: readonly [number, (annee: number) => void];
}

/**
 * Les écrans sur lesquels l'année a quelque chose à ancrer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX ÉCRANS N'Y SONT PAS, ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * **Pilote** est le poste de pilotage d'AUJOURD'HUI : « combien je peux me
 * verser », « qu'est-ce qui coince ». Aucun de ces chiffres n'a d'année, et
 * les faire suivre le sélecteur ferait lire « tu peux te verser 3 000 € » sur
 * 2025 — un montant qu'on ne peut pas se verser, puisque l'année est passée.
 *
 * **Config** ne porte que des réglages. Un régime fiscal n'a pas de période
 * d'affichage.
 *
 * Un sélecteur affiché mais sans effet serait pire que les deux : on le
 * tournerait, rien ne bougerait, et on cesserait de s'en servir sur les cinq
 * écrans où il marche.
 */
const ECRANS_DATES: ReadonlySet<IdEcran> = new Set<IdEcran>([
  'activite', 'argent', 'facture', 'achats', 'outils'
]);

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
 * soit, pour un contrôle que deux écrans sur sept n'affichent jamais, et a
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
 * nom d'un écran. Faire porter la condition d'affichage par `App.tsx` aurait
 * donc obligé `App` à lire la route une seconde fois (`Ecran` la lit déjà)
 * pour une question que ce module peut se poser lui-même. Il est monté sur les
 * sept écrans, mais ne rend rien sur Pilote ni Config : le coût, un chargement
 * anticipé de son petit paquet dès l'ouverture — négligeable au regard du
 * budget qu'il évite de faire franchir à l'entrée.
 */
export function SelecteurPeriode({ etat: [valeur, onChange] }: ProprietesSelecteurPeriode) {
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

  if (!ECRANS_DATES.has(ecran.id)) return null;
  return <SelecteurAnnee annees={annees} valeur={valeur} onChange={onChange} />;
}
