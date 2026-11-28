import type { JourDeLaSemaine } from '../../state/selecteurs.activite';

/**
 * Ce que les deux vues du planning disent d'un jour férié — une seule fois.
 *
 * La semaine et le mois sont deux onglets du même écran : si l'une écrivait
 * « jour férié : Ascension » et l'autre « férié », un lecteur d'écran qui passe
 * de l'une à l'autre entendrait deux choses pour le même jeudi.
 */

/** Le férié d'une journée en toutes lettres, pour un nom accessible ; `null` hors férié. */
export function nommerLeFerie(jour: Pick<JourDeLaSemaine, 'ferie' | 'nomDuFerie'>): string | null {
  if (!jour.ferie) return null;
  return jour.nomDuFerie === null ? 'jour férié' : `jour férié : ${jour.nomDuFerie.nom}`;
}

/**
 * Les fériés d'une période, pour la légende : le jour du mois et le nom entier.
 *
 * C'est là que le nom se lit quand la case ne peut pas le tenir — au téléphone,
 * elle dit seulement « férié ». Une case qui tronquerait « Armis… » ferait
 * deviner ; la légende ne fait rien deviner.
 */
export function feriesDeLaPeriode(
  jours: readonly Pick<JourDeLaSemaine, 'date' | 'nomDuFerie'>[]
): readonly { readonly date: string; readonly jour: number; readonly nom: string }[] {
  return jours.flatMap((j) => (j.nomDuFerie === null
    ? []
    : [{ date: j.date, jour: Number(j.date.slice(8, 10)), nom: j.nomDuFerie.nom }]));
}
