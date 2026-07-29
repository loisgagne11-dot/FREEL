import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { type LigneMission, etatActivite, moisCourant } from '../../state/selecteurs';
import type { Jour, NatureJour } from '../../domain/calculs/activite';
import type { DateISO, Mois } from '../../domain/types';
import { Info } from '../components/Info';
import { Onglets, PanneauOnglet } from '../components/Onglets';
import { dateCourte, eur } from '../format';
import styles from './Activite.module.css';

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

  const [section, setSection] = useState<Section>('charge');
  const [mois, setMois] = useState<Mois>(() => moisCourant());
  const idGroupe = useId();

  const etat = useMemo(() => etatActivite(faits, mois), [faits, mois]);

  return (
    <>
      <header className={styles.entete}>
        <h1 className={styles.titre}>Activité</h1>
        <div className={styles.navigationMois}>
          <button
            type="button"
            className={styles.pas}
            onClick={() => setMois(decalerMois(mois, -1))}
            aria-label="Mois précédent"
          >
            <span aria-hidden="true">‹</span>
          </button>
          {/* Le mois affiché est annoncé aux lecteurs d'écran à chaque
              changement : sans cela, les flèches déplacent une vue dont on
              n'entend jamais l'état. */}
          <span className={styles.moisCourant} role="status">{moisLong(mois)}</span>
          <button
            type="button"
            className={styles.pas}
            onClick={() => setMois(decalerMois(mois, 1))}
            aria-label="Mois suivant"
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </header>

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

            <Calendrier
              mois={mois}
              jours={etat.calendrier}
              onBasculer={basculerConge}
            />

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
              ? <p className={styles.vide}>Aucune mission enregistrée.</p>
              : (
                <ul className={styles.liste}>
                  {etat.missions.map((ligne) => (
                    <LigneMissionAffichee key={ligne.mission.id} ligne={ligne} />
                  ))}
                </ul>
              )}
          </section>
        </PanneauOnglet>

        <PanneauOnglet idGroupe={idGroupe} id="clients" actif={section === 'clients'}>
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
                        <span className={styles.ligneMontant}>{eur(client.enAttente)}</span>
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
    </>
  );
}

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

function LigneMissionAffichee({ ligne }: { ligne: LigneMission }) {
  const { mission } = ligne;
  return (
    <li className={styles.ligneListe}>
      <span className={styles.ligneTitre}>
        <span className={styles.ligneLibelle}>
          {mission.description || 'Mission sans description'}
        </span>
        <span className={styles.ligneMontant}>{eur(ligne.facture)}</span>
      </span>
      <span className={styles.ligneMeta}>
        <span>{mission.clientNom || 'Client non renseigné'}</span>
        <span aria-hidden="true">·</span>
        <span>{mission.tjm > 0 ? `${eur(mission.tjm)} / jour` : 'TJM non renseigné'}</span>
        <span aria-hidden="true">·</span>
        <span>{libelleStatut(mission.statut)}</span>
      </span>
      <span className={styles.ligneMeta}>
        <span>Encaissé {eur(ligne.encaisse)}</span>
        {ligne.resteARentrer > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span className={styles.attention}>Reste {eur(ligne.resteARentrer)}</span>
          </>
        )}
      </span>
    </li>
  );
}

function libelleStatut(statut: 'active' | 'terminee' | 'prospect'): string {
  switch (statut) {
    case 'active': return 'En cours';
    case 'terminee': return 'Terminée';
    case 'prospect': return 'Prospect';
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
      <span className={`${styles.montant} ${classe}`}>{valeur}</span>
    </div>
  );
}
