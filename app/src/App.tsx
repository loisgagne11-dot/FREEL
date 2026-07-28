import { useEffect, useMemo } from 'react';
import { Shell } from './ui/Shell';
import { useRoute } from './ui/useRoute';
import { Pilote } from './ui/screens/Pilote';
import { useFaits } from './state/store';
import { aTraiter } from './state/selecteurs';
import { compteursParEcran } from './domain/calculs/aTraiter';
import type { IdEcran } from './ui/navigation';

/**
 * Ce que chaque écran restant apportera. Sert de repère pendant la
 * construction et de rappel du périmètre.
 *
 * Aucun de ces textes ne contient de chiffre, et c'est délibéré : l'invariant
 * n°2 veut qu'aucun écran ne porte de nombre en propre.
 */
const ATTENDU: Readonly<Record<Exclude<IdEcran, 'pilote'>, readonly string[]>> = {
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
 * Espace réservé d'un écran non encore construit. Il dit ce qui manque plutôt
 * que d'afficher un squelette plausible : pendant une réécriture, un écran vide
 * qui s'annonce comme tel vaut mieux qu'un écran qui a l'air fini.
 */
function EcranAConstruire({ id, libelle }: { id: Exclude<IdEcran, 'pilote'>; libelle: string }) {
  return (
    <section aria-labelledby="titre-ecran">
      <h1 id="titre-ecran" style={{ fontSize: '21px', letterSpacing: '-0.035em', marginBottom: '6px' }}>
        {libelle}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '16px' }}>
        Écran à construire. Le socle est en place&nbsp;: noyau fiscal, migration,
        état, tokens et coquille.
      </p>
      <ul style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.7, paddingLeft: '18px' }}>
        {ATTENDU[id].map((ligne) => <li key={ligne}>{ligne}</li>)}
      </ul>
    </section>
  );
}

function Ecran() {
  const { ecran } = useRoute();
  if (ecran.id === 'pilote') return <Pilote />;
  return <EcranAConstruire id={ecran.id} libelle={ecran.libelle} />;
}

export function App() {
  const initialiser = useFaits((e) => e.initialiser);
  const faits = useFaits((e) => e.faits);

  // Les badges viennent de la même requête que la liste de l'écran Pilote :
  // une seule source, donc jamais de badge qui contredit la liste.
  const compteurs = useMemo(() => compteursParEcran(aTraiter(faits)), [faits]);

  // Chargement et migration au démarrage, une seule fois. `initialiser` est
  // idempotent côté migration : un second appel ne réécrit rien.
  useEffect(() => { initialiser(); }, [initialiser]);

  return (
    <Shell compteurs={compteurs}>
      <Ecran />
    </Shell>
  );
}
