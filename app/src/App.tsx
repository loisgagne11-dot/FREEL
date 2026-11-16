import { Suspense, lazy, useEffect, useState } from 'react';
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
import { composantALaDemande } from './ui/composantALaDemande';

/**
 * Les autres écrans, par une table elle-même différée : voir l'en-tête de
 * `ui/ecrans`. Téléchargée au repos, comme les écrans qu'elle désigne.
 */
const EcranDiffere = composantALaDemande(() => import('./ui/ecrans').then((m) => m.EcranDiffere), true);
import { moisCourant } from './state/selecteurs';
import { useCompteursATraiter } from './ui/useATraiter';
import type { Mois } from './domain/types';

/** Le mois partagé par les écrans, tel que `useState` le rend. */
type EtatMois = readonly [Mois, (m: Mois) => void];
import { FiletErreur } from './ui/components/FiletErreur';

/** La barre du haut : différée, voir l'en-tête de `BarreActions`. */
const BarreActions = lazy(() => import('./ui/components/BarreActions')
  .then((m) => ({ default: m.BarreActions })));

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
 * Le Pilote est rendu ici, les autres par `EcranDiffere`, qui en tient la
 * table et vérifie qu'aucun n'est oublié. Le Pilote reçoit le mois mais n'en
 * tire que son flux : santé et décisions restent celles d'aujourd'hui —
 * « combien je peux me verser » n'a pas de mois passé.
 *
 * Appelée comme une fonction ordinaire depuis `App` (`Ecran(etatMois)`), pas
 * comme un élément JSX (`<Ecran mois={mois} />`) : les deux sont
 * équivalents pour React tant que l'appel reste inconditionnel au même
 * endroit à chaque rendu — ce qui est le cas ici —, mais la forme fonction
 * n'a pas besoin d'un objet de props, donc pas d'un nom de propriété qui
 * survivrait à la minification.
 *
 * Le filet porte la route en clé : un écran tombé se relève quand on en
 * change, sans recharger la page.
 */
function Ecran([mois, setMois]: EtatMois) {
  const { ecran } = useRoute();
  return (
    <FiletErreur key={ecran.id} portee="ecran">
      {ecran.id === 'pilote'
        ? <Pilote mois={mois} onMois={setMois} />
        : <EcranDiffere id={ecran.id} mois={mois} onMois={setMois} />}
    </FiletErreur>
  );
}

/**
 * L'alerte de conservation, différée : voir son en-tête. Montée sur tous les
 * écrans, elle arrive quelques millisecondes après eux.
 */
const AlerteConservation = lazy(() => import('./ui/components/AlerteConservation')
  .then((m) => ({ default: m.AlerteConservation })));

/**
 * L'accueil de la première ouverture et le bandeau de la démonstration,
 * différés comme l'alerte : ils ne servent qu'à un dossier vide ou fictif, et
 * n'ont rien à faire dans le paquet que télécharge un dossier en cours.
 */
const Accueil = lazy(() => import('./ui/components/Accueil')
  .then((m) => ({ default: m.AccueilEtDemonstration })));

export function App() {
  const initialiser = useFaits((e) => e.initialiser);
  const faits = useFaits((e) => e.faits);

  // Les badges viennent de la même requête que la liste de l'écran Pilote :
  // une seule source, donc jamais de badge qui contredit la liste.
  // `undefined` tant que le calcul n'est pas chargé : pas de pastille plutôt
  // qu'un « 0 » qui dirait qu'il n'y a rien à traiter.
  const compteurs = useCompteursATraiter(faits);

  /**
   * Le mois que regardent les écrans — et, par lui, l'année de ceux qui
   * raisonnent à l'année. Chaque écran en porte la commande dans son en-tête.
   *
   * ─────────────────────────────────────────────────────────────────────
   * UNE PRÉFÉRENCE D'AFFICHAGE, PAS UN FAIT
   * ─────────────────────────────────────────────────────────────────────
   *
   * Elle ne vit PAS dans `Faits` (invariant n°1) : ce n'est rien qui se soit
   * produit dans le dossier, seulement ce qu'on regarde en ce moment. Il
   * vit ici, au-dessus de tous les écrans, pour une seule raison concrète :
   * passer de Pilote à Argent et y revenir ne doit pas le remettre au mois
   * courant. Un état local à l'écran Argent serait remonté à zéro à chaque
   * démontage — exactement le défaut relevé par l'audit des indicateurs.
   *
   * Ce que ce composant ignore volontairement : les BORNES de ce mois.
   * `anneesDisponibles` et le repli quand le choix sort des bornes vivent
   * dans `ChoixAnnee`, qui voyage avec les écrans à l'année — voir son
   * en-tête.
   */
  const etatMois: EtatMois = useState<Mois>(() => moisCourant());

  // Chargement et migration au démarrage, une seule fois. `initialiser` est
  // idempotent côté migration : un second appel ne réécrit rien.
  useEffect(() => { initialiser(); }, [initialiser]);

  return (
    <FournisseurToasts>
      <Shell
        {...(compteurs ? { compteurs } : {})}
        actions={(
          // Suspense sans texte : ce sont des contrôles de la barre du haut,
          // pas un écran — un « Chargement… » y clignoterait pour quelques
          // dizaines de millisecondes sur une connexion correcte, plus
          // dérangeant que l'absence des boutons le temps qu'ils arrivent.
          <Suspense fallback={null}>
            <BarreActions />
          </Suspense>
        )}
      >
        <Suspense fallback={null}><AlerteConservation /></Suspense>
        <Suspense fallback={null}><Accueil /></Suspense>
        <Suspense fallback={<EnChargement />}>
          {Ecran(etatMois)}
        </Suspense>
      </Shell>
    </FournisseurToasts>
  );
}
