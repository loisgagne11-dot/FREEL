import { Suspense, lazy, useEffect, useId, useMemo, useState } from 'react';
import type { DateISO } from '../../domain/types';
import { decaler } from '../../domain/calculs/calendrier';
import { type Obligation, duSaisi } from '../../domain/calculs/obligations';
import type { Echeance } from '../../domain/calculs/provisions';
import { useFaits } from '../../state/store';
import { dateDuJour } from '../../state/selecteurs';
import { obligationsEntre } from '../../state/selecteurs.obligations';
import { nombreAFaire } from '../../state/selecteurs.aTraiter';
import { composantALaDemande } from '../composantALaDemande';
import { CartePliable } from '../components/CartePliable';
import { Greet } from '../components/Greet';
import { Montant } from '../components/Montant';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toasts';
import { useRoute } from '../useRoute';
import { eur } from '../format';
import {
  anneesDuSegment, dateDe, etapeEnCours, jourMois, listeDeLAnnee, titreObligations
} from './Obligations.lecture';
import { FriseObligations, LegendeFrise } from './Obligations.frise';
import { ListeObligations } from './Obligations.liste';
import type { ChampsEcheance } from './Obligations.saisie';
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

/**
 * La saisie d'une échéance, au clic : huit champs, un aperçu du solde de
 * l'avis, la répétition — rien que l'écran n'ait à porter pour qu'on le lise.
 */
const PanneauSaisie = lazy(() => import('./Obligations.saisie')
  .then((m) => ({ default: m.PanneauSaisie })));

/** Ce que le panneau de saisie reçoit : l'échéance à corriger, ou ce qu'un dossier sait déjà. */
type Saisie = { readonly initiale: Echeance | null; readonly prerempli?: Partial<ChampsEcheance> };

/**
 * Le pli de la liste vivait sous la clé de la Trésorerie, d'où venait
 * l'échéancier (`freel.pli.argent`, « echeancier ») : il passe sous celle de
 * l'écran qui le porte, une fois, sans perdre l'état choisi — une liste
 * repliée exprès ne se rouvre pas d'elle-même au changement d'écran.
 */
let pliRepris = false;
export const reprendreLePli = Object.assign((): void => {
  if (pliRepris) return;
  pliRepris = true;
  try {
    const ancien: unknown = JSON.parse(window.localStorage.getItem('freel.pli.argent') ?? 'null');
    if (typeof ancien !== 'object' || ancien === null) return;
    const valeur = (ancien as Record<string, unknown>)['echeancier'];
    if (typeof valeur !== 'boolean') return;
    const brut: unknown = JSON.parse(window.localStorage.getItem('freel.pli.obligations') ?? '{}');
    const nouveau = typeof brut === 'object' && brut !== null ? brut as Record<string, unknown> : {};
    if (typeof nouveau['echeancier'] !== 'boolean') {
      window.localStorage.setItem('freel.pli.obligations', JSON.stringify({ ...nouveau, echeancier: valeur }));
    }
    const { echeancier: _, ...reste } = ancien as Record<string, unknown>;
    window.localStorage.setItem('freel.pli.argent', JSON.stringify(reste));
  } catch {
    // Stockage indisponible : la liste s'ouvre dépliée, rien n'est perdu.
  }
}, {
  /** Pour les tests : la reprise se fait une fois par chargement de page. */
  reinitialiser: (): void => { pliRepris = false; }
});

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
  const deLAnnee = useMemo(
    () => toutes.filter((o) => dateDe(o).startsWith(String(anneeVue))),
    [toutes, anneeVue]
  );
  const liste = useMemo(() => listeDeLAnnee(toutes, anneeVue, aujourdhui), [toutes, anneeVue, aujourdhui]);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<Saisie | null>(null);
  reprendreLePli();

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

      <div className={ob.page}>
        <section className={ob.carte} aria-labelledby={`${idGroupe}-annee`}>
          <div className={ob.entete}>
            <h2 id={`${idGroupe}-annee`} className={ob.titreCarte}>L’année {anneeVue}</h2>
            <LegendeFrise classe={ob.legendeHaut} />
          </div>
          <FriseObligations obligations={deLAnnee} annee={anneeVue} aujourdhui={aujourdhui} />
        </section>

        <CartePliable
          id="echeancier"
          ecran="obligations"
          classe={ob.pliable}
          titre="À faire et à venir"
          resume={<ResumeReplie toutes={toutes} aFaire={liste.aFaire} />}
          actions={(
            <button type="button" className={ob.saisir} onClick={() => setSaisie({ initiale: null })}>
              + Saisir
            </button>
          )}
        >
          <ListeObligations
            aFaire={liste.aFaire}
            faites={liste.faites}
            aujourdhui={aujourdhui}
            ouverte={choisie}
            onOuvrir={(o) => setChoisie(o.id)}
          />
          {/* Une liste sans échéance saisie n'est pas une bonne nouvelle : le
              dû ne connaît alors que des estimations. */}
          {faits.echeances.length === 0 && (
            <p className={ob.alerte}>
              Aucune échéance saisie&nbsp;: tant qu’il n’y en a pas, ton disponible et ce qui est à te
              verser sont <strong>surestimés</strong>.
            </p>
          )}
        </CartePliable>

        <div className={`${styles.sections} ${styles.obligations}`}>
          <Suspense fallback={<p role="status" className={styles.vide}>Chargement…</p>}>
            <Echeancier />
          </Suspense>
        </div>
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
        ouvert={saisie !== null}
        titre={saisie?.initiale === null || saisie === null ? 'Saisir une échéance' : 'Corriger l’échéance'}
        onFermer={() => setSaisie(null)}
      >
        {saisie !== null && (
          <Suspense fallback={<p role="status" className={styles.vide}>Chargement…</p>}>
            <PanneauSaisie
              initiale={saisie.initiale}
              prerempli={saisie.prerempli}
              aujourdhui={aujourdhui}
              onFermer={() => setSaisie(null)}
            />
          </Suspense>
        )}
      </Sheet>

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

/**
 * Ce que la liste dit une fois repliée : ce qui reste à payer et la
 * prochaine limite — les deux questions qu'on se pose sans la déplier. Le
 * reste à payer est le dû saisi (`duSaisi`), au centime le volet des appels :
 * une obligation prévue n'y entre pas, la provision la porte déjà.
 */
function ResumeReplie({ toutes, aFaire }: { readonly toutes: readonly Obligation[]; readonly aFaire: readonly Obligation[] }) {
  const du = duSaisi(toutes);
  const prochaine = aFaire.map(etapeEnCours).find((e) => e !== null && e.limite.statut !== 'refuse');
  if (du === 0 && prochaine === undefined) return <>Rien à faire ni à venir.</>;
  return (
    <>
      {du > 0 && <><Montant>{eur(du)}</Montant> à payer</>}
      {du > 0 && prochaine !== undefined && ' · '}
      {prochaine !== undefined && prochaine !== null && prochaine.limite.statut !== 'refuse'
        && <>prochaine limite le {jourMois(prochaine.limite.valeur)}</>}
    </>
  );
}

/** Décision du propriétaire du 17/11 (décision 25) : un fichier, pas un abonnement. */
const PHRASE_CALENDRIER = 'Un fichier à importer dans ton agenda ; sans serveur, il ne se met pas à jour seul.';
