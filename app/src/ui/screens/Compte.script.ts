/**
 * Le script qui prépare la base — `docs/supabase.sql`, lu au build.
 *
 * UNE SEULE SOURCE. Le guide le copie dans le presse-papiers ; une copie
 * recollée ici finirait par diverger du fichier que le dépôt documente et que
 * les tests relisent (`supabase.acces.test.ts`, `supabase.memoire.test.ts`) :
 * l'utilisateur préparerait alors une base que l'application ne reconnaît pas.
 *
 * Un module à part, chargé à la demande : le texte pèse une dizaine de Ko, et
 * ne sert qu'à l'étape 2.
 */
import script from '../../../../docs/supabase.sql?raw';

export const SCRIPT_SUPABASE: string = script;
