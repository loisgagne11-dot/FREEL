import { describe, expect, it } from 'vitest';
import { type DateISO, dateISO, euros, mois } from '../domain/types';
import { tvaDueDepuis } from '../domain/bareme/tva';
import { type Faits, type Recette, faitsVides } from './schema';
import { aTraiter, debutTvaEffectif } from './selecteurs';
import { regimeTvaAu } from './selecteurs.achats';
import { emetteurDe } from './selecteurs.facture';

/*
 * Prestations de services (BNC) : franchise 37 500 €, seuil majoré 41 250 €.
 * Valeurs fictives.
 */
let n = 0;
const recette = (encaisseeLe: string, montant: number, o: Partial<Recette> = {}): Recette => {
  n += 1;
  return {
    id: `r${n}`, clientNom: 'Client démo', libelle: 'Prestation', montant: euros(montant),
    emiseLe: dateISO(encaisseeLe), encaisseeLe: dateISO(encaisseeLe),
    modeReglement: 'virement', numero: `F-${n}`, ...o
  };
};

/** 5 000 € encaissés chaque mois de 2026, de janvier à `jusqu` inclus. */
const chaqueMois = (jusqu: number): Recette[] => Array.from({ length: jusqu }, (_, i) =>
  recette(`2026-${String(i + 1).padStart(2, '0')}-10`, 5000));

const faits = (modif: Partial<Faits> = {}): Faits => ({
  ...faitsVides(),
  entreprise: { ...faitsVides().entreprise, debutActivite: dateISO('2025-01-01') },
  ...modif
});

const encaissements = (recettes: readonly Recette[]) => recettes.map((r) => ({
  encaisseeLe: r.encaisseeLe as DateISO, montant: r.montant
}));

const date = (r: ReturnType<typeof tvaDueDepuis>) => (r.statut === 'refuse' ? 'refus' : r.valeur);

/**
 * LA DATE DE TVA SE DÉDUIT DES ENCAISSEMENTS, ANNÉE PAR ANNÉE.
 */
describe('mois depuis lequel la TVA est due', () => {
  it('date le franchissement du seuil majoré en cours d’année', () => {
    // 40 000 € fin août, 45 000 € fin septembre : septembre.
    expect(date(tvaDueDepuis(encaissements(chaqueMois(9)), 'BNC', dateISO('2025-01-01'))))
      .toBe('2026-09');
  });

  it('date le 1er janvier quand la franchise a été perdue l’année d’avant', () => {
    const an2025 = [recette('2025-06-10', 20000), recette('2025-11-10', 19000)];
    expect(date(tvaDueDepuis(encaissements(an2025), 'BNC', dateISO('2025-01-01'))))
      .toBe('2026-01');
  });

  it('ne date rien sous les seuils', () => {
    expect(date(tvaDueDepuis(encaissements(chaqueMois(4)), 'BNC', dateISO('2025-01-01'))))
      .toBeNull();
  });
});

/**
 * UNE SEULE SOURCE POUR LES FACTURES ET LES DÉPENSES.
 *
 * Si la règle sautait, le franchissement resterait sans effet tant que le mois
 * n'est pas saisi à la main : les factures partiraient « en franchise » alors
 * que la TVA est due, réputées TTC — la TVA à reverser de sa poche.
 */
describe('régime de TVA effectif', () => {
  const franchi = faits({ recettes: chaqueMois(9) });

  it('suit le franchissement sans attendre la saisie', () => {
    expect(debutTvaEffectif(franchi)).toBe('2026-09');
    expect(regimeTvaAu(franchi, mois('2026-08'))).toBe('franchise');
    expect(regimeTvaAu(franchi, mois('2026-10'))).toBe('assujetti');
  });

  it('retient l’option quand elle est antérieure au franchissement', () => {
    const opte = faits({
      recettes: chaqueMois(9),
      entreprise: { ...franchi.entreprise, tvaDepuis: mois('2026-03') }
    });
    expect(debutTvaEffectif(opte)).toBe('2026-03');
  });

  it('fait porter la TVA aux factures émises après le franchissement', () => {
    expect(emetteurDe(franchi, new Date('2026-08-20T10:00:00')).enFranchise).toBe(true);
    expect(emetteurDe(franchi, new Date('2026-10-05T10:00:00')).enFranchise).toBe(false);
  });
});

/**
 * LES FACTURES ÉMISES SANS TVA APRÈS LE FRANCHISSEMENT SE RÉGULARISENT.
 *
 * « Seuil majoré franchi » ne disait pas quoi faire. Le sujet compte les
 * factures concernées, et retombe quand on les a annulées par un avoir.
 */
describe('factures à régulariser', () => {
  const octobre = new Date('2026-10-20T10:00:00');
  const sujet = (f: Faits) => aTraiter(f, octobre).find((s) => s.id === 'tva-a-regulariser');

  it('compte les factures émises sans TVA depuis le franchissement', () => {
    const f = faits({ recettes: [...chaqueMois(9), recette('2026-10-05', 3000)] });
    // Septembre (le mois du franchissement) et octobre, sans TVA.
    expect(sujet(f)?.nombre).toBe(2);
    expect(aTraiter(f, octobre).some((s) => s.id === 'seuil-tva')).toBe(false);
  });

  it('ne compte ni une facture avec TVA, ni un client hors de France, ni une facture annulée', () => {
    const avecTva = recette('2026-10-05', 3000, { tvaCollectee: euros(600) });
    const etranger = recette('2026-10-06', 2000, { clientNom: 'Client Allemagne' });
    const base = chaqueMois(9);
    const septembre = base[8] as Recette;
    const avoir = recette('2026-10-07', -5000, { annuleEcriture: septembre.id });
    const f = faits({
      recettes: [...base, avecTva, etranger, avoir],
      clients: [{
        id: 'c-de', nom: 'Client Allemagne', adresse: '', siret: '', email: '',
        delaiPaiement: 'net_30', pays: 'Allemagne', tvaIntracom: 'DE000000000'
      }] as never
    });
    expect(sujet(f)).toBeUndefined();
  });
});
