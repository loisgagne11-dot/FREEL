/**
 * Le moteur de la synchronisation automatique (lot 42) — sans temps réel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUAND IL REGARDE LE COMPTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  · à l'ouverture, une fois le dossier local chargé ;
 *  · au retour au premier plan (`visibilitychange`) — un ordinateur resté
 *    ouvert se met à jour quand on y revient, pas avant ;
 *  · au retour du réseau (`online`) ;
 *  · quelques secondes après la dernière modification d'ici ;
 *  · en quittant (`visibilitychange` → caché, `pagehide`) : une tentative au
 *    mieux, si une modification n'est pas encore partie.
 *
 * Aucun canal permanent (audit produit, F9) : un seul utilisateur, et ces
 * moments-là couvrent le besoin. Ce qu'il FAIT de ce qu'il voit, c'est la
 * règle qui le dit (`state/synchro.regle`) ; le moteur n'en est que le bras.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN SEUL ONGLET TRAVAILLE À LA FOIS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chaque cycle passe sous le verrou commun aux onglets (celui du lot 59), et
 * RELIT la base une fois le verrou obtenu : l'onglet qui arrive second trouve
 * ce que le premier vient de retenir, et s'abstient si c'est tout frais. Sans
 * relecture, deux onglets enverraient la même modification ; le second serait
 * refusé par le serveur (version), relirait, et constaterait l'égalité — sans
 * dégât, mais avec un aller-retour et un état précédent inutiles.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * JAMAIS D'ÉCRASEMENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'envoi porte le filtre `version = base` : si le compte a bougé entre la
 * lecture et l'écriture, le SERVEUR refuse, et le moteur relit puis repasse
 * par la règle — qui demandera, puisque les deux côtés ont changé. Ce qui
 * vient du compte passe par la validation du schéma avant adoption, ici (la
 * règle) et dans le magasin (`adopterFaitsDistants`), qui garde aussi de côté
 * l'état qu'il remplace.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CHARGÉ À LA DEMANDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le paquet d'entrée est à 79,67 Ko sur 80 : le moteur est importé par la
 * barre du haut, elle-même différée, et seulement quand une session existe.
 * Quelqu'un qui n'a jamais relié de compte ne le télécharge pas.
 */
import { useFaits } from '../state/store';
import { VERSION_SCHEMA, type Faits } from '../state/schema';
import { deciderSynchro, memesFaits, natureLocale } from '../state/synchro.regle';
import { empreinte } from '../state/synchro.empreinte';
import { type BaseSynchro, ecrireBase, lireBase, noterSynchronisation } from './synchro.appareil';
import { type EtatSynchroAppareil, publierEtatSynchro } from './synchro.etat';
import {
  type ConfigSupabase, type InstantaneDistant, type Session, type StockageLocal, type Verrou,
  configEffective, lireSession, pousserFaits, reprendreSession, sessionValide, tirerFaits, verrouDuNavigateur
} from './supabase';

/** Ce qui a réveillé le moteur. Seuls certains réveils dispensent de lire le compte. */
export type Declencheur =
  | 'ouverture' | 'retour' | 'reseau' | 'ecriture' | 'manuel' | 'reessai' | 'saisie-finie';

/**
 * Tout ce que le moteur touche du monde, pour qu'un test puisse faire tourner
 * DEUX appareils sur un même compte simulé : chacun son stockage, son dossier,
 * ses délais — et un seul faux serveur derrière `fetch`.
 */
export interface PortsSynchro {
  readonly stockage: StockageLocal;
  readonly config: () => ConfigSupabase | null;
  readonly faits: () => Faits;
  /** Le dossier local est chargé : avant, rien ne part ni n'arrive — un dossier pas encore lu se lirait vide. */
  readonly pret: () => boolean;
  /** L'adoption du magasin : validation du schéma, copie de côté, persistance. Rend le motif d'un refus. */
  readonly adopter: (brut: unknown) => Promise<string | null>;
  /** Prévient d'un changement des faits (`faits`) ou du retour à l'état prêt (`pret`). */
  readonly ecouter: (rappel: (quoi: 'faits' | 'pret') => void) => () => void;
  readonly verrou: Verrou;
  readonly enLigne: () => boolean;
  readonly visible: () => boolean;
  /** Un formulaire est ouvert, ou un champ a le focus : on ne réécrit pas l'écran sous les doigts. */
  readonly saisieEnCours: () => boolean;
  readonly maintenant: () => Date;
  readonly publier: (etat: EtatSynchroAppareil) => void;
  readonly delais?: Partial<Delais>;
}

interface Delais {
  /** Le temps laissé après la dernière modification avant d'envoyer. */
  readonly ecriture: number;
  /** L'intervalle auquel on regarde si le formulaire ouvert s'est fermé. */
  readonly saisie: number;
  /** Les nouveaux essais après une coupure ou une erreur du serveur, croissants. */
  readonly reessai: readonly number[];
  /** Une synchronisation faite par un autre onglet depuis moins que cela dispense de relire. */
  readonly fraicheur: number;
  /** Laissé à un autre onglet pour écrire la session qu'il vient de renouveler (lot 59). */
  readonly session: number;
}

/*
 * Trois secondes : assez pour qu'une série de saisies (une facture, ses
 * lignes) parte en une fois, assez peu pour qu'on ne ferme pas l'onglet avant.
 * Les essais s'espacent jusqu'à cinq minutes : un projet en pause, ou un wifi
 * d'hôtel sans Internet, ne doit pas faire tourner le téléphone pour rien.
 */
const DELAIS: Delais = {
  ecriture: 3000, saisie: 1500, reessai: [30_000, 60_000, 120_000, 300_000], fraicheur: 10_000, session: 1500
};

const VERROU_SYNCHRO = 'freel.synchro';

/**
 * Au-delà, `keepalive` refuse la requête : le navigateur plafonne à 64 Kio le
 * corps de ce qui survit à la page. Un dossier plus lourd part par un envoi
 * ordinaire, qui aboutit si la page reste en vie le temps du trajet — et
 * sinon à la prochaine ouverture, la modification n'ayant pas quitté le disque.
 */
const KEEPALIVE_MAX = 60_000;

export interface MoteurSynchro {
  /** Pose les écoutes et lance le premier cycle. Sans effet au second appel. */
  readonly demarrer: () => void;
  readonly arreter: () => void;
  /** Un cycle complet : relit la base, le compte, applique la règle. */
  readonly synchroniser: (declencheur: Declencheur) => Promise<EtatSynchroAppareil>;
  /**
   * Tranche un « à choisir » : garder ce qu'il y a ici, ou prendre le compte.
   * `versionVue` : celle du compte que montrait la question — la réponse ne
   * vaut que pour elle.
   */
  readonly trancher: (choix: 'garder-ici' | 'prendre-compte', versionVue: number) => Promise<EtatSynchroAppareil>;
  /** Quitter la page : envoyer au mieux la modification qui n'est pas encore partie. */
  readonly partir: () => void;
  /** Le changement des faits, tel que l'écoute du magasin le transmet. */
  readonly surChangement: (quoi: 'faits' | 'pret') => void;
}

type Contexte =
  | { readonly ok: true; readonly config: ConfigSupabase; readonly session: Session; readonly base: BaseSynchro }
  | { readonly ok: false; readonly etat: EtatSynchroAppareil };

export function creerMoteur(ports: PortsSynchro): MoteurSynchro {
  const delais: Delais = { ...DELAIS, ...ports.delais };
  let dernier: EtatSynchroAppareil = { phase: 'inactif' };
  let demarre = false;
  let desabonner: (() => void) | null = null;
  let minuteurEcriture: ReturnType<typeof setTimeout> | null = null;
  let minuteurReessai: ReturnType<typeof setTimeout> | null = null;
  let minuteurSaisie: ReturnType<typeof setTimeout> | null = null;
  let essais = 0;
  /** L'heure de la dernière modification vue dans CET onglet, pour « modifié le … ». */
  let modifieA: Date | null = null;
  /** Une adoption du moteur change les faits : ce n'est pas une modification à renvoyer. */
  let adoptionEnCours = false;
  /** Un cycle demandé avant que le dossier local soit lu : il partira à l'état prêt. */
  let attendPret: Declencheur | null = null;

  function publier(etat: EtatSynchroAppareil): EtatSynchroAppareil {
    dernier = etat;
    ports.publier(etat);
    return etat;
  }

  function aJour(base: BaseSynchro): EtatSynchroAppareil {
    essais = 0;
    return publier({ phase: 'a-jour', le: base.le });
  }

  /** La base, la configuration et une session utilisable — ou l'état qui dit pourquoi pas. */
  async function contexte(): Promise<Contexte> {
    const config = ports.config();
    const stockee = lireSession(ports.stockage);
    // Pas de compte, ou un appareil qui n'a jamais synchronisé : la première
    // liaison est le parcours de l'écran Compte, avec ses confirmations.
    if (config === null || stockee === null) return { ok: false, etat: { phase: 'inactif' } };
    const base = lireBase(ports.stockage, stockee.utilisateurId);
    if (base === null) return { ok: false, etat: { phase: 'inactif' } };
    if (!ports.enLigne()) return { ok: false, etat: { phase: 'hors-ligne', aEnvoyer: constater(base).modifie } };
    const session = await reprendreSession(config, ports.stockage, ports.verrou, delais.session);
    if (session === null) {
      // `reprendreSession` n'efface la session que sur un REFUS du serveur ;
      // encore là, c'est que le réseau a manqué.
      return lireSession(ports.stockage) === null
        ? { ok: false, etat: { phase: 'reconnecter' } }
        : { ok: false, etat: { phase: 'hors-ligne', aEnvoyer: constater(base).modifie } };
    }
    return { ok: true, config, session, base };
  }

  /**
   * Ce qu'il y a ici par rapport à la base, et l'heure de la modification
   * retenue au passage — pour dire, s'il faut choisir, de quand date ce
   * changement. Effacée quand il n'y a plus rien de modifié.
   */
  function constater(base: BaseSynchro): { readonly faits: Faits; readonly empreinte: string; readonly modifie: boolean } {
    const faits = ports.faits();
    const e = empreinte(faits);
    const modifie = e !== base.empreinte;
    const vue = modifie ? (modifieA ?? (base.modifieLe === null ? ports.maintenant() : null)) : null;
    if (modifie && vue !== null && (base.modifieLe === null || vue.toISOString() > base.modifieLe)) {
      ecrireBase(ports.stockage, { ...base, modifieLe: vue.toISOString() });
    } else if (!modifie && base.modifieLe !== null) {
      ecrireBase(ports.stockage, { ...base, modifieLe: null });
    }
    return { faits, empreinte: e, modifie };
  }

  function retenir(base: BaseSynchro, version: number, faits: Faits): EtatSynchroAppareil {
    modifieA = null;
    return aJour(noterSynchronisation(ports.stockage, base.compte, version, faits, ports.maintenant()));
  }

  /** Un échec de requête : coupure (on réessaie), jeton refusé (on le dit), autre (on réessaie aussi). */
  function echec(
    r: { readonly motif: string; readonly code?: number; readonly panne?: 'reseau' | 'delai' }, aEnvoyer: boolean
  ): EtatSynchroAppareil {
    if (r.code === 401) return publier({ phase: 'reconnecter' });
    programmerReessai();
    return publier(r.panne !== undefined
      ? { phase: 'hors-ligne', aEnvoyer }
      : { phase: 'erreur', motif: r.motif, aEnvoyer });
  }

  function programmerReessai(): void {
    if (minuteurReessai !== null || !ports.visible()) return;
    const attente = delais.reessai[Math.min(essais, delais.reessai.length - 1)] ?? 300_000;
    essais++;
    minuteurReessai = setTimeout(() => {
      minuteurReessai = null;
      void synchroniser('reessai');
    }, attente);
  }

  /** Le compte a changé, un formulaire est ouvert : on regarde s'il se ferme, sans requête. */
  function attendreFinDeSaisie(): void {
    if (minuteurSaisie !== null) return;
    const regarder = (): void => {
      if (ports.saisieEnCours()) { minuteurSaisie = setTimeout(regarder, delais.saisie); return; }
      minuteurSaisie = null;
      void synchroniser('saisie-finie');
    };
    minuteurSaisie = setTimeout(regarder, delais.saisie);
  }

  async function adopter(base: BaseSynchro, distant: InstantaneDistant): Promise<EtatSynchroAppareil> {
    adoptionEnCours = true;
    let motif: string | null;
    try { motif = await ports.adopter(distant.faits); } finally { adoptionEnCours = false; }
    if (motif !== null) return publier({ phase: 'erreur', motif, aEnvoyer: false });
    return retenir(base, distant.version, ports.faits());
  }

  async function envoyer(
    ctx: Extract<Contexte, { ok: true }>, faits: Faits, versionAttendue: number, tour: number
  ): Promise<EtatSynchroAppareil> {
    publier({ phase: 'envoi' });
    const r = await pousserFaits(ctx.config, ctx.session, faits, VERSION_SCHEMA, versionAttendue);
    if (r.statut === 'ok') return retenir(ctx.base, r.instantane.version, faits);
    if (r.statut === 'erreur') return echec(r, true);
    // Refusé : le compte a bougé entre la lecture et l'écriture. On RELIT —
    // `r.distant` vaut `null` aussi bien pour « plus de ligne » que pour
    // « relecture échouée », et les confondre dirait « effacé ailleurs » à tort.
    const relu = await tirerFaits(ctx.config, ctx.session);
    if (relu.statut === 'erreur') return echec(relu, true);
    return appliquer(ctx, relu.valeur, tour + 1);
  }

  /** La règle, appliquée à ce qu'on vient de lire. */
  async function appliquer(
    ctx: Extract<Contexte, { ok: true }>, distant: InstantaneDistant | null, tour = 0
  ): Promise<EtatSynchroAppareil> {
    // Relu APRÈS la requête : une saisie faite pendant le trajet compte.
    const local = constater(ctx.base);
    const nature = natureLocale(local.faits);
    const decision = deciderSynchro({
      base: ctx.base, distant, modifie: local.modifie, local: nature,
      identiques: memesFaits(local.faits, distant), schemaConnu: VERSION_SCHEMA
    });
    switch (decision.action) {
      case 'rien':
        if (decision.pourquoi === 'demonstration') return publier({ phase: 'demonstration' });
        return retenir(ctx.base, distant?.version ?? ctx.base.version, local.faits);
      case 'aligner':
        return retenir(ctx.base, distant?.version ?? ctx.base.version, local.faits);
      case 'prendre':
        if (distant === null) return publier({ phase: 'anomalie', pourquoi: 'compte-efface' });
        if (ports.saisieEnCours()) { attendreFinDeSaisie(); return publier({ phase: 'attente-saisie' }); }
        return adopter(ctx.base, distant);
      case 'envoyer':
        // Deux refus de suite sans conflit visible : le serveur refuse l'écriture
        // pour une autre raison (règle d'accès). Insister ne ferait que tourner.
        if (tour > 1) return publier({ phase: 'erreur', motif: 'Le compte refuse l’écriture.', aEnvoyer: true });
        return envoyer(ctx, local.faits, ctx.base.version, tour);
      case 'a-choisir':
        if (distant === null) return publier({ phase: 'anomalie', pourquoi: 'compte-efface' });
        return publier({
          phase: 'a-choisir', pourquoi: decision.pourquoi, distant, local: nature,
          modifieLe: lireBase(ports.stockage, ctx.base.compte)?.modifieLe ?? null
        });
      case 'refuser':
        return publier({ phase: 'mettre-a-jour', schema: decision.schema });
      case 'anomalie':
        return publier({ phase: 'anomalie', pourquoi: decision.pourquoi });
    }
  }

  async function cycle(declencheur: Declencheur): Promise<EtatSynchroAppareil> {
    const ctx = await contexte();
    if (!ctx.ok) {
      if (ctx.etat.phase === 'hors-ligne') programmerReessai();
      return publier(ctx.etat);
    }
    const local = constater(ctx.base);
    // Écrire n'oblige à regarder le compte que s'il y a quelque chose à envoyer.
    if (declencheur === 'ecriture' && !local.modifie) return aJour(ctx.base);
    // Un autre onglet vient de synchroniser : cette relecture lui suffit.
    const age = ports.maintenant().getTime() - Date.parse(ctx.base.le);
    if (!local.modifie && age >= 0 && age < delais.fraicheur
      && (declencheur === 'ouverture' || declencheur === 'retour' || declencheur === 'reseau')) {
      return aJour(ctx.base);
    }
    const lu = await tirerFaits(ctx.config, ctx.session);
    if (lu.statut === 'erreur') return echec(lu, local.modifie);
    return appliquer(ctx, lu.valeur);
  }

  function synchroniser(declencheur: Declencheur): Promise<EtatSynchroAppareil> {
    if (!ports.pret()) { attendPret = declencheur; return Promise.resolve(dernier); }
    if (minuteurReessai !== null && declencheur !== 'reessai') { clearTimeout(minuteurReessai); minuteurReessai = null; }
    return ports.verrou(VERROU_SYNCHRO, () => cycle(declencheur));
  }

  async function trancher(
    choix: 'garder-ici' | 'prendre-compte', versionVue: number
  ): Promise<EtatSynchroAppareil> {
    return ports.verrou(VERROU_SYNCHRO, async () => {
      const ctx = await contexte();
      if (!ctx.ok) return publier(ctx.etat);
      const lu = await tirerFaits(ctx.config, ctx.session);
      if (lu.statut === 'erreur') return echec(lu, true);
      // Le compte a encore bougé depuis la question : la réponse portait sur
      // un état qui n'existe plus. On repose la question, sur le nouvel état.
      if (lu.valeur === null || lu.valeur.version !== versionVue) return appliquer(ctx, lu.valeur);
      if (choix === 'prendre-compte') return adopter(ctx.base, lu.valeur);
      // « Garder ce que j'ai ici » : l'envoi par-dessus, à la version qu'on
      // vient de lire — le serveur range celle qu'il remplace dans ses états
      // précédents. Le filtre de version vaut toujours : un troisième appareil
      // qui écrirait entre-temps serait refusé, pas écrasé.
      // La BASE reste celle d'avant : si l'envoi est refusé, la règle doit
      // revoir « les deux ont changé », pas croire le compte déjà rejoint.
      return envoyer(ctx, ports.faits(), lu.valeur.version, 0);
    });
  }

  /**
   * Quitter : la modification pas encore partie, envoyée au mieux, sans
   * attendre ni verrou ni lecture — la page n'en a pas le temps.
   *
   * Seulement pour des données : le vide et la démonstration demandent une
   * décision (la règle), qu'on ne peut pas prendre sans lire le compte. Si
   * le compte a bougé, le filtre de version fait refuser l'envoi, et la
   * prochaine ouverture posera la question. Si l'envoi passe mais que la
   * page meurt avant la réponse, la prochaine ouverture trouvera le compte en
   * avance et identique : la règle aligne, sans conflit.
   */
  function partir(): void {
    if (minuteurEcriture === null) return;
    clearTimeout(minuteurEcriture);
    minuteurEcriture = null;
    const config = ports.config();
    const session = lireSession(ports.stockage);
    if (config === null || session === null || !sessionValide(session) || !ports.pret()) return;
    const base = lireBase(ports.stockage, session.utilisateurId);
    if (base === null) return;
    const local = constater(base);
    if (!local.modifie || natureLocale(local.faits) !== 'donnees') return;
    const keepalive = JSON.stringify(local.faits).length < KEEPALIVE_MAX;
    void pousserFaits(config, session, local.faits, VERSION_SCHEMA, base.version, { keepalive }).then((r) => {
      // La page a survécu (onglet simplement caché) : on retient comme d'habitude.
      if (r.statut === 'ok') retenir(base, r.instantane.version, local.faits);
    });
  }

  function surChangement(quoi: 'faits' | 'pret'): void {
    if (quoi === 'pret') {
      const enAttente = attendPret;
      attendPret = null;
      if (enAttente !== null) void synchroniser(enAttente);
      return;
    }
    if (adoptionEnCours) return;
    modifieA = ports.maintenant();
    // « Envoi… » tout de suite : la pastille répond au geste, pas trois
    // secondes après. Le cycle dira ensuite ce qu'il en est vraiment.
    if (dernier.phase === 'a-jour') publier({ phase: 'envoi' });
    if (minuteurEcriture !== null) clearTimeout(minuteurEcriture);
    minuteurEcriture = setTimeout(() => {
      minuteurEcriture = null;
      void synchroniser('ecriture');
    }, delais.ecriture);
  }

  return {
    demarrer: () => {
      if (demarre) return;
      demarre = true;
      desabonner = ports.ecouter(surChangement);
      void synchroniser('ouverture');
    },
    arreter: () => {
      demarre = false;
      desabonner?.();
      desabonner = null;
      for (const m of [minuteurEcriture, minuteurReessai, minuteurSaisie]) if (m !== null) clearTimeout(m);
      minuteurEcriture = minuteurReessai = minuteurSaisie = null;
    },
    synchroniser,
    trancher,
    partir,
    surChangement
  };
}

/* ── Le navigateur ─────────────────────────────────────────────────────── */

/**
 * Un formulaire est-il ouvert, ou un champ en cours de saisie ?
 *
 * Une adoption remplace les faits : si elle tombait pendant qu'on remplit une
 * fiche, l'écran changerait sous les doigts — ou pire, l'enregistrement de la
 * fiche partirait sur un dossier qu'on n'a pas vu arriver. Les formulaires de
 * l'application s'ouvrent dans un volet modal (`Sheet`, `role="dialog"`) ;
 * les réglages se saisissent dans des champs. Les deux se voient d'ici, sans
 * que chaque écran ait à le déclarer.
 */
export function saisieEnCoursDans(doc: Document): boolean {
  if (doc.querySelector('[role="dialog"][aria-modal="true"]') !== null) return true;
  const actif = doc.activeElement;
  return actif instanceof HTMLElement && actif.matches(
    'textarea, select, [contenteditable="true"], '
    + 'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])'
  );
}

function stockageDuNavigateur(): StockageLocal | null {
  try {
    const s = window.localStorage;
    s.getItem('freel.synchro.appareil.v1');
    return s;
  } catch {
    return null;
  }
}

/**
 * Le dossier, tel que le magasin le tient : ce que le moteur lit, adopte, et
 * écoute.
 *
 * `pret` exige l'état « prêt », pas seulement « chargé » : en « sans
 * persistance », c'est peut-être qu'un onglet d'une version PLUS RÉCENTE a
 * écrit le disque (`reprendreDuDisque`) — envoyer d'ici raboterait ses
 * champs. Le prix : un stockage plein suspend aussi la synchronisation
 * automatique, alors qu'elle aurait mis la saisie à l'abri. L'alerte de
 * conservation le dit déjà, et l'envoi « dans un sens précis » de l'écran
 * Compte reste possible.
 */
export function portsDuMagasin(): Pick<PortsSynchro, 'faits' | 'pret' | 'adopter' | 'ecouter'> {
  return {
    faits: () => useFaits.getState().faits,
    pret: () => useFaits.getState().chargement.phase === 'pret',
    adopter: (brut) => useFaits.getState().adopterFaitsDistants(brut),
    ecouter: (rappel) => useFaits.subscribe((e, avant) => {
      if (e.chargement.phase === 'pret' && avant.chargement.phase !== 'pret') rappel('pret');
      else if (e.faits !== avant.faits && e.chargement.phase === 'pret') rappel('faits');
    })
  };
}

function portsDuNavigateur(stockage: StockageLocal): PortsSynchro {
  return {
    stockage,
    config: () => configEffective(stockage),
    ...portsDuMagasin(),
    verrou: verrouDuNavigateur,
    enLigne: () => navigator.onLine !== false,
    visible: () => document.visibilityState !== 'hidden',
    saisieEnCours: () => saisieEnCoursDans(document),
    maintenant: () => new Date(),
    publier: publierEtatSynchro
  };
}

let moteur: MoteurSynchro | null = null;
let stockageDuMoteur: StockageLocal | null = null;
const moteursDeGestes = new WeakMap<StockageLocal, MoteurSynchro>();

/**
 * Le moteur qui sert les gestes de l'écran Compte (« Synchroniser maintenant »,
 * trancher un « à choisir ») pour ce stockage : celui de l'onglet quand c'est
 * le sien, sinon un moteur sans écoutes. L'écran reçoit son stockage en
 * paramètre ; un moteur lu ailleurs lirait une autre session et une autre base
 * que celles que l'écran affiche.
 */
export function moteurPour(stockage: StockageLocal): MoteurSynchro {
  const m = moteurDuNavigateur();
  if (m !== null && stockageDuMoteur === stockage) return m;
  const connu = moteursDeGestes.get(stockage);
  if (connu !== undefined) return connu;
  // Il ne démarre jamais : ses écoutes doubleraient celles du moteur de
  // l'onglet, et ses cycles partiraient d'eux-mêmes sur une autre session.
  const cree: MoteurSynchro = { ...creerMoteur(portsDuNavigateur(stockage)), demarrer: () => undefined };
  moteursDeGestes.set(stockage, cree);
  return cree;
}

/** Le moteur de cet onglet, créé au premier appel. `null` sans stockage : rien à synchroniser. */
export function moteurDuNavigateur(): MoteurSynchro | null {
  if (moteur !== null) return moteur;
  const stockage = stockageDuNavigateur();
  if (stockage === null) return null;
  stockageDuMoteur = stockage;
  moteur = creerMoteur(portsDuNavigateur(stockage));
  const m = moteur;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') m.partir();
    else void m.synchroniser('retour');
  });
  window.addEventListener('pagehide', () => m.partir());
  window.addEventListener('online', () => { void m.synchroniser('reseau'); });
  return moteur;
}

/** Lance la synchronisation automatique de cet onglet. Appelée par la barre du haut, après le premier rendu. */
export function demarrerSynchroAutomatique(): void {
  moteurDuNavigateur()?.demarrer();
}
