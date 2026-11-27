/**
 * La facture du mois, avant qu'elle existe — et les mois qui l'attendent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODULE À PART DE `selecteurs.facture`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « À faire » compte désormais les mois à enregistrer, et son calcul est
 * chargé au démarrage du Pilote. Il lisait le brouillon du mois dans
 * `selecteurs.facture`, qui emporte avec lui les mentions obligatoires, le
 * calcul d'amende et la réédition : tout le Pilote aurait attendu un document
 * qu'il ne montre pas. Le brouillon ne dépend que du planning ; il vit ici,
 * et `selecteurs.facture` le réexporte pour ses lecteurs d'avant.
 */

import type { DateISO, Mois } from '../domain/types';
import { euros } from '../domain/types';
import {
  type BrouillonDeFacture, type FactureEmise, type LigneDeBrouillon, brouillonsDuMois,
  cleDuBrouillon, ventilerParFacturation
} from '../domain/calculs/brouillon';
import { MOIS_EN_ATTENTE_MAX, moisFactureDe } from '../domain/calculs/emission';
import { decalerMois } from '../domain/calculs/periode';
import { previsionDuMois } from '../domain/calculs/prevision';
import type { Faits } from './schema';
import { dateDuJour } from './selecteurs';
import { libelleDeLaLigne, planningsDuMois } from './selecteurs.prevision';

/**
 * Les brouillons de facture du mois, dérivés du planning.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IL SUIT L'ACTIVITÉ PARCE QU'IL N'EN EST PAS SÉPARÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « La facture du mois en cours est créée en brouillon et se met à jour en
 * fonction de mes modifications d'Activité. » Un brouillon enregistré serait
 * juste à l'instant de sa création puis faux dès la première journée corrigée,
 * et il faudrait le resynchroniser — c'est-à-dire réécrire un fait à partir
 * d'un calcul, ce que cette application s'interdit partout ailleurs.
 *
 * Celui-ci n'est stocké nulle part. Il vient du même planning que le CRA et
 * que la prévision, ce qui garantit que les trois disent le même nombre de
 * journées : une facture qui ne collerait pas au compte rendu signé est
 * exactement le document qu'on ne veut pas envoyer.
 *
 * Les journées valorisées sont les journées RETENUES — ajustements compris —
 * et non les journées prévues : on facture ce qui a été fait.
 *
 * Une mission facturée en commun rend une ligne par client opérationnel, au
 * payeur de la mission — comme avant le schéma 24. Facturée client par client,
 * elle rend une ligne par client opérationnel ET par payeur : les journées sont
 * réparties selon la plage qui les couvre, puis valorisées par la même
 * `previsionDuMois` que la prévision du mois — la somme des parts retombe donc
 * sur le tout, au centime.
 */
export function brouillonsDeFacture(
  faits: Faits,
  m: Mois
): readonly BrouillonDeFacture[] {
  const lignes: LigneDeBrouillon[] = planningsDuMois(faits, m)
    .flatMap(({ mission, entite, planning }) => {
      const libelle = libelleDeLaLigne(mission, entite);
      // Le client qui REÇOIT la facture, et non celui chez qui l'on travaille :
      // une mission passée par une agence a les deux, et c'est l'agence qui paie.
      return [...ventilerParFacturation(planning, entite.rythmes, mission)]
        .map(([clientNom, jours]) => {
          const p = previsionDuMois(m, jours, entite.rythmes, mission.tjm);
          return {
            missionId: mission.id,
            entiteId: entite.id,
            libelle,
            clientNom,
            cle: cleDuBrouillon(clientNom, mission, entite.id),
            jours: p.joursRetenus,
            montant: p.montantRetenu
          };
        });
    })
    .filter((l) => l.clientNom !== '');

  return brouillonsDuMois(m, lignes, facturesEmisesDuMois(faits, m));
}

/**
 * Les factures déjà émises POUR ce mois-là, par client.
 *
 * Sert à marquer un brouillon plutôt qu'à le supprimer : voir côte à côte ce
 * qui a été facturé et ce que le planning compte est la seule façon de
 * remarquer un écart avant que le client le remarque.
 *
 * Le mois retenu est celui que la facture COUVRE (`moisFactureDe`) : la
 * facture d'août enregistrée depuis Tiime le 2 septembre marque août. Faute de
 * mois dit, celui d'émission, la règle d'avant.
 *
 * Une facture annulée par un avoir ne couvre plus rien : l'avoir l'a effacée,
 * et la compter laisserait le mois « déjà facturé » alors qu'il est à
 * refacturer — sorti à jamais de la liste des mois en attente.
 */
function facturesEmisesDuMois(faits: Faits, m: Mois): ReadonlyMap<string, FactureEmise> {
  const annulees = new Set(faits.recettes.flatMap((r) =>
    (typeof r.annuleEcriture === 'string' ? [r.annuleEcriture] : [])));
  const parClient = new Map<string, FactureEmise>();
  for (const r of faits.recettes) {
    if (moisFactureDe(r) !== m) continue;
    if (typeof r.annuleEcriture === 'string' || annulees.has(r.id)) continue;
    // Le montant CUMULÉ du mois, et non celui de la première facture : deux
    // factures au même client le même mois se comparent au planning
    // ensemble. N'en retenir qu'une afficherait un écart qui n'existe pas.
    const acc = parClient.get(r.clientNom);
    parClient.set(r.clientNom, {
      numero: acc === undefined ? r.numero : `${acc.numero} +`,
      montant: euros((acc?.montant ?? 0) + r.montant)
    });
  }
  return parClient;
}

/**
 * Les payeurs qui ont encore une journée retenue, ce mois-ci, après aujourd'hui.
 *
 * Le même partage que le brouillon (`ventilerParFacturation`) : une seconde
 * règle de « qui paie ce jour-là » finirait par dire le mois fini pour un
 * payeur dont le brouillon compte encore des jours.
 */
function payeursEncoreAuTravail(faits: Faits, m: Mois, aujourdhui: DateISO): ReadonlySet<string> {
  const payeurs = new Set<string>();
  for (const { mission, entite, planning } of planningsDuMois(faits, m)) {
    const aVenir = planning.filter((j) => j.retenu > 0 && j.date > aujourdhui);
    for (const payeur of ventilerParFacturation(aVenir, entite.rythmes, mission).keys()) payeurs.add(payeur);
  }
  return payeurs;
}

/**
 * Les factures qui restent à enregistrer : un brouillon par mois et par
 * payeur, le plus ancien d'abord.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TRAVAILLÉ, ET RIEN N'EST ENREGISTRÉ POUR CE MOIS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Celui qui émet dans Tiime n'a plus de geste « émettre » dans FREEL : rien
 * ne lui rappelait qu'août avait été travaillé et qu'aucune facture n'en
 * était arrivée ici — et sans elle, ni le reste à rentrer, ni les relances,
 * ni le livre des recettes. La règle est celle du brouillon : un mois sort de
 * la liste dès qu'une facture le couvre (`dejaEmise`), sans comparer les
 * montants — la facture reprend celui du planning (22/11), un écart n'est
 * pas un oubli.
 *
 * Les mois passés de l'année écoulée (`MOIS_EN_ATTENTE_MAX`), et le mois en
 * cours quand le payeur n'y a plus aucune journée à venir : la facture d'un
 * mois s'émet son dernier jour travaillé — le vendredi 30 octobre, quand le
 * 31 est un samedi —, et attendre le calendrier la ferait manquer.
 */
export function moisAEnregistrer(faits: Faits, maintenant: Date = new Date()): readonly BrouillonDeFacture[] {
  const aujourdhui = dateDuJour(maintenant);
  const courant = aujourdhui.slice(0, 7) as Mois;
  const passes = Array.from({ length: MOIS_EN_ATTENTE_MAX },
    (_, i) => decalerMois(courant, i - MOIS_EN_ATTENTE_MAX));
  const auTravail = payeursEncoreAuTravail(faits, courant, aujourdhui);
  return [
    ...passes.flatMap((m) => brouillonsDeFacture(faits, m).filter((b) => b.dejaEmise === null)),
    ...brouillonsDeFacture(faits, courant).filter((b) => b.dejaEmise === null && !auTravail.has(b.clientNom))
  ];
}
