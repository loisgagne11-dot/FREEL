# Configuration Supabase pour FREEL V51

Ce guide explique comment configurer Supabase pour activer la synchronisation cloud de vos données FREEL.

## 1. Créer un projet Supabase

1. Allez sur [https://supabase.com](https://supabase.com)
2. Créez un compte ou connectez-vous
3. Cliquez sur "New Project"
4. Choisissez un nom pour votre projet (ex: "freel-prod")
5. Choisissez une région proche de vous
6. Définissez un mot de passe fort pour la base de données
7. Cliquez sur "Create new project"

## 2. Configurer la base de données

1. Dans votre projet Supabase, allez dans "SQL Editor"
2. Copiez le contenu du fichier `supabase-schema.sql` à la racine du projet
3. Collez-le dans l'éditeur SQL
4. Cliquez sur "Run" pour exécuter le script

Ce script va créer :
- La table `user_data` pour stocker toutes vos données
- Les policies RLS (Row Level Security) pour sécuriser les données
- Les triggers pour les mises à jour automatiques
- L'activation du Realtime pour les syncs temps réel

## 3. Récupérer les credentials

1. Dans votre projet Supabase, allez dans "Settings" > "API"
2. Copiez les informations suivantes :
   - **Project URL** (ressemble à `https://xxxxx.supabase.co`)
   - **anon public** key (clé publique anonyme)

## 4. Configurer FREEL

1. Ouvrez FREEL dans votre navigateur
2. Allez dans "Paramètres" (⚙️ Settings)
3. Dans la section "Synchronisation Cloud", cliquez sur "⚙️ Configuration"
4. Remplissez les champs :
   - **Supabase URL** : Collez votre Project URL
   - **Supabase Anon Key** : Collez votre clé anon public
5. Cliquez sur "Enregistrer"

## 5. Créer un compte utilisateur

Deux options :

### Option A : Créer un nouveau compte

1. Dans FREEL, allez dans "Paramètres"
2. Cliquez sur "Créer un compte"
3. Entrez votre email et un mot de passe fort
4. Confirmez le mot de passe
5. Vérifiez votre email pour confirmer votre compte

### Option B : Se connecter avec un compte existant

1. Dans FREEL, allez dans "Paramètres"
2. Cliquez sur "Se connecter"
3. Entrez votre email et mot de passe
4. Cliquez sur "Se connecter"

## 6. Activer la synchronisation

Une fois connecté, vous verrez une nouvelle section "Synchronisation" dans les paramètres :

### Synchronisation manuelle

- Cliquez sur "🔄 Synchroniser maintenant" pour synchroniser vos données immédiatement

### Synchronisation automatique

- Cliquez sur "Activer auto-sync" pour synchroniser automatiquement toutes les 5 minutes
- Vos données locales seront sauvegardées dans le cloud

### Synchronisation temps réel

- Cliquez sur "Activer temps réel" pour recevoir les mises à jour instantanément
- Utile si vous utilisez FREEL sur plusieurs appareils simultanément

## 7. Utilisation multi-appareils

Une fois configuré sur un appareil :

1. Sur un autre appareil, ouvrez FREEL
2. Allez dans "Paramètres" > "Configuration Supabase"
3. Entrez les mêmes credentials Supabase
4. Connectez-vous avec le même compte email
5. Cliquez sur "Synchroniser maintenant"
6. Toutes vos données seront téléchargées !

## Sécurité

- ✅ Toutes vos données sont chiffrées en transit (HTTPS)
- ✅ Row Level Security (RLS) garantit que vous seul pouvez voir vos données
- ✅ L'authentification est gérée par Supabase (bcrypt)
- ✅ Les clés API sont stockées localement dans votre navigateur
- ⚠️ Ne partagez jamais votre mot de passe ou vos clés API

## Résolution de problèmes

### "Supabase not configured"

- Vérifiez que vous avez bien configuré l'URL et la clé anon
- Assurez-vous que l'URL commence par `https://`

### "User not authenticated"

- Reconnectez-vous dans les paramètres
- Vérifiez que votre email est confirmé

### "Sync failed"

- Vérifiez votre connexion internet
- Assurez-vous que le projet Supabase est actif
- Vérifiez que le schéma SQL a été exécuté correctement

### Erreur de schéma SQL

- Assurez-vous d'avoir exécuté tout le script `supabase-schema.sql`
- Vérifiez dans "Table Editor" que la table `user_data` existe
- Vérifiez dans "Authentication" > "Policies" que les RLS sont activées

## Support

Pour toute question ou problème :

1. Vérifiez les logs dans la console du navigateur (F12)
2. Consultez la documentation Supabase : https://supabase.com/docs
3. Ouvrez une issue sur GitHub si le problème persiste

## Migration des données

Si vous aviez déjà des données en local avant d'activer Supabase :

1. Configurez Supabase et connectez-vous
2. Cliquez sur "Synchroniser maintenant"
3. FREEL enverra automatiquement vos données locales vers le cloud
4. Vous pouvez maintenant utiliser FREEL sur plusieurs appareils !

## Backup

Même avec Supabase activé, vous pouvez toujours :

- Exporter vos données en JSON via "Paramètres" > "Exporter"
- Conserver une copie locale de sauvegarde
- Importer des données depuis un JSON si besoin
