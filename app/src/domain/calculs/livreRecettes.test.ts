import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../types';
import {
  type EcritureRecette, type NatureEcart,
  ecrituresDuLivre, estAnnulation,
  totaliser, verifierConformite
} from './livreRecettes';
import { ecritureDAnnulation, prochainNumero } from './ecritureRecette';

function ecriture(m: Partial<EcritureRecette> = {}): EcritureRecette {
  return {
    id: 'r1', clientNom: 'ClientA', libelle: 'Mission', montant: euros(4000),
    emiseLe: dateISO('2026-06-30'), encaisseeLe: dateISO('2026-07-15'),
    modeReglement: 'virement', numero: '2026-001', ...m
  };
}

const natures = (recettes: readonly EcritureRecette[]): readonly NatureEcart[] =>
  verifierConformite(recettes).map((e) => e.nature);

describe('mentions obligatoires', () => {
  it('ne relève rien sur une écriture complète', () => {
    expect(verifierConformite([ecriture()])).toEqual([]);
  });

  // L'ancienne application ne portait pas le mode de règlement : son registre
  // n'était donc pas conforme.
  it('exige le mode de règlement', () => {
    expect(natures([ecriture({ modeReglement: null })])).toContain('mode_reglement_manquant');
  });

  it('exige l’identité du client', () => {
    expect(natures([ecriture({ clientNom: '  ' })])).toContain('client_manquant');
  });

  it('exige la référence de la pièce', () => {
    expect(natures([ecriture({ numero: '' })])).toContain('numero_manquant');
  });

  // Une facture non encaissée n'entre pas encore au livre : lui réclamer un
  // mode de règlement serait un faux positif permanent.
  it('ne contrôle que les recettes encaissées', () => {
    expect(verifierConformite([
      ecriture({ encaisseeLe: null, modeReglement: null, clientNom: '' })
    ])).toEqual([]);
  });

  // La tolérance de globalisation vise le commerce de comptoir. Elle ne
  // dispense pas d'identité au-delà du seuil.
  it('tolère l’absence de client sur une recette globalisée sous le seuil', () => {
    const petite = ecriture({ clientNom: '', montant: euros(40), globalisee: true });
    expect(natures([petite])).not.toContain('client_manquant');
  });

  it('exige l’identité même globalisée au-dessus du seuil', () => {
    const grosse = ecriture({ clientNom: '', montant: euros(500), globalisee: true });
    expect(natures([grosse])).toContain('client_manquant');
  });
});

describe('numérotation', () => {
  // Un numéro absent, en contrôle, se lit comme une facture retirée du
  // registre.
  it('signale un trou dans la suite', () => {
    const ecarts = verifierConformite([
      ecriture({ id: 'a', numero: '2026-001' }),
      ecriture({ id: 'b', numero: '2026-003' })
    ]);
    expect(ecarts.map((e) => e.nature)).toContain('numero_manquant_dans_la_suite');
    expect(ecarts.find((e) => e.nature === 'numero_manquant_dans_la_suite')?.message)
      .toContain('2');
  });

  it('ne signale rien sur une suite continue', () => {
    expect(natures([
      ecriture({ id: 'a', numero: '2026-001' }),
      ecriture({ id: 'b', numero: '2026-002' }),
      ecriture({ id: 'c', numero: '2026-003' })
    ])).toEqual([]);
  });

  it('traite chaque année séparément', () => {
    expect(natures([
      ecriture({ id: 'a', numero: '2025-004' }),
      ecriture({ id: 'b', numero: '2026-001' })
    ])).toEqual([]);
  });

  it('signale un numéro utilisé deux fois', () => {
    expect(natures([
      ecriture({ id: 'a', numero: '2026-001' }),
      ecriture({ id: 'b', numero: '2026-001' })
    ])).toContain('numero_duplique');
  });

  // Un numéro venu d'un logiciel antérieur n'est pas une erreur : le déclarer
  // fautif ferait crier au loup sur tout un historique repris.
  it('n’impose pas son format aux numéros d’une autre origine', () => {
    expect(natures([
      ecriture({ id: 'a', numero: 'FA-2026/17' }),
      ecriture({ id: 'b', numero: 'FA-2026/42' })
    ])).toEqual([]);
  });
});

describe('chronologie', () => {
  // Le registre est trié à la lecture ; cette incohérence-là ne se voit pas
  // au tri.
  it('signale un encaissement antérieur à l’émission', () => {
    expect(natures([
      ecriture({ emiseLe: dateISO('2026-07-31'), encaisseeLe: dateISO('2026-07-15') })
    ])).toContain('ordre_non_chronologique');
  });

  it('accepte un encaissement le jour même de l’émission', () => {
    expect(natures([
      ecriture({ emiseLe: dateISO('2026-07-15'), encaisseeLe: dateISO('2026-07-15') })
    ])).toEqual([]);
  });

  it('rend les écritures dans l’ordre des encaissements', () => {
    const livre = ecrituresDuLivre([
      ecriture({ id: 'tard', numero: '2026-002', encaisseeLe: dateISO('2026-09-01') }),
      ecriture({ id: 'tot', numero: '2026-001', encaisseeLe: dateISO('2026-07-01') })
    ]);
    expect(livre.map((e) => e.id)).toEqual(['tot', 'tard']);
  });
});

describe('annulation par écriture inverse', () => {
  // Un registre qu'on peut réécrire ne prouve rien : c'est précisément ce
  // qu'un contrôle cherche à vérifier.
  it('produit une écriture de montant opposé qui pointe vers l’originale', () => {
    const origine = ecriture();
    const inverse = ecritureDAnnulation(origine, dateISO('2026-09-30'), 'r1-annul');
    expect(inverse.montant).toBe(-4000);
    expect(inverse.annuleEcriture).toBe('r1');
    expect(estAnnulation(inverse)).toBe(true);
  });

  // Antidater l'annulation ferait disparaître la recette de la période où
  // elle avait été déclarée.
  it('est datée du jour de la correction, pas de l’écriture annulée', () => {
    const inverse = ecritureDAnnulation(ecriture(), dateISO('2026-09-30'), 'r1-annul');
    expect(inverse.encaisseeLe).toBe('2026-09-30');
  });

  it('laisse les deux écritures visibles, de somme nulle', () => {
    const origine = ecriture();
    const inverse = ecritureDAnnulation(origine, dateISO('2026-09-30'), 'r1-annul');
    const total = totaliser([origine, inverse]);
    expect(total.ecritures).toBe(2);
    expect(total.total).toBe(0);
    expect(total.annulations).toBe(1);
  });

  it('ne réclame ni numéro ni client à une écriture d’annulation', () => {
    const origine = ecriture();
    const inverse = { ...ecritureDAnnulation(origine, dateISO('2026-09-30'), 'x'), clientNom: '' };
    expect(natures([origine, inverse])).toEqual([]);
  });

  // Un montant négatif inexpliqué dans le registre.
  it('signale une annulation dont l’origine est introuvable', () => {
    const orpheline = ecriture({
      id: 'seule', montant: euros(-100), annuleEcriture: 'disparue'
    });
    expect(natures([orpheline])).toContain('annulation_orpheline');
  });

  it('ne compte pas le numéro d’une annulation comme un doublon', () => {
    const origine = ecriture();
    const inverse = ecritureDAnnulation(origine, dateISO('2026-09-30'), 'r1-annul');
    expect(natures([origine, inverse])).not.toContain('numero_duplique');
  });
});

describe('numéro suivant', () => {
  // Compter les factures redonnerait un numéro déjà utilisé après une
  // suppression, ce qui casserait l'unicité exigée par le contrôle.
  it('reprend le rang le plus élevé, pas le nombre de factures', () => {
    const recettes = [
      ecriture({ id: 'a', numero: '2026-001' }),
      ecriture({ id: 'c', numero: '2026-007' })
    ];
    expect(prochainNumero(recettes, 2026)).toBe('2026-008');
  });

  it('commence à 001 sur une année vierge', () => {
    expect(prochainNumero([], 2027)).toBe('2027-001');
    expect(prochainNumero([ecriture()], 2027)).toBe('2027-001');
  });

  it('ignore les numéros d’un autre format', () => {
    expect(prochainNumero([ecriture({ numero: 'FA-2026/99' })], 2026)).toBe('2026-001');
  });
});

describe('total du livre', () => {
  it('ne compte que les recettes encaissées', () => {
    const total = totaliser([
      ecriture({ id: 'a', montant: euros(4000) }),
      ecriture({ id: 'b', montant: euros(2000), encaisseeLe: null })
    ]);
    expect(total.ecritures).toBe(1);
    expect(total.total).toBe(4000);
  });

  it('sur un livre vide, ne produit que des zéros', () => {
    expect(totaliser([])).toMatchObject({ ecritures: 0, total: 0, annulations: 0 });
  });
});
