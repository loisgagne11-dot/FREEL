import { Suspense, lazy, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import {
  aTraiter, etatPilote, fluxDuMois, moisCourant, remunerationDuMois, soldeEstSuivi
} from '../../state/selecteurs';
import { Greet } from '../components/Greet';
import { ActionsRapides } from '../components/ActionsRapides';
import { FluxCard } from '../components/FluxCard';
import { SanteCard, indicateursDeSante } from '../components/SanteCard';
import { eur, moisLong } from '../format';
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

import styles from './Pilote.module.css';
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
   * Le flux suit le mois de la barre ; la santé et les décisions, non : elles
   * disent où l'on en est AUJOURD'HUI, et « combien je peux me verser » n'a
   * pas de mois passé.
   */
  const mois = moisCourant();
  const moisVu = moisChoisi ?? mois;
  // Recalculé à chaque changement de faits, jamais stocké.
  const etat = useMemo(() => etatPilote(faits), [faits]);
  const sujets = useMemo(() => aTraiter(faits), [faits]);
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
        titre={salutation(faits.entreprise.prenom, sujets.length)}
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

      {chargement.phase === 'pret' && chargement.migrationEffectuee && (
        <Bandeau ton="info" titre="Données reprises de la version précédente">
          Une sauvegarde de l’état d’origine a été archivée avant toute écriture.
        </Bandeau>
      )}

      {/* Un calcul incomplet n'est jamais présenté comme un résultat : un
          versable trop élevé conduirait à se verser de l'argent déjà dû. */}
      {etat.tresorerie.incomplet && (
        <Bandeau ton="alerte" titre="Montants sous-évalués">
          {/* Le motif n'est plus seulement « recette hors barème » : l'impôt sur
              le revenu non provisionnable entre par la même porte, et le texte
              nommait une cause qui n'était pas toujours la bonne. Chaque motif
              se dit maintenant lui-même, ci-dessous. */}
          Une partie de ce qui est dû n’a pas pu être provisionnée. Les montants
          ci-dessous sont donc <strong>plus élevés que la réalité</strong>.
          <ul className={styles.motifs}>
            {etat.tresorerie.motifsIncomplets.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </Bandeau>
      )}

      {etat.tauxImpotIndisponible && etat.motifTauxImpot !== null && (
        <Bandeau ton="alerte" titre="Barème d’imposition manquant">
          {etat.motifTauxImpot}
        </Bandeau>
      )}

      {moisVu === mois
        ? (
          <FluxCard
            flux={flux}
            periode={moisLong(mois).toLowerCase()}
            onVersable={() => setCompose('versable')}
            dejaVerse={soldeEstSuivi(faits) ? verseCeMois : null}
            besoinMensuel={faits.besoinMensuel}
          />
        )
        : (
          <Suspense fallback={null}>
            <FluxAutreMois mois={moisVu} courant={mois} onRevenir={() => onMois?.(mois)} />
          </Suspense>
        )}

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

export function Bandeau(
  { ton, titre, children }: {
    ton: 'info' | 'alerte';
    titre: string;
    children: React.ReactNode;
  }
) {
  return (
    // `role="status"` plutôt que `alert` : ces bandeaux sont présents au
    // rendu, ils n'interrompent pas l'utilisateur en cours de tâche.
    <section className={`${styles.bandeau} ${ton === 'alerte' ? styles.bandeauAlerte : styles.bandeauInfo}`} role="status">
      <strong className={styles.bandeauTitre}>{titre}</strong>
      <div className={styles.bandeauCorps}>{children}</div>
    </section>
  );
}

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
export function salutation(prenom: string, nbSujets: number): string {
  const qui = prenom.trim() === '' ? 'Bonjour' : `Bonjour ${prenom.trim()}`;
  if (nbSujets === 0) return `${qui} — rien ne réclame ton attention.`;
  if (nbSujets === 1) return `${qui} — une décision t’attend.`;
  return `${qui} — ${EN_LETTRES[nbSujets] ?? String(nbSujets)} décisions t’attendent.`;
}
