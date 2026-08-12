-- ═══════════════════════════════════════════════════════════════════════════
-- FREEL — table des faits de la nouvelle application
-- ═══════════════════════════════════════════════════════════════════════════
--
-- À exécuter une fois, dans l'éditeur SQL du projet Supabase.
--
-- ───────────────────────────────────────────────────────────────────────────
-- CE SCRIPT NE TOUCHE PAS À `user_data`
-- ───────────────────────────────────────────────────────────────────────────
--
-- `user_data` est la table de l'ancienne application. Elle reste telle
-- quelle : tant que les deux versions coexistent, l'ancienne doit continuer
-- de fonctionner exactement comme avant. La nouvelle la LIT pour reprendre
-- les données, et n'y écrit jamais.
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

alter table public.freel_faits enable row level security;

drop policy if exists "freel_faits — lire les siens" on public.freel_faits;
create policy "freel_faits — lire les siens"
  on public.freel_faits for select
  using (auth.uid() = user_id);

drop policy if exists "freel_faits — créer les siens" on public.freel_faits;
create policy "freel_faits — créer les siens"
  on public.freel_faits for insert
  with check (auth.uid() = user_id);

drop policy if exists "freel_faits — modifier les siens" on public.freel_faits;
create policy "freel_faits — modifier les siens"
  on public.freel_faits for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Aucune règle de SUPPRESSION, volontairement.
--
-- Rien dans l'application ne supprime les données comptables d'un compte, et
-- une règle qui l'autoriserait ne servirait qu'à rendre possible un accident.
-- L'effacement d'un compte se fait depuis le tableau de bord Supabase, où il
-- est un acte délibéré ; la cascade sur `auth.users` s'en charge alors.
