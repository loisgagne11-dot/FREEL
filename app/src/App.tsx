import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Shell } from './ui/Shell';
import { FournisseurToasts } from './ui/components/Toasts';
import { SelecteurAnnee } from './ui/components/SelecteurAnnee';
import { useRoute } from './ui/useRoute';
import { useFaits } from './state/store';
import { anneesDisponibles } from './state/selecteurs';

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
 *
 * `anneeChoisie` ne va qu'à Argent, seul écran qui la lit aujourd'hui : la
 * distribuer aux six autres les ferait tous se re-rendre à chaque bascule
 * d'année pour rien.
 */
function Ecran({ anneeChoisie }: { readonly anneeChoisie: number }) {
  const { ecran } = useRoute();
  switch (ecran.id) {
    case 'pilote': return <Pilote />;
    case 'activite': return <Activite />;
    case 'argent': return <Argent anneeChoisie={anneeChoisie} />;
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
  const { ecran } = useRoute();

  // Les badges viennent de la même requête que la liste de l'écran Pilote :
  // une seule source, donc jamais de badge qui contredit la liste.
  const compteurs = useMemo(() => compteursParEcran(aTraiter(faits)), [faits]);

  /**
   * L'année affichée par le sélecteur de la barre du haut.
   *
   * ─────────────────────────────────────────────────────────────────────
   * UNE PRÉFÉRENCE D'AFFICHAGE, PAS UN FAIT
   * ─────────────────────────────────────────────────────────────────────
   *
   * Elle ne vit PAS dans `Faits` (invariant n°1) : ce n'est rien qui se soit
   * produit dans le dossier, seulement ce qu'on regarde en ce moment. Elle
   * vit ici, au-dessus de tous les écrans, pour une seule raison concrète :
   * passer de Pilote à Argent et y revenir ne doit pas la remettre à l'année
   * courante. Un état local à l'écran Argent serait remonté à zéro à chaque
   * démontage — exactement le défaut relevé par l'audit des indicateurs.
   */
  const [anneeChoisie, setAnneeChoisie] = useState<number>(() => new Date().getFullYear());
  const annees = useMemo(() => anneesDisponibles(faits), [faits]);

  // Si les faits changent sous le pied du choix courant — le dossier vient
  // d'être rechargé, ou la dernière recette d'une année future vient d'être
  // supprimée — et que l'année choisie n'a plus rien à montrer, on retombe
  // sur l'année courante plutôt que de garder un sélecteur qui pointe sur une
  // option qui n'existe plus. L'année courante est TOUJOURS dans les bornes
  // (voir `anneesDisponibles`), ce retour est donc toujours valide.
  useEffect(() => {
    if (!annees.includes(anneeChoisie)) setAnneeChoisie(new Date().getFullYear());
  }, [annees, anneeChoisie]);

  // Chargement et migration au démarrage, une seule fois. `initialiser` est
  // idempotent côté migration : un second appel ne réécrit rien.
  useEffect(() => { initialiser(); }, [initialiser]);

  return (
    <FournisseurToasts>
      <Shell
        compteurs={compteurs}
        selecteurPeriode={ecran.id === 'argent' ? (
          <SelecteurAnnee annees={annees} valeur={anneeChoisie} onChange={setAnneeChoisie} />
        ) : undefined}
      >
        <Suspense fallback={<EnChargement />}>
          <Ecran anneeChoisie={anneeChoisie} />
        </Suspense>
      </Shell>
    </FournisseurToasts>
  );
}
