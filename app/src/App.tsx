import { Shell } from './ui/Shell';
import { useRoute } from './ui/useRoute';
import type { IdEcran } from './ui/navigation';

/**
 * Ce que chaque écran apportera, écran par écran. Sert à la fois de repère
 * de navigation pendant la construction et de rappel du périmètre.
 *
 * Aucun de ces textes ne contient de chiffre, et c'est délibéré : l'invariant
 * n°2 du projet veut qu'aucun écran ne porte de nombre en propre. Les valeurs
 * viendront du domaine, une fois les écrans câblés.
 */
const ATTENDU: Readonly<Record<IdEcran, readonly string[]>> = {
  pilote: [
    'Combien je peux me verser, et qu\'est-ce qui coince',
    'Décisions du jour, alimentées par une requête réelle',
    'Curseur de réserve — source unique du matelas de sécurité',
    'Flux du mois : entrées, sorties, rémunération'
  ],
  activite: [
    'Plan de charge et congés, calendrier intégré à la page',
    'Missions et factures',
    'Taux d\'occupation et délai de paiement par client'
  ],
  argent: [
    'Trésorerie : solde, mouvements, enveloppes de provision',
    'Performance : chiffre d\'affaires réalisé et encaissé',
    'Échéancier des obligations, avec leur statut daté'
  ],
  achats: [
    'Dépenses avec justificatif — pas de TVA récupérable sans pièce',
    'Rapprochement bancaire à l\'état explicite et corrigeable',
    'Fournisseur, et détection des achats hors de France'
  ],
  outils: [
    'Impôt et CFE',
    'Compte professionnel et banque',
    'Compte rendu d\'activité'
  ],
  config: [
    'Profil, statut, régime fiscal',
    'Édition du barème : ajouter une période sans toucher au code',
    'Données, export, sauvegarde et synchronisation'
  ]
};

/**
 * Espace réservé d'un écran non encore construit.
 *
 * Il dit explicitement ce qui manque plutôt que d'afficher un squelette
 * plausible : pendant la réécriture, un écran vide qui s'annonce comme tel
 * vaut mieux qu'un écran qui a l'air fini et ne l'est pas.
 */
function EcranAConstruire() {
  const { ecran } = useRoute();
  const attendu = ATTENDU[ecran.id];

  return (
    <section aria-labelledby="titre-ecran">
      <h1 id="titre-ecran" style={{ fontSize: '19px', letterSpacing: '-0.03em', marginBottom: '6px' }}>
        {ecran.libelle}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '16px' }}>
        Écran à construire. Le socle est en place : tokens, coquille, routage,
        noyau fiscal et migration.
      </p>
      <ul style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.7, paddingLeft: '18px' }}>
        {attendu.map((ligne) => (
          <li key={ligne}>{ligne}</li>
        ))}
      </ul>
    </section>
  );
}

export function App() {
  return (
    <Shell>
      <EcranAConstruire />
    </Shell>
  );
}
