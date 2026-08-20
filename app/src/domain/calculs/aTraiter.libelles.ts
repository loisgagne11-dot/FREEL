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
}

/** Accorde un nom au nombre, en préfixant la quantité. */
function pluriel(n: number, singulier: string, plurielMot: string): string {
  return `${n} ${n > 1 ? plurielMot : singulier}`;
}

/** « 2026-03 » → « mars 2026 ». */
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
    const delai = jours < 0
      ? `Échéance dépassée depuis ${pluriel(-jours, 'jour', 'jours')}.`
      : `Dans ${pluriel(jours, 'jour', 'jours')}.`;
    const complement = texte(d['contexte']);
    return {
      intitule: texte(d['intitule']),
      contexte: complement === '' ? delai : `${delai} ${complement}`,
      action: texte(d['action']) === '' ? 'Se préparer' : texte(d['action'])
    };
  }

  switch (sujet.id) {
    case 'factures-en-retard':
      return {
        intitule: pluriel(sujet.nombre, 'facture en retard', 'factures en retard'),
        contexte: `${nombre(d['total'])} € impayés, dont `
          + `${pluriel(nombre(d['plusAncienne']), 'jour', 'jours')} de retard `
          + 'sur la plus ancienne.',
        action: 'Relancer'
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
          + `${nombre(d['amende'])} € encourus. La franchise en base n’en dispense pas.`,
        action: 'Déposer'
      };
    }

    case 'periodes-a-declarer':
      return {
        intitule: pluriel(sujet.nombre, 'période à déclarer', 'périodes à déclarer'),
        contexte: `Depuis ${moisLisible(texte(d['depuis']))}. Tant qu’une période n’est `
          + 'pas déclarée, sa charge reste provisionnée et le versable est minoré '
          + 'd’autant.',
        action: 'Déclarer'
      };

    /* Une omission ne se voit pas : elle produit un chiffre plausible, juste
       trop élevé. D'où l'insistance sur le SENS de l'erreur. */
    case 'aucune-echeance':
      return {
        intitule: 'Aucune échéance enregistrée',
        contexte: 'Tu encaisses depuis plusieurs mois sans qu’aucun appel de '
          + 'cotisations, avis d’impôt ou CFE ne soit saisi. Tant qu’ils manquent, '
          + 'le disponible et le versable sont SURESTIMÉS — c’est le sens qui coûte cher.',
        action: 'Saisir mes échéances'
      };

    case 'seuil-tva': {
      const franchi = d['franchi'] === true;
      return {
        intitule: franchi ? 'Seuil majoré de TVA franchi' : 'Seuil majoré de TVA proche',
        contexte: franchi
          ? 'La TVA est due immédiatement. Une facture émise sans TVA après le '
            + 'franchissement est réputée TTC : la part de TVA est à reverser sans '
            + 'avoir pu être répercutée au client.'
          : `Il reste ${nombre(d['reste'])} € facturables avant assujettissement immédiat.`,
        action: franchi ? 'Régulariser' : 'Voir le détail'
      };
    }

    case 'plafond-micro':
      return {
        intitule: d['depasse'] === true
          ? 'Plafond du régime micro dépassé'
          : 'Plafond du régime micro proche',
        contexte: `${nombre(d['ca'])} € encaissés sur ${nombre(d['plafond'])} € de plafond.`,
        action: 'Voir le détail'
      };

    case 'livre-recettes-incomplet':
      return {
        intitule: pluriel(
          sujet.nombre,
          'recette sans mode de règlement',
          'recettes sans mode de règlement'
        ),
        contexte: 'Le mode de règlement est une mention obligatoire du livre des recettes.',
        action: 'Compléter'
      };

    case 'bareme-a-verifier':
      return {
        intitule: 'Barème à revérifier',
        contexte: `Dernière vérification en ${moisLisible(texte(d['verifieLe']))}. Les taux `
          + 'changent au 1er janvier et, depuis 2024, en cours d’année.',
        action: 'Vérifier'
      };

    default:
      /* Un identifiant inconnu ne doit pas faire tomber le panneau : la ligne
         s'affiche sans texte, ce qui se voit — et ce qui se voit se corrige. */
      return { intitule: sujet.id, contexte: '', action: 'Voir' };
  }
}
