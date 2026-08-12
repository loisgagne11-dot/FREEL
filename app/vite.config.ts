import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // L'application est servie depuis un sous-chemin sur GitHub Pages ;
  // les chemins relatifs évitent d'avoir à connaître la base au build.
  base: './',
  build: {
    // Le budget réel est vérifié par `scripts/verifier-budget.mjs`, poste par
    // poste. Cet avertissement-ci ne sert qu'à faire remarquer un chunk
    // anormalement gros pendant un build local.
    chunkSizeWarningLimit: 200,
    target: 'es2022',
    rollupOptions: {
      output: {
        /**
         * React et Zustand à part.
         *
         * Ils ne changent pas d'un déploiement à l'autre : les séparer laisse
         * le cache du navigateur les conserver. Dans un paquet unique,
         * modifier une ligne de code invalidait 248 Ko ; ici, 55.
         */
        manualChunks: { vendor: ['react', 'react-dom', 'react-dom/client', 'zustand'] }
      }
    }
  },
  test: {
    // Le domaine et l'état se testent sans DOM : `node` est plus rapide et
    // garantit au passage qu'ils n'en dépendent pas. Seuls les composants
    // demandent un DOM, déclaré par une annotation en tête de leur fichier
    // (`@vitest-environment jsdom`).
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: true
  }
});
