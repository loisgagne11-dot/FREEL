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
