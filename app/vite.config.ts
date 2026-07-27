import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // L'application est servie depuis un sous-chemin sur GitHub Pages ;
  // les chemins relatifs évitent d'avoir à connaître la base au build.
  base: './',
  build: {
    // Budget de performance : l'ancienne version chargeait 627 Ko de
    // bibliothèques bloquantes (jsPDF + Chart.js) avant le premier rendu.
    // Un avertissement au-delà de 250 Ko force à s'en apercevoir.
    chunkSizeWarningLimit: 250,
    target: 'es2022'
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx']
  }
});
