import { useEffect, useId, useRef, useState } from 'react';
import type { DateISO } from '../../domain/types';
import {
  type BilanDeLArret, type FactureDuLivre, type FactureTouchee,
  arreterClient, bilanDuRetrait, facturesTouchees, finDuClient, joursPerdusApres
} from '../../domain/calculs/clientsOperationnels';
import { type ModeDeFacturation, payeurDeLaPlage } from '../../domain/calculs/brouillon';
import { joursFeries } from '../../domain/calculs/calendrier';
import {
  JOURS_SEMAINE, type JourDeSemaine, type Quotite, type Rythme
} from '../../domain/calculs/planning';
import type { ClientOperationnel } from '../../state/schema';
import { BlocConfirmation } from '../components/ConfirmationSurPlace';
import { Statut } from '../components/Statut';
import { formaterJours } from '../format';
import { enumeration, jourEtMois, lendemain } from './Activite.clientsMission.lecture';
import communs from './Activite.module.css';
import styles from './Activite.clientsMission.module.css';

/**
 * Une mission à plusieurs clients (lot 31) : arrêter l'un, retirer l'autre,
 * choisir qui reçoit la facture. Maquette validée :
 * `docs/design/direction/mission-clients.html`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE GESTE ÉCRIT DANS LE FORMULAIRE, PAS DANS LE MAGASIN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Arrêter un client change ses plages et ses corrections, qui vivent dans la
 * saisie en cours. Écrire l'arrêt au magasin pendant que le formulaire reste
 * ouvert : « Enregistrer » réécrirait par-dessus la saisie d'avant, et l'arrêt
 * disparaîtrait sans un mot. Tout passe donc par l'état du formulaire, et c'est
 * « Enregistrer » qui persiste — comme pour le reste de la mission.
 *
 * Ce module arrive avec le formulaire, à l'ouverture du panneau : consulter son
 * planning n'a pas à télécharger la confirmation d'un arrêt.
 */

/** Ce que les gestes lisent hors du client : le jour, les congés, le livre, le payeur. */
export interface ContexteDesGestes {
  readonly aujourdhui: DateISO;
  readonly conges: Readonly<Record<string, Quotite>>;
  readonly livre: readonly FactureDuLivre[];
  /** Le payeur de la mission, celui de la facture commune. */
  readonly payeur: string;
}

/**
 * La ligne sous le nom : « arrêté le 13 mars · lun., mar., mer. », ou « depuis
 * le 14 mars » pour un client arrivé en route, et sa pastille.
 *
 * Le mot porte l'état, la pastille le répète pour l'œil qui parcourt : un
 * client arrêté qui ne se distinguerait que par une teinte serait relu comme
 * en cours sur un écran en plein jour.
 */
export function SituationDuClient(
  { arret, depuis, rythmes, enCours }: {
    readonly arret: DateISO | null;
    /** Son premier jour, quand il est postérieur au début de la mission. */
    readonly depuis: DateISO | null;
    readonly rythmes: readonly Rythme[];
    /** La mission est en cours : un client non arrêté l'est aussi. */
    readonly enCours: boolean;
  }
) {
  const quand = arret !== null ? `arrêté le ${jourEtMois(arret)}`
    : depuis !== null ? `depuis le ${jourEtMois(depuis)}` : '';
  const ligne = [quand, semaineDe(rythmes)].filter((t) => t !== '').join(' · ');
  const pastille = arret !== null ? <Statut libelle="Arrêté" ton="neutre" />
    : enCours ? <Statut libelle="En cours" ton="ok" /> : null;
  if (ligne === '' && pastille === null) return null;
  return (
    <p className={styles.situation}>
      <span className={styles.situationTexte}>{ligne}</span>
      {pastille}
    </p>
  );
}

const ABREGES: Readonly<Record<JourDeSemaine, string>> = {
  lun: 'lun.', mar: 'mar.', mer: 'mer.', jeu: 'jeu.', ven: 'ven.', sam: 'sam.', dim: 'dim.'
};

/** La semaine type de sa plage la plus récente : « lun., mar., mer. ½ ». */
function semaineDe(rythmes: readonly Rythme[]): string {
  let derniere: Rythme | undefined;
  for (const r of rythmes) {
    if (!Object.values(r.parJour).some((q) => (q ?? 0) > 0)) continue;
    if (derniere === undefined || r.du >= derniere.du) derniere = r;
  }
  if (derniere === undefined) return '';
  const semaine = derniere.parJour;
  return JOURS_SEMAINE.flatMap((j) => {
    const q = semaine[j] ?? 0;
    if (q <= 0) return [];
    return [q < 1 ? `${ABREGES[j]} ½` : ABREGES[j]];
  }).join(', ');
}

/**
 * « Arrêter ce client le… » et « Retirer », sous un client de la mission.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RETIRER EFFACE LE PASSÉ ; ARRÊTER LE GARDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les deux gestes se ressemblent à l'écran et pas dans les comptes. Retirer un
 * client qui a travaillé emporte ses journées faites — celles qu'un compte
 * rendu a peut-être portées, qu'une facture a peut-être comptées. C'est
 * presque toujours un arrêt qu'on voulait : la confirmation le dit en
 * chiffres, et propose l'arrêt d'abord. Un client ajouté pendant la saisie, ou
 * qui n'a encore rien fait, n'a pas de passé : il se retire sans rien demander.
 */
export function GestesDuClient(
  { entite, nom, enregistre, peutArreter, contexte, onArreter, onRetirer }: {
    /** Le client tel que la saisie le porte, bornes posées. */
    readonly entite: ClientOperationnel;
    readonly nom: string;
    /** Il existait avant cette saisie : il peut avoir un passé. */
    readonly enregistre: boolean;
    readonly peutArreter: boolean;
    readonly contexte: ContexteDesGestes;
    readonly onArreter: (arrete: ClientOperationnel, le: DateISO) => void;
    readonly onRetirer: () => void;
  }
) {
  const [geste, setGeste] = useState<'aucun' | 'arreter' | 'retirer'>('aucun');
  const boutonArreter = useRef<HTMLButtonElement | null>(null);
  const boutonRetirer = useRef<HTMLButtonElement | null>(null);
  // Le focus revient au bouton d'origine ; après un arrêt, « Arrêter » a
  // disparu avec lui, et c'est « Retirer » qui le reçoit plutôt que le vide.
  const rendreA = useRef<'arreter' | 'retirer' | null>(null);

  useEffect(() => {
    if (geste !== 'aucun' || rendreA.current === null) return;
    const cible = rendreA.current === 'arreter'
      ? boutonArreter.current ?? boutonRetirer.current
      : boutonRetirer.current;
    rendreA.current = null;
    cible?.focus();
  }, [geste]);

  function fermer(depuis: 'arreter' | 'retirer'): void {
    rendreA.current = depuis;
    setGeste('aucun');
  }

  function demanderRetrait(): void {
    if (!enregistre) { onRetirer(); return; }
    const bilan = bilanDuRetrait(entite, contexte.aujourdhui, feriesDu(entite, contexte.aujourdhui), contexte.conges);
    if (bilan.joursPasses <= 0 && bilan.corrections === 0) { onRetirer(); return; }
    setGeste('retirer');
  }

  if (geste === 'arreter') {
    return (
      <PanneauArret
        entite={entite}
        nom={nom}
        contexte={contexte}
        onArreter={(arrete, le) => { onArreter(arrete, le); fermer('arreter'); }}
        onFermer={() => fermer('arreter')}
      />
    );
  }

  if (geste === 'retirer') {
    const bilan = bilanDuRetrait(entite, contexte.aujourdhui, feriesDu(entite, contexte.aujourdhui), contexte.conges);
    const aLaPlace = arreterClient(entite, contexte.aujourdhui);
    return (
      <BlocConfirmation
        // Ambre quand l'arrêt passe devant ; seul, « Retirer quand même » est
        // le geste qui efface, et le bouton plein vert le donnait pour conseillé.
        ton={'entite' in aLaPlace ? 'prudence' : 'danger'}
        consequence={<><strong>Retirer {nom}</strong> efface aussi son passé&nbsp;: {passeDuRetrait(bilan.joursPasses, bilan.corrections)}</>}
        // Un client déjà arrêté avant aujourd'hui n'a plus rien à arrêter :
        // lui proposer l'arrêt serait un bouton qui ne fait rien.
        {...('entite' in aLaPlace ? {
          aLaPlace: {
            libelle: `L’arrêter le ${jourEtMois(contexte.aujourdhui)} à la place`,
            onChoisir: () => { onArreter(aLaPlace.entite, contexte.aujourdhui); fermer('retirer'); }
          }
        } : {})}
        libelleConfirmer="Retirer quand même"
        onConfirmer={onRetirer}
        onGarder={() => fermer('retirer')}
      />
    );
  }

  return (
    <div className={styles.actions}>
      {peutArreter && (
        <button ref={boutonArreter} type="button" className={styles.geste} onClick={() => setGeste('arreter')}>
          {/* L'espace HORS de la portée masquée : le calcul du nom accessible
              rogne celle qui ouvre un élément. */}
          Arrêter ce client le…{' '}<span className={styles.horsEcran}>— {nom}</span>
        </button>
      )}
      <button ref={boutonRetirer} type="button" className={communs.retirer} onClick={demanderRetrait}>
        Retirer{' '}<span className={styles.horsEcran}>— {nom}</span>
      </button>
    </div>
  );
}

/**
 * Le jour, puis ce que l'arrêt change, chiffré avant d'être écrit.
 *
 * La date proposée est aujourd'hui ; une date passée reste permise — on
 * apprend souvent l'arrêt après coup —, avec ce qui a déjà été facturé. Les
 * chiffres viennent de `arreterClient` et `joursPerdusApres`, ceux-là mêmes qui
 * rempliront le planning, le compte rendu et le brouillon : un chiffre annoncé
 * autrement serait démenti par l'écran suivant.
 */
function PanneauArret(
  { entite, nom, contexte, onArreter, onFermer }: {
    readonly entite: ClientOperationnel;
    readonly nom: string;
    readonly contexte: ContexteDesGestes;
    readonly onArreter: (arrete: ClientOperationnel, le: DateISO) => void;
    readonly onFermer: () => void;
  }
) {
  const [saisie, setSaisie] = useState<string>(contexte.aujourdhui);
  const champ = useRef<HTMLInputElement | null>(null);
  const id = useId();

  // Le bouton cliqué a laissé la place au champ : le focus le suit, plutôt que
  // de retomber en haut du panneau.
  useEffect(() => { champ.current?.focus(); }, []);

  const le = /^\d{4}-\d{2}-\d{2}$/.test(saisie) ? saisie as DateISO : null;
  const resultat = le === null ? null : arreterClient(entite, le);

  return (
    <div
      className={styles.arret}
      role="group"
      aria-label={`Arrêter ${nom}`}
      onKeyDown={(e) => {
        // Échap renonce à l'arrêt, pas au panneau de la mission avec sa saisie.
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        onFermer();
      }}
    >
      <p className={communs.champ}>
        <label htmlFor={`${id}-le`}>Arrêter ce client le</label>
        <input
          ref={champ}
          id={`${id}-le`}
          type="date"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
        />
      </p>

      {le !== null && resultat !== null && 'entite' in resultat ? (
        <BlocConfirmation
          ton="prudence"
          // Le champ garde la main : changer la date recalcule la conséquence,
          // et la confirmation qui reparaît ne doit pas lui voler le focus.
          prendreLeFocus={false}
          consequence={consequenceDeLArret(nom, le, resultat.bilan, entite, contexte)}
          {...complementDesFactures(entite, le, contexte)}
          libelleConfirmer={`Arrêter le ${jourEtMois(le)}`}
          onConfirmer={() => onArreter(resultat.entite, le)}
          onGarder={onFermer}
        />
      ) : (
        <>
          {/* Le refus du calcul, tel quel : il dit déjà quel geste prendre. */}
          {resultat !== null && 'refus' in resultat && (
            <p role="alert" className={communs.echec}>{resultat.refus}</p>
          )}
          <button type="button" className={styles.geste} onClick={onFermer}>Garder</button>
        </>
      )}

      <p className={communs.aide}>
        La mission continue avec ses autres clients. L’arrêt se défait en
        rallongeant les dates du client.
      </p>
    </div>
  );
}

function consequenceDeLArret(
  nom: string, le: DateISO, bilan: BilanDeLArret, entite: ClientOperationnel, contexte: ContexteDesGestes
): React.ReactNode {
  const finConnue = finDuClient(entite);
  const perdus = finConnue === null || finConnue <= le ? 0
    : joursPerdusApres(entite, le, finConnue, feriesDu(entite, le), contexte.conges);
  const clauses: string[] = [];
  const corrigees = bilan.correctionsRetirees;
  if (corrigees > 0) {
    clauses.push(corrigees >= 2
      ? `${corrigees} journées corrigées seront retirées`
      : '1 journée corrigée sera retirée');
  }
  if (perdus > 0 && finConnue !== null) {
    clauses.push(perdus >= 2
      ? `${formaterJours(perdus)} jours prévus jusqu’au ${jourEtMois(finConnue)} ne compteront plus`
      : `${formaterJours(perdus)} jour prévu jusqu’au ${jourEtMois(finConnue)} ne comptera plus`);
  }
  return (
    <>
      <strong>À partir du {jourEtMois(lendemain(le))}</strong>, {nom} ne compte plus aucun jour
      {clauses.length === 0
        ? '.'
        : <>&nbsp;: {clauses.join(', et ')} — au planning, au compte rendu et au brouillon du mois.</>}
    </>
  );
}

/**
 * Les factures déjà parties sur un mois que l'arrêt touche, nommées par leur
 * numéro : c'est lui qu'on cherchera pour émettre l'avoir.
 */
function complementDesFactures(
  entite: ClientOperationnel, le: DateISO, contexte: ContexteDesGestes
): { readonly complement?: string } {
  const finConnue = finDuClient(entite);
  if (finConnue === null) return {};
  const factures = facturesTouchees(contexte.livre, payeursApres(entite, le, contexte), le, finConnue);
  if (factures.length === 0) return {};
  return { complement: phraseDesFactures(factures, le) };
}

function phraseDesFactures(factures: readonly FactureTouchee[], le: DateISO): string {
  const mois = [...new Set(factures.map((f) => nomDuMois(f.mois)))];
  const numeros = factures.map((f) => f.numero).join(', ');
  // « après le 13 » quand la facture est celle du mois de l'arrêt ; une facture
  // de juin dirait « après le 13 » sans qu'on sache de quel mois.
  const apres = factures.every((f) => f.mois === le.slice(0, 7))
    ? jourEtMois(le).split(' ')[0] as string
    : jourEtMois(le);
  return factures.length === 1
    ? `Une facture déjà émise couvre ${mois[0] as string} (${numeros}) : elle ne change pas. `
      + `Si elle compte des jours après le ${apres}, un avoir la corrige.`
    : `Des factures déjà émises couvrent ${enumeration(mois)} (${numeros}) : elles ne changent pas. `
      + `Si elles comptent des jours après le ${apres}, un avoir les corrige.`;
}

const nomDuMois = (m: string): string => new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' })
  .format(new Date(`${m}-01T00:00:00Z`));

/**
 * Qui a pu recevoir une facture portant ses jours d'après l'arrêt : le payeur
 * de la mission, et celui de chaque plage qui court au-delà.
 *
 * Les deux, quel que soit le mode : les factures parties l'ont été sous le
 * mode d'alors, pas sous celui qu'on est peut-être en train de choisir. Passer
 * à « une par client » avant d'arrêter taisait la facture commune de mai, qui
 * porte pourtant les jours retirés.
 */
function payeursApres(entite: ClientOperationnel, le: DateISO, contexte: ContexteDesGestes): ReadonlySet<string> {
  const mission = { clientNom: contexte.payeur.trim(), facturation: 'par_client' as const };
  return new Set([
    mission.clientNom,
    ...entite.rythmes.filter((r) => r.au > le).map((r) => payeurDeLaPlage(r, mission).trim())
  ]);
}

/** « ses 42 jours, dont 3 corrigés, quittent… », accordé à ce qu'il y a. */
function passeDuRetrait(jours: Quotite, corrections: number): string {
  const corriges = corrections >= 2 ? `${corrections} corrigés` : '1 corrigé';
  const journeesCorrigees = corrections >= 2 ? `ses ${corrections} journées corrigées` : 'sa journée corrigée';
  const suite = 'le planning, les comptes rendus et les factures à venir.';
  if (jours <= 0) return `${journeesCorrigees} ${corrections >= 2 ? 'quittent' : 'quitte'} ${suite}`;
  const sujet = jours >= 2 ? `ses ${formaterJours(jours)} jours` : `son ${formaterJours(jours)} jour`;
  if (corrections === 0) return `${sujet} ${jours >= 2 ? 'quittent' : 'quitte'} ${suite}`;
  // Les corrections se comptent toutes dates confondues : plus nombreuses que
  // les jours faits, « dont » mentirait.
  if (corrections <= jours) return `${sujet}, dont ${corriges}, ${jours >= 2 ? 'quittent' : 'quitte'} ${suite}`;
  return `${sujet} et ${journeesCorrigees} quittent ${suite}`;
}

/**
 * Les fériés des années que le client traverse, et de celle du jour dit.
 *
 * Le décompte passe par `planifier`, qui retire les fériés : sans eux, l'arrêt
 * annoncerait le lundi de Pentecôte comme un jour perdu, et le planning, qui le
 * sait férié, le démentirait.
 */
function feriesDu(entite: ClientOperationnel, jour: DateISO): ReadonlySet<string> {
  const annees = [
    jour, ...entite.rythmes.flatMap((r) => [r.du, r.au]), ...Object.keys(entite.ajustements)
  ].filter((d) => /^\d{4}-/.test(d) && !d.startsWith('0000')).map((d) => Number(d.slice(0, 4)));
  const premiere = Math.min(...annees);
  // Une borne aberrante ne doit pas faire calculer mille ans de calendrier.
  const derniere = Math.min(Math.max(...annees), premiere + 20);
  const feries = new Set<string>();
  for (let a = premiere; a <= derniere; a += 1) for (const f of joursFeries(a)) feries.add(f);
  return feries;
}

/**
 * « Une facture commune » ou « Une par client » (décision 14), et, par client,
 * qui reçoit la facture.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE LISTE FERMÉE, PAS UN NOM LIBRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le payeur est le nom d'un client du carnet : c'est lui qui rattache les
 * recettes, et une facture doit pouvoir être rééditée avec ses coordonnées. Un
 * nom tapé à la main, à une lettre près, produirait un brouillon sans adresse —
 * et un client fantôme au livre. Le payeur de la mission s'écrit `null` : le
 * renommer au carnet suffit alors à le suivre.
 *
 * Le choix s'écrit sur TOUTES les plages du client. Celles qui portaient déjà
 * des payeurs différents le disent avant qu'on les unifie.
 */
export function ChoixFacturation(
  { mode, payeur, carnet, clients, onMode, onPayeur }: {
    readonly mode: ModeDeFacturation;
    readonly payeur: string;
    readonly carnet: readonly { readonly nom: string }[];
    /** Les clients de la mission, sous le nom qu'on leur montre. */
    readonly clients: readonly { readonly nom: string; readonly rythmes: readonly Rythme[] }[];
    readonly onMode: (mode: ModeDeFacturation) => void;
    readonly onPayeur: (rang: number, payeur: string | null) => void;
  }
) {
  const id = useId();
  const nomPayeur = payeur.trim();
  return (
    <fieldset className={communs.groupe}>
      <legend className={communs.legendeGroupe}>Facturation</legend>
      <div className={styles.choix} role="group" aria-label="Facturation de la mission">
        {(['commune', 'par_client'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            className={mode === m ? `${styles.option} ${styles.optionActive}` : styles.option}
            onClick={() => onMode(m)}
          >
            {m === 'commune' ? 'Une facture commune' : 'Une par client'}
          </button>
        ))}
      </div>
      <p className={communs.aide}>
        Par défaut, une facture commune au payeur de la mission, avec une ligne
        par client. «&nbsp;Une par client&nbsp;» découpe le mois selon les dates
        de chaque client{mode === 'par_client' ? ' :' : '.'}
      </p>
      {mode === 'par_client' && (
        <>
          {clients.map((c, rang) => {
            const valeur = payeurDesPlages(c.rythmes, nomPayeur);
            return (
              <p key={rang} className={communs.champ}>
                <label htmlFor={`${id}-${rang}`}>{c.nom} — facturée à</label>
                <select
                  id={`${id}-${rang}`}
                  value={valeur}
                  onChange={(e) => onPayeur(rang, e.target.value === '' ? null : e.target.value)}
                >
                  {valeur === PLUSIEURS && (
                    <option value={PLUSIEURS} disabled>Plusieurs, selon la période</option>
                  )}
                  <option value="">{nomPayeur !== '' ? nomPayeur : 'Le payeur de la mission'}</option>
                  {carnet.filter((k) => k.nom !== nomPayeur).map((k) => (
                    <option key={k.nom} value={k.nom}>{k.nom}</option>
                  ))}
                  {/* Un payeur sorti du carnet depuis : le taire ferait
                      afficher un autre nom que celui qui recevra la facture. */}
                  {valeur !== '' && valeur !== PLUSIEURS && !carnet.some((k) => k.nom === valeur) && (
                    <option value={valeur}>{valeur} (absent du carnet)</option>
                  )}
                </select>
                {valeur === PLUSIEURS && (
                  <span className={communs.aide}>
                    Ses périodes n’ont pas le même payeur&nbsp;: en choisir un l’applique à toutes.
                  </span>
                )}
              </p>
            );
          })}
          <p className={communs.aide}>
            Le choix se fait parmi les clients du carnet&nbsp;: une facture doit
            pouvoir être rééditée.
          </p>
        </>
      )}
    </fieldset>
  );
}

const PLUSIEURS = '__plusieurs__';

/**
 * Le payeur commun à toutes les plages : `''` pour celui de la mission.
 *
 * Lu par `payeurDeLaPlage`, en mode « par client » — le seul où la liste
 * s'affiche —, plutôt qu'à même le champ : une seconde lecture finirait par
 * ne plus dire le même payeur que le brouillon.
 */
function payeurDesPlages(rythmes: readonly Rythme[], payeur: string): string {
  const mission = { clientNom: payeur, facturation: 'par_client' as const };
  const valeurs = new Set(rythmes.map((r) => {
    const nom = payeurDeLaPlage(r, mission).trim();
    return nom === payeur ? '' : nom;
  }));
  if (valeurs.size === 0) return '';
  if (valeurs.size === 1) return [...valeurs][0] as string;
  return PLUSIEURS;
}
