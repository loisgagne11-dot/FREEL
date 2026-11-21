import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compteursParEcran } from '../domain/calculs/aTraiter';
import { formuler } from '../domain/calculs/aTraiter.libelles';
import { dateISO, euros } from '../domain/types';
import { adresseDuSujet } from '../ui/screens/Pilote.decisions';
import { type Faits, type Mission, faitsVides } from './schema';
import { completerFaits } from './schema.migrations';
import { aTraiter } from './selecteurs.aTraiter';

const LE_10_JUIN = new Date('2026-06-10T12:00:00');

const mission = (m: Partial<Mission> = {}): Mission => ({
  id: 'm1', clientId: null, clientNom: 'Client Démo', description: 'Refonte démo', tjm: euros(500),
  debut: dateISO('2026-05-01'), fin: dateISO('2026-07-31'), statut: 'active',
  joursCommandes: null, preavisFinJours: null, reconduction: null, probabilite: null,
  entites: [{ id: 'm1-co1', nom: '', couleur: '', adresse: '', contact: '', email: '', telephone: '', rythmes: [], ajustements: {} }],
  ...m
});

const faits = (missions: readonly Mission[]): Faits => ({ ...faitsVides(), missions });
const finsDe = (f: Faits) => aTraiter(f, LE_10_JUIN).filter((s) => s.id.startsWith('fin-mission-'));

/**
 * La fin d'une mission entre dans « à faire » à son préavis : une suite se
 * négocie avant la fin. Sans ce sujet, la fin d'un contrat n'est annoncée que
 * sur l'onglet Missions — qu'on n'ouvre pas tous les jours.
 */
describe('la fin de mission annoncée, dans « à faire »', () => {
  it('entre au préavis, sous Activité, avec son geste vers la mission', () => {
    const [sujet, ...autres] = finsDe(faits([mission()]));
    expect(autres).toHaveLength(0);
    expect(sujet).toMatchObject({ id: 'fin-mission-m1', ecran: 'activite', gravite: 'a_faire' });
    if (sujet === undefined) return;
    expect(formuler(sujet)).toMatchObject({
      intitule: 'Refonte démo se termine dans 51 jours', action: 'Préparer la suite'
    });
    expect(formuler(sujet).contexte).toMatch(/^Le 31 juillet\. C’est le moment d’en parler au client/);
    expect(adresseDuSujet(sujet.id, sujet.ecran, sujet.donnees)).toBe('#/activite/mission-m1');
  });

  /* La pastille du rail suit la règle des compteurs : une chose à faire sous Activité. */
  it('compte une chose à faire sous Activité', () => {
    expect(compteursParEcran(aTraiter(faits([mission()]), LE_10_JUIN)).activite).toBe(1);
  });

  it('suit le préavis par défaut de soixante jours, ou celui de la mission', () => {
    expect(finsDe(faits([mission({ fin: dateISO('2026-08-10') })]))).toHaveLength(0);
    expect(finsDe(faits([mission({ fin: dateISO('2026-08-09') })]))).toHaveLength(1);
    expect(finsDe(faits([mission({ preavisFinJours: 30 })]))).toHaveLength(0);
    expect(finsDe(faits([mission({ fin: dateISO('2026-09-30'), preavisFinJours: 120 })]))).toHaveLength(1);
  });

  it('sort quand la fin est prolongée, la mission arrêtée, ou la reconduction dite', () => {
    expect(finsDe(faits([mission({ fin: dateISO('2026-12-31') })]))).toHaveLength(0);
    expect(finsDe(faits([mission({ statut: 'terminee' })]))).toHaveLength(0);
    expect(finsDe(faits([mission({ reconduction: { dureeMois: 3 } })]))).toHaveLength(0);
  });

  it('n’annonce rien d’un prospect', () => {
    expect(finsDe(faits([mission({ statut: 'prospect' })]))).toHaveLength(0);
  });

  /* La démonstration au 10 juin : la refonte (fin dans 51 jours) ; l'identité
     se reconduit, la carte a sept jours de préavis. */
  it('annonce, sur la démonstration, la seule refonte du site', () => {
    const demo = completerFaits(JSON.parse(readFileSync('public/jeu-de-demonstration.json', 'utf8')));
    expect(finsDe(demo).map((s) => s.id)).toEqual(['fin-mission-mis-refonte']);
  });
});
