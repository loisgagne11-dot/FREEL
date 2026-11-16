import { useEffect, useMemo } from 'react';
import { useFaits } from '../../state/store';
import { anneesDisponibles } from '../../state/selecteurs.argent';
import { SelecteurAnnee } from './SelecteurAnnee';

/**
 * L'année d'un écran qui raisonne à l'année — Argent, Outils —, dans son
 * en-tête : bornée par les faits du dossier, et ramenée dans ces bornes quand
 * elle en sort.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ICI, ET PLUS DANS LA BARRE DU HAUT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La barre du haut portait le mois et l'année au-dessus de tous les écrans
 * (`SelecteurPeriode`). Elle ne porte plus de période depuis le lot 51
 * (décision 2) : chaque écran porte la sienne, une seule, dans son en-tête. Le
 * NOMBRE choisi, lui, reste dans `App` — passer d'Argent à Outils ne doit pas le
 * remettre à l'année courante.
 *
 * `anneesDisponibles` vit dans `selecteurs.argent.ts`, chargé à la demande : ce
 * module voyage avec les écrans qui l'affichent, jamais dans le paquet
 * d'entrée.
 */
export function ChoixAnnee(
  { annee, onAnnee }: {
    readonly annee: number;
    readonly onAnnee: (annee: number) => void;
  }
) {
  const faits = useFaits((e) => e.faits);
  const annees = useMemo(() => anneesDisponibles(faits), [faits]);

  // Si les faits changent sous le pied du choix — le dossier vient d'être
  // rechargé, la dernière recette d'une année future vient d'être supprimée,
  // ou le mois partagé a été mené par d'autres écrans hors du dossier — et que
  // l'année choisie n'a plus rien à montrer, on retombe sur l'année courante
  // plutôt que de garder un menu qui pointe sur une option absente. L'année
  // courante est TOUJOURS dans les bornes (voir `anneesDisponibles`).
  useEffect(() => {
    if (!annees.includes(annee)) onAnnee(new Date().getFullYear());
  }, [annees, annee, onAnnee]);

  return <SelecteurAnnee annees={annees} valeur={annee} onChange={onAnnee} />;
}
