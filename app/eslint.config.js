// Lint volontairement minimal : un seul sujet, les règles des hooks React.
// Les erreurs de style, de typage et de variables inutilisées sont déjà tenues
// par `tsc` strict ; activer davantage ici ferait un second contrôle concurrent
// et noierait le signal (un hook appelé après un `return` casse l'ordre des
// hooks au rendu suivant, et aucun test unitaire ne l'attrape par construction).
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'scripts/**', 'coverage/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
