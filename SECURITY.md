# Signaler une faille

Si tu trouves une faille de sécurité dans FREEL, **ne la décris pas dans une
issue publique** : une faille exposée avant d'être corrigée met en danger les
données de ceux qui utilisent l'application.

Signale-la par le **signalement privé de GitHub** : onglet *Security* du
dépôt, puis *Report a vulnerability*. Seuls les mainteneurs le lisent.

Dis ce que tu as observé, comment le reproduire, et ce qu'un attaquant
pourrait en tirer. Une réponse suit dès que possible ; le correctif est publié
avant que la faille soit rendue publique, et tu es cité si tu le souhaites.

## Ce qui est dans le périmètre

- l'application (`app/`) et le site publié ;
- la chaîne qui construit et publie (`.github/workflows/`) ;
- les règles d'accès du stockage distant (`docs/supabase.sql`).

L'ancienne version (`index.html` à la racine) est conservée en lecture seule ;
ses failles sont dans le périmètre si elles touchent les données de
l'utilisateur.
