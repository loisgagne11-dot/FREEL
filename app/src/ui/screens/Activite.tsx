import { Suspense, lazy, useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { dateDuJour, moisCourant } from '../../state/selecteurs';
import {
  type PoidsClient,
  craDuMoisParMission, etatActivite, planningDeLaSemaine
} from '../../state/selecteurs.activite';
import { VueSemaine } from '../components/VueSemaine';
import { CraCard } from '../components/CraCard';
import { useToast } from '../components/Toasts';
import type { Jour, NatureJour } from '../../domain/calculs/activite';
import { joursCongeables } from '../../domain/calculs/activite';
import { CartePliable } from '../components/CartePliable';
import { ecartDePrevision, totaliserPrevisions } from '../../domain/calculs/prevision';
import {
  type PrevisionDeMission, type RapportDeMission, type TarifDeLaJournee,
  previsionDuMoisParMission, rapportParMission, tarifDeLaJournee
} from '../../state/selecteurs.activite';

import type { DateISO, Mois } from '../../domain/types';
import type { Mission } from '../../state/schema';
import { dateISO, euros } from '../../domain/types';
import { Greet } from '../components/Greet';
import { Info } from '../components/Info';
import { Onglets, PanneauOnglet } from '../components/Onglets';
import { Sheet } from '../components/Sheet';
import { dateCourte, eur, formaterJours } from '../format';
import styles from './Activite.module.css';
import { Montant } from '../components/Montant';

/**
 * Les formulaires arrivent à l'ouverture de leur panneau.
 *
 * Ils ne servent qu'à un geste explicite — créer, modifier — et pèsent le tiers
 * de cet écran. Consulter son planning, ce qu'on fait dix fois pour une
 * modification, n'a pas à payer leur téléchargement.
 */
const FormulaireClient = lazy(() => import('./Activite.formulaires')
  .then((m) => ({ default: m.FormulaireClient })));
const FormulaireMission = lazy(() => import('./Activite.formulaires')
  .then((m) => ({ default: m.FormulaireMission })));

/**
 * L'onglet Clients arrive à l'ouverture de son onglet.
 *
 * Même motif que les formulaires : le carnet se consulte à la création d'un
 * client puis rarement, et le plan de charge — ce qu'on ouvre dix fois par
 * semaine — n'a aucune raison d'en payer le téléchargement.
 */
const OngletClients = lazy(() => import('./Activite.clients')
  .then((m) => ({ default: m.OngletClients })));

/** L'onglet Missions, même motif : une liste qu'on ouvre pour modifier. */
const OngletMissions = lazy(() => import('./Activite.missions')
  .then((m) => ({ default: m.OngletMissions })));

/** L'attente d'un formulaire, dans son panneau. Sobre : elle dure un instant. */
function EnAttenteDeFormulaire() {
  return (
    <p role="status" style={{ color: 'var(--muted-2)', fontSize: '13px' }}>
      Chargement…
    </p>
  );
}

/**
 * Écran Activité — plan de charge, missions et délais de paiement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CALENDRIER EST DANS LA PAGE, PAS DANS UNE FENÊTRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne version ouvrait les congés dans une modale : on ne pouvait pas
 * voir en même temps les jours posés et leur effet sur l'occupation, alors que
 * c'est exactement la question qu'on se pose en les posant. Le design cible le
 * met dans le flux de la page, et le taux d'occupation se met à jour sous les
 * yeux.
 *
 * Aucun chiffre n'est écrit ici : jours ouvrables, fériés et occupation
 * viennent de `domain/calculs/activite.ts`.
 */

type Section = 'charge' | 'missions' | 'clients';

const SECTIONS = [
  { id: 'charge' as Section, libelle: 'Plan de charge' },
  { id: 'missions' as Section, libelle: 'Missions' },
  { id: 'clients' as Section, libelle: 'Clients' }
];

/** Lundi en tête : la semaine française commence le lundi, pas le dimanche. */
const JOURS_SEMAINE = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function Activite() {
  const faits = useFaits((e) => e.faits);
  const basculerConge = useFaits((e) => e.basculerConge);
  const ajusterJour = useFaits((e) => e.ajusterJour);
  const retirerAjustements = useFaits((e) => e.retirerAjustements);
  const signaler = useToast();

  const [section, setSection] = useState<Section>('charge');
  const [panneau, setPanneau] = useState<Panneau>({ type: 'ferme' });
  const [mois, setMois] = useState<Mois>(() => moisCourant());
  const idGroupe = useId();

  const etat = useMemo(() => etatActivite(faits, mois), [faits, mois]);
  // Même source que le CRA : rythmes, ajustements, fériés et congés. En
  // produire une seconde version garantirait qu'elles divergent.
  const previsions = useMemo(
    () => previsionDuMoisParMission(faits, mois), [faits, mois]
  );
  // Sur l'ANNÉE et non sur le mois : « quelle mission me rapporte quoi » est
  // une question commerciale, et un mois de congés ou un mois creux ferait
  // passer une bonne mission pour une mauvaise.
  const rapports = useMemo(
    () => rapportParMission(faits, Number(mois.slice(0, 4))), [faits, mois]
  );
  const tarif = useMemo(
    () => tarifDeLaJournee(faits, Number(mois.slice(0, 4))), [faits, mois]
  );

  const [vue, setVue] = useState<'mois' | 'semaine'>('mois');
  const [ancreSemaine, setAncreSemaine] = useState<DateISO>(() => dateDuJour());
  /** Journée déclarée sur un créneau vide, en attente de savoir à qui elle est. */
  const [aRattacher, setARattacher] = useState<
    { readonly date: DateISO; readonly possibles: readonly Affectation[] } | null
  >(null);
  const semaine = useMemo(
    () => planningDeLaSemaine(faits, ancreSemaine), [faits, ancreSemaine]
  );
  const cras = useMemo(() => craDuMoisParMission(faits, mois), [faits, mois]);

  /**
   * Le tour d'un créneau : journée → demi-journée → rien → retour au rythme.
   *
   * « Retour au rythme » efface l'ajustement au lieu d'en poser un à zéro.
   * Sans cet état, une correction serait définitive : le jour resterait à
   * zéro même après un changement de rythme, et rien ne permettrait de
   * revenir en arrière.
   */
  /**
   * Les flèches suivent la vue.
   *
   * En vue semaine, avancer d'un mois ferait sauter quatre semaines : la
   * flèche cesserait de vouloir dire « la suivante », et on ne saurait plus
   * où l'on est. Le mois suit tout de même la semaine, pour que le retour à
   * la vue mensuelle tombe au bon endroit.
   */
  function decalerSemaine(pas: number): void {
    const d = new Date(`${ancreSemaine}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + pas * 7);
    const nouvelle = d.toISOString().slice(0, 10) as DateISO;
    setAncreSemaine(nouvelle);
    setMois(nouvelle.slice(0, 7) as Mois);
  }

  const enSemaine = vue === 'semaine' && section === 'charge';
  const reculer = () => (enSemaine ? decalerSemaine(-1) : setMois(decalerMois(mois, -1)));
  const avancer = () => (enSemaine ? decalerSemaine(1) : setMois(decalerMois(mois, 1)));

  /**
   * Fait tourner la quotité d'une ligne : journée → demi-journée → rien →
   * retour au rythme.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * UN CRÉNEAU VIDE NE DIT PAS À QUI LA JOURNÉE APPARTIENT
   * ─────────────────────────────────────────────────────────────────────────
   *
   * Cliquer un créneau vide déclare une journée que le rythme ne prévoyait
   * pas. Encore faut-il savoir à quelle mission la rattacher : avec une seule
   * affectation possible il n'y a pas de question, avec deux le choix devient
   * arbitraire.
   *
   * La première version en choisissait une en silence — la première mission
   * active. C'est précisément ce que cette application refuse partout
   * ailleurs : l'écran propose, l'utilisateur tranche. Une journée rattachée
   * au mauvais client fausse deux CRA d'un coup, celui qui la reçoit à tort
   * et celui à qui elle manque, et rien ne le signale.
   */
  function ajusterAuClic(date: DateISO, _missionId: string, entiteId: string): void {
    const jour = semaine.jours.find((j) => j.date === date);
    const ligne = jour?.parMission.find((l) => l.entiteId === entiteId);

    if (ligne !== undefined) {
      faireTourner(date, ligne.missionId, ligne.entiteId, ligne.retenu, ligne.ajuste);
      return;
    }

    const possibles = affectationsPossibles(faits);
    if (possibles.length === 0) return;
    if (possibles.length === 1) {
      const seule = possibles[0] as Affectation;
      faireTourner(date, seule.missionId, seule.entiteId, 0, false);
      return;
    }
    // Plusieurs candidats : on demande, on ne devine pas.
    setARattacher({ date, possibles });
  }

  function faireTourner(
    date: DateISO, missionId: string, entiteId: string, retenu: number, ajuste: boolean
  ): void {
    if (!ajuste) ajusterJour(missionId, entiteId, date, retenu >= 1 ? 0.5 : 1);
    else if (retenu >= 1) ajusterJour(missionId, entiteId, date, 0.5);
    else if (retenu > 0) ajusterJour(missionId, entiteId, date, 0);
    else ajusterJour(missionId, entiteId, date, null);
  }

  return (
    <>
      <Greet
        titre="Activité"
        sousTitre="Les congés posés sortent du dénominateur : le même travail sur moins de jours fait monter l’occupation."
        actions={(
          <>
            {section === 'missions' && etat.missions.length > 0 && (
              <button type="button" className={styles.actionPrincipale}
                onClick={() => setPanneau({ type: 'mission', id: null })}>
                Ajouter une mission
              </button>
            )}
            {section === 'clients' && faits.clients.length > 0 && (
              <button type="button" className={styles.actionPrincipale}
                onClick={() => setPanneau({ type: 'client', id: null })}>
                Ajouter un client
              </button>
            )}
            <div className={styles.navigationMois}>
              <button
                type="button"
                className={styles.pas}
                onClick={() => reculer()}
                aria-label={vue === 'semaine' && section === 'charge'
                  ? 'Semaine précédente' : 'Mois précédent'}
              >
                <span aria-hidden="true">‹</span>
              </button>
              {/* Le mois affiché est annoncé aux lecteurs d'écran à chaque
                  changement : sans cela, les flèches déplacent une vue dont on
                  n'entend jamais l'état. */}
              <span
                className={styles.moisCourant}
                role="status"
                aria-label="Période affichée"
              >
                {vue === 'semaine' && section === 'charge'
                  ? `Sem. du ${dateCourte(semaine.lundi)}`
                  : moisLong(mois)}
              </span>
              <button
                type="button"
                className={styles.pas}
                onClick={() => avancer()}
                aria-label={vue === 'semaine' && section === 'charge'
                  ? 'Semaine suivante' : 'Mois suivant'}
              >
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </>
        )}
      />

      <div className={styles.sections}>
        <Onglets
          idGroupe={idGroupe}
          onglets={SECTIONS}
          actif={section}
          onChange={setSection}
          libelle="Sections de l’écran Activité"
        />

        <PanneauOnglet idGroupe={idGroupe} id="charge" actif={section === 'charge'}>
          <div className={styles.grille}>
            <Chiffre libelle="Jours ouvrables" valeur={String(etat.plan.joursOuvrables)} />
            {/* Le libellé suit la SOURCE. Des journées lues sur le planning
                sont des jours travaillés — un fait. Les mêmes déduites d'un
                montant divisé par un tarif sont des équivalent-jours — une
                estimation. Le même titre pour les deux ferait passer l'une
                pour l'autre. */}
            <Chiffre
              libelle={etat.sourceCharge === 'planning'
                ? 'Jours travaillés'
                : 'Équivalent-jours facturés'}
              valeur={formaterJours(etat.plan.joursFactures)}
              ton="accent"
            />
            <Chiffre
              libelle="Occupation"
              valeur={etat.plan.occupation === null ? '—' : formaterPourcent(etat.plan.occupation)}
              ton={tonOccupation(etat.plan.occupation)}
            />
            <Chiffre libelle="Congés posés dans l’année" valeur={String(etat.congesDeLAnnee)} />
          </div>

          {/* Sans planning, l'occupation se déduit encore d'une division — et
              elle se trompe dès que la facturation ne suit pas le travail : un
              mois facturé au trimestre s'affiche à 0 %. Le dire vaut mieux que
              de laisser croire à un mois creux. */}
          {etat.sourceCharge === 'facturation' && etat.missions.length > 0 && (
            <p className={styles.bandeau} role="status">
              Occupation estimée depuis les montants facturés, faute de rythme
              saisi sur les missions du mois.
              <Info libelle="Pourquoi cette estimation est fragile">
                Sans planning, les jours travaillés se déduisent du montant
                facturé divisé par le tarif journalier. Un mois facturé au
                trimestre affiche alors 0 % d’occupation alors qu’il a été
                travaillé, et un forfait au résultat ne se convertit pas en
                jours. Saisir le rythme de la mission remplace cette estimation
                par les journées réellement retenues.
              </Info>
            </p>
          )}

          {etat.recettesSansTarif > 0 && (
            <p className={styles.bandeau} role="status">
              {etat.recettesSansTarif}{' '}
              {etat.recettesSansTarif > 1 ? 'recettes du mois n’ont' : 'recette du mois n’a'} pas de
              tarif journalier connu&nbsp;: {etat.recettesSansTarif > 1 ? 'elles ne sont' : 'elle n’est'} pas
              {' '}comptée{etat.recettesSansTarif > 1 ? 's' : ''} dans l’occupation.
              <Info libelle="Pourquoi ces recettes ne sont pas comptées">
                Les jours facturés se déduisent du montant divisé par le tarif
                journalier de la mission. Sans tarif, les compter à un montant
                supposé fabriquerait de l’occupation. Renseigner le TJM de la
                mission du client suffit à les faire entrer dans la mesure.
              </Info>
            </p>
          )}

          {/* Avec les chiffres du mois, et non dans l'onglet Missions : c'est
              une question de MOIS — « ce que ce mois-ci devrait rapporter » —
              même si sa source est la mission. Rangée sous Missions, elle
              n'était visible qu'en changeant d'onglet. */}
          <CartePrevision previsions={previsions} mois={mois} />

          <CarteRapportParMission rapports={rapports} annee={Number(mois.slice(0, 4))} />

          <CarteTarifJournalier tarif={tarif} annee={Number(mois.slice(0, 4))} />

          <section className={styles.carte} aria-labelledby={`${idGroupe}-chiffres`}>
            <h2 id={`${idGroupe}-chiffres`} className={styles.titreCarte}>
              Le mois en chiffres
              <Info libelle="Pourquoi la dépendance client se mesure sur l’année">
                Un client peut ne rien régler en août sans que la dépendance
                ait bougé. Mesurée sur un seul mois, la concentration sauterait
                d’un client à l’autre au gré des règlements et n’apprendrait
                rien. Elle porte donc sur le chiffre d’affaires encaissé de
                l’année.
              </Info>
            </h2>

            {/* Les équivalent-jours et l'occupation sont déjà dans les tuiles
                ci-dessus : les répéter ici ferait deux affichages du même
                chiffre, qui finiraient par diverger. On n'ajoute que ce qui
                n'est nulle part ailleurs. */}
            <dl className={styles.detail}>
              <div className={styles.ligne}>
                <dt>Encaissé ce mois</dt>
                <dd><Montant>{eur(etat.caDuMois)}</Montant></dd>
              </div>
            </dl>

            {etat.poidsClients.length === 0
              ? (
                <p className={styles.vide}>
                  Aucun encaissement cette année&nbsp;: la dépendance client ne
                  se mesure pas encore.
                </p>
              )
              : <DependanceClients poids={etat.poidsClients} />}
          </section>

          <section className={styles.carte} aria-labelledby={`${idGroupe}-calendrier`}>
            <h2 id={`${idGroupe}-calendrier`} className={styles.titreCarte}>
              Congés de {moisLong(mois)}
              <Info libelle="Effet des congés sur l’occupation">
                Un jour posé sort du dénominateur&nbsp;: le même travail sur
                moins de jours disponibles fait monter l’occupation, ce qui est
                le sens de la mesure. Un congé posé un jour férié ou un week-end
                n’est pas consommé, et n’est donc pas compté.
              </Info>
            </h2>

            {/* Semaine ou mois : la spec prévoit les deux. Le mois donne la
                vue d'ensemble, la semaine est la maille où l'on corrige —
                une grille de trente-et-un jours oblige à retrouver le bon. */}
            <div className={styles.bascule} role="group" aria-label="Vue du planning">
              <button
                type="button"
                className={`${styles.vue} ${vue === 'mois' ? styles.vueActive : ''}`}
                aria-pressed={vue === 'mois'}
                onClick={() => setVue('mois')}
              >
                Mois
              </button>
              <button
                type="button"
                className={`${styles.vue} ${vue === 'semaine' ? styles.vueActive : ''}`}
                aria-pressed={vue === 'semaine'}
                onClick={() => setVue('semaine')}
              >
                Semaine
              </button>
            </div>

            {vue === 'mois'
              ? (
                <>
                  <PlageDeConges />
                  <Calendrier
                    mois={mois}
                    jours={etat.calendrier}
                    onBasculer={basculerConge}
                  />
                </>
              )
              : (
                <VueSemaine
                  planning={semaine}
                  aujourdhui={dateDuJour()}
                  onBasculer={ajusterAuClic}
                  onRevenirAuRythme={() => {
                    const n = retirerAjustements(semaine.jours.map((j) => j.date));
                    // L'effet se voit — la grille change sous les yeux — mais
                    // pas son ampleur : sept cases redevenues identiques ne
                    // disent pas combien de corrections ont été retirées.
                    signaler(n === 1
                      ? 'Correction retirée : la journée reprend le rythme.'
                      : `${n} corrections retirées : les journées reprennent le rythme.`);
                  }}
                />
              )}

            <Legende />

            <dl className={styles.detail}>
              <div className={styles.ligne}>
                <dt>Jours fériés du mois</dt>
                <dd>{etat.plan.joursFeries}</dd>
              </div>
              <div className={styles.ligne}>
                <dt>Congés posés ce mois</dt>
                <dd>{etat.plan.joursDeConge}</dd>
              </div>
              <div className={`${styles.ligne} ${styles.total}`}>
                <dt>Jours réellement travaillables</dt>
                <dd>{etat.plan.joursOuvrables}</dd>
              </div>
            </dl>
          </section>

          <CraCard cras={cras} periode={moisLong(mois)} />
        </PanneauOnglet>

        <PanneauOnglet idGroupe={idGroupe} id="missions" actif={section === 'missions'}>
          <Suspense fallback={<EnAttenteDeFormulaire />}>
            <OngletMissions
              idGroupe={idGroupe}
              missions={etat.missions}
              onOuvrirMission={(id) => setPanneau({ type: 'mission', id })}
            />
          </Suspense>
        </PanneauOnglet>

        <PanneauOnglet idGroupe={idGroupe} id="clients" actif={section === 'clients'}>
          <Suspense fallback={<EnAttenteDeFormulaire />}>
            <OngletClients idGroupe={idGroupe} onOuvrirClient={(id) => setPanneau({ type: 'client', id })} delais={etat.delais} />
          </Suspense>
        </PanneauOnglet>
      </div>

      <Sheet
        ouvert={panneau.type === 'client'}
        titre={panneau.type === 'client' && panneau.id !== null ? 'Modifier le client' : 'Nouveau client'}
        onFermer={() => setPanneau({ type: 'ferme' })}
      >
        {panneau.type === 'client' && (
          <Suspense fallback={<EnAttenteDeFormulaire />}>
            <FormulaireClient id={panneau.id} onFini={() => setPanneau({ type: 'ferme' })} />
          </Suspense>
        )}
      </Sheet>

      <Sheet
        ouvert={panneau.type === 'mission'}
        titre={panneau.type === 'mission' && panneau.id !== null ? 'Modifier la mission' : 'Nouvelle mission'}
        onFermer={() => setPanneau({ type: 'ferme' })}
      >
        {panneau.type === 'mission' && (
          <Suspense fallback={<EnAttenteDeFormulaire />}>
            <FormulaireMission id={panneau.id} onFini={() => setPanneau({ type: 'ferme' })} />
          </Suspense>
        )}
      </Sheet>

      <Sheet
        ouvert={aRattacher !== null}
        titre="À quelle mission rattacher cette journée&nbsp;?"
        onFermer={() => setARattacher(null)}
      >
        {aRattacher !== null && (
          <div className={styles.choixAffectation}>
            <p className={styles.aide}>
              Le {dateCourte(aRattacher.date)} n’était prévu par aucun
              rythme. Plusieurs missions sont en cours&nbsp;: choisir pour vous
              fausserait deux comptes rendus d’un coup — celui qui recevrait la
              journée à tort, et celui à qui elle manquerait.
            </p>
            {aRattacher.possibles.map((a) => (
              <button
                key={`${a.missionId}-${a.entiteId}`}
                type="button"
                className={styles.actionPrincipale}
                onClick={() => {
                  faireTourner(aRattacher.date, a.missionId, a.entiteId, 0, false);
                  setARattacher(null);
                }}
              >
                {a.libelle}
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}

/** Ce qu'un panneau latéral affiche. `id` à `null` pour une création. */
type Panneau =
  | { readonly type: 'ferme' }
  | { readonly type: 'client'; readonly id: string | null }
  | { readonly type: 'mission'; readonly id: string | null };

/* ─────────────────────────────────────────────────────────────────────────
   Calendrier
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Le calendrier du mois.
 *
 * Une grille de boutons plutôt qu'un tableau : chaque case est une action —
 * poser ou retirer un congé — et non une donnée à lire. Les week-ends et les
 * jours fériés ne sont pas cliquables, parce qu'un congé posé ce jour-là ne
 * consomme rien et ne changerait aucun chiffre.
 */
function Calendrier(
  { mois, jours, onBasculer }: {
    mois: Mois;
    jours: readonly Jour[];
    onBasculer: (jour: DateISO) => void;
  }
) {
  // Décalage du premier jour : la semaine commence le lundi, `getUTCDay()`
  // rend 0 pour dimanche.
  const premier = jours[0];
  const decalage = premier === undefined
    ? 0
    : (new Date(`${premier.date}T00:00:00Z`).getUTCDay() + 6) % 7;

  return (
    <div className={styles.calendrier}>
      <div className={styles.enteteSemaine} aria-hidden="true">
        {JOURS_SEMAINE.map((lettre, i) => (
          <span key={`${lettre}-${i}`} className={styles.jourSemaine}>{lettre}</span>
        ))}
      </div>
      <div className={styles.grilleJours} role="group" aria-label={`Congés de ${moisLong(mois)}`}>
        {Array.from({ length: decalage }, (_, i) => (
          <span key={`vide-${i}`} className={styles.caseVide} aria-hidden="true" />
        ))}
        {jours.map((jour) => (
          <CaseJour key={jour.date} jour={jour} onBasculer={onBasculer} />
        ))}
      </div>
    </div>
  );
}

function CaseJour({ jour, onBasculer }: { jour: Jour; onBasculer: (d: DateISO) => void }) {
  const numero = Number(jour.date.slice(8, 10));
  const posable = jour.nature === 'ouvrable' || jour.nature === 'conge';

  if (!posable) {
    return (
      <span className={`${styles.case} ${classeNature(jour.nature)}`}>
        <span aria-hidden="true">{numero}</span>
        {/* Le nom accessible dit pourquoi la case n'est pas actionnable. */}
        <span className={styles.invisible}>
          {dateCourte(jour.date)}, {jour.nature === 'ferie' ? 'jour férié' : 'week-end'}
        </span>
      </span>
    );
  }

  const pose = jour.nature === 'conge';
  return (
    <button
      type="button"
      className={`${styles.case} ${styles.caseActionnable} ${classeNature(jour.nature)}`}
      aria-pressed={pose}
      onClick={() => onBasculer(jour.date)}
    >
      <span aria-hidden="true">{numero}</span>
      <span className={styles.invisible}>
        {dateCourte(jour.date)}, {pose ? 'congé posé' : 'jour travaillé'}
      </span>
    </button>
  );
}

/**
 * La légende du calendrier.
 *
 * Les cases se distinguent par leur couleur et leur opacité. Sans légende, il
 * faut cliquer pour découvrir laquelle est un congé — et un clic sur le
 * calendrier POSE un congé : on apprend la convention en modifiant ses
 * données. La spec de design prévoit cette légende ; elle manquait.
 */
function Legende() {
  const entrees = [
    { classe: styles.legendeOuvrable, libelle: 'Travaillable' },
    { classe: styles.conge, libelle: 'Congé posé' },
    { classe: styles.ferie, libelle: 'Jour férié' },
    { classe: styles.weekEnd, libelle: 'Week-end' }
  ];
  return (
    <ul className={styles.legende}>
      {entrees.map((e) => (
        <li key={e.libelle} className={styles.legendeEntree}>
          <span className={`${styles.legendeCase} ${e.classe}`} aria-hidden="true" />
          {e.libelle}
        </li>
      ))}
    </ul>
  );
}

/**
 * La dépendance client.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE STATISTIQUE QUI EST UN RISQUE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Perdre un client qui pèse 60 % du chiffre d'affaires ne se rattrape pas en
 * un trimestre. C'est une des rares choses qu'une application de comptabilité
 * peut voir venir — à condition de la mesurer et de la montrer avant que
 * l'événement arrive.
 *
 * Aucun seuil n'est posé : dire « au-delà de 50 %, c'est dangereux » serait
 * une opinion déguisée en règle, et elle dépend du métier, du carnet, de la
 * durée des missions. Les parts sont affichées, le lecteur juge.
 */
function DependanceClients({ poids }: { poids: readonly PoidsClient[] }) {
  return (
    <>
      <div className={styles.barreClients} role="img"
        aria-label={poids
          .map((p) => `${p.nom} ${Math.round(p.part * 100)} %`)
          .join(', ')}>
        {poids.map((p, i) => (
          <div
            key={p.nom}
            className={styles.partClient}
            style={{ width: `${p.part * 100}%`, opacity: 1 - i * 0.16 }}
          />
        ))}
      </div>

      <ul className={styles.legendeClients}>
        {poids.map((p, i) => (
          <li key={p.nom} className={styles.entreeClient}>
            <span className={styles.pastilleClient} style={{ opacity: 1 - i * 0.16 }}
              aria-hidden="true" />
            <span className={styles.nomClient}>{p.nom}</span>
            <span className={styles.partTexte}>{Math.round(p.part * 100)} %</span>
            <span className={styles.montantClient}><Montant>{eur(p.montant)}</Montant></span>
          </li>
        ))}
      </ul>
    </>
  );
}

function classeNature(nature: NatureJour): string {
  switch (nature) {
    case 'ferie': return styles.ferie as string;
    case 'week_end': return styles.weekEnd as string;
    case 'conge': return styles.conge as string;
    case 'ouvrable': return '';
  }
}


/* ─────────────────────────────────────────────────────────────────────────
   Saisie du carnet
   ───────────────────────────────────────────────────────────────────────── */




/** Le pays en clair. Un code à deux lettres ne se lit pas d'un coup d'œil. */


/* ─────────────────────────────────────────────────────────────────────────
   Présentation
   ───────────────────────────────────────────────────────────────────────── */

function decalerMois(m: Mois, pas: number): Mois {
  const total = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) + pas;
  const annee = Math.floor(total / 12);
  const mois = String((total % 12) + 1).padStart(2, '0');
  return `${annee}-${mois}` as Mois;
}

function moisLong(m: Mois): string {
  const date = new Date(`${m}-01T00:00:00`);
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date);
}

function formaterPourcent(part: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent', maximumFractionDigits: 0
  }).format(part);
}

/**
 * Le ton de l'occupation.
 *
 * Au-delà de 100 %, on a facturé plus de jours qu'il n'y en avait de
 * disponibles : soit un forfait fausse la conversion, soit les congés posés ne
 * correspondent pas à la réalité. Dans les deux cas, il y a quelque chose à
 * regarder — d'où l'alerte plutôt qu'un chiffre flatteur.
 */
function tonOccupation(occupation: number | null): 'neutre' | 'accent' | 'attention' {
  if (occupation === null) return 'neutre';
  if (occupation > 1) return 'attention';
  return occupation >= 0.6 ? 'accent' : 'neutre';
}

function Chiffre(
  { libelle, valeur, ton = 'neutre' }: {
    libelle: string;
    valeur: string;
    ton?: 'neutre' | 'accent' | 'attention';
  }
) {
  const classe = ton === 'attention' ? styles.attention
    : ton === 'accent' ? styles.accent : '';
  return (
    <div className={styles.chiffre}>
      <span className={styles.libelle}>{libelle}</span>
      <span className={`${styles.montant} ${classe}`}><Montant>{valeur}</Montant></span>
    </div>
  );
}

/** Une mission et l'un de ses clients opérationnels. */
interface Affectation {
  readonly missionId: string;
  readonly entiteId: string;
  readonly libelle: string;
}

/**
 * Où une journée déclarée sur un créneau vide PEUT être rattachée.
 *
 * Toutes les affectations des missions en cours, pas la première : le choix
 * appartient à l'utilisateur dès qu'il y en a plus d'une. Une journée
 * rattachée au mauvais client fausse deux CRA d'un coup — celui qui la reçoit
 * à tort, et celui à qui elle manque.
 */
function affectationsPossibles(
  faits: { readonly missions: readonly Mission[] }
): readonly Affectation[] {
  return faits.missions
    .filter((m) => m.statut === 'active')
    .flatMap((m) => m.entites.map((e) => ({
      missionId: m.id,
      entiteId: e.id,
      libelle: m.entites.length > 1 && e.nom !== ''
        ? `${m.description !== '' ? m.description : m.clientNom} — ${e.nom}`
        : (m.description !== '' ? m.description : m.clientNom)
    })));
}

/* ─────────────────────────────────────────────────────────────────────────
   Clients opérationnels et rythme
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Teintes de repli, dans l'ordre.
 *
 * Une couleur oubliée à la saisie ne doit pas produire deux blocs identiques
 * au planning : c'est justement là qu'on distingue deux donneurs d'ordre.
 */






/**
 * Poser ou retirer une plage de congés.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * VINGT ET UN CLICS POUR TROIS SEMAINES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `poserPlageDeConges` existait dans le magasin depuis le début, testée, et
 * aucun écran ne l'appelait : le calendrier ne posait qu'un jour à la fois.
 * Des vacances d'été se saisissaient case par case, et la demi-journée — que le
 * schéma porte depuis la v2 et que le solde de congés compte correctement —
 * était tout simplement inatteignable.
 *
 * C'est la même famille de défaut que les quatre actions non câblées du 13/08 :
 * une action du magasin est une promesse d'interface, et une promesse qu'aucun
 * écran ne tient n'existe pas pour celui qui s'en sert.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA PLAGE EST RÉDUITE AUX JOURS OUVRÉS, ET ON LE DIT AVANT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Du 1er au 21 août » vaut quinze jours ouvrés, pas vingt et un. Enregistrer
 * les week-ends et les fériés gonflerait le solde de congés de moitié — et le
 * dénominateur d'occupation avec. Le compte est donc annoncé AVANT le geste :
 * découvrir après coup qu'on a posé six jours de plus que voulu oblige à
 * défaire à la main ce qu'on croyait avoir fait d'un coup.
 */
function PlageDeConges() {
  const poserPlage = useFaits((e) => e.poserPlageDeConges);
  const signaler = useToast();
  const id = useId();

  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [demiJournee, setDemiJournee] = useState(false);

  const valide = /^\d{4}-\d{2}-\d{2}$/.test(du) && /^\d{4}-\d{2}-\d{2}$/.test(au);
  const jours = valide ? joursCongeables(dateISO(du), dateISO(au)) : [];

  function appliquer(pose: boolean): void {
    if (jours.length === 0) return;
    poserPlage(jours, pose, demiJournee ? 0.5 : 1);
    const quoi = demiJournee ? 'demi-journée' : 'jour';
    signaler(
      pose
        ? `${jours.length} ${quoi}${jours.length > 1 ? 's' : ''} de congé posée${jours.length > 1 ? 's' : ''}.`
        : `${jours.length} jour${jours.length > 1 ? 's' : ''} retiré${jours.length > 1 ? 's' : ''} des congés.`
    );
    setDu(''); setAu('');
  }

  return (
    <section className={styles.plage} aria-labelledby={`${id}-titre`}>
      <h3 id={`${id}-titre`} className={styles.plageTitre}>
        Poser une plage
        <Info libelle="Ce que la plage enregistre">
          Seuls les jours ouvrés sont retenus&nbsp;: les week-ends et les jours
          fériés sont écartés, parce qu’un congé posé un dimanche gonflerait
          votre solde et votre taux d’occupation sans correspondre à rien.
        </Info>
      </h3>

      <div className={styles.plageChamps}>
        <label className={styles.plageChamp} htmlFor={`${id}-du`}>
          <span>Du</span>
          <input id={`${id}-du`} type="date" value={du}
            onChange={(e) => setDu(e.target.value)} />
        </label>

        <label className={styles.plageChamp} htmlFor={`${id}-au`}>
          <span>Au</span>
          <input id={`${id}-au`} type="date" value={au}
            onChange={(e) => setAu(e.target.value)} />
        </label>

        <label className={styles.plageCase} htmlFor={`${id}-demi`}>
          <input id={`${id}-demi`} type="checkbox" checked={demiJournee}
            onChange={(e) => setDemiJournee(e.target.checked)} />
          <span>Demi-journées</span>
        </label>
      </div>

      {/*
        * Le compte AVANT le geste : c'est lui qui fait la différence entre
        * « je pose mes vacances » et « je découvre ce que j'ai posé ».
        *
        * Pas de région live, volontairement. Il se recalcule à chaque frappe
        * dans un champ de date — l'annoncer à voix haute autant de fois serait
        * du bruit, et il entrerait en concurrence avec le `role="status"` du
        * navigateur de mois, qui lui a une vraie raison d'interrompre.
        */}
      <p className={styles.plageCompte}>
        {!valide
          ? 'Choisissez deux dates.'
          : jours.length === 0
            ? 'Aucun jour ouvré dans cette plage.'
            : `${jours.length} jour${jours.length > 1 ? 's' : ''} ouvré${jours.length > 1 ? 's' : ''}`
              + `${demiJournee ? ', comptés pour une demi-journée chacun' : ''}.`}
      </p>

      <div className={styles.plageActions}>
        <button type="button" className={styles.plageAction}
          disabled={jours.length === 0} onClick={() => appliquer(true)}>
          Poser ces congés
        </button>
        {/* Retirer coûte le même geste que poser : corriger une erreur de
            saisie ne doit pas être plus cher que la faire. */}
        <button type="button" className={styles.plageAction}
          disabled={jours.length === 0} onClick={() => appliquer(false)}>
          Les retirer
        </button>
      </div>
    </section>
  );
}

/**
 * Ce que les missions devaient rapporter ce mois-ci, et ce qu'elles rapportent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE PREMIER MAILLON DE LA CHAÎNE QUI PART DE LA MISSION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une mission doit se décliner en prévision de revenu, planning, facture du
 * mois et CRA. Le planning et le CRA existaient ; la prévision non — le tarif
 * journalier et le rythme étaient là, et rien n'en tirait ce qu'ils annoncent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX COLONNES, PARCE QUE L'ÉCART EST L'INFORMATION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le prévu vient du rythme, le retenu de ce qui a été ajusté journée par
 * journée. N'afficher que l'un des deux ferait disparaître la question qui
 * compte : « est-ce que je tiens ce que j'avais prévu ? ». Un mois travaillé
 * trois jours de moins que le rythme doit se voir, et il ne se voit qu'en
 * gardant les deux nombres côte à côte.
 *
 * Les missions sans aucune journée retenue restent affichées — contrairement au
 * CRA, qui ne liste que ce qui se facture. Une mission qui devait rapporter et
 * n'a rien rapporté est précisément ce qu'on cherche à voir.
 */
function CartePrevision(
  { previsions, mois: m }: {
    readonly previsions: readonly PrevisionDeMission[];
    readonly mois: Mois;
  }
) {
  if (previsions.length === 0) return null;

  const total = totaliserPrevisions(previsions.map((p) => p.prevision), m);
  const ecart = ecartDePrevision(total);

  return (
    <CartePliable
      id="prevision"
      ecran="activite"
      titre={(
        <>
          Ce que le mois devrait rapporter
          <Info libelle="D’où vient cette prévision">
            Du <strong>rythme</strong> de chaque mission et de son tarif
            journalier, congés et jours fériés déduits. Chaque journée est
            valorisée au tarif <em>en vigueur à sa date</em>&nbsp;: appliquer
            celui d’aujourd’hui réécrirait le passé à chaque renégociation.
            Le « retenu » est ce que vos ajustements journaliers ont retenu —
            c’est lui qui se facturera.
          </Info>
        </>
      )}
      resume={(
        <>
          <Montant>{eur(total.montantPrevu)}</Montant> prévus
          {' · '}<Montant>{eur(total.montantRetenu)}</Montant> retenus
          {ecart !== 0 && (
            <>{' · écart '}<Montant>{eur(euros(ecart))}</Montant></>
          )}
        </>
      )}
    >
      <ul className={styles.liste}>
        {previsions.map((p) => (
          <li key={`${p.missionId}-${p.entiteId}`} className={styles.lignePrevision}>
            <span className={styles.lignePrevisionNom}>{p.libelle}</span>
            <span className={styles.lignePrevisionChiffres}>
              <span className={styles.lignePrevisionJours}>
                {formaterJours(p.prevision.joursRetenus)} / {formaterJours(p.prevision.joursPrevus)} j
              </span>
              <span className={styles.lignePrevisionMontant}>
                <Montant>{eur(p.prevision.montantRetenu)}</Montant>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </CartePliable>
  );
}

/**
 * Ce que chaque mission rapporte, face à ce qu'elle prend de temps.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN TABLEAU, ET PAS UN GRAPHE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Quelle mission me rapporte quoi et me prend combien de charge de temps » :
 * la question était posée telle quelle, et personne ne l'avait jamais mise en
 * face d'elle-même. L'ancienne application avait le rapport et la charge dans
 * deux écrans différents, jamais croisés.
 *
 * Ce qui se compare ici, ce sont des RATIOS — des euros par jour — et non des
 * proportions. Un camembert répond à « quelle part du gâteau », ce qui n'est
 * pas la question : une mission qui pèse 15 % du chiffre d'affaires en
 * consommant 40 % du temps est un problème que sa part ne montre pas. Un
 * tableau trié par euro-jour met la réponse en première ligne.
 *
 * Un vrai `<table>` plutôt qu'une liste de `<div>` : trois colonnes qui se
 * comparent d'une ligne à l'autre sont un tableau, et un lecteur d'écran doit
 * pouvoir annoncer « Studio Lumen, 620 euros par jour » plutôt que quatre
 * fragments sans en-tête.
 */
function CarteRapportParMission(
  { rapports, annee }: {
    readonly rapports: readonly RapportDeMission[];
    readonly annee: number;
  }
) {
  if (rapports.length === 0) return null;

  const meilleur = rapports[0] as RapportDeMission;

  return (
    <CartePliable
      id="rapport-mission"
      ecran="activite"
      titre={(
        <>
          Ce que chaque mission rapporte, et ce qu’elle coûte en temps
          <Info libelle="Pourquoi l’euro-jour, et d’où vient le montant">
            La colonne qui décide est l’<strong>euro par jour</strong>&nbsp;:
            une mission qui pèse peu dans le chiffre d’affaires en consommant
            beaucoup de temps est un problème que sa part ne montre pas.
            Le montant est celui du travail <em>produit</em>, tiré du planning
            et valorisé au tarif en vigueur à chaque date — et non de
            l’encaissé, qui ne se rattache qu’au client et que deux missions
            simultanées ne pourraient pas se partager.
          </Info>
        </>
      )}
      resume={(
        <>
          {meilleur.libelle} rapporte{' '}
          <Montant>{eur(meilleur.parJour ?? euros(0))}</Montant> par jour
          {rapports.length > 1 && ` · ${rapports.length} missions sur ${annee}`}
        </>
      )}
    >
      <table className={styles.tableau}>
        <caption className={styles.tableauLegende}>
          Missions de {annee}, de la mieux à la moins bien rémunérée par journée
        </caption>
        <thead>
          <tr>
            <th scope="col">Mission</th>
            <th scope="col">Jours</th>
            <th scope="col">Produit</th>
            <th scope="col">€ / jour</th>
            <th scope="col">Part du temps</th>
          </tr>
        </thead>
        <tbody>
          {rapports.map((r) => (
            <tr key={`${r.missionId}-${r.entiteId}`}>
              <th scope="row" className={styles.tableauNom}>{r.libelle}</th>
              <td>{formaterJours(r.jours)}</td>
              <td><Montant>{eur(r.produit)}</Montant></td>
              <td className={styles.tableauFort}>
                {r.parJour === null ? '—' : <Montant>{eur(r.parJour)}</Montant>}
              </td>
              <td>{Math.round(r.partDuTemps * 100)}&nbsp;%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CartePliable>
  );
}

/**
 * Ce qu'une journée rapporte vraiment, et ce qu'il en reste.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES DEUX ERREURS QU'ON FAIT SUR SON PROPRE TARIF
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un indépendant connaît son tarif journalier par cœur et se trompe deux fois
 * dessus. D'abord parce que tous les jours travaillés ne se facturent pas —
 * une remise, un forfait qui déborde, une demi-journée offerte. Ensuite parce
 * que ce qui rentre n'est pas ce qui reste : cotisations et impôt prélèvent
 * près d'un quart avant qu'on ait rien décidé.
 *
 * Les deux indicateurs existaient dans l'ancienne application et avaient
 * disparu sans motif — l'inventaire fonctionnel les donnait même pour
 * « présents » alors qu'ils n'étaient nulle part.
 *
 * Le net s'ABSTIENT quand le barème ne couvre pas la période, et dit pourquoi.
 * C'est le chiffre sur lequel on décide d'accepter une mission : le poser sur
 * un taux supposé serait la pire des approximations.
 */
function CarteTarifJournalier(
  { tarif, annee }: { readonly tarif: TarifDeLaJournee; readonly annee: number }
) {
  const { effectif, net } = tarif;
  if (effectif.effectif === null || effectif.affiche === null) return null;

  const ecart = effectif.ecart ?? euros(0);

  return (
    <CartePliable
      id="tarif-journalier"
      ecran="activite"
      titre={(
        <>
          Ce qu’une journée vous rapporte
          <Info libelle="Pourquoi trois tarifs et non un seul">
            Le <strong>tarif des contrats</strong> vient du planning valorisé au
            tarif de chaque mission. Le <strong>tarif effectif</strong> divise
            ce qui a réellement été facturé par les mêmes journées&nbsp;: leur
            écart mesure ce qui se perd en remises, forfaits et jours non
            facturés. Le <strong>net</strong> retire cotisations et impôt — près
            d’un quart du chiffre d’affaires en micro-BNC, et l’écart que l’on
            sous-estime le plus au moment de dire oui à une mission.
          </Info>
        </>
      )}
      resume={(
        <>
          <Montant>{eur(effectif.effectif)}</Montant> facturés par jour
          {net.statut !== 'refuse' && (
            <>{' · '}<Montant>{eur(net.valeur)}</Montant> nets</>
          )}
        </>
      )}
    >
      <dl className={styles.detail}>
        <div className={styles.ligne}>
          <dt>Tarif des contrats, sur {formaterJours(effectif.jours)} jours</dt>
          <dd><Montant>{eur(effectif.affiche)}</Montant></dd>
        </div>
        <div className={styles.ligne}>
          <dt>Tarif effectif, facturé</dt>
          <dd><Montant>{eur(effectif.effectif)}</Montant></dd>
        </div>
        {ecart !== 0 && (
          <div className={styles.ligne}>
            <dt className={ecart < 0 ? styles.attention : undefined}>
              {ecart < 0 ? 'Perdu par journée' : 'Gagné par journée'}
            </dt>
            <dd className={ecart < 0 ? styles.attention : styles.accent}>
              <Montant>{eur(euros(Math.abs(ecart)))}</Montant>
            </dd>
          </div>
        )}
        <div className={`${styles.ligne} ${styles.total}`}>
          <dt>Ce qu’il vous reste, charges déduites</dt>
          <dd>
            {net.statut === 'refuse'
              ? <span className={styles.vide}>{net.motif}</span>
              : <Montant>{eur(net.valeur)}</Montant>}
          </dd>
        </div>
      </dl>

      {net.statut === 'hypothese' && (
        <p className={styles.approximation}>
          Taux de {annee} non encore publié&nbsp;: le net est calculé sur la
          dernière période connue, et n’engage pas.
        </p>
      )}
    </CartePliable>
  );
}
