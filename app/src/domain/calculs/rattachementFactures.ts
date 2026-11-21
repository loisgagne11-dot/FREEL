import { type PayeurDeMission, payeursDeLaMission } from './brouillon';
import type { Rythme } from './planning';

/**
 * À quelle mission une facture se rattache — la seule règle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE FACTURE NE PORTE PAS SA MISSION, ET LA FENÊTRE DE DATES SE TROMPAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le modèle ne relie une facture qu'à un nom de client. Le rattachement se
 * reconstruisait par la FENÊTRE de la mission : une facture émise entre le
 * début et la fin. Or on facture APRÈS avoir travaillé. L'audit ponctuel du
 * jeu d'essai, fini le 8 mai et facturé le 12, n'était rattaché à rien : la
 * mission se lisait « Terminée » sans un euro facturé, et la règle vivait en
 * trois copies (le facturé d'une mission, la composition d'un mois, la
 * suppression d'une mission), qui ne testaient même pas les mêmes payeurs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * D'ABORD CE QUE LA FACTURE DIT, ENSUITE LA PÉRIODE QU'ELLE FACTURE
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  1. La RÉFÉRENCE DE COMMANDE. Figée sur la facture à l'émission, reprise de
 *     la mission (plusieurs, séparées par des virgules, quand la facture
 *     couvre plusieurs missions) : c'est la seule mention du document qui
 *     désigne une mission. Elle l'emporte sur toute date. Les désignations des
 *     lignes, elles, sont du texte libre que l'on corrige avant d'émettre :
 *     une égalité de libellé cesserait de tenir au premier renommage, sans
 *     rien dire.
 *  2. Une ÉCRITURE D'ANNULATION suit la facture qu'elle annule : un avoir
 *     rattaché ailleurs laisserait à une mission le facturé d'une facture
 *     annulée.
 *  3. Sinon, la PÉRIODE FACTURÉE : une facture règle le travail fait depuis
 *     la précédente facture au même client, jusqu'à son émission. Elle revient
 *     aux missions signées de ce client dont la période croise cet intervalle.
 *
 * Les deux autres règles envisagées échouent chacune sur un cas réel :
 *
 *  · une fenêtre prolongée d'un délai fixe (« trente jours après la fin »)
 *    rattacherait à l'audit tout ce que le client achète dans le mois qui
 *    suit — un délai ne dit rien de ce que la facture couvre ;
 *  · une fenêtre prolongée jusqu'à la facture suivante du client prendrait,
 *    pour une mission dont la dernière facture tombe le jour de sa fin, la
 *    facture d'une autre vente émise des mois plus tard.
 *
 * La période facturée ne commet aucune des deux : l'atelier de formation que
 * le jeu d'essai facture en août au même client couvre la période qui suit
 * la facture de l'audit (12 mai → 5 août), que l'audit ne touche pas.
 *
 * Il reste une ambiguïté que rien ne tranche : deux missions du même client
 * qui courent dans la même période facturée — simultanées, ou l'une qui
 * s'achève quand l'autre commence et dont la dernière facture part après le
 * début de la seconde. La facture revient alors aux deux, et le lecteur le
 * DIT (« partagé avec ») plutôt que de choisir. L'ancienne règle donnait ce
 * second cas à la seule mission en cours, en silence.
 *
 * Seules les missions SIGNÉES reçoivent une facture : un prospect n'a rien
 * produit, une mission perdue non plus, et un prospect sans dates aurait
 * sinon pris tout ce que le client a jamais payé.
 */

/** Ce qu'une mission porte et que le rattachement lit. */
export interface MissionARattacher extends PayeurDeMission {
  readonly id: string;
  readonly statut: string;
  readonly debut: string | null;
  readonly fin: string | null;
  readonly referenceCommande?: string | null;
  readonly entites: readonly { readonly rythmes: readonly Rythme[] }[];
}

/** Ce qu'une facture porte et que le rattachement lit. */
export interface FactureARattacher {
  readonly id: string;
  readonly clientNom: string;
  readonly emiseLe: string | null;
  readonly referenceCommande?: string | null;
  readonly annuleEcriture?: string | null;
}

/** Le nom de client comme clé : unique à la casse près (voir `validerNomClient`). */
const cle = (nom: string): string => nom.trim().toLowerCase();

/** Les références qu'une facture imprime : la rédaction joint celles de plusieurs missions par des virgules. */
const referencesDe = (r: string | null | undefined): readonly string[] =>
  (r ?? '').split(',').map(cle).filter((x) => x !== '');

const estAnnulation = (f: FactureARattacher): boolean =>
  typeof f.annuleEcriture === 'string' && f.annuleEcriture !== '';

/**
 * Les missions de chaque facture émise, par identifiant de facture.
 *
 * Une facture absente de la table est un brouillon : non émise, elle n'a rien
 * facturé. Une liste vide : émise, et aucune mission signée ne la couvre —
 * une vente hors mission, que le lecteur nomme par sa pièce.
 */
export function rattacherFactures(
  missions: readonly MissionARattacher[],
  factures: readonly FactureARattacher[]
): ReadonlyMap<string, readonly string[]> {
  const signees = missions
    .filter((m) => m.statut === 'active' || m.statut === 'terminee')
    .map((m) => ({
      m,
      payeurs: new Set([...payeursDeLaMission(m)].map(cle)),
      reference: cle(m.referenceCommande ?? '')
    }));
  const emises = factures.filter((f): f is FactureARattacher & { emiseLe: string } => f.emiseLe !== null);

  // Les dates qui bornent une période facturée : celles des factures, pas des
  // avoirs — une annulation ne facture aucun travail.
  const datesParClient = new Map<string, string[]>();
  for (const f of emises) {
    if (estAnnulation(f)) continue;
    const dates = datesParClient.get(cle(f.clientNom)) ?? [];
    dates.push(f.emiseLe);
    datesParClient.set(cle(f.clientNom), dates);
  }

  const parFacture = new Map<string, readonly string[]>();
  const rattacher = (f: FactureARattacher & { emiseLe: string }): readonly string[] => {
    const client = cle(f.clientNom);
    const siennes = signees.filter((s) => s.payeurs.has(client));

    const refs = referencesDe(f.referenceCommande);
    const parReference = siennes.filter((s) => s.reference !== '' && refs.includes(s.reference));
    if (parReference.length > 0) return parReference.map((s) => s.m.id).sort();

    const precedente = (datesParClient.get(client) ?? [])
      .filter((d) => d < f.emiseLe)
      .reduce<string | null>((max, d) => (max === null || d > max ? d : max), null);
    return siennes
      .filter(({ m }) => (m.debut === null || m.debut <= f.emiseLe)
        && (m.fin === null || precedente === null || m.fin > precedente))
      .map((s) => s.m.id)
      .sort();
  };

  for (const f of emises) if (!estAnnulation(f)) parFacture.set(f.id, rattacher(f));
  for (const f of emises) {
    if (!estAnnulation(f)) continue;
    // L'annulée d'abord ; à défaut (elle n'est pas dans la liste), la règle
    // commune — l'avoir reste rattaché à quelque chose plutôt qu'à rien.
    parFacture.set(f.id, parFacture.get(f.annuleEcriture as string) ?? rattacher(f));
  }
  return parFacture;
}
