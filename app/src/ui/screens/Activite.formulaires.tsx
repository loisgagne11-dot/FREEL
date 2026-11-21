import { useId, useState } from 'react';
import { dateISO, euros } from '../../domain/types';
import type { DateISO } from '../../domain/types';
import { useFaits } from '../../state/store';
import { dateDuJour } from '../../state/selecteurs';
import { ajouterMission, modifierMission } from '../../state/ecritures.activite';
import {
  ajouterClient, modifierClient, supprimerClient, supprimerMission
} from '../../state/ecritures.carnet';
import { useToast } from '../components/Toasts';
import { ConfirmationSurPlace } from '../components/ConfirmationSurPlace';
import { peutSupprimerClient, peutSupprimerMission } from '../../domain/calculs/carnet';
import { Info } from '../components/Info';
import { entiteVide } from '../../state/schema.entite';
import type { Client, ClientOperationnel, Mission } from '../../state/schema';
import {
  JOURS_SEMAINE as JOURS_DE_LA_SEMAINE, type JourDeSemaine, type Rythme
} from '../../domain/calculs/planning';
import {
  FORMULE_PAR_DEFAUT, type FormuleDelai
} from '../../domain/calculs/delaiPaiement';
import { arretDuClient } from '../../domain/calculs/clientsOperationnels.lecture';
import { modeDeFacturation } from '../../domain/calculs/brouillon';
import {
  ChoixFacturation, type ContexteDesGestes, GestesDuClient, SituationDuClient
} from './Activite.clientsMission';
import { lendemain, nomDuClient } from './Activite.clientsMission.lecture';
import {
  FORMULES_DELAI, depassementLegal, libelleDelai
} from '../../domain/calculs/delaiPaiement.libelles';
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
  const missions = useFaits((e) => e.faits.missions);
  const recettes = useFaits((e) => e.faits.recettes);
  /* Ces écritures vivent hors du magasin : elles emportaient les gardes du
     carnet dans le paquet d'entrée pour un écran chargé à la demande. Voir
     `state/ecritures.carnet`. */
  const ajouter = ajouterClient;
  const modifier = modifierClient;
  const supprimer = supprimerClient;
  const signaler = useToast();
  const idChamp = useId();

  const existant = id === null ? undefined : clients.find((c) => c.id === id);
  const [saisie, setSaisie] = useState<Omit<Client, 'id'>>(() => ({
    nom: existant?.nom ?? '',
    adresse: existant?.adresse ?? '',
    siret: existant?.siret ?? '',
    email: existant?.email ?? '',
    delaiPaiement: existant?.delaiPaiement ?? FORMULE_PAR_DEFAUT,
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

      <ChoixDelai
        id={`${idChamp}-delai`}
        libelle="Conditions de paiement habituelles"
        valeur={saisie.delaiPaiement}
        onChange={(delaiPaiement) => setSaisie({ ...saisie, delaiPaiement })}
      />

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
        <ConfirmationSurPlace
          libelle="Supprimer ce client"
          classeDeclencheur={styles.supprimer}
          // Un client qui a des missions ou des factures est refusé par
          // l'écriture : le dire tout de suite, plutôt qu'après une
          // confirmation validée pour rien.
          peutOuvrir={() => {
            const refus = peutSupprimerClient(existant.nom, missions, recettes);
            setErreur(refus?.message ?? null);
            return refus === null;
          }}
          consequence={(
            <>
              La fiche de {existant.nom || 'ce client'} quitte le carnet, avec
              ses coordonnées&nbsp;: il faudra les ressaisir pour lui facturer
              de nouveau.
            </>
          )}
          libelleConfirmer="Supprimer le client"
          onConfirmer={() => {
            const refus = supprimer(existant.id);
            if (refus !== null) { setErreur(refus); return; }
            signaler('Client supprimé.');
            onFini();
          }}
        />
      )}
    </form>
  );
}

/** Saisie d'une mission. Le TJM sert à convertir le facturé en jours. */
export function FormulaireMission(
  { id, onFini }: { id: string | null; onFini: () => void }
) {
  const faits = useFaits((e) => e.faits);
  const ajouter = ajouterMission;
  const modifier = modifierMission;
  const supprimer = supprimerMission;
  const signaler = useToast();
  const idChamp = useId();

  const existante = id === null ? undefined : faits.missions.find((m) => m.id === id);
  const [saisie, setSaisie] = useState<Omit<Mission, 'id'>>(() => ({
    clientId: existante?.clientId ?? null,
    clientNom: existante?.clientNom ?? '',
    description: existante?.description ?? '',
    tjm: existante?.tjm ?? euros(0),
    delaiPaiement: existante?.delaiPaiement ?? null,
    referenceCommande: existante?.referenceCommande ?? null,
    debut: existante?.debut ?? null,
    fin: existante?.fin ?? null,
    statut: existante?.statut ?? 'active',
    // Le carnet de commandes (schéma 27) : `null` tant que rien n'est dit.
    joursCommandes: existante?.joursCommandes ?? null,
    preavisFinJours: existante?.preavisFinJours ?? null,
    reconduction: existante?.reconduction ?? null,
    probabilite: existante?.probabilite ?? null,
    // Les AJUSTEMENTS ne se touchent pas ici : ils se posent au planning. Les
    // reprendre tels quels évite qu'une modification de description efface
    // l'activité d'un trimestre.
    //
    // Le RYTHME, lui, se déclare ici — c'est le fait qui remplit le planning,
    // et jusqu'au 13/08 aucun écran ne permettait de le saisir. Une mission
    // créée dans l'application avait donc un planning vide à jamais.
    entites: existante?.entites ?? [{ ...entiteVide(), id: `co-${Date.now()}` }],
    // Repris seulement s'il a été choisi : l'écrire d'office marquerait la
    // mission d'un choix que personne n'a fait (absent vaut « commune »).
    ...(existante?.facturation !== undefined ? { facturation: existante.facturation } : {})
  }));
  const [erreur, setErreur] = useState<string | null>(null);
  /* Le volume se tape « 12,5 » : la saisie garde le texte, le fait garde le
     nombre — sans quoi la virgule disparaîtrait à la frappe. */
  const [volume, setVolume] = useState(() => (saisie.joursCommandes == null ? '' : String(saisie.joursCommandes).replace('.', ',')));
  const facturation = modeDeFacturation(saisie);
  const contexte: ContexteDesGestes = {
    aujourdhui: dateDuJour(),
    conges: Object.fromEntries(faits.conges.map((c) => [c.date, c.quotite])),
    livre: faits.recettes,
    payeur: saisie.clientNom
  };

  function soumettre(evenement: React.FormEvent): void {
    evenement.preventDefault();
    const joursCommandes = volumeSaisi(volume);
    if (joursCommandes === undefined) {
      setErreur('Le volume commandé se compte en jours ou en demi-journées : 12, ou 12,5.');
      return;
    }
    // Le rythme se saisit avant que les dates soient forcément connues : on
    // remplace ici ses bornes provisoires par la plage réelle de la mission.
    const complete = {
      ...saisie,
      joursCommandes,
      // Une probabilité ne vaut que pour un prospect : signée ou perdue, la
      // mission n'a plus de chance d'aboutir à estimer.
      probabilite: saisie.statut === 'prospect' ? saisie.probabilite ?? null : null,
      entites: poserLesBornes(saisie.entites, saisie.debut, saisie.fin)
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

      {/* Les conditions de la MISSION l'emportent sur celles du client : une
          mission passée par une agence et une vente directe au même nom n'ont
          pas les mêmes. « Comme le client » reste le défaut. */}
      <ChoixDelai
        id={`${idChamp}-delai`}
        libelle="Conditions de paiement"
        valeur={saisie.delaiPaiement ?? null}
        avecHeritage
        onChange={(delaiPaiement) => setSaisie({ ...saisie, delaiPaiement })}
      />

      {/* Portée par la mission et reprise sur chaque facture (lot 46) : le bon
          de commande couvre toute la mission, et le ressaisir chaque mois finit
          par l'oublier une fois — la facture qui part alors en rejet. */}
      <Champ id={`${idChamp}-reference`} libelle="Référence de commande du client"
        aide="Son numéro de bon de commande, s’il en a émis un. Repris sur chaque facture de la mission.">
        <input id={`${idChamp}-reference`} value={saisie.referenceCommande ?? ''}
          onChange={(e) => setSaisie({ ...saisie, referenceCommande: e.target.value === '' ? null : e.target.value })} />
      </Champ>

      <CarnetDeLaMission
        id={idChamp}
        saisie={saisie}
        volume={volume}
        onVolume={setVolume}
        onChange={(champs) => setSaisie({ ...saisie, ...champs })}
      />

      <EditeurEntites
        entites={saisie.entites}
        enregistrees={existante?.entites ?? []}
        clientNom={saisie.clientNom}
        debut={saisie.debut}
        fin={saisie.fin}
        enCours={saisie.statut === 'active'}
        tjmMission={saisie.tjm}
        contexte={contexte}
        onChange={(entites) => setSaisie({ ...saisie, entites })}
      />

      {/* Le choix ne se pose qu'à partir de deux clients — et reste visible
          tant qu'il vaut « par client », pour qu'il puisse se défaire. */}
      {(saisie.entites.length > 1 || facturation === 'par_client') && (
        <ChoixFacturation
          mode={facturation}
          payeur={saisie.clientNom}
          carnet={faits.clients}
          clients={saisie.entites.map((e, i) => ({
            nom: nomDuClient(e, i, saisie.clientNom), rythmes: e.rythmes
          }))}
          onMode={(mode) => setSaisie({ ...saisie, facturation: mode })}
          onPayeur={(rang, facturerA) => setSaisie({
            ...saisie,
            entites: saisie.entites.map((e, i) => (i !== rang ? e : {
              ...e,
              // Un client sans plage n'aurait nulle part où porter son payeur :
              // la première plage se crée ici, comme la première semaine type.
              rythmes: (e.rythmes.length === 0 ? [PERIODE_VIDE] : e.rythmes)
                .map((r) => ({ ...r, facturerA }))
            }))
          })}
        />
      )}

      {erreur !== null && <p role="alert" className={styles.echec}>{erreur}</p>}

      <button type="submit" className={styles.actionPrincipale}>
        {id === null ? 'Ajouter la mission' : 'Enregistrer'}
      </button>

      {existante !== undefined && (
        <ConfirmationSurPlace
          libelle="Supprimer cette mission"
          classeDeclencheur={styles.supprimer}
          peutOuvrir={() => {
            const refus = peutSupprimerMission(existante, faits.missions, faits.recettes);
            setErreur(refus?.message ?? null);
            return refus === null;
          }}
          // Le rythme et les journées corrigées au planning vivent DANS la
          // mission : ils partent avec elle, et le planning comme les
          // projections de chiffre d'affaires perdent ses jours.
          consequence={(
            <>
              La mission {existante.description || 'sans description'}
              {existante.clientNom !== '' && <> pour {existante.clientNom}</>} quitte
              le carnet, avec son TJM, son rythme et les journées corrigées au
              planning&nbsp;: ses jours disparaissent du planning et des
              projections.
            </>
          )}
          libelleConfirmer="Supprimer la mission"
          onConfirmer={() => {
            const refus = supprimer(existante.id);
            if (refus !== null) { setErreur(refus); return; }
            signaler('Mission supprimée.');
            onFini();
          }}
        />
      )}
    </form>
  );
}

/**
 * Le volume saisi : `null` quand le champ est vide, `undefined` quand il ne se
 * compte pas en demi-journées — refusé plutôt qu'arrondi : « 12,3 jours »
 * arrondis en 12,5 feraient facturer une demi-journée que le bon ne porte pas.
 */
function volumeSaisi(texte: string): number | null | undefined {
  const propre = texte.trim().replace(',', '.');
  if (propre === '') return null;
  const n = Number(propre);
  return Number.isFinite(n) && n > 0 && Number.isInteger(n * 2) && n <= 2500 ? n : undefined;
}

/** Un nombre entier saisi, borné ; vide ou illisible : `null`. */
function entierSaisi(texte: string, min: number, max: number): number | null {
  if (texte.trim() === '') return null;
  const n = Math.round(Number(texte));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
}

/**
 * Le carnet de la mission (lot 48) : le volume commandé, le préavis de fin, la
 * reconduction tacite et, pour un prospect, sa probabilité.
 *
 * Quatre champs facultatifs : une mission sans aucun d'eux reste ce qu'elle
 * était, et c'est le cas courant d'une mission au temps passé. Chacun dit en
 * une ligne ce qu'il change à l'écran, parce qu'aucun ne se devine.
 */
function CarnetDeLaMission(
  { id, saisie, volume, onVolume, onChange }: {
    readonly id: string;
    readonly saisie: Omit<Mission, 'id'>;
    readonly volume: string;
    readonly onVolume: (v: string) => void;
    readonly onChange: (champs: Partial<Omit<Mission, 'id'>>) => void;
  }
) {
  const reconduite = saisie.reconduction != null;
  /* La période se tape comme le volume : un champ vidé pour taper « 3 » ne
     doit pas se remplir d'office d'un 1 qui ferait lire « 13 ». */
  const [periode, setPeriode] = useState(() => String(saisie.reconduction?.dureeMois ?? 12));
  return (
    <fieldset className={styles.groupe}>
      <legend className={styles.legendeGroupe}>Carnet de commandes</legend>

      <Champ id={`${id}-volume`} libelle="Jours commandés"
        aide="Le volume du bon de commande, demi-journées permises. Vide : la mission suit son planning.">
        <input id={`${id}-volume`} inputMode="decimal" placeholder="Pas de volume" value={volume}
          onChange={(e) => onVolume(e.target.value)} />
      </Champ>

      <Champ id={`${id}-preavis`} libelle="Préavis de fin (jours)"
        aide="Combien de jours avant la fin te l’annoncer. Vide : 60 jours, le temps de négocier une suite.">
        <input id={`${id}-preavis`} type="number" inputMode="numeric" min={0} max={366} placeholder="60"
          value={saisie.preavisFinJours ?? ''}
          onChange={(e) => onChange({ preavisFinJours: entierSaisi(e.target.value, 0, 366) })} />
      </Champ>

      <p className={styles.champ}>
        <label className={styles.caseACocher}>
          <input type="checkbox" checked={reconduite}
            onChange={(e) => onChange({ reconduction: e.target.checked ? { dureeMois: entierSaisi(periode, 1, 120) ?? 12 } : null })} />
          Reconduction tacite
        </label>
        <span className={styles.aide}>
          La fin devient l’échéance de la période en cours : la mission continue, sauf dénonciation.
        </span>
      </p>
      {reconduite && (
        <Champ id={`${id}-periode`} libelle="Par périodes de (mois)">
          <input id={`${id}-periode`} type="number" inputMode="numeric" min={1} max={120} value={periode}
            onChange={(e) => {
              setPeriode(e.target.value);
              const n = entierSaisi(e.target.value, 1, 120);
              if (n !== null) onChange({ reconduction: { dureeMois: n } });
            }} />
        </Champ>
      )}

      {saisie.statut === 'prospect' && (
        <Champ id={`${id}-probabilite`} libelle="Probabilité (%)"
          aide="Ton estimation, pour toi seul : un prospect n’entre jamais dans le carnet signé.">
          <input id={`${id}-probabilite`} type="number" inputMode="numeric" min={0} max={100}
            value={saisie.probabilite ?? ''}
            onChange={(e) => onChange({ probabilite: entierSaisi(e.target.value, 0, 100) })} />
        </Champ>
      )}
    </fieldset>
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
  { entites, enregistrees, clientNom, debut, fin, enCours, tjmMission, contexte, onChange }: {
    readonly entites: readonly ClientOperationnel[];
    /** Les clients tels qu'enregistrés avant cette saisie : eux seuls ont un passé. */
    readonly enregistrees: readonly ClientOperationnel[];
    readonly clientNom: string;
    /** Les bornes de la mission. Sans elles, le rythme n'a aucune plage où se poser. */
    readonly debut: DateISO | null;
    readonly fin: DateISO | null;
    /** La mission est en cours : ses clients non arrêtés le sont aussi. */
    readonly enCours: boolean;
    /** Le TJM de la mission, affiché comme valeur par défaut d'une période. */
    readonly tjmMission: number;
    readonly contexte: ContexteDesGestes;
    readonly onChange: (entites: readonly ClientOperationnel[]) => void;
  }
) {
  const plusieurs = entites.length > 1;
  const datees = debut !== null && fin !== null;
  const dejaLa = new Set(enregistrees.map((e) => e.id));
  // Les débuts posés d'office aux clients ajoutés pendant cette saisie : tant
  // qu'on n'y a pas touché, un arrêt les fait suivre (voir `arreter`).
  const [proposes, setProposes] = useState<Readonly<Record<string, DateISO | null>>>({});
  // L'état d'un client se lit sur les bornes réelles : une borne à poser
  // (« 0000-00-00 ») passerait pour une fin au premier jour de l'an zéro, et
  // le client pour arrêté avant d'avoir commencé.
  const bornees = datees ? poserLesBornes(entites, debut, fin) : entites;

  function modifier(i: number, champs: Partial<ClientOperationnel>): void {
    onChange(entites.map((e, j) => (j === i ? { ...e, ...champs } : e)));
  }

  /**
   * Un client ajouté à une mission qui a déjà travaillé commence au lendemain
   * de l'arrêt le plus récent, ou aujourd'hui — jamais au début de la mission :
   * ses jours recouvriraient ceux du client qu'il remplace, et le planning,
   * le CRA et la facture compteraient deux fois les mêmes semaines.
   */
  function ajouter(): void {
    const id = `co-${Date.now()}-${entites.length}`;
    const depart = datees && bornees.some((e) => dejaLa.has(e.id))
      ? dansLaMission(apresLeDernierArret(bornees) ?? contexte.aujourdhui, debut, fin)
      : null;
    setProposes({ ...proposes, [id]: depart });
    onChange([...entites, {
      ...entiteVide(),
      id,
      couleur: TEINTES[entites.length % TEINTES.length] as string,
      rythmes: depart === null ? [] : [{ ...PERIODE_VIDE, du: depart }]
    }]);
  }

  /**
   * L'arrêt écrit dans la saisie, et le client ajouté pour prendre la suite
   * le suit : « Arrêter » ne s'offre qu'à partir de deux clients, donc on
   * ajoute le remplaçant AVANT d'arrêter l'autre, et il serait parti
   * d'aujourd'hui — un trou si l'arrêt est passé, un doublon le jour même.
   * Seul un début que personne n'a retouché se déplace.
   */
  function arreter(i: number, arrete: ClientOperationnel, le: DateISO): void {
    const depart = dansLaMission(lendemain(le), debut, fin);
    const suivants = { ...proposes };
    onChange(entites.map((e, j) => {
      if (j === i) return { ...e, rythmes: arrete.rythmes, ajustements: arrete.ajustements };
      const propose = proposes[e.id];
      if (propose === undefined || !debutIntact(e, propose)) return e;
      suivants[e.id] = depart;
      return { ...e, rythmes: [{ ...(e.rythmes[0] ?? PERIODE_VIDE), du: depart ?? BORNE_A_POSER }] };
    }));
    setProposes(suivants);
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
          d’ordre, ajoutes-en un par client&nbsp;: chacun a son rythme, et
          chacun signera son propre CRA.
        </Info>
      </legend>

      {!datees && (
        <p className={styles.aide}>
          Renseigne le début et la fin de la mission&nbsp;: sans plage de
          dates, le rythme ne peut se poser sur aucune journée.
        </p>
      )}

      {entites.map((entite, i) => {
        const lisible = bornees[i] as ClientOperationnel;
        const arret = plusieurs && datees ? arretDuClient({ entites: bornees }, lisible) : null;
        const premier = premierJour(lisible);
        return (
          <div key={entite.id} className={styles.entite}>
            {plusieurs && (
              <>
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
                </div>
                <SituationDuClient
                  arret={arret}
                  depuis={arret === null && datees && premier !== null && premier > (debut as DateISO) ? premier : null}
                  rythmes={entite.rythmes}
                  enCours={enCours}
                />
                {/* Le dernier ne se retire pas : une mission sans client
                    opérationnel n'a plus de rythme, donc plus de planning. */}
                <GestesDuClient
                  entite={lisible}
                  nom={nomDuClient(entite, i, clientNom)}
                  enregistre={dejaLa.has(entite.id)}
                  peutArreter={datees && dejaLa.has(entite.id) && arret === null}
                  contexte={contexte}
                  onArreter={(arrete, le) => arreter(i, arrete, le)}
                  onRetirer={() => onChange(entites.filter((_, j) => j !== i))}
                />
              </>
            )}

            <EditeurRythmes
              rythmes={entite.rythmes}
              tjmMission={tjmMission}
              debut={debut}
              fin={fin}
              onChange={(rythmes) => modifier(i, { rythmes })}
            />
          </div>
        );
      })}

      <button type="button" className={styles.ajouterEntite} onClick={ajouter}>
        Ajouter un client opérationnel
      </button>
    </fieldset>
  );
}

/** Le premier jour d'une plage posée, ou `null`. */
function premierJour(e: ClientOperationnel): DateISO | null {
  const dates = e.rythmes.map((r) => r.du).filter((d) => d !== BORNE_A_POSER);
  return dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b));
}

/** Le lendemain de l'arrêt le plus récent parmi les clients de la mission, ou `null`. */
function apresLeDernierArret(entites: readonly ClientOperationnel[]): DateISO | null {
  const arrets = entites
    .map((e) => arretDuClient({ entites }, e))
    .filter((d): d is DateISO => d !== null);
  return arrets.length === 0 ? null : lendemain(arrets.reduce((a, b) => (a > b ? a : b)));
}

/**
 * Un début proposé, ramené dans la mission — `null` pour « son début ».
 *
 * Avant le début, un client poserait des journées hors contrat ; après la fin,
 * il n'en aurait aucune, et sa période ne se découperait même pas pour qu'on
 * la corrige. Dans les deux cas, il part du début de la mission.
 */
function dansLaMission(jour: DateISO, debut: DateISO | null, fin: DateISO | null): DateISO | null {
  if (debut === null || jour <= debut) return null;
  if (fin !== null && jour > fin) return null;
  return jour;
}

/** Le client n'a qu'une période, qui part encore du début qu'on lui a proposé. */
function debutIntact(e: ClientOperationnel, propose: DateISO | null): boolean {
  if (e.rythmes.length === 0) return propose === null;
  return e.rythmes.length === 1 && e.rythmes[0]?.du === (propose ?? BORNE_A_POSER);
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
          Un mois par ligne&nbsp;: modifie ceux qui changent, laisse les autres.
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

function parMois(modele: Rythme, debutMission: DateISO, finMission: DateISO): readonly Rythme[] {
  // La plage garde ses propres bornes quand elle en a. Celle d'un client
  // arrêté le 13 mars, découpée sur la mission entière, le remettait au
  // travail jusqu'à la fin — l'arrêt défait d'un clic, sans un mot ; celle
  // d'un client arrivé le 14 recouvrait le client qu'il remplace.
  const debut = modele.du !== BORNE_A_POSER && modele.du > debutMission ? modele.du : debutMission;
  const fin = modele.au !== BORNE_A_POSER && modele.au < finMission ? modele.au : finMission;
  const mois: Rythme[] = [];
  let curseur = premierDuMois(debut);

  while (curseur <= fin && mois.length < MOIS_MAXIMUM_DECOUPES) {
    const finDuMois = dernierDuMois(curseur);
    mois.push({
      du: curseur < debut ? debut : curseur,
      au: finDuMois > fin ? fin : finDuMois,
      parJour: modele.parJour,
      tjm: modele.tjm,
      // Découper au mois ne change pas qui paie : oublier le payeur ici
      // renverrait en silence chaque mois au payeur de la mission.
      ...(modele.facturerA !== undefined ? { facturerA: modele.facturerA } : {})
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


/**
 * La liste des conditions de paiement.
 *
 * Une liste et non une saisie libre en jours : les conditions réelles sont un
 * petit ensemble de formules nommées, que les deux parties écrivent telles
 * quelles sur le contrat. Et surtout, un nombre de jours **ne peut pas**
 * exprimer « fin de mois », qui est le cas courant — une facture du 12 juin à
 * « 30 jours fin de mois » n'est pas due le 12 juillet mais le 31.
 *
 * Le dépassement des bornes légales est DIT, jamais bloqué : il arrive de
 * signer ce qu'on n'a pas choisi, et interdire de saisir ses conditions
 * réelles obligerait à mentir sur ses propres factures.
 */
function ChoixDelai<T extends FormuleDelai | null>(
  { id, libelle, valeur, avecHeritage, onChange }: {
    readonly id: string;
    readonly libelle: string;
    readonly valeur: T;
    /** Ajoute « comme le client », qui vaut `null`. Pour une mission. */
    readonly avecHeritage?: boolean;
    readonly onChange: (v: T) => void;
  }
) {
  const alerte = valeur === null ? null : depassementLegal(valeur);
  return (
    <Champ id={id} libelle={libelle}>
      <select
        id={id}
        value={valeur ?? ''}
        onChange={(e) => onChange((e.target.value === '' ? null : e.target.value) as T)}
      >
        {avecHeritage === true && <option value="">Comme le client</option>}
        {FORMULES_DELAI.map((f) => (
          <option key={f} value={f}>{libelleDelai(f)}</option>
        ))}
      </select>
      {alerte !== null && <span className={styles.aide} role="status">{alerte}</span>}
    </Champ>
  );
}
