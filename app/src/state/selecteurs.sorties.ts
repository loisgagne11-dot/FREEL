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
import type { EntreeMois } from '../domain/calculs/projectionSolde';
import type { ProvisionImpotRevenu } from '../domain/calculs/provisionImpotRevenu';
import type { Faits } from './schema';
import {
  type EtatPilote, dateDuJour, echeancesDuComptePro, periodesUrssafEffectives, recettesEncaissees,
  sousAcreLe, tauxImpotAu, vlAu
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
  const ir = provisionComptee(pilote);
  if (ir !== null) {
    for (const x of calendrierDuSolde(ir)) ajouter('impot', x.le, ir.resteAProvisionner * x.part);
    for (const x of soldeImpotPrevuDe(faits, maintenant)) ajouter('impot', x.date, x.montant);
  }

  const tva = pilote.provisionsParNature.tva - voletConstateTva(echeancesDuComptePro(faits));
  if (tva > 0.004) ajouter('tva', limiteTva() ?? SANS_DATE, tva);

  return sorties;
}

/** La TVA déjà appelée par une échéance saisie : elle est datée par elle, pas par la déclaration. */
function voletConstateTva(echeances: readonly Echeance[]): number {
  return echeances.reduce((t, e) => (e.nature === 'tva' && e.payeeLe === null ? t + e.montant : t), 0);
}

/**
 * La provision d'impôt de l'année, quand le dû la compte. Un refus d'une des
 * deux parts retire TOUT l'impôt du dû (`impotRevenuAProvisionner`) : le
 * calendrier ne date que ce que le dû compte, sinon le solde prévu baisserait
 * d'un impôt que le dû n'a pas. `null` aussi sous le versement libératoire.
 */
function provisionComptee(pilote: EtatPilote): ProvisionImpotRevenu | null {
  const ir = pilote.provisionImpotRevenu;
  if (ir === null || ir.statut === 'refuse' || pilote.soldeImpotPrecedent?.statut === 'refuse') return null;
  return ir.valeur;
}

/**
 * Le solde de l'impôt d'une année, posé à ses prélèvements de l'automne
 * suivant — en parts du total, pour que la part due aujourd'hui et celle des
 * encaissements à venir suivent UN calendrier.
 *
 * Le calendrier se calcule sur le solde ENTIER : au-delà de 300 €, il se
 * prélève en quatre fois. Daté part par part, un reste de 200 € et 250 € à
 * venir tombaient chacun en une fois en septembre, quand l'avis en fera
 * quatre prélèvements de 112,50 €.
 */
function calendrierDuSolde(ir: ProvisionImpotRevenu): readonly { readonly le: DateISO; readonly part: number }[] {
  const total = ir.resteAProvisionner + ir.resteSurEncaissementsAVenir;
  if (total <= 0) return [];
  const p = prelevementsDuSolde(euros(total), ir.annee + 1);
  return p.statut === 'refuse'
    ? [{ le: SANS_DATE, part: 1 }]
    : p.valeur.map((x) => ({ le: x.date, part: x.montant / total }));
}

/**
 * L'impôt sur le revenu au barème que chaque mois d'encaissements attendus
 * fait naître — lu sur la provision de l'année, jamais recalculé (lot 50).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DISPONIBLE PRÉVU NE RETIRAIT QUE LA FORMATION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Au barème, le taux de charges ne porte que la CFP : l'impôt des
 * encaissements à venir n'entrait nulle part. Le disponible prévu — et le
 * versement tenable qui en sort — étaient trop hauts de tout l'impôt de
 * l'année encore à encaisser.
 *
 * L'année en cours : la provision le chiffre déjà, `resteSurEncaissementsAVenir`
 * — l'impôt de l'année projetée, acomptes et part déjà encaissée retirés —,
 * réparti au prorata des mois. L'année suivante, qu'aucune provision ne couvre
 * encore : le taux moyen de l'impôt de l'année en cours sur son chiffre
 * d'affaires projeté, une hypothèse. Ses acomptes de prélèvement à la source
 * ne sont pas retranchés — aucun avis ne les a encore fixés ; saisis d'avance,
 * ils compteraient deux fois, dans le sens qui retient trop, pas trop peu.
 *
 * Un mois sous le versement libératoire n'en fait naître aucun : l'impôt y
 * part avec l'URSSAF, au taux.
 */
export function impotDesAttendus(
  faits: Faits,
  pilote: EtatPilote,
  attendus: readonly { readonly mois: Mois; readonly encaissements: Euros }[]
): readonly Euros[] {
  const ir = provisionComptee(pilote);
  if (ir === null) return attendus.map(() => euros(0));
  const auBareme = (m: Mois) => !vlAu(faits, m);
  const annee = String(ir.annee);
  const deLAnnee = attendus
    .filter((a) => a.mois.startsWith(annee) && auBareme(a.mois))
    .reduce((t, a) => t + a.encaissements, 0);
  const tauxSuivante = ir.assiette > 0 ? ir.impotAnneeProjetee / ir.assiette : 0;
  return attendus.map((a) => {
    if (!auBareme(a.mois) || a.encaissements <= 0) return euros(0);
    if (a.mois.startsWith(annee)) {
      return euros(deLAnnee > 0 ? ir.resteSurEncaissementsAVenir * (a.encaissements / deLAnnee) : 0);
    }
    return euros(a.mois > annee ? a.encaissements * tauxSuivante : 0);
  });
}

/**
 * Ce que les encaissements attendus feront naître, et quand cela sortira :
 *
 *  · les cotisations et contributions au taux — celles que le disponible
 *    retire déjà —, à la limite de la déclaration URSSAF de leur mois ; sous le
 *    versement libératoire, l'impôt part avec ;
 *  · l'impôt sur le revenu au barème (`impotDesAttendus`), avec le solde de
 *    son année, à l'automne suivant ;
 *  · la TVA encaissée par un redevable, à la déclaration qui la reverse — CA3
 *    du mois ou du trimestre, CA12 de l'année (`limiteTva`, lue sur les
 *    obligations). Sous le régime simplifié, les acomptes de juillet et de
 *    décembre n'ont pas de montant connu : toute la TVA de l'année est posée à
 *    la CA12, ce que l'avis d'acompte corrige.
 */
export function sortiesAVenir(
  faits: Faits,
  pilote: EtatPilote,
  attendus: readonly EntreeMois[],
  tauxDeCharges: number,
  maintenant: Date,
  limiteTva: (m: Mois) => DateISO | null
): readonly SortieDeCharge[] {
  const aujourdhui = dateDuJour(maintenant);
  const periodicite = faits.entreprise.urssafPeriodicite;
  const sorties: SortieDeCharge[] = [];
  const ajouter = (nature: SortieDeCharge['nature'], le: DateISO, montant: number): void => {
    if (montant > 0.004) sorties.push({ nature, le, montant: euros(montant), origine: 'a_venir' });
  };

  for (const a of attendus) {
    ajouter('urssaf', periodeDuMois(a.mois, periodicite, aujourdhui).limite, a.encaissements * tauxDeCharges);
    if ((a.tva ?? 0) > 0.004) ajouter('tva', limiteTva(a.mois) ?? SANS_DATE, a.tva ?? 0);
  }

  const ir = provisionComptee(pilote);
  if (ir !== null) {
    const annee = String(ir.annee);
    const impot = (garder: (m: Mois) => boolean) =>
      attendus.filter((a) => garder(a.mois)).reduce((t, a) => t + (a.impot ?? 0), 0);
    const cetteAnnee = impot((m) => m.startsWith(annee));
    for (const x of calendrierDuSolde(ir)) ajouter('impot', x.le, cetteAnnee * x.part);
    // L'année suivante se paie à l'automne d'après : au-delà des douze mois,
    // elle reste dans le dû de la fin, où le dessin la montre.
    ajouter('impot', SANS_DATE, impot((m) => !m.startsWith(annee)));
  }
  return sorties;
}
