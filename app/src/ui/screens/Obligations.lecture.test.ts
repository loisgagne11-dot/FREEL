import { describe, expect, it } from 'vitest';
import { type Mois, dateISO, euros } from '../../domain/types';
import { type Etape, type EtatEtape, type Obligation } from '../../domain/calculs/obligations';
import {
  anneesDuSegment, avanceLisible, dossierParDefaut, listeDeLAnnee, obligationDeLaCle, pastilleDe, signeDe,
  titreObligations
} from './Obligations.lecture';

const AUJ = dateISO('2026-06-10');

const etape = (etat: EtatEtape, limite: string, p: Partial<Etape> = {}): Etape => ({
  limite: { statut: 'publie', valeur: dateISO(limite), source: 'essai', verifieLe: dateISO(limite) },
  mois: limite.slice(0, 7) as Mois,
  ouverture: dateISO(`${limite.slice(0, 7)}-01`),
  faiteLe: null,
  etat,
  avance: null,
  ...p
});

const obligation = (id: string, p: Partial<Obligation>): Obligation => ({
  id, nature: 'urssaf', dossier: 'urssaf', libelle: id, detail: '', periode: id, montant: null, saisies: [], ...p
});

/**
 * LE TITRE D'OBLIGATIONS.
 *
 * Il ne compte rien lui-même : le nombre est celui de la pastille du rail.
 * Il date, et c'est là que vivent ses règles.
 */
describe('le titre d’Obligations', () => {
  const tva = obligation('tva', { nature: 'tva', dossier: 'tva', declaration: etape('a_faire', '2026-07-16') });
  const urssaf = obligation('urssaf', { declaration: etape('a_faire', '2026-07-31') });

  // Sans « fin juillet », deux choses à rendre le 16 et le 31 se seraient
  // lues comme deux choses pour le 16 : on court pour rien.
  it('dit l’horizon de ce qui est à faire : la limite la plus lointaine, « fin » quand c’est le dernier jour du mois', () => {
    expect(titreObligations(2, [tva, urssaf], AUJ)).toBe('Deux choses à faire d’ici fin juillet.');
    expect(titreObligations(1, [tva], AUJ)).toBe('Une chose à faire d’ici le 16 juillet.');
  });

  // « Rien à faire » sans date se lirait « plus rien de l'année ».
  it('rien à faire : dit jusqu’à quand, et le dit aussi quand rien n’est prévu', () => {
    const t3 = obligation('t3', { declaration: etape('a_venir', '2026-10-31') });
    expect(titreObligations(0, [t3], AUJ)).toBe('Rien à faire avant le 31 octobre.');
    expect(titreObligations(0, [], AUJ)).toBe('Rien à faire, et rien de prévu.');
  });

  // « d'ici fin juillet » au-dessus d'une déclaration de mars promettrait
  // un délai qui n'existe plus.
  it('un retard prend la place de la date', () => {
    const mars = obligation('mars', { declaration: etape('en_retard', '2026-03-31') });
    expect(titreObligations(2, [mars, tva], AUJ)).toBe('Deux choses à faire, dont une en retard.');
    expect(titreObligations(1, [mars], AUJ)).toBe('Une chose en retard.');
  });

  // Le nombre vient du rail : quatre périodes à déclarer en un seul sujet du
  // Pilote en font quatre ici, comme sur la pastille.
  it('reprend le nombre qu’on lui donne, au-delà de dix en chiffres', () => {
    expect(titreObligations(12, [tva], AUJ)).toBe('12 choses à faire d’ici le 16 juillet.');
  });

  it('écrit l’année d’un horizon qui n’est pas l’année en cours', () => {
    const ca12 = obligation('ca12', { declaration: etape('a_faire', '2027-05-04') });
    expect(titreObligations(1, [ca12], dateISO('2027-01-10'))).toBe('Une chose à faire d’ici le 4 mai.');
    expect(titreObligations(1, [ca12], dateISO('2026-12-20'))).toBe('Une chose à faire d’ici le 4 mai 2027.');
  });
});

/**
 * LE SIGNE D'UNE OBLIGATION : ● fait, ◇ à faire, ○ à venir, ▲ en retard.
 */
describe('le signe d’une obligation', () => {
  // Une déclaration faite et un appel à payer dans trois semaines : le rond
  // creux la rangeait avec ce qu'on n'a pas commencé, et l'appel à payer
  // disparaissait de la frise.
  it('« déclarée, à payer » reste à faire', () => {
    const o = obligation('o', {
      declaration: etape('fait', '2026-07-31', { faiteLe: dateISO('2026-07-02') }),
      paiement: etape('a_venir', '2026-07-31')
    });
    expect(signeDe(o)).toBe('a_faire');
  });

  // Un prélèvement que l'administration fait seule n'est jamais un retard.
  it('un prélèvement à pointer est à faire, pas en retard', () => {
    expect(signeDe(obligation('i', { paiement: etape('a_pointer', '2026-05-15') }))).toBe('a_faire');
  });

  it('en retard l’emporte sur tout, fait n’est dit que quand tout l’est', () => {
    expect(signeDe(obligation('a', { declaration: etape('en_retard', '2026-04-30'), paiement: etape('en_retard', '2026-04-30') })))
      .toBe('en_retard');
    expect(signeDe(obligation('b', { declaration: etape('fait', '2026-04-30'), paiement: etape('fait', '2026-04-30') })))
      .toBe('fait');
    expect(signeDe(obligation('c', { declaration: etape('non_suivi', '2025-12-31') }))).toBe('non_suivi');
  });
});

describe('la pastille d’une ligne', () => {
  // La maquette : « ○ Déclarable le 1ᵉʳ juillet » pour le trimestre qui se
  // clôt dans trois semaines, « ○ À venir » pour celui d'octobre.
  it('annonce le jour où une déclaration s’ouvre, dans le mois qui vient seulement', () => {
    const t2 = obligation('t2', { declaration: etape('a_venir', '2026-07-31') });
    const t3 = obligation('t3', { declaration: etape('a_venir', '2026-10-31') });
    expect(pastilleDe(t2, AUJ)).toEqual({ libelle: 'Déclarable le 1ᵉʳ juillet', court: 'Le 1ᵉʳ juil.', ton: 'neutre' });
    expect(pastilleDe(t3, AUJ).libelle).toBe('À venir');
  });

  it('dit le paiement fait, avec son jour', () => {
    const t1 = obligation('t1', {
      declaration: etape('fait', '2026-04-30', { faiteLe: dateISO('2026-04-28') }),
      paiement: etape('fait', '2026-04-30', { faiteLe: dateISO('2026-04-28') })
    });
    expect(pastilleDe(t1, AUJ)).toMatchObject({ libelle: 'Payée le 28 avr.', ton: 'ok' });
  });

  it('nomme le geste de la DES : déposer', () => {
    const des = obligation('d', { nature: 'des', dossier: 'des', declaration: etape('a_faire', '2026-06-12') });
    expect(pastilleDe(des, AUJ).libelle).toBe('À déposer');
  });
});

describe('l’avance d’une déclaration', () => {
  // La maquette : « Déclarée le 28 avril, deux jours avant la limite ».
  it('se dit en jours, dans les deux sens, et se tait quand le jour manque', () => {
    expect(avanceLisible(2)).toBe('deux jours avant la limite');
    expect(avanceLisible(-1)).toBe('un jour après la limite');
    expect(avanceLisible(0)).toBe('le jour de la limite');
    expect(avanceLisible(null)).toBeNull();
  });
});

describe('les années, la liste et le dossier par défaut', () => {
  const faite = obligation('t1', {
    declaration: etape('fait', '2026-04-30', { faiteLe: dateISO('2026-04-28') }),
    paiement: etape('fait', '2026-04-30', { faiteLe: dateISO('2026-04-28') })
  });
  const aVenir = obligation('t3', { declaration: etape('a_venir', '2026-10-31') });
  const aFaire = obligation('t2', { declaration: etape('a_faire', '2026-07-31') });
  const retard2025 = obligation('des-2025', { dossier: 'des', periode: '2025-11', declaration: etape('en_retard', '2025-12-11') });
  const futur = obligation('t4', { declaration: etape('a_venir', '2027-02-01') });

  // Une DES de novembre 2025 oubliée ne se voyait que sous 2025 : le titre
  // la comptait, la liste de l'année ne la montrait pas.
  it('l’année courante reprend ce qui est à traiter d’une autre année', () => {
    const liste = listeDeLAnnee([retard2025, faite, aVenir, aFaire, futur], 2026, AUJ);
    expect(liste.aFaire.map((o) => o.id)).toEqual(['des-2025', 't2', 't3']);
    expect(liste.faites.map((o) => o.id)).toEqual(['t1']);
  });

  // Ouvrir l'écran sur la dernière chose faite, à côté d'une liste qui en
  // attend deux, faisait lire le passé d'abord.
  it('ouvre le dossier de la prochaine chose à faire, sinon de ce qui vient, sinon de la dernière faite', () => {
    expect(dossierParDefaut(listeDeLAnnee([faite, aVenir, aFaire], 2026, AUJ))?.id).toBe('t2');
    expect(dossierParDefaut(listeDeLAnnee([faite, aVenir], 2026, AUJ))?.id).toBe('t3');
    expect(dossierParDefaut(listeDeLAnnee([faite], 2026, AUJ))?.id).toBe('t1');
    expect(dossierParDefaut(listeDeLAnnee([], 2026, AUJ))).toBeNull();
  });

  // En décembre, le quatrième trimestre se déclare en janvier : sans son
  // année au segment, la prochaine obligation n'avait pas de liste.
  it('le segment porte les années passées qui ont une obligation, l’année courante et celle de la prochaine', () => {
    expect(anneesDuSegment([retard2025, faite, futur], AUJ, 2026)).toEqual([2025, 2026, 2027]);
    expect(anneesDuSegment([faite, aVenir, futur], AUJ, 2026)).toEqual([2026]);
    expect(anneesDuSegment([faite], AUJ, 2024)).toEqual([2024, 2026]);
  });
});

describe('l’adresse d’un dossier', () => {
  // La Trésorerie ne connaît que l'échéance : son lien doit trouver la
  // période URSSAF qui la porte, pas une ligne qui n'existe plus.
  it('désigne une obligation par son identifiant, ou par l’échéance saisie qu’elle porte', () => {
    const appel = { id: 'ech-1', nature: 'urssaf' as const, montant: euros(100), echeanceLe: dateISO('2026-04-30'),
      payeeLe: null, montantPaye: null, periode: '2026-T1' };
    const t1 = obligation('urssaf-2026-T1', { saisies: [appel] });
    expect(obligationDeLaCle([t1], 'urssaf-2026-T1')?.id).toBe('urssaf-2026-T1');
    expect(obligationDeLaCle([t1], 'saisie-ech-1')?.id).toBe('urssaf-2026-T1');
    expect(obligationDeLaCle([t1], 'saisie-ech-2')).toBeUndefined();
  });
});
