import { describe, expect, it } from 'vitest';
import { dateISO, mois } from '../types';
import { nemeJourOuvrable, reporterAuJourOuvre } from './calendrier.ouvres';

/**
 * Le report va au premier jour OUVRÉ : un samedi reporte (CGI ann. IV
 * art. 199-0 le nomme ; l'Urssaf aussi). S'arrêter au samedi ferait payer un
 * jour où rien n'est prélevé, et dire « en retard » le lundi suivant.
 */
describe('report au jour ouvré', () => {
  it('laisse en place un jour ouvré', () => {
    expect(reporterAuJourOuvre(dateISO('2026-07-31'))).toBe('2026-07-31'); // vendredi
  });

  it('reporte un samedi et un dimanche au lundi', () => {
    expect(reporterAuJourOuvre(dateISO('2026-10-31'))).toBe('2026-11-02'); // samedi, puis Toussaint un dimanche
    expect(reporterAuJourOuvre(dateISO('2026-05-31'))).toBe('2026-06-01'); // dimanche
  });

  it('reporte un férié de semaine au lendemain ouvré', () => {
    expect(reporterAuJourOuvre(dateISO('2026-05-14'))).toBe('2026-05-15'); // Ascension
    expect(reporterAuJourOuvre(dateISO('2026-12-25'))).toBe('2026-12-28'); // Noël un vendredi
  });

  /* Le 31 décembre 2028 est un dimanche, le lundi 1er janvier 2029 est férié :
     un report de fin d'année doit connaître les fériés de l'année suivante,
     sans quoi il s'arrête le jour de l'an. */
  it('franchit le passage à l’année en connaissant les fériés de la suivante', () => {
    expect(reporterAuJourOuvre(dateISO('2028-12-31'))).toBe('2029-01-02');
  });
});

/**
 * Le jour OUVRABLE compte le samedi. C'est la règle de la DES (CGI ann. III
 * art. 96 N), déduite du calendrier de la douane : compter du lundi au
 * vendredi n'en reproduit aucune date.
 */
describe('n-ième jour ouvrable', () => {
  it('compte les samedis, pas les dimanches', () => {
    // Juillet 2026 : 1 mer … 4 sam (compté), 5 dim (non) … le 10e est le samedi 11.
    expect(nemeJourOuvrable(mois('2026-07'), 10)).toBe('2026-07-11');
  });

  it('saute les fêtes légales', () => {
    // Mai 2026 : 1er et 8 mai, Ascension le 14 — le 10e jour ouvrable est le 15.
    expect(nemeJourOuvrable(mois('2026-05'), 10)).toBe('2026-05-15');
  });

  it('ignore les fériés du seul droit local d’Alsace-Moselle', () => {
    // Avril 2026 : le Vendredi saint (3 avril) compté chômé donnerait le 14 ; la douane publie le 13.
    expect(nemeJourOuvrable(mois('2026-04'), 10)).toBe('2026-04-13');
  });
});
