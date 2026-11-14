import { describe, expect, it } from 'vitest';
import { dateISO, euros, ratio } from '../types';
import {
  type Destinataire, type Emetteur, type Facture,
  MENTIONS_FRANCHISE, factureDepuisRecette, mentionFranchise, mentionsDuRegime, mentionsManquantes,
  nomAvecStatut, sirenDe
} from './facture';

const EMETTEUR: Emetteur = {
  nom: 'Mon Entreprise', siret: '00000000000000', adresse: '1 rue Exemple',
  codePostal: '75001', ville: 'Paris', tvaIntracom: '', enFranchise: true, iban: '', bic: ''
};
const CLIENT: Destinataire = {
  nom: 'Client démo', adresse: '2 rue Exemple', siret: '00000000000012',
  pays: 'FR', tvaIntracom: '', delaiPaiement: 'net_30'
};
const facture = (m: Partial<Facture> = {}): Facture => ({
  numero: '2026-001', emiseLe: dateISO('2026-11-14'), emetteur: EMETTEUR, destinataire: CLIENT,
  lignes: [{ designation: 'Mission', quantite: 1, prixUnitaireHt: euros(500), tauxTva: ratio(0) }], ...m
});

/**
 * Deux sources officielles divergent sur la date de bascule vers le CIBS (voir
 * `MENTIONS_FRANCHISE`). 293 B jusqu'au 31/12/2026 est juste dans les deux
 * lectures ; la formule CIBS ensuite reste une hypothèse.
 */
describe('mention de franchise datée', () => {
  it('293 B du CGI jusqu’au 31/12/2026, le CIBS dès le 01/01/2027', () => {
    expect(mentionFranchise(dateISO('2026-12-31'))).toBe('TVA non applicable, article 293 B du CGI.');
    expect(mentionFranchise(dateISO('2027-01-01'))).toMatch(/^TVA non applicable, article L\. 223-3 du code des impositions sur les biens et services \(CIBS\)\.$/);
  });

  it('la formule CIBS se dit hypothèse, sources citées', () => {
    const cibs = MENTIONS_FRANCHISE.find((m) => m.depuis === '2027-01-01');
    expect(cibs?.statut).toBe('hypothese');
    expect(cibs?.source).toMatch(/impots\.gouv\.fr.*F23208/s);
  });

  it('la facture porte la mention de SA date d’émission', () => {
    expect(mentionsDuRegime('franchise', dateISO('2027-02-01'))).toContain(mentionFranchise(dateISO('2027-02-01')));
    expect(mentionsDuRegime('franchise', dateISO('2026-11-14'))).toContain('TVA non applicable, article 293 B du CGI.');
  });
});

describe('mentions de la facture d’un indépendant', () => {
  it('« EI » accolé au nom, sans doublon', () => {
    expect(nomAvecStatut('Camille Demo')).toBe('Camille Demo EI');
    expect(nomAvecStatut('Camille Demo EI')).toBe('Camille Demo EI');
    expect(nomAvecStatut('Camille Demo, entrepreneur individuel')).toBe('Camille Demo, entrepreneur individuel');
    // « EI » dans un mot n'est pas la mention.
    expect(nomAvecStatut('Studio Deidre')).toBe('Studio Deidre EI');
    expect(nomAvecStatut('')).toBe('');
  });

  it('« Escompte pour paiement anticipé : néant » et la nature des opérations, toujours', () => {
    for (const regime of ['franchise', 'tva_francaise', 'autoliquidation_ue'] as const) {
      const m = mentionsDuRegime(regime, dateISO('2026-11-14'));
      expect(m).toContain('Escompte pour paiement anticipé : néant.');
      expect(m).toContain('Nature des opérations : prestations de services.');
    }
  });

  /** Sans TVA facturée, l'option ne règle rien : l'imprimer ferait croire le contraire. */
  it('l’option pour les débits seulement sur une facture qui porte la TVA française', () => {
    const debits = 'Option pour le paiement de la taxe d’après les débits.';
    expect(mentionsDuRegime('tva_francaise', dateISO('2026-11-14'), true)).toContain(debits);
    expect(mentionsDuRegime('tva_francaise', dateISO('2026-11-14'), false)).not.toContain(debits);
    expect(mentionsDuRegime('franchise', dateISO('2026-11-14'), true)).not.toContain(debits);
  });
});

/** Un chiffre tapé de travers donnerait sur la facture l'identité d'une autre entreprise. */
describe('SIREN du client', () => {
  it('se dérive du SIRET et se contrôle par sa clé', () => {
    expect(sirenDe('111 111 118 00012')).toBe('111111118');
    expect(sirenDe('123456782')).toBe('123456782');
    expect(sirenDe('12345678900012')).toBeNull();
    expect(sirenDe('')).toBeNull();
  });

  it('un SIRET illisible bloque l’émission ; un SIRET absent, non', () => {
    const manque = (siret: string) => mentionsManquantes(facture({ destinataire: { ...CLIENT, siret } }))
      .some((m) => m.mention === 'siren_destinataire');
    expect(manque('12345678900012')).toBe(true);
    expect(manque('00000000000012')).toBe(false);
    expect(manque('')).toBe(false);
  });
});

/** Figée à l'émission : corriger la mission ne réécrit pas un document reçu. */
it('la référence de commande se réimprime telle qu’émise', () => {
  const r = factureDepuisRecette({
    numero: '2026-001', libelle: 'Mission', montant: euros(500), emiseLe: dateISO('2026-11-14'),
    tvaCollectee: euros(0), lignes: null, referenceCommande: 'BC-DEMO-42'
  }, EMETTEUR, CLIENT);
  expect(r.cas === 'reeditee' && r.facture.referenceCommande).toBe('BC-DEMO-42');
});
