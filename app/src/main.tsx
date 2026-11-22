import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { precharger } from './ui/composantALaDemande';
import { FiletErreur } from './ui/components/FiletErreur';
import { capturerRetourDuLien } from './infra/retourDuLien';

// Ordre de chargement significatif : les tokens d'abord, la base ensuite.
// `base.css` consomme les variables définies par `tokens.css` — l'inverse
// produirait des valeurs indéfinies au premier rendu.
import './styles/tokens.css';
import './styles/base.css';

const racine = document.getElementById('root');
if (!racine) {
  throw new Error('Élément #root introuvable : la coquille HTML est incomplète.');
}

// Avant le routeur : un lien de courriel ramène avec un code dans l'adresse,
// qui doit en sortir avant que quoi que ce soit ne la lise (`retourDuLien`).
capturerRetourDuLien();

// Le filet de portée « application » rattrape ce qui tombe dans la coquille
// elle-même ; chaque écran a le sien, posé dans `App`.
createRoot(racine).render(
  <StrictMode>
    <FiletErreur portee="application">
      <App />
    </FiletErreur>
  </StrictMode>
);

// Après le premier rendu : les autres écrans arrivent pendant que l'utilisateur lit.
precharger();
