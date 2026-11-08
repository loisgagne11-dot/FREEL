import type { SujetATraiter } from './aTraiter';

/**
 * Comment un sujet « à traiter » se DIT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS DANS `aTraiter.ts`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La détection vit dans le paquet d'entrée : la pastille de la barre du haut
 * l'appelle au premier rendu, et elle n'a besoin que d'un nombre et d'une
 * gravité. Les phrases, elles, ne servent qu'au panneau — qui s'ouvre au clic,
 * et dont la coquille est déjà chargée à la demande.
 *
 * Ces dix kilo-octets de français voyageaient donc chez tout le monde, à chaque
 * ouverture, pour un panneau que la plupart des visites n'ouvrent jamais. C'est
 * la même coupure que celle déjà faite deux fois dans ce projet — les libellés
 * de délai de paiement séparés du calcul d'échéance, le barème sorti de
 * Config : ce qui CALCULE reste, ce qui NOMME part avec l'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CONTRAT ENTRE LES DEUX
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `SujetATraiter.donnees` transporte les chiffres, jamais les mots. Un sujet
 * dont l'identifiant n'est pas reconnu ici rend un intitulé neutre plutôt que
 * de lever : un panneau amputé d'une ligne vaut mieux qu'un écran blanc, et
 * l'absence se voit — c'est ce qui la fera corriger.
 */

export interface SujetFormule {
  /** Intitulé court, affiché en liste. */
  readonly intitule: string;
  /** Pourquoi ce sujet est là maintenant. Une phrase. */
  readonly contexte: string;
  /** Libellé de l'action à mener. */
  readonly action: string;
  /**
   * Ce que l'application a déjà préparé pour la mener — la ligne
   * « levier → » du handoff. `null` quand l'action suffit à le dire.
   *
   * Un levier ne promet que ce qui EXISTE : chacun a été vérifié contre la
   * fonction qu'il annonce (relance à trois tons, montants de l'échéancier,
   * lignes par client de la déclaration européenne). Un levier qui promet une
   * aide absente est un manque silencieux.
   */
  readonly levier: string | null;
}

/** Accorde un nom au nombre, en préfixant la quantité. */
function pluriel(n: number, singulier: string, plurielMot: string): string {
  return `${n} ${n > 1 ? plurielMot : singulier}`;
}

/** « 2026-03 » → « mars 2026 ». */
/** « 31 juillet » : la date limite d'une déclaration, sans l'année. */
function jourLisible(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', timeZone: 'UTC'
  });
}

const euro = (n: number): string =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)} €`;

function moisLisible(m: string): string {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric', timeZone: 'UTC'
  });
}

const texte = (v: unknown): string => (typeof v === 'string' ? v : '');
const nombre = (v: unknown): number => (typeof v === 'number' ? v : 0);

/**
 * Met un sujet en mots.
 *
 * Les échéances réglementaires font exception : leurs trois textes viennent de
 * l'appelant, qui les tient de la table des obligations. Les réécrire ici
 * aurait fabriqué une seconde formulation de la même échéance.
 */
export function formuler(sujet: SujetATraiter): SujetFormule {
  const d = sujet.donnees;

  if (sujet.id.startsWith('echeance-')) {
    const jours = nombre(d['jours']);
    const delai = jours >= 0
      ? `Dans ${pluriel(jours, 'jour', 'jours')}.`
      : d['enVigueur'] === true
        ? `En vigueur depuis ${pluriel(-jours, 'jour', 'jours')}.`
        : `Échéance dépassée depuis ${pluriel(-jours, 'jour', 'jours')}.`;
    const complement = texte(d['contexte']);
    return {
      intitule: texte(d['intitule']),
      contexte: complement === '' ? delai : `${delai} ${complement}`,
      action: texte(d['action']) === '' ? 'Se préparer' : texte(d['action']),
      levier: null
    };
  }

  switch (sujet.id) {
    case 'factures-en-retard':
      return {
        intitule: pluriel(sujet.nombre, 'facture en retard', 'factures en retard'),
        contexte: `${euro(nombre(d['total']))} impayés, dont `
          + `${pluriel(nombre(d['plusAncienne']), 'jour', 'jours')} de retard `
          + 'sur la plus ancienne.',
        action: 'Relancer',
        levier: 'la relance est rédigée au ton qui convient — rappel, ferme, puis mise en '
          + 'demeure ; tu n’as qu’à l’envoyer'
      };

    /* La sanction est forfaitaire et par déclaration : 750 € qu'on ait vendu
       50 € ou 50 000 €. C'est ce qui justifie de la ranger parmi les retards
       plutôt que dans les informations. */
    case 'des-en-retard': {
      const depuis = texte(d['depuis']);
      return {
        intitule: pluriel(
          sujet.nombre,
          'déclaration européenne de services en retard',
          'déclarations européennes de services en retard'
        ),
        contexte: depuis === '' ? '' :
          `Depuis ${moisLisible(depuis)}. L’amende est forfaitaire : `
          + `${euro(nombre(d['amende']))} encourus. La franchise en base n’en dispense pas.`,
        action: 'Déposer',
        levier: 'les lignes par client sont prêtes dans Argent › Déclaration européenne de services'
      };
    }

    /* Une seule période : la ligne du handoff — laquelle, jusqu'à quand, sur
       quelle base, pour combien. Plusieurs : leur nombre et depuis quand ; le
       détail de chacune est dans l'échéancier. Le montant manque quand un taux
       manque : « à vérifier », jamais un montant calculé à taux zéro. */
    case 'periodes-a-declarer': {
      const enRetard = sujet.gravite === 'retard';
      const levier = 'les montants à recopier sur le site de l’URSSAF sont prêts dans '
        + 'l’échéancier';
      if (sujet.nombre > 1) {
        return {
          intitule: pluriel(sujet.nombre, 'période à déclarer', 'périodes à déclarer'),
          contexte: `Depuis ${moisLisible(texte(d['depuis']))}. Tant qu’une période n’est `
            + 'pas déclarée, sa charge reste provisionnée et le versable est minoré '
            + 'd’autant.',
          action: 'Déclarer',
          levier
        };
      }
      const limite = jourLisible(texte(d['limite']));
      const montant = typeof d['montant'] === 'number' ? euro(d['montant']) : 'à vérifier';
      return {
        intitule: `Déclarer l’URSSAF ${texte(d['libelle'])} — `
          + (enRetard ? `date limite dépassée (${limite})` : `avant le ${limite}`),
        contexte: `Base encaissée ${euro(nombre(d['base']))} · à payer ${montant}.`,
        action: 'Déclarer',
        levier
      };
    }

    /* Une omission ne se voit pas : elle produit un chiffre plausible, juste
       trop élevé. D'où l'insistance sur le SENS de l'erreur. */
    case 'aucune-echeance':
      return {
        intitule: 'Aucune échéance enregistrée',
        contexte: 'Tu encaisses depuis plusieurs mois sans qu’aucun appel de '
          + 'cotisations, avis d’impôt ou CFE ne soit saisi. Tant qu’ils manquent, '
          + 'le disponible et le versable sont SURESTIMÉS — c’est le sens qui coûte cher.',
        action: 'Saisir mes échéances',
        levier: 'saisir un avis prend une minute, et rend le versable juste'
      };

    case 'tva-a-regulariser':
      return {
        intitule: pluriel(sujet.nombre, 'facture émise sans TVA', 'factures émises sans TVA'),
        contexte: `La TVA est due depuis ${moisLisible(texte(d['depuis']))} : ces factures `
          + 'sont réputées TTC, et la TVA est à reverser sur ce que tu as encaissé. Pour '
          + 'régulariser, annule-les par un avoir et réémets-les avec la TVA. Les '
          + 'nouvelles factures la portent déjà.',
        action: 'Voir les factures',
        levier: 'un avoir puis une nouvelle facture, depuis le facturier'
      };

    case 'seuil-tva': {
      const franchi = d['franchi'] === true;
      return {
        intitule: franchi ? 'Seuil majoré de TVA franchi' : 'Seuil majoré de TVA proche',
        contexte: franchi
          ? 'La TVA est due immédiatement. Une facture émise sans TVA après le '
            + 'franchissement est réputée TTC : la part de TVA est à reverser sans '
            + 'avoir pu être répercutée au client.'
          : `Il reste ${euro(nombre(d['reste']))} facturables avant assujettissement immédiat.`,
        action: franchi ? 'Régulariser' : 'Voir le détail',
        /* En franchise, on ne facture pas la TVA de sa propre initiative : il
           faut opter (un engagement) ou franchir le seuil. Et en BNC, c'est
           l'ENCAISSEMENT qui compte, pas la facture. */
        levier: franchi
          ? null
          : 'repousser un encaissement à l’an prochain, ou opter pour la TVA — un '
            + 'engagement, à voir avec ton expert-comptable'
      };
    }

    case 'plafond-micro':
      return {
        intitule: d['depasse'] === true
          ? 'Plafond du régime micro dépassé'
          : 'Plafond du régime micro proche',
        contexte: `${euro(nombre(d['ca']))} encaissés sur ${euro(nombre(d['plafond']))} de plafond.`,
        action: 'Voir le détail',
        levier: 'un seul dépassement ne te sort pas du micro si tu repasses sous le plafond '
          + 'l’année suivante ; deux années de suite, oui'
      };

    case 'livre-recettes-incomplet':
      return {
        intitule: pluriel(
          sujet.nombre,
          'recette sans mode de règlement',
          'recettes sans mode de règlement'
        ),
        contexte: 'Le mode de règlement est une mention obligatoire du livre des recettes.',
        action: 'Compléter',
        levier: null
      };

    case 'bareme-a-verifier':
      return {
        intitule: 'Barème à revérifier',
        contexte: `Dernière vérification en ${moisLisible(texte(d['verifieLe']))}. Les taux `
          + 'changent au 1er janvier et, depuis 2024, en cours d’année.',
        action: 'Vérifier',
        levier: 'comparer avec urssaf.fr, et ajouter une période dans Config › Paramètres fiscaux si le '
          + 'taux a changé'
      };

    default:
      /* Un identifiant inconnu ne doit pas faire tomber le panneau : la ligne
         s'affiche sans texte, ce qui se voit — et ce qui se voit se corrige. */
      return { intitule: sujet.id, contexte: '', action: 'Voir', levier: null };
  }
}
