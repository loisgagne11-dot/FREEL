import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../types';
import {
  type EntreeATraiter, type RecetteVue,
  compteursParEcran, sujetsATraiter, sujetsDeLEcran
} from './aTraiter';

const AUJOURDHUI = dateISO('2026-07-28');

function entree(modifications: Partial<EntreeATraiter> = {}): EntreeATraiter {
  return {
    aujourdhui: AUJOURDHUI,
    typeActivite: 'BNC',
    recettes: [],
    periodesDeclarees: [],
    periodicite: 'mensuel',
    debutActivite: null,
    echeancesReglementaires: [],
    ...modifications
  };
}

function recette(m: Partial<RecetteVue> = {}): RecetteVue {
  return {
    id: 'r', montant: euros(1000), emiseLe: dateISO('2026-07-01'),
    encaisseeLe: null, modeReglement: 'virement', clientNom: 'C',
    delaiPaiementJours: 30,
    ...m
  };
}

const idsDe = (e: EntreeATraiter) => sujetsATraiter(e).map((s) => s.id);

describe('rien n\'est inventé', () => {
  // Le prototype affichait six sujets écrits en dur. Sur des faits vides, la
  // liste doit être vide : pas de compteur décoratif.
  it('sur des faits vides, aucun sujet', () => {
    expect(sujetsATraiter(entree())).toEqual([]);
  });

  it('une facture encaissée et complète ne produit aucun sujet', () => {
    const e = entree({
      recettes: [recette({ encaisseeLe: dateISO('2026-07-10'), modeReglement: 'virement' })],
      periodesDeclarees: [mois('2026-07')]
    });
    expect(idsDe(e)).not.toContain('factures-en-retard');
    expect(idsDe(e)).not.toContain('livre-recettes-incomplet');
  });
});

describe('factures en retard', () => {
  it('signale une facture dont le délai de paiement est dépassé', () => {
    const e = entree({
      recettes: [recette({ emiseLe: dateISO('2026-05-01'), delaiPaiementJours: 30 })]
    });
    const s = sujetsATraiter(e).find((x) => x.id === 'factures-en-retard');
    expect(s).toBeDefined();
    expect(s?.gravite).toBe('retard');
    expect(s?.ecran).toBe('activite');
  });

  // La borne : une facture dont l'échéance est aujourd'hui n'est pas en retard.
  it('ne signale pas une facture encore dans son délai', () => {
    const e = entree({
      recettes: [recette({ emiseLe: dateISO('2026-07-20'), delaiPaiementJours: 30 })]
    });
    expect(idsDe(e)).not.toContain('factures-en-retard');
  });

  it('ne signale jamais une facture déjà encaissée', () => {
    const e = entree({
      recettes: [recette({
        emiseLe: dateISO('2026-01-01'), delaiPaiementJours: 30,
        encaisseeLe: dateISO('2026-02-01')
      })]
    });
    expect(idsDe(e)).not.toContain('factures-en-retard');
  });

  it('compte les factures et cumule leur montant', () => {
    const e = entree({
      recettes: [
        recette({ id: 'a', montant: euros(1000), emiseLe: dateISO('2026-05-01') }),
        recette({ id: 'b', montant: euros(2000), emiseLe: dateISO('2026-05-01') })
      ]
    });
    const s = sujetsATraiter(e).find((x) => x.id === 'factures-en-retard');
    expect(s?.nombre).toBe(2);
    expect(s?.contexte).toContain('3000');
  });
});

describe('périodes à déclarer', () => {
  it('réclame une période échue où des recettes ont été encaissées', () => {
    const e = entree({
      recettes: [recette({ encaisseeLe: dateISO('2026-06-15') })]
    });
    const s = sujetsATraiter(e).find((x) => x.id === 'periodes-a-declarer');
    expect(s).toBeDefined();
    expect(s?.ecran).toBe('argent');
    // La prose est destinée à l'utilisateur : « juin 2026 », pas « 2026-06 ».
    expect(s?.contexte).toContain('juin 2026');
  });

  // Réclamer la déclaration du mois courant serait un faux positif quotidien.
  it('ne réclame pas la période en cours, non échue', () => {
    const e = entree({ recettes: [recette({ encaisseeLe: dateISO('2026-07-10') })] });
    expect(idsDe(e)).not.toContain('periodes-a-declarer');
  });

  it('cesse de réclamer une période déclarée', () => {
    const e = entree({
      recettes: [recette({ encaisseeLe: dateISO('2026-06-15') })],
      periodesDeclarees: [mois('2026-06')]
    });
    expect(idsDe(e)).not.toContain('periodes-a-declarer');
  });

  // L'obligation de déclarer existe même sans recette : la déclaration à zéro
  // est due, et son oubli est sanctionné mécaniquement.
  it('réclame les périodes sans recette depuis le début d\'activité', () => {
    const e = entree({ debutActivite: mois('2026-04') });
    const s = sujetsATraiter(e).find((x) => x.id === 'periodes-a-declarer');
    expect(s).toBeDefined();
    // avril, mai, juin — pas juillet, non échu
    expect(s?.nombre).toBe(3);
  });

  it('en trimestriel, ne réclame que les trimestres entièrement clos', () => {
    const e = entree({
      periodicite: 'trimestriel',
      recettes: [
        recette({ id: 'a', encaisseeLe: dateISO('2026-02-15') }), // T1, clos
        recette({ id: 'b', encaisseeLe: dateISO('2026-07-05') })  // T3, en cours
      ]
    });
    const s = sujetsATraiter(e).find((x) => x.id === 'periodes-a-declarer');
    expect(s?.nombre).toBe(1);
  });
});

describe('seuil majoré de TVA', () => {
  const gros = (montant: number) => entree({
    recettes: [recette({ encaisseeLe: dateISO('2026-03-01'), montant: euros(montant) })],
    periodesDeclarees: [mois('2026-03')]
  });

  it('reste silencieux loin du seuil', () => {
    expect(idsDe(gros(10000))).not.toContain('seuil-tva');
  });

  // 80 % de 41 250 = 33 000 : on prévient assez tôt pour qu'il reste de la
  // marge d'action.
  it('prévient à l\'approche du seuil, avec le reste facturable', () => {
    const s = sujetsATraiter(gros(35000)).find((x) => x.id === 'seuil-tva');
    expect(s).toBeDefined();
    expect(s?.gravite).toBe('a_faire');
    expect(s?.intitule).toMatch(/proche/i);
    expect(s?.contexte).toContain('6250');
  });

  it('passe en retard une fois le seuil franchi, et explique le coût', () => {
    const s = sujetsATraiter(gros(45000)).find((x) => x.id === 'seuil-tva');
    expect(s?.gravite).toBe('retard');
    expect(s?.intitule).toMatch(/franchi/i);
    expect(s?.contexte).toMatch(/TTC/);
  });
});

describe('plafond du régime micro', () => {
  it('reste silencieux loin du plafond', () => {
    const e = entree({
      recettes: [recette({ encaisseeLe: dateISO('2026-03-01'), montant: euros(20000) })],
      periodesDeclarees: [mois('2026-03')]
    });
    expect(idsDe(e)).not.toContain('plafond-micro');
  });

  it('prévient à l\'approche, et signale le dépassement', () => {
    const proche = entree({
      recettes: [recette({ encaisseeLe: dateISO('2026-03-01'), montant: euros(75000) })],
      periodesDeclarees: [mois('2026-03')]
    });
    const depasse = entree({
      recettes: [recette({ encaisseeLe: dateISO('2026-03-01'), montant: euros(90000) })],
      periodesDeclarees: [mois('2026-03')]
    });
    expect(sujetsATraiter(proche).find((x) => x.id === 'plafond-micro')?.gravite).toBe('a_faire');
    expect(sujetsATraiter(depasse).find((x) => x.id === 'plafond-micro')?.gravite).toBe('retard');
  });
});

describe('livre des recettes', () => {
  it('signale une recette encaissée sans mode de règlement', () => {
    const e = entree({
      recettes: [recette({ encaisseeLe: dateISO('2026-06-10'), modeReglement: null })],
      periodesDeclarees: [mois('2026-06')]
    });
    const s = sujetsATraiter(e).find((x) => x.id === 'livre-recettes-incomplet');
    expect(s).toBeDefined();
    expect(s?.contexte).toMatch(/obligatoire/);
  });

  it('ne signale rien pour une recette non encore encaissée', () => {
    const e = entree({ recettes: [recette({ encaisseeLe: null, modeReglement: null })] });
    expect(idsDe(e)).not.toContain('livre-recettes-incomplet');
  });
});

describe('échéances réglementaires', () => {
  const avecEcheance = (date: string) => entree({
    echeancesReglementaires: [{ id: 'fe', intitule: 'Facturation électronique', date: dateISO(date) }]
  });

  it('passe en « à faire » à moins de 30 jours', () => {
    const s = sujetsATraiter(avecEcheance('2026-08-15')).find((x) => x.id === 'echeance-fe');
    expect(s?.gravite).toBe('a_faire');
  });

  it('reste informatif au-delà de 30 jours', () => {
    const s = sujetsATraiter(avecEcheance('2026-12-01')).find((x) => x.id === 'echeance-fe');
    expect(s?.gravite).toBe('information');
  });

  it('passe en retard une fois dépassée, sans disparaître', () => {
    const s = sujetsATraiter(avecEcheance('2026-06-01')).find((x) => x.id === 'echeance-fe');
    expect(s?.gravite).toBe('retard');
    expect(s?.contexte).toMatch(/dépassée/);
  });
});

describe('ordre, compteurs et filtrage', () => {
  const chargee = entree({
    recettes: [
      recette({ id: 'retard', emiseLe: dateISO('2026-05-01') }),
      recette({ id: 'ok', encaisseeLe: dateISO('2026-06-10'), modeReglement: null })
    ],
    echeancesReglementaires: [
      { id: 'fe', intitule: 'Facturation électronique', date: dateISO('2026-12-01') }
    ]
  });

  it('trie par gravité : les retards d\'abord, l\'information en dernier', () => {
    const gravites = sujetsATraiter(chargee).map((s) => s.gravite);
    const rang = { retard: 0, a_faire: 1, information: 2 } as const;
    const rangs = gravites.map((g) => rang[g]);
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
  });

  // Le badge porte le nombre de SUJETS, pas la somme des quantités.
  it('compte les sujets par écran, non les quantités', () => {
    const sujets = sujetsATraiter(chargee);
    const compteurs = compteursParEcran(sujets);
    const totalSujets = Object.values(compteurs).reduce<number>((s, n) => s + (n ?? 0), 0);
    expect(totalSujets).toBe(sujets.length);
  });

  it('un écran ne voit que ses propres sujets', () => {
    const sujets = sujetsATraiter(chargee);
    const activite = sujetsDeLEcran(sujets, 'activite');
    expect(activite.every((s) => s.ecran === 'activite')).toBe(true);
    expect(activite.length).toBeLessThan(sujets.length);
  });

  // La règle du design : Pilote est le poste de pilotage, il montre tout.
  it('Pilote voit tous les sujets, quel que soit leur écran', () => {
    const sujets = sujetsATraiter(chargee);
    expect(sujetsDeLEcran(sujets, 'pilote')).toEqual(sujets);
  });

  it('chaque sujet porte un identifiant unique, un intitulé et une action', () => {
    const sujets = sujetsATraiter(chargee);
    expect(new Set(sujets.map((s) => s.id)).size).toBe(sujets.length);
    for (const s of sujets) {
      expect(s.intitule).toBeTruthy();
      expect(s.contexte).toBeTruthy();
      expect(s.action).toBeTruthy();
      expect(s.nombre).toBeGreaterThanOrEqual(1);
    }
  });
});
