import { beforeEach, describe, expect, it } from 'vitest';
import { dateISO, euros, ratio } from '../domain/types';
import { totaliser } from '../domain/calculs/livreRecettes';
import { PART_GARDEE_MAX, faitsVides, type Recette } from './schema';
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
  /**
   * Poser puis retirer, d'un même geste dans les deux sens : corriger une
   * erreur de saisie doit coûter le même clic que la faire.
   *
   * Le test passait par `basculerConge`, retirée avec la carte qui était son
   * seul appelant. Ce qu'il tient n'a pas changé — seul le chemin a changé,
   * et il n'en reste qu'un.
   */
  it('pose et retire une date d’un même geste', () => {
    const magasin = useFaits.getState();
    magasin.poserPlageDeConges([dateISO('2026-07-27')], true);
    expect(useFaits.getState().faits.conges).toEqual([
      { date: '2026-07-27', quotite: 1 }
    ]);
    useFaits.getState().poserPlageDeConges([dateISO('2026-07-27')], false);
    expect(useFaits.getState().faits.conges).toEqual([]);
  });

  it('ne duplique pas une date déjà posée, et garde l’ordre', () => {
    const magasin = useFaits.getState();
    magasin.poserPlageDeConges([dateISO('2026-07-28'), dateISO('2026-07-27')], true);
    magasin.poserPlageDeConges([dateISO('2026-07-27')], true);
    expect(useFaits.getState().faits.conges.map((c) => c.date))
      .toEqual(['2026-07-27', '2026-07-28']);
  });

  /**
   * La demi-journée existe parce que l'ancienne application la gère depuis
   * longtemps, et qu'un solde de congés qui compte 0,5 pour 1 est faux.
   */
  it('pose une demi-journée quand on le demande', () => {
    useFaits.getState().poserPlageDeConges([dateISO('2026-07-27')], true, 0.5);
    expect(useFaits.getState().faits.conges).toEqual([
      { date: '2026-07-27', quotite: 0.5 }
    ]);
  });

  // Reposer la même date avec une autre quotité corrige, sans dupliquer.
  it('remplace la quotité d’une date déjà posée', () => {
    const magasin = useFaits.getState();
    magasin.poserPlageDeConges([dateISO('2026-07-27')], true, 1);
    magasin.poserPlageDeConges([dateISO('2026-07-27')], true, 0.5);
    expect(useFaits.getState().faits.conges).toEqual([
      { date: '2026-07-27', quotite: 0.5 }
    ]);
  });
});

describe('carnet — clients', () => {
  const saisieClient = (nom: string) => ({
    nom, adresse: '', siret: '', email: '', delaiPaiement: 'net_30' as const,
    pays: '', tvaIntracom: ''
  });

  const clients = () => useFaits.getState().faits.clients;

  it('ajoute un client', () => {
    expect(useFaits.getState().ajouterClient(saisieClient('Dupont'))).toBeNull();
    expect(clients()).toHaveLength(1);
    expect(clients()[0]?.nom).toBe('Dupont');
  });

  // Le nom EST la clé de rattachement : deux homonymes rendraient indécidable
  // l'appartenance de chaque recette.
  it('refuse un homonyme, sans rien enregistrer', () => {
    useFaits.getState().ajouterClient(saisieClient('Dupont'));
    const refus = useFaits.getState().ajouterClient(saisieClient('dupont'));
    expect(refus).toMatch(/déjà/i);
    expect(clients()).toHaveLength(1);
  });

  it('refuse un nom vide', () => {
    expect(useFaits.getState().ajouterClient(saisieClient('  '))).toMatch(/obligatoire/i);
  });

  // Sans propagation, les recettes resteraient attachées à un nom que plus
  // aucun client ne porte.
  it('propage un renommage sur les missions et les recettes', () => {
    useFaits.getState().ajouterClient(saisieClient('Dupont'));
    const idClient = clients()[0]?.id as string;
    useFaits.getState().ajouterMission({
      clientId: null, clientNom: 'Dupont', description: 'Mission',
      tjm: euros(400), debut: dateISO('2026-01-01'), fin: null, statut: 'active', entites: []
    });
    ajouter({ clientNom: 'Dupont' });

    expect(useFaits.getState().modifierClient(idClient, { nom: 'Dupont SARL' })).toBeNull();

    const faits = useFaits.getState().faits;
    expect(faits.clients[0]?.nom).toBe('Dupont SARL');
    expect(faits.missions[0]?.clientNom).toBe('Dupont SARL');
    expect(faits.recettes[0]?.clientNom).toBe('Dupont SARL');
  });

  // Corriger la casse est un renommage : sans propagation, l'ancienne casse
  // subsisterait dans les recettes.
  it('propage aussi une simple correction de casse', () => {
    useFaits.getState().ajouterClient(saisieClient('dupont'));
    const idClient = clients()[0]?.id as string;
    ajouter({ clientNom: 'dupont' });
    useFaits.getState().modifierClient(idClient, { nom: 'Dupont' });
    expect(useFaits.getState().faits.recettes[0]?.clientNom).toBe('Dupont');
  });

  it('modifie un champ sans toucher aux rattachements', () => {
    useFaits.getState().ajouterClient(saisieClient('Dupont'));
    const idClient = clients()[0]?.id as string;
    ajouter({ clientNom: 'Dupont' });
    useFaits.getState().modifierClient(idClient, { pays: 'DE', tvaIntracom: 'DE123' });

    expect(clients()[0]).toMatchObject({ nom: 'Dupont', pays: 'DE' });
    expect(useFaits.getState().faits.recettes[0]?.clientNom).toBe('Dupont');
  });

  // Les recettes resteraient au livre mais sortiraient des délais de paiement
  // et de la DES sans que rien ne le signale.
  it('refuse de supprimer un client qui porte des recettes', () => {
    useFaits.getState().ajouterClient(saisieClient('Dupont'));
    const idClient = clients()[0]?.id as string;
    ajouter({ clientNom: 'Dupont' });

    expect(useFaits.getState().supprimerClient(idClient)).toMatch(/rattachées/i);
    expect(clients()).toHaveLength(1);
  });

  it('supprime un client sans rattachement', () => {
    useFaits.getState().ajouterClient(saisieClient('Seul'));
    expect(useFaits.getState().supprimerClient(clients()[0]?.id as string)).toBeNull();
    expect(clients()).toHaveLength(0);
  });
});

describe('carnet — missions', () => {
  const missions = () => useFaits.getState().faits.missions;

  const saisieMission = (clientNom: string) => ({
    clientId: null, clientNom, description: 'Mission',
    tjm: euros(400), debut: dateISO('2026-01-01'), fin: dateISO('2026-12-31'),
    statut: 'active' as const, entites: []
  });

  // Perdre le nom couperait la mission de son chiffre d'affaires, que le nom
  // seul rattache.
  it('rattache la mission au client par identifiant, sans perdre le nom', () => {
    useFaits.getState().ajouterClient({
      nom: 'Dupont', adresse: '', siret: '', email: '',
      delaiPaiement: 'net_30' as const, pays: '', tvaIntracom: ''
    });
    const idClient = useFaits.getState().faits.clients[0]?.id;
    useFaits.getState().ajouterMission(saisieMission('Dupont'));

    expect(missions()[0]).toMatchObject({ clientId: idClient, clientNom: 'Dupont' });
  });

  it('accepte une mission pour un client hors carnet, sans identifiant', () => {
    useFaits.getState().ajouterMission(saisieMission('Inconnu'));
    expect(missions()[0]).toMatchObject({ clientId: null, clientNom: 'Inconnu' });
  });

  // Une facture émise ne se retire pas du registre : supprimer la mission qui
  // la justifie rendrait sa présence inexplicable.
  it('refuse de supprimer une mission dont une recette relève de la période', () => {
    useFaits.getState().ajouterMission(saisieMission('Dupont'));
    ajouter({ clientNom: 'Dupont', emiseLe: dateISO('2026-06-30') });

    expect(useFaits.getState().supprimerMission(missions()[0]?.id as string))
      .toMatch(/registre|inexplicable/i);
    expect(missions()).toHaveLength(1);
  });

  it('supprime une mission dont aucune recette ne relève', () => {
    useFaits.getState().ajouterMission(saisieMission('Dupont'));
    expect(useFaits.getState().supprimerMission(missions()[0]?.id as string)).toBeNull();
    expect(missions()).toHaveLength(0);
  });

  it('modifie une mission', () => {
    useFaits.getState().ajouterMission(saisieMission('Dupont'));
    useFaits.getState().modifierMission(missions()[0]?.id as string, { statut: 'terminee', entites: [] });
    expect(missions()[0]?.statut).toBe('terminee');
  });
});

/**
 * LA PART GARDÉE EST BORNÉE DANS LE MAGASIN, PAS DANS L'ÉCRAN.
 *
 * Un curseur borné côté interface laisse passer tout ce qui n'est pas saisi au
 * curseur : un import, un compte distant, un jeu de démonstration. Si ce
 * bornage sautait, une part supérieure à 1 rendrait `versable × (1 − part)`
 * négatif — l'application proposerait un versement à l'envers.
 */
describe('part gardée au versement', () => {
  const part = () => useFaits.getState().faits.partGardeeAuVersement;

  it('vaut zéro tant que personne n’a réglé le curseur', () => {
    expect(part()).toBe(0);
  });

  it('enregistre une part réglée', () => {
    useFaits.getState().definirPartGardee(ratio(0.3));
    expect(part()).toBe(0.3);
  });

  it('borne à 80 % : au-delà, le curseur ne dit plus « je garde »', () => {
    useFaits.getState().definirPartGardee(ratio(0.95));
    expect(part()).toBe(PART_GARDEE_MAX);
  });

  it('refuse une part négative, qui ferait verser plus que le versable', () => {
    useFaits.getState().definirPartGardee(ratio(-0.2));
    expect(part()).toBe(0);
  });

  // Une saisie illisible ne doit pas se traduire par « je garde tout », qui est
  // une décision que personne n'a prise.
  it('retombe à zéro sur une valeur illisible, pas sur la borne haute', () => {
    useFaits.getState().definirPartGardee(ratio(Number.NaN));
    expect(part()).toBe(0);
  });
});
