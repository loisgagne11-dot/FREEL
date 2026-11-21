import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import { type Faits, faitsVides } from './schema';
import { dossierTvaDuTrimestre } from './selecteurs.argent';
import { tvaAReverserDe } from './selecteurs';

function poser(m: Partial<Faits> = {}): Faits {
  return {
    ...faitsVides(),
    soldeInitial: euros(10_000),
    soldeInitialAu: dateISO('2026-01-01'),
    ...m
  } as Faits;
}

/**
 * LE DOSSIER ET LA PROVISION DISENT LA MÊME DETTE.
 *
 * Depuis le lot 13 la provision retient la TVA autoliquidée d'un franchisé ; le
 * dossier la taisait, et le solde déclaré différait du solde provisionné.
 */
describe('dossier de TVA et provision — accord sur les achats autoliquidés', () => {
  const T3 = [dateISO('2026-07-01'), dateISO('2026-09-30')] as const;
  const achatUe = {
    id: 'ue', libelle: 'Hébergement', fournisseur: 'Fournisseur d’essai', provenance: 'ue' as const,
    montantTtc: euros(100), tauxTva: 0.2 as never, payeeLe: dateISO('2026-08-05'),
    justificatifId: null, rapprochement: 'en_attente' as const
  };

  // Si l'accord sautait : le franchisé déclarerait 0 € alors que 20 € sont dus.
  it('franchisé : le solde du dossier est la provision, base HT = montant payé', () => {
    const faits = poser({ depenses: [achatUe] as Faits['depenses'] });
    const d = dossierTvaDuTrimestre(faits, ...T3);
    expect(d.autoliquideeBase).toBe(100);
    expect(d.autoliquideeDue).toBe(20);
    expect(d.aPayer).toBe(20);
    expect(d.aPayer).toBe(tvaAReverserDe(faits));
  });

  // Si l'accord sautait : le redevable verrait 20 € dus sans déduction, ou une
  // base lue comme HT alors que le montant est un TTC.
  it('redevable : due et déductible, solde nul comme la provision, base = TTC − TVA', () => {
    const faits = poser({
      entreprise: { ...faitsVides().entreprise, tvaDepuis: mois('2025-01') },
      depenses: [{ ...achatUe, montantTtc: euros(120) }] as Faits['depenses']
    });
    const d = dossierTvaDuTrimestre(faits, ...T3);
    expect(d.autoliquideeBase).toBe(100);
    expect(d.autoliquideeDue).toBe(20);
    expect(d.autoliquideeDeductible).toBe(20);
    expect(d.aPayer).toBe(0);
    expect(d.aPayer).toBe(tvaAReverserDe(faits));
  });

  it('un achat en France n’y figure pas', () => {
    const faits = poser({ depenses: [{ ...achatUe, provenance: 'france' as const }] as Faits['depenses'] });
    expect(dossierTvaDuTrimestre(faits, ...T3).autoliquidations).toHaveLength(0);
  });
});
