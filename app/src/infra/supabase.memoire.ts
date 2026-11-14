/**
 * La mémoire du compte : ses états précédents, côté serveur (lot 57, S5).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LE SERVEUR, ET NON L'APPLICATION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le compte tient une ligne, remplacée à chaque envoi. La copie gardée avant
 * un remplacement (lot 1) ne protège que l'appareil qui a agi : un téléphone
 * resté sur un état ancien qui enregistre « par-dessus », et le dossier tenu
 * sur l'ordinateur disparaît du compte sans laisser de trace nulle part où
 * l'ordinateur puisse la retrouver. Seul le serveur voit passer TOUS les
 * remplacements : un déclencheur y archive l'état d'avant, à chaque fois.
 * Une archive tenue par l'application dépendrait de la version de chaque
 * appareil, et un appareil ancien — celui qui écrase — ne la tiendrait pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle protège d'un écrasement par erreur. Pas d'un voleur de session : qui
 * peut tout effacer efface aussi les états précédents — c'est le droit à
 * l'effacement, et il ne se distingue pas d'un effacement malveillant. Les
 * appareils gardent alors leur copie. L'écran le dit.
 */
import {
  type ConfigSupabase, type InstantaneDistant, type Resultat, type Session,
  TABLE_FAITS, TABLE_HISTORIQUE, appeler, instantaneDepuis
} from './supabase';

/** Combien d'états précédents le serveur garde par compte. */
export const ETATS_GARDES = 20;

/**
 * La taille maximale d'un dossier, en octets de son texte JSON.
 *
 * Le plan disait « dix fois le jeu d'essai » : 185 Ko. Mesuré sur ce jeu,
 * élément par élément (une opération bancaire ≈ 200 octets, une dépense ≈
 * 260, une facture ≈ 360), un compte chargé — 40 opérations bancaires par
 * mois, 150 dépenses et 24 factures par an — pèse ≈ 150 Ko PAR AN. La borne
 * du plan aurait refusé sa synchronisation au bout d'un an, sans que rien ne
 * soit anormal. Dix ans d'une telle activité font ≈ 1,5 Mo ; la borne est
 * à plus du double. Ce qu'elle arrête : un envoi qui n'est plus un dossier
 * — une boucle, un fichier collé par erreur, un abus.
 */
export const TAILLE_MAX_FAITS = 4_000_000;

/** Un état précédent, SANS ses faits : la liste ne télécharge pas vingt dossiers. */
export interface EtatPrecedent {
  readonly id: number;
  /** Le compteur d'écritures qu'il portait. */
  readonly version: number;
  /** Le schéma de ses faits : un schéma postérieur à ce code se refuse. */
  readonly schema: number;
  /** Horloge de l'appareil qui l'avait écrit — indicatif. */
  readonly majLe: string | null;
  /** Heure du SERVEUR à laquelle il a été remplacé : c'est elle qui date la liste. */
  readonly remplaceLe: string;
}

/**
 * La liste, ou le constat que le SQL n'a pas été exécuté.
 *
 * `non-installe` n'est pas une erreur : la table n'existe pas encore. Le
 * confondre avec une panne ferait dire « réessaie » à quelqu'un qui doit
 * exécuter un script — et rien ne changerait jamais.
 */
export type ResultatListe =
  | Resultat<readonly EtatPrecedent[]>
  | { readonly statut: 'non-installe' };

const chemin = (session: Session): string =>
  `/rest/v1/${TABLE_HISTORIQUE}?user_id=eq.${encodeURIComponent(session.utilisateurId)}`;

function etatDepuis(ligne: Record<string, unknown>): EtatPrecedent | null {
  const { id, version, schema, maj_le: majLe, remplace_le: remplaceLe } = ligne;
  if (typeof id !== 'number' || typeof version !== 'number' || typeof schema !== 'number') return null;
  if (typeof remplaceLe !== 'string') return null;
  return { id, version, schema, majLe: typeof majLe === 'string' ? majLe : null, remplaceLe };
}

export async function listerEtatsPrecedents(
  config: ConfigSupabase, session: Session
): Promise<ResultatListe> {
  const r = await appeler(
    config,
    `${chemin(session)}&select=id,version,schema,maj_le,remplace_le&order=remplace_le.desc,id.desc`,
    { jeton: session.jeton }
  );
  if (r.statut === 'erreur') return r.code === 404 ? { statut: 'non-installe' } : r;
  const lignes = Array.isArray(r.valeur) ? r.valeur as Record<string, unknown>[] : [];
  // Une ligne illisible est écartée plutôt que de rendre toute la liste muette.
  return { statut: 'ok', valeur: lignes.map(etatDepuis).filter((e): e is EtatPrecedent => e !== null) };
}

/** Un état précédent AVEC ses faits, ou `null` s'il n'existe plus. */
export async function lireEtatPrecedent(
  config: ConfigSupabase, session: Session, id: number
): Promise<Resultat<InstantaneDistant | null>> {
  const r = await appeler(
    config, `${chemin(session)}&id=eq.${id}&select=version,schema,faits,maj_le`, { jeton: session.jeton }
  );
  if (r.statut === 'erreur') return r;
  const ligne = Array.isArray(r.valeur) ? r.valeur[0] as Record<string, unknown> | undefined : undefined;
  return { statut: 'ok', valeur: ligne === undefined ? null : instantaneDepuis(ligne) };
}

/**
 * La section « MÉMOIRE DU COMPTE » de `docs/supabase.sql`, mot pour mot (un
 * test compare). Proposée à copier quand l'écran constate qu'elle manque.
 */
export function sqlMemoireDuCompte(): string {
  const t = TABLE_FAITS;
  const h = TABLE_HISTORIQUE;
  return `alter table public.${t} drop constraint if exists "${t} — taille bornée";
alter table public.${t} add constraint "${t} — taille bornée"
  check (octet_length(faits::text) <= ${TAILLE_MAX_FAITS});

create or replace function public.${t}_controler_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.version <> 1 then
    raise exception 'freel : une première écriture porte la version 1, pas %', new.version
      using errcode = 'check_violation';
  elsif tg_op = 'UPDATE' and new.version <> old.version + 1 then
    raise exception 'freel : la version passe de % à %, pas à %', old.version, old.version + 1, new.version
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists "${t} — version n puis n + 1" on public.${t};
create trigger "${t} — version n puis n + 1"
  before insert or update on public.${t}
  for each row execute function public.${t}_controler_version();

create table if not exists public.${h} (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  version bigint not null,
  schema integer not null,
  faits jsonb not null,
  maj_le timestamptz not null,
  remplace_le timestamptz not null default now()
);

create index if not exists ${h}_compte on public.${h} (user_id, id desc);

alter table public.${h} enable row level security;
revoke insert, update on public.${h} from anon, authenticated;

drop policy if exists "${h} — lire les siens" on public.${h};
create policy "${h} — lire les siens"
  on public.${h} for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "${h} — effacer les siens" on public.${h};
create policy "${h} — effacer les siens"
  on public.${h} for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.${t}_archiver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.${h} (user_id, version, schema, faits, maj_le)
  values (old.user_id, old.version, old.schema, old.faits, old.maj_le);
  delete from public.${h}
  where user_id = old.user_id
    and id not in (
      select id from public.${h}
      where user_id = old.user_id
      order by id desc
      limit ${ETATS_GARDES}
    );
  return new;
end;
$$;

revoke execute on function public.${t}_archiver() from public, anon, authenticated;

drop trigger if exists "${t} — garder l’état d’avant" on public.${t};
create trigger "${t} — garder l’état d’avant"
  after update on public.${t}
  for each row execute function public.${t}_archiver();`;
}
