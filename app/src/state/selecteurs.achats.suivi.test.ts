import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois, ratio } from '../domain/types';
import type { MouvementBancaire } from '../domain/calculs/banque';
import { periodeCourante } from '../domain/calculs/periode';
import { type Depense, type Faits, type Recette, faitsVides } from './schema';
import { etatAchats } from './selecteurs.achats';
import { fournisseurDepuisLibelle, suiviRapprochement, tuilesAchats } from './selecteurs.achats.suivi';

const MAINTENANT = new Date('2026-06-20T10:00:00Z');
const JUIN = periodeCourante('mois', MAINTENANT);
const TOUT = periodeCourante('tout', MAINTENANT);

const dep = (m: Partial<Depense> = {}): Depense => ({
  id: 'd1', libelle: 'Clavier', fournisseur: 'Boutique', provenance: 'france',
  montantTtc: euros(62), tauxTva: ratio(0.2), payeeLe: dateISO('2026-06-07'),
  justificatifId: null, rapprochement: 'en_attente', ...m
});
const mvt = (m: Partial<MouvementBancaire> = {}): MouvementBancaire => ({
  id: 'm1', date: dateISO('2026-06-12'), libelle: 'CB BOUTIQUE PARIS', montant: euros(-62),
  rapprocheAvec: null, sansContrepartie: null, ...m
});
const facture = (m: Partial<Recette> = {}): Recette => ({
  id: 'r1', clientNom: 'Client Fictif', libelle: 'Prestation', montant: euros(4160),
  emiseLe: dateISO('2026-05-20'), encaisseeLe: null, modeReglement: null, numero: 'F-023', ...m
});
const faits = (m: Partial<Faits>): Faits => ({ ...faitsVides(), ...m });

describe('propositions de rapprochement', () => {
  // Sans ce lien, une opération déjà saisie serait recréée en double.
  it('propose « relier » pour un débit qui correspond à une dépense saisie', () => {
    const s = suiviRapprochement(faits({ depenses: [dep()], mouvementsBancaires: [mvt()] }), JUIN);
    expect(s.operations[0]?.action).toMatchObject({ type: 'relier', depenseId: 'd1' });
  });

  it('propose « créer » pour un débit sans dépense, avec le fournisseur tiré du libellé', () => {
    const s = suiviRapprochement(faits({ mouvementsBancaires: [mvt({ libelle: 'PRLV GITHUB INC', montant: euros(-24) })] }), JUIN);
    expect(s.operations[0]?.action).toEqual({ type: 'creer', fournisseur: 'Github' });
  });

  // Un règlement attendu depuis des semaines hors de la fenêtre de 7 jours doit
  // quand même être reconnu : une facture émise en mai se paie en juin.
  it('propose « associer » (avec encaissement) pour un crédit qui règle une facture en attente', () => {
    const s = suiviRapprochement(faits({
      recettes: [facture()],
      mouvementsBancaires: [mvt({ montant: euros(4160), libelle: 'VIR SEPA CLIENT' })]
    }), JUIN);
    expect(s.operations[0]?.action).toMatchObject({ type: 'associer', recetteId: 'r1', encaisser: true });
  });

  it('n’associe pas sans encaisser une facture déjà encaissée', () => {
    const s = suiviRapprochement(faits({
      recettes: [facture({ encaisseeLe: dateISO('2026-06-12'), modeReglement: 'virement' })],
      mouvementsBancaires: [mvt({ montant: euros(4160) })]
    }), JUIN);
    expect(s.operations[0]?.action).toMatchObject({ type: 'associer', encaisser: false });
  });

  // On ne fabrique pas une dépense à partir d'un encaissement.
  it('ne propose jamais de créer une dépense pour un crédit', () => {
    const s = suiviRapprochement(faits({ mouvementsBancaires: [mvt({ montant: euros(50) })] }), JUIN);
    expect(s.operations[0]?.action.type).toBe('qualifier');
  });

  it('écarte les opérations déjà rapprochées ou sans contrepartie', () => {
    const s = suiviRapprochement(faits({
      mouvementsBancaires: [mvt({ id: 'a', rapprocheAvec: 'x' }), mvt({ id: 'b', sansContrepartie: 'autre' })]
    }), JUIN);
    expect(s.aTraiter).toBe(0);
  });

  it('limite le travail à la période', () => {
    const f = faits({ mouvementsBancaires: [mvt({ date: dateISO('2026-03-12') })] });
    expect(suiviRapprochement(f, JUIN).aTraiter).toBe(0);
    expect(suiviRapprochement(f, TOUT).aTraiter).toBe(1);
  });

  it('propose « relier » pour une dépense en attente quand une opération compatible existe', () => {
    const s = suiviRapprochement(faits({ depenses: [dep()], mouvementsBancaires: [mvt()] }), JUIN);
    expect(s.depenses[0]?.mouvement?.id).toBe('m1');
  });

  // Sans opération compatible, seule « Hors compte » a un sens.
  it('ne propose aucune opération pour une dépense sans correspondance', () => {
    const s = suiviRapprochement(faits({
      depenses: [dep()], mouvementsBancaires: [mvt({ montant: euros(-15) })]
    }), JUIN);
    expect(s.depenses[0]?.mouvement).toBeNull();
  });

  it('ne compte pas une dépense déjà reliée à une opération, ni « hors compte »', () => {
    const s = suiviRapprochement(faits({
      depenses: [dep({ id: 'a' }), dep({ id: 'b', rapprochement: 'sans_banque' })],
      mouvementsBancaires: [mvt({ rapprocheAvec: 'a' })]
    }), JUIN);
    expect(s.depenses).toHaveLength(0);
  });

  // Des dépenses « en attente » d'un relevé absent n'ont rien à attendre.
  it('ne propose rien sans relevé importé', () => {
    expect(suiviRapprochement(faits({ depenses: [dep()] }), JUIN).aTraiter).toBe(0);
  });
});

describe('fournisseur tiré d’un libellé bancaire', () => {
  it('retire préfixes bancaires, dates et forme juridique', () => {
    expect(fournisseurDepuisLibelle('CB FNAC PRO PARIS 12/06')).toBe('Fnac Pro Paris');
    expect(fournisseurDepuisLibelle('VIR SEPA STUDIO LUMEN SARL')).toBe('Studio Lumen');
  });
});

describe('tuiles', () => {
  const f = faits({
    entreprise: { ...faitsVides().entreprise, tvaDepuis: mois('2026-01') },
    depenses: [
      dep({ id: 'a', justificatifId: 'p' }),
      dep({ id: 'b', montantTtc: euros(120) }),
      dep({ id: 'c', payeeLe: dateISO('2026-03-01') })
    ],
    mouvementsBancaires: [mvt({ montant: euros(-24), libelle: 'PRLV X' })]
  });
  const etat = etatAchats(f, MAINTENANT, JUIN);
  const t = tuilesAchats(etat, suiviRapprochement(f, JUIN, MAINTENANT), new Set(['a']));

  it('compte les dépenses de la période seulement', () => {
    expect(t.depenses).toEqual({ totalTtc: 182, nombre: 2 });
  });
  it('compte les pièces manquantes sur la pièce, pas sur la TVA', () => {
    expect(t.justificatifsManquants).toBe(1);
    expect(t.tva.nonRecuperable).toBe(20);
  });
  // En franchise aucune TVA ne se perd, et pourtant la pièce manque : compter
  // la TVA perdue ferait afficher « Tout est justifié » à tort.
  it('compte une pièce manquante même quand aucune TVA n’est en jeu (franchise)', () => {
    const franchise = faits({ depenses: [dep()] });
    const tf = tuilesAchats(etatAchats(franchise, MAINTENANT, JUIN), suiviRapprochement(franchise, JUIN, MAINTENANT), new Set());
    expect(tf.tva.nonRecuperable).toBe(0);
    expect(tf.justificatifsManquants).toBe(1);
  });
  it('additionne opérations et dépenses à rapprocher', () => {
    expect(t.aRapprocher).toEqual({ total: 3, operations: 1, depenses: 2 });
  });
  it('totalise les dépenses récurrentes de la période', () => {
    expect(t.recurrentTtc).toBe(62);
  });
});
