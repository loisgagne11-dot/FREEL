import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { estLeJeuDeDemonstration } from './demonstration';

/**
 * LA RECONNAISSANCE SE VÉRIFIE SUR LE JEU RÉEL, PAS SUR UNE COPIE.
 *
 * Écrire les marqueurs à la main dans le test le ferait passer même si le jeu
 * livré changeait d'identité — et c'est précisément le jour où la
 * reconnaissance cesserait de protéger quoi que ce soit.
 */
describe('reconnaître le jeu de démonstration', () => {
  const demo = JSON.parse(
    readFileSync(new URL('../../../public/jeu-de-demonstration.json', import.meta.url), 'utf8')
  ) as { readonly entreprise: { readonly nom: string; readonly siret: string } };

  it('reconnaît le jeu tel qu’il est livré', () => {
    expect(estLeJeuDeDemonstration(demo.entreprise)).toBe(true);
  });

  /**
   * LE COÛT DES DEUX ERREURS N'EST PAS LE MÊME.
   *
   * Un faux positif coûte une confirmation qu'on écarte d'un clic ; un faux
   * négatif coûte des données réelles écrasées en silence. Ces tests tiennent
   * néanmoins les deux bords, parce qu'une confirmation qu'on voit tout le
   * temps ne se lit plus.
   */
  it('laisse passer un dossier réel', () => {
    expect(estLeJeuDeDemonstration({
      nom: 'Mon activité', siret: '552 100 554 00021'
    })).toBe(false);
  });

  /**
   * UN SIRET VIDE N'EST PAS UNE DÉMONSTRATION. C'est l'état de tout dossier
   * qu'on vient de commencer, et déclencher la confirmation dessus la
   * montrerait à des gens qui n'ont jamais touché à la démonstration.
   */
  it('ne se déclenche pas sur le seul SIRET neutralisé', () => {
    expect(estLeJeuDeDemonstration({
      nom: 'Mon activité', siret: '000 000 000 00000'
    })).toBe(false);
  });

  /** Ni sur le seul nom : on peut le changer sans rien changer d'autre. */
  it('ne se déclenche pas sur le seul nom', () => {
    expect(estLeJeuDeDemonstration({
      nom: 'Atelier de démonstration', siret: '552 100 554 00021'
    })).toBe(false);
  });

  /**
   * QUI RENOMME SON ENTREPRISE SORT DE LA RECONNAISSANCE, ET C'EST VOULU.
   * À ce moment-là, il a commencé à se servir du jeu comme d'un dossier à lui.
   */
  it('lâche prise dès que l’entreprise est renommée', () => {
    expect(estLeJeuDeDemonstration({
      ...demo.entreprise, nom: 'Mon activité'
    })).toBe(false);
  });

  /** Les espaces d'un SIRET sont de la mise en forme, pas de la donnée. */
  it('ignore la mise en forme du SIRET', () => {
    expect(estLeJeuDeDemonstration({
      nom: 'Atelier de démonstration', siret: '00000000000000'
    })).toBe(true);
  });
});
