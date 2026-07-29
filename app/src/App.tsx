import { Suspense, lazy, useEffect, useMemo } from 'react';
import { Shell } from './ui/Shell';
import { useRoute } from './ui/useRoute';
import { useFaits } from './state/store';

/**
 * Les écrans sont chargés à la demande.
 *
 * Le budget de performance est fixé à 250 Ko (voir `vite.config.ts`), et
 * l'ancienne version chargeait 627 Ko de bibliothèques bloquantes avant le
 * premier rendu. Avec trois écrans seulement, le paquet unique atteignait déjà
 * 245 Ko : les six l'auraient franchi. Découper par écran fait qu'on ne
 * télécharge que ce qu'on regarde, et que le coût d'un écran supplémentaire ne
 * pèse plus sur le premier affichage.
 *
 * Pilote n'est PAS découpé : c'est l'écran d'entrée, et le découper ajouterait
 * un aller-retour réseau juste avant le contenu qu'on vient chercher.
 */
import { Pilote } from './ui/screens/Pilote';

const Argent = lazy(() => import('./ui/screens/Argent').then((m) => ({ default: m.Argent })));
const Outils = lazy(() => import('./ui/screens/Outils').then((m) => ({ default: m.Outils })));
const Achats = lazy(() => import('./ui/screens/Achats').then((m) => ({ default: m.Achats })));
const Activite = lazy(() => import('./ui/screens/Activite').then((m) => ({ default: m.Activite })));
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
const ATTENDU: Readonly<Record<Exclude<IdEcran, 'pilote' | 'outils' | 'argent' | 'achats' | 'activite'>, readonly string[]>> = {
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
function EcranAConstruire(
  { id, libelle }: { id: Exclude<IdEcran, 'pilote' | 'outils' | 'argent' | 'achats' | 'activite'>; libelle: string }
) {
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

/**
 * Attente de chargement d'un écran. Sobre et sans animation : sur une connexion
 * correcte le fragment arrive en quelques dizaines de millisecondes, et un
 * squelette clignotant serait plus dérangeant que le vide.
 */
function EnChargement() {
  return (
    <p role="status" style={{ color: 'var(--muted-2)', fontSize: '13px' }}>
      Chargement…
    </p>
  );
}

function Ecran() {
  const { ecran } = useRoute();
  if (ecran.id === 'pilote') return <Pilote />;
  if (ecran.id === 'outils') return <Outils />;
  if (ecran.id === 'argent') return <Argent />;
  if (ecran.id === 'achats') return <Achats />;
  if (ecran.id === 'activite') return <Activite />;
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
      <Suspense fallback={<EnChargement />}>
        <Ecran />
      </Suspense>
    </Shell>
  );
}
