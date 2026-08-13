import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { dateDuJour, moisCourant } from '../../state/selecteurs';
import {
  type LigneMission, type PoidsClient,
  craDuMoisParMission, etatActivite, planningDeLaSemaine
} from '../../state/selecteurs.activite';
import { VueSemaine } from '../components/VueSemaine';
import { CraCard } from '../components/CraCard';
import { useToast } from '../components/Toasts';
import type { Jour, NatureJour } from '../../domain/calculs/activite';
import type { DateISO, Mois } from '../../domain/types';
import type { ClientOperationnel, Client, Mission } from '../../state/schema';
import { entiteVide } from '../../state/schema';
import type { JourDeSemaine, Rythme } from '../../domain/calculs/planning';
import { JOURS_SEMAINE as JOURS_DE_LA_SEMAINE } from '../../domain/calculs/planning';
import { euros, dateISO } from '../../domain/types';
import { Greet } from '../components/Greet';
import { Info } from '../components/Info';
import { Vide } from '../components/Vide';
import { Onglets, PanneauOnglet } from '../components/Onglets';
import { Sheet } from '../components/Sheet';
import { dateCourte, eur } from '../format';
import styles from './Activite.module.css';
import { Montant } from '../components/Montant';

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
              <span className={styles.moisCourant} role="status">
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
            <Chiffre
              libelle="Équivalent-jours facturés"
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
                <Calendrier
                  mois={mois}
                  jours={etat.calendrier}
                  onBasculer={basculerConge}
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
          <section className={styles.carte} aria-labelledby={`${idGroupe}-missions`}>
            <h2 id={`${idGroupe}-missions`} className={styles.titreCarte}>
              Missions
              <Info libelle="Comment les montants sont rattachés">
                Le rattachement se fait par nom de client&nbsp;: l’ancien modèle
                ne liait pas une facture à la mission qui l’a produite. Un
                client suivi sur plusieurs missions voit donc son chiffre
                d’affaires porté par la première d’entre elles.
              </Info>
            </h2>
            {etat.missions.length === 0
              ? (
                <Vide
                  message="Aucune mission enregistrée. Une mission porte le tarif journalier et les dates qui alimentent le plan de charge."
                  action={(
                    <button type="button" className={styles.actionPrincipale}
                      onClick={() => setPanneau({ type: 'mission', id: null })}>
                      Ajouter une mission
                    </button>
                  )}
                />
              )
              : (
                <ul className={styles.liste}>
                  {etat.missions.map((ligne) => (
                    <LigneMissionAffichee key={ligne.mission.id} ligne={ligne}
                      onOuvrir={() => setPanneau({ type: 'mission', id: ligne.mission.id })} />
                  ))}
                </ul>
              )}
          </section>
        </PanneauOnglet>

        <PanneauOnglet idGroupe={idGroupe} id="clients" actif={section === 'clients'}>
          <section className={styles.carte} aria-labelledby={`${idGroupe}-carnet`}>
            <h2 id={`${idGroupe}-carnet`} className={styles.titreCarte}>
              Carnet
              <Info libelle="Pourquoi le pays du client compte">
                Une prestation vendue à un professionnel d’un autre État membre
                doit figurer dans la déclaration européenne de services, dès le
                premier euro et même en franchise en base. Sans le pays et le
                numéro de TVA du client, cette obligation reste invisible.
              </Info>
            </h2>
            {faits.clients.length === 0
              ? (
                <Vide
                  message="Aucun client enregistré. Le carnet porte le pays et le numéro de TVA, sans lesquels l’obligation de déclaration européenne reste invisible."
                  action={(
                    <button type="button" className={styles.actionPrincipale}
                      onClick={() => setPanneau({ type: 'client', id: null })}>
                      Ajouter un client
                    </button>
                  )}
                />
              )
              : (
                <ul className={styles.liste}>
                  {faits.clients.map((c) => (
                    <li key={c.id} className={styles.ligneListe}>
                      <button type="button" className={styles.ouvrir}
                        onClick={() => setPanneau({ type: 'client', id: c.id })}>
                        <span className={styles.ligneTitre}>
                          <span className={styles.ligneLibelle}>{c.nom}</span>
                          <span className={styles.ligneMontant}>
                            {c.delaiPaiementJours} j
                          </span>
                        </span>
                        <span className={styles.ligneMeta}>
                          <span>{libellePays(c.pays)}</span>
                          {c.pays !== '' && c.pays.toUpperCase() !== 'FR' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className={c.tvaIntracom === '' ? styles.attention : undefined}>
                                {c.tvaIntracom === '' ? 'n° de TVA manquant' : c.tvaIntracom}
                              </span>
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </section>

          <section className={styles.carte} aria-labelledby={`${idGroupe}-delais`}>
            <h2 id={`${idGroupe}-delais`} className={styles.titreCarte}>
              Délai de paiement observé
              <Info libelle="Pourquoi la médiane plutôt que la moyenne">
                Un client qui paie à 30 jours neuf fois et à 300 jours une fois
                n’est pas un client à 57 jours. La moyenne décrit un client qui
                n’existe pas&nbsp;; la médiane décrit le comportement habituel.
                Le délai contractuel est une intention, celui-ci est un constat.
              </Info>
            </h2>
            {etat.delais.length === 0
              ? <p className={styles.vide}>Aucune recette enregistrée.</p>
              : (
                <ul className={styles.liste}>
                  {etat.delais.map((client) => (
                    <li key={client.clientNom} className={styles.ligneListe}>
                      <span className={styles.ligneTitre}>
                        <span className={styles.ligneLibelle}>{client.clientNom}</span>
                        <span className={styles.ligneMontant}><Montant>{eur(client.enAttente)}</Montant></span>
                      </span>
                      <span className={styles.ligneMeta}>
                        <span>
                          {client.delaiMedian === null
                            ? 'Délai non mesurable'
                            : `${client.delaiMedian} j en médiane`}
                        </span>
                        {client.delaiMaximum !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{client.delaiMaximum} j au pire</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>
                          {client.facturesMesurees === 0
                            ? 'aucune facture réglée'
                            : `${client.facturesMesurees} facture${client.facturesMesurees > 1 ? 's' : ''} mesurée${client.facturesMesurees > 1 ? 's' : ''}`}
                        </span>
                      </span>
                      {client.enRetard > 0 && (
                        <span className={styles.alerte}>
                          {client.enRetard} facture{client.enRetard > 1 ? 's' : ''} en attente
                          au-delà de son délai habituel
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
          </section>
        </PanneauOnglet>
      </div>

      <Sheet
        ouvert={panneau.type === 'client'}
        titre={panneau.type === 'client' && panneau.id !== null ? 'Modifier le client' : 'Nouveau client'}
        onFermer={() => setPanneau({ type: 'ferme' })}
      >
        {panneau.type === 'client' && (
          <FormulaireClient id={panneau.id} onFini={() => setPanneau({ type: 'ferme' })} />
        )}
      </Sheet>

      <Sheet
        ouvert={panneau.type === 'mission'}
        titre={panneau.type === 'mission' && panneau.id !== null ? 'Modifier la mission' : 'Nouvelle mission'}
        onFermer={() => setPanneau({ type: 'ferme' })}
      >
        {panneau.type === 'mission' && (
          <FormulaireMission id={panneau.id} onFini={() => setPanneau({ type: 'ferme' })} />
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
   Missions
   ───────────────────────────────────────────────────────────────────────── */

function LigneMissionAffichee(
  { ligne, onOuvrir }: { ligne: LigneMission; onOuvrir: () => void }
) {
  const { mission } = ligne;
  return (
    <li className={styles.ligneListe}>
      <button type="button" className={styles.ouvrir} onClick={onOuvrir}>
      <span className={styles.ligneTitre}>
        <span className={styles.ligneLibelle}>
          {/* Le nom du client vaut mieux qu'un « sans description » : dans
              l'ancienne application, c'est lui qui identifiait la mission, et
              une mission désignée par son absence de nom est illisible dans
              une liste. */}
          {mission.description || mission.clientNom || 'Mission sans description'}
        </span>
        <span className={styles.ligneMontant}><Montant>{eur(ligne.facture)}</Montant></span>
      </span>
      <span className={styles.ligneMeta}>
        <span>{mission.clientNom || 'Client non renseigné'}</span>
        <span aria-hidden="true">·</span>
        <span>{mission.tjm > 0 ? `${eur(mission.tjm)} / jour` : 'TJM non renseigné'}</span>
        <span aria-hidden="true">·</span>
        <span>{libelleStatut(mission.statut)}</span>
      </span>
      <span className={styles.ligneMeta}>
        <span>Encaissé <Montant>{eur(ligne.encaisse)}</Montant></span>
        {ligne.resteARentrer > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span className={styles.attention}>Reste <Montant>{eur(ligne.resteARentrer)}</Montant></span>
          </>
        )}
      </span>
      </button>
    </li>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Saisie du carnet
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Saisie d'un client.
 *
 * Le pays et le numéro de TVA sont ici parce qu'ils commandent une obligation
 * déclarative : sans eux, une prestation vendue dans l'Union reste invisible à
 * la déclaration européenne de services. L'écran le dit, plutôt que de les
 * présenter comme des champs d'agrément.
 *
 * Renommer un client propage le nouveau nom sur ses missions et ses recettes.
 * Le magasin s'en charge en une seule écriture ; l'écran n'a pas à le savoir,
 * mais l'utilisateur si — d'où l'avertissement.
 */
function FormulaireClient(
  { id, onFini }: { id: string | null; onFini: () => void }
) {
  const clients = useFaits((e) => e.faits.clients);
  const ajouter = useFaits((e) => e.ajouterClient);
  const modifier = useFaits((e) => e.modifierClient);
  const supprimer = useFaits((e) => e.supprimerClient);
  const signaler = useToast();
  const idChamp = useId();

  const existant = id === null ? undefined : clients.find((c) => c.id === id);
  const [saisie, setSaisie] = useState<Omit<Client, 'id'>>(() => ({
    nom: existant?.nom ?? '',
    adresse: existant?.adresse ?? '',
    siret: existant?.siret ?? '',
    email: existant?.email ?? '',
    delaiPaiementJours: existant?.delaiPaiementJours ?? 30,
    pays: existant?.pays ?? '',
    tvaIntracom: existant?.tvaIntracom ?? ''
  }));
  const [erreur, setErreur] = useState<string | null>(null);

  const horsFrance = saisie.pays.trim() !== '' && saisie.pays.trim().toUpperCase() !== 'FR';

  function soumettre(evenement: React.FormEvent): void {
    evenement.preventDefault();
    const refus = id === null ? ajouter(saisie) : modifier(id, saisie);
    if (refus !== null) { setErreur(refus); return; }
    // Le panneau se referme sur la liste : sans confirmation, on ne sait pas
    // si l'enregistrement a eu lieu, et on recommence — ce qui crée un
    // doublon.
    signaler(id === null ? 'Client ajouté.' : 'Client enregistré.');
    onFini();
  }

  return (
    <form className={styles.formulaire} onSubmit={soumettre}>
      <Champ id={`${idChamp}-nom`} libelle="Nom">
        <input id={`${idChamp}-nom`} value={saisie.nom} required
          onChange={(e) => setSaisie({ ...saisie, nom: e.target.value })} />
      </Champ>

      {existant !== undefined && saisie.nom.trim() !== existant.nom && (
        <p className={styles.avertissement}>
          Le nom rattache les missions et les recettes&nbsp;: le renommer les
          mettra à jour en même temps.
        </p>
      )}

      <Champ id={`${idChamp}-pays`} libelle="Pays (code à deux lettres)"
        aide="Vide ou FR pour un client français. Un autre État membre déclenche la DES.">
        <input id={`${idChamp}-pays`} value={saisie.pays} maxLength={2}
          onChange={(e) => setSaisie({ ...saisie, pays: e.target.value.toUpperCase() })} />
      </Champ>

      {horsFrance && (
        <Champ id={`${idChamp}-intracom`} libelle="N° de TVA intracommunautaire"
          aide="Obligatoire sur la déclaration européenne de services : sans lui, la ligne ne peut pas être déposée.">
          <input id={`${idChamp}-intracom`} value={saisie.tvaIntracom}
            onChange={(e) => setSaisie({ ...saisie, tvaIntracom: e.target.value })} />
        </Champ>
      )}

      <Champ id={`${idChamp}-delai`} libelle="Délai de paiement (jours)">
        <input id={`${idChamp}-delai`} inputMode="numeric"
          value={String(saisie.delaiPaiementJours)}
          onChange={(e) => setSaisie({
            ...saisie,
            delaiPaiementJours: Math.max(0, Number.parseInt(e.target.value, 10) || 0)
          })} />
      </Champ>

      <Champ id={`${idChamp}-email`} libelle="Courriel">
        <input id={`${idChamp}-email`} type="email" value={saisie.email}
          onChange={(e) => setSaisie({ ...saisie, email: e.target.value })} />
      </Champ>

      <Champ id={`${idChamp}-adresse`} libelle="Adresse">
        <input id={`${idChamp}-adresse`} value={saisie.adresse}
          onChange={(e) => setSaisie({ ...saisie, adresse: e.target.value })} />
      </Champ>

      <Champ id={`${idChamp}-siret`} libelle="SIRET ou identifiant">
        <input id={`${idChamp}-siret`} value={saisie.siret}
          onChange={(e) => setSaisie({ ...saisie, siret: e.target.value })} />
      </Champ>

      {erreur !== null && <p role="alert" className={styles.echec}>{erreur}</p>}

      <button type="submit" className={styles.actionPrincipale}>
        {id === null ? 'Ajouter le client' : 'Enregistrer'}
      </button>

      {existant !== undefined && (
        <button type="button" className={styles.supprimer}
          onClick={() => {
            const refus = supprimer(existant.id);
            if (refus !== null) { setErreur(refus); return; }
            signaler('Client supprimé.');
            onFini();
          }}>
          Supprimer ce client
        </button>
      )}
    </form>
  );
}

/** Saisie d'une mission. Le TJM sert à convertir le facturé en jours. */
function FormulaireMission(
  { id, onFini }: { id: string | null; onFini: () => void }
) {
  const faits = useFaits((e) => e.faits);
  const ajouter = useFaits((e) => e.ajouterMission);
  const modifier = useFaits((e) => e.modifierMission);
  const supprimer = useFaits((e) => e.supprimerMission);
  const signaler = useToast();
  const idChamp = useId();

  const existante = id === null ? undefined : faits.missions.find((m) => m.id === id);
  const [saisie, setSaisie] = useState<Omit<Mission, 'id'>>(() => ({
    clientId: existante?.clientId ?? null,
    clientNom: existante?.clientNom ?? '',
    description: existante?.description ?? '',
    tjm: existante?.tjm ?? euros(0),
    debut: existante?.debut ?? null,
    fin: existante?.fin ?? null,
    statut: existante?.statut ?? 'active',
    // Les AJUSTEMENTS ne se touchent pas ici : ils se posent au planning. Les
    // reprendre tels quels évite qu'une modification de description efface
    // l'activité d'un trimestre.
    //
    // Le RYTHME, lui, se déclare ici — c'est le fait qui remplit le planning,
    // et jusqu'au 13/08 aucun écran ne permettait de le saisir. Une mission
    // créée dans l'application avait donc un planning vide à jamais.
    entites: existante?.entites ?? [{ ...entiteVide(), id: `co-${Date.now()}` }]
  }));
  const [erreur, setErreur] = useState<string | null>(null);

  function soumettre(evenement: React.FormEvent): void {
    evenement.preventDefault();
    // Le rythme se saisit avant que les dates soient forcément connues : on
    // remplace ici ses bornes provisoires par la plage réelle de la mission.
    const complete = {
      ...saisie, entites: poserLesBornes(saisie.entites, saisie.debut, saisie.fin)
    };
    if (id === null) ajouter(complete); else modifier(id, complete);
    signaler(id === null ? 'Mission ajoutée.' : 'Mission enregistrée.');
    onFini();
  }

  const dateOuVide = (v: string) =>
    (/^\d{4}-\d{2}-\d{2}$/.test(v) ? dateISO(v) : null);

  return (
    <form className={styles.formulaire} onSubmit={soumettre}>
      <Champ id={`${idChamp}-client`} libelle="Client"
        aide={faits.clients.length === 0 ? 'Aucun client au carnet : le nom sera conservé tel quel.' : undefined}>
        <input id={`${idChamp}-client`} value={saisie.clientNom} required
          list={`${idChamp}-liste-clients`}
          onChange={(e) => setSaisie({ ...saisie, clientNom: e.target.value })} />
      </Champ>
      {/* Une liste de suggestions plutôt qu'un menu fermé : une mission peut
          concerner un client pas encore au carnet, et forcer sa création
          d'abord ferait perdre la saisie en cours. */}
      <datalist id={`${idChamp}-liste-clients`}>
        {faits.clients.map((c) => <option key={c.id} value={c.nom} />)}
      </datalist>

      <Champ id={`${idChamp}-description`} libelle="Description">
        <input id={`${idChamp}-description`} value={saisie.description}
          onChange={(e) => setSaisie({ ...saisie, description: e.target.value })} />
      </Champ>

      <Champ id={`${idChamp}-tjm`} libelle="Tarif journalier (€)"
        aide="Sert à convertir le facturé en équivalent-jours, donc à calculer l’occupation.">
        <input id={`${idChamp}-tjm`} inputMode="decimal" value={String(saisie.tjm)}
          onChange={(e) => setSaisie({
            ...saisie,
            tjm: euros(Number.parseFloat(e.target.value.replace(',', '.')) || 0)
          })} />
      </Champ>

      <Champ id={`${idChamp}-debut`} libelle="Début">
        <input id={`${idChamp}-debut`} type="date" value={saisie.debut ?? ''}
          onChange={(e) => setSaisie({ ...saisie, debut: dateOuVide(e.target.value) })} />
      </Champ>

      <Champ id={`${idChamp}-fin`} libelle="Fin">
        <input id={`${idChamp}-fin`} type="date" value={saisie.fin ?? ''}
          onChange={(e) => setSaisie({ ...saisie, fin: dateOuVide(e.target.value) })} />
      </Champ>

      <Champ id={`${idChamp}-statut`} libelle="Statut">
        <select id={`${idChamp}-statut`} value={saisie.statut}
          onChange={(e) => setSaisie({ ...saisie, statut: e.target.value as Mission['statut'] })}>
          <option value="active">En cours</option>
          <option value="prospect">Prospect</option>
          <option value="terminee">Terminée</option>
          <option value="perdue">Perdue</option>
        </select>
      </Champ>

      <EditeurEntites
        entites={saisie.entites}
        clientNom={saisie.clientNom}
        datees={saisie.debut !== null && saisie.fin !== null}
        onChange={(entites) => setSaisie({ ...saisie, entites })}
      />

      {erreur !== null && <p role="alert" className={styles.echec}>{erreur}</p>}

      <button type="submit" className={styles.actionPrincipale}>
        {id === null ? 'Ajouter la mission' : 'Enregistrer'}
      </button>

      {existante !== undefined && (
        <button type="button" className={styles.supprimer}
          onClick={() => {
            const refus = supprimer(existante.id);
            if (refus !== null) { setErreur(refus); return; }
            signaler('Mission supprimée.');
            onFini();
          }}>
          Supprimer cette mission
        </button>
      )}
    </form>
  );
}

function Champ(
  { id, libelle, aide, children }: {
    id: string; libelle: string; aide?: string | undefined; children: React.ReactNode;
  }
) {
  return (
    <p className={styles.champ}>
      <label htmlFor={id}>{libelle}</label>
      {children}
      {aide !== undefined && <span className={styles.aide}>{aide}</span>}
    </p>
  );
}

/** Le pays en clair. Un code à deux lettres ne se lit pas d'un coup d'œil. */
function libellePays(code: string): string {
  const propre = code.trim().toUpperCase();
  if (propre === '' || propre === 'FR') return 'France';
  try {
    const nom = new Intl.DisplayNames(['fr'], { type: 'region' }).of(propre);
    return nom ?? propre;
  } catch {
    return propre;
  }
}

function libelleStatut(statut: Mission['statut']): string {
  switch (statut) {
    case 'active': return 'En cours';
    case 'terminee': return 'Terminée';
    case 'prospect': return 'Prospect';
    case 'perdue': return 'Perdue';
  }
}

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

/**
 * Les équivalent-jours se présentent avec une décimale.
 *
 * Un montant divisé par un tarif tombe rarement juste, et arrondir à l'entier
 * ferait disparaître les demi-journées — qui sont précisément ce dont on
 * discute quand on regarde un plan de charge.
 */
function formaterJours(jours: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(jours);
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
const TEINTES = ['#22c55e', '#38bdf8', '#f59e0b', '#a78bfa', '#f472b6', '#94a3b8'];

const JOURS_LIBELLES: Readonly<Record<JourDeSemaine, string>> = {
  lun: 'Lun', mar: 'Mar', mer: 'Mer', jeu: 'Jeu', ven: 'Ven', sam: 'Sam', dim: 'Dim'
};

/**
 * Le rythme, et les clients chez qui il s'applique.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE FAIT QUI REMPLIT LE PLANNING N'ÉTAIT SAISISSABLE NULLE PART
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'enchaînement du métier est : rythme → planning rempli d'office →
 * ajustements → CRA. Le domaine le savait, le planning savait le lire, et
 * aucun écran ne permettait de déclarer le rythme. Une mission créée dans
 * l'application avait donc un planning vide, définitivement — seules les
 * missions reprises de l'ancienne version en avaient un.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CAS À UN CLIENT NE MONTRE PAS LE CONCEPT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une mission ordinaire a un seul client opérationnel : on ne voit alors
 * qu'un rythme hebdomadaire, sans nom ni couleur à renseigner. Le vocabulaire
 * n'apparaît qu'au moment où on ajoute le second — c'est-à-dire quand il
 * commence à vouloir dire quelque chose.
 */
function EditeurEntites(
  { entites, clientNom, datees, onChange }: {
    readonly entites: readonly ClientOperationnel[];
    readonly clientNom: string;
    /** La mission a-t-elle un début ET une fin ? Sans quoi le rythme n'a pas de plage. */
    readonly datees: boolean;
    readonly onChange: (entites: readonly ClientOperationnel[]) => void;
  }
) {
  const plusieurs = entites.length > 1;

  function modifier(i: number, champs: Partial<ClientOperationnel>): void {
    onChange(entites.map((e, j) => (j === i ? { ...e, ...champs } : e)));
  }

  return (
    <fieldset className={styles.groupe}>
      <legend className={styles.legendeGroupe}>
        {plusieurs ? 'Clients opérationnels' : 'Rythme de travail'}
        <Info libelle="À quoi sert le rythme">
          C’est lui qui remplit le planning&nbsp;: on déclare une fois
          «&nbsp;lundi à jeudi pleins, vendredi à mi-temps&nbsp;», et les
          journées se posent toutes seules. On ne corrige ensuite que ce qui
          s’est passé autrement, et le CRA tombe à la fin du mois.
          {' '}Si la mission passe par une agence et couvre plusieurs donneurs
          d’ordre, ajoutez-en un par client&nbsp;: chacun a son rythme, et
          chacun signera son propre CRA.
        </Info>
      </legend>

      {!datees && (
        <p className={styles.aide}>
          Renseignez le début et la fin de la mission&nbsp;: sans plage de
          dates, le rythme ne peut se poser sur aucune journée.
        </p>
      )}

      {entites.map((entite, i) => (
        <div key={entite.id} className={styles.entite}>
          {plusieurs && (
            <div className={styles.entiteEntete}>
              <input
                type="color"
                className={styles.teinte}
                aria-label={`Couleur du client ${i + 1}`}
                value={entite.couleur !== '' ? entite.couleur : (TEINTES[i % TEINTES.length] as string)}
                onChange={(e) => modifier(i, { couleur: e.target.value })}
              />
              <input
                className={styles.entiteNom}
                aria-label={`Nom du client opérationnel ${i + 1}`}
                placeholder={i === 0 && clientNom !== '' ? clientNom : 'Nom du client final'}
                value={entite.nom}
                onChange={(e) => modifier(i, { nom: e.target.value })}
              />
              {/* Le dernier ne se retire pas : une mission sans client
                  opérationnel n'a plus de rythme, donc plus de planning. */}
              <button
                type="button"
                className={styles.retirer}
                onClick={() => onChange(entites.filter((_, j) => j !== i))}
              >
                Retirer
              </button>
            </div>
          )}

          <SemaineType
            parJour={parJourDe(entite)}
            onChange={(parJour) => modifier(i, { rythmes: rythmeDe(entite, parJour) })}
          />
        </div>
      ))}

      <button
        type="button"
        className={styles.ajouterEntite}
        onClick={() => onChange([...entites, {
          ...entiteVide(),
          id: `co-${Date.now()}-${entites.length}`,
          couleur: TEINTES[entites.length % TEINTES.length] as string
        }])}
      >
        Ajouter un client opérationnel
      </button>
    </fieldset>
  );
}

/**
 * La semaine type : sept boutons qui font le tour 0 → 1 → ½ → 0.
 *
 * Le même geste qu'au planning, volontairement : ce qu'on apprend d'un côté
 * sert de l'autre. Une case à cocher ne saurait pas dire la demi-journée, que
 * l'ancienne application gère depuis toujours.
 */
function SemaineType(
  { parJour, onChange }: {
    readonly parJour: Readonly<Partial<Record<JourDeSemaine, number>>>;
    readonly onChange: (parJour: Readonly<Partial<Record<JourDeSemaine, number>>>) => void;
  }
) {
  return (
    <div className={styles.semaineType} role="group" aria-label="Jours travaillés dans la semaine">
      {JOURS_DE_LA_SEMAINE.map((j) => {
        const q = parJour[j] ?? 0;
        const classes = [
          styles.jourType,
          q >= 1 ? styles.jourPlein : '',
          q > 0 && q < 1 ? styles.jourDemi : ''
        ].filter((c) => c !== '').join(' ');

        return (
          <button
            key={j}
            type="button"
            className={classes}
            aria-pressed={q > 0}
            onClick={() => {
              const suivant = { ...parJour };
              if (q === 0) suivant[j] = 1;
              else if (q >= 1) suivant[j] = 0.5;
              else delete suivant[j];
              onChange(suivant);
            }}
          >
            {JOURS_LIBELLES[j]}
            <span className={styles.quotiteJour}>
              {q >= 1 ? '1' : q > 0 ? '½' : '—'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** La semaine type d'une entité : celle du dernier rythme déclaré. */
function parJourDe(e: ClientOperationnel): Readonly<Partial<Record<JourDeSemaine, number>>> {
  return e.rythmes[e.rythmes.length - 1]?.parJour ?? {};
}

/**
 * Repose la semaine type sur les rythmes existants.
 *
 * On modifie le DERNIER rythme, pas tous : une renégociation de septembre ne
 * doit pas réécrire l'été, et c'est exactement ce que ferait un remplacement
 * en bloc. Sans rythme préexistant, la plage est celle de la mission — posée
 * par `FormulaireMission`, qui seul connaît ses dates.
 */
function rythmeDe(
  e: ClientOperationnel,
  parJour: Readonly<Partial<Record<JourDeSemaine, number>>>
): readonly Rythme[] {
  if (e.rythmes.length === 0) {
    return [{ du: BORNE_A_POSER, au: BORNE_A_POSER, parJour, tjm: null }];
  }
  return e.rythmes.map((r, i) => (i === e.rythmes.length - 1 ? { ...r, parJour } : r));
}

/**
 * Borne provisoire d'un rythme tout juste déclaré.
 *
 * Le rythme se saisit avant que les dates de mission soient forcément
 * connues. Plutôt qu'inventer une plage, on pose une borne reconnaissable que
 * `FormulaireMission` remplace par les dates réelles à l'enregistrement. Une
 * plage inventée produirait des journées à des dates que personne n'a
 * choisies.
 */
const BORNE_A_POSER = '0000-00-00' as DateISO;

/** Remplace les bornes provisoires par la plage réelle de la mission. */
function poserLesBornes(
  entites: readonly ClientOperationnel[], debut: DateISO | null, fin: DateISO | null
): readonly ClientOperationnel[] {
  if (debut === null || fin === null) return entites;
  return entites.map((e) => ({
    ...e,
    rythmes: e.rythmes.map((r) => ({
      ...r,
      du: r.du === BORNE_A_POSER ? debut : r.du,
      au: r.au === BORNE_A_POSER ? fin : r.au
    }))
  }));
}
