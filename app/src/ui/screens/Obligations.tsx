import { Suspense, lazy, useEffect, useId, useState } from 'react';
import { composantALaDemande } from '../composantALaDemande';
import { Greet } from '../components/Greet';
import { Sheet } from '../components/Sheet';
import { ChoixAnnee } from '../components/ChoixAnnee';
import { useRoute } from '../useRoute';
import styles from './Argent.module.css';

/**
 * L'échéancier : frise de l'année, liste des appels, périodes URSSAF — le
 * corps de l'écran. Dans son propre module depuis qu'il vivait sous la
 * Trésorerie ; il arrive avec l'écran, téléchargé au repos.
 */
const Echeancier = composantALaDemande(() => import('./Argent.echeancier')
  .then((m) => m.Echeancier), true);

/**
 * Les trois registres, chacun à l'ouverture de son panneau : on les ouvre
 * pour justifier ou déclarer — quatre fois par an pour la TVA, une fois par
 * mois au plus pour la DES —, et regarder ses échéances n'a pas à en payer le
 * téléchargement.
 */
const LivreDesRecettes = lazy(() => import('./Argent.livre')
  .then((m) => ({ default: m.LivreDesRecettes })));
const DeclarationServices = lazy(() => import('./Argent.des')
  .then((m) => ({ default: m.DeclarationServices })));
const DossierTvaPanneau = lazy(() => import('./Argent.tva')
  .then((m) => ({ default: m.DossierTvaPanneau })));

/** Le registre ouvert par-dessus l'écran, ou aucun. */
type Registre = 'livre' | 'des' | 'tva';

const TITRES: Readonly<Record<Registre, string>> = {
  tva: 'Déclaration de TVA',
  livre: 'Livre des recettes',
  des: 'Déclaration européenne de services'
};

const estRegistre = (r: string): r is Registre => r === 'livre' || r === 'des' || r === 'tva';

export interface ProprietesObligations {
  /**
   * L'année affichée — celle du mois partagé par les écrans, tenu par `App`.
   * `undefined` retombe sur l'année de l'horloge : le cas des tests qui
   * montent cet écran seul.
   */
  readonly annee?: number;
  /** De quoi la changer, depuis l'en-tête. Absent, l'écran n'en affiche pas la commande. */
  readonly onAnnee?: (annee: number) => void;
}

/**
 * Écran Obligations — ce qu'on doit déclarer et payer (lot 51, décision 1).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI L'ÉCHÉANCIER QUITTE LA TRÉSORERIE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Il en était le dernier bloc, sous la ligne de flottaison : on y arrivait en
 * défilant la question « combien j'ai », alors qu'il répond à une autre —
 * « qu'est-ce que je dois faire, et pour quand ». La maquette lui donne son
 * entrée, avec un compteur : ce qui est en retard se voit du rail, sans ouvrir
 * l'écran.
 *
 * Les REGISTRES le rejoignent : le livre des recettes (qui quitte le pied du
 * rail et les Réglages), la TVA et la DES. Ce sont ceux qu'on présente à un
 * contrôle, et on les cherche au même endroit que ce qu'on déclare avec eux.
 *
 * Rien d'autre n'arrive ici dans ce lot : les pièces à fournir aux clients,
 * l'export vers un calendrier et les dossiers de déclaration sont au lot 53.
 * La mise en page fine — la frise sur toute la largeur, le détail d'une
 * période à côté de la liste — viendra avec lui.
 */
export function Obligations({ annee, onAnnee }: ProprietesObligations = {}) {
  const { ecran, sousRoute } = useRoute();
  const routeIci = ecran.id === 'obligations' ? sousRoute : '';
  const [registre, setRegistre] = useState<Registre | null>(
    () => (estRegistre(routeIci) ? routeIci : null)
  );
  /* `#/obligations/livre` et `#/obligations/tva` sont des GESTES, comme
     `#/activite/conges` : ils ouvrent le panneau, puis l'adresse redevient
     celle de l'écran — fermer le panneau puis recharger ne doit pas le
     rouvrir. Le lien « Suivi & déclaration TVA » du registre des achats y
     mène : la déclaration se prépare depuis la dépense qu'on vient de
     justifier, pas en cherchant le bouton ici. */
  useEffect(() => {
    if (!estRegistre(routeIci)) return;
    setRegistre(routeIci);
    window.location.replace('#/obligations');
  }, [routeIci]);
  const idGroupe = useId();
  const anneeVue = annee ?? new Date().getFullYear();

  return (
    <>
      <Greet
        titre="Tes obligations"
        sousTitre="Ce que tu dois déclarer et payer, avec les chiffres pour le faire."
        {...(onAnnee === undefined ? {} : {
          actions: <ChoixAnnee annee={anneeVue} onAnnee={onAnnee} />
        })}
      />

      <div className={`${styles.sections} ${styles.obligations}`}>
        <Suspense fallback={<p role="status" className={styles.vide}>Chargement…</p>}>
          <Echeancier annee={anneeVue} />
        </Suspense>
      </div>

      {/* Les registres : atteints d'ici, ouverts par-dessus. Un panneau plutôt
          qu'une carte : on ne les consulte qu'au moment de justifier ou de
          déclarer, et ils tiennent alors tout l'écran. */}
      <div className={styles.registres} role="group" aria-label="Registres">
        <button type="button" className={styles.lienRegistre} onClick={() => setRegistre('tva')}>
          Préparer ma déclaration de TVA
        </button>
        <button type="button" className={styles.lienRegistre} onClick={() => setRegistre('livre')}>
          Livre des recettes
        </button>
        <button type="button" className={styles.lienRegistre} onClick={() => setRegistre('des')}>
          Déclaration européenne de services
        </button>
      </div>

      <Sheet
        ouvert={registre !== null}
        titre={registre === null ? '' : TITRES[registre]}
        onFermer={() => setRegistre(null)}
      >
        {registre !== null && (
          <Suspense fallback={<p role="status" className={styles.vide}>Chargement…</p>}>
            {registre === 'livre' && <LivreDesRecettes idGroupe={idGroupe} />}
            {registre === 'des' && <DeclarationServices idGroupe={idGroupe} />}
            {registre === 'tva' && <DossierTvaPanneau />}
          </Suspense>
        )}
      </Sheet>
    </>
  );
}
