import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// Ordre de chargement significatif : les tokens d'abord, la base ensuite.
// `base.css` consomme les variables définies par `tokens.css` — l'inverse
// produirait des valeurs indéfinies au premier rendu.
import './styles/tokens.css';
import './styles/base.css';

const racine = document.getElementById('root');
if (!racine) {
  throw new Error('Élément #root introuvable : la coquille HTML est incomplète.');
}

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>
);
