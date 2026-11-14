-- ═══════════════════════════════════════════════════════════════════════════
-- FREEL — table des faits de la nouvelle application
-- ═══════════════════════════════════════════════════════════════════════════
--
-- À exécuter une fois, dans l'éditeur SQL du projet Supabase.
--
-- ───────────────────────────────────────────────────────────────────────────
-- CE SCRIPT NE CHANGE PAS `user_data`, IL NE FAIT QUE LA PROTÉGER
-- ───────────────────────────────────────────────────────────────────────────
--
-- `user_data` est la table de l'ancienne application. Ses colonnes et ses
-- données restent telles quelles : tant que les deux versions coexistent,
-- l'ancienne doit continuer de fonctionner exactement comme avant. La
-- nouvelle la LIT pour reprendre les données, et n'y écrit jamais. La seule
-- chose que ce script y fait est d'y poser les règles d'accès (section
-- finale) : voir pourquoi là-bas.
--
-- ───────────────────────────────────────────────────────────────────────────
-- POURQUOI UN COMPTEUR `version`
-- ───────────────────────────────────────────────────────────────────────────
--
-- Deux appareils qui enregistrent le même compte s'écrasent l'un l'autre si
-- rien ne les en empêche : le second à écrire efface ce que le premier venait
-- d'ajouter, en silence. L'application n'écrit qu'avec un filtre
-- `version = <celle qu'elle a lue>`. Si la ligne a bougé entre-temps, zéro
-- ligne est modifiée, et l'écriture est refusée au lieu de passer.
--
-- La vérification est faite par le serveur en une seule opération. La faire
-- côté application — lire, comparer, écrire — laisserait entre la lecture et
-- l'écriture une fenêtre où l'autre appareil se glisse.

create table if not exists public.freel_faits (
  user_id uuid primary key references auth.users (id) on delete cascade,

  -- Compteur d'écritures. Incrémenté par l'application à chaque envoi.
  version bigint not null default 1,

  -- Numéro de schéma des faits. Permet à une version future de reconnaître
  -- un bloc ancien, et à une version ancienne de REFUSER un bloc récent
  -- plutôt que d'en effacer les champs qu'elle ne connaît pas.
  schema integer not null,

  -- Les faits, tels que l'application les conserve localement. Uniquement des
  -- faits : rien de dérivé n'est enregistré, ici pas plus qu'ailleurs.
  faits jsonb not null,

  -- Horloge de l'appareil qui a écrit. Affichée à l'utilisateur, jamais
  -- utilisée pour arbitrer un conflit : des horloges qui divergent
  -- désigneraient le mauvais gagnant.
  maj_le timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- ACCÈS
-- ───────────────────────────────────────────────────────────────────────────
--
-- La clé « anon » de l'application est publique par conception. Ce qui
-- protège les données, ce sont ces règles : sans elles, la clé publique
-- donnerait accès à tout.
--
-- `to authenticated` (lot 57) : une règle sans rôle s'évaluait aussi pour le
-- rôle anonyme. Elle ne lui rendait rien — `auth.uid()` y vaut nul —, mais
-- la protection reposait alors sur ce seul nul. Nommer le rôle la ferme
-- avant même la comparaison. `(select auth.uid())` : la fonction est évaluée
-- une fois par requête, et non une fois par ligne.
--
-- SUPPRIMER LES SIENS — le droit à l'effacement (lot 25). L'application
-- efface depuis l'écran Compte, confirmé sur place, et PROUVE l'effacement en
-- relisant : sans cette règle, la suppression ne fait rien (la ligne est
-- filtrée, le serveur répond « succès »), l'application le détecte et renvoie
-- ici. L'identifiant de connexion, lui, ne se supprime que depuis le tableau
-- de bord (Authentication, puis Users).

alter table public.freel_faits enable row level security;

drop policy if exists "freel_faits — lire les siens" on public.freel_faits;
create policy "freel_faits — lire les siens"
  on public.freel_faits for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "freel_faits — créer les siens" on public.freel_faits;
create policy "freel_faits — créer les siens"
  on public.freel_faits for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "freel_faits — modifier les siens" on public.freel_faits;
create policy "freel_faits — modifier les siens"
  on public.freel_faits for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "freel_faits — supprimer les siens" on public.freel_faits;
create policy "freel_faits — supprimer les siens"
  on public.freel_faits for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- `user_data` — LA TABLE DE L'ANCIENNE APPLICATION
-- ───────────────────────────────────────────────────────────────────────────
--
-- La clé « anon » figure dans le code de toute page servie. Si `user_data`
-- n'a pas de règles d'accès, cette clé publique suffit à lire les finances de
-- CHAQUE compte. L'ancienne application documentait ces règles dans son code,
-- mais rien ne dit qu'elles ont été appliquées ; la nouvelle relit cette table,
-- elle ne peut donc pas se contenter de le supposer.
--
-- Ce bloc ne change ni colonne ni donnée. Il est idempotent, et c'est la règle
-- que l'ancienne application documentait : elle continue de fonctionner.

alter table public.user_data enable row level security;

drop policy if exists "user_data — chacun les siens" on public.user_data;
create policy "user_data — chacun les siens"
  on public.user_data for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- MÉMOIRE DU COMPTE (lot 57)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Le compte tenait une ligne, remplacée à chaque envoi : un appareil resté
-- sur un état ancien qui enregistrait « par-dessus » effaçait le dossier tenu
-- ailleurs, sans retour possible. Les sauvegardes de l'offre gratuite ne se
-- téléchargent pas. Trois protections, toutes tenues par le SERVEUR, qui voit
-- passer chaque écriture quelle que soit la version de l'appareil :
--
-- 1. TAILLE BORNÉE — 4 000 000 octets de texte JSON. Le plan disait « dix
--    fois le jeu d'essai » (185 Ko) ; mesuré élément par élément, un compte
--    chargé (40 opérations bancaires par mois, 150 dépenses et 24 factures
--    par an) pèse déjà ≈ 150 Ko PAR AN. Dix ans font ≈ 1,5 Mo : la borne est
--    à plus du double. Elle arrête ce qui n'est plus un dossier.
--
-- 2. VERSION n PUIS n + 1 — l'application écrit déjà ainsi (filtre sur la
--    version lue, envoi de la suivante). Le serveur le garantit désormais :
--    une écriture qui fait reculer le compteur, ou le saute, est refusée.
--    Sans cela, un client fautif pouvait remettre la version à 1 et faire
--    passer un appareil en retard pour à jour.
--
-- 3. ÉTATS PRÉCÉDENTS — à chaque remplacement, l'état d'avant (faits,
--    version, schéma, heure de l'appareil) est copié dans
--    `freel_faits_historique`, daté par l'heure du serveur. Vingt par compte,
--    les plus anciens partent. Lisibles et effaçables par leur seul
--    propriétaire ; personne ne peut en écrire ni en modifier — seul le
--    déclencheur y insère, avec les droits du propriétaire de la base
--    (`security definer`, chemin de recherche vide).
--
-- Une suppression n'archive pas : c'est le droit à l'effacement, et
-- l'application efface aussi les états précédents, relecture à l'appui. La
-- limite est dite à l'écran : ceci protège d'un écrasement par erreur, pas
-- d'une session volée qui efface tout — les appareils gardent leur copie.
--
-- Idempotent : se ré-exécute sans rien perdre.

alter table public.freel_faits drop constraint if exists "freel_faits — taille bornée";
alter table public.freel_faits add constraint "freel_faits — taille bornée"
  check (octet_length(faits::text) <= 4000000);

create or replace function public.freel_faits_controler_version()
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

drop trigger if exists "freel_faits — version n puis n + 1" on public.freel_faits;
create trigger "freel_faits — version n puis n + 1"
  before insert or update on public.freel_faits
  for each row execute function public.freel_faits_controler_version();

create table if not exists public.freel_faits_historique (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  version bigint not null,
  schema integer not null,
  faits jsonb not null,
  maj_le timestamptz not null,
  remplace_le timestamptz not null default now()
);

create index if not exists freel_faits_historique_compte on public.freel_faits_historique (user_id, id desc);

alter table public.freel_faits_historique enable row level security;
revoke insert, update on public.freel_faits_historique from anon, authenticated;

drop policy if exists "freel_faits_historique — lire les siens" on public.freel_faits_historique;
create policy "freel_faits_historique — lire les siens"
  on public.freel_faits_historique for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "freel_faits_historique — effacer les siens" on public.freel_faits_historique;
create policy "freel_faits_historique — effacer les siens"
  on public.freel_faits_historique for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.freel_faits_archiver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.freel_faits_historique (user_id, version, schema, faits, maj_le)
  values (old.user_id, old.version, old.schema, old.faits, old.maj_le);
  delete from public.freel_faits_historique
  where user_id = old.user_id
    and id not in (
      select id from public.freel_faits_historique
      where user_id = old.user_id
      order by id desc
      limit 20
    );
  return new;
end;
$$;

revoke execute on function public.freel_faits_archiver() from public, anon, authenticated;

drop trigger if exists "freel_faits — garder l’état d’avant" on public.freel_faits;
create trigger "freel_faits — garder l’état d’avant"
  after update on public.freel_faits
  for each row execute function public.freel_faits_archiver();
