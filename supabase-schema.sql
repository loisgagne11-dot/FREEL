-- Schéma Supabase pour FREEL V51
-- Base de données pour la synchronisation des données utilisateur

-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Table user_data : Stocke toutes les données d'un utilisateur
CREATE TABLE IF NOT EXISTS public.user_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id)
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS user_data_user_id_idx ON public.user_data(user_id);
CREATE INDEX IF NOT EXISTS user_data_updated_at_idx ON public.user_data(updated_at);

-- Row Level Security (RLS)
ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;

-- Policy: Les utilisateurs ne peuvent voir que leurs propres données
CREATE POLICY "Users can view their own data"
  ON public.user_data
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Les utilisateurs ne peuvent insérer que leurs propres données
CREATE POLICY "Users can insert their own data"
  ON public.user_data
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Les utilisateurs ne peuvent mettre à jour que leurs propres données
CREATE POLICY "Users can update their own data"
  ON public.user_data
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Les utilisateurs ne peuvent supprimer que leurs propres données
CREATE POLICY "Users can delete their own data"
  ON public.user_data
  FOR DELETE
  USING (auth.uid() = user_id);

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour updated_at automatiquement
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.user_data
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable Realtime pour les mises à jour en temps réel
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_data;

-- Commentaires
COMMENT ON TABLE public.user_data IS 'Stocke toutes les données utilisateur de l''application FREEL';
COMMENT ON COLUMN public.user_data.data IS 'Données JSON contenant company, missions, treasury, config, etc.';
COMMENT ON COLUMN public.user_data.user_id IS 'Référence à l''utilisateur authentifié';
COMMENT ON COLUMN public.user_data.updated_at IS 'Horodatage de la dernière mise à jour';

-- Grants
GRANT ALL ON public.user_data TO authenticated;
GRANT SELECT ON public.user_data TO anon;
