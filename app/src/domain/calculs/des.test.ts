import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../types';
import {
  type PreneurService, type RecetteDeclarable,
  AMENDE_PAR_DECLARATION, ETATS_MEMBRES_UE,
  amendeEncourue, declarationDuMois, declarationsEnRetard, estDansLUe,
  limiteDepot, motifExclusion, verifierIntegriteDes
} from './des';

const recette = (m: Partial<RecetteDeclarable> = {}): RecetteDeclarable => ({
  id: 'r1', clientNom: 'ClientDE', montant: euros(4000),
  emiseLe: dateISO('2026-07-15'), ...m
});

const preneurs = (...liste: PreneurService[]) =>
  new Map(liste.map((p) => [p.nom, p]));

const ALLEMAND: PreneurService = { nom: 'ClientDE', pays: 'DE', tvaIntracom: 'DE123456789' };
const FRANCAIS: PreneurService = { nom: 'ClientFR', pays: 'FR', tvaIntracom: '' };
const SUISSE: PreneurService = { nom: 'ClientCH', pays: 'CH', tvaIntracom: '' };

describe('États membres', () => {
  it('en compte 27, le Royaume-Uni exclu', () => {
    expect(ETATS_MEMBRES_UE.codes).toHaveLength(27);
    expect(estDansLUe('GB')).toBe(false);
    expect(estDansLUe('DE')).toBe(true);
  });

  it('tolère la casse et les espaces', () => {
    expect(estDansLUe(' de ')).toBe(true);
  });

  it('passe son contrôle d’intégrité', () => {
    expect(verifierIntegriteDes()).toEqual([]);
  });
});

describe('ce qui entre dans la déclaration', () => {
  // Le point le plus confondu : la DES est due par le prestataire, pas par
  // celui qui achète.
  it('retient une prestation vendue à un assujetti d’un autre État membre', () => {
    expect(motifExclusion(recette(), ALLEMAND)).toBeNull();
  });

  it('écarte un client français', () => {
    expect(motifExclusion(recette({ clientNom: 'ClientFR' }), FRANCAIS)).toBe('client_francais');
  });

  // Supposer l'étranger ferait apparaître des obligations imaginaires à
  // chaque facture.
  it('répute français un client dont le pays n’est pas renseigné', () => {
    const sansPays: PreneurService = { nom: 'X', pays: '', tvaIntracom: '' };
    expect(motifExclusion(recette(), sansPays)).toBe('client_francais');
  });

  it('écarte un client hors Union européenne', () => {
    expect(motifExclusion(recette({ clientNom: 'ClientCH' }), SUISSE)).toBe('client_hors_ue');
  });

  it('écarte une écriture d’annulation', () => {
    expect(motifExclusion(recette({ annuleEcriture: 'r0' }), ALLEMAND)).toBe('annulation');
  });

  it('écarte une recette sans date d’émission', () => {
    expect(motifExclusion(recette({ emiseLe: null }), ALLEMAND)).toBe('sans_date_emission');
  });

  it('signale un client introuvable au lieu de le supposer français', () => {
    expect(motifExclusion(recette(), undefined)).toBe('client_inconnu');
  });
});

describe('déclaration d’un mois', () => {
  it('rassemble les prestations du mois avec le numéro de TVA du preneur', () => {
    const d = declarationDuMois([recette()], preneurs(ALLEMAND), mois('2026-07'));
    expect(d.lignes).toHaveLength(1);
    expect(d.lignes[0]).toMatchObject({ tvaIntracom: 'DE123456789', montant: 4000 });
    expect(d.total).toBe(4000);
  });

  // Le livre des recettes s'écrit à l'encaissement ; la DES suit
  // l'achèvement de la prestation, approché par la date d'émission.
  it('retient le mois d’émission, pas celui de l’encaissement', () => {
    const juin = declarationDuMois(
      [recette({ emiseLe: dateISO('2026-06-30') })], preneurs(ALLEMAND), mois('2026-06')
    );
    const juillet = declarationDuMois(
      [recette({ emiseLe: dateISO('2026-06-30') })], preneurs(ALLEMAND), mois('2026-07')
    );
    expect(juin.lignes).toHaveLength(1);
    expect(juillet.lignes).toHaveLength(0);
  });

  it('normalise le numéro de TVA saisi avec des espaces', () => {
    const espace: PreneurService = { ...ALLEMAND, tvaIntracom: 'de 123 456 789' };
    const d = declarationDuMois([recette()], preneurs(espace), mois('2026-07'));
    expect(d.lignes[0]?.tvaIntracom).toBe('DE123456789');
  });

  // Une déclaration inexacte est sanctionnée comme une déclaration absente :
  // mieux vaut réclamer le numéro que déposer quelque chose d'incomplet.
  it('écarte des lignes une prestation dont le numéro de TVA manque, et le signale', () => {
    const sansNumero: PreneurService = { ...ALLEMAND, tvaIntracom: '  ' };
    const d = declarationDuMois([recette()], preneurs(sansNumero), mois('2026-07'));
    expect(d.lignes).toHaveLength(0);
    expect(d.anomalies).toHaveLength(1);
    expect(d.anomalies[0]?.message).toMatch(/numéro de TVA/i);
    expect(d.sansObjet).toBe(false);
  });

  it('est sans objet quand aucune prestation n’est concernée', () => {
    const d = declarationDuMois(
      [recette({ clientNom: 'ClientFR' })], preneurs(FRANCAIS), mois('2026-07')
    );
    expect(d.sansObjet).toBe(true);
    expect(d.total).toBe(0);
  });

  it('additionne plusieurs prestations du même mois', () => {
    const d = declarationDuMois([
      recette({ id: 'a', montant: euros(1000) }),
      recette({ id: 'b', montant: euros(2500) })
    ], preneurs(ALLEMAND), mois('2026-07'));
    expect(d.lignes).toHaveLength(2);
    expect(d.total).toBe(3500);
  });
});

describe('échéance', () => {
  it('tombe au 10 du mois suivant', () => {
    expect(limiteDepot(mois('2026-07'))).toBe('2026-08-10');
  });

  it('franchit correctement le passage à l’année', () => {
    expect(limiteDepot(mois('2026-12'))).toBe('2027-01-10');
  });
});

describe('retards', () => {
  // Un mois sans prestation n'appelle aucun dépôt : le réclamer produirait
  // une alerte permanente que l'utilisateur finirait par ignorer.
  it('ne réclame rien pour un mois sans prestation intracommunautaire', () => {
    const retards = declarationsEnRetard(
      [recette({ clientNom: 'ClientFR' })], preneurs(FRANCAIS), dateISO('2026-10-01')
    );
    expect(retards).toEqual([]);
  });

  it('signale une déclaration dont la date limite est passée', () => {
    const retards = declarationsEnRetard(
      [recette()], preneurs(ALLEMAND), dateISO('2026-09-15')
    );
    expect(retards).toHaveLength(1);
    expect(retards[0]).toMatchObject({ mois: '2026-07', limiteLe: '2026-08-10' });
    expect(retards[0]?.joursDeRetard).toBe(36);
  });

  it('ne réclame pas une déclaration dont la limite n’est pas encore atteinte', () => {
    const retards = declarationsEnRetard(
      [recette()], preneurs(ALLEMAND), dateISO('2026-08-05')
    );
    expect(retards).toEqual([]);
  });

  // Une prestation sans numéro de TVA reste une prestation à déclarer :
  // l'omettre des retards laisserait croire qu'il n'y a rien à faire.
  it('compte aussi les mois dont les lignes sont bloquées faute de numéro', () => {
    const sansNumero: PreneurService = { ...ALLEMAND, tvaIntracom: '' };
    const retards = declarationsEnRetard(
      [recette()], preneurs(sansNumero), dateISO('2026-09-15')
    );
    expect(retards).toHaveLength(1);
    expect(retards[0]?.nombreLignes).toBe(1);
  });

  it('range du plus ancien au plus récent', () => {
    const retards = declarationsEnRetard([
      recette({ id: 'a', emiseLe: dateISO('2026-05-10') }),
      recette({ id: 'b', emiseLe: dateISO('2026-07-10') })
    ], preneurs(ALLEMAND), dateISO('2026-09-15'));
    expect(retards.map((r) => r.mois)).toEqual(['2026-05', '2026-07']);
  });

  // Au-delà, une omission relève d'une régularisation avec les douanes.
  it('ne remonte pas au-delà de la fenêtre examinée', () => {
    const retards = declarationsEnRetard(
      [recette({ emiseLe: dateISO('2020-01-10') })], preneurs(ALLEMAND),
      dateISO('2026-09-15')
    );
    expect(retards).toEqual([]);
  });
});

describe('coût de l’omission', () => {
  // 750 € par déclaration : une omission répétée sur un an coûte davantage
  // que la plupart des redressements que l'application cherche à éviter.
  it('chiffre l’amende encourue', () => {
    const retards = declarationsEnRetard([
      recette({ id: 'a', emiseLe: dateISO('2026-05-10') }),
      recette({ id: 'b', emiseLe: dateISO('2026-06-10') })
    ], preneurs(ALLEMAND), dateISO('2026-09-15'));
    expect(amendeEncourue(retards)).toBe(2 * AMENDE_PAR_DECLARATION.valeur);
  });

  it('ne chiffre rien sans retard', () => {
    expect(amendeEncourue([])).toBe(0);
  });
});
