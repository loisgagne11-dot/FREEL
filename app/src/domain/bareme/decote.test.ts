import { describe, expect, it } from 'vitest';
import { mois } from '../types';
import {
  baremeIR, decote, impotDuFoyer, situationDecote, situationDecoteDecisive, surcroitDImpot
} from './impot';

/**
 * Les cas se calent sur le barème des revenus 2024, seul millésime PUBLIÉ :
 * tranches 11 497 / 29 315 €, décote 889 € (seul) et 1 470 € (imposition
 * commune) moins 45,25 % de l'impôt brut — BOFiP BOI-IR-LIQ-20-20-30 du
 * 14/04/2025. Chaque montant attendu se refait à la main.
 */
const bareme = baremeIR(mois('2024-06'));
if (bareme.statut !== 'publie') throw new Error('barème 2024 attendu publié');
const { tranches, decote: parametres } = bareme.valeur;
const seul = { parametres, situation: 'seul' as const };
const commune = { parametres, situation: 'commune' as const };
const inconnue = { parametres, situation: null };

describe('la décote', () => {
  it('retranche plafond − 45,25 % de l’impôt brut', () => {
    // 889 − 452,50 = 436,50 ; 1 470 − 1 357,50 = 112,50.
    expect(decote(1000, 'seul', parametres)).toBeCloseTo(436.5, 2);
    expect(decote(3000, 'commune', parametres)).toBeCloseTo(112.5, 2);
  });

  it('ne dépasse jamais l’impôt brut', () => {
    // 1 470 − 452,50 = 1 017,50, ramené aux 1 000 € d'impôt : il ne reste rien.
    expect(decote(1000, 'commune', parametres)).toBe(1000);
  });

  it('s’éteint à 1 965 € d’impôt brut seul, 3 249 € en couple', () => {
    expect(decote(1965, 'seul', parametres)).toBe(0);
    expect(decote(3249, 'commune', parametres)).toBe(0);
    expect(decote(1960, 'seul', parametres)).toBeGreaterThan(0);
  });

  it('s’applique à l’impôt du foyer', () => {
    // 20 000 € pour une part : (20 000 − 11 497) × 11 % = 935,33 brut ;
    // décote 889 − 423,24 = 465,76 → 469,57.
    expect(impotDuFoyer(20000, 1, tranches, seul)).toBe(469.57);
    expect(impotDuFoyer(20000, 1, tranches)).toBe(935.33);
  });
});

/**
 * LA DÉCOTE NE JOUE PAS TOUJOURS DANS LE SENS QU'ON CROIT.
 *
 * Le comparateur l'écartait parce qu'elle « allège l'impôt des revenus
 * modestes ». Pour le foyer, oui ; pour ce que l'activité AJOUTE, pas
 * toujours : là où elle s'éteint, chaque euro d'impôt brut retire 45,25
 * centimes de décote.
 */
describe('ce que l’activité ajoute, décote comprise', () => {
  it('coûte plus que le barème seul quand le foyer est dans la zone où elle s’éteint', () => {
    // Une part, 20 000 € d'autres revenus, 6 000 € d'activité imposable :
    // 660 € au barème seul, 1 428,22 − 469,57 = 958,65 € avec la décote.
    expect(surcroitDImpot(6000, 20000, 0, 1, tranches)).toBe(660);
    expect(surcroitDImpot(6000, 20000, 0, 1, tranches, seul)).toBe(958.65);
  });

  it('coûte moins quand le foyer partait d’un impôt nul', () => {
    // 12 000 € d'autres revenus : impôt nul sans l'activité, 150,02 € avec.
    expect(surcroitDImpot(6000, 12000, 0, 1, tranches, seul)).toBe(150.02);
  });
});

/**
 * LA SITUATION DU FOYER SE DÉCLARE, ELLE NE SE DEVINE PAS.
 *
 * Deux parts disent « couple » aussi bien que « parent isolé ». Inconnue, la
 * situation fait retenir le plus haut des deux surcroîts — qui n'est pas
 * toujours celui de la personne seule.
 */
describe('situation du foyer', () => {
  it('se déduit sous deux parts, se déclare au-delà', () => {
    expect(situationDecote(1, null)).toBe('seul');
    expect(situationDecote(1.5, null)).toBe('seul');
    expect(situationDecote(2, null)).toBeNull();
    expect(situationDecote(2, false)).toBe('seul');
    expect(situationDecote(2, true)).toBe('commune');
  });

  it('inconnue, retient le surcroît le plus haut — ici celui du couple', () => {
    // Deux parts, 46 000 € d'autres revenus, 6 000 € d'activité : 660 € seul,
    // 958,65 € en couple, dont la décote s'éteint plus haut.
    expect(surcroitDImpot(6000, 46000, 0, 2, tranches, seul)).toBe(660);
    expect(surcroitDImpot(6000, 46000, 0, 2, tranches, commune)).toBe(958.65);
    expect(surcroitDImpot(6000, 46000, 0, 2, tranches, inconnue)).toBe(958.65);
  });

  it('inconnue, retient le surcroît le plus haut — ici celui de la personne seule', () => {
    const s = surcroitDImpot(10000, 30000, 0, 2, tranches, seul);
    const c = surcroitDImpot(10000, 30000, 0, 2, tranches, commune);
    expect(s).toBeGreaterThan(c);
    expect(surcroitDImpot(10000, 30000, 0, 2, tranches, inconnue)).toBe(s);
  });

  it('n’est réclamée que si elle change le montant', () => {
    expect(situationDecoteDecisive(6000, 46000, 0, 2, tranches, inconnue)).toBe(true);
    // Bien au-dessus de 3 249 € d'impôt brut, aucune décote ne joue.
    expect(situationDecoteDecisive(40000, 80000, 0, 2, tranches, inconnue)).toBe(false);
    expect(situationDecoteDecisive(6000, 46000, 0, 2, tranches, commune)).toBe(false);
  });
});

describe('barème des revenus 2025 (loi n° 2026-103)', () => {
  const b25 = baremeIR(mois('2025-06'));
  if (b25.statut !== 'publie') throw new Error('barème 2025 attendu publié');

  // À la main, personne seule, 1 part, 20 000 € imposables :
  //   brut     = (20 000 − 11 600) × 11 % = 924 €
  //   décote   = 897 − 45,25 % × 924 = 897 − 418,11 = 478,89 €
  //   impôt    = 924 − 478,89 = 445,11 €
  // Garder le barème 2024 donnerait ~ 469,5 € : une provision d'impôt fausse
  // de plus de 20 € sur chaque déclaration 2026.
  it('calcule l’impôt 2025 d’une personne seule avec décote', () => {
    const impot = impotDuFoyer(20000, 1, b25.valeur.tranches, {
      parametres: b25.valeur.decote, situation: 'seul'
    });
    expect(impot).toBeCloseTo(445.11, 2);
  });

  it('reprend le barème 2025 en hypothèse pour 2026, sans le publier', () => {
    const r = baremeIR(mois('2026-03'));
    expect(r.statut).toBe('hypothese');
    expect(r.statut === 'hypothese' && r.depuis).toBe('2025-01');
    expect(r.statut !== 'refuse' && r.valeur.decote.plafondCommune).toBe(1483);
  });
});
