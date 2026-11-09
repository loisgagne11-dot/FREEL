import { Suspense, lazy, useEffect, useState } from 'react';
import { Shell } from './ui/Shell';
import { FournisseurToasts } from './ui/components/Toasts';
import { useRoute } from './ui/useRoute';
import { useFaits } from './state/store';

/**
 * Chargé à la demande, comme les six écrans plus bas : il ne sert qu'à
 * l'écran Argent — bornes comprises, voir son en-tête — et le charger
 * d'emblée avait fait franchir le budget du code d'entrée pour un contrôle
 * que cinq écrans sur six n'affichent jamais.
 */
const SelecteurPeriode = lazy(() => import('./ui/components/SelecteurPeriode')
  .then((m) => ({ default: m.SelecteurPeriode })));

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
import { moisCourant } from './state/selecteurs';
import { useCompteursATraiter } from './ui/useATraiter';
import type { Mois } from './domain/types';

/** Le mois choisi dans la barre du haut, tel que `useState` le rend. */
type EtatMois = readonly [Mois, (m: Mois) => void];
import { FiletErreur } from './ui/components/FiletErreur';

/** Recherche et export : différés, voir l'en-tête de `BarreActions`. */
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
 * L'exhaustivité est vérifiée par le compilateur : `jamais` est de type
 * `never`, donc ajouter un écran à la navigation sans le router ici ne
 * compile pas. Un `return null` final aurait laissé passer un écran blanc.
 *
 * Le MOIS va au Pilote (son flux du mois) et à Activité (sa grille) ; son
 * ANNÉE aux trois écrans qui raisonnent à l'année. Facture ne reçoit rien :
 * la liste des factures est un onglet d'Activité, et ce qui reste sous
 * `#/facture/…` — rédiger, rouvrir une facture — n'a pas de période.
 * Config ne reçoit rien non plus : il ne porte que des réglages. Le Pilote
 * reçoit le mois mais n'en tire que son flux : santé et décisions restent
 * celles d'aujourd'hui — « combien je peux me verser » n'a pas de mois
 * passé. C'est la même liste que `ECRANS_DATES` dans `SelecteurPeriode`,
 * qui décide d'afficher le contrôle ou non ; les deux doivent rester
 * d'accord, faute de quoi on afficherait un sélecteur sans effet ou un effet
 * sans sélecteur.
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
  return <FiletErreur key={ecran.id} portee="ecran">{contenuEcran(ecran.id, mois, setMois)}</FiletErreur>;
}

function contenuEcran(id: ReturnType<typeof useRoute>['ecran']['id'], mois: Mois, setMois: (m: Mois) => void) {
  const annee = Number(mois.slice(0, 4));
  switch (id) {
    case 'pilote': return <Pilote mois={mois} onMois={setMois} />;
    case 'activite': return <Activite mois={mois} onMois={setMois} />;
    case 'argent': return <Argent annee={annee} />;
    case 'facture': return <Facture />;
    case 'achats': return <Achats mois={mois} />;
    case 'outils': return <Outils annee={annee} />;
    case 'config': return <Config />;
    default: {
      const jamais: never = id;
      return jamais;
    }
  }
}

/**
 * L'alerte de conservation, différée : voir son en-tête. Montée sur tous les
 * écrans, elle arrive quelques millisecondes après eux.
 */
const AlerteConservation = lazy(() => import('./ui/components/AlerteConservation')
  .then((m) => ({ default: m.AlerteConservation })));

export function App() {
  const initialiser = useFaits((e) => e.initialiser);
  const faits = useFaits((e) => e.faits);

  // Les badges viennent de la même requête que la liste de l'écran Pilote :
  // une seule source, donc jamais de badge qui contredit la liste.
  // `undefined` tant que le calcul n'est pas chargé : pas de pastille plutôt
  // qu'un « 0 » qui dirait qu'il n'y a rien à traiter.
  const compteurs = useCompteursATraiter(faits);

  /**
   * Le mois affiché par le navigateur de la barre du haut — et, par lui,
   * l'année des écrans qui raisonnent à l'année.
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
   * dans `SelecteurPeriode`, chargé à la demande — voir son en-tête.
   */
  const etatMois: EtatMois = useState<Mois>(() => moisCourant());
  const [moisChoisi] = etatMois;

  // Chargement et migration au démarrage, une seule fois. `initialiser` est
  // idempotent côté migration : un second appel ne réécrit rien.
  useEffect(() => { initialiser(); }, [initialiser]);

  return (
    <FournisseurToasts>
      <Shell
        {...(compteurs ? { compteurs } : {})}
        // Monté sur les sept écrans : c'est `SelecteurPeriode` lui-même qui
        // décide de se taire sur Pilote et Config (voir son en-tête) — Shell ne
        // doit pas apprendre le nom d'un écran pour rester ignorante du
        // métier (voir la doc de sa prop `periode`), et `App` n'a donc pas
        // besoin de connaître la route pour ce seul contrôle.
        periode={(
          // Suspense sans texte : c'est un contrôle de la barre du haut, pas
          // un écran — un « Chargement… » y clignoterait pour quelques
          // dizaines de millisecondes sur une connexion correcte, plus
          // dérangeant que l'absence du contrôle le temps qu'il arrive.
          <Suspense fallback={null}>
            <SelecteurPeriode etat={etatMois} />
          </Suspense>
        )}
        actions={(
          <Suspense fallback={null}>
            <BarreActions annee={Number(moisChoisi.slice(0, 4))} />
          </Suspense>
        )}
      >
        <Suspense fallback={null}><AlerteConservation /></Suspense>
        <Suspense fallback={<EnChargement />}>
          {Ecran(etatMois)}
        </Suspense>
      </Shell>
    </FournisseurToasts>
  );
}
