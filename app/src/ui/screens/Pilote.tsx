import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import {
  etatPilote, fluxDuMois, moisCourant, remunerationDuMois, soldeEstSuivi
} from '../../state/selecteurs';
import { Greet } from '../components/Greet';
import { ActionsRapides } from '../components/ActionsRapides';
import { FluxCard } from '../components/FluxCard';
import { useATraiter } from '../useATraiter';
import { SanteCard, indicateursDeSante } from '../components/SanteCard';
import { eur, moisLong } from '../format';
import { useRoute } from '../useRoute';
const ATraiter = lazy(() => import('./Pilote.decisions')
  .then((m) => ({ default: m.ATraiter })));

/**
 * La composition d'un chiffre, au clic sur sa tuile.
 *
 * Différée pour la même raison que tout ce qui l'est ici : le Pilote est le
 * seul écran du paquet d'ENTRÉE, celui que tout le monde télécharge avant de
 * voir quoi que ce soit. Un panneau qu'on n'ouvre qu'en venant vérifier un
 * chiffre — et le `Sheet` qu'il emporte, dont le Pilote n'avait aucun usage
 * jusqu'ici — n'ont rien à y faire.
 */
const Composition = lazy(() => import('../components/Composition')
  .then((m) => ({ default: m.Composition })));

/**
 * Le panneau qui pointe un encaissement. Différé comme `Composition` : il
 * emporte le formulaire de règlement et le `Sheet`, et ne s'ouvre qu'au moment
 * où un virement arrive.
 */
const Encaissements = lazy(() => import('../components/Encaissements')
  .then((m) => ({ default: m.Encaissements })));

/** Son jumeau pour la colonne Sorties : pointer une échéance payée. Même motif. */
const Sorties = lazy(() => import('../components/Sorties')
  .then((m) => ({ default: m.Sorties })));

import { Montant } from '../components/Montant';
import type { CleComposition } from '../../domain/calculs/composition';
import type { Mois } from '../../domain/types';

/**
 * Écran Pilote — « combien je peux me verser, et qu'est-ce qui coince ».
 *
 * INVARIANT : aucun nombre n'est écrit dans ce fichier. Tout vient des faits et
 * du domaine, via `etatPilote`. C'est ce qui empêche la dérive qui produisait
 * cinq valeurs concurrentes du taux de cotisations dans l'ancienne version.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE PILOTE AFFICHE, IL NE RÈGLE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le curseur de seuil de sécurité vivait ici. Il est parti dans Config, où le
 * handoff le place — avec la part gardée, qui est arrivée en même temps. Deux
 * raisons, et la seconde a tranché :
 *
 *  1. Le handoff range les deux réglages dans « Réserve & versements », et le
 *     Pilote n'y montre que le montant qui en résulte.
 *  2. Le Pilote est le seul écran du paquet d'entrée. Le second curseur l'a
 *     fait franchir son plafond, et l'invariant du projet est d'EXTRAIRE ce qui
 *     n'a rien à faire là plutôt que de relever le plafond. Un réglage qu'on
 *     touche trois fois par an n'a pas à être téléchargé par tout le monde à
 *     chaque ouverture.
 */
/**
 * Le flux d'un autre mois, chargé quand on quitte le mois courant : il porte
 * son propre sélecteur, que le paquet d'entrée n'a pas à embarquer pour qui
 * ne regarde que le mois en cours.
 */
const BandeauxDuPilote = lazy(() => import('./Pilote.bandeaux')
  .then((m) => ({ default: m.BandeauxDuPilote })));

const FluxAutreMois = lazy(() => import('../components/FluxAutreMois.carte')
  .then((m) => ({ default: m.FluxAutreMoisCarte })));

export function Pilote({ mois: moisChoisi, onMois }: {
  /** Le mois de la barre du haut ; le mois courant quand l'écran est monté seul. */
  readonly mois?: Mois;
  readonly onMois?: (m: Mois) => void;
} = {}) {
  const faits = useFaits((e) => e.faits);
  const chargement = useFaits((e) => e.chargement);
  const [compose, setCompose] = useState<CleComposition | null>(null);
  /*
   * Le panneau d'encaissement : fermé (`null`), ouvert sur toute la liste
   * (`''`), ou ouvert sur la facture dont on a cliqué la pastille.
   */
  const [pointage, setPointage] = useState<string | null>(null);
  // Stable, et ce n'est pas un détail : le dialogue rejoue son effet d'ouverture
  // — focus au premier bouton — à chaque nouvelle fonction de fermeture. Or
  // chaque pointage change les faits, donc rend le Pilote : le focus sautait
  // en tête du panneau à chaque facture pointée.
  const fermerPointage = useCallback(() => setPointage(null), []);
  /* Le panneau des sorties, ouvert sur l'échéance dont on a cliqué la pastille. */
  const [paiement, setPaiement] = useState<string | null>(null);
  const fermerPaiement = useCallback(() => setPaiement(null), []);
  const { ecran, sousRoute } = useRoute();
  /* `#/pilote/encaissements` est un GESTE, comme `#/argent/livre` : l'action
     rapide et « + Nouveau » l'ouvrent de n'importe où, puis l'adresse redevient
     celle de l'écran — fermer le panneau puis recharger ne doit pas le
     rouvrir. */
  const routeEncaissements = ecran.id === 'pilote' && sousRoute === 'encaissements';
  useEffect(() => {
    if (!routeEncaissements) return;
    setPointage('');
    window.location.replace('#/pilote');
  }, [routeEncaissements]);

  /*
   * Le flux suit le mois de la barre ; la santé et les décisions, non : elles
   * disent où l'on en est AUJOURD'HUI, et « combien je peux me verser » n'a
   * pas de mois passé.
   */
  const mois = moisCourant();
  const moisVu = moisChoisi ?? mois;
  // Recalculé à chaque changement de faits, jamais stocké.
  const etat = useMemo(() => etatPilote(faits), [faits]);
  // `null` tant que le calcul n'est pas chargé : inconnu, pas « aucun sujet ».
  const sujets = useATraiter(faits);
  const flux = useMemo(() => fluxDuMois(faits, mois, etat), [faits, mois, etat]);
  const verseCeMois = useMemo(() => remunerationDuMois(faits, mois), [faits, mois]);

  /**
   * Les constats de santé viennent des MÊMES sources que le reste de l'écran.
   *
   * Les recompter séparément les ferait diverger du flux et du panneau
   * « à traiter » — l'écran dirait alors deux choses différentes sur la même
   * réalité, ce qui est exactement le défaut relevé sur l'ancienne version.
   */
  const sante = useMemo(() => {
    if (sujets === null) return null;
    const sujet = (id: string) => sujets.find((x) => x.id === id);
    const periodes = sujet('periodes-a-declarer');
    const des = sujet('des-en-retard');
    const factures = sujet('factures-en-retard');
    // Le régime ne change qu'en « retard » : TVA due sur des factures émises
    // sans, seuil franchi, plafond dépassé — les mêmes sujets que la liste.
    const regime = sujet('tva-a-regulariser') !== undefined ? 'TVA due sur des factures émises sans'
      : sujet('seuil-tva')?.gravite === 'retard' ? 'seuil majoré de TVA franchi'
        : sujet('plafond-micro')?.gravite === 'retard' ? 'plafond du micro dépassé'
          : null;
    return indicateursDeSante({
      dispo: etat.tresorerie.dispo,
      provisions: etat.tresorerie.provisions,
      facturesEnRetard: factures?.nombre ?? 0,
      montantEnRetard: Number(factures?.donnees['total'] ?? 0),
      declarationsEnRetard: (periodes?.gravite === 'retard' ? periodes.nombre : 0) + (des?.nombre ?? 0),
      declarationAvant: periodes?.gravite === 'a_faire' ? String(periodes.donnees['limite']) : null,
      regime
    });
  }, [etat, sujets]);

  return (
    <>
      <Greet
        titre={salutation(faits.entreprise.prenom, sujets === null ? null : sujets.length)}
        sousTitre="Ton mois en un coup d’œil : ce qui entre, ce qui sort, ce que tu peux te verser."
        repere={<>Solde compte · <Montant>{eur(etat.tresorerie.solde)}</Montant></>}
      />

      {/* Juste sous l'accueil, avant tout chiffre : c'est l'ordre de la spec, et
          c'est celui de l'usage — on ouvre l'application pour faire quelque
          chose au moins aussi souvent que pour regarder où l'on en est. */}
      <ActionsRapides />

      {/* « Tes saisies ne sont pas conservées » vit dans `App`, au-dessus de
          TOUS les écrans : un quota atteint en cours de session doit se voir là
          où l'on saisit, pas seulement en revenant ici. */}

      {/* Les bandeaux d'exception — reprise de l'ancienne version, montants
          sous-évalués, barème manquant — arrivent à la demande, et seulement
          quand l'un d'eux a quelque chose à dire : ce sont des états RARES, et
          le paquet d'entrée a franchi son budget au lot 7. */}
      {((chargement.phase === 'pret' && chargement.migrationEffectuee)
        || etat.tresorerie.incomplet
        || (etat.tauxImpotIndisponible && etat.motifTauxImpot !== null)) && (
        <Suspense fallback={null}>
          <BandeauxDuPilote
            migration={chargement.phase === 'pret' && chargement.migrationEffectuee}
            motifsIncomplets={etat.tresorerie.incomplet ? etat.tresorerie.motifsIncomplets : null}
            motifTauxImpot={etat.tauxImpotIndisponible ? etat.motifTauxImpot : null}
          />
        </Suspense>
      )}

      {moisVu === mois
        ? (
          <FluxCard
            flux={flux}
            periode={moisLong(mois).toLowerCase()}
            onVersable={() => setCompose('versable')}
            onPointer={setPointage}
            onPayer={setPaiement}
            dejaVerse={soldeEstSuivi(faits) ? verseCeMois : null}
            besoinMensuel={faits.besoinMensuel}
          />
        )
        : (
          <Suspense fallback={null}>
            <FluxAutreMois mois={moisVu} courant={mois} onRevenir={() => onMois?.(mois)} />
          </Suspense>
        )}

      {/* Sans les sujets, « 0 facture en retard » serait un faux « tout va bien » :
          la phrase attend, la carte non — elle pousserait la page en arrivant. */}
      <SanteCard indicateurs={sante} autonomie={etat.autonomie} reserve={etat.tresorerie.reserve} />

      {/*
        * SANS DOUBLONS.
        *
        * Le Pilote répétait trois fois les mêmes chiffres : une carte « Je
        * peux me verser » (la colonne Rémunération le dit), quatre tuiles
        * Solde · À garder · Disponible · Seuil (l'en-tête de l'écran Argent,
        * à un clic), et « Ce que je dois » (la colonne Sorties). Le handoff
        * n'en a aucun : le flux, la santé, puis les décisions.
        */}

      {/* Sous la ligne de flottaison, donc chargée après le premier rendu :
          elle tire la mise en mots des sujets, dix kilo-octets de français que
          le paquet d'entrée n'a pas à porter pour tout le monde. */}
      <Suspense fallback={null}>
        <ATraiter sujets={sujets} />
      </Suspense>

      {compose !== null && (
        <Suspense fallback={null}>
          <Composition cle={compose} onFermer={() => setCompose(null)} />
        </Suspense>
      )}

      {pointage !== null && (
        <Suspense fallback={null}>
          <Encaissements cible={pointage === '' ? null : pointage} onFermer={fermerPointage} />
        </Suspense>
      )}

      {paiement !== null && (
        <Suspense fallback={null}>
          <Sorties cible={paiement} onFermer={fermerPaiement} />
        </Suspense>
      )}

    </>
  );
}

/**
 * Les décisions du jour.
 *
 * Sur Pilote, poste de pilotage, la liste n'est pas filtrée : elle montre tous
 * les sujets, quel que soit l'écran qui les règle. C'est la règle du design, et
 * c'est ce qui fait de cet écran la décision du jour plutôt qu'un écran parmi
 * six.
 *
 * Une liste vide n'est pas un vide à masquer : c'est une information, et la
 * meilleure qu'on puisse donner.
 */

/* ---------- éléments locaux ---------- */


/** Les petits nombres s'écrivent en lettres dans une phrase ; au-delà, en chiffres. */
const EN_LETTRES = ['zéro', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];

/**
 * « Bonjour Camille — deux décisions t'attendent. »
 *
 * La phrase du handoff, en une ligne : qui, et combien de choses attendent —
 * un état qu'on lit en une seconde, là où quatre tuiles demandent d'être
 * comparées. Le prénom vient de Réglages, jamais du code (le dépôt est
 * public) ; tant qu'il manque, on salue sans nommer. On saluait l'entreprise
 * — « Bonjour Atelier de démonstration » — faute de mieux.
 *
 * « Rien ne réclame ton attention » n'est pas un vide à masquer : c'est la
 * bonne nouvelle de la journée.
 */
export function salutation(prenom: string, nbSujets: number | null): string {
  const qui = prenom.trim() === '' ? 'Bonjour' : `Bonjour ${prenom.trim()}`;
  // Inconnu (calcul pas encore chargé) n'est pas zéro : « rien ne réclame ton
  // attention » dit à tort que tout va bien.
  if (nbSujets === null) return `${qui}.`;
  if (nbSujets === 0) return `${qui} — rien ne réclame ton attention.`;
  if (nbSujets === 1) return `${qui} — une décision t’attend.`;
  return `${qui} — ${EN_LETTRES[nbSujets] ?? String(nbSujets)} décisions t’attendent.`;
}
