/**
 * « À traiter » — la requête qui alimente les décisions du jour.
 *
 * Dans le prototype de design, cette liste était une constante du shell : six
 * sujets écrits en dur. L'audit l'a qualifiée de bloquante, parce que l'écran
 * Pilote — la raison d'être de la refonte — n'affichait rien de réel.
 *
 * Ce module est la vraie requête. Il ne connaît ni React, ni le magasin, ni le
 * stockage : il reçoit les faits dont il a besoin et rend une liste de sujets.
 * Chaque sujet dit **quoi**, **combien**, **où** et **pourquoi maintenant**.
 *
 * Deux principes de conception :
 *
 *  1. **Rien n'est inventé.** Un sujet n'apparaît que si un fait le justifie.
 *     Pas de sujet décoratif, pas de compteur qui rassure.
 *  2. **L'urgence est datée, pas ressentie.** La gravité découle d'un retard
 *     réel ou d'une échéance réelle, jamais d'une appréciation.
 */

import {
  type DateISO, type Euros, type Mois, type TypeActivite,
  euros, moisDe
} from '../types';
import { resteAvantMajore } from '../bareme/tva';
import { plafondMicro } from '../bareme/plafonds';
import { PERIODES_URSSAF, type PeriodeBareme } from '../bareme/urssaf';

/** L'écran qui règle le sujet. Sert au badge de navigation et au lien. */
export type EcranCible = 'pilote' | 'activite' | 'argent' | 'achats' | 'outils' | 'config';

export type Gravite = 'retard' | 'a_faire' | 'information';

export interface SujetATraiter {
  readonly id: string;
  readonly ecran: EcranCible;
  readonly gravite: Gravite;
  /** Quantité concernée : 3 factures, 2 périodes… Toujours ≥ 1. */
  readonly nombre: number;
  /**
   * Les chiffres dont la mise en mots a besoin — rien de plus.
   *
   * ───────────────────────────────────────────────────────────────────────
   * DÉTECTER N'EST PAS FORMULER
   * ───────────────────────────────────────────────────────────────────────
   *
   * Ce module portait ses phrases : dix mille huit cent cinquante-sept octets
   * de français, tirés dans le paquet d'entrée par la pastille de la barre du
   * haut. Or la pastille n'a besoin que d'un NOMBRE et d'une GRAVITÉ ; les
   * intitulés, les contextes et les libellés d'action ne servent qu'au panneau
   * — et ce panneau s'ouvre au clic, sa coquille étant déjà chargée à la
   * demande.
   *
   * La coupure est celle déjà faite deux fois dans ce projet : ce qui CALCULE
   * reste, ce qui NOMME part avec l'écran qui l'affiche. Voir
   * `aTraiter.libelles`.
   */
  readonly donnees: DonneesSujet;
}

/** Ce qu'un sujet transporte pour être mis en mots. */
export type DonneesSujet = Readonly<Record<string, string | number | boolean | null>>;

/** Une recette, vue par cette requête. */
export interface RecetteVue {
  readonly id: string;
  readonly montant: Euros;
  readonly emiseLe: DateISO | null;
  readonly encaisseeLe: DateISO | null;
  readonly modeReglement: string | null;
  readonly clientNom: string;
  /**
   * L'échéance imprimée sur la facture, ou `null` si elle n'est pas émise.
   *
   * Une DATE et non un délai : la recalculer ici depuis le délai du client
   * ferait changer de réponse à « cette facture était-elle en retard ? » dès
   * qu'on modifie les conditions du client. Le compteur de retards changerait
   * avec, rétroactivement.
   */
  readonly echeanceLe: DateISO | null;
}

export interface EntreeATraiter {
  readonly aujourdhui: DateISO;
  readonly typeActivite: TypeActivite;
  readonly recettes: readonly RecetteVue[];
  readonly periodesDeclarees: readonly Mois[];
  /** Périodicité déclarative, qui détermine ce qu'est « une période ». */
  readonly periodicite: 'mensuel' | 'trimestriel';
  /** Mois de début d'activité : rien n'est dû avant. */
  readonly debutActivite: Mois | null;
  /**
   * Le barème de cotisations effectivement appliqué, périodes saisies par
   * l'utilisateur comprises. L'alerte de fraîcheur doit porter sur la table
   * réellement utilisée : sans cela, ajouter une période à jour laisserait
   * l'alerte allumée, et l'utilisateur cesserait de la croire.
   */
  readonly periodesUrssaf?: readonly PeriodeBareme[];
  /**
   * Déclarations européennes de services dont la date limite est passée.
   *
   * Calculées à part (`calculs/des`) et passées ici : cette requête assemble
   * les sujets, elle ne refait pas les calculs des autres modules.
   */
  readonly desEnRetard?: readonly { readonly mois: Mois }[];
  /**
   * Nombre d'échéances saisies, toutes natures et tous états confondus.
   *
   * Sert à détecter l'omission : quelqu'un qui encaisse depuis des mois sans
   * avoir jamais enregistré un appel URSSAF n'a pas « zéro cotisation », il a
   * oublié de les saisir — et son disponible est surestimé d'autant. C'est
   * l'erreur qui va dans le sens dangereux, celle qui invite à se verser de
   * l'argent déjà dû.
   */
  readonly echeancesSaisies?: number;
  /**
   * Échéances réglementaires, déjà filtrées sur leur préavis.
   *
   * Deux familles y cohabitent : celles à date fixe, qui tombent le même jour
   * pour tout le monde, et celles qui découlent de la situation — la CFE, dont
   * l'année de création décale les obligations. Le sujet ne fait pas la
   * différence : dans les deux cas, une date approche et il y a quelque chose à
   * faire.
   */
  readonly echeancesReglementaires: readonly {
    readonly id: string;
    readonly intitule: string;
    readonly date: DateISO;
    /**
     * L'écran qui règle le sujet, et l'action qui l'y attend.
     *
     * Optionnels, parce que la plupart de ces obligations ne demandent que de
     * se préparer. Mais une CFE non provisionnée se règle en saisissant une
     * échéance dans Argent, et l'envoyer sur Config serait l'envoyer nulle
     * part.
     */
    readonly ecran?: EcranCible;
    readonly action?: string;
    /** Ce qui rend la date urgente, quand elle ne parle pas d'elle-même. */
    readonly contexte?: string;
  }[];
}

export interface SeuilsAlerte {
  /** Part du seuil majoré de TVA au-delà de laquelle on prévient. */
  readonly partSeuilTva: number;
  /** Part du plafond micro au-delà de laquelle on prévient. */
  readonly partPlafond: number;
  /** Ancienneté maximale d'une vérification de barème, en mois. */
  readonly moisFraicheurBareme: number;
}

/**
 * Seuils par défaut.
 *
 * 80 % pour la TVA : il reste alors de la marge pour agir — facturer plus tard,
 * ou se préparer à collecter. Prévenir à 95 % serait prévenir trop tard, la
 * facturation d'un seul mois pouvant franchir l'écart.
 *
 * Six mois pour la fraîcheur du barème : les taux changent au 1er janvier et,
 * depuis 2024, en cours d'année. Une vérification plus ancienne qu'un semestre
 * peut avoir manqué une bascule.
 */
export const SEUILS_PAR_DEFAUT: SeuilsAlerte = {
  partSeuilTva: 0.8,
  partPlafond: 0.85,
  moisFraicheurBareme: 6
};

const joursEntre = (a: DateISO, b: DateISO): number =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

/**
 * Décale une date d'un nombre de jours.
 *
 * Exportée parce que l'échéance d'une facture se calcule aussi hors de cette
 * requête — au livre des recettes, pour marquer les retards. Deux copies de
 * cette arithmétique finiraient par diverger d'un jour, et un jour décide si
 * une facture est en retard ou non.
 */
export function ajouterJours(d: DateISO, n: number): DateISO {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date.toISOString().slice(0, 10) as DateISO;
}

function ajouterMois(m: Mois, n: number): Mois {
  const [a, mm] = m.split('-');
  const total = Number(a) * 12 + (Number(mm) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}` as Mois;
}

/* `pluriel` et `moisLisible` vivaient ici. Ils sont partis dans
   `aTraiter.libelles` avec les phrases qu'ils servaient : ce module ne produit
   plus de prose, seulement des chiffres et des gravités. */

/**
 * Les périodes déclaratives échues et non déclarées, alors que des recettes y
 * ont été encaissées.
 *
 * On ne réclame une déclaration que si la période est TERMINÉE : réclamer la
 * déclaration du mois en cours serait un faux positif quotidien.
 */
function periodesADeclarer(e: EntreeATraiter): readonly Mois[] {
  const moisCourant = moisDe(e.aujourdhui);
  const declarees = new Set(e.periodesDeclarees);

  // Les mois où de l'argent est entré. Une période sans recette n'est pas
  // pour autant sans obligation — la déclaration à zéro est due — mais on ne
  // peut pas la réclamer sans connaître le début d'activité.
  const moisAvecRecettes = new Set(
    e.recettes
      .filter((r) => r.encaisseeLe !== null)
      .map((r) => moisDe(r.encaisseeLe as DateISO))
  );

  const candidats = new Set<Mois>(moisAvecRecettes);
  if (e.debutActivite !== null) {
    // Déclaration à zéro incluse : l'obligation existe même sans recette.
    let m = e.debutActivite;
    while (m < moisCourant) {
      candidats.add(m);
      m = ajouterMois(m, 1);
    }
  }

  const echues = [...candidats].filter((m) => m < moisCourant && !declarees.has(m));

  if (e.periodicite === 'mensuel') return echues.sort();

  // En trimestriel, une période est un trimestre : on ne réclame que les
  // trimestres entièrement échus, et on les représente par leur premier mois.
  const trimestres = new Set<Mois>();
  for (const m of echues) {
    const [a, mm] = m.split('-');
    const premierMoisTrimestre = Math.floor((Number(mm) - 1) / 3) * 3 + 1;
    const debut = `${a}-${String(premierMoisTrimestre).padStart(2, '0')}` as Mois;
    // Le trimestre doit être clos : son dernier mois est révolu.
    if (ajouterMois(debut, 2) < moisCourant) trimestres.add(debut);
  }
  return [...trimestres].sort();
}

/** Le mois de la dernière vérification de barème la plus ancienne. */
function fraicheurBaremeLaPlusAncienne(
  periodes: readonly PeriodeBareme[]
): Mois | null {
  const dates = periodes.map((p) => p.verifieLe).sort();
  const plusAncienne = dates[0];
  return plusAncienne === undefined ? null : moisDe(plusAncienne);
}

/**
 * Construit la liste des sujets à traiter.
 *
 * L'ordre du retour est celui de la gravité puis de l'ancienneté : ce qui est
 * en retard d'abord, ce qui informe en dernier.
 */
export function sujetsATraiter(
  e: EntreeATraiter,
  seuils: SeuilsAlerte = SEUILS_PAR_DEFAUT
): readonly SujetATraiter[] {
  const sujets: SujetATraiter[] = [];
  const moisCourant = moisDe(e.aujourdhui);

  /* ---------- factures en retard de paiement ---------- */
  const enRetard = e.recettes.filter((r) => {
    if (r.encaisseeLe !== null || r.emiseLe === null || r.echeanceLe === null) return false;
    return r.echeanceLe < e.aujourdhui;
  });
  if (enRetard.length > 0) {
    const total = euros(enRetard.reduce<number>((s, r) => s + r.montant, 0));
    const plusAncienne = enRetard
      .map((r) => joursEntre(r.echeanceLe as DateISO, e.aujourdhui))
      .reduce((a, b) => Math.max(a, b), 0);
    sujets.push({
      id: 'factures-en-retard',
      ecran: 'activite',
      gravite: 'retard',
      nombre: enRetard.length,
      donnees: { total, plusAncienne }
    });
  }

  /* ---------- déclarations européennes de services ---------- */
  //
  // La sanction est forfaitaire et par déclaration : 750 € qu'on ait vendu
  // 50 € ou 50 000 €. C'est ce qui justifie de la placer parmi les retards
  // plutôt que dans les informations — le montant en jeu ne dépend pas du
  // chiffre d'affaires, mais du nombre de mois oubliés.
  if (e.desEnRetard !== undefined && e.desEnRetard.length > 0) {
    const plusAncien = e.desEnRetard[0];
    const amende = euros(e.desEnRetard.length * 750);
    sujets.push({
      id: 'des-en-retard',
      ecran: 'argent',
      gravite: 'retard',
      nombre: e.desEnRetard.length,
      donnees: { depuis: plusAncien?.mois ?? null, amende }
    });
  }

  /* ---------- périodes à déclarer ---------- */
  const aDeclarer = periodesADeclarer(e);
  if (aDeclarer.length > 0) {
    const premiere = aDeclarer[0] as Mois;
    sujets.push({
      id: 'periodes-a-declarer',
      ecran: 'argent',
      gravite: 'retard',
      nombre: aDeclarer.length,
      donnees: { depuis: premiere }
    });
  }

  /* ---------- aucune échéance jamais saisie ---------- */
  //
  // Une omission ne se voit pas : elle produit un chiffre plausible, juste
  // trop élevé. Le seuil est volontairement bas — trois mois d'encaissements
  // sans le moindre appel enregistré n'arrive pas par hasard — et le sujet
  // disparaît dès la première échéance saisie, même payée.
  const moisAvecEncaissement = new Set(
    e.recettes
      .filter((r) => r.encaisseeLe !== null)
      .map((r) => (r.encaisseeLe as DateISO).slice(0, 7))
  );
  if ((e.echeancesSaisies ?? 0) === 0 && moisAvecEncaissement.size >= 3) {
    sujets.push({
      id: 'aucune-echeance',
      ecran: 'argent',
      gravite: 'retard',
      nombre: 1,
      donnees: {}
    });
  }

  /* ---------- seuil de TVA ---------- */
  const annee = Number(moisCourant.slice(0, 4));
  const caAnnee = euros(
    e.recettes
      .filter((r) => r.encaisseeLe !== null && r.encaisseeLe.startsWith(String(annee)))
      .reduce<number>((s, r) => s + r.montant, 0)
  );
  const resteTva = resteAvantMajore(caAnnee, moisCourant, e.typeActivite);
  if (resteTva.statut !== 'refuse') {
    const seuilMajore = caAnnee + resteTva.valeur;
    if (seuilMajore > 0 && caAnnee >= seuilMajore * seuils.partSeuilTva) {
      const franchi = resteTva.valeur <= 0;
      sujets.push({
        id: 'seuil-tva',
        ecran: 'argent',
        gravite: franchi ? 'retard' : 'a_faire',
        nombre: 1,
        donnees: { franchi, reste: resteTva.valeur }
      });
    }
  }

  /* ---------- plafond du régime micro ---------- */
  const plafond = plafondMicro(moisCourant, e.typeActivite);
  if (plafond.statut !== 'refuse' && plafond.valeur > 0
      && caAnnee >= plafond.valeur * seuils.partPlafond) {
    sujets.push({
      id: 'plafond-micro',
      ecran: 'argent',
      gravite: caAnnee > plafond.valeur ? 'retard' : 'a_faire',
      nombre: 1,
      donnees: { depasse: caAnnee > plafond.valeur, ca: caAnnee, plafond: plafond.valeur }
    });
  }

  /* ---------- livre des recettes incomplet ---------- */
  // Mentions obligatoires : sans elles, le registre peut être rejeté.
  const sansMention = e.recettes.filter(
    (r) => r.encaisseeLe !== null && (r.modeReglement === null || r.modeReglement === '')
  );
  if (sansMention.length > 0) {
    sujets.push({
      id: 'livre-recettes-incomplet',
      ecran: 'argent',
      gravite: 'a_faire',
      nombre: sansMention.length,
      donnees: {}
    });
  }

  /* ---------- fraîcheur du barème ---------- */
  const verifieLe = fraicheurBaremeLaPlusAncienne(e.periodesUrssaf ?? PERIODES_URSSAF);
  if (verifieLe !== null && ajouterMois(verifieLe, seuils.moisFraicheurBareme) < moisCourant) {
    sujets.push({
      id: 'bareme-a-verifier',
      ecran: 'config',
      gravite: 'a_faire',
      nombre: 1,
      donnees: { verifieLe }
    });
  }

  /* ---------- échéances réglementaires ---------- */
  for (const ech of e.echeancesReglementaires) {
    const jours = joursEntre(e.aujourdhui, ech.date);
    sujets.push({
      id: `echeance-${ech.id}`,
      ecran: ech.ecran ?? 'config',
      gravite: jours < 0 ? 'retard' : jours <= 30 ? 'a_faire' : 'information',
      nombre: 1,
      /* Ces trois textes viennent de l'APPELANT, pas d'ici : les recopier
         tels quels n'ajoute aucune phrase au paquet d'entrée. */
      donnees: {
        jours,
        intitule: ech.intitule,
        contexte: ech.contexte ?? null,
        action: ech.action ?? null
      }
    });
  }

  const rang: Record<Gravite, number> = { retard: 0, a_faire: 1, information: 2 };
  return [...sujets].sort((a, b) => rang[a.gravite] - rang[b.gravite]);
}

/**
 * Compteurs par écran, pour les badges de navigation.
 *
 * Le badge porte le nombre de SUJETS, pas la somme des quantités : « 2 » sur
 * Argent signifie deux choses à régler, pas deux factures.
 */
export function compteursParEcran(
  sujets: readonly SujetATraiter[]
): Readonly<Partial<Record<EcranCible, number>>> {
  const compteurs: Partial<Record<EcranCible, number>> = {};
  for (const s of sujets) {
    compteurs[s.ecran] = (compteurs[s.ecran] ?? 0) + 1;
  }
  return compteurs;
}

/**
 * Les sujets d'un écran donné. Sur Pilote, poste de pilotage, on montre TOUT —
 * c'est la règle du design, et c'est ce qui fait de cet écran la décision du
 * jour plutôt qu'un écran parmi six.
 */
export function sujetsDeLEcran(
  sujets: readonly SujetATraiter[],
  ecran: EcranCible
): readonly SujetATraiter[] {
  return ecran === 'pilote' ? sujets : sujets.filter((s) => s.ecran === ecran);
}
