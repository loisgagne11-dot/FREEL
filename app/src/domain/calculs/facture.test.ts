import { describe, expect, it } from 'vitest';
import { dateISO, euros, ratio } from '../types';
import {
  type Destinataire, type Emetteur, type Facture,
  AMENDE_PAR_MENTION, INDEMNITE_RECOUVREMENT,
  amendeMentions, mentionsAPorter, mentionsManquantes, regimeDeLaFacture,
  totaux, verifierIntegriteFacture
} from './facture';

const EMETTEUR: Emetteur = {
  nom: 'Mon Entreprise', siret: '00000000000000', adresse: '1 rue Exemple',
  codePostal: '75001', ville: 'Paris', tvaIntracom: '', enFranchise: true
};

const CLIENT_FR: Destinataire = {
  nom: 'Client France', adresse: '2 rue Exemple', siret: '00000000000001',
  pays: 'FR', tvaIntracom: '', delaiPaiementJours: 30
};

const CLIENT_DE: Destinataire = {
  nom: 'Kunde', adresse: 'Hauptstraße 1', siret: '', pays: 'DE',
  tvaIntracom: 'DE123456789', delaiPaiementJours: 30
};

function facture(m: Partial<Facture> = {}): Facture {
  return {
    numero: '2026-001',
    emiseLe: dateISO('2026-07-15'),
    emetteur: EMETTEUR,
    destinataire: CLIENT_FR,
    lignes: [{
      designation: 'Prestation de développement',
      quantite: 10, prixUnitaireHt: euros(400), tauxTva: ratio(0.20)
    }],
    ...m
  };
}

describe('régime de la facture', () => {
  it('est la franchise pour un émetteur en franchise et un client français', () => {
    expect(regimeDeLaFacture(EMETTEUR, CLIENT_FR)).toBe('franchise');
  });

  it('est la TVA française pour un assujetti et un client français', () => {
    expect(regimeDeLaFacture({ ...EMETTEUR, enFranchise: false }, CLIENT_FR))
      .toBe('tva_francaise');
  });

  // L'autoliquidation sort de la TVA française quel que soit le régime du
  // prestataire, et sa mention est différente de celle de la franchise :
  // les confondre ferait porter la mauvaise.
  it('l’autoliquidation l’emporte sur la franchise', () => {
    expect(regimeDeLaFacture(EMETTEUR, CLIENT_DE)).toBe('autoliquidation_ue');
    expect(regimeDeLaFacture({ ...EMETTEUR, enFranchise: false }, CLIENT_DE))
      .toBe('autoliquidation_ue');
  });

  // Sans numéro de TVA, rien ne prouve que le client est assujetti : la
  // prestation reste dans le champ français.
  it('n’autoliquide pas pour un client UE sans numéro de TVA', () => {
    expect(regimeDeLaFacture(EMETTEUR, { ...CLIENT_DE, tvaIntracom: '' }))
      .toBe('franchise');
  });

  it('n’autoliquide pas hors Union européenne', () => {
    expect(regimeDeLaFacture(EMETTEUR, { ...CLIENT_DE, pays: 'CH' }))
      .toBe('franchise');
  });
});

describe('totaux', () => {
  it('ne porte aucune TVA en franchise', () => {
    const t = totaux(facture());
    expect(t.totalHt).toBe(4000);
    expect(t.totalTva).toBe(0);
    expect(t.totalTtc).toBe(4000);
    expect(t.parTaux).toEqual([]);
  });

  it('calcule la TVA pour un assujetti', () => {
    const t = totaux(facture({ emetteur: { ...EMETTEUR, enFranchise: false } }));
    expect(t.totalTva).toBe(800);
    expect(t.totalTtc).toBe(4800);
  });

  // Arrondir chaque ligne puis sommer produit des écarts de centimes avec le
  // total attendu par le client.
  it('arrondit la TVA par groupe de taux, pas ligne par ligne', () => {
    const t = totaux(facture({
      emetteur: { ...EMETTEUR, enFranchise: false },
      lignes: [
        { designation: 'a', quantite: 3, prixUnitaireHt: euros(3.33), tauxTva: ratio(0.20) },
        { designation: 'b', quantite: 3, prixUnitaireHt: euros(3.33), tauxTva: ratio(0.20) }
      ]
    }));
    // 6 × 3,33 = 19,98 ; TVA 20 % = 3,996 → 4,00
    expect(t.totalHt).toBe(19.98);
    expect(t.totalTva).toBe(4);
  });

  it('détaille plusieurs taux', () => {
    const t = totaux(facture({
      emetteur: { ...EMETTEUR, enFranchise: false },
      lignes: [
        { designation: 'a', quantite: 1, prixUnitaireHt: euros(100), tauxTva: ratio(0.20) },
        { designation: 'b', quantite: 1, prixUnitaireHt: euros(100), tauxTva: ratio(0.10) }
      ]
    }));
    expect(t.parTaux.map((g) => g.taux)).toEqual([0.10, 0.20]);
    expect(t.totalTva).toBe(30);
  });

  it('n’applique aucune TVA en autoliquidation, même à taux renseigné', () => {
    const t = totaux(facture({
      emetteur: { ...EMETTEUR, enFranchise: false }, destinataire: CLIENT_DE
    }));
    expect(t.totalTva).toBe(0);
  });

  it('calcule l’échéance depuis le délai du client', () => {
    expect(totaux(facture()).echeanceLe).toBe('2026-08-14');
  });

  it('traite un délai négatif comme un paiement comptant', () => {
    const t = totaux(facture({
      destinataire: { ...CLIENT_FR, delaiPaiementJours: -5 }
    }));
    expect(t.echeanceLe).toBe('2026-07-15');
  });
});

describe('mentions obligatoires', () => {
  it('ne relève rien sur une facture complète', () => {
    expect(mentionsManquantes(facture())).toEqual([]);
  });

  it('exige un numéro, et dit pourquoi', () => {
    const m = mentionsManquantes(facture({ numero: '  ' }));
    expect(m.map((x) => x.mention)).toContain('numero');
    expect(m[0]?.message).toMatch(/séquence continue/);
  });

  it('exige l’identité et le SIRET de l’émetteur', () => {
    const m = mentionsManquantes(facture({
      emetteur: { ...EMETTEUR, nom: '', siret: '' }
    }));
    expect(m.map((x) => x.mention)).toContain('identite_emetteur');
    expect(m.map((x) => x.mention)).toContain('siret_emetteur');
  });

  it('exige l’adresse du client', () => {
    const m = mentionsManquantes(facture({
      destinataire: { ...CLIENT_FR, adresse: '' }
    }));
    expect(m.map((x) => x.mention)).toContain('adresse_destinataire');
  });

  it('exige une désignation et un montant', () => {
    const m = mentionsManquantes(facture({
      lignes: [{ designation: '', quantite: 0, prixUnitaireHt: euros(0), tauxTva: ratio(0) }]
    }));
    expect(m.map((x) => x.mention)).toContain('designation');
    expect(m.map((x) => x.mention)).toContain('montant');
  });

  // Sans le numéro de l'émetteur, l'autoliquidation ne peut pas être
  // invoquée ; sans celui du client, elle ne peut pas être justifiée.
  it('exige les deux numéros de TVA en autoliquidation', () => {
    const m = mentionsManquantes(facture({ destinataire: CLIENT_DE }));
    expect(m.map((x) => x.mention)).toContain('tva_intracom_emetteur');
  });

  it('ne réclame aucun numéro de TVA pour un client français', () => {
    const m = mentionsManquantes(facture());
    expect(m.map((x) => x.mention)).not.toContain('tva_intracom_emetteur');
  });
});

describe('coût des mentions manquantes', () => {
  it('chiffre l’amende à 15 € par mention', () => {
    const manques = mentionsManquantes(facture({ numero: '' }));
    expect(amendeMentions(manques, euros(4000))).toBe(AMENDE_PAR_MENTION.valeur);
  });

  // Le plafond évite d'annoncer une amende supérieure au montant facturé sur
  // une petite facture très incomplète.
  it('plafonne au quart du montant facturé', () => {
    const beaucoup = Array.from({ length: 10 }, () => ({
      mention: 'numero' as const, message: ''
    }));
    expect(amendeMentions(beaucoup, euros(100))).toBe(25);
  });

  it('ne chiffre rien sans manque', () => {
    expect(amendeMentions([], euros(4000))).toBe(0);
  });
});

describe('mentions à porter', () => {
  // L'omettre en facturant sans TVA laisse croire à un oubli de taxe.
  it('porte l’article 293 B en franchise', () => {
    expect(mentionsAPorter(facture()).join(' ')).toMatch(/293 B/);
  });

  it('porte l’autoliquidation pour un client assujetti de l’Union', () => {
    const m = mentionsAPorter(facture({ destinataire: CLIENT_DE })).join(' ');
    expect(m).toMatch(/Autoliquidation/);
    expect(m).toMatch(/283-2/);
    expect(m).not.toMatch(/293 B/);
  });

  it('ne porte aucune mention de TVA pour un assujetti français', () => {
    const m = mentionsAPorter(facture({
      emetteur: { ...EMETTEUR, enFranchise: false }
    })).join(' ');
    expect(m).not.toMatch(/293 B/);
    expect(m).not.toMatch(/Autoliquidation/);
  });

  // Dues de plein droit, mais réclamables seulement si la facture les annonce.
  it('annonce toujours les pénalités et l’indemnité de 40 €', () => {
    const m = mentionsAPorter(facture()).join(' ');
    expect(m).toMatch(new RegExp(`${INDEMNITE_RECOUVREMENT.valeur} €`));
    expect(m).toMatch(/L441-10/);
  });
});

describe('intégrité des données chiffrées', () => {
  it('passe son contrôle', () => {
    expect(verifierIntegriteFacture()).toEqual([]);
  });
});
