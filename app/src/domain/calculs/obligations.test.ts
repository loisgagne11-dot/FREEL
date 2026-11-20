import { describe, expect, it } from 'vitest';
import { type DateISO, type Resolution, dateISO, euros, mois } from '../types';
import type { Echeance } from './provisions';
import { voletConstate } from './provisions';
import {
  type Obligation, avanceSur, duSaisi, etape, etatEtape, fusionner, obligationsATraiter, paiementDesSaisies
} from './obligations';

const limite = (d: string): Resolution<DateISO> =>
  ({ statut: 'publie', valeur: dateISO(d), source: 'test', verifieLe: dateISO('2026-11-17') });
const inconnue: Resolution<DateISO> = { statut: 'refuse', motif: 'Indique ton nom.' };

const base = {
  limite: limite('2026-07-31'), mois: mois('2026-07'), ouverture: dateISO('2026-07-01'), faite: false
};

/**
 * L'ÉTAT D'UNE ÉTAPE : UNE RÈGLE, LUE PAR LA FRISE, LA LISTE, LE RAIL ET LE PILOTE.
 */
describe('état d’une étape', () => {
  it('est à venir avant l’ouverture, à faire ensuite, jusqu’au jour de la limite compris', () => {
    expect(etatEtape({ ...base, aujourdhui: dateISO('2026-06-30') })).toBe('a_venir');
    expect(etatEtape({ ...base, aujourdhui: dateISO('2026-07-01') })).toBe('a_faire');
    // Le jour même, on a la journée : la comparaison est stricte.
    expect(etatEtape({ ...base, aujourdhui: dateISO('2026-07-31') })).toBe('a_faire');
  });

  it('passe en retard le lendemain de la limite', () => {
    expect(etatEtape({ ...base, aujourdhui: dateISO('2026-08-01') })).toBe('en_retard');
  });

  it('est faite quand elle l’est, limite passée ou non', () => {
    expect(etatEtape({ ...base, faite: true, aujourdhui: dateISO('2026-09-01') })).toBe('fait');
  });

  /*
   * Un prélèvement que l'administration fait seule n'est pas une faute de
   * l'utilisateur : passé sa date sans paiement noté, il est À POINTER. Le dire
   * « en retard » ferait croire à une majoration qui n'existe pas.
   */
  it('ne dit jamais un prélèvement en retard : à venir, puis à pointer', () => {
    const prelevement = { ...base, prelevee: true };
    expect(etatEtape({ ...prelevement, aujourdhui: dateISO('2026-07-15') })).toBe('a_venir');
    expect(etatEtape({ ...prelevement, aujourdhui: dateISO('2026-08-15') })).toBe('a_pointer');
  });

  // Une limite qu'on ne connaît pas ne fait pas passer en retard : on s'abstient.
  it('reste à faire, jamais en retard, quand la limite manque', () => {
    expect(etatEtape({ ...base, limite: inconnue, aujourdhui: dateISO('2026-12-01') })).toBe('a_faire');
  });

  it('reste à faire, passée, une étape que rien ne sanctionne à date', () => {
    expect(etatEtape({ ...base, retardPossible: false, aujourdhui: dateISO('2026-12-01') })).toBe('a_faire');
  });

  /*
   * Une déclaration que l'application ne savait pas noter avant le schéma 25
   * n'est ni faite ni en retard : on ne sait pas. Sans cela, chaque compte qui
   * a de l'histoire voyait rougir ses déclarations de revenus passées.
   */
  it('ne suit pas une étape dont la limite précède le jour où on a su la noter', () => {
    const suivi = { ...base, suiviDepuis: dateISO('2026-11-17') };
    expect(etatEtape({ ...suivi, aujourdhui: dateISO('2026-12-01') })).toBe('non_suivi');
    expect(etatEtape({ ...suivi, limite: limite('2026-12-15'), aujourdhui: dateISO('2026-12-16') }))
      .toBe('en_retard');
  });
});

/**
 * L'AVANCE SE COMPTE CONTRE LA LIMITE REPORTÉE.
 *
 * « Déclarée deux jours avant la limite » : la limite que l'administration
 * applique, report compris. Une date de déclaration inconnue ne donne pas
 * zéro jour d'avance : elle n'en donne aucun.
 */
describe('avance sur la limite', () => {
  it('compte les jours d’avance, positivement, et le retard négativement', () => {
    expect(avanceSur(dateISO('2026-04-28'), limite('2026-04-30'))).toBe(2);
    expect(avanceSur(dateISO('2026-06-03'), limite('2026-06-01'))).toBe(-2);
  });

  it('se tait quand le jour de la déclaration n’est pas connu, ou la limite', () => {
    expect(avanceSur(null, limite('2026-04-30'))).toBeNull();
    expect(avanceSur(dateISO('2026-04-28'), inconnue)).toBeNull();
  });

  it('se porte sur l’étape', () => {
    const e = etape({ ...base, faite: true, faiteLe: dateISO('2026-07-29'), aujourdhui: dateISO('2026-08-10') });
    expect(e.avance).toBe(2);
  });
});

const echeance = (m: Partial<Echeance> & Pick<Echeance, 'id'>): Echeance => ({
  nature: 'cfe', montant: euros(296), echeanceLe: dateISO('2026-12-15'), payeeLe: null, montantPaye: null, ...m
});

const prevue = (id: string, m: Partial<Obligation> = {}): Obligation => ({
  id, nature: 'cfe', dossier: 'cfe', libelle: id, detail: '', periode: '2026',
  paiement: etape({ ...base, limite: limite('2026-12-15'), mois: mois('2026-12'), faiteLe: null,
    aujourdhui: dateISO('2026-11-17'), ouverture: dateISO('2026-11-15') }),
  montant: null, saisies: [], ...m
});

/**
 * UNE OBLIGATION N'APPARAÎT QU'UNE FOIS.
 *
 * La CFE prévue au 15 décembre et l'avis saisi, la TVA autoliquidée calculée
 * et son paiement saisi : sans clé de fusion, chacune se lisait deux fois.
 */
describe('fusion du prévu et du saisi', () => {
  const reunir = (p: Obligation, s: readonly Echeance[]): Obligation =>
    ({ ...p, saisies: s, paiement: paiementDesSaisies(s, dateISO('2026-11-17')) });
  const seule = (e: Echeance): Obligation => prevue(`saisie-${e.id}`, { saisies: [e] });

  it('rattache une saisie à l’obligation prévue de même clé, sans la dédoubler', () => {
    const toutes = fusionner(
      [{ cle: 'cfe:2026', obligation: prevue('cfe-paiement-2026') }],
      [echeance({ id: 'avis' })],
      (e) => `cfe:${e.echeanceLe.slice(0, 4)}`, reunir, seule
    );
    expect(toutes.map((o) => o.id)).toEqual(['cfe-paiement-2026']);
    expect(toutes[0]?.saisies.map((e) => e.id)).toEqual(['avis']);
  });

  it('fait une obligation à part d’une saisie que rien de prévu ne porte', () => {
    const toutes = fusionner(
      [{ cle: 'cfe:2026', obligation: prevue('cfe-paiement-2026') }],
      [echeance({ id: 'regularisation', nature: 'urssaf' })],
      () => null, reunir, seule
    );
    expect(toutes.map((o) => o.id)).toEqual(['cfe-paiement-2026', 'saisie-regularisation']);
  });
});

/**
 * UNE OBLIGATION PRÉVUE N'ENTRE JAMAIS DANS LE DÛ.
 *
 * Le volet 2 des provisions et la provision d'impôt portent déjà ce qu'elle
 * annonce : une période URSSAF non déclarée y est estimée sur les
 * encaissements, le solde d'impôt aussi. L'additionner au dû compterait deux
 * fois la même somme — et ferait baisser d'autant « à te verser ».
 */
describe('le dû des obligations', () => {
  it('ne compte que les échéances saisies et non payées — le volet 1, au centime', () => {
    const saisies = [echeance({ id: 'a' }), echeance({ id: 'b', payeeLe: dateISO('2026-12-10') })];
    const obligations: Obligation[] = [
      prevue('cfe-paiement-2026', { saisies }),
      // Une période URSSAF à déclarer, estimée à 1 970 € : prévue, hors du dû.
      prevue('urssaf-2026-T3', {
        nature: 'urssaf', dossier: 'urssaf',
        montant: { statut: 'publie', valeur: euros(1970), source: 'calcul', verifieLe: dateISO('2026-11-17') }
      })
    ];
    expect(duSaisi(obligations)).toBe(voletConstate(saisies));
    expect(duSaisi(obligations)).toBe(296);
  });
});

/**
 * CE QUI EST À TRAITER : LE TITRE D'OBLIGATIONS ET LE RAIL LE COMPTENT.
 */
describe('obligations à traiter', () => {
  const avec = (etat: 'a_faire' | 'en_retard' | 'a_venir' | 'fait' | 'a_pointer', m: Partial<Obligation> = {}) =>
    prevue(`o-${etat}`, {
      paiement: { limite: limite('2026-12-15'), mois: mois('2026-12'), faiteLe: null, etat, avance: null }, ...m
    });

  it('retient ce qui est à faire ou en retard, et rien d’autre', () => {
    const toutes = ['a_faire', 'en_retard', 'a_venir', 'fait', 'a_pointer'].map((e) => avec(e as 'a_faire'));
    expect(obligationsATraiter(toutes, dateISO('2026-11-17')).map((o) => o.id)).toEqual(['o-a_faire', 'o-en_retard']);
  });

  // Au-delà de deux ans, une DES omise relève d'une régularisation avec les
  // douanes, pas d'un rappel quotidien.
  it('laisse les DES de plus de deux ans à la régularisation', () => {
    const { paiement: _, ...sansPaiement } = avec('en_retard');
    // Le 17/11/2026, le panneau DES regarde d'octobre 2026 à novembre 2024.
    const des = (id: string, periode: string, limiteLe: string): Obligation => ({
      ...sansPaiement, id, dossier: 'des', periode,
      declaration: { limite: limite(limiteLe), mois: mois(limiteLe.slice(0, 7)), faiteLe: null, etat: 'en_retard', avance: null }
    });
    const toutes = [des('2024-10', '2024-10', '2024-11-15'), des('2024-11', '2024-11', '2024-12-13'),
      des('2026-02', '2026-02', '2026-03-12')];
    expect(obligationsATraiter(toutes, dateISO('2026-11-17')).map((o) => o.id)).toEqual(['2024-11', '2026-02']);
  });
});
