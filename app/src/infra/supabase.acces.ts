/**
 * Sonde d'accès anonyme — « qu'est-ce qu'un inconnu lit de ce projet ? »
 *
 * La clé « anon » figure dans le code de toute page servie : n'importe qui
 * peut l'extraire et interroger l'API du projet. Seules les règles d'accès
 * (RLS) empêchent alors de lire les finances de chaque compte. Cette sonde se
 * met à la place de cet inconnu : la clé publique SEULE, jamais le jeton de
 * session (avec lui, on lirait ses propres lignes et on conclurait à tort que
 * la table est ouverte — ou pire, on croirait vérifier ce que personne d'autre
 * ne voit).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ON COMPTE, ON NE LIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `HEAD` avec `Prefer: count=exact` : le serveur répond par le total dans
 * `Content-Range`, sans corps. Si la table est ouverte, la sonde ne télécharge
 * pas les finances d'autrui pour s'en apercevoir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE SONDE QUI ÉCHOUE NE PASSE JAMAIS POUR « PROTÉGÉE »
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le contre-exemple : une règle « pas de ligne lue → protégé » déclarerait
 * sûre une table que la sonde n'a simplement pas pu interroger (réseau
 * coupé, CSP, URL mal saisie, clé refusée, en-tête absent). L'utilisateur
 * lirait « protégée » alors que rien n'a été vérifié. Seul un total
 * explicitement lu à zéro, dans une réponse réussie, vaut « protégée » ; tout
 * le reste est « inconnu », avec la raison.
 */
import {
  DELAI_MAX_MS, TABLE_FAITS, TABLE_LEGACY, motifUrlRefusee, type ConfigSupabase
} from './supabase';

export type VerdictTable =
  | { readonly statut: 'protegee' }
  | { readonly statut: 'exposee'; readonly lignes: number }
  | { readonly statut: 'absente' }
  | { readonly statut: 'inconnu'; readonly motif: string };

export interface VerdictAcces {
  readonly faits: VerdictTable;
  readonly legacy: VerdictTable;
  /** Horodatage ISO de la vérification. */
  readonly le: string;
}

const inconnu = (motif: string): VerdictTable => ({ statut: 'inconnu', motif });

// Le total est ce qui suit la barre oblique de `Content-Range` (plage/total).
// Un total `*` (non compté) est illisible : on ne le prend pas pour zéro.
function totalDepuis(contentRange: string | null): number | null {
  if (contentRange === null) return null;
  const m = /\/(\d+)\s*$/.exec(contentRange);
  return m === null ? null : Number(m[1]);
}

async function sonderTable(config: ConfigSupabase, table: string): Promise<VerdictTable> {
  const refus = motifUrlRefusee(config.url);
  if (refus !== null) return inconnu(refus);

  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), DELAI_MAX_MS);
  try {
    const reponse = await fetch(`${config.url}/rest/v1/${table}?select=user_id`, {
      method: 'HEAD',
      signal: controle.signal,
      headers: {
        apikey: config.cleAnon,
        // La clé publique, jamais un jeton de session : voir l'en-tête du module.
        Authorization: `Bearer ${config.cleAnon}`,
        Prefer: 'count=exact',
        Range: '0-0'
      }
    });

    if (reponse.status === 404) return { statut: 'absente' };
    // Un refus ne dit pas lequel des deux : une clé publique erronée, ou une
    // table fermée aux anonymes par ses droits (ce qui la protège). Conclure
    // « protégée » sur un refus validerait aussi une clé mal recopiée.
    if (reponse.status === 401 || reponse.status === 403) {
      return inconnu(
        'Le projet refuse la requête anonyme : clé publique erronée, ou table fermée aux anonymes. Vérifie la clé ; si elle est juste, la table est protégée par ses droits.'
      );
    }
    // 416 : plage hors des lignes (table vide) — le total reste lisible.
    if (reponse.status !== 200 && reponse.status !== 206 && reponse.status !== 416) {
      return inconnu(`Le projet a répondu par une erreur (${reponse.status}).`);
    }

    const total = totalDepuis(reponse.headers.get('Content-Range'));
    if (total === null) {
      return inconnu('La réponse du projet ne dit pas combien de lignes se lisent.');
    }
    return total === 0 ? { statut: 'protegee' } : { statut: 'exposee', lignes: total };
  } catch {
    return inconnu(controle.signal.aborted
      ? 'Le projet met trop de temps à répondre.'
      : 'Le projet n’a pas répondu.');
  } finally {
    clearTimeout(minuteur);
  }
}

/** Ce que lit un inconnu, table par table, avec la seule clé publique. */
export async function sonderAccesAnonyme(
  config: ConfigSupabase,
  maintenant: Date = new Date()
): Promise<VerdictAcces> {
  const [faits, legacy] = await Promise.all([
    sonderTable(config, TABLE_FAITS),
    sonderTable(config, TABLE_LEGACY)
  ]);
  return { faits, legacy, le: maintenant.toISOString() };
}

/**
 * Les règles de `user_data`, mot pour mot celles de `docs/supabase.sql`
 * (un test compare). « Chacun les siens » est ce que l'ancienne application
 * documentait : elle continue donc de fonctionner.
 */
export function sqlProtectionLegacy(): string {
  return [
    `alter table public.${TABLE_LEGACY} enable row level security;`,
    '',
    `drop policy if exists "${TABLE_LEGACY} — chacun les siens" on public.${TABLE_LEGACY};`,
    `create policy "${TABLE_LEGACY} — chacun les siens"`,
    `  on public.${TABLE_LEGACY} for all`,
    '  using (auth.uid() = user_id)',
    '  with check (auth.uid() = user_id);'
  ].join('\n');
}

/** Les règles de `freel_faits`, identiques à la section ACCÈS de `docs/supabase.sql`. */
export function sqlProtectionFaits(): string {
  const t = TABLE_FAITS;
  return [
    `alter table public.${t} enable row level security;`,
    '',
    `drop policy if exists "${t} — lire les siens" on public.${t};`,
    `create policy "${t} — lire les siens"`,
    `  on public.${t} for select`,
    '  using (auth.uid() = user_id);',
    '',
    `drop policy if exists "${t} — créer les siens" on public.${t};`,
    `create policy "${t} — créer les siens"`,
    `  on public.${t} for insert`,
    '  with check (auth.uid() = user_id);',
    '',
    `drop policy if exists "${t} — modifier les siens" on public.${t};`,
    `create policy "${t} — modifier les siens"`,
    `  on public.${t} for update`,
    '  using (auth.uid() = user_id)',
    '  with check (auth.uid() = user_id);'
  ].join('\n');
}
