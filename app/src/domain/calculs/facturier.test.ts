import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../types';
import type { DateISO } from '../types';
import { DELAI_PAIEMENT_DEFAUT, echeanceDe, suivre } from './facturier';
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
const trente = () => DELAI_PAIEMENT_DEFAUT;

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
    const suivi = suivre(r, () => 60, AUJOURDHUI);
    expect(suivi[0]?.echeanceLe).toBe('2026-07-31');
  });

  it('n’en donne aucune à un brouillon', () => {
    const suivi = suivre([recette({ id: 'r1', emiseLe: null })], trente, AUJOURDHUI);
    expect(suivi[0]?.echeanceLe).toBeNull();
  });

  it('trente jours à défaut de convention', () => {
    expect(echeanceDe(dateISO('2026-01-01'), DELAI_PAIEMENT_DEFAUT)).toBe('2026-01-31');
  });
});
