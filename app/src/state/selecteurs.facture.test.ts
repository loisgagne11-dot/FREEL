import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../domain/types';
import { totaux } from '../domain/calculs/facture';
import { type Faits, faitsVides } from './schema';
import { reediterFacture } from './selecteurs.facture';

/**
 * RETROUVER UNE FACTURE DÉJÀ ÉMISE.
 *
 * Le document n'existait qu'à l'instant de l'émission, dans l'écran de
 * rédaction. Passé cet instant : plus moyen de le revoir, ni de le renvoyer à
 * un client qui dit ne pas l'avoir reçu — la réponse la plus courante à une
 * relance — ni même d'en garder une copie.
 *
 * Rien n'est stocké de plus pour autant. Le document se reconstruit depuis la
 * recette, l'entreprise et le carnet : ce qui se dérive ne se persiste pas,
 * sous peine de diverger de sa source à la première correction.
 */
describe('rééditer une facture émise', () => {
  const faits = (m: Partial<Faits> = {}): Faits => ({
    ...faitsVides(),
    entreprise: {
      ...faitsVides().entreprise,
      nom: 'Mon Entreprise', siret: '00000000000000', adresse: '1 rue Exemple',
      codePostal: '75001', ville: 'Paris',
      // Assujettie : sans quoi la TVA de la facture serait effacée à la
      // réédition, et le document contredirait l'original.
      tvaDepuis: '2025-01' as Faits['entreprise']['tvaDepuis']
    },
    clients: [{
      id: 'c1', nom: 'Client France', adresse: '2 rue Exemple', siret: '',
      email: '', delaiPaiement: 'net_30', pays: 'FR', tvaIntracom: ''
    }],
    recettes: [{
      id: 'r1', clientNom: 'Client France', libelle: 'Prestation de juin 2026, 18 j',
      montant: euros(1000), emiseLe: dateISO('2026-06-30'), encaisseeLe: null,
      modeReglement: null, numero: '2026-001', tvaCollectee: euros(200)
    }],
    ...m
  });

  it('reconstruit le document depuis les faits', () => {
    const r = reediterFacture(faits(), '2026-001');
    if (r.cas !== 'reeditee') throw new Error(`réédition attendue : ${JSON.stringify(r)}`);

    expect(r.facture.numero).toBe('2026-001');
    expect(r.facture.emetteur.nom).toBe('Mon Entreprise');
    expect(r.facture.destinataire.nom).toBe('Client France');
    // Les totaux du document retombent sur ceux de la recette : c'est la seule
    // preuve qui compte, puisque le client a reçu ces montants-là.
    expect(totaux(r.facture).totalHt).toBe(1000);
    expect(totaux(r.facture).totalTva).toBe(200);
    expect(totaux(r.facture).totalTtc).toBe(1200);
  });

  it('refuse un numéro qui ne correspond à rien', () => {
    expect(reediterFacture(faits(), '2026-999').cas).toBe('impossible');
  });

  /**
   * LE POINT DUR. Une facture émise à un client absent du carnet ne peut pas
   * être rééditée : son adresse est une mention obligatoire, et l'inventer
   * produirait un document irrégulier sous un numéro DÉJÀ UTILISÉ —
   * indiscernable de l'original pour qui le reçoit.
   */
  it('refuse quand le client n’est pas au carnet, et dit quoi faire', () => {
    const r = reediterFacture(faits({ clients: [] }), '2026-001');
    expect(r.cas).toBe('impossible');
    if (r.cas === 'impossible') {
      expect(r.motif).toMatch(/carnet/);
      expect(r.motif).toMatch(/Ajoute-le/);
    }
  });
});
