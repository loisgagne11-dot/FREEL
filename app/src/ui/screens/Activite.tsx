import { Suspense, lazy, useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { dateDuJour, moisCourant } from '../../state/selecteurs';
import {
  type PoidsClient,
  type MoisEnChiffres as ChiffresDuMois,
  craDuMoisParMission, etatActivite, moisEnChiffres, planningDeLaSemaine, planningDuMois
} from '../../state/selecteurs.activite';
import { VueSemaine } from '../components/VueSemaine';
import { VueMois } from '../components/VueMois';
import { MoisEnChiffres } from '../components/MoisEnChiffres';
import { CraCard } from '../components/CraCard';
import { useToast } from '../components/Toasts';
import type { Jour, NatureJour } from '../../domain/calculs/activite';
import { joursCongeables, joursFeries } from '../../domain/calculs/activite';
import type { Creneau } from '../../domain/calculs/planning';
import { basculerCreneau, planifier } from '../../domain/calculs/planning';
import {
  previsionDuMoisParMission, rapportParMission, tarifDeLaJournee
} from '../../state/selecteurs.activite';

import type { DateISO, Mois } from '../../domain/types';
import type { Mission } from '../../state/schema';
import { dateISO } from '../../domain/types';
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

/**
 * Les trois cartes d'analyse arrivent APRÈS le plan de charge.
 *
 * Elles sont sous la ligne de flottaison et répondent à une autre question que
 * celle qui amène sur l'écran : leur chargement se lit comme un bas de page qui
 * se remplit, et l'ouverture du plan de charge ne le paie plus.
 */
const CartePrevision = lazy(() => import('./Activite.analyse')
  .then((m) => ({ default: m.CartePrevision })));
const CarteRapportParMission = lazy(() => import('./Activite.analyse')
  .then((m) => ({ default: m.CarteRapportParMission })));
const CarteTarifJournalier = lazy(() => import('./Activite.analyse')
  .then((m) => ({ default: m.CarteTarifJournalier })));

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

/**
 * Les onglets, et ce que chacun contient.
 *
 * Le compte est calculé À L'AFFICHAGE (`sections()` ci-dessous) : le mettre ici
 * en dur donnerait un nombre figé, et le mettre dans l'état en ferait une
 * valeur dérivée persistée — ce que l'invariant n°1 interdit.
 *
 * « Plan de charge » n'a pas de compte : ce n'est pas une liste. Une pastille
 * y afficherait un nombre dont on chercherait ce qu'il dénombre.
 */
const sections = (nbMissions: number, nbClients: number) => [
  { id: 'charge' as Section, libelle: 'Plan de charge' },
  { id: 'missions' as Section, libelle: 'Missions', compte: nbMissions },
  { id: 'clients' as Section, libelle: 'Clients', compte: nbClients }
];

/** Lundi en tête : la semaine française commence le lundi, pas le dimanche. */
const JOURS_SEMAINE = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function Activite() {
  const faits = useFaits((e) => e.faits);
  const basculerConge = useFaits((e) => e.basculerConge);
  const poserAjustement = useFaits((e) => e.poserAjustement);
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

  /*
   * L'écran s'ouvre sur la SEMAINE.
   *
   * C'est la maille où l'on corrige — le rythme remplit le mois d'un coup, et
   * ce qu'on redresse, on le redresse à la semaine parce que c'est l'horizon
   * dont on se souvient. Le dessin ouvre là, et notre propre commentaire de
   * `VueSemaine` le disait déjà depuis le début.
   *
   * Il ouvrait sur le mois pour une raison qui a disparu : la pose des congés
   * ne vivait que dans le calendrier mensuel, et ouvrir sur la semaine l'aurait
   * rendue introuvable. Les congés ont désormais leur propre carte, toujours
   * affichée — le verrou est levé.
   */
  const [vue, setVue] = useState<'mois' | 'semaine'>('semaine');
  const [ancreSemaine, setAncreSemaine] = useState<DateISO>(() => dateDuJour());
  /** Journée déclarée sur un créneau vide, en attente de savoir à qui elle est. */
  const [aRattacher, setARattacher] = useState<{
    readonly date: DateISO;
    readonly possibles: readonly Affectation[];
    /* Le créneau cliqué voyage avec la question : le rattachement peut prendre
       plusieurs secondes, et rouvrir la feuille ne doit pas reposer la journée
       entière quand c'est l'après-midi qu'on visait. */
    readonly creneau: Creneau;
  } | null>(null);
  const semaine = useMemo(
    () => planningDeLaSemaine(faits, ancreSemaine), [faits, ancreSemaine]
  );
  const planningMois = useMemo(() => planningDuMois(faits, mois), [faits, mois]);
  const chiffres = useMemo(() => moisEnChiffres(faits, mois), [faits, mois]);
  const cras = useMemo(() => craDuMoisParMission(faits, mois), [faits, mois]);

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

  const reculer = () => (vue === 'semaine' ? decalerSemaine(-1) : setMois(decalerMois(mois, -1)));
  const avancer = () => (vue === 'semaine' ? decalerSemaine(1) : setMois(decalerMois(mois, 1)));

  /**
   * Bascule LE CRÉNEAU cliqué.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * UN CRÉNEAU VIDE NE DIT PAS À QUI LA JOURNÉE APPARTIENT
   * ─────────────────────────────────────────────────────────────────────────
   *
   * Cliquer un créneau vide déclare une demi-journée que le rythme ne
   * prévoyait pas. Encore faut-il savoir à quelle mission la rattacher : avec
   * une seule affectation possible il n'y a pas de question, avec deux le choix
   * devient arbitraire.
   *
   * La première version en choisissait une en silence — la première mission
   * active. C'est précisément ce que cette application refuse partout
   * ailleurs : l'écran propose, l'utilisateur tranche. Une journée rattachée
   * au mauvais client fausse deux CRA d'un coup, celui qui la reçoit à tort
   * et celui à qui elle manque, et rien ne le signale.
   */
  function ajusterAuClic(
    date: DateISO, _missionId: string, entiteId: string, creneau: Creneau
  ): void {
    const jour = semaine.jours.find((j) => j.date === date);
    const ligne = jour?.parMission.find((l) => l.entiteId === entiteId);

    if (ligne !== undefined && jour !== undefined) {
      basculer(date, ligne.missionId, ligne.entiteId, creneau);
      return;
    }

    const possibles = affectationsPossibles(faits);
    if (possibles.length === 0) return;
    if (possibles.length === 1) {
      const seule = possibles[0] as Affectation;
      basculer(date, seule.missionId, seule.entiteId, creneau);
      return;
    }
    // Plusieurs candidats : on demande, on ne devine pas.
    setARattacher({ date, possibles, creneau });
  }

  /**
   * L'état de la journée AVANT le clic, pour la ligne visée, puis la bascule.
   *
   * La journée est replanifiée pour ce seul client opérationnel : `semaine`
   * agrège toutes les lignes, et `basculerCreneau` a besoin du `prevu` de
   * CELLE-CI — c'est lui qui dit si le résultat retombe sur le rythme, donc si
   * l'ajustement doit disparaître au lieu d'être écrit.
   */
  function basculer(
    date: DateISO, missionId: string, entiteId: string, creneau: Creneau
  ): void {
    const entite = faits.missions
      .find((m) => m.id === missionId)?.entites.find((e) => e.id === entiteId);
    if (entite === undefined) return;

    const conges: Record<string, number> = {};
    for (const c of faits.conges) conges[c.date] = c.quotite;
    const annee = Number(date.slice(0, 4));

    const [jour] = planifier([date], {
      rythmes: entite.rythmes,
      ajustements: entite.ajustements,
      feries: new Set(joursFeries(annee)),
      conges
    });
    if (jour === undefined) return;

    poserAjustement(missionId, entiteId, date, basculerCreneau(jour, creneau));
  }

  return (
    <>
      <Greet
        titre="Ton plan de charge"
        sousTitre="Les congés posés sortent du dénominateur : le même travail sur moins de jours fait monter l’occupation."
        {...(section === 'charge' ? { repere: <ResumeDuMois chiffres={chiffres} /> } : {})}
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
          </>
        )}
      />

      <div className={styles.sections}>
        <Onglets
          idGroupe={idGroupe}
          onglets={sections(etat.missions.length, faits.clients.length)}
          actif={section}
          onChange={setSection}
          libelle="Sections de l’écran Activité"
        />

        <PanneauOnglet idGroupe={idGroupe} id="charge" actif={section === 'charge'}>
          {/*
            * DEUX COLONNES, COMME LE DESSIN.
            *
            * ─────────────────────────────────────────────────────────────
            * CE QU'UNE COLONNE UNIQUE FORÇAIT
            * ─────────────────────────────────────────────────────────────
            *
            * Tout s'empilait sur près de quatre mille pixels, et « Le mois en
            * chiffres » n'arrivait qu'en quatrième position — après la grille,
            * après le calendrier des congés. Ce qui répond en une seconde à
            * « comment va ce mois » était sous la ligne de flottaison, et la
            * seule façon de le remonter aurait été de repousser la grille
            * qu'on vient précisément consulter.
            *
            * Une colonne unique FORCE un arbitrage que deux colonnes n'ont pas
            * à rendre : ici la grille tient la largeur, et les chiffres se
            * lisent en regard sans que rien ne cède sa place.
            *
            * ─────────────────────────────────────────────────────────────
            * L'ORDRE DU DOCUMENT RESTE CELUI DE LA LECTURE
            * ─────────────────────────────────────────────────────────────
            *
            * La colonne latérale vient APRÈS la principale dans le document, et
            * la grille ne s'en sert pas pour les réordonner. Un lecteur d'écran
            * et un parcours au clavier suivent donc l'ordre du texte —
            * plan de charge, congés, analyse, puis chiffres et compte rendu.
            * Repositionner en CSS ce que le document ordonne autrement fabrique
            * une page qui se lit dans un sens et se tabule dans un autre.
            *
            * Sous 1100 px la grille retombe à une colonne, et l'empilement
            * reprend cet ordre-là — pas un autre.
            */}
          <div className={styles.deuxColonnes}>
            <div className={styles.principale}>
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

              <section className={styles.carte} aria-labelledby={`${idGroupe}-calendrier`}>
                {/*
                  * L'en-tête dit CE QU'ON REGARDE, et la bascule est à sa droite.
                  *
                  * La carte s'annonçait « Congés de juin 2026 » dans les deux vues.
                  * C'était vrai du calendrier mensuel — on y pose ses congés — et
                  * faux de la semaine, qui montre le plan de charge et où les congés
                  * ne sont qu'une des choses affichées. Un titre qui ne décrit que la
                  * moitié de ce qu'il coiffe apprend à ne plus le lire.
                  */}
                <div className={styles.enteteCarte}>
                  <h2 id={`${idGroupe}-calendrier`} className={styles.titreCarte}>
                    {vue === 'mois' ? 'Vue mois' : 'Vue semaine'}
                    <Info libelle="Ce que la grille montre">
                      Chaque journée porte deux créneaux. Ceux dont la position a été
                      saisie disent le matin ou l’après-midi&nbsp;; les autres — toute
                      journée d’avant cette version — sont RÉPARTIS pour pouvoir être
                      dessinés, et n’affichent donc pas de lieu. Un clic bascule la
                      moitié visée&nbsp;; la ramener à ce que le rythme prévoit efface
                      la correction au lieu d’en poser une.
                    </Info>
                  </h2>

                  {/*
                    * LA NAVIGATION DE PÉRIODE EST DANS L'EN-TÊTE DE LA CARTE.
                    *
                    * Elle vivait dans l'en-tête de la PAGE, où elle s'affichait
                    * sur les trois onglets — alors que ni Missions ni Clients ne
                    * dépend du mois affiché : `lignesDeMission` et
                    * `delaisParClient` ne le reçoivent même pas. Des flèches qui
                    * ne changent rien à ce qu'on regarde apprennent à ne plus
                    * s'en servir.
                    *
                    * Elle est donc rendue avec la grille qu'elle déplace, comme
                    * le dessin, et disparaît des onglets qu'elle ne concerne pas.
                    */}
                  <div className={styles.navigationMois}>
                    <button
                      type="button"
                      className={styles.pas}
                      onClick={() => reculer()}
                      aria-label={vue === 'semaine' ? 'Semaine précédente' : 'Mois précédent'}
                    >
                      <span aria-hidden="true">‹</span>
                    </button>
                    {/* La période est annoncée aux lecteurs d'écran à chaque
                        changement : sans cela, les flèches déplacent une vue
                        dont on n'entend jamais l'état. */}
                    <span
                      className={styles.moisCourant}
                      role="status"
                      aria-label="Période affichée"
                    >
                      {vue === 'semaine' ? `Sem. du ${dateCourte(semaine.lundi)}` : moisLong(mois)}
                    </span>
                    <button
                      type="button"
                      className={styles.pas}
                      onClick={() => avancer()}
                      aria-label={vue === 'semaine' ? 'Semaine suivante' : 'Mois suivant'}
                    >
                      <span aria-hidden="true">›</span>
                    </button>
                  </div>

                  {/* Semaine ou mois : la spec prévoit les deux. Le mois donne la
                      vue d'ensemble, la semaine est la maille où l'on corrige —
                      une grille de trente-et-un jours oblige à retrouver le bon. */}
                  {/* La SEMAINE en premier, comme le dessin : c'est la vue par
                      défaut, et une bascule dont l'état actif n'est pas le premier
                      segment se lit à l'envers. Les pictogrammes sont décoratifs —
                      le mot porte seul le sens, et le bouton reste compréhensible
                      si la police d'icônes ne rend rien. */}
                  <div className={styles.bascule} role="group" aria-label="Vue du planning">
                    <button
                      type="button"
                      className={`${styles.vue} ${vue === 'semaine' ? styles.vueActive : ''}`}
                      aria-pressed={vue === 'semaine'}
                      onClick={() => setVue('semaine')}
                    >
                      <span className={styles.iconeVue} aria-hidden="true">▤</span>
                      Semaine
                    </button>
                    <button
                      type="button"
                      className={`${styles.vue} ${vue === 'mois' ? styles.vueActive : ''}`}
                      aria-pressed={vue === 'mois'}
                      onClick={() => setVue('mois')}
                    >
                      <span className={styles.iconeVue} aria-hidden="true">▦</span>
                      Mois
                    </button>
                  </div>
                </div>

                {vue === 'mois'
                  ? (
                    <VueMois
                      planning={planningMois}
                      libellePeriode={moisLong(mois)}
                      aujourdhui={dateDuJour()}
                      onBasculer={ajusterAuClic}
                    />
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
              </section>


              {/*
                * LES CONGÉS ONT LEUR PROPRE CARTE, ET C'EST LA CORRECTION D'UNE
                * CONFUSION.
                *
                * Une seule carte portait les deux grilles : le plan de charge en
                * vue semaine, le calendrier des congés en vue mois. Deux questions
                * différentes derrière la même bascule — « qu'ai-je travaillé » et
                * « quand suis-je absent » — et il fallait quitter l'une pour poser
                * un congé sur l'autre.
                *
                * Le dessin range le TRAVAIL dans les deux vues du plan de charge, et
                * y montre les congés en hachures. Fondre les deux grilles en une
                * seule aurait supprimé le geste qui pose un congé d'un clic — celui
                * de l'ancienne application, et le seul qui reste pour une journée
                * isolée. Elles vivent donc côte à côte, chacune sous son titre.
                */}
              <section className={styles.carte} aria-labelledby={`${idGroupe}-conges`}>
                <h2 id={`${idGroupe}-conges`} className={styles.titreCarte}>
                  Congés de {moisLong(mois)}
                  <Info libelle="Effet des congés sur l’occupation">
                    Un jour posé sort du dénominateur&nbsp;: le même travail sur
                    moins de jours disponibles fait monter l’occupation, ce qui est
                    le sens de la mesure. Un congé posé un jour férié ou un week-end
                    n’est pas consommé, et n’est donc pas compté.
                  </Info>
                </h2>

                <PlageDeConges />
                <Calendrier
                  mois={mois}
                  jours={etat.calendrier}
                  onBasculer={basculerConge}
                />
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
                  {/* Le compte de l'ANNÉE, et non du mois : il vivait dans une
                      tuile d'en-tête que le repère du titre a remplacée. Le retirer
                      sans le replacer aurait fait disparaître le seul endroit où
                      l'on voit ses congés cumulés. */}
                  <div className={styles.ligne}>
                    <dt>Congés posés dans l’année</dt>
                    <dd>{etat.congesDeLAnnee}</dd>
                  </div>
                  <div className={`${styles.ligne} ${styles.total}`}>
                    <dt>Jours réellement travaillables</dt>
                    <dd>{etat.plan.joursOuvrables}</dd>
                  </div>
                </dl>
              </section>

              {/*
                * L'ANALYSE VIENT APRÈS LE PLAN DE CHARGE, ET À LA DEMANDE.
                *
                * Ces trois cartes répondent à « combien ça rapporte », une question
                * commerciale qu'on se pose en fin de mois. Elles étaient AU-DESSUS
                * de la grille : il fallait les dépasser pour arriver à ce qu'on
                * venait consulter. Le dessin met le plan de charge en tête.
                *
                * Elles restent dans l'onglet du plan de charge et non sous Missions :
                * « ce que ce mois-ci devrait rapporter » est une question de MOIS,
                * même si sa source est la mission. Rangée sous Missions, la première
                * n'était visible qu'en changeant d'onglet.
                */}
              <Suspense fallback={<EnAttenteDeFormulaire />}>
                <CartePrevision previsions={previsions} mois={mois} />
                <CarteRapportParMission rapports={rapports} annee={Number(mois.slice(0, 4))} />
                <CarteTarifJournalier tarif={tarif} annee={Number(mois.slice(0, 4))} />
              </Suspense>
            </div>

            <aside className={styles.laterale} aria-label="Chiffres du mois">
              {/*
                * LES CHIFFRES VIENNENT APRÈS LA GRILLE, COMME DANS LE DESSIN.
                *
                * On ouvre cet onglet pour voir ce qu'on a travaillé, pas pour lire
                * un taux : il fallait dépasser trois cartes de nombres avant
                * d'atteindre la grille qu'on venait consulter. Le dessin range le
                * plan de charge en tête de la colonne, et les chiffres du mois dans
                * le rail — c'est-à-dire, sur une seule colonne, dessous.
                */}
              <section className={styles.carte} aria-labelledby={`${idGroupe}-chiffres`}>
                <h2 id={`${idGroupe}-chiffres`} className={styles.titreCarte}>
                  Le mois en chiffres
                  <Info libelle="Ce que ce panneau mesure">
                    Du TEMPS, et sur le mois affiché. Le CA est celui que le travail
                    du mois produit, pas celui qui est rentré sur le compte&nbsp;: les
                    deux diffèrent de tout le délai de paiement. La part de
                    télétravail ne porte que sur les demi-journées dont le lieu a été
                    renseigné, et le panneau dit combien elles sont — une part
                    calculée sur deux demi-journées ne mesure pas le mois.
                  </Info>
                </h2>

                <MoisEnChiffres chiffres={chiffres} />
              </section>

              <CraCard cras={cras} periode={moisLong(mois)} />

              {/*
                * DEUX RÉPARTITIONS CLIENT, ET CE N'EST PAS UN DOUBLON.
                *
                * Celle du dessus est en JOURS et sur le MOIS : où passe le temps,
                * maintenant. Celle-ci est en EUROS et sur l'ANNÉE : le risque de
                * perdre celui qui pèse 60 % du chiffre d'affaires.
                *
                * Elles ne coïncident pas, et c'est ce qui les rend utiles ensemble —
                * un client qui prend 40 % des journées pour 15 % du chiffre est mal
                * tarifé, et aucune des deux ne le dit seule. Cette carte portait le
                * titre « Le mois en chiffres » tout en mesurant l'année : le titre
                * dit maintenant ce qu'elle mesure.
                */}
              <section className={styles.carte} aria-labelledby={`${idGroupe}-dependance`}>
                <h2 id={`${idGroupe}-dependance`} className={styles.titreCarte}>
                  Ta dépendance client, sur l’année
                  <Info libelle="Pourquoi elle se mesure sur l’année">
                    Un client peut ne rien régler en août sans que la dépendance
                    ait bougé. Mesurée sur un seul mois, la concentration sauterait
                    d’un client à l’autre au gré des règlements et n’apprendrait
                    rien. Elle porte donc sur le chiffre d’affaires encaissé de
                    l’année.
                  </Info>
                </h2>

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
            </aside>
          </div>

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
              rythme. Plusieurs missions sont en cours&nbsp;: choisir à ta place
              fausserait deux comptes rendus d’un coup — celui qui recevrait la
              journée à tort, et celui à qui elle manquerait.
            </p>
            {aRattacher.possibles.map((a) => (
              <button
                key={`${a.missionId}-${a.entiteId}`}
                type="button"
                className={styles.actionPrincipale}
                onClick={() => {
                  basculer(aRattacher.date, a.missionId, a.entiteId, aRattacher.creneau);
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
/**
 * Le repère chiffré de l'en-tête : jours travaillés et occupation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IL REMPLACE TROIS TUILES, IL NE S'Y AJOUTE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'écran ouvrait sur une rangée de trois cartes — jours ouvrables, jours
 * travaillés, congés de l'année — qu'il fallait dépasser pour atteindre la
 * grille qu'on venait consulter. Le dessin met la réponse sur la ligne du
 * titre, en une phrase, et garde le détail pour le panneau.
 *
 * Ajouter ce repère SANS retirer les tuiles aurait ramené le défaut qu'on
 * venait de corriger : l'occupation affichée deux fois sur le même écran, avec
 * deux calculs qui n'étaient pas les mêmes. D'où la même source que le
 * panneau — `moisEnChiffres` — et une seule.
 *
 * Le libellé suit la SOURCE. Des journées lues sur le planning sont des jours
 * travaillés, un fait ; les mêmes déduites d'un montant divisé par un tarif
 * sont des équivalent-jours, une estimation. Le même mot pour les deux ferait
 * passer l'une pour l'autre.
 */
function ResumeDuMois({ chiffres }: { readonly chiffres: ChiffresDuMois }) {
  const nom = chiffres.source === 'planning' ? 'travaillés' : 'équivalent-jours';
  return (
    <>
      <strong>{formaterJours(chiffres.joursTravailles)} j</strong> {nom}
      {/* L'occupation s'abstient quand aucun jour n'est ouvrable : un mois
          entièrement pris en congé n'a pas une occupation de 0 %, il n'en a
          pas. Afficher zéro ferait lire un mois catastrophique. */}
      {chiffres.occupation !== null && (
        <>
          {' · '}
          <strong>{Math.round(chiffres.occupation * 100)} %</strong> occupé
        </>
      )}
    </>
  );
}

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
          ton solde et ton taux d’occupation sans correspondre à rien.
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
