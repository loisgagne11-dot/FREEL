/**
 * Le dû posé au jour où il quitte le compte — la source du solde prévu.
 *
 * Chargé avec la Trésorerie (par `selecteurs.argent`), jamais au premier
 * rendu : le Pilote lit le dû, pas son calendrier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE MÊME DÛ, DATÉ — PAS UN SECOND CALCUL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chaque euro d'ici vient d'un montant que le dû compte déjà : les échéances
 * saisies non payées (volet 1), les charges des encaissements non déclarés
 * (volet 2, période URSSAF par période, avec la règle même du volet), la
 * provision d'impôt, la TVA à reverser. Un test tient la somme : le dû
 * d'aujourd'hui se retrouve en entier dans ce calendrier. Une seconde règle
 * qui aurait recompté les cotisations à sa façon finirait par ne pas tomber
 * d'accord avec la première — et le solde prévu baisserait d'un montant qui
 * n'est dû nulle part.
 */

import { type DateISO, type Euros, type Mois, euros } from '../domain/types';
import { type Echeance, voletAProvisionner } from '../domain/calculs/provisions';
import { periodeDuMois } from '../domain/calculs/declarations';
import { moisDeclares } from '../domain/calculs/declarations.declarees';
import { prelevementsDuSolde } from '../domain/bareme/soldeImpot';
import type { SortieDeCharge } from '../domain/calculs/sortiesDeCharges';
import type { Faits } from './schema';
import {
  type EtatPilote, dateDuJour, echeancesDuComptePro, periodesUrssafEffectives, recettesEncaissees,
  sousAcreLe, tauxImpotAu
} from './selecteurs';
import { soldeImpotPrevuDe } from './selecteurs.impotCalendrier';

/**
 * Une charge sans date connue tombe ici : au-delà de tout horizon. Elle reste
 * dans le dû de la fin, où le dessin la montre — jamais retirée d'un mois au
 * hasard.
 */
const SANS_DATE = '9999-12-31' as DateISO;

/**
 * Le dû d'aujourd'hui, posé à ses dates.
 *
 *  · une échéance saisie non payée : sa date (passée, elle tombe sur le mois
 *    courant — voir `sortiesParMois`) ;
 *  · les cotisations, le versement libératoire et la formation d'un
 *    encaissement non déclaré : la limite de la déclaration de SA période ;
 *  · l'impôt sur le revenu au barème : le solde de l'an passé à ses
 *    prélèvements (`soldeImpotPrevuDe`), celui de l'année à l'automne qui suit ;
 *  · la TVA à reverser : la prochaine déclaration de TVA qui la paie
 *    (`limiteTva`, lue sur les obligations — lot 53) ;
 *  · la CFE n'a de montant qu'avec son avis : elle est une échéance saisie.
 */
export function sortiesDuDu(
  faits: Faits,
  pilote: EtatPilote,
  maintenant: Date,
  limiteTva: () => DateISO | null
): readonly SortieDeCharge[] {
  const aujourdhui = dateDuJour(maintenant);
  const sorties: SortieDeCharge[] = [];
  const ajouter = (nature: SortieDeCharge['nature'], le: DateISO, montant: number): void => {
    if (montant > 0.004) sorties.push({ nature, le, montant: euros(montant), origine: 'du' });
  };

  for (const e of echeancesDuComptePro(faits)) {
    if (e.payeeLe === null) ajouter(e.nature, e.echeanceLe, e.montant);
  }

  /* Le volet 2, période par période, par la règle même du volet : seul le
     découpage change. L'impôt sur le revenu et la TVA s'ajoutent à part — ils
     ne suivent pas les déclarations URSSAF. */
  const declares = { mois: moisDeclares(faits.periodesDeclarees) };
  const periodicite = faits.entreprise.urssafPeriodicite;
  const parPeriode = new Map<string, { limite: DateISO; recettes: ReturnType<typeof recettesEncaissees>[number][] }>();
  for (const r of recettesEncaissees(faits)) {
    const p = periodeDuMois(r.encaisseeLe.slice(0, 7) as Mois, periodicite, aujourdhui);
    const deja = parPeriode.get(p.id);
    if (deja === undefined) parPeriode.set(p.id, { limite: p.limite, recettes: [r] });
    else deja.recettes.push(r);
  }
  const ctx = {
    typeActivite: faits.entreprise.typeActivite,
    sousAcreLe: sousAcreLe(faits),
    debutActivite: faits.entreprise.debutActivite,
    tauxImpotEtContributions: tauxImpotAu(faits),
    periodesUrssaf: periodesUrssafEffectives(faits)
  };
  for (const { limite, recettes } of parPeriode.values()) {
    const v = voletAProvisionner(recettes, declares, ctx).parNature;
    ajouter('urssaf', limite, v.urssaf);
    ajouter('cfp', limite, v.cfp);
    // Le versement libératoire : payé avec l'URSSAF, à la même limite.
    ajouter('impot', limite, v.impot);
  }

  /* Un refus d'une des deux parts retire TOUT l'impôt du dû
     (`impotRevenuAProvisionner`) : le calendrier ne date que ce que le dû
     compte, sinon le solde prévu baisserait d'un impôt que le dû n'a pas. */
  const ir = pilote.provisionImpotRevenu;
  const irRefuse = ir?.statut === 'refuse' || pilote.soldeImpotPrecedent?.statut === 'refuse';
  if (!irRefuse && ir !== null && ir.valeur.resteAProvisionner > 0) {
    const reste = ir.valeur.resteAProvisionner;
    const p = prelevementsDuSolde(reste, ir.valeur.annee + 1);
    if (p.statut === 'refuse') ajouter('impot', SANS_DATE, reste);
    else for (const x of p.valeur) ajouter('impot', x.date, x.montant);
  }
  if (!irRefuse) for (const x of soldeImpotPrevuDe(faits, maintenant)) ajouter('impot', x.date, x.montant);

  const tva = pilote.provisionsParNature.tva - voletConstateTva(echeancesDuComptePro(faits));
  if (tva > 0.004) ajouter('tva', limiteTva() ?? SANS_DATE, tva);

  return sorties;
}

/** La TVA déjà appelée par une échéance saisie : elle est datée par elle, pas par la déclaration. */
function voletConstateTva(echeances: readonly Echeance[]): number {
  return echeances.reduce((t, e) => (e.nature === 'tva' && e.payeeLe === null ? t + e.montant : t), 0);
}

/**
 * Ce que les encaissements attendus feront naître, et quand cela sortira : la
 * part de charges — celle que le disponible retire déjà — à la limite de la
 * déclaration URSSAF de leur mois. Sous le versement libératoire, l'impôt
 * part avec ; au barème, le taux ne porte que la formation (l'impôt de
 * l'année suivante n'est pas une sortie de ces douze mois).
 */
export function sortiesAVenir(
  faits: Faits,
  attendus: readonly { readonly mois: Mois; readonly encaissements: Euros }[],
  tauxDeCharges: number,
  maintenant: Date
): readonly SortieDeCharge[] {
  const aujourdhui = dateDuJour(maintenant);
  const periodicite = faits.entreprise.urssafPeriodicite;
  return attendus.flatMap((a) => {
    const montant = a.encaissements * tauxDeCharges;
    if (montant <= 0.004) return [];
    return [{
      nature: 'urssaf' as const,
      le: periodeDuMois(a.mois, periodicite, aujourdhui).limite,
      montant: euros(montant),
      origine: 'a_venir' as const
    }];
  });
}
