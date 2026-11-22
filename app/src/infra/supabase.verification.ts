/**
 * « Vérifier » — chaque maillon d'un projet, et lequel casse.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE LISTE DE CONSTATS, ET PAS UN MESSAGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le propriétaire n'a pas pu relier son compte le 21/11 : l'écran rendait une
 * erreur à la connexion, la même que l'adresse soit fausse, la clé mal
 * recopiée, la base pas préparée ou le projet en pause. Chaque cause a son
 * geste, et un message générique n'en désigne aucun. La vérification interroge
 * donc les maillons dans l'ordre où ils dépendent l'un de l'autre, et rend un
 * constat par maillon : ✓, ✗ avec le geste qui répare, ou « en attente » quand
 * le maillon d'avant n'a pas tenu — on ne dit pas « base absente » d'un projet
 * qu'on n'a pas pu joindre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CORPS DES RÉPONSES EST HOSTILE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une adresse saisie à la main peut désigner n'importe quel serveur. On en lit
 * des codes HTTP et des booléens ; aucun texte venu du réseau n'est affiché.
 * Les phrases de ce module sont les nôtres.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ON CONSTATE, ON NE SUPPOSE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le script SQL est exécuté par l'utilisateur, dans son projet : l'application
 * ne sait pas s'il a tourné, ni s'il a tourné en entier. Les tables se
 * constatent par une requête qui compte sans lire (la sonde d'accès), les
 * inscriptions par le réglage que le projet publie. Un « Success » de l'éditeur
 * SQL ne prouve rien ; une relecture, si.
 */
import { appeler, type ConfigSupabase, type Resultat } from './supabase';
import { sonderAccesAnonyme, type VerdictAcces, type VerdictTable } from './supabase.acces';

/** Ce que le projet publie de ses réglages d'authentification. */
export interface ReglagesAuth {
  /**
   * `disable_signup`. `null` quand la réponse ne le dit pas en booléen : un
   * champ absent n'est ni « ouvert » ni « fermé », et le lire comme l'un des
   * deux ferait mentir la santé du projet.
   */
  readonly inscriptionsFermees: boolean | null;
  /**
   * `mailer_autoconfirm` : vrai quand le projet ne demande pas de confirmer
   * l'adresse à l'inscription. Seulement indicatif : l'inscription dit
   * elle-même, par sa réponse, si une confirmation est partie.
   */
  readonly confirmationAutomatique: boolean | null;
}

const booleen = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/**
 * `GET /auth/v1/settings`, avec la clé publique.
 *
 * C'est l'appel le plus léger qui exige la clé : la passerelle de Supabase le
 * refuse (401) quand la clé n'est pas celle du projet. Il dit donc à la fois
 * « le projet répond » et « la clé est la bonne », et porte en prime l'état des
 * inscriptions.
 */
export async function lireReglagesAuth(config: ConfigSupabase): Promise<Resultat<ReglagesAuth>> {
  const r = await appeler(config, '/auth/v1/settings');
  if (r.statut === 'erreur') return r;
  const o = typeof r.valeur === 'object' && r.valeur !== null && !Array.isArray(r.valeur)
    ? r.valeur as Record<string, unknown> : {};
  return {
    statut: 'ok',
    valeur: {
      inscriptionsFermees: booleen(o['disable_signup']),
      confirmationAutomatique: booleen(o['mailer_autoconfirm'])
    }
  };
}

/**
 * La clé collée est-elle une clé de SERVICE ?
 *
 * Le tableau de bord montre la clé `anon` et la clé `service_role` l'une sous
 * l'autre, aussi longues l'une que l'autre. La seconde ignore toutes les
 * règles d'accès : conservée dans ce navigateur et envoyée à chaque requête,
 * elle ferait de cette page un passe-partout du projet. On la reconnaît sans
 * l'envoyer nulle part — au rôle inscrit dans le jeton, ou au préfixe des
 * nouvelles clés secrètes — et elle n'est jamais enregistrée.
 */
export function estCleDeService(cle: string): boolean {
  const c = cle.trim();
  if (c.startsWith('sb_secret_')) return true;
  const morceaux = c.split('.');
  if (morceaux.length !== 3) return false;
  try {
    const base64 = (morceaux[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const charge = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as unknown;
    return typeof charge === 'object' && charge !== null
      && (charge as Record<string, unknown>)['role'] === 'service_role';
  } catch {
    return false;
  }
}

/** Ce que la vérification a constaté, avant toute mise en phrase. */
export interface VerificationProjet {
  /** `null` quand rien n'a été demandé au projet (clé de service refusée d'avance). */
  readonly reglages: Resultat<ReglagesAuth> | null;
  /** `null` tant que le projet et la clé n'ont pas tenu : sonder avant serait sonder dans le vide. */
  readonly acces: VerdictAcces | null;
  readonly cleDeService: boolean;
  /** Horodatage ISO de la vérification. */
  readonly le: string;
}

export interface OptionsVerification {
  readonly sonder?: typeof sonderAccesAnonyme;
  readonly maintenant?: Date;
}

/**
 * Vérifie le projet maillon par maillon : réglages (projet joignable, clé
 * acceptée, inscriptions), puis tables et règles d'accès par la sonde — qui
 * compte ce qu'un inconnu lit, sans rien lire.
 */
export async function verifierProjet(
  config: ConfigSupabase,
  { sonder = sonderAccesAnonyme, maintenant = new Date() }: OptionsVerification = {}
): Promise<VerificationProjet> {
  const le = maintenant.toISOString();
  if (estCleDeService(config.cleAnon)) return { reglages: null, acces: null, cleDeService: true, le };
  const reglages = await lireReglagesAuth(config);
  const acces = reglages.statut === 'ok' ? await sonder(config, maintenant) : null;
  return { reglages, acces, cleDeService: false, le };
}

/* ── Les constats ──────────────────────────────────────────────────────── */

export type Maillon = 'joignable' | 'cle' | 'base' | 'acces' | 'inscriptions';

/**
 * `inconnu` n'est pas `ko` : « on n'a pas pu le dire » n'accuse rien, mais ne
 * vaut jamais ✓ non plus — un vert sur ce qu'on n'a pas vérifié serait pire
 * que pas de verdict.
 */
export type StatutConstat = 'ok' | 'ko' | 'inconnu' | 'attente';

export interface Constat {
  readonly maillon: Maillon;
  readonly statut: StatutConstat;
  readonly libelle: string;
  /** Le geste qui répare, ou pourquoi on attend. */
  readonly detail: string | null;
}

const FORME_ADRESSE = 'L’adresse doit être de la forme https://identifiant.supabase.co.';

function constatJoignable(v: VerificationProjet): Constat {
  const c = (statut: StatutConstat, libelle: string, detail: string | null = null): Constat =>
    ({ maillon: 'joignable', statut, libelle, detail });
  const r = v.reglages;
  if (r === null) return c('attente', 'Projet', 'vérifié une fois la bonne clé collée');
  if (r.statut === 'ok') return c('ok', 'Projet joignable');
  if (r.panne === 'delai' || (r.code !== undefined && r.code >= 500)) {
    return c('ko', 'Le projet ne répond pas', 'S’il est en pause, rouvre-le depuis supabase.com, puis vérifie à nouveau.');
  }
  // Ni réponse ni code : l'adresse a été refusée avant tout envoi (`http:`),
  // et le motif est le nôtre, pas celui d'un serveur.
  if (r.panne === undefined && r.code === undefined) return c('ko', 'Adresse refusée', r.motif);
  if (r.code === 401 || r.code === 403) return c('ok', 'Projet joignable');
  // Pas de réponse, ou une réponse qui n'est pas celle d'un projet Supabase
  // (une page d'accueil, une 404) : l'adresse est en cause.
  return c('ko', 'Projet injoignable', FORME_ADRESSE);
}

function constatCle(v: VerificationProjet, joignable: Constat): Constat {
  const c = (statut: StatutConstat, libelle: string, detail: string | null = null): Constat =>
    ({ maillon: 'cle', statut, libelle, detail });
  if (v.cleDeService) {
    return c('ko', 'C’est la clé service_role',
      'Elle ouvre tout le projet et n’a rien à faire dans une page : prends la clé publique anon, la longue qui commence par eyJ.');
  }
  const r = v.reglages;
  if (r !== null && r.statut === 'erreur' && (r.code === 401 || r.code === 403)) {
    return c('ko', 'Clé refusée', 'Prends la clé publique anon, la longue qui commence par eyJ.');
  }
  if (joignable.statut !== 'ok') return c('attente', 'Clé publique', 'vérifiée une fois le projet joint');
  return c('ok', 'Clé acceptée');
}

/**
 * La base : les deux tables de cette version. Une seule des deux, c'est un
 * script d'avant le lot 57 — la mémoire du compte manque, et le réexécuter
 * l'ajoute sans rien perdre (il est idempotent).
 */
function constatBase(v: VerificationProjet, cle: Constat): Constat {
  const c = (statut: StatutConstat, libelle: string, detail: string | null = null): Constat =>
    ({ maillon: 'base', statut, libelle, detail });
  if (cle.statut !== 'ok' || v.acces === null) return c('attente', 'Base', 'vérifiée une fois la clé acceptée');
  const { faits, historique } = v.acces;
  const absentes = [faits, historique].filter((t) => t.statut === 'absente').length;
  if (absentes === 2) {
    return c('ko', 'Base pas encore préparée',
      'La table de tes données manque. Refais l’étape 2 : colle le script entier, puis Run.');
  }
  if (absentes === 1) {
    return c('ko', 'Base d’une version précédente', 'Réexécute le script de l’étape 2 : il ne perd rien.');
  }
  const doute = [faits, historique].find((t): t is Extract<VerdictTable, { statut: 'inconnu' }> => t.statut === 'inconnu');
  if (doute !== undefined) return c('inconnu', 'Base non vérifiée', doute.motif);
  return c('ok', 'Base préparée');
}

/**
 * Ce qu'un inconnu lit. La table de l'ancienne application compte aussi : elle
 * porte les mêmes finances, et l'absence de cette table (projet neuf) n'expose
 * rien.
 */
function constatAcces(v: VerificationProjet, base: Constat): Constat {
  const c = (statut: StatutConstat, libelle: string, detail: string | null = null): Constat =>
    ({ maillon: 'acces', statut, libelle, detail });
  if (base.statut !== 'ok' || v.acces === null) return c('attente', 'Règles d’accès', 'vérifiées une fois la base prête');
  const tables = [v.acces.faits, v.acces.historique, v.acces.legacy];
  const exposees = tables.reduce((n, t) => n + (t.statut === 'exposee' ? t.lignes : 0), 0);
  if (tables.some((t) => t.statut === 'exposee')) {
    return c('ko', 'Un inconnu peut lire tes données',
      `${exposees} ligne(s) se lisent sans connexion : applique le SQL proposé ci-dessous.`);
  }
  const doute = tables.find((t): t is Extract<VerdictTable, { statut: 'inconnu' }> => t.statut === 'inconnu');
  if (doute !== undefined) return c('inconnu', 'Règles d’accès non vérifiées', doute.motif);
  return c('ok', 'Un inconnu ne lit rien');
}

function constatInscriptions(v: VerificationProjet): Constat {
  const c = (statut: StatutConstat, libelle: string, detail: string | null = null): Constat =>
    ({ maillon: 'inscriptions', statut, libelle, detail });
  const r = v.reglages;
  if (r === null || r.statut === 'erreur') return c('attente', 'Inscriptions', 'vérifiées une fois le projet joint');
  if (r.valeur.inscriptionsFermees === true) return c('ok', 'Inscriptions fermées');
  if (r.valeur.inscriptionsFermees === false) {
    return c('ko', 'Inscriptions encore ouvertes',
      'Dans ton projet, Authentication › Sign In / Providers : décoche « Allow new users to sign up ».');
  }
  return c('inconnu', 'Inscriptions non vérifiées', 'Le projet ne dit pas si elles sont fermées.');
}

/** Les constats demandés, dans l'ordre où les maillons dépendent l'un de l'autre. */
export function constatsDuProjet(v: VerificationProjet, maillons: readonly Maillon[]): readonly Constat[] {
  const joignable = constatJoignable(v);
  const cle = constatCle(v, joignable);
  const base = constatBase(v, cle);
  const tous: Readonly<Record<Maillon, Constat>> = {
    joignable, cle, base, acces: constatAcces(v, base), inscriptions: constatInscriptions(v)
  };
  return maillons.map((m) => tous[m]);
}

/**
 * Le projet et la clé tiennent : la configuration peut être enregistrée.
 * Une base absente n'empêche pas de la garder — elle se prépare ensuite, et
 * la santé du projet le dira.
 */
export function projetJoint(v: VerificationProjet): boolean {
  const [, cle] = constatsDuProjet(v, ['joignable', 'cle']);
  return cle?.statut === 'ok';
}

/**
 * Le projet peut recevoir des données : base préparée, et rien d'exposé.
 * Une règle d'accès non vérifiée ne bloque pas — elle se dit ; une table
 * exposée, si : on n'y envoie pas un dossier comptable.
 */
export function projetPret(v: VerificationProjet): boolean {
  const [base, acces] = constatsDuProjet(v, ['base', 'acces']);
  return base?.statut === 'ok' && acces?.statut !== 'ko';
}
