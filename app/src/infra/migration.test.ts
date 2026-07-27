import { describe, expect, it } from 'vitest';
import { CLE_INSTANTANE_AVANT_MIGRATION, CLE_STOCKAGE } from '../state/schema';
import {
  CLE_BUNDLE_LEGACY, PREFIXE_LEGACY,
  analyser, migrer, prendreInstantane, stockageMemoire, verifierAbsenceDePerte
} from './migration';

/** Un jeu de données de l'ancienne application, structurellement fidèle. */
function bundleLegacy() {
  return {
    c: {
      nom: 'Exemple', siret: '12345678901237', debut: '2025-03-02',
      typeActivite: 'BNC', acre: true, prelevementLiberatoire: false,
      tvaDepuis: '2025-10', tvaIntracom: 'FR00000000000',
      iban: 'FR0000000000000000000000000', bic: 'AAAAFRPPXXX',
      adresse: 'Ville', codeApe: '6201Z', urssafPeriodicite: 'mensuel',
      onboardingDone: true
    },
    m: [
      {
        id: 'MIS1', client: 'ClientA', description: 'Mission A', tjm: 380,
        debut: '2025-05-12', fin: '2026-03-31', statut: 'active',
        factures: [
          { id: 'F1', numero: '2026-001', montant: 4000, date: '2026-06-30', datePaiement: '2026-07-15', modeReglement: 'virement' },
          { id: 'F2', numero: '2026-002', montant: 3800, date: '2026-07-31', payee: false }
        ]
      },
      {
        id: 'MIS2', client: 'ClientInconnu', description: 'Mission B', tjm: 400,
        debut: '2026-01-05', fin: null, statut: 'terminee', factures: []
      }
    ],
    cl: [
      { id: 'CLI1', nom: 'ClientA', adresse: '', siret: '', email: '', delaiPaiement: 30 }
    ],
    t: {
      soldeInitial: 5000, salaireEstime: 2200, reserveCompte: 150,
      mouvements: [], paidCharges: {}, conges: {}, rendementActif: false
    },
    ir: { '2026': { parts: 1 } },
    _ts: 1750000000000
  };
}

const avecLegacy = () => stockageMemoire({
  [CLE_BUNDLE_LEGACY]: JSON.stringify(bundleLegacy()),
  freel_ts: '1750000000000',
  freel_theme: 'sombre'
});

describe('rapport à blanc', () => {
  it('n\'écrit rien du tout', () => {
    const s = avecLegacy();
    const avant = { ...s.contenu };
    analyser(s);
    expect(s.contenu).toEqual(avant);
  });

  it('compte ce qui serait migré', () => {
    const r = analyser(avecLegacy());
    expect(r.aDesDonneesLegacy).toBe(true);
    expect(r.comptes.clients).toBe(1);
    expect(r.comptes.missions).toBe(2);
    expect(r.comptes.recettes).toBe(2);
  });

  it('signale un stockage vierge sans crier à l\'erreur', () => {
    const r = analyser(stockageMemoire());
    expect(r.aDesDonneesLegacy).toBe(false);
    expect(r.anomalies).toHaveLength(0);
  });

  it('signale un bundle illisible comme bloquant, au lieu de repartir de zéro', () => {
    const r = analyser(stockageMemoire({ [CLE_BUNDLE_LEGACY]: '{ ceci nest pas du json' }));
    expect(r.anomalies.some((a) => a.gravite === 'bloquante')).toBe(true);
  });

  // Les champs sans destination ne doivent pas disparaître en silence.
  it('énumère les champs de l\'ancienne trésorerie non repris', () => {
    const r = analyser(avecLegacy());
    expect(r.champsNonRepris).toContain('treasury.mouvements');
    expect(r.champsNonRepris).toContain('treasury.conges');
  });

  // Sans ce fait, le volet 2 des provisions surestime la dette.
  it('avertit que les périodes déclarées sont inconnues de l\'ancien modèle', () => {
    const r = analyser(avecLegacy());
    expect(r.anomalies.some((a) => /période déclarée/i.test(a.message))).toBe(true);
  });
});

describe('conversion des données', () => {
  it('reprend l\'entreprise', () => {
    const r = migrer(avecLegacy());
    expect(r.statut).toBe('migre');
    if (r.statut !== 'migre') return;
    expect(r.faits.entreprise.nom).toBe('Exemple');
    expect(r.faits.entreprise.typeActivite).toBe('BNC');
    expect(r.faits.entreprise.acre).toBe(true);
    expect(r.faits.entreprise.tvaDepuis).toBe('2025-10');
    expect(r.faits.entreprise.debutActivite).toBe('2025-03-02');
  });

  // Le livre des recettes est une obligation à part entière, pas un
  // sous-produit d'une mission : les factures remontent au premier plan.
  it('remonte les factures imbriquées en recettes de premier niveau', () => {
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    expect(r.faits.recettes).toHaveLength(2);
    expect(r.faits.recettes[0]?.numero).toBe('2026-001');
    expect(r.faits.recettes[0]?.encaisseeLe).toBe('2026-07-15');
    expect(r.faits.recettes[0]?.modeReglement).toBe('virement');
  });

  it('rattache les missions à leur client par nom quand c\'est possible', () => {
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    expect(r.faits.missions[0]?.clientId).toBe('CLI1');
  });

  // Un rattachement impossible n'est pas une perte : le nom est conservé.
  it('conserve le nom du client quand le rattachement échoue, et le signale', () => {
    const s = avecLegacy();
    const rapport = analyser(s);
    expect(rapport.anomalies.some((a) => /ClientInconnu/.test(a.message))).toBe(true);

    const r = migrer(s);
    if (r.statut !== 'migre') throw new Error('migration attendue');
    expect(r.faits.missions[1]?.clientId).toBeNull();
    expect(r.faits.missions[1]?.clientNom).toBe('ClientInconnu');
  });

  // D4 : la réserve unifiée reprend le plancher de compte, seule des trois
  // implémentations concurrentes de l'ancienne version à être un montant.
  it('reprend la réserve, le solde initial et le besoin mensuel', () => {
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    expect(r.faits.soldeInitial).toBe(5000);
    expect(r.faits.reserve).toBe(150);
    expect(r.faits.besoinMensuel).toBe(2200);
  });

  it('lit aussi le format antérieur, une clé par entité', () => {
    const b = bundleLegacy();
    const s = stockageMemoire({
      [`${PREFIXE_LEGACY}company`]: JSON.stringify(b.c),
      [`${PREFIXE_LEGACY}missions`]: JSON.stringify(b.m),
      [`${PREFIXE_LEGACY}clients`]: JSON.stringify(b.cl),
      [`${PREFIXE_LEGACY}treasury`]: JSON.stringify(b.t)
    });
    const r = analyser(s);
    expect(r.aDesDonneesLegacy).toBe(true);
    expect(r.comptes.missions).toBe(2);
  });
});

describe('invariant d\'absence de perte', () => {
  it('ne perd ni client, ni mission, ni recette, ni euro', () => {
    const legacy = bundleLegacy();
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    expect(verifierAbsenceDePerte(legacy as never, r.faits)).toEqual([]);
  });

  it('détecte une perte si elle survenait', () => {
    const legacy = bundleLegacy();
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    const ampute = { ...r.faits, recettes: r.faits.recettes.slice(1) };
    expect(verifierAbsenceDePerte(legacy as never, ampute)).not.toEqual([]);
  });
});

describe('instantané et sécurité de l\'écriture', () => {
  it('archive toutes les clés de l\'ancienne application', () => {
    const s = avecLegacy();
    const instantane = prendreInstantane(s);
    expect(Object.keys(instantane)).toContain(CLE_BUNDLE_LEGACY);
    expect(Object.keys(instantane)).toContain('freel_ts');
    expect(Object.keys(instantane)).toContain('freel_theme');
  });

  it('écrit l\'instantané avant les faits migrés', () => {
    const s = avecLegacy();
    migrer(s);
    expect(s.contenu[CLE_INSTANTANE_AVANT_MIGRATION]).toBeDefined();
    expect(s.contenu[CLE_STOCKAGE]).toBeDefined();
  });

  // Le legacy doit rester lisible : c'est la condition de sa cohabitation
  // en lecture seule.
  it('ne supprime aucune clé de l\'ancienne application', () => {
    const s = avecLegacy();
    migrer(s);
    expect(s.contenu[CLE_BUNDLE_LEGACY]).toBeDefined();
    expect(s.contenu['freel_ts']).toBe('1750000000000');
  });

  it('interrompt la migration plutôt que d\'écrire sans filet quand l\'archive échoue', () => {
    const s = avecLegacy();
    const setItem = s.setItem.bind(s);
    // Simule un stockage qui refuse d'écrire l'archive (quota dépassé).
    (s as { setItem: (c: string, v: string) => void }).setItem = (cle, valeur) => {
      if (cle === CLE_INSTANTANE_AVANT_MIGRATION) throw new Error('QuotaExceededError');
      setItem(cle, valeur);
    };
    const r = migrer(s);
    expect(r.statut).toBe('echec');
    expect(s.contenu[CLE_STOCKAGE]).toBeUndefined();
  });
});

describe('idempotence', () => {
  it('une seconde migration ne réécrit rien et rend les faits existants', () => {
    const s = avecLegacy();
    const premiere = migrer(s);
    if (premiere.statut !== 'migre') throw new Error('migration attendue');
    const apresPremiere = s.contenu[CLE_STOCKAGE];

    const seconde = migrer(s);
    expect(seconde.statut).toBe('deja-migre');
    expect(s.contenu[CLE_STOCKAGE]).toBe(apresPremiere);
  });

  it('ne duplique pas les recettes en cas de relance', () => {
    const s = avecLegacy();
    migrer(s);
    const seconde = migrer(s);
    if (seconde.statut !== 'deja-migre') throw new Error('deja-migre attendu');
    expect(seconde.faits.recettes).toHaveLength(2);
  });

  it('refuse d\'écraser un stockage nouveau devenu illisible', () => {
    const s = avecLegacy();
    s.setItem(CLE_STOCKAGE, '{ corrompu');
    const r = migrer(s);
    expect(r.statut).toBe('echec');
    expect(s.contenu[CLE_STOCKAGE]).toBe('{ corrompu');
  });

  it('rend des faits vides sans rien écrire quand il n\'y a rien à migrer', () => {
    const s = stockageMemoire();
    const r = migrer(s);
    expect(r.statut).toBe('rien-a-migrer');
    expect(s.contenu[CLE_STOCKAGE]).toBeUndefined();
  });
});
