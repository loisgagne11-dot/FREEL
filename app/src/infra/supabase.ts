/**
 * Client Supabase — authentification et lecture des données du compte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN CLIENT ÉCRIT À LA MAIN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `@supabase/supabase-js` pèse environ 120 Ko une fois compressé — plus de la
 * moitié du budget « bibliothèques » du projet, pour un usage qui se réduit à
 * quatre appels HTTP. L'ancienne application chargeait la bibliothèque depuis
 * un CDN, avec la double conséquence d'un blocage au premier rendu et d'une
 * dépendance à un tiers pour ouvrir l'application.
 *
 * L'API REST de Supabase est directement utilisable : PostgREST pour les
 * données, GoTrue pour l'authentification. Ce module s'en tient là.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS DANS CE FICHIER, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ni URL de projet, ni clé. La clé « anon » est publique par conception — la
 * protection vient des règles RLS, pas de son secret — mais l'adresse d'un
 * projet n'a rien à faire dans un dépôt public : elle désigne le compte de
 * quelqu'un. Elle vient donc soit d'une variable de build, soit d'une saisie
 * de l'utilisateur, conservée sur son poste.
 *
 * Le mot de passe n'est jamais conservé : seuls les jetons le sont, et ils
 * expirent.
 */

/** Où se connecter. Ni l'un ni l'autre n'est écrit dans le code. */
export interface ConfigSupabase {
  readonly url: string;
  readonly cleAnon: string;
}

export interface Session {
  readonly jeton: string;
  readonly jetonRafraichissement: string;
  /** Horodatage d'expiration, en millisecondes. */
  readonly expireLe: number;
  readonly utilisateurId: string;
  readonly email: string;
}

export type Resultat<T> =
  | { readonly statut: 'ok'; readonly valeur: T }
  | {
    readonly statut: 'erreur';
    readonly motif: string;
    /**
     * Code HTTP, absent quand aucune réponse n'est parvenue.
     *
     * Le message ne suffit pas à décider : un 409 sur l'écriture signifie
     * « la ligne existe déjà », ce qui n'est pas une panne mais un conflit à
     * traiter. Distinguer les deux sur le texte du message serait fragile.
     */
    readonly code?: number;
  };

/** Clé de conservation de la session. Distincte de celle des faits. */
export const CLE_SESSION = 'freel.session.supabase.v1' as const;
/** Clé de conservation de la configuration de connexion. */
export const CLE_CONFIG = 'freel.config.supabase.v1' as const;

/**
 * La configuration de build, si elle existe.
 *
 * Permet de déployer une instance déjà reliée sans que l'adresse traverse le
 * dépôt : elle est injectée à la compilation.
 */
export function configDeBuild(): ConfigSupabase | null {
  const url = import.meta.env['VITE_SUPABASE_URL'];
  const cle = import.meta.env['VITE_SUPABASE_ANON_KEY'];
  return typeof url === 'string' && url !== '' && typeof cle === 'string' && cle !== ''
    ? { url: url.replace(/\/+$/, ''), cleAnon: cle }
    : null;
}

/* ── Appels ────────────────────────────────────────────────────────────── */

async function appeler(
  config: ConfigSupabase,
  chemin: string,
  options: RequestInit & { readonly jeton?: string } = {}
): Promise<Resultat<unknown>> {
  const { jeton, ...reste } = options;
  try {
    const reponse = await fetch(`${config.url}${chemin}`, {
      ...reste,
      headers: {
        apikey: config.cleAnon,
        Authorization: `Bearer ${jeton ?? config.cleAnon}`,
        'Content-Type': 'application/json',
        ...(reste.headers ?? {})
      }
    });

    const texte = await reponse.text();
    const corps: unknown = texte === '' ? null : JSON.parse(texte);

    if (!reponse.ok) {
      return { statut: 'erreur', motif: messageDErreur(reponse.status, corps), code: reponse.status };
    }
    return { statut: 'ok', valeur: corps };
  } catch {
    // Une panne réseau et un refus du serveur n'appellent pas la même
    // réaction : l'un se réessaie, l'autre demande une correction.
    return {
      statut: 'erreur',
      motif: 'Le serveur est injoignable. Vérifiez votre connexion, puis réessayez.'
    };
  }
}

/**
 * Un message que l'utilisateur puisse comprendre.
 *
 * Les messages de GoTrue sont en anglais et techniques : « Invalid login
 * credentials » n'aide pas à savoir s'il faut corriger l'adresse ou le mot de
 * passe. On traduit les cas courants et on laisse passer le reste, plutôt que
 * d'afficher « Une erreur est survenue » qui n'apprend rien.
 */
function messageDErreur(code: number, corps: unknown): string {
  const brut = typeof corps === 'object' && corps !== null
    ? String(
      (corps as Record<string, unknown>)['error_description']
      ?? (corps as Record<string, unknown>)['msg']
      ?? (corps as Record<string, unknown>)['message']
      ?? (corps as Record<string, unknown>)['error']
      ?? ''
    )
    : '';

  if (code === 400 && /invalid login credentials/i.test(brut)) {
    return 'Adresse ou mot de passe incorrect.';
  }
  if (code === 400 && /email not confirmed/i.test(brut)) {
    return 'Adresse non confirmée : ouvrez le courriel de confirmation reçu à l’inscription.';
  }
  if (code === 401 || code === 403) {
    return 'Accès refusé. La session a peut-être expiré : reconnectez-vous.';
  }
  if (code === 404) {
    return 'Table introuvable côté serveur : la base n’est pas encore préparée pour '
      + 'cette version. Exécutez le script « docs/supabase.sql » dans l’éditeur SQL '
      + 'du projet, puis réessayez.';
  }
  if (code === 429) {
    return 'Trop de tentatives. Attendez une minute avant de réessayer.';
  }
  return brut !== '' ? brut : `Erreur ${code}.`;
}

function sessionDepuis(corps: unknown): Resultat<Session> {
  const o = (corps ?? {}) as Record<string, unknown>;
  const utilisateur = (o['user'] ?? {}) as Record<string, unknown>;
  const jeton = o['access_token'];
  const id = utilisateur['id'];

  if (typeof jeton !== 'string' || typeof id !== 'string') {
    return { statut: 'erreur', motif: 'Réponse d’authentification inattendue.' };
  }

  const duree = typeof o['expires_in'] === 'number' ? o['expires_in'] : 3600;
  return {
    statut: 'ok',
    valeur: {
      jeton,
      jetonRafraichissement: typeof o['refresh_token'] === 'string' ? o['refresh_token'] : '',
      expireLe: Date.now() + duree * 1000,
      utilisateurId: id,
      email: typeof utilisateur['email'] === 'string' ? utilisateur['email'] : ''
    }
  };
}

/** Connexion par adresse et mot de passe. */
export async function seConnecter(
  config: ConfigSupabase,
  email: string,
  motDePasse: string
): Promise<Resultat<Session>> {
  const r = await appeler(config, '/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password: motDePasse })
  });
  return r.statut === 'erreur' ? r : sessionDepuis(r.valeur);
}

/**
 * Renouvelle une session avant qu'elle expire.
 *
 * Sans cela, l'application se déconnecterait au bout d'une heure au milieu
 * d'une saisie, et l'utilisateur perdrait ce qu'il était en train de faire.
 */
export async function rafraichir(
  config: ConfigSupabase,
  session: Session
): Promise<Resultat<Session>> {
  if (session.jetonRafraichissement === '') {
    return { statut: 'erreur', motif: 'Aucun jeton de renouvellement.' };
  }
  const r = await appeler(config, '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: session.jetonRafraichissement })
  });
  return r.statut === 'erreur' ? r : sessionDepuis(r.valeur);
}

/** Une session encore valable, avec une marge pour l'appel en cours. */
export function sessionValide(session: Session, maintenant: number = Date.now()): boolean {
  const MARGE_MS = 60_000;
  return session.expireLe - MARGE_MS > maintenant;
}

export async function seDeconnecter(
  config: ConfigSupabase,
  session: Session
): Promise<void> {
  // L'échec est sans conséquence : la session locale est effacée de toute
  // façon, et le jeton expirera de lui-même.
  await appeler(config, '/auth/v1/logout', { method: 'POST', jeton: session.jeton });
}

/* ── Données ───────────────────────────────────────────────────────────── */

/** Table de l'ancienne application. Lue, jamais écrite. */
export const TABLE_LEGACY = 'user_data';

/**
 * Ce que l'ancienne application conservait, tel qu'elle le conservait.
 *
 * Ces colonnes portent la structure du bundle local d'origine. On les lit pour
 * reprendre les données du compte ; on n'écrit jamais dedans, pour que
 * l'ancienne version reste utilisable pendant toute la cohabitation.
 */
export interface DonneesLegacy {
  readonly company: unknown;
  readonly missions: unknown;
  readonly clients: unknown;
  readonly treasury: unknown;
  readonly ir_config: unknown;
  readonly updated_at: string | null;
}

/**
 * Charge les données de l'ancienne application depuis le compte.
 *
 * Rend `null` quand le compte existe mais n'a encore rien enregistré — ce qui
 * n'est pas une erreur, et ne doit pas s'afficher comme telle.
 */
export async function chargerDonneesLegacy(
  config: ConfigSupabase,
  session: Session
): Promise<Resultat<DonneesLegacy | null>> {
  const chemin = `/rest/v1/${TABLE_LEGACY}`
    + `?user_id=eq.${encodeURIComponent(session.utilisateurId)}`
    + '&select=updated_at,company,missions,clients,treasury,ir_config';

  const r = await appeler(config, chemin, { jeton: session.jeton });
  if (r.statut === 'erreur') return r;

  const lignes = Array.isArray(r.valeur) ? r.valeur : [];
  const premiere = lignes[0] as Record<string, unknown> | undefined;
  if (premiere === undefined) return { statut: 'ok', valeur: null };

  return {
    statut: 'ok',
    valeur: {
      company: premiere['company'],
      missions: premiere['missions'],
      clients: premiere['clients'],
      treasury: premiere['treasury'],
      ir_config: premiere['ir_config'],
      updated_at: typeof premiere['updated_at'] === 'string' ? premiere['updated_at'] : null
    }
  };
}

/**
 * Reconstitue le bundle attendu par le module de migration.
 *
 * Les données arrivent en colonnes séparées côté serveur et en un seul objet
 * côté local. Passer par la même conversion que la migration locale garantit
 * qu'une donnée venue du réseau et la même donnée venue du navigateur
 * produisent exactement les mêmes faits — sans quoi l'application dirait deux
 * choses différentes selon l'origine.
 */
export function bundleDepuisLegacy(donnees: DonneesLegacy): Record<string, unknown> {
  return {
    c: donnees.company,
    m: donnees.missions,
    cl: donnees.clients,
    t: donnees.treasury,
    ir: donnees.ir_config
  };
}

/* ── Faits de la nouvelle application ──────────────────────────────────── */

/**
 * Table de la nouvelle application.
 *
 * DISTINCTE de `user_data`, et ce n'est pas un détail d'organisation : tant
 * que les deux versions coexistent, écrire dans la table de l'ancienne
 * signifierait qu'un essai de la nouvelle peut abîmer des données comptables
 * dont l'ancienne se sert encore. Deux tables, deux vies, aucune interférence.
 *
 * Le script de création est dans `docs/supabase.sql`.
 */
export const TABLE_FAITS = 'freel_faits';

export interface InstantaneDistant {
  /** Le bloc de faits, non validé : c'est au schéma de dire s'il est lisible. */
  readonly faits: unknown;
  /**
   * Compteur d'écritures. Le garde-fou contre l'écrasement silencieux.
   *
   * Une écriture ne s'applique que si la version distante est encore celle
   * qu'on a lue. Sinon, quelqu'un a écrit entre-temps, et poursuivre
   * effacerait son travail sans que personne le voie.
   */
  readonly version: number;
  readonly schema: number;
  /**
   * Horloge de l'appareil qui a écrit. INDICATIF, affiché seulement.
   *
   * Ne sert jamais à arbitrer : deux appareils dont les horloges divergent
   * de quelques minutes désigneraient le mauvais gagnant. C'est le compteur
   * de version, et lui seul, qui tranche.
   */
  readonly majLe: string | null;
}

/**
 * L'issue d'une écriture.
 *
 * `conflit` n'est pas une erreur : rien n'est cassé, l'écriture a simplement
 * été refusée parce que le compte a bougé. Les confondre conduirait à
 * proposer « réessayez », qui écraserait justement ce qu'il fallait préserver.
 */
export type ResultatEcriture =
  | { readonly statut: 'ok'; readonly instantane: InstantaneDistant }
  | {
    readonly statut: 'conflit';
    /** L'état distant au moment du refus, ou `null` s'il n'a pas pu être relu. */
    readonly distant: InstantaneDistant | null;
  }
  | { readonly statut: 'erreur'; readonly motif: string };

function instantaneDepuis(ligne: Record<string, unknown>): InstantaneDistant {
  const version = ligne['version'];
  const schema = ligne['schema'];
  return {
    faits: ligne['faits'],
    // Une version illisible devient 0, qui ne correspondra à aucune ligne :
    // la prochaine écriture sera refusée plutôt que d'écraser à l'aveugle.
    version: typeof version === 'number' && Number.isFinite(version) ? version : 0,
    schema: typeof schema === 'number' && Number.isFinite(schema) ? schema : 0,
    majLe: typeof ligne['maj_le'] === 'string' ? ligne['maj_le'] : null
  };
}

function cheminDuCompte(session: Session): string {
  return `/rest/v1/${TABLE_FAITS}?user_id=eq.${encodeURIComponent(session.utilisateurId)}`;
}

/**
 * Lit les faits enregistrés sur le compte.
 *
 * Rend `null` quand le compte n'a encore rien : un compte neuf n'est pas une
 * erreur, et l'afficher comme telle découragerait la première écriture.
 */
export async function tirerFaits(
  config: ConfigSupabase,
  session: Session
): Promise<Resultat<InstantaneDistant | null>> {
  const r = await appeler(
    config,
    `${cheminDuCompte(session)}&select=version,schema,faits,maj_le`,
    { jeton: session.jeton }
  );
  if (r.statut === 'erreur') return r;

  const lignes = Array.isArray(r.valeur) ? r.valeur : [];
  const premiere = lignes[0] as Record<string, unknown> | undefined;
  return {
    statut: 'ok',
    valeur: premiere === undefined ? null : instantaneDepuis(premiere)
  };
}

/** Relit l'état distant après un refus, sans convertir un échec en erreur. */
async function relireApresRefus(
  config: ConfigSupabase,
  session: Session
): Promise<InstantaneDistant | null> {
  const r = await tirerFaits(config, session);
  return r.statut === 'ok' ? r.valeur : null;
}

/**
 * Enregistre les faits sur le compte, SANS jamais écraser à l'aveugle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE VERROU EST DANS LA REQUÊTE, PAS DANS L'APPLICATION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `versionAttendue` est celle lue au dernier échange. L'écriture porte le
 * filtre `version=eq.<attendue>` : c'est le SERVEUR qui vérifie, en une seule
 * opération atomique. Une vérification côté application — lire, comparer,
 * écrire — laisserait entre la lecture et l'écriture une fenêtre où l'autre
 * appareil se glisse. C'est exactement la perte qu'on cherche à empêcher.
 *
 * Aucune ligne modifiée signifie que la version distante a changé : refus.
 *
 * `versionAttendue` à `null` déclare une première écriture. Si une ligne
 * existe déjà, le serveur rejette l'insertion (clé primaire) : là encore un
 * conflit, pas une erreur — le compte contient quelque chose qu'on croyait
 * absent, et l'utilisateur doit voir quoi avant de décider.
 */
export async function pousserFaits(
  config: ConfigSupabase,
  session: Session,
  faits: unknown,
  schema: number,
  versionAttendue: number | null
): Promise<ResultatEcriture> {
  const commun = {
    faits,
    schema,
    // Horloge du poste : affichée, jamais utilisée pour arbitrer.
    maj_le: new Date().toISOString()
  };
  const entete = { Prefer: 'return=representation' };

  const r = versionAttendue === null
    ? await appeler(config, `/rest/v1/${TABLE_FAITS}`, {
      method: 'POST',
      jeton: session.jeton,
      headers: entete,
      body: JSON.stringify({ ...commun, user_id: session.utilisateurId, version: 1 })
    })
    : await appeler(config, `${cheminDuCompte(session)}&version=eq.${versionAttendue}`, {
      method: 'PATCH',
      jeton: session.jeton,
      headers: entete,
      body: JSON.stringify({ ...commun, version: versionAttendue + 1 })
    });

  if (r.statut === 'erreur') {
    // 409 : violation de clé primaire — la ligne existait déjà.
    if (r.code === 409) return { statut: 'conflit', distant: await relireApresRefus(config, session) };
    return { statut: 'erreur', motif: r.motif };
  }

  const lignes = Array.isArray(r.valeur) ? r.valeur : [];
  const ecrite = lignes[0] as Record<string, unknown> | undefined;
  if (ecrite === undefined) {
    return { statut: 'conflit', distant: await relireApresRefus(config, session) };
  }
  return { statut: 'ok', instantane: instantaneDepuis(ecrite) };
}

/* ── Conservation locale ───────────────────────────────────────────────── */

export interface StockageLocal {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
  removeItem(cle: string): void;
}

export function lireSession(stockage: StockageLocal): Session | null {
  try {
    const brut = stockage.getItem(CLE_SESSION);
    if (brut === null) return null;
    const o = JSON.parse(brut) as Record<string, unknown>;
    if (typeof o['jeton'] !== 'string' || typeof o['utilisateurId'] !== 'string') return null;
    return o as unknown as Session;
  } catch {
    return null;
  }
}

export function ecrireSession(stockage: StockageLocal, session: Session | null): void {
  try {
    if (session === null) stockage.removeItem(CLE_SESSION);
    else stockage.setItem(CLE_SESSION, JSON.stringify(session));
  } catch {
    // Stockage indisponible : la session vaudra pour l'onglet courant.
  }
}

export function lireConfig(stockage: StockageLocal): ConfigSupabase | null {
  try {
    const brut = stockage.getItem(CLE_CONFIG);
    if (brut === null) return null;
    const o = JSON.parse(brut) as Record<string, unknown>;
    return typeof o['url'] === 'string' && typeof o['cleAnon'] === 'string'
      ? { url: o['url'].replace(/\/+$/, ''), cleAnon: o['cleAnon'] }
      : null;
  } catch {
    return null;
  }
}

export function ecrireConfig(stockage: StockageLocal, config: ConfigSupabase | null): void {
  try {
    if (config === null) stockage.removeItem(CLE_CONFIG);
    else stockage.setItem(CLE_CONFIG, JSON.stringify(config));
  } catch {
    // Sans conservation, l'adresse sera à ressaisir à la prochaine ouverture.
  }
}

/** La configuration effective : celle du build, ou celle saisie sur le poste. */
export function configEffective(stockage: StockageLocal): ConfigSupabase | null {
  return configDeBuild() ?? lireConfig(stockage);
}
