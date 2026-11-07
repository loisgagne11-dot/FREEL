import { describe, expect, it } from 'vitest';
import { type SourcesRecherche, MAX_PAR_NATURE, construireIndex, normaliser, rechercher } from './recherche';

function sources(modif: Partial<SourcesRecherche> = {}): SourcesRecherche {
  return { clients: [], recettes: [], missions: [], depenses: [], ...modif };
}

const recette = (id: string, montant: number, modif: Partial<SourcesRecherche['recettes'][number]> = {}) => ({
  id, numero: `F-2026-${id}`, clientNom: 'Agence Démo', libelle: 'Prestation', montant,
  emiseLe: '2026-05-02', ...modif
});

/**
 * ON TAPE COMME ON PARLE.
 *
 * « helene » sans accent, sur un téléphone, doit retrouver « Hélène » : une
 * recherche qui exige l'accent répond « aucun résultat » pour un client qui
 * existe, et l'utilisateur conclut qu'il l'a mal saisi.
 */
describe('recherche — la forme du texte ne compte pas', () => {
  it('ignore accents, casse et espaces insécables', () => {
    expect(normaliser('  Hélène DURAND ')).toBe('helene durand');
  });

  it('retrouve un client sans son accent', () => {
    const index = construireIndex(sources({ clients: [{ id: 'c1', nom: 'Hélène Démo' }] }));
    expect(rechercher(index, 'helene').map((r) => r.id)).toEqual(['c1']);
  });

  it('exige que chaque mot tapé se retrouve', () => {
    const index = construireIndex(sources({
      clients: [{ id: 'c1', nom: 'Agence Démo' }, { id: 'c2', nom: 'Agence Exemple' }]
    }));
    expect(rechercher(index, 'agence exem').map((r) => r.id)).toEqual(['c2']);
  });

  it('ne rend rien pour une requête vide', () => {
    const index = construireIndex(sources({ clients: [{ id: 'c1', nom: 'Agence Démo' }] }));
    expect(rechercher(index, '   ')).toEqual([]);
  });
});

/**
 * « MAR » PROPOSE « MARTIN » AVANT « SUPERMARCHÉ ».
 *
 * Le début d'un mot est ce qu'on tape quand on cherche quelque chose ; le
 * milieu d'un mot est un hasard de lettres.
 */
describe('recherche — le début d’un mot passe avant le milieu', () => {
  it('classe un début de mot devant une correspondance au milieu', () => {
    const index = construireIndex(sources({
      clients: [{ id: 'milieu', nom: 'Supermarché Fictif' }, { id: 'debut', nom: 'Martin Exemple' }]
    }));
    expect(rechercher(index, 'mar').map((r) => r.id)).toEqual(['debut', 'milieu']);
  });

  it('plafonne chaque groupe', () => {
    const clients = Array.from({ length: MAX_PAR_NATURE + 3 }, (_, i) => ({ id: `c${i}`, nom: `Client ${i}` }));
    const index = construireIndex(sources({ clients }));
    expect(rechercher(index, 'client')).toHaveLength(MAX_PAR_NATURE);
  });

  it('range les groupes factures, clients, missions, dépenses', () => {
    const index = construireIndex(sources({
      depenses: [{ id: 'd', libelle: 'Démo matériel', fournisseur: '', montantTtc: 10 }],
      missions: [{ id: 'm', description: 'Démo mission', clientNom: '' }],
      clients: [{ id: 'c', nom: 'Démo client' }],
      recettes: [recette('r', 100, { libelle: 'Démo prestation' })]
    }));
    expect(rechercher(index, 'demo').map((r) => r.nature)).toEqual(['facture', 'client', 'mission', 'depense']);
  });
});

/**
 * UN MONTANT SE CHERCHE PAR SA VALEUR.
 *
 * « 1200 » doit trouver 1 200,00 € : le texte affiché porte une espace
 * insécable et deux décimales, la valeur non.
 */
describe('recherche — un montant', () => {
  const index = construireIndex(sources({
    recettes: [recette('a', 1200), recette('b', 1200.5), recette('c', 120), recette('d', -500)]
  }));

  it('trouve la partie entière quand on ne tape pas de décimales', () => {
    expect(rechercher(index, '1200').map((r) => r.id)).toEqual(['a', 'b']);
    expect(rechercher(index, '1 200 €').map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('trouve la valeur exacte quand on tape des décimales', () => {
    expect(rechercher(index, '1200,50').map((r) => r.id)).toEqual(['b']);
  });

  it('retrouve une annulation par sa valeur absolue', () => {
    expect(rechercher(index, '500').map((r) => r.id)).toEqual(['d']);
  });
});

/**
 * UN BROUILLON N'A PAS ENCORE DE NUMÉRO.
 *
 * Le lien `#/facture/<numéro>` d'une facture non émise n'ouvrirait rien : il
 * mène à la liste des factures, où les brouillons se retrouvent.
 */
describe('recherche — où mène un résultat', () => {
  it('ouvre une facture émise par son numéro', () => {
    const [r] = rechercher(construireIndex(sources({ recettes: [recette('a', 100)] })), 'F-2026-a');
    expect(r?.href).toBe('#/facture/F-2026-a');
  });

  it('mène un brouillon à la liste des factures', () => {
    const [r] = rechercher(
      construireIndex(sources({ recettes: [recette('a', 100, { emiseLe: null, numero: '' })] })),
      'prestation'
    );
    expect(r?.href).toBe('#/activite/factures');
    expect(r?.titre).toMatch(/^Brouillon/);
  });
});
