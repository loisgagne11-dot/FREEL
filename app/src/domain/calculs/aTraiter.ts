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

import { joursEntre } from '../dates';
import {
  type DateISO, type Euros, type Mois, type TypeActivite,
  euros, moisDe
} from '../types';
import { resteAvantMajore } from '../bareme/tva';
import { plafondMicro } from '../bareme/plafonds';
import type { PeriodeBareme } from '../bareme/urssaf';

/** L'écran qui règle le sujet. Sert au badge de navigation et au lien. */
export type EcranCible =
  | 'pilote' | 'activite' | 'factures' | 'tresorerie' | 'obligations' | 'achats'
  | 'simulateurs' | 'reglages';

export type Gravite = 'retard' | 'a_faire' | 'information';

export interface SujetATraiter {
  readonly id: string;
  readonly ecran: EcranCible;
  readonly gravite: Gravite;
  /** Quantité concernée : 3 factures, 2 périodes… Toujours ≥ 1. */
  readonly nombre: number;
  /**
   * Ce que le sujet pèse au compteur de son écran : le nombre d'OBLIGATIONS
   * qu'il rassemble — quatre périodes à déclarer sont quatre choses à faire,
   * même dites en une ligne sur le Pilote. Absent : un sujet, une chose.
   *
   * Sans lui, le rail aurait dit « 1 » et le titre d'Obligations « quatre
   * choses à faire » pour le même compte : deux décomptes qui divergent au
   * premier cas (avis du 17/11, point 7).
   */
  readonly compte?: number;
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

/**
 * Une période URSSAF à déclarer, telle que les obligations la disent — close,
 * non déclarée. Ce module ne refait pas la règle : il la reçoit
 * (`selecteurs.obligations`), comme le Pilote et l'écran Obligations.
 */
export interface PeriodeATraiter {
  readonly id: string;
  readonly libelle: string;
  readonly premierMois: Mois;
  readonly limite: DateISO;
  readonly encaisse: Euros;
  /** Ce qu'il faut payer en la déclarant ; `null` quand un taux manque. */
  readonly montant: Euros | null;
  readonly enRetard: boolean;
}

export interface EntreeATraiter {
  readonly aujourdhui: DateISO;
  readonly typeActivite: TypeActivite;
  readonly recettes: readonly RecetteVue[];
  /** Les périodes URSSAF closes et non déclarées, la plus ancienne d'abord. */
  readonly periodesADeclarer?: readonly PeriodeATraiter[];
  /** Date exacte du début : le plafond du micro est proratisé au jour près l'année de création. */
  readonly debutActiviteLe?: DateISO | null;
  /** Mois depuis lequel la TVA est due d'après les seuils (`null` : jamais, ou inconnu). */
  readonly tvaDueDepuis?: Mois | null;
  /** Factures émises depuis ce mois sans TVA, à un client en France, non annulées. */
  readonly facturesSansTva?: number;
  /**
   * Le barème de cotisations effectivement appliqué, périodes saisies par
   * l'utilisateur comprises. L'alerte de fraîcheur doit porter sur la table
   * réellement utilisée : sans cela, ajouter une période à jour laisserait
   * l'alerte allumée, et l'utilisateur cesserait de la croire.
   *
   * Obligatoire : son défaut était le barème de la SSI, celui d'un affilié
   * Cipav n'aurait jamais été jugé.
   */
  readonly periodesUrssaf: readonly PeriodeBareme[];
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
    /** `null` quand le jour n'est pas connu : aucun « dans N jours » ne s'invente alors. */
    readonly date: DateISO | null;
    /**
     * La gravité, quand l'appelant la sait : une obligation porte son état
     * (`calculs/obligations`), et le recalculer ici depuis la date ferait
     * deux règles pour une. Absente, elle se déduit de la date.
     */
    readonly gravite?: Gravite;
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
    /**
     * Aucun fait ne dit l'obligation remplie (facturation électronique) : sa
     * date passée, elle est « en vigueur », pas « en retard » — l'application
     * ne sait pas si l'on est prêt. La CFE, elle, se règle en saisissant
     * l'échéance : non saisie après la date, elle est bien en retard.
     */
    readonly sansSuivi?: boolean;
  }[];
  /**
   * Les missions signées dont la fin tombe dans leur préavis, sans
   * reconduction (lot 48) : déjà filtrées par `calculs/carnetDeCommandes`,
   * la seule règle du préavis — ce module ne la refait pas.
   */
  readonly finsAnnoncees?: readonly {
    readonly missionId: string;
    readonly nom: string;
    readonly echeance: DateISO;
    readonly jours: number;
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

/**
 * Décale une date d'un nombre de jours.
 *
 * Exportée parce que l'échéance d'une facture se calcule aussi hors de cette
 * requête — au livre des recettes, pour marquer les retards. Deux copies de
 * cette arithmétique finiraient par diverger d'un jour, et un jour décide si
 * une facture est en retard ou non.
 */
export function ajouterJours(d: DateISO, n: number): DateISO {
  // Tout en UTC. La version précédente lisait la date en UTC, ajoutait les
  // jours en heure LOCALE, puis relisait en UTC : à Paris, au passage à
  // l'heure d'été, « 29 mars + 1 jour » rendait le 29 mars. Les tests, eux,
  // tournent en UTC, et ne pouvaient pas le voir.
  const date = new Date(`${d}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
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
      ecran: 'factures',
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
      ecran: 'obligations',
      gravite: 'retard',
      nombre: e.desEnRetard.length,
      compte: e.desEnRetard.length,
      donnees: { depuis: plusAncien?.mois ?? null, amende }
    });
  }

  /* ---------- périodes à déclarer ---------- */
  //
  // Une période close n'est pas en retard le lendemain de sa clôture : elle se
  // déclare jusqu'au dernier jour du mois suivant. Le Pilote l'annonçait
  // « en retard » dès le 1er juillet pour un trimestre dû le 31 — l'alerte
  // rouge la plus fréquente de l'application était fausse un mois sur trois.
  // « À faire » avant la date limite, « en retard » après — l'état vient des
  // obligations (`etatEtape`), la seule règle.
  const aDeclarer = e.periodesADeclarer ?? [];
  const premiere = aDeclarer[0];
  if (premiere !== undefined) {
    sujets.push({
      id: 'periodes-a-declarer',
      ecran: 'obligations',
      gravite: aDeclarer.some((p) => p.enRetard) ? 'retard' : 'a_faire',
      nombre: aDeclarer.length,
      compte: aDeclarer.length,
      donnees: {
        depuis: premiere.premierMois,
        periode: premiere.id,
        libelle: premiere.libelle,
        limite: premiere.limite,
        base: premiere.encaisse,
        montant: premiere.montant
      }
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
      ecran: 'obligations',
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
  const tvaDue = e.tvaDueDepuis ?? null;
  if (tvaDue !== null && tvaDue <= moisCourant) {
    // La TVA est due : les factures la portent désormais d'elles-mêmes. Il ne
    // reste à traiter que celles émises sans elle depuis la date — réputées
    // TTC. « Seuil franchi », seul, ne disait pas quoi faire.
    if ((e.facturesSansTva ?? 0) > 0) {
      sujets.push({
        id: 'tva-a-regulariser',
        ecran: 'factures',
        gravite: 'retard',
        nombre: e.facturesSansTva ?? 0,
        donnees: { depuis: tvaDue }
      });
    }
  } else if (resteTva.statut !== 'refuse') {
    const seuilMajore = caAnnee + resteTva.valeur;
    if (seuilMajore > 0 && caAnnee >= seuilMajore * seuils.partSeuilTva) {
      const franchi = resteTva.valeur <= 0;
      sujets.push({
        id: 'seuil-tva',
        ecran: 'tresorerie',
        gravite: franchi ? 'retard' : 'a_faire',
        nombre: 1,
        donnees: { franchi, reste: resteTva.valeur }
      });
    }
  }

  /* ---------- plafond du régime micro ---------- */
  const plafond = plafondMicro(moisCourant, e.typeActivite, e.debutActiviteLe ?? null);
  if (plafond.statut !== 'refuse' && plafond.valeur > 0
      && caAnnee >= plafond.valeur * seuils.partPlafond) {
    sujets.push({
      id: 'plafond-micro',
      ecran: 'tresorerie',
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
      ecran: 'obligations',
      gravite: 'a_faire',
      nombre: sansMention.length,
      donnees: {}
    });
  }

  /* ---------- fraîcheur du barème ---------- */
  const verifieLe = fraicheurBaremeLaPlusAncienne(e.periodesUrssaf);
  if (verifieLe !== null && ajouterMois(verifieLe, seuils.moisFraicheurBareme) < moisCourant) {
    sujets.push({
      id: 'bareme-a-verifier',
      ecran: 'reglages',
      gravite: 'a_faire',
      nombre: 1,
      donnees: { verifieLe }
    });
  }

  /* ---------- échéances réglementaires ---------- */
  for (const ech of e.echeancesReglementaires) {
    const jours = ech.date === null ? null : joursEntre(e.aujourdhui, ech.date);
    sujets.push({
      id: `echeance-${ech.id}`,
      ecran: ech.ecran ?? 'obligations',
      gravite: ech.gravite ?? (jours === null ? 'a_faire' : jours < 0
        ? (ech.sansSuivi === true ? 'a_faire' : 'retard')
        : jours <= 30 ? 'a_faire' : 'information'),
      nombre: 1,
      /* Ces trois textes viennent de l'APPELANT, pas d'ici : les recopier
         tels quels n'ajoute aucune phrase au paquet d'entrée. */
      donnees: {
        jours,
        enVigueur: ech.sansSuivi === true && jours !== null && jours < 0,
        intitule: ech.intitule,
        contexte: ech.contexte ?? null,
        action: ech.action ?? null
      }
    });
  }

  /* ---------- fins de mission annoncées ---------- */
  //
  // Une suite se négocie avant la fin, pas après : au préavis de la mission
  // (soixante jours par défaut), c'est une chose à faire — en parler au
  // client, ou en chercher une autre. Elle sort d'elle-même quand la fin est
  // prolongée, la mission arrêtée ou la reconduction dite : la liste reçue ne
  // la porte plus.
  for (const f of e.finsAnnoncees ?? []) {
    sujets.push({
      id: `fin-mission-${f.missionId}`,
      ecran: 'activite',
      gravite: 'a_faire',
      nombre: 1,
      donnees: { missionId: f.missionId, mission: f.nom, echeance: f.echeance, jours: f.jours }
    });
  }

  const rang: Record<Gravite, number> = { retard: 0, a_faire: 1, information: 2 };
  return [...sujets].sort((a, b) => rang[a.gravite] - rang[b.gravite]);
}

/**
 * Compteurs par écran : les pastilles du rail, et le titre d'Obligations
 * (« Deux choses à faire »), qui lisent CETTE fonction et nulle autre.
 *
 * Le badge porte le nombre de choses à faire, pas la somme des quantités :
 * « 2 » sur Factures signifie deux sujets, pas deux factures. Une obligation
 * est une chose : un sujet qui en rassemble plusieurs pèse leur nombre
 * (`compte`).
 *
 * Une information ne compte pas : « la CFE tombe dans soixante jours » n'est
 * pas une chose à faire aujourd'hui, et un titre qui dirait « une chose à
 * faire » au-dessus d'une liste où rien n'est à faire se contredirait.
 */
export function compteursParEcran(
  sujets: readonly SujetATraiter[]
): Readonly<Partial<Record<EcranCible, number>>> {
  const compteurs: Partial<Record<EcranCible, number>> = {};
  for (const s of sujets) {
    if (s.gravite === 'information') continue;
    compteurs[s.ecran] = (compteurs[s.ecran] ?? 0) + (s.compte ?? 1);
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
