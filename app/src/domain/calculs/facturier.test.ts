import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../types';
import type { DateISO } from '../types';
import { suivre } from './facturier';
import { FORMULE_PAR_DEFAUT, echeanceDe } from './delaiPaiement';
import type { RecetteSuivie } from './facturier';

const recette = (p: Partial<RecetteSuivie> & { readonly id: string }): RecetteSuivie => ({
  clientNom: 'Client',
  libelle: 'Prestation',
  montant: euros(1000),
  emiseLe: dateISO('2026-06-01'),
  encaisseeLe: null,
  numero: '2026-001',
  ...p
});

const AUJOURDHUI = dateISO('2026-08-13');
/* Le secours de `suivre` : une échéance à trente jours nets. Il ne sert
   qu'aux recettes sans échéance figée — ici, toutes, puisque les jeux d'essai
   n'en portent pas. */
const trente = (_n: string, e: DateISO) => echeanceDe(e, 'net_30');

const statuts = (rs: readonly RecetteSuivie[], jour: DateISO = AUJOURDHUI) =>
  suivre(rs, trente, jour).map((f) => f.statut);

describe('statut d’une facture', () => {
  it('sans date d’émission, c’est un brouillon', () => {
    expect(statuts([recette({ id: 'r1', emiseLe: null })])).toEqual(['brouillon']);
  });

  it('émise dans les délais, c’est « émise »', () => {
    expect(statuts([recette({ id: 'r1', emiseLe: dateISO('2026-08-01') })])).toEqual(['emise']);
  });

  it('émise et encaissée, c’est « encaissée »', () => {
    expect(statuts([
      recette({ id: 'r1', encaisseeLe: dateISO('2026-07-15') })
    ])).toEqual(['encaissee']);
  });

  /**
   * Le jour même de l'échéance, la facture n'est PAS en retard : le débiteur a
   * la journée pour payer. La marquer en retard ce jour-là ferait relancer un
   * client qui est encore dans les temps.
   */
  it('n’est pas en retard le jour de l’échéance', () => {
    const r = recette({ id: 'r1', emiseLe: dateISO('2026-07-14') });
    expect(statuts([r], dateISO('2026-08-13'))).toEqual(['emise']);
    expect(statuts([r], dateISO('2026-08-14'))).toEqual(['en_retard']);
  });

  it('compte les jours de retard', () => {
    const suivi = suivre(
      [recette({ id: 'r1', emiseLe: dateISO('2026-06-01') })], trente, AUJOURDHUI
    );
    // Échéance au 1er juillet, on est le 13 août : 43 jours.
    expect(suivi[0]?.joursDeRetard).toBe(43);
  });

  it('ne compte aucun retard sur une facture réglée', () => {
    const suivi = suivre(
      [recette({ id: 'r1', encaisseeLe: dateISO('2026-06-20') })], trente, AUJOURDHUI
    );
    expect(suivi[0]?.joursDeRetard).toBe(0);
  });
});

/**
 * L'annulation et la facture annulée sont DEUX lignes, et toutes deux doivent
 * rester visibles : un registre qui fait disparaître l'une des deux ne prouve
 * plus que la correction a eu lieu.
 */
describe('annulation', () => {
  const paire = [
    recette({ id: 'r1', encaisseeLe: dateISO('2026-06-10') }),
    recette({ id: 'a1', montant: euros(-1000), annuleEcriture: 'r1' })
  ];

  it('distingue l’avoir de la facture qu’il neutralise', () => {
    expect(statuts(paire)).toEqual(['annulee', 'annulation']);
  });

  // L'annulation l'emporte sur l'encaissement : afficher « encaissée » une
  // facture annulée donnerait à croire que l'argent est acquis.
  it('l’emporte sur l’encaissement', () => {
    expect(statuts(paire)[0]).toBe('annulee');
  });
});

describe('échéance', () => {
  it('suit le délai du client, pas une constante', () => {
    const r = [recette({ id: 'r1', clientNom: 'Lent', emiseLe: dateISO('2026-06-01') })];
    const suivi = suivre(r, (_n: string, e: DateISO) => echeanceDe(e, 'net_60'), AUJOURDHUI);
    expect(suivi[0]?.echeanceLe).toBe('2026-07-31');
  });

  it('n’en donne aucune à un brouillon', () => {
    const suivi = suivre([recette({ id: 'r1', emiseLe: null })], trente, AUJOURDHUI);
    expect(suivi[0]?.echeanceLe).toBeNull();
  });

  /**
   * Le défaut est « 30 jours FIN DE MOIS », pas « 30 jours nets ». Une facture
   * du 1er janvier tombe donc au 31 janvier — trente jours mènent au 31, et la
   * fin de ce mois-là est le 31. Le 12 juin, en revanche, mène au 31 juillet et
   * non au 12 : c'est là que l'écart avec une addition de jours se voit.
   */
  it('applique la formule par défaut : trente jours fin de mois', () => {
    expect(echeanceDe(dateISO('2026-01-01'), FORMULE_PAR_DEFAUT)).toBe('2026-01-31');
    expect(echeanceDe(dateISO('2026-06-12'), FORMULE_PAR_DEFAUT)).toBe('2026-07-31');
  });
});
