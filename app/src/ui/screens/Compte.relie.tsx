import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFaits } from '../../state/store';
import {
  type ConfigSupabase, type DonneesLegacy, type InstantaneDistant, type ResultatEffacement,
  type Session, type StockageLocal, bundleDepuisLegacy, chargerDonneesLegacy,
  effacerDonneesLegacy, effacerFaitsDuCompte, ecrireSession, pousserFaits, seDeconnecter, tirerFaits
} from '../../infra/supabase';
import { VERSION_SCHEMA, type Faits } from '../../state/schema';
import { motifRefusExterieur } from '../../state/schema.exterieur';
/**
 * `completerFaits` est importé STATIQUEMENT ici, contrairement à
 * `state/store.ts` : cet écran est déjà chargé à la demande (voir `Compte.tsx`,
 * lui-même chargé par `Config`), donc le module de migrations n'alourdit aucun
 * paquet de premier rendu en passant par lui. Le charger dynamiquement de
 * surcroît n'aurait rien économisé, et aurait coûté un aller-retour réseau à
 * chacun de ses usages.
 */
import { completerFaits } from '../../state/schema.migrations';
import { type EtatSynchro, etatDeSynchronisation } from '../../state/selecteurs.synchro';
import { memesFaits, schemaDuCompte } from '../../state/synchro.regle';
import { ecrireBase, lireBase, noterSynchronisation } from '../../infra/synchro.appareil';
import { type EtatSynchroAppareil, publierEtatSynchro } from '../../infra/synchro.etat';
import { type MoteurSynchro, moteurPour } from '../../infra/synchro.moteur';
import { useEtatSynchro } from '../synchro.affichage';
import { AChoisir, PhraseAutomatique } from './Compte.synchro';
import type { RapportMigration } from '../../infra/migration';
import { convertirBundle } from '../../infra/migration.legacy';
import { estLeJeuDeDemonstration } from '../../domain/calculs/demonstration';
import { Info } from '../components/Info';
import { Statut, type TonStatut } from '../components/Statut';
import { ConfirmationSurPlace } from '../components/ConfirmationSurPlace';
import { dateCourte } from '../format';
import { EtatsPrecedents } from './Compte.historique';
import { PanneauEffacerAppareil } from './EffacerAppareil';
import { quandFr } from './Compte.sante';
import styles from './Compte.module.css';

/**
 * Le compte relié et connecté — « Sauvegardé », la santé du projet, les gestes
 * rares (maquette `direction/compte.html`, état 5).
 *
 * Chargé à la demande, une fois la session ouverte : l'accueil et le guide
 * n'ont pas à porter les envois, les conflits et la reprise de l'ancienne
 * application.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ON MONTRE AVANT DE REMPLACER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Récupérer les données du compte ÉCRASE l'état local. C'est ce qu'on veut
 * — c'est le sens d'un compte partagé entre appareils — mais le faire en
 * silence ferait disparaître une saisie faite hors ligne sans que personne le
 * voie. L'écran affiche donc d'abord ce qui serait chargé, et attend une
 * confirmation. « Synchroniser maintenant » n'y fait pas exception : il passe
 * par les mêmes gestes, avec les mêmes confirmations.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX TABLES, ET UNE SEULE REÇOIT DES ÉCRITURES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La table de l'ancienne application est LUE, jamais modifiée : c'est la
 * condition pour que l'ancienne version reste utilisable pendant toute la
 * cohabitation, et pour qu'un essai de la nouvelle ne puisse pas abîmer des
 * données comptables. Les faits de cette version-ci vont dans une table
 * distincte, la seule où l'écran écrive.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUCUN ENVOI À L'AVEUGLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chaque envoi porte la version qu'on a lue. Si le compte a bougé depuis, le
 * serveur refuse, et l'écran présente les deux états côte à côte : c'est à
 * l'utilisateur de trancher, en sachant ce qu'il perd de chaque côté. Tant
 * que l'état du compte n'est pas connu, l'envoi reste indisponible — envoyer
 * sans savoir sur quoi on écrit est précisément ce qu'il faut empêcher.
 */

/**
 * Ce qu'on sait de la ligne du compte.
 *
 * `'inconnu'` n'est pas `null` : l'un dit « le compte est vide », l'autre
 * « on n'a pas réussi à regarder ». Les confondre autoriserait un premier
 * envoi qui écraserait en fait des données existantes.
 */
type EtatDistant = InstantaneDistant | null | 'inconnu';

type Etat =
  | { readonly phase: 'connecte' }
  | { readonly phase: 'apercu-legacy'; readonly donnees: DonneesLegacy; readonly rapport: RapportMigration }
  | { readonly phase: 'apercu-distant'; readonly instantane: InstantaneDistant; readonly faits: Faits }
  | { readonly phase: 'conflit'; readonly distant: InstantaneDistant | null }
  | {
    readonly phase: 'confirmer-envoi';
    readonly distant: InstantaneDistant;
    /**
     * Pourquoi on demande confirmation.
     *
     * Les deux dangers écrasent le compte, et ils ne se racontent pas de la
     * même façon : « cet appareil est vide » n'explique rien à qui vient de
     * charger la démonstration et voit un écran plein de factures.
     */
    readonly motif: MotifDeConfirmation;
  };

/** Ce qui, sur cet appareil, ne doit pas partir sur le compte sans un mot. */
type MotifDeConfirmation = 'appareil-vide' | 'jeu-de-demonstration';

interface Resume {
  readonly clients: number;
  readonly missions: number;
  readonly recettes: number;
  readonly depenses: number;
}

function resumer(faits: Faits): Resume {
  return {
    clients: faits.clients.length,
    missions: faits.missions.length,
    recettes: faits.recettes.length,
    depenses: faits.depenses.length
  };
}

/** Rien du tout : ni client, ni mission, ni recette, ni dépense. */
function estVide(r: Resume): boolean {
  return r.clients === 0 && r.missions === 0 && r.recettes === 0 && r.depenses === 0;
}

/**
 * Ce qui, sur cet appareil, ne doit pas partir sur le compte sans un mot —
 * ou `null` quand l'envoi est ordinaire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX DANGERS, ET LE SECOND MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le premier est l'appareil VIDE : on installe l'application quelque part, elle
 * n'a rien, et « enregistrer sur le compte » est le bouton qui semble le plus
 * utile — il effacerait tout.
 *
 * Le second est le jeu de DÉMONSTRATION, et il n'était pas couvert : un
 * appareil rempli de factures fictives n'est pas vide, donc l'envoi partait
 * sans rien demander. Charger la démonstration pour regarder puis enregistrer
 * sur le compte écrasait des données réelles, en silence.
 *
 * L'ordre compte : le vide est vérifié d'abord parce qu'un dossier vide n'a
 * pas d'entreprise à reconnaître.
 */
function motifDeConfirmation(faits: Faits): MotifDeConfirmation | null {
  if (estVide(resumer(faits))) return 'appareil-vide';
  return estLeJeuDeDemonstration(faits.entreprise) ? 'jeu-de-demonstration' : null;
}

function resumeCourt(r: Resume): string {
  return estVide(r)
    ? 'rien pour l’instant'
    : `${r.recettes} recette(s), ${r.depenses} dépense(s), ${r.clients} client(s)`;
}

/**
 * Le résumé du bloc distant, quand il est lisible.
 *
 * `null` couvre deux cas qu'il ne faut surtout pas afficher comme « vide » :
 * le bloc est illisible, ou il vient d'une version qu'on ne sait pas lire.
 */
function resumeDistant(instantane: InstantaneDistant): Resume | null {
  return motifRefusExterieur(instantane.faits) === null
    ? resumer(completerFaits(instantane.faits))
    : null;
}

/**
 * Motif qui interdit d'envoyer cet appareil sur le compte, ou `null`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA LECTURE REFUSAIT UN SCHÉMA PLUS RÉCENT, L'ÉCRITURE NON
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un appareil resté sur une ancienne version lisait un compte écrit par une
 * plus récente : le résumé distant était illisible, la confirmation ne se
 * déclenchait que pour un appareil vide ou en démonstration — et l'envoi
 * partait. Le serveur l'acceptait, puisque le compteur de version était le
 * bon, et le bloc récent était remplacé par ce qu'en voyait l'ancien.
 * Exactement ce que l'invariant n°5 interdit en lecture.
 *
 * Seul le schéma POSTÉRIEUR bloque. Un compte illisible pour une autre raison
 * — abîmé — reste remplaçable, avec la mention « contenu illisible » : le
 * bloquer aussi laisserait l'utilisateur sans aucun moyen de le réparer.
 */
function motifRefusEnvoi(distant: InstantaneDistant | null): string | null {
  if (distant === null) return null;
  // La même lecture que la synchronisation automatique : deux calculs du
  // schéma d'un compte finiraient par ne pas dire la même chose.
  const schema = schemaDuCompte(distant);
  if (schema <= VERSION_SCHEMA) return null;
  return `Le compte a été enregistré par une version plus récente de l’application `
    + `(schéma ${schema}, connu ici : ${VERSION_SCHEMA}). L’envoyer depuis cet appareil `
    + `effacerait ce que cette version ne sait pas lire : mets d’abord l’application `
    + `à jour ici, en rechargeant la page.`;
}

/** La pastille et le titre de la carte, pour chaque état de synchronisation. */
const ENTETES: Readonly<Record<EtatSynchro, { titre: string; pastille: string; ton: TonStatut }>> = {
  'a-jour': { titre: 'Sauvegardé', pastille: 'à jour', ton: 'ok' },
  'a-envoyer': { titre: 'Pas encore sauvegardé', pastille: 'à envoyer', ton: 'attente' },
  'a-recevoir': { titre: 'Tes données sont sur le compte', pastille: 'à recevoir', ton: 'attente' },
  rien: { titre: 'Rien à sauvegarder encore', pastille: 'vide', ton: 'neutre' },
  differe: { titre: 'Pas à jour', pastille: 'diffère', ton: 'attente' },
  inconnu: { titre: 'Compte relié', pastille: 'état inconnu', ton: 'attente' },
  illisible: { titre: 'Compte relié', pastille: 'illisible ici', ton: 'attente' }
};

/**
 * La pastille et le titre de la carte quand l'appareil se synchronise tout
 * seul (lot 42) : « Sauvegardé », et ce qui se passe — à jour, envoi…, à
 * choisir, hors ligne. Les états où le compte n'est plus celui qu'on croit
 * gardent le titre neutre : « Sauvegardé » y serait une promesse fausse.
 */
const ENTETES_AUTO: Readonly<Record<EtatSynchroAppareil['phase'], { titre: string; pastille: string; ton: TonStatut }>> = {
  inactif: { titre: 'Sauvegardé', pastille: 'à jour', ton: 'ok' },
  'a-jour': { titre: 'Sauvegardé', pastille: 'à jour', ton: 'ok' },
  envoi: { titre: 'Sauvegardé', pastille: 'envoi…', ton: 'attente' },
  'attente-saisie': { titre: 'Sauvegardé', pastille: 'mise à jour en attente', ton: 'attente' },
  'hors-ligne': { titre: 'Sauvegardé', pastille: 'hors ligne', ton: 'attente' },
  'a-choisir': { titre: 'Sauvegardé', pastille: 'à choisir', ton: 'attente' },
  erreur: { titre: 'Sauvegardé', pastille: 'en échec', ton: 'attente' },
  reconnecter: { titre: 'Compte relié', pastille: 'session refusée', ton: 'attente' },
  'mettre-a-jour': { titre: 'Compte relié', pastille: 'version plus récente', ton: 'attente' },
  anomalie: { titre: 'Compte relié', pastille: 'à vérifier', ton: 'attente' },
  demonstration: { titre: 'Compte relié', pastille: 'démonstration', ton: 'neutre' }
};

/**
 * Ce que dit « Synchroniser maintenant » d'un appareil synchronisé, une fois
 * le moteur passé. « À choisir » n'a pas de phrase : la carte qui fait choisir
 * s'affiche, et c'est elle qui parle.
 */
const APRES_SYNCHRO: Partial<Record<EtatSynchroAppareil['phase'], string>> = {
  'a-jour': 'À jour : le compte porte ce qu’il y a sur cet appareil.',
  'hors-ligne': 'Hors ligne : rien n’a pu partir. Tes modifications restent sur cet appareil.',
  'attente-saisie': 'Le compte a changé : FREEL le prendra quand le formulaire ouvert sera fermé.',
  demonstration: 'Cet appareil montre la démonstration : rien n’est envoyé ni reçu. « Charger le compte '
    + 'sur cet appareil » reprend tes données.'
};

/** Ce que « Synchroniser maintenant » fait quand il ne peut pas choisir le sens. */
const SANS_SENS: Partial<Record<EtatSynchro, string>> = {
  'a-jour': 'À jour : le compte porte exactement ce qu’il y a sur cet appareil.',
  rien: 'Rien à synchroniser : ni cet appareil ni le compte n’ont encore de données.',
  differe: 'Le compte et cet appareil ne portent pas la même chose, et rien ne dit lequel '
    + 'est le plus récent : choisis le sens ci-dessous.'
};

export interface ProprietesRelie {
  readonly config: ConfigSupabase;
  readonly session: Session;
  readonly local: StockageLocal;
  /** Le projet est fixé au build : il ne se change pas d'ici. */
  readonly projetFixe: boolean;
  readonly onDeconnecte: (message: string) => void;
  /** Déconnecté ET projet oublié : le parent rouvre la saisie d'un projet. */
  readonly onChangerDeProjet: () => void;
  /** La santé du projet, avec les gestes de son pied et ce qu'ils ouvrent. */
  readonly sante: (pied: ReactNode, suite: ReactNode) => ReactNode;
  /** Le moteur de la synchronisation automatique. Injectable pour les tests. */
  readonly moteur?: MoteurSynchro;
}

export function Relie(
  { config, session, local, projetFixe, onDeconnecte, onChangerDeProjet, sante, moteur }: ProprietesRelie
) {
  const remplacerParBundle = useFaits((e) => e.remplacerParBundle);
  const adopterFaitsDistants = useFaits((e) => e.adopterFaitsDistants);
  const faitsLocaux = useFaits((e) => e.faits);
  const id = useId();
  /*
   * L'appareil se synchronise-t-il tout seul ? Oui dès qu'il a une BASE pour
   * ce compte : une première synchronisation réussie, faite ici. Avant, la
   * première liaison reste ce parcours, avec ses confirmations (lot 42).
   * Relue à chaque rendu — le moteur la réécrit en arrière-plan, et l'état
   * qu'il publie fait rendre l'écran.
   */
  const etatAuto = useEtatSynchro();
  const base = lireBase(local, session.utilisateurId);
  const auto = base !== null;
  const leMoteur = (): MoteurSynchro => moteur ?? moteurPour(local);

  const [etat, setEtat] = useState<Etat>({ phase: 'connecte' });
  const [distant, setDistant] = useState<EtatDistant>('inconnu');
  const [lu, setLu] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Le bilan d'un effacement s'affiche SOUS ses boutons : posé en bas de la
  // carte, il sortait de l'écran sur téléphone, et le geste le plus grave de
  // l'écran restait sans réponse visible.
  const [effacement, setEffacement] = useState<{ readonly echec: boolean; readonly texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [effacerOuvert, setEffacerOuvert] = useState(false);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  const boutonEffacer = useRef<HTMLButtonElement>(null);
  const premiereLecture = useRef(false);

  const synchro = useMemo(() => etatDeSynchronisation(faitsLocaux, distant), [faitsLocaux, distant]);

  /**
   * Va chercher où en est le compte.
   *
   * Un échec laisse l'état à `'inconnu'`, ce qui interdit l'envoi. C'est
   * voulu : écrire sans savoir ce qu'on recouvre est la seule façon de perdre
   * des données sans s'en apercevoir.
   */
  async function relireEtatDistant(): Promise<EtatDistant> {
    const r = await tirerFaits(config, session);
    setLu(true);
    if (r.statut === 'erreur') {
      setDistant('inconnu');
      setErreur(r.motif);
      return 'inconnu';
    }
    setDistant(r.valeur);
    // Les deux côtés portent la même chose : c'est une synchronisation, et
    // l'appareil la retient. C'est par là qu'un appareil déjà relié AVANT le
    // lot 42 entre dans la synchronisation automatique, sans rien envoyer ni
    // recevoir — il suffit d'ouvrir cet écran une fois.
    if (r.valeur !== null && memesFaits(faitsLocaux, r.valeur)) retenir(r.valeur.version, faitsLocaux);
    return r.valeur;
  }

  /**
   * Retient une synchronisation réussie ici — envoi, chargement, égalité
   * constatée, retour à un état précédent — et réveille le moteur : la suite
   * se fera toute seule.
   */
  function retenir(version: number, faits: unknown): void {
    const nouvelle = noterSynchronisation(local, session.utilisateurId, version, faits);
    publierEtatSynchro({ phase: 'a-jour', le: nouvelle.le });
    leMoteur().demarrer();
  }

  // Le compte se lit à l'ouverture, une fois : le mode strict rejoue les
  // effets au montage, et une seconde lecture volerait sa réponse à un geste.
  useEffect(() => {
    if (premiereLecture.current) return;
    premiereLecture.current = true;
    void relireEtatDistant();
    // Synchronisé : ce que l'écran affiche vient du moteur, et doit être
    // frais à l'ouverture — un « Reconnecte-toi » d'avant la reconnexion, ou
    // un « hors ligne » d'avant le retour du réseau, y mentirait.
    if (auto) void leMoteur().synchroniser('manuel');
    // `relireEtatDistant` ne dépend que de la session, fixe pour cet écran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Le moteur a synchronisé en arrière-plan pendant que l'écran est ouvert :
   * ce que l'écran a lu du compte n'est plus à jour, et « Enregistrer cet
   * appareil » partirait sur une version dépassée — refusée par le serveur,
   * mais après un conflit qu'on aurait pu éviter. On relit.
   */
  const versionBase = base?.version;
  useEffect(() => {
    if (versionBase === undefined || !lu || distant === 'inconnu') return;
    if (distant !== null && distant.version === versionBase) return;
    void relireEtatDistant();
    // Seul le changement de la base déclenche la relecture : relire à chaque
    // nouvel état distant relirait en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionBase]);

  /* ── Synchroniser ────────────────────────────────────────────────────── */

  /**
   * Relit le compte, puis prend le seul sens qui ne se discute pas : envoyer
   * quand le compte n'a rien, montrer ce qu'il apporte quand c'est cet appareil
   * qui n'a rien. Quand les deux ont des données différentes, rien ne dit
   * lequel est le plus récent — l'écran le dit, et laisse choisir.
   *
   * Un appareil qui se synchronise déjà tout seul passe par le moteur : la
   * même règle que l'automatique, maintenant — pas une seconde règle qui
   * finirait par ne pas dire la même chose.
   */
  async function synchroniser(): Promise<void> {
    setEnCours(true);
    setErreur(null);
    setMessage(null);
    if (auto) {
      const resultat = await leMoteur().synchroniser('manuel');
      await relireEtatDistant();
      setEnCours(false);
      const texte = APRES_SYNCHRO[resultat.phase];
      if (texte !== undefined) setMessage(texte);
      return;
    }
    const relu = await relireEtatDistant();
    setEnCours(false);
    const sens = etatDeSynchronisation(faitsLocaux, relu);
    if (sens === 'a-envoyer' && relu !== 'inconnu') { await demanderEnvoi(relu); return; }
    if (sens === 'a-recevoir' && relu !== null && relu !== 'inconnu') { montrerApercu(relu); return; }
    const texte = SANS_SENS[sens];
    if (texte !== undefined) setMessage(texte);
  }

  /* ── Envoyer ─────────────────────────────────────────────────────────── */

  /**
   * Le cas qu'il ne faut pas laisser passer d'un clic : envoyer le VIDE
   * par-dessus des données.
   *
   * Il survient naturellement. On installe la nouvelle application sur un
   * appareil, elle n'a encore rien, et « enregistrer sur le compte » est le
   * bouton qui semble le plus utile — il effacerait tout. Le compteur de
   * version ne protège pas de cela : la version distante est bien celle qu'on
   * a lue, l'écriture est donc parfaitement légitime pour le serveur.
   *
   * Le contrôle est délibérément étroit : rien d'un côté, quelque chose de
   * l'autre. Une règle plus large — « refuser si le compte a plus de lignes »
   * — se déclencherait à chaque suppression volontaire, et une confirmation
   * qu'on voit tout le temps ne se lit plus.
   */
  async function demanderEnvoi(compte: EtatDistant = distant): Promise<void> {
    if (compte === 'inconnu' || motifRefusEnvoi(compte) !== null) return;
    const cote = compte === null ? null : resumeDistant(compte);
    const ecraserait = compte !== null && (cote === null || !estVide(cote));

    const motif = motifDeConfirmation(faitsLocaux);
    if (motif !== null && ecraserait && compte !== null) {
      setErreur(null);
      setMessage(null);
      setEtat({ phase: 'confirmer-envoi', distant: compte, motif });
      return;
    }
    await envoyer(compte === null ? null : compte.version);
  }

  async function envoyer(versionAttendue: number | null): Promise<void> {
    setEnCours(true);
    setErreur(null);
    setMessage(null);

    const r = await pousserFaits(config, session, faitsLocaux, VERSION_SCHEMA, versionAttendue);
    setEnCours(false);

    if (r.statut === 'erreur') { setErreur(r.motif); return; }
    if (r.statut === 'conflit') {
      setDistant(r.distant);
      setEtat({ phase: 'conflit', distant: r.distant });
      return;
    }
    setDistant(r.instantane);
    retenir(r.instantane.version, faitsLocaux);
    setEtat({ phase: 'connecte' });
    setMessage('Données de cet appareil enregistrées sur le compte.');
  }

  /* ── Récupérer ───────────────────────────────────────────────────────── */

  function montrerApercu(instantane: InstantaneDistant): void {
    // Un bloc écrit par une version plus récente est refusé ici, avant tout
    // remplacement : le charger reviendrait à effacer ce que ce code ne sait
    // pas lire dès le premier renvoi.
    const motif = motifRefusExterieur(instantane.faits);
    if (motif !== null) { setErreur(motif); return; }
    setEtat({ phase: 'apercu-distant', instantane, faits: completerFaits(instantane.faits) });
  }

  async function recuperer(): Promise<void> {
    setEnCours(true);
    setErreur(null);
    setMessage(null);

    const instantane = await relireEtatDistant();
    setEnCours(false);
    if (instantane === 'inconnu') return;
    if (instantane === null) {
      setMessage('Ce compte ne contient encore aucune donnée de cette version.');
      return;
    }
    montrerApercu(instantane);
  }

  async function confirmerRecuperation(instantane: InstantaneDistant, faits: Faits): Promise<void> {
    const motif = await adopterFaitsDistants(faits);
    if (motif !== null) { setErreur(motif); return; }
    // L'empreinte de ce que le MAGASIN a posé, pas du bloc reçu : c'est lui
    // qu'on comparera ensuite pour dire « modifié ici ».
    retenir(instantane.version, useFaits.getState().faits);
    setEtat({ phase: 'connecte' });
    setMessage('Données du compte chargées. Elles remplacent l’état de cet appareil.');
  }

  /* ── Ancienne application ────────────────────────────────────────────── */

  async function apercevoirLegacy(): Promise<void> {
    setEnCours(true);
    setErreur(null);
    setMessage(null);

    const r = await chargerDonneesLegacy(config, session);
    setEnCours(false);
    if (r.statut === 'erreur') { setErreur(r.motif); return; }
    if (r.valeur === null) {
      setMessage('Ce compte ne contient aucune donnée de l’ancienne application.');
      return;
    }
    const { rapport } = convertirBundle(bundleDepuisLegacy(r.valeur));
    setEtat({ phase: 'apercu-legacy', donnees: r.valeur, rapport });
  }

  async function confirmerLegacy(donnees: DonneesLegacy): Promise<void> {
    const refus = await remplacerParBundle(bundleDepuisLegacy(donnees));
    setEtat({ phase: 'connecte' });
    if (refus !== null) { setErreur(refus); return; }
    setMessage('Données de l’ancienne application chargées sur cet appareil.');
  }

  /**
   * Efface du compte l'une des deux copies, et dit ce que la relecture a
   * constaté — jamais ce que le serveur a simplement accepté.
   */
  async function effacer(quoi: 'faits' | 'legacy'): Promise<void> {
    setEnCours(true);
    setErreur(null);
    setMessage(null);
    setEffacement(null);
    const r: ResultatEffacement = quoi === 'faits'
      ? await effacerFaitsDuCompte(config, session)
      : await effacerDonneesLegacy(config, session);
    if (quoi === 'faits') {
      // Le compte n'a plus rien : la base ne désigne plus rien. Gardée, elle
      // ferait dire « effacé ailleurs » à cet appareil même. Les AUTRES, eux,
      // le diront — et ne renverront rien tout seuls.
      if (r.statut === 'efface' || r.statut === 'deja-vide') {
        ecrireBase(local, null);
        publierEtatSynchro({ phase: 'inactif' });
      }
      await relireEtatDistant();
    }
    setEnCours(false);
    const copie = quoi === 'faits' ? 'de cette version' : 'de l’ancienne application';
    switch (r.statut) {
      case 'efface':
        // Les états précédents partent avec la copie de cette version : le
        // dire, sinon on croirait qu'ils restent, prêts à la ramener.
        setEffacement({
          echec: false,
          texte: quoi === 'faits'
            ? 'Données de cette version et états précédents effacés du compte. Relu après coup : il n’en reste rien.'
            : `Données ${copie} effacées du compte. Relu après coup : il n’en reste rien.`
        });
        return;
      case 'deja-vide':
        setEffacement({ echec: false, texte: `Le compte ne contenait aucune donnée ${copie} : rien à effacer.` });
        return;
      case 'regle-absente':
        setEffacement({
          echec: true,
          texte: 'Rien n’a été effacé : le serveur n’autorise pas encore la suppression. '
            + 'Réexécute le script de la base (docs/supabase.sql : « Changer de projet » puis l’étape 2 '
            + 'du guide le copie d’un geste) dans l’éditeur SQL du projet Supabase, puis réessaie.'
        });
        return;
      case 'erreur':
        setEffacement({ echec: true, texte: r.motif });
    }
  }

  async function deconnecter(): Promise<void> {
    await seDeconnecter(config, session);
    ecrireSession(local, null);
    onDeconnecte('Déconnecté. Tes données restent sur cet appareil : « Effacer cet appareil », '
      + 'dans Réglages › Données & export, les en retire.');
  }

  async function changerDeProjet(): Promise<void> {
    await seDeconnecter(config, session);
    ecrireSession(local, null);
    onChangerDeProjet();
  }

  /* ── Rendu ───────────────────────────────────────────────────────────── */

  const entete = auto ? ENTETES_AUTO[etatAuto.phase] : ENTETES[lu ? synchro : 'inconnu'];
  const ici = resumer(faitsLocaux);
  const refus = distant === 'inconnu' ? null : motifRefusEnvoi(distant);
  const libre = etat.phase === 'connecte';

  const pied = (
    <>
      {!projetFixe && (
        <ConfirmationSurPlace
          libelle="Changer de projet"
          classeDeclencheur={styles.action}
          desactive={enCours || !libre}
          consequence={(
            <>
              Tu seras déconnecté de ce projet pour en relier un autre. Tes
              données restent sur cet appareil, et le compte n’est pas touché.
            </>
          )}
          libelleConfirmer="Me déconnecter et changer"
          onConfirmer={() => void changerDeProjet()}
        />
      )}
      <button type="button" className={styles.action} aria-expanded={historiqueOuvert}
        disabled={!libre} onClick={() => setHistoriqueOuvert((v) => !v)}>
        États précédents
      </button>
    </>
  );

  const suite = historiqueOuvert && libre && (
    <EtatsPrecedents
      config={config}
      session={session}
      distant={distant}
      desactive={enCours}
      lireDesLOuverture
      onCompteModifie={(i) => {
        if (i !== null) setDistant(i);
        else void relireEtatDistant();
      }}
      onRevenu={(i) => retenir(i.version, useFaits.getState().faits)}
    />
  );

  return (
    <div className={styles.pile}>
      {/* « À choisir » d'abord : la pastille du haut y mène, et c'est la
          seule chose de l'écran qui attend une décision. */}
      {auto && etatAuto.phase === 'a-choisir' && (
        <AChoisir
          etat={etatAuto}
          ici={faitsLocaux}
          desactive={enCours}
          onTrancher={async (choix) => {
            setEnCours(true);
            setErreur(null);
            setMessage(null);
            const apres = await leMoteur().trancher(choix, etatAuto.distant.version);
            await relireEtatDistant();
            setEnCours(false);
            if (apres.phase === 'a-jour') {
              setMessage(choix === 'garder-ici'
                ? 'Gardé : le compte porte maintenant ce qu’il y a sur cet appareil. L’état écarté est dans '
                  + 'les états précédents du compte.'
                : 'Pris : cet appareil porte maintenant ce qu’il y a sur le compte. L’état écarté est mis de '
                  + 'côté dans Données, « Revenir à l’état d’avant ».');
            }
          }}
        />
      )}
      <section className={styles.carte} aria-labelledby={`${id}-titre`}>
        <div className={styles.enTete}>
          <h3 id={`${id}-titre`} className={styles.titreCarte}>
            {entete.titre}
            <Info libelle="Ce que fait la connexion au compte">
              Elle enregistre et relit les données de cette version dans une table
              qui lui est propre. <strong>Les données de l’ancienne application ne
              sont jamais modifiées</strong>, sauf si tu demandes leur effacement&nbsp;:
              la reprise s’en sert, et l’ancienne version les affiche encore, en
              lecture seule.
            </Info>
          </h3>
          {(lu || auto) && <Statut libelle={entete.pastille} ton={entete.ton} />}
        </div>

        {auto
          ? <PhraseAutomatique etat={etatAuto} base={base} />
          : <PhraseDuCompte synchro={lu ? synchro : null} distant={distant} refus={refus} />}

        <dl className={styles.detail}>
          <div className={styles.ligne}><dt>Projet</dt><dd className={styles.mono}>{new URL(config.url).host}</dd></div>
          <div className={styles.ligne}><dt>Connecté</dt><dd>{session.email}</dd></div>
          <div className={styles.ligne}>
            <dt>Cet appareil</dt><dd>{ici.recettes} recette(s), {ici.depenses} dépense(s)</dd>
          </div>
        </dl>

        {libre && (
          <>
            <div className={styles.actions}>
              <button type="button" className={`${styles.actionPrincipale} ${styles.actionVerte}`}
                disabled={enCours} onClick={() => void synchroniser()}>
                {enCours ? 'Synchronisation…' : 'Synchroniser maintenant'}
              </button>
              <button type="button" className={styles.actionPrincipale} onClick={() => void deconnecter()}>
                Me déconnecter
              </button>
            </div>

            <h4 className={styles.sousTitre}>Dans un sens précis</h4>
            <ul className={styles.operations}>
              <li className={styles.operation}>
                <button
                  type="button"
                  className={styles.actionPrincipale}
                  disabled={enCours || distant === 'inconnu' || refus !== null}
                  onClick={() => void demanderEnvoi()}
                >
                  Enregistrer cet appareil sur le compte
                </button>
                <p className={styles.consequence}>
                  Envoie ce que contient <strong>cet appareil</strong>
                  {' '}({resumeCourt(ici)}) vers le compte, en remplacement de ce
                  qui s’y trouve.
                </p>
              </li>
              <li className={styles.operation}>
                <button type="button" className={styles.action} disabled={enCours} onClick={() => void recuperer()}>
                  Charger le compte sur cet appareil
                </button>
                <p className={styles.consequence}>
                  Sens inverse&nbsp;: ce qui est sur <strong>le compte</strong>
                  {' '}remplacera ce que contient cet appareil.
                </p>
              </li>
            </ul>
          </>
        )}

        {etat.phase === 'confirmer-envoi' && (
          <ConfirmerEnvoi
            motif={etat.motif}
            distant={etat.distant}
            onConfirmer={() => void envoyer(etat.distant.version)}
            onAnnuler={() => setEtat({ phase: 'connecte' })}
          />
        )}
        {etat.phase === 'apercu-distant' && (
          <ApercuDistant
            resume={resumer(etat.faits)}
            majLe={etat.instantane.majLe}
            onConfirmer={() => void confirmerRecuperation(etat.instantane, etat.faits)}
            onAnnuler={() => setEtat({ phase: 'connecte' })}
          />
        )}
        {etat.phase === 'conflit' && (
          <Conflit
            distant={etat.distant}
            local={ici}
            enCours={enCours}
            onEcraser={() => void envoyer(etat.distant?.version ?? null)}
            onAbandonner={() => {
              setEtat({ phase: 'connecte' });
              setMessage('Envoi abandonné. Rien n’a été modifié sur le compte.');
            }}
          />
        )}

        {erreur !== null && <p role="alert" className={styles.echec}>{erreur}</p>}
        {message !== null && <p role="status" className={styles.succes}>{message}</p>}
      </section>

      {sante(pied, suite)}

      {(libre || etat.phase === 'apercu-legacy') && (
        <section className={styles.carte} aria-labelledby={`${id}-rares`}>
          <h3 id={`${id}-rares`} className={styles.titreCarte}>Plus rarement</h3>
          {etat.phase === 'apercu-legacy'
            ? (
              <Apercu
                titre="Données de l’ancienne application"
                rapport={etat.rapport}
                majLe={etat.donnees.updated_at}
                onConfirmer={() => void confirmerLegacy(etat.donnees)}
                onAnnuler={() => setEtat({ phase: 'connecte' })}
              />
            )
            : (
              <ul className={styles.operations}>
                <li className={styles.operation}>
                  <button type="button" className={styles.action} disabled={enCours}
                    onClick={() => void apercevoirLegacy()}>
                    Reprendre les données de l’ancienne application
                  </button>
                  <p className={styles.consequence}>
                    Lit la table de <strong>l’ancienne version</strong> et la
                    convertit. Elle n’est pas modifiée&nbsp;: l’ancienne
                    application reste consultable, en lecture seule.
                  </p>
                </li>
                <li className={styles.operation}>
                  <button
                    ref={boutonEffacer}
                    type="button"
                    className={styles.action}
                    aria-expanded={effacerOuvert}
                    onClick={() => setEffacerOuvert(true)}
                  >
                    Se déconnecter et effacer cet appareil
                  </button>
                  {/* Lot 59 (S7) : se déconnecter laissait tout sur l'appareil, sans le dire. */}
                  <p className={styles.consequence}>
                    Se déconnecter laisse tes données et tes pièces sur cet
                    appareil, lisibles par qui l’ouvre.
                  </p>
                </li>
              </ul>
            )}
          {effacerOuvert && (
            <PanneauEffacerAppareil
              classes={{ action: styles.action, succes: styles.succes, echec: styles.echec }}
              onGarder={() => { setEffacerOuvert(false); boutonEffacer.current?.focus(); }}
            />
          )}

          {/*
            * LE DROIT À L'EFFACEMENT, DEPUIS L'APPLICATION.
            *
            * « Repartir de zéro » ne vidait que ce navigateur : les données
            * restaient sur le compte, et rien ne disait comment les en
            * retirer. Chaque copie s'efface à part — celle de l'ancienne
            * application sert encore à la reprise —, et l'effacement se
            * PROUVE en relisant : un serveur sans règle de suppression
            * répond « succès » sans rien effacer.
            */}
          <h4 className={styles.sousTitre}>Effacer mes données du compte</h4>
          <ul className={styles.operations}>
            <li className={styles.operation}>
              <ConfirmationSurPlace
                libelle="Effacer la copie de cette version"
                classeDeclencheur={styles.action}
                desactive={enCours || !libre}
                consequence={(
                  <>
                    La copie de cette version enregistrée sur le compte, et
                    ses états précédents, seront effacés, puis relus pour le
                    prouver. Rien ne les ramène,
                    sinon un nouvel envoi depuis un appareil. Cet appareil
                    garde ses données&nbsp;: une sauvegarde JSON (Données)
                    d’abord reste prudente.
                  </>
                )}
                libelleConfirmer="Effacer du compte"
                onConfirmer={() => void effacer('faits')}
              />
            </li>
            <li className={styles.operation}>
              <ConfirmationSurPlace
                libelle="Effacer les données de l’ancienne application"
                classeDeclencheur={styles.action}
                desactive={enCours || !libre}
                consequence={(
                  <>
                    Les données de l’ancienne application enregistrées sur le
                    compte seront effacées, puis relues pour le prouver. Fais
                    d’abord la reprise si tu en as besoin&nbsp;: ensuite, le
                    compte n’aura plus rien à reprendre.
                  </>
                )}
                libelleConfirmer="Effacer du compte"
                onConfirmer={() => void effacer('legacy')}
              />
            </li>
          </ul>
          {effacement !== null && (
            <p role={effacement.echec ? 'alert' : 'status'} className={effacement.echec ? styles.echec : styles.succes}>
              {effacement.texte}
            </p>
          )}
          <p className={styles.explication}>
            Ton <strong>identifiant de connexion</strong> n’est pas supprimé
            par ces gestes&nbsp;: il se supprime dans le tableau de bord du
            projet Supabase (Authentication, puis Users). C’est le seul
            endroit où la clé de service — celle qui permet tout — a sa
            place&nbsp;; elle n’en a aucune dans une page servie à tous.
            Les données de <strong>cet appareil</strong> s’effacent avec
            «&nbsp;Se déconnecter et effacer cet appareil&nbsp;», plus haut.
          </p>
        </section>
      )}
    </div>
  );
}

/**
 * La phrase sous le titre, pour un appareil qui n'a pas encore synchronisé :
 * l'heure du dernier envoi, et ce que l'état veut dire pour la suite. Rien
 * n'est promis que l'application ne fasse : tant que cet appareil n'a pas
 * synchronisé une première fois, rien ne part ni n'arrive tout seul. Ensuite,
 * c'est `PhraseAutomatique` qui parle.
 */
function PhraseDuCompte(
  { synchro, distant, refus }: { synchro: EtatSynchro | null; distant: EtatDistant; refus: string | null }
) {
  if (synchro === null) return <p className={styles.consequence}>Lecture du compte…</p>;
  if (distant === 'inconnu') {
    return (
      <p className={styles.avertissement}>
        L’état du compte n’a pas pu être lu. L’envoi reste indisponible tant
        qu’on ignore ce qu’il contient&nbsp;: écrire sans le savoir pourrait
        recouvrir des données sans que rien ne l’annonce.
      </p>
    );
  }
  if (refus !== null) return <p className={styles.avertissement}>{refus}</p>;
  // L'heure en gras, comme la maquette : c'est la réponse à « est-ce parti ? ».
  const envoi = distant !== null && distant.majLe !== null
    ? <>Dernier envoi <strong>{quandFr(distant.majLe)}</strong>. </>
    : null;
  const suite: Record<EtatSynchro, string> = {
    'a-jour': 'Le compte porte exactement ce qu’il y a sur cet appareil. Sur un autre appareil, '
      + '« Charger le compte sur cet appareil » le récupère.',
    'a-envoyer': 'Le compte ne porte encore rien de ce qu’il y a ici : « Synchroniser maintenant » l’y envoie.',
    'a-recevoir': 'Cet appareil n’a pas encore tes données ; le compte, si. « Synchroniser maintenant » '
      + 'montre ce qu’il apporte avant de le charger.',
    rien: 'Ni cet appareil ni le compte n’ont encore de données.',
    differe: 'Le compte et cet appareil ne portent pas la même chose, et rien ne dit lequel est le plus '
      + 'récent : choisis le sens ci-dessous.',
    inconnu: '',
    illisible: 'Le contenu du compte ne se lit pas ici : « Enregistrer cet appareil sur le compte » le remplace.'
  };
  return <p className={styles.explication}>{envoi}{suite[synchro]}</p>;
}

/**
 * Envoyer un appareil vide sur un compte qui contient quelque chose.
 *
 * Rien d'anormal du point de vue du serveur : la version est la bonne,
 * l'écriture passerait. C'est l'INTENTION qui est douteuse, et seule une
 * personne peut la confirmer.
 */
function ConfirmerEnvoi(
  { motif, distant, onConfirmer, onAnnuler }: {
    motif: MotifDeConfirmation;
    distant: InstantaneDistant;
    onConfirmer: () => void;
    onAnnuler: () => void;
  }
) {
  const cote = resumeDistant(distant);
  const contenuDuCompte = cote === null
    ? '.'
    : ` — ${cote.recettes} recette(s), ${cote.depenses} dépense(s), `
      + `${cote.clients} client(s).`;

  return (
    <div className={styles.apercu}>
      {motif === 'appareil-vide'
        ? (
          <p className={styles.avertissement}>
            Cet appareil ne contient <strong>aucune donnée</strong>. L’envoyer
            effacerait ce que le compte contient{contenuDuCompte}
          </p>
        )
        : (
          /*
           * LE DANGER SE NOMME, SINON IL NE SE VOIT PAS.
           *
           * L'écran est plein de factures : rien n'y ressemble à une perte de
           * données. Il faut donc dire que ces factures sont FICTIVES, et ce
           * que l'envoi ferait des vraies.
           */
          <p className={styles.avertissement}>
            Cet appareil contient le <strong>jeu de démonstration</strong> —
            des clients et des factures fictifs. L’envoyer remplacerait le
            contenu du compte{contenuDuCompte}
          </p>
        )}
      <p className={styles.consequence}>
        Si tu voulais au contraire récupérer ces données ici, reviens en
        arrière et choisis <em>Charger le compte sur cet appareil</em>, ou
        <em> Reprendre les données de l’ancienne application</em>.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={onConfirmer}>
          {motif === 'appareil-vide'
            ? 'Effacer quand même le compte'
            : 'Remplacer quand même le compte'}
        </button>
        <button type="button" className={styles.actionPrincipale} onClick={onAnnuler}>
          Revenir en arrière
        </button>
      </div>
    </div>
  );
}

/**
 * Le compte a bougé entre la lecture et l'envoi.
 *
 * Aucune fusion automatique n'est tentée. Réunir deux jeux d'écritures
 * comptables demande de savoir, ligne à ligne, laquelle fait foi ; le deviner
 * produirait un registre que personne n'a validé. On présente donc les deux
 * états et on laisse choisir — en disant ce que chaque choix efface.
 */
function Conflit(
  { distant, local, enCours, onEcraser, onAbandonner }: {
    distant: InstantaneDistant | null;
    local: Resume;
    enCours: boolean;
    onEcraser: () => void;
    onAbandonner: () => void;
  }
) {
  const lisible = distant !== null && motifRefusExterieur(distant.faits) === null;
  const cote = lisible && distant !== null ? resumer(completerFaits(distant.faits)) : null;
  // Le conflit peut révéler qu'un appareil plus récent a écrit entre-temps :
  // « écraser » retomberait alors exactement dans le cas que l'envoi refuse.
  const refus = motifRefusEnvoi(distant);

  return (
    <div className={styles.apercu}>
      <p className={styles.avertissement}>
        Le compte a été modifié depuis la dernière lecture, sans doute par un
        autre appareil. <strong>Rien n’a été enregistré</strong>&nbsp;: écraser
        ces modifications sans les montrer les aurait fait disparaître en
        silence.
      </p>

      <dl className={styles.detail}>
        <div className={styles.ligne}>
          <dt>Cet appareil</dt>
          <dd>{local.recettes} recette(s), {local.depenses} dépense(s)</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Le compte</dt>
          <dd>
            {cote === null
              ? 'contenu illisible'
              : `${cote.recettes} recette(s), ${cote.depenses} dépense(s)`}
          </dd>
        </div>
        {distant?.majLe != null && (
          <div className={styles.ligne}>
            <dt>Enregistré le</dt>
            <dd>{dateCourte(distant.majLe.slice(0, 10))}</dd>
          </div>
        )}
      </dl>

      {refus !== null && <p className={styles.avertissement}>{refus}</p>}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          disabled={enCours || refus !== null}
          onClick={onEcraser}
        >
          Écraser le compte avec cet appareil
        </button>
        <button type="button" className={styles.actionPrincipale} onClick={onAbandonner}>
          Abandonner l’envoi
        </button>
      </div>
    </div>
  );
}

/** Ce qui serait chargé depuis la table de cette version. */
function ApercuDistant(
  { resume, majLe, onConfirmer, onAnnuler }: {
    resume: Resume;
    majLe: string | null;
    onConfirmer: () => void;
    onAnnuler: () => void;
  }
) {
  return (
    <div className={styles.apercu}>
      <p className={styles.avertissement}>
        Ces données <strong>remplaceront</strong> l’état actuel de cet appareil.
        Ce qui n’a pas été envoyé sur le compte sera perdu.
      </p>

      <dl className={styles.detail}>
        {majLe !== null && (
          <div className={styles.ligne}>
            <dt>Enregistré le</dt>
            <dd>{dateCourte(majLe.slice(0, 10))}</dd>
          </div>
        )}
        <div className={styles.ligne}><dt>Clients</dt><dd>{resume.clients}</dd></div>
        <div className={styles.ligne}><dt>Missions</dt><dd>{resume.missions}</dd></div>
        <div className={styles.ligne}><dt>Recettes</dt><dd>{resume.recettes}</dd></div>
        <div className={styles.ligne}><dt>Dépenses</dt><dd>{resume.depenses}</dd></div>
      </dl>

      <div className={styles.actions}>
        <button type="button" className={styles.actionPrincipale} onClick={onConfirmer}>
          Remplacer les données de cet appareil
        </button>
        <button type="button" className={styles.action} onClick={onAnnuler}>
          Annuler
        </button>
      </div>
    </div>
  );
}

/**
 * Ce qui serait chargé depuis l'ancienne application.
 *
 * Le même rapport que la migration locale : nombres par entité, anomalies, et
 * champs sans destination. Un chargement qui ne dit rien de ce qu'il apporte
 * ne permet pas de constater une perte.
 */
function Apercu(
  { titre, rapport, majLe, onConfirmer, onAnnuler }: {
    titre: string;
    rapport: RapportMigration;
    majLe: string | null;
    onConfirmer: () => void;
    onAnnuler: () => void;
  }
) {
  const { comptes } = rapport;
  return (
    <div className={styles.apercu}>
      <p className={styles.avertissement}>
        {titre} — elles <strong>remplaceront</strong> l’état actuel de cet
        appareil. Ce qui n’a pas été enregistré sur le compte sera perdu.
      </p>

      <dl className={styles.detail}>
        {majLe !== null && (
          <div className={styles.ligne}>
            <dt>Enregistré le</dt>
            <dd>{dateCourte(majLe.slice(0, 10))}</dd>
          </div>
        )}
        <div className={styles.ligne}><dt>Clients</dt><dd>{comptes.clients}</dd></div>
        <div className={styles.ligne}><dt>Missions</dt><dd>{comptes.missions}</dd></div>
        <div className={styles.ligne}><dt>Recettes</dt><dd>{comptes.recettes}</dd></div>
        <div className={styles.ligne}><dt>Dépenses</dt><dd>{comptes.depenses}</dd></div>
      </dl>

      {rapport.anomalies.length > 0 && (
        <details className={styles.repli}>
          <summary>
            <span className={styles.chevron} aria-hidden="true" />
            {rapport.anomalies.length} point(s) à connaître
          </summary>
          <ul className={styles.anomalies}>
            {rapport.anomalies.slice(0, 15).map((a, i) => (
              <li key={`${a.gravite}-${i}`}>{a.message}</li>
            ))}
            {rapport.anomalies.length > 15 && (
              <li>…et {rapport.anomalies.length - 15} autre(s).</li>
            )}
          </ul>
        </details>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.actionPrincipale} onClick={onConfirmer}>
          Remplacer les données de cet appareil
        </button>
        <button type="button" className={styles.action} onClick={onAnnuler}>
          Annuler
        </button>
      </div>
    </div>
  );
}
