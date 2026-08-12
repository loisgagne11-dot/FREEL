import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { type LigneMission, etatActivite, moisCourant } from '../../state/selecteurs';
import type { Jour, NatureJour } from '../../domain/calculs/activite';
import type { DateISO, Mois } from '../../domain/types';
import type { Client, Mission } from '../../state/schema';
import { euros, dateISO } from '../../domain/types';
import { Info } from '../components/Info';
import { Vide } from '../components/Vide';
import { Onglets, PanneauOnglet } from '../components/Onglets';
import { Sheet } from '../components/Sheet';
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
  const [panneau, setPanneau] = useState<Panneau>({ type: 'ferme' });
  const [mois, setMois] = useState<Mois>(() => moisCourant());
  const idGroupe = useId();

  const etat = useMemo(() => etatActivite(faits, mois), [faits, mois]);

  return (
    <>
      <header className={styles.entete}>
        <h1 className={styles.titre}>Activité</h1>
        {/* Liste vide : l'action vit dans l'état vide, là où le regard se
            pose. La répéter ici donnerait deux commandes identiques à
            quelques centimètres. */}
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
            if (refus !== null) setErreur(refus); else onFini();
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
  const idChamp = useId();

  const existante = id === null ? undefined : faits.missions.find((m) => m.id === id);
  const [saisie, setSaisie] = useState<Omit<Mission, 'id'>>(() => ({
    clientId: existante?.clientId ?? null,
    clientNom: existante?.clientNom ?? '',
    description: existante?.description ?? '',
    tjm: existante?.tjm ?? euros(0),
    debut: existante?.debut ?? null,
    fin: existante?.fin ?? null,
    statut: existante?.statut ?? 'active'
  }));
  const [erreur, setErreur] = useState<string | null>(null);

  function soumettre(evenement: React.FormEvent): void {
    evenement.preventDefault();
    if (id === null) ajouter(saisie); else modifier(id, saisie);
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

      {erreur !== null && <p role="alert" className={styles.echec}>{erreur}</p>}

      <button type="submit" className={styles.actionPrincipale}>
        {id === null ? 'Ajouter la mission' : 'Enregistrer'}
      </button>

      {existante !== undefined && (
        <button type="button" className={styles.supprimer}
          onClick={() => {
            const refus = supprimer(existante.id);
            if (refus !== null) setErreur(refus); else onFini();
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
      <span className={`${styles.montant} ${classe}`}>{valeur}</span>
    </div>
  );
}
