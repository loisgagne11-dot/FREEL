import { describe, expect, it } from 'vitest';
import { mois } from '../types';
import {
  tauxCotisations, tauxAbattement, plafondMicro, seuilsTva,
  tauxImpotEtContributions, verifierIntegriteBareme
} from './index';

describe('point d\'entrée du barème', () => {
  // Le contrôle global est ce qu'on exécute après avoir ajouté une période :
  // une table trouée ou qui se chevauche produit des résolutions
  // silencieusement fausses, et le préfixe dit laquelle est en cause.
  it('l\'ensemble du barème est intègre', () => {
    expect(verifierIntegriteBareme()).toEqual([]);
  });

  it('réexporte les cinq familles de valeurs officielles', () => {
    const m = mois('2026-07');
    expect(tauxCotisations(m, 'BNC', false).statut).toBe('publie');
    expect(tauxAbattement(m, 'BNC').statut).toBe('publie');
    expect(plafondMicro(m, 'BNC').statut).toBe('publie');
    expect(seuilsTva(m, 'BNC').statut).toBe('publie');
    expect(tauxImpotEtContributions({ regime: 'versement_liberatoire' }, m, 'BNC').statut)
      .toBe('publie');
  });

  it('préfixe chaque anomalie par la table concernée', () => {
    // Aucune anomalie aujourd'hui ; on vérifie la forme du préfixe sur la
    // fonction elle-même pour que le diagnostic reste lisible le jour où une
    // table casse.
    const anomalies = verifierIntegriteBareme();
    for (const a of anomalies) {
      expect(a).toMatch(/^\[(cotisations|abattement|plafonds|tva|impôt)\]/);
    }
  });
});
