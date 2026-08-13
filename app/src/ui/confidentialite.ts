/**
 * Mode confidentialité : lecture, application et persistance.
 *
 * Volontairement sans dépendance à React, comme `theme.ts` : la même logique
 * doit pouvoir tourner dans le script inline de `index.html`, avant que React
 * n'existe. Sans cela, les montants s'afficheraient en clair le temps d'un
 * rendu — ce qui suffit à trahir la promesse quand on partage son écran.
 */

export const CLE_CONFIDENTIALITE = 'freel.confidentialite.v1';

export function lireConfidentialite(): boolean {
  try {
    return localStorage.getItem(CLE_CONFIDENTIALITE) === 'oui';
  } catch {
    // Stockage indisponible : on n'active pas un masquage qu'on ne saura pas
    // relire. Le mode se réactive d'un clic, une donnée exposée ne se
    // rattrape pas — mais afficher un flou qu'on ne peut pas désactiver
    // proprement serait pire.
    return false;
  }
}

export function appliquerConfidentialite(actif: boolean): void {
  const racine = document.documentElement;
  if (actif) racine.setAttribute('data-confidentiel', 'oui');
  else racine.removeAttribute('data-confidentiel');

  try {
    if (actif) localStorage.setItem(CLE_CONFIDENTIALITE, 'oui');
    else localStorage.removeItem(CLE_CONFIDENTIALITE);
  } catch {
    // Le rendu de la session en cours reste correct ; seule la mémorisation
    // pour la prochaine visite est perdue.
  }
}
