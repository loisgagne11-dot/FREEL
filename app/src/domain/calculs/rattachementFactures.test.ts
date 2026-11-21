import { describe, expect, it } from 'vitest';
import { type FactureARattacher, type MissionARattacher, rattacherFactures } from './rattachementFactures';

/*
 * À quelle mission revient une facture : la référence de commande, l'avoir qui
 * suit sa facture, puis la période facturée. Chaque règle est tenue ici ; le
 * jeu d'essai la tient dans `integration/jeu-d-essai.test.ts`.
 */

const mission = (
  id: string, debut: string | null, fin: string | null,
  autre: Partial<MissionARattacher> = {}
): MissionARattacher => ({ id, statut: 'active', clientNom: 'Client fictif', debut, fin, entites: [], ...autre });

const facture = (id: string, emiseLe: string | null, autre: Partial<FactureARattacher> = {}): FactureARattacher =>
  ({ id, clientNom: 'Client fictif', emiseLe, ...autre });

const de = (missions: readonly MissionARattacher[], factures: readonly FactureARattacher[], id: string) =>
  rattacherFactures(missions, factures).get(id);

describe('la facture émise après la fin de la mission', () => {
  /*
   * L'audit du jeu d'essai : fini le 8 mai, facturé le 12. La fenêtre de dates
   * ne le rattachait à rien et la mission se lisait « Terminée » sans facturé.
   * Revenir à la fenêtre (facture émise entre le début et la fin) fait tomber
   * ce test.
   */
  it('revient encore à la mission dont elle facture le travail', () => {
    const audit = mission('audit', '2026-04-01', '2026-05-08', { statut: 'terminee' });
    expect(de([audit], [facture('f', '2026-05-12')], 'f')).toEqual(['audit']);
  });

  /*
   * L'atelier facturé en août au même client couvre la période qui suit la
   * facture de l'audit (12 mai → 5 août), que l'audit ne touche pas. Une
   * fenêtre prolongée jusqu'à « la facture suivante », ou d'un délai fixe,
   * le lui donnerait ; oublier la facture précédente fait tomber ce test.
   */
  it('ne prend pas la vente suivante du même client', () => {
    const audit = mission('audit', '2026-04-01', '2026-05-08', { statut: 'terminee' });
    const factures = [facture('audit', '2026-05-12'), facture('atelier', '2026-08-05')];
    expect(de([audit], factures, 'atelier')).toEqual([]);
  });

  /*
   * Une mission dont la dernière facture part le jour de sa fin : la facture
   * d'une autre vente, des mois plus tard, ne lui revient pas. C'est le cas
   * qui écarte « la fenêtre jusqu'à la facture suivante ».
   */
  it('ne prend pas une vente lointaine quand la dernière facture est partie le jour de la fin', () => {
    const m = mission('m', '2026-01-01', '2026-03-31');
    const factures = [facture('mars', '2026-03-31'), facture('octobre', '2026-10-15')];
    expect(de([m], factures, 'mars')).toEqual(['m']);
    expect(de([m], factures, 'octobre')).toEqual([]);
  });
});

describe('deux missions d’un même client', () => {
  it('se séparent quand chacune est facturée en fin de mois', () => {
    const missions = [mission('a', '2026-01-01', '2026-05-31'), mission('b', '2026-06-01', '2026-09-30')];
    const factures = [facture('mai', '2026-05-31'), facture('juin', '2026-06-30')];
    expect(de(missions, factures, 'mai')).toEqual(['a']);
    expect(de(missions, factures, 'juin')).toEqual(['b']);
  });

  /*
   * Le dernier mois de A facturé le 3 juin, quand B a commencé le 1er : la
   * période facturée (30 avril → 3 juin) touche les deux, et rien ne tranche.
   * La fenêtre de dates la donnait à B seule, en silence.
   */
  it('partagent la facture quand la période facturée les touche toutes les deux', () => {
    const missions = [mission('a', '2026-01-01', '2026-05-31'), mission('b', '2026-06-01', '2026-09-30')];
    const factures = [facture('avril', '2026-04-30'), facture('mai', '2026-06-03')];
    expect(de(missions, factures, 'mai')).toEqual(['a', 'b']);
  });
});

describe('la référence de commande', () => {
  /*
   * La facture porte « BC-B » et tombe en pleine mission A : c'est la seule
   * mention du document qui désigne une mission, elle l'emporte sur la date.
   * Sans elle, la facture irait à A et B ensemble — ce test tombe.
   */
  it('l’emporte sur la date', () => {
    const missions = [
      mission('a', '2026-01-01', '2026-12-31', { referenceCommande: 'BC-A' }),
      mission('b', '2026-01-01', '2026-12-31', { referenceCommande: 'BC-B' })
    ];
    expect(de(missions, [facture('f', '2026-06-30', { referenceCommande: 'BC-B' })], 'f')).toEqual(['b']);
  });

  it('désigne chaque mission dont la facture reprend la référence', () => {
    const missions = [
      mission('a', '2026-01-01', '2026-03-31', { referenceCommande: 'BC-A' }),
      mission('b', '2026-01-01', '2026-03-31', { referenceCommande: 'bc-b' })
    ];
    expect(de(missions, [facture('f', '2026-09-30', { referenceCommande: 'BC-A, BC-B' })], 'f'))
      .toEqual(['a', 'b']);
  });

  it('laisse la période trancher quand aucune mission ne la porte', () => {
    const m = mission('m', '2026-01-01', '2026-12-31', { referenceCommande: 'BC-NOUVEAU' });
    expect(de([m], [facture('f', '2026-06-30', { referenceCommande: 'BC-ANCIEN' })], 'f')).toEqual(['m']);
  });
});

describe('un avoir', () => {
  /*
   * L'avoir part en septembre, pendant une autre mission du même client : il
   * annule une facture de l'audit, c'est l'audit qu'il doit diminuer. Rattaché
   * par sa date, il retirerait 1 500 € à une mission qui ne les a jamais
   * facturés.
   */
  it('suit la facture qu’il annule', () => {
    const missions = [mission('audit', '2026-04-01', '2026-05-08'), mission('suite', '2026-09-01', null)];
    const factures = [
      facture('audit', '2026-05-12'),
      facture('avoir', '2026-09-10', { annuleEcriture: 'audit' })
    ];
    expect(de(missions, factures, 'avoir')).toEqual(['audit']);
  });

  /*
   * Une annulation ne facture aucun travail : elle ne borne pas la période de
   * la facture corrigée qui la suit. Comptée comme une facture, elle ramenait
   * la période au 10 mai et l'audit perdait sa facture du 12.
   */
  it('ne coupe pas la période facturée', () => {
    const audit = mission('audit', '2026-04-01', '2026-05-08');
    const factures = [
      facture('avril', '2026-04-30'),
      facture('avoir', '2026-05-10', { annuleEcriture: 'avril' }),
      facture('corrigee', '2026-05-12')
    ];
    expect(de([audit], factures, 'corrigee')).toEqual(['audit']);
  });
});

describe('ce qui ne reçoit rien', () => {
  /* Un prospect sans dates aurait sinon pris tout ce que le client a payé. */
  it('ni un prospect, ni une mission perdue', () => {
    const missions = [
      mission('prospect', null, null, { statut: 'prospect' }),
      mission('perdue', null, null, { statut: 'perdue' })
    ];
    expect(de(missions, [facture('f', '2026-06-30')], 'f')).toEqual([]);
  });

  it('ni un brouillon, qui n’a rien facturé', () => {
    expect(rattacherFactures([mission('m', null, null)], [facture('b', null)]).has('b')).toBe(false);
  });

  it('ni la facture d’un autre client', () => {
    expect(de([mission('m', null, null)], [facture('f', '2026-06-30', { clientNom: 'Autre' })], 'f'))
      .toEqual([]);
  });
});
