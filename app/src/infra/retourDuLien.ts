/**
 * Le retour d'un lien envoyé par courriel, lu et RETIRÉ de l'adresse avant
 * tout le reste.
 *
 * Un lien « mot de passe oublié » ou « confirme ton adresse » ramène ici avec
 * `?code=…` (flux PKCE : voir `supabase.inscription.ts`), ou avec `?error=…`
 * quand il a expiré. Ce code ouvre une session : il ne doit rester ni dans la
 * barre d'adresse, ni dans l'historique (le bouton « retour » le rejouerait,
 * l'historique le montrerait). `history.replaceState` le retire sans laisser de
 * trace ; la page n'envoie déjà aucun référent (`index.html`), il ne part donc
 * pas non plus chez un tiers.
 *
 * Il est lu AVANT le premier rendu, depuis `main.tsx` : le routeur lit le
 * fragment à son montage, et doit y trouver `#/reglages/compte`, où l'écran
 * Compte reprend le code pour l'échanger.
 *
 * Dans le paquet d'entrée, donc réduit au geste : l'analyse du code et
 * l'échange vivent dans `supabase.inscription.ts`, chargé avec l'écran Compte.
 * Le code reste en mémoire seulement : un rechargement le perd, et c'est
 * voulu — il ne sert qu'une fois, et un lien se redemande.
 */
let retour: URLSearchParams | null = null;

export function capturerRetourDuLien(
  lieu: Pick<Location, 'search' | 'pathname'> = window.location,
  historique: Pick<History, 'replaceState'> = window.history
): void {
  const p = new URLSearchParams(lieu.search);
  if (!p.has('code') && !p.has('error') && !p.has('error_code')) return;
  retour = p;
  historique.replaceState(null, '', `${lieu.pathname}#/reglages/compte`);
}

export const retourDuLien = (): URLSearchParams | null => retour;

export function oublierRetourDuLien(): void { retour = null; }
