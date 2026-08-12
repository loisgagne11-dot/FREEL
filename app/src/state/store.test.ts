import { beforeEach, describe, expect, it } from 'vitest';
import { dateISO, euros } from '../domain/types';
import { totaliser } from '../domain/calculs/livreRecettes';
import { faitsVides, type Recette } from './schema';
import { useFaits } from './store';

/**
 * Le magasin est un singleton : chaque test repart de faits vierges et d'un
 * stockage nul, faute de quoi une écriture d'un test fuirait dans le suivant.
 */
beforeEach(() => {
  useFaits.setState({ faits: faitsVides() });
  useFaits.getState().initialiser(null);
  useFaits.setState({ faits: faitsVides() });
});

const recettes = (): readonly Recette[] => useFaits.getState().faits.recettes;

function ajouter(m: Partial<Omit<Recette, 'id'>> = {}): string {
  return useFaits.getState().ajouterRecette({
    clientNom: 'ClientA', libelle: 'Mission', montant: euros(4000),
    emiseLe: dateISO('2026-06-30'), encaisseeLe: null, modeReglement: null, ...m
  });
}

describe('numérotation', () => {
  // La continuité de la numérotation est une exigence du registre, pas une
  // commodité d'affichage : elle est attribuée par le magasin, jamais par un
  // écran.
  it('attribue un numéro continu par année', () => {
    ajouter();
    ajouter();
    expect(recettes().map((r) => r.numero)).toEqual(['2026-001', '2026-002']);
  });

  it('respecte un numéro fourni, venu d’un autre logiciel', () => {
    ajouter({ numero: 'FA-2026/17' } as Partial<Omit<Recette, 'id'>>);
    expect(recettes()[0]?.numero).toBe('FA-2026/17');
  });

  // Un brouillon n'a jamais circulé : réserver son numéro créerait le trou
  // qu'on cherche justement à éviter.
  it('libère le numéro d’un brouillon supprimé', () => {
    ajouter({ emiseLe: null });
    const second = ajouter({ emiseLe: null });
    useFaits.getState().supprimerBrouillon(second);
    const troisieme = ajouter({ emiseLe: null });
    expect(recettes().find((r) => r.id === troisieme)?.numero)
      .toBe(recettes()[0]?.numero.replace(/\d+$/, '002'));
  });
});

describe('encaissement', () => {
  // Deux mentions obligatoires du livre des recettes, que l'ancienne
  // application ne portait ni l'une ni l'autre.
  it('exige ensemble la date et le mode de règlement', () => {
    const id = ajouter();
    expect(useFaits.getState().encaisserRecette(id, dateISO('2026-07-15'), 'virement'))
      .toBeNull();
    expect(recettes()[0]).toMatchObject({
      encaisseeLe: '2026-07-15', modeReglement: 'virement'
    });
  });

  // Réencaisser reviendrait à modifier une écriture déjà portée au registre.
  it('refuse de réencaisser, en renvoyant vers l’annulation', () => {
    const id = ajouter();
    useFaits.getState().encaisserRecette(id, dateISO('2026-07-15'), 'virement');
    const refus = useFaits.getState().encaisserRecette(id, dateISO('2026-08-01'), 'cheque');
    expect(refus).toMatch(/annulez|ajout seul/i);
    expect(recettes()[0]?.encaisseeLe).toBe('2026-07-15');
  });

  it('signale une recette introuvable', () => {
    expect(useFaits.getState().encaisserRecette('fantome', dateISO('2026-07-15'), 'carte'))
      .toMatch(/introuvable/i);
  });
});

describe('ajout seul', () => {
  // Un registre qu'on peut réécrire ne prouve rien : c'est précisément ce
  // qu'un contrôle cherche à vérifier.
  it('refuse de supprimer une recette encaissée', () => {
    const id = ajouter();
    useFaits.getState().encaisserRecette(id, dateISO('2026-07-15'), 'virement');
    const refus = useFaits.getState().supprimerBrouillon(id);
    expect(refus).toMatch(/numérotation|avoir/i);
    expect(recettes()).toHaveLength(1);
  });

  // Le critère est l'émission, pas l'encaissement : un numéro sorti de chez
  // l'utilisateur ne peut plus disparaître.
  it('refuse de supprimer une facture émise, même impayée', () => {
    const id = ajouter({ emiseLe: dateISO('2026-06-30') });
    expect(useFaits.getState().supprimerBrouillon(id)).toMatch(/émise/i);
    expect(recettes()).toHaveLength(1);
  });

  it('supprime un brouillon jamais émis', () => {
    const id = ajouter({ emiseLe: null });
    expect(useFaits.getState().supprimerBrouillon(id)).toBeNull();
    expect(recettes()).toHaveLength(0);
  });

  // Facture contestée avant paiement : l'avoir neutralise le reste à rentrer
  // sans inscrire au registre un encaissement qui n'a pas eu lieu.
  it('annule une facture émise et impayée sans écriture au livre', () => {
    const id = ajouter({ emiseLe: dateISO('2026-06-30') });
    expect(useFaits.getState().annulerRecette(id, dateISO('2026-09-30'))).toBeNull();
    expect(recettes()).toHaveLength(2);
    expect(recettes()[1]?.encaisseeLe).toBeNull();
    expect(totaliser(recettes()).ecritures).toBe(0);
  });

  it('annule par une écriture inverse, sans rien effacer', () => {
    const id = ajouter();
    useFaits.getState().encaisserRecette(id, dateISO('2026-07-15'), 'virement');
    expect(useFaits.getState().annulerRecette(id, dateISO('2026-09-30'))).toBeNull();

    expect(recettes()).toHaveLength(2);
    const total = totaliser(recettes());
    expect(total.total).toBe(0);
    expect(total.annulations).toBe(1);
  });

  // Antidater l'annulation ferait disparaître la recette de la période où
  // elle avait été déclarée.
  it('date l’annulation du jour de la correction', () => {
    const id = ajouter();
    useFaits.getState().encaisserRecette(id, dateISO('2026-07-15'), 'virement');
    useFaits.getState().annulerRecette(id, dateISO('2026-09-30'));
    expect(recettes()[1]?.encaisseeLe).toBe('2026-09-30');
  });

  it('refuse d’annuler deux fois la même écriture', () => {
    const id = ajouter();
    useFaits.getState().encaisserRecette(id, dateISO('2026-07-15'), 'virement');
    useFaits.getState().annulerRecette(id, dateISO('2026-09-30'));
    expect(useFaits.getState().annulerRecette(id, dateISO('2026-10-01')))
      .toMatch(/déjà été annulée/i);
    expect(recettes()).toHaveLength(2);
  });

  it('refuse d’annuler un brouillon jamais émis', () => {
    const id = ajouter({ emiseLe: null });
    expect(useFaits.getState().annulerRecette(id)).toMatch(/brouillon|se supprime/i);
  });
});

describe('barème saisi', () => {
  const periode = (du: string, bnc: number) => ({
    du: du as never,
    au: null,
    taux: { BNC: bnc as never, BIC_vente: 0.123 as never, BIC_service: 0.212 as never },
    source: 'avis d’appel',
    verifieLe: dateISO('2027-01-20')
  });

  it('remplace une saisie antérieure au même début de période', () => {
    const magasin = useFaits.getState();
    magasin.ajouterPeriodeUrssaf(periode('2027-01', 0.272));
    magasin.ajouterPeriodeUrssaf(periode('2027-01', 0.275));

    const ajoutees = useFaits.getState().faits.periodesUrssafAjoutees;
    expect(ajoutees).toHaveLength(1);
    expect(ajoutees[0]?.taux.BNC).toBeCloseTo(0.275, 10);
  });

  it('rend le motif du refus sans rien enregistrer', () => {
    const refus = useFaits.getState().ajouterPeriodeUrssaf(periode('2024-03', 0.3));
    expect(refus).not.toBeNull();
    expect(useFaits.getState().faits.periodesUrssafAjoutees).toHaveLength(0);
  });
});

describe('congés', () => {
  it('pose et retire une date d’un même geste', () => {
    const magasin = useFaits.getState();
    magasin.basculerConge(dateISO('2026-07-27'));
    expect(useFaits.getState().faits.conges).toEqual(['2026-07-27']);
    useFaits.getState().basculerConge(dateISO('2026-07-27'));
    expect(useFaits.getState().faits.conges).toEqual([]);
  });

  it('ne duplique pas une date déjà posée, et garde l’ordre', () => {
    const magasin = useFaits.getState();
    magasin.poserPlageDeConges([dateISO('2026-07-28'), dateISO('2026-07-27')], true);
    magasin.poserPlageDeConges([dateISO('2026-07-27')], true);
    expect(useFaits.getState().faits.conges).toEqual(['2026-07-27', '2026-07-28']);
  });
});
