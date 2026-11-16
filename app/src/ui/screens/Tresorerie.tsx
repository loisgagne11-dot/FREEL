import { Suspense, useEffect, useMemo, useState } from 'react';
import { adresseCourante, composantALaDemande, sousRouteSiEcran } from '../composantALaDemande';
import { useFaits } from '../../state/store';
import { etatArgent } from '../../state/selecteurs.argent';
import { estATraiter } from '../../domain/calculs/banque.etat';
import { Greet } from '../components/Greet';
import { Etiquette } from '../components/Etiquette';
import { Sheet } from '../components/Sheet';
import { ChoixAnnee } from '../components/ChoixAnnee';
import { useRoute } from '../useRoute';
import styles from './Argent.module.css';

/**
 * Le corps de la trésorerie — solde, répartition, enveloppes du dû, seuils,
 * projection —, différé : à lui seul il occupait 39,36 des 40 Ko du budget
 * d'un écran. Voir l'en-tête de son module.
 */
const CorpsTresorerie = composantALaDemande(() => import('./Argent.tresorerie')
  .then((m) => m.Tresorerie), true);

/** « Tu peux te verser » et la capacité de versement : voir `Argent.performance`. */
const VersementEtCapacite = composantALaDemande(() => import('./Argent.performance')
  .then((m) => m.VersementEtCapacite), true);

/**
 * Le relevé bancaire et son rapprochement : on importe un relevé une fois par
 * mois, consulter sa trésorerie n'a pas à en payer le téléchargement.
 */
const Releve = composantALaDemande(() => import('./Releve').then((m) => m.Releve), false);

export interface ProprietesTresorerie {
  /**
   * L'année affichée — celle du mois partagé par les écrans, tenu par `App`.
   * `undefined` retombe sur l'année de l'horloge : le cas des tests qui
   * montent cet écran seul.
   */
  readonly annee?: number;
  /**
   * De quoi la changer. L'écran porte sa commande d'année dans son en-tête
   * (lot 51 : la barre du haut n'en a plus) ; sans ce rappel, il n'en
   * affiche pas — plutôt qu'un menu qu'on tournerait sans effet.
   */
  readonly onAnnee?: (annee: number) => void;
}

/**
 * Écran Trésorerie — « combien j'ai là, pour de vrai, et combien je peux me
 * verser » (lot 51, décision 1).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A DÉMÉNAGÉ, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'écran Argent portait deux piliers, Trésorerie et Performance. Le second
 * mêlait deux questions : « combien je gagne » — le chiffre d'affaires, sa
 * composition, la dépendance client —, qui est une analyse de l'activité et
 * part dans Activité › Analyse ; et « combien je me verse », qui est de la
 * trésorerie et reste ici, sous le solde dont il découle.
 *
 * L'échéancier part dans Obligations, avec les registres : c'est ce qu'on
 * doit faire, pas ce qu'on a. La BANQUE arrive d'Achats : le relevé est la
 * source du solde que cet écran affiche, et son rapprochement se faisait sous
 * les dépenses, loin du chiffre qu'il corrige.
 *
 * Le contenu n'est pas redessiné : ce sont les mêmes cartes, déménagées. La
 * mise en page de la maquette `tresorerie.html` viendra avec leur lot.
 */
export function Tresorerie({ annee, onAnnee }: ProprietesTresorerie = {}) {
  const faits = useFaits((e) => e.faits);
  const { ecran, sousRoute } = useRoute();
  const routeIci = ecran.id === 'tresorerie' ? sousRoute : '';
  const [releveOuvert, setReleveOuvert] = useState(() => routeIci === 'releve');
  /* `#/tresorerie/releve` est un GESTE — l'action rapide « Importer un
     relevé », le pointage d'un versement : il ouvre le relevé, puis l'adresse
     redevient celle de l'écran. Fermer puis recharger ne doit pas le rouvrir. */
  useEffect(() => {
    if (routeIci !== 'releve') return;
    setReleveOuvert(true);
    window.location.replace('#/tresorerie');
  }, [routeIci]);

  // `undefined` explicite : `etatArgent` retombe alors sur sa propre valeur
  // par défaut (l'année de `maintenant`), au lieu qu'on la recalcule ici une
  // seconde fois avec le risque qu'elle diverge de celle du domaine.
  const etat = useMemo(
    () => etatArgent(faits, faits.echeances, new Date(), annee),
    [faits, annee]
  );
  const couverture = Math.round(etat.couvertureProvisions * 100);
  const operations = faits.mouvementsBancaires.length;
  const aRapprocher = faits.mouvementsBancaires.filter(estATraiter).length;

  return (
    <>
      <Greet
        titre="Ta trésorerie"
        sousTitre="Ce que tu as, ce que tu dois, ce que tu peux te verser — aujourd’hui et sur douze mois."
        repere={(
          /* La couverture du dû, et non le solde : le solde est déjà sur la
             première tuile, et le répéter n'apprend rien. Ce que l'en-tête
             ajoute, c'est la réponse à « si tout tombait demain, le compte
             suivrait-il ? ». */
          <Etiquette ton={couverture >= 100 ? 'ok' : 'attention'}>
            Dû · {couverture}&nbsp;% couvert
          </Etiquette>
        )}
        // La seule commande de période de l'écran : l'année. Le solde n'en
        // dépend pas — c'est un état, pas une période.
        {...(onAnnee === undefined ? {} : {
          actions: <ChoixAnnee annee={annee ?? new Date().getFullYear()} onAnnee={onAnnee} />
        })}
      />

      <div className={styles.sections}>
        <Suspense fallback={<p role="status" className={styles.vide}>Chargement…</p>}>
          <CorpsTresorerie etat={etat} />
          <VersementEtCapacite etat={etat} />
        </Suspense>

        {/* La banque, en bas, comme la maquette : une ligne qui dit où en est
            le relevé, et la porte pour l'ouvrir. Le nombre d'opérations à
            rapprocher se lit sans démasquer : ce n'est pas un montant. */}
        <section className={`${styles.carte} ${styles.banque}`} aria-labelledby="titre-banque">
          <div>
            <h2 id="titre-banque" className={styles.titreCarte}>Banque</h2>
            <p className={styles.vide}>
              {operations === 0
                ? 'Aucun relevé importé : ton solde reste celui que tu as saisi.'
                : `${operations} opération${operations > 1 ? 's' : ''} au relevé`
                  + (aRapprocher === 0 ? ', toutes traitées.' : ` · ${aRapprocher} à rapprocher`)}
            </p>
          </div>
          <button type="button" className={styles.lienRegistre} onClick={() => setReleveOuvert(true)}>
            {operations === 0 ? 'Importer un relevé' : 'Ouvrir le relevé'}
          </button>
        </section>
      </div>

      {/* Un plan de travail et non un tiroir : on y tranche opération par
          opération, et la liste des candidats a besoin de la largeur. */}
      <Sheet
        ouvert={releveOuvert}
        titre="Relevé bancaire"
        variante="atelier"
        onFermer={() => setReleveOuvert(false)}
      >
        {releveOuvert && (
          <Suspense fallback={<p role="status" className={styles.vide}>Chargement…</p>}>
            <Releve />
          </Suspense>
        )}
      </Sheet>
    </>
  );
}

// `#/tresorerie/releve` ouvert d'emblée : le relevé part avec l'écran, au lieu
// d'un « Chargement… » de plus une fois l'écran affiché.
if (sousRouteSiEcran('tresorerie', adresseCourante()) === 'releve') Releve.lancer();
