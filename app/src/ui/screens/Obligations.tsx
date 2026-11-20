import { Suspense, lazy, useEffect, useId, useMemo, useState } from 'react';
import type { DateISO } from '../../domain/types';
import { decaler } from '../../domain/calculs/calendrier';
import { useFaits } from '../../state/store';
import { dateDuJour } from '../../state/selecteurs';
import { obligationsEntre } from '../../state/selecteurs.obligations';
import { nombreAFaire } from '../../state/selecteurs.aTraiter';
import { composantALaDemande } from '../composantALaDemande';
import { Greet } from '../components/Greet';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toasts';
import { useRoute } from '../useRoute';
import { anneesDuSegment, titreObligations } from './Obligations.lecture';
import styles from './Argent.module.css';
import ob from './Obligations.module.css';

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

/**
 * Jusqu'où l'écran lit les obligations : la fin de l'année affichée, et au
 * moins une année devant soi — l'horizon de « à traiter ». Une limite plus
 * courte aurait caché, en décembre, l'URSSAF du quatrième trimestre que le
 * titre annonce pour janvier.
 */
const HORIZON_JOURS = 366;

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
 * Écran Obligations — ce qu'on doit déclarer, payer ou fournir (lots 51, 53).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE SOURCE, `obligationsEntre`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le titre, la frise, la liste et les dossiers lisent la même liste
 * d'obligations — prévues par les règles et saisies, fusionnées. Le NOMBRE
 * du titre, lui, vient de `nombreAFaire` : la fonction de la pastille du
 * rail. Un titre qui compterait de son côté aurait dit « une chose » sous une
 * pastille « 4 » dès quatre périodes à déclarer réunies en un sujet.
 *
 * Les registres restent ici : le livre des recettes, la TVA et la DES sont
 * ceux qu'on présente à un contrôle, et on les cherche au même endroit que
 * ce qu'on déclare avec eux.
 */
export function Obligations({ annee, onAnnee }: ProprietesObligations = {}) {
  const faits = useFaits((e) => e.faits);
  const signaler = useToast();
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

  const aujourdhui = dateDuJour();
  const anneeVue = annee ?? Number(aujourdhui.slice(0, 4));
  const fin = [`${anneeVue}-12-31`, decaler(aujourdhui, HORIZON_JOURS)].sort().at(-1) as DateISO;
  const toutes = useMemo(
    () => obligationsEntre(faits, '1970-01-01' as DateISO, fin, aujourdhui),
    [faits, fin, aujourdhui]
  );
  const nombre = useMemo(() => nombreAFaire(faits, 'obligations'), [faits]);
  const annees = anneesDuSegment(toutes, aujourdhui, anneeVue);

  /* Le calendrier se fabrique au clic : son générateur et le téléchargement
     n'ont rien à faire dans le paquet de l'écran, qu'on ouvre pour lire. */
  async function ajouterAuCalendrier(): Promise<void> {
    const [{ calendrierDesObligations }, { telecharger }] = await Promise.all([
      import('../../state/selecteurs.calendrier'),
      import('../../infra/telechargement')
    ]);
    const maintenant = new Date();
    telecharger(
      `freel-obligations-${aujourdhui}.ics`,
      calendrierDesObligations(faits, maintenant, aujourdhui),
      'text/calendar;charset=utf-8'
    );
    signaler(PHRASE_CALENDRIER);
  }

  return (
    <>
      <Greet
        titre={titreObligations(nombre, toutes, aujourdhui)}
        sousTitre="Ce que tu dois déclarer, payer ou fournir — avec les chiffres pour le faire."
        actions={(
          <div className={ob.outils}>
            {onAnnee !== undefined && (
              /* Un segment, comme la maquette : les années se comptent sur
                 une main, et un menu déroulant cachait celle qu'on regarde. */
              <div className={ob.segment} role="group" aria-label="Année">
                {annees.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={a === anneeVue ? `${ob.option} ${ob.choisie}` : ob.option}
                    aria-pressed={a === anneeVue}
                    onClick={() => onAnnee(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className={ob.bouton}
              aria-describedby={`${idGroupe}-calendrier`}
              onClick={() => { void ajouterAuCalendrier(); }}
            >
              Ajouter au calendrier
            </button>
            {/* La promesse se dit AVANT le clic : sans serveur, rien ne
                s'abonne, et un agenda qui ne se met plus à jour seul serait
                une surprise découverte en retard. */}
            <span id={`${idGroupe}-calendrier`} className={ob.horsEcran}>{PHRASE_CALENDRIER}</span>
          </div>
        )}
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

/** Décision du propriétaire du 17/11 (décision 25) : un fichier, pas un abonnement. */
const PHRASE_CALENDRIER = 'Un fichier à importer dans ton agenda ; sans serveur, il ne se met pas à jour seul.';
