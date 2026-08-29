import { describe, expect, it } from 'vitest';
import type { DateISO, Mois } from '../types';
import type { JourTravaille } from './cra';
import { pourDestinataire, syntheseHebdomadaire } from './cra';

const j = (
  date: string, client: string, quotite: number, lieu: JourTravaille['lieu'] = null
): JourTravaille => ({ date: date as DateISO, client, quotite, lieu });

const JUIN = '2026-06' as Mois;

describe('syntheseHebdomadaire', () => {
  it('groupe les journées par semaine et par client', () => {
    const s = syntheseHebdomadaire(JUIN, [
      j('2026-06-01', 'Studio Lumen', 1, 'teletravail'),
      j('2026-06-02', 'Studio Lumen', 1, 'sur_site'),
      j('2026-06-04', 'Atelier Novak', 0.5, 'sur_site'),
      j('2026-06-08', 'Studio Lumen', 1, 'teletravail')
    ]);

    expect(s.semaines).toHaveLength(2);
    expect(s.semaines[0]?.lundi).toBe('2026-06-01');
    expect(s.semaines[0]?.total).toBe(2.5);
    expect(s.semaines[1]?.lundi).toBe('2026-06-08');
    expect(s.total).toBe(3.5);
  });

  it('ventile entre télétravail, sur site et non précisé', () => {
    const s = syntheseHebdomadaire(JUIN, [
      j('2026-06-01', 'Studio Lumen', 1, 'teletravail'),
      j('2026-06-02', 'Studio Lumen', 1, 'sur_site'),
      j('2026-06-03', 'Studio Lumen', 0.5)
    ]);

    const v = s.parClient[0];
    expect(v?.teletravail).toBe(1);
    expect(v?.surSite).toBe(1);
    expect(v?.nonPrecise).toBe(0.5);
    expect(v?.total).toBe(2.5);
  });

  /*
   * LA COLONNE « NON PRÉCISÉ » EST LA PREUVE DE L'ABSTENTION.
   *
   * Le défaut qu'elle empêche : ranger une journée sans lieu dans
   * « télétravail » parce que c'est le cas le plus fréquent. Le client
   * signerait alors une répartition que personne n'a constatée, et une mission
   * facturée « sur site » qui ne l'a pas été se conteste.
   */
  it('ne range JAMAIS une journée sans lieu dans le télétravail', () => {
    const s = syntheseHebdomadaire(JUIN, [j('2026-06-01', 'Studio Lumen', 1)]);
    expect(s.parClient[0]?.teletravail).toBe(0);
    expect(s.parClient[0]?.surSite).toBe(0);
    expect(s.parClient[0]?.nonPrecise).toBe(1);
  });

  it('borne la synthèse au mois demandé', () => {
    const s = syntheseHebdomadaire(JUIN, [
      j('2026-05-29', 'Studio Lumen', 1),
      j('2026-06-01', 'Studio Lumen', 1),
      j('2026-07-01', 'Studio Lumen', 1)
    ]);
    expect(s.total).toBe(1);
    expect(s.semaines).toHaveLength(1);
  });

  it('écarte les journées à zéro plutôt que de les afficher vides', () => {
    const s = syntheseHebdomadaire(JUIN, [
      j('2026-06-01', 'Studio Lumen', 0),
      j('2026-06-02', 'Studio Lumen', 1)
    ]);
    expect(s.semaines[0]?.volumes).toHaveLength(1);
    expect(s.total).toBe(1);
  });

  /*
   * Le rang se compte sur le CALENDRIER : une semaine sans travail laisse un
   * trou, et ce trou EST l'information. Renuméroter 1, 2, 3 ferait lire
   * « trois semaines de suite » là où il y en a eu deux avec une pause.
   */
  it('numérote les semaines sur le calendrier du mois, trous compris', () => {
    const s = syntheseHebdomadaire(JUIN, [
      j('2026-06-01', 'Studio Lumen', 1),
      j('2026-06-15', 'Studio Lumen', 1)
    ]);
    expect(s.semaines.map((x) => x.rang)).toEqual([1, 3]);
  });

  it('compte le rang depuis la semaine qui porte le 1er du mois', () => {
    // Juillet 2026 commence un MERCREDI : la semaine du 29 juin est la
    // première du mois, celle du 6 juillet la deuxième.
    const s = syntheseHebdomadaire('2026-07' as Mois, [
      j('2026-07-01', 'Studio Lumen', 1),
      j('2026-07-06', 'Studio Lumen', 1)
    ]);
    expect(s.semaines.map((x) => x.rang)).toEqual([1, 2]);
  });

  it('borne la plage aux journées réellement travaillées', () => {
    const s = syntheseHebdomadaire(JUIN, [
      j('2026-06-02', 'Studio Lumen', 1),
      j('2026-06-04', 'Studio Lumen', 1)
    ]);
    expect(s.semaines[0]?.premierJour).toBe('2026-06-02');
    expect(s.semaines[0]?.dernierJour).toBe('2026-06-04');
  });

  it('range les clients dans un ordre stable, alphabétique', () => {
    const s = syntheseHebdomadaire(JUIN, [
      j('2026-06-01', 'Studio Lumen', 1),
      j('2026-06-02', 'Atelier Novak', 1)
    ]);
    expect(s.parClient.map((v) => v.client)).toEqual(['Atelier Novak', 'Studio Lumen']);
  });
});

describe('pourDestinataire', () => {
  const complete = syntheseHebdomadaire(JUIN, [
    j('2026-06-01', 'Studio Lumen', 1, 'teletravail'),
    j('2026-06-04', 'Atelier Novak', 1, 'sur_site'),
    j('2026-06-08', 'Atelier Novak', 1, 'sur_site')
  ]);

  /*
   * LE DOCUMENT D'UN CLIENT NE PORTE QUE SES JOURS.
   *
   * Sans ce filtre, un client lirait le volume consacré à son concurrent sur
   * un document qu'on lui demande de signer.
   */
  it('n’expose jamais le volume d’un autre client', () => {
    const s = pourDestinataire(complete, 'Atelier Novak');
    expect(s.parClient.map((v) => v.client)).toEqual(['Atelier Novak']);
    expect(s.total).toBe(2);
    expect(JSON.stringify(s)).not.toContain('Studio Lumen');
  });

  it('écarte les semaines où le destinataire n’a rien travaillé', () => {
    const s = pourDestinataire(complete, 'Studio Lumen');
    expect(s.semaines).toHaveLength(1);
    expect(s.semaines[0]?.rang).toBe(1);
  });

  it('rend la synthèse entière pour le document tous clients', () => {
    expect(pourDestinataire(complete, null)).toBe(complete);
  });
});
