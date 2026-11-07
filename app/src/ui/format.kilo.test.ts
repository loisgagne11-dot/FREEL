import { describe, expect, it } from 'vitest';
import { enKiloEuros } from './format.kilo';

// Intl fr-FR met des espaces insécables et un vrai signe moins (U+2212).
const norm = (s: string) => s.replace(/[  ]/g, ' ').replace('−', '-');

describe('enKiloEuros : un seul arrondi pour toutes les étiquettes de graphe', () => {
  // Deux écrans en avaient un chacun : « 10,2 k€ » d'un côté, « 10 k€ » de
  // l'autre pour le même montant. Et à l'entier, douze mois entre 10 500 et
  // 11 400 € affichaient tous « 11 k€ ».
  it('garde une décimale au-delà de 10 k€', () => {
    expect(norm(enKiloEuros(10_200))).toBe('10,2 k€');
    expect(norm(enKiloEuros(10_500))).not.toBe(norm(enKiloEuros(11_400)));
  });

  it('reste en euros pleins sous mille euros', () => {
    expect(norm(enKiloEuros(340))).toBe('340 €');
    expect(norm(enKiloEuros(0))).toBe('0 €');
  });

  // Math.round(-12,5) donne -12 : sans symétrie, −1 250 et +1 250 ne
  // s'arrondiraient pas pareil.
  it('arrondit les négatifs comme les positifs', () => {
    expect(norm(enKiloEuros(1_250))).toBe('1,3 k€');
    expect(norm(enKiloEuros(-1_250))).toBe('-1,3 k€');
  });
});
