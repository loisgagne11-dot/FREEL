import { Suspense, lazy, useEffect, useMemo } from 'react';
import { Shell } from './ui/Shell';
import { FournisseurToasts } from './ui/components/Toasts';
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
const Config = lazy(() => import('./ui/screens/Config').then((m) => ({ default: m.Config })));
const Facture = lazy(() => import('./ui/screens/Facture').then((m) => ({ default: m.Facture })));
import { aTraiter } from './state/selecteurs';
import { compteursParEcran } from './domain/calculs/aTraiter';

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

/**
 * L'écran courant.
 *
 * L'exhaustivité est vérifiée par le compilateur : `jamais` est de type
 * `never`, donc ajouter un écran à la navigation sans le router ici ne
 * compile pas. Un `return null` final aurait laissé passer un écran blanc.
 */
function Ecran() {
  const { ecran } = useRoute();
  switch (ecran.id) {
    case 'pilote': return <Pilote />;
    case 'activite': return <Activite />;
    case 'argent': return <Argent />;
    case 'facture': return <Facture />;
    case 'achats': return <Achats />;
    case 'outils': return <Outils />;
    case 'config': return <Config />;
    default: {
      const jamais: never = ecran.id;
      return jamais;
    }
  }
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
    <FournisseurToasts>
      <Shell compteurs={compteurs}>
        <Suspense fallback={<EnChargement />}>
          <Ecran />
        </Suspense>
      </Shell>
    </FournisseurToasts>
  );
}
