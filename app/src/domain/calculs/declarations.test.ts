import { describe, expect, it } from 'vitest';
import type { Mois } from '../types';
import { appelsDeLaPeriode, dateLimiteDeclaration, periodesADeclarer } from './declarations';

const enc = (encaisseeLe: string, montant = 1000) => ({ encaisseeLe, montant });
const AUJOURDHUI = '2026-08-13';

describe('périodes à déclarer', () => {
  it('groupe les encaissements par mois quand la périodicité est mensuelle', () => {
    const p = periodesADeclarer(
      [enc('2026-06-05'), enc('2026-06-20'), enc('2026-07-02')],
      'mensuel', [], AUJOURDHUI
    );
    expect(p.map((x) => x.id)).toEqual(['2026-07', '2026-06']);
    expect(p.find((x) => x.id === '2026-06')?.encaisse).toBe(2000);
  });

  it('groupe par trimestre quand la périodicité est trimestrielle', () => {
    const p = periodesADeclarer(
      [enc('2026-04-05'), enc('2026-06-20'), enc('2026-07-02')],
      'trimestriel', [], AUJOURDHUI
    );
    expect(p.map((x) => x.id)).toEqual(['2026-T3', '2026-T2']);
    expect(p.find((x) => x.id === '2026-T2')?.encaisse).toBe(2000);
  });

  /**
   * Déclarer un trimestre le déclare EN ENTIER, mois creux compris. Ne marquer
   * que les mois qui portent une recette laisserait le mois vide « à
   * provisionner » pour toujours — sans montant, donc invisible, mais présent.
   */
  it('couvre les trois mois d’un trimestre, y compris ceux sans recette', () => {
    const p = periodesADeclarer([enc('2026-04-05')], 'trimestriel', [], AUJOURDHUI);
    expect(p[0]?.mois).toEqual(['2026-04', '2026-05', '2026-06']);
  });

  it('ne se dit déclarée que si TOUS ses mois le sont', () => {
    const partiel = periodesADeclarer(
      [enc('2026-04-05')], 'trimestriel', ['2026-04'] as Mois[], AUJOURDHUI
    );
    expect(partiel[0]?.declaree).toBe(false);

    const complet = periodesADeclarer(
      [enc('2026-04-05')], 'trimestriel',
      ['2026-04', '2026-05', '2026-06'] as Mois[], AUJOURDHUI
    );
    expect(complet[0]?.declaree).toBe(true);
  });

  /**
   * On ne déclare pas une période en cours : l'URSSAF ouvre la déclaration
   * après sa clôture. La cocher d'avance sortirait du volet « à provisionner »
   * des recettes qu'on va encore encaisser dessus.
   */
  it('ne dit close qu’une période terminée', () => {
    const p = periodesADeclarer(
      [enc('2026-06-05'), enc('2026-08-05')], 'mensuel', [], AUJOURDHUI
    );
    expect(p.find((x) => x.id === '2026-06')?.close).toBe(true);
    expect(p.find((x) => x.id === '2026-08')?.close).toBe(false);
  });

  it('laisse le trimestre en cours ouvert jusqu’à son dernier mois', () => {
    const p = periodesADeclarer([enc('2026-07-05')], 'trimestriel', [], AUJOURDHUI);
    // T3 = juillet-septembre, on est en août : le trimestre court encore.
    expect(p[0]?.close).toBe(false);
  });

  // Une période sans encaissement n'a rien à déclarer ; l'afficher noierait
  // les vraies échéances dans une liste de cases sans objet.
  it('ne rend que les périodes qui portent un encaissement', () => {
    const p = periodesADeclarer([enc('2026-06-05')], 'mensuel', [], AUJOURDHUI);
    expect(p).toHaveLength(1);
  });

  it('écarte une date d’encaissement illisible plutôt que d’inventer un mois', () => {
    const p = periodesADeclarer([enc('')], 'mensuel', [], AUJOURDHUI);
    expect(p).toEqual([]);
  });

  it('nomme les périodes en français', () => {
    expect(periodesADeclarer([enc('2026-08-01')], 'mensuel', [], AUJOURDHUI)[0]?.libelle)
      .toBe('août 2026');
    expect(periodesADeclarer([enc('2026-08-01')], 'trimestriel', [], AUJOURDHUI)[0]?.libelle)
      .toBe('T3 2026');
  });
});

/**
 * UNE PÉRIODE CLOSE SE DÉCLARE, MÊME SANS RECETTE.
 *
 * Si la règle sautait, l'échéancier ne montrerait que les périodes portant un
 * encaissement, alors que le Pilote — et l'URSSAF — réclament aussi les
 * déclarations à zéro. Le bouton « Déclarer » du Pilote menait ainsi à un
 * écran où la période réclamée n'existait pas : l'alerte ne s'éteignait
 * jamais.
 */
describe('déclarations à zéro', () => {
  const encaissements = [{ encaisseeLe: '2026-05-12', montant: 4000 }];

  it('rend les périodes closes sans recette depuis le début d’activité', () => {
    const p = periodesADeclarer(encaissements, 'trimestriel', [], '2026-08-15', '2026-01' as Mois);
    const t1 = p.find((x) => x.id === '2026-T1');
    expect(t1?.encaisse).toBe(0);
    expect(t1?.close).toBe(true);
    expect(p.find((x) => x.id === '2026-T2')?.encaisse).toBe(4000);
  });

  // Une période en cours sans recette n'a encore rien à dire.
  it('ne rend pas la période en cours tant qu’elle est vide', () => {
    const p = periodesADeclarer(encaissements, 'trimestriel', [], '2026-08-15', '2026-01' as Mois);
    expect(p.some((x) => x.id === '2026-T3')).toBe(false);
  });

  it('ne remonte pas avant le début d’activité', () => {
    const p = periodesADeclarer(encaissements, 'mensuel', [], '2026-08-15', '2026-04' as Mois);
    expect(p.some((x) => x.id < '2026-04')).toBe(false);
    expect(p.map((x) => x.id)).toContain('2026-04');
  });
});

/**
 * LA DATE LIMITE : LE DERNIER JOUR DU MOIS SUIVANT, REPORTÉE AU JOUR OUVRÉ.
 *
 * Par le calendrier, pas par « + 1 mois » : le 31 janvier + 1 mois n'existe
 * pas, et février change de longueur. Puis reportée quand elle tombe un
 * samedi, un dimanche ou un férié (doctrine Urssaf) : le T4 2026 et février
 * 2027 finissent un dimanche, et s'affichaient en retard le lundi, jour où ils
 * se déclarent encore. L'ancienne attente (31 janvier, 28 février) disait la
 * règle sans son report.
 */
describe('date limite de déclaration', () => {
  it.each([
    ['2026-03', '2026-04-30'], // T1, un jeudi
    ['2026-06', '2026-07-31'], // T2, un vendredi
    ['2026-04', '2026-06-01'], // avril : le dimanche 31 mai passe au lundi
    ['2026-12', '2027-02-01'], // T4 : l'année change, et le dimanche 31 janvier passe en février
    ['2027-01', '2027-03-01'], // mensuel, février : le dimanche 28 passe au lundi
    ['2027-09', '2027-11-02'], // T3 2027 : dimanche 31 octobre, Toussaint le lundi
    ['2028-01', '2028-02-29'] // année bissextile, un mardi
  ])('%s se déclare jusqu’au %s', (m, limite) => {
    expect(dateLimiteDeclaration(m as Mois)).toBe(limite);
  });

  /**
   * Une échéance annoncée l'emporte sur la règle, et pour elle seule. Le
   * samedi 31 octobre 2026 n'a PAS été reporté (actualité Urssaf du
   * 27/10/2026) ; reportée quand même, une déclaration du 1er novembre se
   * serait lue à l'heure. Août 2026, après la panne, se déclarait sans
   * majoration jusqu'à fin octobre (21/10/2026) : sans l'exception, une
   * déclaration du 15 octobre s'affichait en retard.
   */
  it.each([
    ['2026-09', '2026-10-31'], // septembre et T3 2026 : samedi maintenu
    ['2026-08', '2026-10-31'] // août 2026 : tolérance de la panne
  ])('%s suit l’échéance annoncée par l’Urssaf, le %s', (m, limite) => {
    expect(dateLimiteDeclaration(m as Mois)).toBe(limite);
  });

  it('porte la limite sur chaque période, au dernier mois couvert', () => {
    const [t2] = periodesADeclarer(
      [{ encaisseeLe: '2026-05-10', montant: 100 }], 'trimestriel', [], '2026-07-15'
    );
    expect(t2?.limite).toBe('2026-07-31');
  });
});

/**
 * UN APPEL RÈGLE UNE PÉRIODE, PAR SON LIEN (schéma 25).
 *
 * Rapprochés par le mois de la limite, les appels de juin 2026 étaient
 * revendiqués à la fois par avril (limite du dimanche 31 mai reportée au
 * lundi 1er juin) et par mai (30 juin) : le « payée le » de l'un s'affichait
 * sous l'autre, et une période impayée se lisait réglée.
 */
describe('les appels d’une période', () => {
  const appel = (id: string, echeanceLe: string, periode: string | null) =>
    ({ id, nature: 'urssaf', echeanceLe, periode });

  it('avril et mai 2026 ne revendiquent plus les mêmes appels de juin', () => {
    const juin = [appel('avril', '2026-06-01', '2026-04'), appel('mai', '2026-06-30', '2026-05')];
    expect(appelsDeLaPeriode('2026-04', juin).map((a) => a.id)).toEqual(['avril']);
    expect(appelsDeLaPeriode('2026-05', juin).map((a) => a.id)).toEqual(['mai']);
  });

  it('un appel du T4 2026 saisi au 31 janvier 2027 reste à sa période', () => {
    expect(appelsDeLaPeriode('2026-T4', [appel('t4', '2027-01-31', '2026-T4')])).toHaveLength(1);
  });

  /* Un appel saisi à la main ne règle aucune période tant qu'on ne le dit pas :
     son mois ne suffit plus à le rattacher. */
  it('ignore un appel sans période et une échéance d’une autre nature', () => {
    const autres = [appel('libre', '2026-06-01', null), { ...appel('tva', '2026-06-01', '2026-04'), nature: 'tva' }];
    expect(appelsDeLaPeriode('2026-04', autres)).toEqual([]);
  });
});
