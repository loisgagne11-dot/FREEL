import { describe, expect, it } from 'vitest';
import { CLE_INSTANTANE_AVANT_MIGRATION, CLE_STOCKAGE } from '../state/schema';
import {
  CLE_BUNDLE_LEGACY, PREFIXE_LEGACY, type ResultatMigration, type Stockage,
  migrer as detecter, prendreInstantane, presenceLegacy, stockageMemoire
} from './migration';
import { analyser, reprendreLegacy, verifierAbsenceDePerte } from './migration.legacy';

/**
 * La migration complète : détection, puis reprise.
 *
 * C'est exactement ce que fait `initialiser` — la détection est synchrone et
 * vit dans le paquet d'entrée, la reprise est chargée à la demande. Les tests
 * exercent la COMPOSITION des deux, pas l'une ou l'autre isolément, parce que
 * c'est la composition qui doit tenir ses promesses.
 */
function migrer(stockage: Stockage): ResultatMigration {
  const detection = detecter(stockage);
  return detection.statut === 'reprise-requise' ? reprendreLegacy(stockage) : detection;
}

/**
 * Un jeu de données de l'ancienne application, structurellement fidèle.
 *
 * ⚠️ Les noms de champs sont RELEVÉS de `index.html`, jamais supposés. Une
 * version antérieure de ce fichier employait `montant`, `date`, `datePaiement`
 * et `payee` — des noms plausibles, tous absents du legacy, qui emploie `ht`,
 * `dateEnvoi`, `datePaiementReel` et `status`. Le jeu d'essai reproduisait donc
 * la supposition du code de migration : il passait, et ne prouvait rien.
 *
 * Toute modification ici doit être vérifiée contre le legacy, par exemple
 * `grep -ohE "f\.[a-zA-Z]+" index.html | sort | uniq -c | sort -rn`.
 */
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
          // Facture encaissée : `status` à « payée » et `datePaiementReel`.
          {
            id: 'F1', numero: '2026-001', ht: 4000, ttc: 4000, jours: 10,
            mois: '2026-06', dateEnvoi: '2026-06-30', status: 'payée',
            datePaiementReel: '2026-07-15', modeReglement: 'virement'
          },
          // Facture émise, non réglée.
          {
            id: 'F2', numero: '2026-002', ht: 3800, ttc: 3800, jours: 10,
            mois: '2026-07', dateEnvoi: '2026-07-31', status: 'envoyée'
          },
          // Variante « payé » sans accent, écrite ailleurs dans le legacy, et
          // datée seulement au mois : les deux cas doivent être repris.
          {
            id: 'F3', numero: '2026-003', ht: 1200, mois: '2026-05',
            status: 'payé', datePaiementReel: '2026-05-28'
          }
        ]
      },
      {
        id: 'MIS2', client: 'ClientInconnu', description: 'Mission B', tjm: 400,
        debut: '2026-01-05', fin: null, statut: 'en_cours', factures: [],
        // Le rythme : lundi à jeudi pleins, vendredi à mi-temps.
        periodes: [{
          debut: '2026-01-05', fin: '2026-12-31',
          joursMap: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 0.5 },
          joursSemaine: 4.5, tjm: 450
        }],
        // Les ajustements, rangés par mois côté legacy. Le zéro est le cas le
        // plus important : « ce jour prévu, je n'ai pas travaillé ».
        lignes: [
          { ym: '2026-09', ajustements: { '2026-09-14': 0, '2026-09-15': 0.5 } },
          { ym: '2026-10', ajustements: { '2026-10-05': 1 } }
        ],
        // Là où l'application écrit RÉELLEMENT les congés — avec le suffixe
        // `_half` des demi-journées.
        congesDates: ['2026-09-07', '2026-09-08_half', '2026-08-10']
      },
      {
        // Le cas de l'agence : deux clients FINAUX derrière un même donneur
        // d'ordre, chacun avec son rythme hebdomadaire.
        id: 'MIS3', client: 'ClientA', description: 'Mission via agence', tjm: 500,
        debut: '2026-01-01', fin: '2026-12-31', statut: 'en_cours', factures: [],
        periodes: [{
          debut: '2026-01-01', fin: '2026-12-31',
          joursMap: { lun: 1, mar: 1, mer: 1, jeu: 1 }, joursSemaine: 4, tjm: 500
        }],
        entites: [
          { id: 'e1', nom: 'Client final A', couleur: '#22c55e',
            joursParSemaine: { lun: 1, mar: 1 }, email: 'a@exemple.fr' },
          { id: 'e2', nom: 'Client final B', couleur: '#38bdf8',
            joursParSemaine: { mer: 1, jeu: 0.5 } }
        ]
      }
    ],
    cl: [
      { id: 'CLI1', nom: 'ClientA', adresse: '', siret: '', email: '', delaiPaiement: 30 }
    ],
    t: {
      soldeInitial: 5000, salaireEstime: 2200, reserveCompte: 150,
      mouvements: [
        // Saisie en TTC : l'ancien modèle gardait le HT dans `montant` et
        // calculait la TVA déductible au moment de la saisie.
        {
          id: 'CH1', type: 'Charge', categorie: 'Logiciels', description: 'Abonnement',
          montant: 100, montantTTC: 120, tvaDeductible: 20, tvaRate: 20,
          mois: '2026-06', date: '2026-06-04'
        },
        // Saisie en HT, sans TVA : `montantTTC` absent.
        {
          id: 'CH2', type: 'Charge', categorie: 'Banque', description: 'Frais de tenue',
          montant: 12, tvaRate: 0, mois: '2026-06', date: '2026-06-30'
        },
        // Datée au mois seulement — cas courant des saisies rétroactives.
        {
          id: 'CH3', type: 'Charge', categorie: 'Déplacements', description: 'Train',
          montant: 80, montantTTC: 88, tvaRate: 10, mois: '2026-05'
        },
        // Ni date ni mois exploitables.
        { id: 'CH4', type: 'Charge', categorie: '', description: 'Sans date', montant: 40 },
        // Charges FISCALES ET SOCIALES : elles ne sont pas des achats et ne
        // doivent pas atterrir dans les dépenses.
        {
          id: 'CH5', type: 'Charge', categorie: 'URSSAF', description: 'Cotisations T2',
          montant: 2400, date: '2026-07-05'
        },
        {
          id: 'CH6', type: 'Charge', categorie: 'CFE', description: 'Cotisation foncière',
          montant: 510, date: '2026-12-15'
        },
        // Pas une dépense : ne doit pas être repris comme telle.
        { id: 'SAL1', type: 'Salaire', montant: 1500, mois: '2026-06', date: '2026-06-28' }
      ],
      paidCharges: {},
      // Format d'origine : les numéros de jour groupés par mois.
      conges: { '2026-08': [10, 11, 12], '2026-12': [24, 31], '2026-02': [30] },
      rendementActif: false
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
    expect(r.comptes.missions).toBe(3);
    expect(r.comptes.recettes).toBe(3);
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
    expect(r.champsNonRepris).toContain('treasury.paidCharges');
    // Les charges deviennent des dépenses ; le reste des mouvements — salaires,
    // apports — n'a pas encore de place et doit être annoncé comme tel.
    expect(r.champsNonRepris).toContain('treasury.mouvements (hors charges)');
  });

  it('compte les dépenses qui seraient reprises', () => {
    expect(analyser(avecLegacy()).comptes.depenses).toBe(4);
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
    expect(r.faits.recettes).toHaveLength(3);
    expect(r.faits.recettes[0]).toMatchObject({
      numero: '2026-001',
      // Le montant vient de `ht` : c'est l'assiette du chiffre d'affaires en
      // micro. Une version antérieure cherchait `montant`, absent du legacy,
      // et chargeait donc toutes les recettes à zéro.
      montant: 4000,
      emiseLe: '2026-06-30',
      encaisseeLe: '2026-07-15',
      modeReglement: 'virement'
    });
  });

  // Sans cette reprise, le chiffre d'affaires encaissé, les provisions et le
  // livre des recettes restaient vides malgré une migration en apparence
  // réussie.
  it('reconnaît un encaissement quel que soit l\'accent du statut legacy', () => {
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    const parNumero = new Map(r.faits.recettes.map((x) => [x.numero, x]));
    expect(parNumero.get('2026-001')?.encaisseeLe).toBe('2026-07-15'); // « payée »
    expect(parNumero.get('2026-003')?.encaisseeLe).toBe('2026-05-28'); // « payé »
    expect(parNumero.get('2026-002')?.encaisseeLe).toBeNull();         // « envoyée »
  });

  /**
   * Le livre des recettes ne reçoit QUE ce qui a été émis.
   *
   * L'ancienne application fabrique une facture par mois à venir de chaque
   * mission, jusqu'à sa date de fin, avec `status: 'brouillon'` — une
   * projection de chiffre d'affaires, pas une facture. Les importer remplissait
   * le registre d'écritures datées dans le futur.
   *
   * Constaté le 12/08 sur des données réelles : des écritures datées de
   * janvier 2027, un « facturé sur l'année » deux fois trop élevé, des
   * « factures en retard » qui n'ont jamais existé, et des périodes à
   * déclarer sur du néant.
   */
  it('n\'inscrit pas les brouillons au livre des recettes', () => {
    const stockage = avecLegacy();
    const bundle = JSON.parse(stockage.getItem(CLE_BUNDLE_LEGACY) as string) as Record<string, unknown>;
    const missions = bundle['m'] as Record<string, unknown>[];
    (missions[0]!['factures'] as unknown[]).push(
      { id: 'F-futur-1', mois: '2026-11', ht: 9460, status: 'brouillon' },
      { id: 'F-futur-2', mois: '2027-01', ht: 8600, status: 'brouillon' }
    );
    stockage.setItem(CLE_BUNDLE_LEGACY, JSON.stringify(bundle));

    const r = migrer(stockage);
    if (r.statut !== 'migre') throw new Error('migration attendue');

    expect(r.faits.recettes).toHaveLength(3);
    expect(r.faits.recettes.some((x) => x.id.startsWith('F-futur'))).toBe(false);
    // Aucune écriture postérieure au dernier encaissement réel : le registre
    // ne projette pas.
    expect(r.faits.recettes.every((x) => (x.emiseLe ?? '') < '2026-08')).toBe(true);
  });

  // Écarter n'est pas perdre : ce qui n'entre pas doit être dit, avec son
  // montant, sinon l'utilisateur croit à une disparition.
  it('signale les brouillons écartés, avec leur nombre et leur total', () => {
    const stockage = avecLegacy();
    const bundle = JSON.parse(stockage.getItem(CLE_BUNDLE_LEGACY) as string) as Record<string, unknown>;
    const missions = bundle['m'] as Record<string, unknown>[];
    (missions[0]!['factures'] as unknown[]).push(
      { id: 'F-futur-1', mois: '2026-11', ht: 1000, status: 'brouillon' },
      { id: 'F-futur-2', mois: '2027-01', ht: 2000, status: 'brouillon' }
    );
    stockage.setItem(CLE_BUNDLE_LEGACY, JSON.stringify(bundle));

    const rapport = analyser(stockage);
    const signalement = rapport.anomalies.find((a) => /brouillon/i.test(a.message));
    expect(signalement).toBeDefined();
    expect(signalement?.message).toContain('2 facture');
    expect(signalement?.message).toContain('3000');
  });

  // Perdre la date d'émission empêcherait la déclaration européenne de
  // services de voir la prestation.
  it('retombe sur le mois de la facture quand la date d\'envoi manque', () => {
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    const f3 = r.faits.recettes.find((x) => x.numero === '2026-003');
    expect(f3?.emiseLe).toBe('2026-05-01');
  });

  // « en_cours » et « perdue » existent dans le legacy. Tout rabattre sur
  // « active » faisait compter le prévisionnel d'une mission perdue.
  it('traduit les statuts de mission du legacy', () => {
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    expect(r.faits.missions[1]?.statut).toBe('active'); // « en_cours »
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
    expect(r.comptes.missions).toBe(3);
  });
});

describe('reprise des charges en dépenses', () => {
  function depenses() {
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    return r.faits.depenses;
  }

  it('ne reprend que les mouvements de type Charge', () => {
    expect(depenses().map((d) => d.id)).toEqual(['CH1', 'CH2', 'CH3', 'CH4']);
  });

  // L'ancien modèle gardait le HT dans `montant` ; la dépense se raisonne en
  // TTC, parce que c'est le montant réellement sorti du compte.
  it('reprend le TTC quand il existe, et le montant seul sinon', () => {
    const [ch1, ch2] = depenses();
    expect(ch1?.montantTtc).toBe(120);
    expect(ch2?.montantTtc).toBe(12);
  });

  it('convertit le taux de TVA en ratio', () => {
    const [ch1, ch2, ch3] = depenses();
    expect(ch1?.tauxTva).toBe(0.20);
    expect(ch2?.tauxTva).toBe(0);
    expect(ch3?.tauxTva).toBe(0.10);
  });

  // Le point central : l'ancienne application annonçait une TVA déductible
  // sans qu'aucune pièce n'existe nulle part. La migration ne peut pas les
  // inventer, et ne doit pas faire comme si elles étaient là.
  it('pose toutes les pièces comme manquantes, sans exception', () => {
    expect(depenses().every((d) => d.justificatifId === null)).toBe(true);
  });

  it('le dit dans le rapport, chiffres à l\'appui', () => {
    const r = analyser(avecLegacy());
    expect(r.anomalies.some((a) => /sans justificatif/i.test(a.message))).toBe(true);
  });

  it('retient le premier du mois quand seul le mois était saisi', () => {
    expect(depenses()[2]?.payeeLe).toBe('2026-05-01');
  });

  // Fabriquer une date plausible rattacherait la dépense à un exercice et à un
  // régime de TVA choisis au hasard.
  it('laisse la date vide plutôt que d\'en inventer une, et le signale', () => {
    expect(depenses()[3]?.payeeLe).toBeNull();
    const r = analyser(avecLegacy());
    expect(r.anomalies.some((a) => /sans date exploitable/i.test(a.message))).toBe(true);
  });

  it('conserve la catégorie faute de fournisseur, plutôt que de la perdre', () => {
    expect(depenses()[0]?.fournisseur).toBe('Logiciels');
  });

  // Aucune provenance n'était saisie : la supposer française était déjà
  // l'hypothèse implicite de l'ancienne application. On la rend explicite.
  it('répute les achats français, à requalifier à la main', () => {
    expect(depenses().every((d) => d.provenance === 'france')).toBe(true);
  });

  it('ne prétend pas qu\'un compte bancaire est relié', () => {
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    expect(r.faits.mouvementsBancaires).toEqual([]);
  });
});

describe('reprise des congés', () => {
  function conges() {
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    return r.faits.conges;
  }

  // Le format par mois obligeait à reconstruire une date à chaque lecture et
  // rendait impossible une plage à cheval sur deux mois.
  it('convertit les numéros de jour en dates pleines, triées', () => {
    // Le jeu d'essai porte aussi des congés sur les missions : on isole ici
    // ceux qui viennent de l'ancien format par mois.
    const dates = conges().map((c) => c.date);
    expect(dates).toEqual([...dates].sort());
    ['2026-08-11', '2026-08-12', '2026-12-24', '2026-12-31'].forEach((d) => {
      expect(dates).toContain(d);
    });
  });

  // Reporter silencieusement un 30 février sur le 2 mars poserait un congé un
  // jour où l'utilisateur travaillait.
  it('écarte un jour qui n\'existe pas dans son mois', () => {
    expect(conges().some((c) => c.date.startsWith('2026-02'))).toBe(false);
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

  it('détecte aussi une dépense perdue en route', () => {
    const legacy = bundleLegacy();
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    const ampute = { ...r.faits, depenses: r.faits.depenses.slice(1) };
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
    expect(seconde.faits.recettes).toHaveLength(3);
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

/**
 * Les congés, là où l'ancienne application les écrit vraiment.
 *
 * `treasury.conges` existe dans ses valeurs par défaut — un `{}` commenté —
 * mais rien ne l'alimente : l'écriture réelle se fait dans
 * `mission.congesDates`. La conversion lisait donc un objet vide pendant que
 * les congés de l'utilisateur étaient ailleurs, et son calendrier arrivait
 * vierge. Même famille d'erreur que `ht` contre `montant` sur les factures.
 */
describe('congés des missions', () => {
  const conges = () => {
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    return r.faits.conges;
  };

  it('reprend les congés posés sur les missions', () => {
    const parDate = new Map<string, number>(conges().map((c) => [c.date, c.quotite]));
    expect(parDate.get('2026-09-07')).toBe(1);
  });

  /**
   * La demi-journée n'est pas un raffinement : la compter pour une journée
   * entière gonfle le solde de congés ET fausse l'occupation du mois, dans le
   * même mouvement.
   */
  it('reconnaît le suffixe des demi-journées', () => {
    const parDate = new Map<string, number>(conges().map((c) => [c.date, c.quotite]));
    expect(parDate.get('2026-09-08')).toBe(0.5);
  });

  // L'ancien format par mois est conservé en repli : rien ne dit qu'aucune
  // installation ne l'a jamais rempli.
  it('réunit les deux sources sans rien perdre', () => {
    const dates = conges().map((c) => c.date);
    expect(dates).toContain('2026-09-07');   // mission.congesDates
    expect(dates).toContain('2026-12-24');   // treasury.conges
  });

  /**
   * Une même date posée sur deux missions reste UN jour : la personne ne peut
   * pas être deux fois en vacances. Et la quotité la plus forte l'emporte —
   * retenir la moitié amputerait le solde de l'utilisateur.
   */
  it('ne compte jamais deux fois le même jour', () => {
    const aout = conges().filter((c) => c.date === '2026-08-10');
    expect(aout).toHaveLength(1);
    expect(aout[0]?.quotite).toBe(1);
  });
});

/**
 * Le rythme et les ajustements — les deux faits qui remplissent le planning.
 *
 * Sans eux, le planning de la nouvelle application resterait vide et il
 * faudrait tout ressaisir, alors que la donnée existe depuis toujours dans
 * `mission.periodes[].joursMap` et `mission.lignes[].ajustements`.
 */
describe('rythme et ajustements', () => {
  const mission = () => {
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    const m = r.faits.missions.find((x) => x.id === 'MIS2');
    if (m === undefined) throw new Error('mission attendue');
    return m;
  };

  it('reprend le rythme, jour de semaine par jour de semaine', () => {
    const [rythme] = mission().entites[0]?.rythmes ?? [];
    expect(rythme).toMatchObject({ du: '2026-01-05', au: '2026-12-31', tjm: 450 });
    expect(rythme?.parJour).toEqual({ lun: 1, mar: 1, mer: 1, jeu: 1, ven: 0.5 });
  });

  it('met les ajustements à plat, par date', () => {
    expect(mission().entites[0]?.ajustements).toEqual({
      '2026-09-14': 0, '2026-09-15': 0.5, '2026-10-05': 1
    });
  });

  /**
   * Le zéro est le cas le plus important : il dit « ce jour-là, prévu par le
   * rythme, je n'ai pas travaillé ». Le filtrer laisserait le rythme le
   * remettre, et le CRA facturerait un jour qui n'a pas eu lieu.
   */
  it('conserve un ajustement à zéro', () => {
    expect(mission().entites[0]?.ajustements['2026-09-14']).toBe(0);
  });

  // Une mission sans période n'a pas de rythme : rien à inventer.
  it('n’invente pas de rythme quand la mission n’en a pas', () => {
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    const sansRythme = r.faits.missions.find((x) => x.id === 'MIS1');
    expect(sansRythme?.entites[0]?.rythmes).toEqual([]);
    expect(sansRythme?.entites[0]?.ajustements).toEqual({});
  });
});

/**
 * LE TRI QUI MANQUAIT.
 *
 * L'ancienne application rangeait tout sous « Charge » : cotisations URSSAF,
 * TVA reversée, avis d'impôt, CFE — et abonnements logiciels. La migration les
 * reprenait TOUS en dépenses.
 *
 * Or une cotisation sociale n'est pas un achat : en micro elle n'est pas
 * déductible, et elle ne porte aucune TVA. Les importer en dépenses gonflait
 * l'écran Achats de lignes qui n'y ont pas leur place, et leur faisait réclamer
 * un justificatif de TVA qu'elles n'auront jamais.
 */
describe('charges fiscales et sociales', () => {
  function faits() {
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    return r.faits;
  }

  it('les reprend en échéances, pas en dépenses', () => {
    expect(faits().echeances.map((e) => e.id)).toEqual(['CH5', 'CH6']);
    expect(faits().depenses.map((d) => d.id)).not.toContain('CH5');
  });

  it('leur donne la bonne nature', () => {
    const [urssaf, cfe] = faits().echeances;
    expect(urssaf?.nature).toBe('urssaf');
    expect(cfe?.nature).toBe('cfe');
  });

  /**
   * Elles arrivent PAYÉES : le mouvement existait parce que l'argent était
   * sorti. Les importer « à payer » ferait provisionner une seconde fois une
   * somme déjà retranchée du solde bancaire.
   */
  it('les marque payées', () => {
    expect(faits().echeances.every((e) => e.payeeLe !== null)).toBe(true);
  });

  it('reprend le montant tel quel, sans TVA à isoler', () => {
    expect(faits().echeances[0]?.montant).toBe(2400);
  });

  // Une dépense professionnelle reste une dépense : le tri porte sur la
  // catégorie, pas sur le type de mouvement.
  it('laisse les vraies dépenses où elles sont', () => {
    expect(faits().depenses.map((d) => d.id)).toEqual(['CH1', 'CH2', 'CH3', 'CH4']);
  });
});

/**
 * LE CAS DE L'AGENCE.
 *
 * L'ancienne application portait TROIS sources pour une même journée : le
 * rythme de la mission, le rythme de chaque entité, et une table `entiteByDay`
 * pour arbitrer. Rien n'indiquait laquelle faisait foi. Le nouveau schéma n'en
 * garde qu'une — le rythme appartient au client opérationnel.
 */
describe('clients opérationnels repris du legacy', () => {
  function mission3() {
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    const m = r.faits.missions.find((x) => x.id === 'MIS3');
    if (m === undefined) throw new Error('MIS3 attendue');
    return m;
  }

  it('reprend un client opérationnel par entité', () => {
    expect(mission3().entites.map((e) => e.nom))
      .toEqual(['Client final A', 'Client final B']);
  });

  it('conserve leurs coordonnées et leur teinte', () => {
    const [a] = mission3().entites;
    expect(a?.couleur).toBe('#22c55e');
    expect(a?.email).toBe('a@exemple.fr');
  });

  /**
   * Chacun garde SON rythme. Reprendre en plus celui de la mission — qui était
   * la somme approximative des deux — compterait les journées deux fois.
   */
  it('donne à chacun son propre rythme', () => {
    const [a, b] = mission3().entites;
    expect(a?.rythmes[0]?.parJour).toEqual({ lun: 1, mar: 1 });
    expect(b?.rythmes[0]?.parJour).toEqual({ mer: 1, jeu: 0.5 });
  });

  it('étend leur semaine type à la durée de la mission', () => {
    const [a] = mission3().entites;
    expect(a?.rythmes[0]?.du).toBe('2026-01-01');
    expect(a?.rythmes[0]?.au).toBe('2026-12-31');
  });

  /**
   * Une mission sans entité devient une mission à UN client opérationnel, qui
   * reprend le rythme de la mission tel quel. Le planning d'hier redonne
   * exactement les mêmes journées.
   */
  it('donne un client opérationnel unique aux missions qui n’en avaient pas', () => {
    const r = migrer(avecLegacy());
    if (r.statut !== 'migre') throw new Error('migration attendue');
    const m2 = r.faits.missions.find((x) => x.id === 'MIS2');
    expect(m2?.entites).toHaveLength(1);
    expect(m2?.entites[0]?.rythmes[0]?.parJour)
      .toEqual({ lun: 1, mar: 1, mer: 1, jeu: 1, ven: 0.5 });
  });
});

/**
 * LA COUTURE ENTRE LE NOYAU ET LA REPRISE.
 *
 * Le convertisseur de l'ancienne application ne sert qu'une fois, et jamais à
 * qui n'a pas connu la version précédente : il est chargé à la demande. Le
 * noyau ne fait plus que le CONSTATER — et ce constat doit être exact, sinon
 * on charge un module pour rien, ou pire, on conclut « rien à migrer » sur
 * des données bien présentes.
 */
describe('détection sans conversion', () => {
  it('constate l’ancien sans le convertir', () => {
    const detection = detecter(avecLegacy());
    expect(detection.statut).toBe('reprise-requise');
  });

  it('ne demande aucune reprise sur un stockage vierge', () => {
    const detection = detecter(stockageMemoire());
    expect(detection.statut).toBe('rien-a-migrer');
  });

  // Idempotence : déjà migré, donc rien à reprendre, donc rien à charger.
  it('ne demande aucune reprise quand la migration a déjà eu lieu', () => {
    const s = avecLegacy();
    migrer(s);
    expect(detecter(s).statut).toBe('deja-migre');
  });

  it('reconnaît le format antérieur, une clé par entité', () => {
    const s = stockageMemoire({ [`${PREFIXE_LEGACY}missions`]: '[]' });
    expect(presenceLegacy(s)).toBe(true);
  });

  /**
   * Une clé présente mais illisible reste « présente ».
   *
   * Conclure ici « rien à migrer » effacerait le problème : l'utilisateur
   * verrait une application vide sans qu'on lui dise que ses données n'ont pas
   * pu être lues. La reprise, une fois chargée, le dira.
   */
  it('tient une donnée illisible pour présente, pas pour absente', () => {
    const s = stockageMemoire({ [CLE_BUNDLE_LEGACY]: '{{{' });
    expect(presenceLegacy(s)).toBe(true);
    expect(detecter(s).statut).toBe('reprise-requise');
    expect(migrer(s).statut).toBe('echec');
  });
});

/**
 * L'OBJECTIF DE CA VIVAIT DANS SA PROPRE CLÉ, HORS DU BUNDLE.
 *
 * L'ancienne application l'écrivait dans `freel_goal_ca`, sans le préfixe de
 * version. Le chercher dans le bundle l'aurait perdu en silence — et un
 * objectif perdu ne se remarque pas : l'écran n'affiche simplement plus de
 * ligne, comme si l'on n'en avait jamais fixé.
 */
describe('reprise de l’objectif de chiffre d’affaires', () => {
  it('reprend l’objectif écrit dans sa clé séparée', () => {
    const s = stockageMemoire({
      [CLE_BUNDLE_LEGACY]: JSON.stringify(bundleLegacy()),
      freel_goal_ca: '65000'
    });
    const r = migrer(s);
    expect(r.statut).toBe('migre');
    expect(r.statut === 'migre' ? r.faits.objectifCaAnnuel : undefined).toBe(65_000);
  });

  /**
   * L'ancienne application écrivait `0` pour « pas d'objectif », et son graphe
   * testait `GOAL_CA > 0` avant de tracer la ligne. Reprendre le zéro tel quel
   * fabriquerait un objectif de zéro euro, atteint par construction.
   */
  it('traduit le zéro de l’ancienne application par une absence d’objectif', () => {
    const s = stockageMemoire({
      [CLE_BUNDLE_LEGACY]: JSON.stringify(bundleLegacy()),
      freel_goal_ca: '0'
    });
    const r = migrer(s);
    expect(r.statut === 'migre' ? r.faits.objectifCaAnnuel : undefined).toBeNull();
  });

  it('rend un objectif nul quand la clé n’existe pas', () => {
    const r = migrer(avecLegacy());
    expect(r.statut === 'migre' ? r.faits.objectifCaAnnuel : undefined).toBeNull();
  });

  /**
   * Un objectif seul ne déclenche pas de reprise : sans mission ni recette, il
   * n'y a rien à migrer, et prétendre le contraire afficherait un écran de
   * reprise à quelqu'un qui n'a jamais utilisé l'ancienne application.
   */
  it('ne déclenche aucune reprise à lui seul', () => {
    const s = stockageMemoire({ freel_goal_ca: '65000' });
    expect(presenceLegacy(s)).toBe(false);
    expect(detecter(s).statut).toBe('rien-a-migrer');
  });
});
