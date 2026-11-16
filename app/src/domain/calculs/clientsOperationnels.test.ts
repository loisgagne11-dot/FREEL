import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../types';
import type { AjustementJour, Rythme } from './planning';
import {
  type FaitsDuClient, arretDuClient, arreterClient, bilanDuRetrait, finDuClient, joursPerdusApres
} from './clientsOperationnels';

const plage = (du: string, au: string, parJour: Rythme['parJour'] = { lun: 1, mar: 1 }): Rythme => ({
  du: dateISO(du), au: dateISO(au), parJour, tjm: euros(500)
});

const client = (o: Partial<FaitsDuClient> = {}): FaitsDuClient => ({
  id: 'co-fictif', rythmes: [], ajustements: {}, ...o
});

const poses = (q: Record<string, number>): Record<string, AjustementJour> =>
  Object.fromEntries(Object.entries(q).map(([d, quotite]) => [d, { quotite }]));

const sansFerie = new Set<string>();

/**
 * ARRÊTER UN CLIENT, C'EST BORNER SES FAITS.
 *
 * Ni champ « arrêté le », ni statut : la date se lit sur les plages et les
 * corrections. Si l'arrêt laissait courir une plage, le planning continuerait
 * de remplir des journées chez un client parti, et le CRA du mois suivant les
 * facturerait.
 */
describe('arrêter un client opérationnel', () => {
  it('borne au jour dit la plage qui court au-delà', () => {
    const r = arreterClient(client({ rythmes: [plage('2026-01-01', '2026-12-31')] }), dateISO('2026-03-13'));
    if ('refus' in r) throw new Error(r.refus);
    expect(r.entite.rythmes).toEqual([{ ...plage('2026-01-01', '2026-12-31'), au: '2026-03-13' }]);
    expect(r.bilan.plagesBornees).toBe(1);
  });

  it('retire la plage qui commence après le jour dit', () => {
    const r = arreterClient(client({
      rythmes: [plage('2026-01-01', '2026-03-31'), plage('2026-04-01', '2026-06-30')]
    }), dateISO('2026-03-13'));
    if ('refus' in r) throw new Error(r.refus);
    expect(r.entite.rythmes.map((p) => p.du)).toEqual(['2026-01-01']);
    expect(r.bilan.plagesRetirees).toBe(1);
  });

  /**
   * Le jour même appartient encore au client : on s'arrête LE 13, pas la veille.
   * Les corrections suivantes partent, zéros compris — un zéro oublié effacerait
   * en silence une journée le jour où l'arrêt serait levé.
   */
  it('garde la correction du jour même, retire les suivantes zéros compris et les compte', () => {
    const r = arreterClient(client({
      rythmes: [plage('2026-01-01', '2026-12-31')],
      ajustements: poses({ '2026-03-13': 0.5, '2026-03-20': 1, '2026-03-24': 0, '2026-04-02': 0.5 })
    }), dateISO('2026-03-13'));
    if ('refus' in r) throw new Error(r.refus);
    expect(Object.keys(r.entite.ajustements)).toEqual(['2026-03-13']);
    expect(r.bilan.correctionsRetirees).toBe(3);
    expect(r.bilan.joursCorriges).toBe(1.5);
  });

  it('ne touche ni aux autres clients ni aux plages antérieures', () => {
    const anterieure = plage('2026-01-01', '2026-02-28');
    const arrete = client({ rythmes: [anterieure, plage('2026-03-01', '2026-12-31')] });
    const autre = client({ id: 'co-autre', rythmes: [plage('2026-01-01', '2026-12-31', { mer: 1 })] });
    const r = arreterClient(arrete, dateISO('2026-03-13'));
    if ('refus' in r) throw new Error(r.refus);
    expect(r.entite.rythmes[0]).toBe(anterieure);
    // Rien d'autre n'est écrit : la fonction rend le client arrêté, et seul lui.
    expect(autre.rythmes[0]?.au).toBe('2026-12-31');
  });

  /**
   * Arrêter avant le premier jour, c'est retirer le client — un autre geste,
   * qui efface ce qu'il a déjà fait. Le confondre ferait disparaître des
   * journées travaillées sous couvert d'un arrêt.
   */
  it('refuse un arrêt avant le premier jour du client', () => {
    const r = arreterClient(client({ rythmes: [plage('2026-03-01', '2026-12-31')] }), dateISO('2026-02-27'));
    expect(r).toEqual({ refus: expect.stringContaining('Retirer') });
  });

  it('refuse un arrêt qui ne changerait rien', () => {
    const r = arreterClient(client({ rythmes: [plage('2026-01-01', '2026-03-31')] }), dateISO('2026-04-15'));
    expect('refus' in r).toBe(true);
  });
});

/**
 * L'ARRÊT SE LIT SUR LES FAITS.
 *
 * Il sert à une chose précise : ne plus proposer ce client pour une journée
 * postérieure. S'il se trompait dans un sens, l'éditeur recréerait des
 * journées chez un client parti ; dans l'autre, il cacherait un client qui
 * travaille encore.
 */
describe('lire qu’un client est arrêté', () => {
  const a = client({ id: 'co-a', rythmes: [plage('2026-01-01', '2026-12-31')] });
  const b = client({ id: 'co-b', rythmes: [plage('2026-01-01', '2026-03-13', { mer: 1 })] });

  it('lit l’arrêt d’un client quand un autre continue après lui', () => {
    expect(arretDuClient({ entites: [a, b] }, b)).toBe('2026-03-13');
    expect(arretDuClient({ entites: [a, b] }, a)).toBeNull();
  });

  /** Un client seul finit avec la mission : c'est la mission qui se termine. */
  it('un client seul n’est jamais arrêté', () => {
    expect(arretDuClient({ entites: [b] }, b)).toBeNull();
  });

  it('deux clients qui finissent ensemble ne sont pas arrêtés', () => {
    const memeFin = client({ id: 'co-c', rythmes: [plage('2026-01-01', '2026-03-13', { jeu: 1 })] });
    expect(arretDuClient({ entites: [b, memeFin] }, b)).toBeNull();
  });

  /** Une journée déclarée à la main après la dernière plage prouve qu'il n'était pas fini. */
  it('une correction postérieure repousse la fin', () => {
    const corrige = { ...b, ajustements: poses({ '2026-04-08': 1 }) };
    expect(finDuClient(corrige)).toBe('2026-04-08');
    expect(arretDuClient({ entites: [a, corrige] }, corrige)).toBe('2026-04-08');
  });

  it('une plage vide ou un zéro ne repoussent rien', () => {
    const vide = { ...b, rythmes: [...b.rythmes, plage('2026-04-01', '2026-06-30', {})], ajustements: poses({ '2026-05-06': 0 }) };
    expect(finDuClient(vide)).toBe('2026-03-13');
  });
});

describe('ce qu’un arrêt ou un retrait emporte', () => {
  /** Mars 2026 : les lundis et mardis après le 13 sont le 16, 17, 23, 24, 30 et 31. */
  it('compte les journées qui cessent de compter après l’arrêt, corrections comprises', () => {
    const e = client({ rythmes: [plage('2026-01-01', '2026-12-31')], ajustements: poses({ '2026-03-17': 0 }) });
    expect(joursPerdusApres(e, dateISO('2026-03-13'), dateISO('2026-03-31'), sansFerie, {})).toBe(5);
  });

  it('sépare le travail fait de ce qui reste prévu', () => {
    const e = client({
      rythmes: [plage('2026-03-02', '2026-03-31')],
      ajustements: poses({ '2026-03-03': 0.5, '2026-03-30': 0 })
    });
    // Dix lundis et mardis en mars à partir du 2 ; le 3 vaut une demie, le 30
    // rien. Aujourd'hui, mardi 10, compte au passé : la journée est faite.
    expect(bilanDuRetrait(e, dateISO('2026-03-10'), sansFerie, {}))
      .toEqual({ joursPasses: 3.5, corrections: 2, joursAVenir: 5 });
  });
});
