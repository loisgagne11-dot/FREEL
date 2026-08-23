import { Suspense, lazy, useMemo, useState } from 'react';
import { euros } from '../../domain/types';
import { useFaits } from '../../state/store';
import {
  aTraiter, etatPilote, fluxDuMois, moisCourant, remunerationDuMois, soldeEstSuivi
} from '../../state/selecteurs';
import { Greet } from '../components/Greet';
import { ActionsRapides } from '../components/ActionsRapides';
import { FluxCard } from '../components/FluxCard';
import { SanteCard, indicateursDeSante } from '../components/SanteCard';
import { eur, moisLong, moisTexte } from '../format';
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
import { Info } from '../components/Info';
import type { CleComposition } from '../../domain/calculs/composition';

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
export function Pilote() {
  const faits = useFaits((e) => e.faits);
  const chargement = useFaits((e) => e.chargement);
  const [compose, setCompose] = useState<CleComposition | null>(null);

  const mois = moisCourant();
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
    const impayees = flux.entrees.lignes.filter((l) => !l.regle);
    const periodes = sujets.find((x) => x.id === 'periodes-a-declarer');
    return indicateursDeSante({
      dispo: etat.tresorerie.dispo,
      provisions: etat.tresorerie.provisions,
      impayes: impayees.length,
      montantImpaye: flux.entrees.enAttente,
      periodesEnRetard: periodes?.nombre ?? 0
    });
  }, [flux, etat, sujets]);

  return (
    <>
      <Greet
        titre={salutation(faits.entreprise.nom)}
        sousTitre={phraseDAccueil(sujets.length, moisLong(mois))}
        repere={<>Solde compte · <Montant>{eur(etat.tresorerie.solde)}</Montant></>}
      />

      {/* Juste sous l'accueil, avant tout chiffre : c'est l'ordre de la spec, et
          c'est celui de l'usage — on ouvre l'application pour faire quelque
          chose au moins aussi souvent que pour regarder où l'on en est. */}
      <ActionsRapides />

      {chargement.phase === 'sans-persistance' && (
        <Bandeau ton="alerte" titre="Tes saisies ne sont pas conservées">
          {chargement.motif}
        </Bandeau>
      )}

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

      <section className={styles.versable} aria-labelledby="titre-versable">
        <h2 id="titre-versable" className={styles.libelle}>Je peux me verser</h2>
        {/*
          * LE CHIFFRE PRINCIPAL S'OUVRE COMME LES AUTRES.
          *
          * C'est celui sur lequel on décide — et donc celui qu'on a le plus de
          * raisons de vouloir vérifier avant de virer l'argent. Le laisser seul
          * non cliquable, alors que les quatre tuiles du dessous s'ouvrent,
          * aurait fait exactement l'inverse de ce que ce lot cherche.
          */}
        <button
          type="button"
          className={styles.montantPrincipal}
          onClick={() => setCompose('versable')}
        >
          <Montant>{eur(etat.tresorerie.versable)}</Montant>
          <span className={styles.horsEcran}> — d’où vient ce chiffre</span>
          <span className={styles.chevronPrincipal} aria-hidden="true">›</span>
        </button>
        <p className={styles.sousLigne}>
          Autonomie&nbsp;: {moisTexte(etat.autonomie)}
          {faits.besoinMensuel <= 0 && (
            <span className={styles.note}> — renseigne ton besoin mensuel pour la calculer</span>
          )}
        </p>
        {/* Ce qui est DÉJÀ sorti ce mois-ci. Sans cette ligne, « je peux me
            verser 3 000 » se lit comme « en plus », alors qu'on s'est
            peut-être déjà versé 2 500 le 5. */}
        {soldeEstSuivi(faits) && (
          <p className={styles.sousLigne}>
            Déjà versé ce mois&nbsp;: <Montant>{eur(verseCeMois)}</Montant>
            {faits.besoinMensuel > 0 && verseCeMois < faits.besoinMensuel && (
              <span className={styles.note}>
                {' '}— il manque <Montant>{eur(euros(faits.besoinMensuel - verseCeMois))}</Montant>
                {' '}pour couvrir ton besoin
              </span>
            )}
            <Info libelle="D’où vient ce chiffre">
              Des virements du relevé que tu as marqués «&nbsp;rémunération
              que je me suis versée&nbsp;», dans Achats&nbsp;› Relevé bancaire.
              Se verser de l’argent n’est pas une opération comptable en
              micro&nbsp;: la personne et l’entreprise sont la même. Le virement
              est déjà au relevé — il n’y a rien à saisir, seulement à nommer.
            </Info>
          </p>
        )}
      </section>

      <FluxCard
        flux={flux}
        periode={moisLong(mois)}
        versementPossible={etat.tresorerie.versable > 0}
      />

      <SanteCard indicateurs={sante} autonomie={etat.autonomie} />

      <div className={styles.grille}>
        <Chiffre
          libelle="Solde"
          valeur={eur(etat.tresorerie.solde)}
          onOuvrir={() => setCompose('solde')}
          {...(soldeEstSuivi(faits)
            ? {}
            : { precision: 'saisi, aucun relevé importé' })}
        />
        <Chiffre
          libelle="À garder de côté"
          valeur={eur(etat.tresorerie.provisions)}
          ton={etat.tresorerie.provisions > 0 ? 'attention' : 'neutre'}
          onOuvrir={() => setCompose('provisions')}
        />
        <Chiffre
          libelle="Disponible"
          valeur={eur(etat.tresorerie.dispo)}
          ton={etat.tresorerie.dispo < 0 ? 'danger' : 'neutre'}
          onOuvrir={() => setCompose('disponible')}
        />
        {/* Le seuil de sécurité ne s'ouvre pas : c'est un réglage, pas un
            résultat. Il n'a pas de termes — il se change dans Config. */}
        <Chiffre libelle="Seuil de sécurité" valeur={eur(etat.tresorerie.reserve)} />
      </div>

      <section className={styles.carte} aria-labelledby="titre-provisions">
        <h2 id="titre-provisions" className={styles.titreCarte}>Ce que je dois</h2>
        <dl className={styles.detail}>
          <div className={styles.ligne}>
            <dt>Échéances à payer</dt>
            <dd><Montant>{eur(etat.voletConstate)}</Montant></dd>
          </div>
          <div className={styles.ligne}>
            <dt>
              Charges sur recettes encaissées
              <span className={styles.aide}>
                non encore déclarées — la dette naît à l’encaissement
              </span>
            </dt>
            <dd><Montant>{eur(etat.voletAProvisionner)}</Montant></dd>
          </div>
          <div className={`${styles.ligne} ${styles.total}`}>
            <dt>Total</dt>
            <dd><Montant>{eur(etat.tresorerie.provisions)}</Montant></dd>
          </div>
        </dl>
      </section>

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

function Bandeau(
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

/**
 * La tuile de chiffre du Pilote.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE N'EST PAS `components/Chiffre`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les deux se ressemblent à s'y méprendre, et la tentation de les fondre est
 * revenue à chaque lot. Elles diffèrent sur un point que le dessin tranche :
 * le Pilote met ses libellés en CAPITALES ESPACÉES, l'écran Argent en casse
 * ordinaire — et le commentaire de `Chiffre.module.css` dit pourquoi il a
 * fallu les y retirer. Les fondre imposerait une casse aux deux écrans, ou
 * ajouterait une variante à un composant partagé pour un seul appelant.
 *
 * L'invariant « une source unique par notion » vise les CALCULS : deux
 * additions du même montant finissent par diverger. Deux mises en forme
 * distinctes de deux dessins distincts ne divergent pas — elles sont déjà
 * différentes, et à dessein.
 */
function Chiffre(
  { libelle, valeur, ton = 'neutre', precision, onOuvrir }: {
    libelle: string;
    valeur: string;
    ton?: 'neutre' | 'attention' | 'danger';
    /**
     * D'où sort le chiffre, quand ce n'est pas évident.
     *
     * Un solde sans relevé importé n'est pas suivi : c'est le montant saisi,
     * figé. L'afficher comme les autres le ferait lire comme une position
     * bancaire à jour — et une position bancaire fausse commande de mauvaises
     * décisions de trésorerie.
     */
    precision?: string;
    /**
     * Ce qui s'ouvre au clic : la composition du chiffre.
     *
     * Absent sur le seuil de sécurité, qui n'a pas de formule — c'est un
     * réglage, pas un résultat. Une tuile qui s'ouvrirait sur « seuil de
     * sécurité = seuil de sécurité » apprendrait à ne plus cliquer sur les
     * trois autres.
     */
    onOuvrir?: () => void;
  }
) {
  const classeTon = ton === 'danger' ? styles.danger : ton === 'attention' ? styles.attention : '';
  const contenu = (
    <>
      <span className={styles.libelle}>{libelle}</span>
      <span className={`${styles.montant} ${classeTon}`}><Montant>{valeur}</Montant></span>
      {precision !== undefined && <span className={styles.precision}>{precision}</span>}
    </>
  );

  if (onOuvrir === undefined) return <div className={styles.chiffre}>{contenu}</div>;

  return (
    <button type="button" className={`${styles.chiffre} ${styles.cliquable}`} onClick={onOuvrir}>
      {contenu}
      {/* Le nom accessible du bouton est son contenu, qui décrit le chiffre et
          non le geste : entendu au clavier, il ne dit pas ce que la touche
          Entrée va faire. Le chevron fait le même travail à l'œil. */}
      <span className={styles.horsEcran}> — d’où vient ce chiffre</span>
      <span className={styles.chevron} aria-hidden="true">›</span>
    </button>
  );
}

/**
 * « Bonjour » suivi du nom, quand on le connaît.
 *
 * Le nom vient de la configuration de l'utilisateur, jamais du code : rien
 * d'identifiant n'est écrit dans le dépôt. Tant qu'il n'est pas renseigné,
 * on salue sans nommer plutôt que d'afficher un « Bonjour  » amputé.
 */
function salutation(nom: string): string {
  const propre = nom.trim();
  return propre === '' ? 'Bonjour' : `Bonjour ${propre}`;
}

/**
 * Ce qui attend, en une phrase.
 *
 * La spec ouvre le Pilote sur « quatre décisions t'attendent » — un état
 * qu'on lit en une seconde, là où quatre tuiles demandent d'être comparées.
 * Le cas « rien à traiter » n'est pas un vide à masquer : c'est la bonne
 * nouvelle de la journée, et elle mérite d'être dite.
 */
function phraseDAccueil(nbSujets: number, mois: string): string {
  if (nbSujets === 0) return `Rien ne demande ton attention en ${mois.toLowerCase()}.`;
  return nbSujets === 1
    ? `Une décision t’attend en ${mois.toLowerCase()}.`
    : `${nbSujets} décisions t’attendent en ${mois.toLowerCase()}.`;
}
