/**
 * Créer son compte, retrouver l'accès — et le retour des liens envoyés par
 * courriel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE RETOUR PASSE PAR `?code=`, JAMAIS PAR UN JETON DANS LE FRAGMENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Supabase sait ramener d'un lien de deux façons. La plus simple (« implicite »)
 * pose la session dans le fragment : `…/#access_token=…&refresh_token=…`. Ici,
 * c'est le contre-exemple exact :
 *
 *  · l'application route par le fragment (`#/reglages/compte`) : un fragment
 *    occupé par des jetons n'est plus une route, l'écran retombe sur le Pilote
 *    et personne ne lit la session ;
 *  · et les jetons d'une session complète — valable une heure, renouvelable —
 *    restent dans la barre d'adresse et l'historique, à la portée de quiconque
 *    regarde l'écran ou ouvre l'historique.
 *
 * On demande donc le flux PKCE : à la demande du lien, l'application tire un
 * secret (le « vérifieur »), n'en envoie que l'empreinte, et garde le secret
 * dans ce navigateur. Le lien ramène avec `?code=…` — dans la requête, pas
 * dans le fragment, donc sans toucher à la route — et ce code ne vaut rien
 * sans le secret : seul ce navigateur peut l'échanger contre une session
 * (`POST /auth/v1/token?grant_type=pkce`). Le code est retiré de l'adresse dès
 * l'entrée dans l'application (`retourDuLien.ts`).
 *
 * Le prix : le lien doit s'ouvrir dans le navigateur où on l'a demandé. Ouvert
 * ailleurs, il ne connecte pas — l'écran le dit, et dit quoi faire.
 *
 * Le secret vit dans `localStorage`, pas dans `sessionStorage` : le lien
 * s'ouvre depuis la messagerie, dans un NOUVEL onglet, qui ne voit pas le
 * stockage de session de celui qui l'a demandé.
 */
import {
  appeler, sessionDepuis, type ConfigSupabase, type Resultat, type Session, type StockageLocal
} from './supabase';

export type MotifLien = 'recuperation' | 'inscription';

/** Le secret du dernier lien demandé ; un seul à la fois, le dernier l'emporte. */
export const CLE_LIEN = 'freel.compte.lien.v1' as const;

interface LienEnAttente {
  readonly verifieur: string;
  readonly motif: MotifLien;
}

function base64url(octets: Uint8Array): string {
  let s = '';
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 32 octets tirés au hasard : 43 caractères, dans les bornes de la RFC 7636 (43 à 128). */
export function genererVerifieur(
  aleas: Uint8Array = globalThis.crypto.getRandomValues(new Uint8Array(32))
): string {
  return base64url(aleas);
}

/**
 * L'empreinte du vérifieur (S256), ou le vérifieur lui-même (`plain`) quand
 * le navigateur n'a pas de quoi hacher — page servie en `http:` sur un réseau
 * local, où `crypto.subtle` n'existe pas. Le serveur accepte les deux ; le
 * second ne protège que par le chiffrement de la requête, qui reste en https.
 */
export async function defiPkce(
  verifieur: string,
  subtle: SubtleCrypto | null = globalThis.crypto?.subtle ?? null
): Promise<{ readonly defi: string; readonly methode: 's256' | 'plain' }> {
  if (subtle === null) return { defi: verifieur, methode: 'plain' };
  const empreinte = await subtle.digest('SHA-256', new TextEncoder().encode(verifieur));
  return { defi: base64url(new Uint8Array(empreinte)), methode: 's256' };
}

export function lireLienEnAttente(stockage: StockageLocal): LienEnAttente | null {
  try {
    const o = JSON.parse(stockage.getItem(CLE_LIEN) ?? 'null') as Record<string, unknown> | null;
    const verifieur = o?.['verifieur'];
    const motif = o?.['motif'];
    return typeof verifieur === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(verifieur)
      && (motif === 'recuperation' || motif === 'inscription')
      ? { verifieur, motif } : null;
  } catch {
    return null;
  }
}

function ecrireLienEnAttente(stockage: StockageLocal, lien: LienEnAttente | null): void {
  try {
    if (lien === null) stockage.removeItem(CLE_LIEN);
    else stockage.setItem(CLE_LIEN, JSON.stringify(lien));
  } catch {
    // Sans stockage, le lien ne pourra pas s'échanger : l'écran le dira au retour.
  }
}

/**
 * L'adresse où FREEL est ouvert, sans fragment ni requête : celle où le lien
 * doit ramener. Le fragment n'y est pas — c'est la route, et la requête
 * recevra le code.
 */
export function adresseDeRetour(
  lieu: { readonly origin: string; readonly pathname: string } = window.location
): string {
  return `${lieu.origin}${lieu.pathname}`;
}

type Erreur = Extract<Resultat<unknown>, { statut: 'erreur' }>;

/**
 * NOTRE phrase pour un refus, choisie sur le code — jamais le texte du serveur,
 * qui est en anglais et hostile par principe (voir `supabase.verification.ts`).
 */
function motifRefus(r: Erreur, geste: 'inscription' | 'lien' | 'mot-de-passe'): string {
  switch (r.codeErreur) {
    case 'weak_password':
      return 'Mot de passe trop faible pour ce projet : allonge-le, six caractères au moins.';
    case 'same_password':
      return 'C’est déjà ton mot de passe : choisis-en un autre.';
    case 'signup_disabled':
      return 'Les inscriptions sont fermées sur ce projet. Si ton compte existe, connecte-toi ; '
        + 'sinon, rouvre-les le temps de le créer (Authentication › Sign In / Providers, '
        + '« Allow new users to sign up »).';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Le projet refuse cette adresse : vérifie-la.';
    case 'email_address_not_authorized':
      return 'Sans réglage, Supabase n’écrit qu’aux membres de l’équipe du projet : prends l’adresse '
        + 'de ton compte supabase.com, ou règle un service d’envoi (Authentication › Emails).';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Trop de courriels demandés : le service par défaut n’en envoie que quelques-uns par heure. '
        + 'Réessaie plus tard.';
    case 'email_provider_disabled':
      return 'La connexion par courriel est désactivée sur ce projet (Authentication › Sign In / Providers › Email).';
    default:
  }
  if (r.code === 429) return 'Trop de tentatives : attends une minute avant de réessayer.';
  if (r.panne !== undefined || (r.code !== undefined && r.code >= 500)) {
    return 'Le projet ne répond pas : réessaie, ou rouvre-le depuis supabase.com s’il est en pause.';
  }
  if (r.code === 401 || r.code === 403) {
    return geste === 'mot-de-passe'
      ? 'La session ouverte par le lien a expiré : redemande le lien.'
      : 'Le projet refuse la clé publique : vérifie-la avec « Changer de projet ».';
  }
  // Ni code ni panne : refusé avant tout envoi (adresse en http), motif à nous.
  if (r.code === undefined) return r.motif;
  return `Le projet a refusé la demande (erreur ${r.code}).`;
}

const objet = (v: unknown): Record<string, unknown> =>
  (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {});

/* ── Créer son compte ──────────────────────────────────────────────────── */

export type IssueInscription =
  /** Le projet ne demande pas de confirmer l'adresse : la session est là. */
  | { readonly statut: 'connecte'; readonly session: Session }
  /** Un courriel de confirmation est parti ; son lien ramène ici. */
  | { readonly statut: 'confirmation' }
  | { readonly statut: 'deja-inscrit' }
  | { readonly statut: 'refus'; readonly motif: string };

/**
 * `POST /auth/v1/signup`.
 *
 * Une adresse déjà inscrite ne se dit pas toujours par une erreur : quand le
 * projet demande une confirmation, Supabase répond par un utilisateur factice,
 * sans identité, pour ne pas révéler qui est inscrit. On le reconnaît à sa
 * liste d'identités vide — et l'écran propose de se connecter.
 */
export async function creerCompte(
  config: ConfigSupabase, email: string, motDePasse: string,
  stockage: StockageLocal, retour: string = adresseDeRetour()
): Promise<IssueInscription> {
  const verifieur = genererVerifieur();
  const { defi, methode } = await defiPkce(verifieur);
  ecrireLienEnAttente(stockage, { verifieur, motif: 'inscription' });
  const r = await appeler(config, `/auth/v1/signup?redirect_to=${encodeURIComponent(retour)}`, {
    method: 'POST',
    body: JSON.stringify({ email, password: motDePasse, code_challenge: defi, code_challenge_method: methode })
  });
  if (r.statut === 'erreur') {
    ecrireLienEnAttente(stockage, null);
    if (r.codeErreur === 'user_already_exists' || r.codeErreur === 'email_exists') return { statut: 'deja-inscrit' };
    return { statut: 'refus', motif: motifRefus(r, 'inscription') };
  }
  const o = objet(r.valeur);
  if (typeof o['access_token'] === 'string') {
    ecrireLienEnAttente(stockage, null);
    const s = sessionDepuis(o);
    return s.statut === 'ok'
      ? { statut: 'connecte', session: s.valeur }
      : { statut: 'refus', motif: 'Réponse d’inscription inattendue.' };
  }
  const identites = objet(o['user'] ?? o)['identities'];
  if (Array.isArray(identites) && identites.length === 0) {
    ecrireLienEnAttente(stockage, null);
    return { statut: 'deja-inscrit' };
  }
  return { statut: 'confirmation' };
}

/* ── Mot de passe oublié ───────────────────────────────────────────────── */

/**
 * `POST /auth/v1/recover`. Le projet répond de la même façon que l'adresse
 * soit inscrite ou non — c'est voulu, pour ne pas révéler qui l'est — et
 * l'écran le dit ainsi : « si un compte existe… ».
 */
export async function demanderLienDeReinitialisation(
  config: ConfigSupabase, email: string, stockage: StockageLocal, retour: string = adresseDeRetour()
): Promise<{ readonly statut: 'envoye' } | { readonly statut: 'refus'; readonly motif: string }> {
  const verifieur = genererVerifieur();
  const { defi, methode } = await defiPkce(verifieur);
  ecrireLienEnAttente(stockage, { verifieur, motif: 'recuperation' });
  const r = await appeler(config, `/auth/v1/recover?redirect_to=${encodeURIComponent(retour)}`, {
    method: 'POST',
    body: JSON.stringify({ email, code_challenge: defi, code_challenge_method: methode })
  });
  if (r.statut === 'erreur') {
    ecrireLienEnAttente(stockage, null);
    return { statut: 'refus', motif: motifRefus(r, 'lien') };
  }
  return { statut: 'envoye' };
}

/* ── Le retour du lien ─────────────────────────────────────────────────── */

export type RetourLu = { readonly code: string } | { readonly erreur: string };

/**
 * Ce que l'adresse de retour apporte. Le code a la forme d'un identifiant, ou
 * il n'est pas pris ; une erreur ne garde que son CODE (`otp_expired`) — sa
 * description vient du réseau, et ne s'affiche pas.
 */
export function lireRetour(p: URLSearchParams): RetourLu {
  const code = p.get('code');
  if (code !== null && !p.has('error') && !p.has('error_code') && /^[A-Za-z0-9-]{8,128}$/.test(code)) {
    return { code };
  }
  const e = p.get('error_code') ?? p.get('error') ?? '';
  return { erreur: /^[a-z0-9_]{1,64}$/.test(e) ? e : 'illisible' };
}

/** La phrase d'un lien revenu en erreur. */
export function motifDuRetour(erreur: string): string {
  return erreur === 'otp_expired'
    ? 'Ce lien a expiré, ou a déjà servi : redemande-le.'
    : 'Ce lien n’a pas pu servir : redemande-le.';
}

export const MOTIF_AUTRE_NAVIGATEUR =
  'Ce lien a été ouvert dans un autre navigateur que celui où tu l’as demandé : il ne peut pas '
  + 'te connecter ici. Si c’était la confirmation de ton inscription, ton adresse est confirmée — '
  + 'connecte-toi. Si c’était pour changer de mot de passe, redemande le lien depuis ce navigateur-ci.';

export type IssueRetour =
  | { readonly statut: 'session'; readonly session: Session; readonly motif: MotifLien }
  /** `reessayable` : le projet n'a pas répondu, le même code peut encore servir. */
  | { readonly statut: 'refus'; readonly motif: string; readonly reessayable: boolean };

/** `POST /auth/v1/token?grant_type=pkce` : le code du lien, plus le secret gardé ici. */
export async function echangerCode(
  config: ConfigSupabase, code: string, stockage: StockageLocal
): Promise<IssueRetour> {
  const lien = lireLienEnAttente(stockage);
  if (lien === null) return { statut: 'refus', motif: MOTIF_AUTRE_NAVIGATEUR, reessayable: false };
  const r = await appeler(config, '/auth/v1/token?grant_type=pkce', {
    method: 'POST',
    body: JSON.stringify({ auth_code: code, code_verifier: lien.verifieur })
  });
  if (r.statut === 'erreur') {
    const reessayable = r.panne !== undefined || (r.code !== undefined && r.code >= 500);
    // Un code refusé ne reviendra pas : le secret qui l'accompagnait ne sert plus.
    if (!reessayable) ecrireLienEnAttente(stockage, null);
    return {
      statut: 'refus',
      reessayable,
      motif: reessayable ? motifRefus(r, 'lien') : 'Ce lien ne vaut plus : il a expiré, ou a déjà servi. Redemande-le.'
    };
  }
  ecrireLienEnAttente(stockage, null);
  const s = sessionDepuis(r.valeur);
  return s.statut === 'ok'
    ? { statut: 'session', session: s.valeur, motif: lien.motif }
    : { statut: 'refus', motif: 'Réponse inattendue du projet : redemande le lien.', reessayable: false };
}

/** `PUT /auth/v1/user` : le nouveau mot de passe, avec la session ouverte par le lien. */
export async function changerMotDePasse(
  config: ConfigSupabase, session: Session, motDePasse: string
): Promise<{ readonly statut: 'ok' } | { readonly statut: 'refus'; readonly motif: string }> {
  const r = await appeler(config, '/auth/v1/user', {
    method: 'PUT', jeton: session.jeton, body: JSON.stringify({ password: motDePasse })
  });
  return r.statut === 'erreur' ? { statut: 'refus', motif: motifRefus(r, 'mot-de-passe') } : { statut: 'ok' };
}
