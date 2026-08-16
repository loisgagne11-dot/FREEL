import { useId, useState } from 'react';
import { dateISO, euros } from '../../domain/types';
import type { DateISO } from '../../domain/types';
import { useFaits } from '../../state/store';
import { useToast } from '../components/Toasts';
import { Info } from '../components/Info';
import { entiteVide } from '../../state/schema';
import type { Client, ClientOperationnel, Mission } from '../../state/schema';
import {
  JOURS_SEMAINE as JOURS_DE_LA_SEMAINE, type JourDeSemaine, type Rythme
} from '../../domain/calculs/planning';
import styles from './Activite.module.css';

/** Les teintes proposées pour distinguer les clients opérationnels au planning. */
const TEINTES = ['#22c55e', '#38bdf8', '#f59e0b', '#a78bfa', '#f472b6', '#94a3b8'];

const JOURS_LIBELLES: Readonly<Record<JourDeSemaine, string>> = {
  lun: 'Lun', mar: 'Mar', mer: 'Mer', jeu: 'Jeu', ven: 'Ven', sam: 'Sam', dim: 'Dim'
};

/**
 * Borne provisoire d'un rythme tout juste déclaré.
 *
 * Le rythme se saisit avant que les dates de mission soient forcément
 * connues. Plutôt qu'inventer une plage, on pose une borne reconnaissable que
 * `poserLesBornes` remplace par les dates réelles à l'enregistrement. Une plage
 * inventée produirait des journées à des dates que personne n'a choisies.
 *
 * Déclarée ici, en tête : `PERIODE_VIDE` la lit au moment où le module
 * s'évalue, et non depuis une fonction. La ranger plus bas, à côté de ses
 * usages, la laisserait dans sa zone morte temporelle — le module lèverait au
 * chargement, et l'écran entier tomberait.
 */
const BORNE_A_POSER = '0000-00-00' as DateISO;

/**
 * Les formulaires de l'écran Activité — client, mission, clients opérationnels.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ILS SONT DANS UN FICHIER À PART, ET CHARGÉS À LA DEMANDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Activité est le plus gros écran du projet, et l'ajout du panneau de plage de
 * congés lui a fait franchir son plafond de 40 Ko. La règle du projet est de ne
 * jamais relever un plafond mais d'extraire ce qui n'a rien à faire là.
 *
 * Ces formulaires sont le bon candidat : ils ne s'ouvrent que dans un panneau
 * latéral, sur un geste explicite — « nouveau client », « modifier la mission ».
 * Consulter son planning, ce qu'on fait dix fois pour une modification, n'a pas
 * à payer leur poids. Le fragment arrive pendant que le panneau s'ouvre.
 */

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
export function FormulaireClient(
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
export function FormulaireMission(
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
        debut={saisie.debut}
        fin={saisie.fin}
        tjmMission={saisie.tjm}
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
  { entites, clientNom, debut, fin, tjmMission, onChange }: {
    readonly entites: readonly ClientOperationnel[];
    readonly clientNom: string;
    /** Les bornes de la mission. Sans elles, le rythme n'a aucune plage où se poser. */
    readonly debut: DateISO | null;
    readonly fin: DateISO | null;
    /** Le TJM de la mission, affiché comme valeur par défaut d'une période. */
    readonly tjmMission: number;
    readonly onChange: (entites: readonly ClientOperationnel[]) => void;
  }
) {
  const plusieurs = entites.length > 1;
  const datees = debut !== null && fin !== null;

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

          <EditeurRythmes
            rythmes={entite.rythmes}
            tjmMission={tjmMission}
            debut={debut}
            fin={fin}
            onChange={(rythmes) => modifier(i, { rythmes })}
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

/**
 * Les périodes de rythme d'un client opérationnel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE MODÈLE SAVAIT LE DIRE, LE FORMULAIRE NE SAVAIT PAS L'ÉCRIRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `ClientOperationnel.rythmes` est une LISTE de plages datées depuis le
 * schéma 4, et `rythmePour` sait déjà arbitrer entre deux plages qui se
 * chevauchent — la plus récemment déclarée l'emporte. Le formulaire, lui,
 * n'éditait que la dernière : on ne pouvait donc pas déclarer « cinq jours par
 * semaine jusqu'en août, trois ensuite », alors que c'est le cas courant d'une
 * mission qui se prolonge à temps partiel.
 *
 * Le passage à mi-temps chez le même client n'est pas une nouvelle mission : le
 * contrat, le CRA et la facturation restent les mêmes. Forcer à en créer une
 * seconde aurait coupé en deux l'historique d'un même engagement, et cassé le
 * rattachement du chiffre d'affaires que la mission porte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉCOUPAGE EST MENSUEL, ET CE N'EST PAS UN RACCOURCI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La première version de cet éditeur ajoutait une plage libre, à dater soi-même.
 * Elle butait sur une jonction indéterminée : deux plages sans dates saisies
 * couvraient toutes deux la mission entière, et comme `rythmePour` retient la
 * dernière déclarée, la première devenait morte — en silence, en laissant croire
 * à un changement enregistré.
 *
 * Le handoff de design tranche autrement, et mieux : une ligne PAR MOIS de la
 * mission, avec son rythme et son TJM. Il n'y a alors plus aucune jonction à
 * deviner, puisque les bornes sont celles du calendrier. Les champs de date
 * restent modifiables : un changement au 15 reste exprimable, il n'est
 * simplement pas ce qu'on propose par défaut.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CAS À UNE PÉRIODE NE MONTRE PAS LE CONCEPT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Même règle que pour les clients opérationnels : tant qu'il n'y a qu'une
 * plage, on ne voit que la semaine type — ni dates ni TJM, puisqu'ils valent
 * ceux de la mission. Les dates n'apparaissent qu'au moment où il y en a deux,
 * c'est-à-dire quand elles commencent à départager quelque chose.
 */
function EditeurRythmes(
  { rythmes, tjmMission, debut, fin, onChange }: {
    readonly rythmes: readonly Rythme[];
    readonly tjmMission: number;
    /** Les bornes de la mission, qui commandent le découpage mensuel. */
    readonly debut: DateISO | null;
    readonly fin: DateISO | null;
    readonly onChange: (rythmes: readonly Rythme[]) => void;
  }
) {
  // Une entité sans rythme se présente comme une entité à une période vide :
  // sinon la première semaine type n'aurait nulle part où s'écrire.
  const periodes = rythmes.length === 0 ? [PERIODE_VIDE] : rythmes;
  const plusieurs = periodes.length > 1;
  // Sans bornes de mission, il n'y a pas de mois à découper. Le message qui
  // réclame les dates est déjà affiché par `EditeurEntites` juste au-dessus.
  const decoupable = debut !== null && fin !== null && periodes.length === 1;

  function modifier(i: number, champs: Partial<Rythme>): void {
    onChange(periodes.map((r, j) => (j === i ? { ...r, ...champs } : r)));
  }

  return (
    <div className={styles.rythmes}>
      {periodes.map((periode, i) => (
        <div key={i} className={styles.periode}>
          {plusieurs && (
            <div className={styles.periodeEntete}>
              {/* Le mois en toutes lettres avant les dates : c'est lui qu'on
                  cherche des yeux pour trouver la ligne à changer. Deux champs
                  de date se lisent, un intitulé se repère. */}
              <span className={styles.periodeMois}>{libelleDuMois(periode.du)}</span>
              <input
                type="date"
                className={styles.periodeDate}
                aria-label={`Début de la période ${i + 1}`}
                value={periode.du === BORNE_A_POSER ? '' : periode.du}
                onChange={(e) => modifier(i, { du: dateOuBorne(e.target.value) })}
              />
              <span className={styles.periodeSepare} aria-hidden="true">→</span>
              <input
                type="date"
                className={styles.periodeDate}
                aria-label={`Fin de la période ${i + 1}`}
                value={periode.au === BORNE_A_POSER ? '' : periode.au}
                onChange={(e) => modifier(i, { au: dateOuBorne(e.target.value) })}
              />
              {/* Retirer la dernière période est permis : une mission peut
                  légitimement n'avoir aucun rythme déclaré — son planning
                  reste alors vide, ce qui est un état, pas une panne. */}
              <button
                type="button"
                className={styles.retirer}
                onClick={() => onChange(periodes.filter((_, j) => j !== i))}
              >
                Retirer
              </button>
            </div>
          )}

          <SemaineType
            parJour={periode.parJour}
            onChange={(parJour) => modifier(i, { parJour })}
          />

          {plusieurs && (
            <label className={styles.tjmPeriode}>
              TJM sur cette période
              <input
                type="number"
                inputMode="decimal"
                step="10"
                min="0"
                placeholder={tjmMission > 0 ? String(tjmMission) : 'TJM de la mission'}
                value={periode.tjm ?? ''}
                onChange={(e) => modifier(i, {
                  tjm: e.target.value === '' ? null : euros(Number(e.target.value) || 0)
                })}
              />
            </label>
          )}
        </div>
      ))}

      {decoupable && (
        <button
          type="button"
          className={styles.ajouterEntite}
          onClick={() => onChange(
            parMois(periodes[0] as Rythme, debut as DateISO, fin as DateISO)
          )}
        >
          Changer de rythme en cours de mission
        </button>
      )}
      {plusieurs && (
        <p className={styles.aide}>
          Un mois par ligne&nbsp;: modifiez ceux qui changent, laissez les autres.
          Les dates restent modifiables si le changement tombe en cours de mois.
        </p>
      )}
    </div>
  );
}

const PERIODE_VIDE: Rythme = {
  du: BORNE_A_POSER, au: BORNE_A_POSER, parJour: {}, tjm: null
};

/**
 * Découpe une période unique en un rythme par mois de la mission.
 *
 * Chaque mois hérite du rythme et du TJM en cours : un changement part presque
 * toujours d'un rythme connu qu'on amende — passer de cinq jours à trois, ce
 * n'est pas repartir de zéro. Seules les lignes qui changent sont ensuite
 * touchées.
 *
 * Les bornes sont celles du calendrier, ramenées à celles de la mission au
 * premier et au dernier mois : le rythme ne doit pas déborder de la mission, ce
 * qui remplirait le planning de journées hors contrat.
 *
 * Au-delà de trente-six mois, on s'arrête : une mission de trois ans se pilote
 * autrement qu'en modifiant trente-six lignes, et un formulaire qui en génère
 * cent cinquante n'est plus utilisable.
 */
const MOIS_MAXIMUM_DECOUPES = 36;

function parMois(modele: Rythme, debut: DateISO, fin: DateISO): readonly Rythme[] {
  const mois: Rythme[] = [];
  let curseur = premierDuMois(debut);

  while (curseur <= fin && mois.length < MOIS_MAXIMUM_DECOUPES) {
    const finDuMois = dernierDuMois(curseur);
    mois.push({
      du: curseur < debut ? debut : curseur,
      au: finDuMois > fin ? fin : finDuMois,
      parJour: modele.parJour,
      tjm: modele.tjm
    });
    curseur = lendemainDe(finDuMois);
  }
  return mois.length === 0 ? [modele] : mois;
}

/** « 2026-05-01 » → « mai 26 ». Vide tant que la borne n'est pas posée. */
function libelleDuMois(d: DateISO): string {
  if (d === BORNE_A_POSER) return '';
  return new Date(`${d.slice(0, 7)}-01T00:00:00Z`)
    .toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

const premierDuMois = (d: DateISO): DateISO => `${d.slice(0, 7)}-01` as DateISO;

function dernierDuMois(d: DateISO): DateISO {
  const date = new Date(`${d.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10) as DateISO;
}

/** Le jour suivant une date ISO, en UTC pour ne pas dépendre du fuseau. */
function lendemainDe(date: DateISO): DateISO {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10) as DateISO;
}

/** Un champ de date vidé redevient une borne à poser, jamais une date vide. */
const dateOuBorne = (v: string): DateISO =>
  (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v as DateISO : BORNE_A_POSER);

/**
 * Remplace les bornes provisoires par des dates réelles.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES BORNES SE POSENT DE PROCHE EN PROCHE, PAS TOUTES SUR LA MISSION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Tant qu'il n'y avait qu'un rythme, « début manquant = début de mission, fin
 * manquante = fin de mission » suffisait. Avec plusieurs périodes, cette règle
 * les ferait toutes courir sur la mission entière : elles se recouvriraient
 * intégralement, et comme `rythmePour` retient la dernière déclarée, toutes les
 * précédentes deviendraient mortes — silencieusement, en laissant croire à un
 * changement de rythme enregistré.
 *
 * La règle est donc la chaîne : une période commence au lendemain de celle qui
 * la précède, et finit la veille de celle qui la suit. Seules les deux bornes
 * extrêmes retombent sur la mission.
 */
function poserLesBornes(
  entites: readonly ClientOperationnel[], debut: DateISO | null, fin: DateISO | null
): readonly ClientOperationnel[] {
  if (debut === null || fin === null) return entites;
  return entites.map((e) => ({
    ...e,
    rythmes: e.rythmes.map((r, i, tous) => {
      const precedente = i === 0 ? undefined : tous[i - 1];
      const suivante = tous[i + 1];
      const du = r.du !== BORNE_A_POSER ? r.du
        : precedente === undefined || precedente.au === BORNE_A_POSER
          ? debut
          : lendemainDe(precedente.au);
      const au = r.au !== BORNE_A_POSER ? r.au
        : suivante === undefined || suivante.du === BORNE_A_POSER
          ? fin
          : veilleDe(suivante.du);
      return { ...r, du, au };
    })
  }));
}

/** Le jour précédant une date ISO, en UTC comme `lendemainDe`. */
function veilleDe(date: DateISO): DateISO {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10) as DateISO;
}
