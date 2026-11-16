import { describe, expect, it } from 'vitest';
import { type Mois, dateISO, euros } from '../domain/types';
import { totaux } from '../domain/calculs/facture';
import { type Faits, faitsVides } from './schema';
import { brouillonsDeFacture, reediterFacture } from './selecteurs.facture';

/**
 * RETROUVER UNE FACTURE DÉJÀ ÉMISE.
 *
 * Le document n'existait qu'à l'instant de l'émission, dans l'écran de
 * rédaction. Passé cet instant : plus moyen de le revoir, ni de le renvoyer à
 * un client qui dit ne pas l'avoir reçu — la réponse la plus courante à une
 * relance — ni même d'en garder une copie.
 *
 * Rien n'est stocké de plus pour autant. Le document se reconstruit depuis la
 * recette, l'entreprise et le carnet : ce qui se dérive ne se persiste pas,
 * sous peine de diverger de sa source à la première correction.
 */
describe('rééditer une facture émise', () => {
  const faits = (m: Partial<Faits> = {}): Faits => ({
    ...faitsVides(),
    entreprise: {
      ...faitsVides().entreprise,
      nom: 'Mon Entreprise', siret: '00000000000000', adresse: '1 rue Exemple',
      codePostal: '75001', ville: 'Paris',
      // Assujettie : sans quoi la TVA de la facture serait effacée à la
      // réédition, et le document contredirait l'original.
      tvaDepuis: '2025-01' as Faits['entreprise']['tvaDepuis']
    },
    clients: [{
      id: 'c1', nom: 'Client France', adresse: '2 rue Exemple', siret: '',
      email: '', delaiPaiement: 'net_30', pays: 'FR', tvaIntracom: ''
    }],
    recettes: [{
      id: 'r1', clientNom: 'Client France', libelle: 'Prestation de juin 2026, 18 j',
      montant: euros(1000), emiseLe: dateISO('2026-06-30'), encaisseeLe: null,
      modeReglement: null, numero: '2026-001', tvaCollectee: euros(200)
    }],
    ...m
  });

  it('reconstruit le document depuis les faits', () => {
    const r = reediterFacture(faits(), '2026-001');
    if (r.cas !== 'reeditee') throw new Error(`réédition attendue : ${JSON.stringify(r)}`);

    expect(r.facture.numero).toBe('2026-001');
    expect(r.facture.emetteur.nom).toBe('Mon Entreprise');
    expect(r.facture.destinataire.nom).toBe('Client France');
    // Les totaux du document retombent sur ceux de la recette : c'est la seule
    // preuve qui compte, puisque le client a reçu ces montants-là.
    expect(totaux(r.facture).totalHt).toBe(1000);
    expect(totaux(r.facture).totalTva).toBe(200);
    expect(totaux(r.facture).totalTtc).toBe(1200);
  });

  it('refuse un numéro qui ne correspond à rien', () => {
    expect(reediterFacture(faits(), '2026-999').cas).toBe('impossible');
  });

  /**
   * LE POINT DUR. Une facture émise à un client absent du carnet ne peut pas
   * être rééditée : son adresse est une mention obligatoire, et l'inventer
   * produirait un document irrégulier sous un numéro DÉJÀ UTILISÉ —
   * indiscernable de l'original pour qui le reçoit.
   */
  it('refuse quand le client n’est pas au carnet, et dit quoi faire', () => {
    const r = reediterFacture(faits({ clients: [] }), '2026-001');
    expect(r.cas).toBe('impossible');
    if (r.cas === 'impossible') {
      expect(r.motif).toMatch(/carnet/);
      expect(r.motif).toMatch(/Ajoute-le/);
    }
  });
});

/**
 * UNE MISSION À PLUSIEURS CLIENTS, FACTURÉE EN COMMUN OU CLIENT PAR CLIENT
 * (lot 31, décision 14).
 *
 * Mars 2026, une agence fictive et deux clients finaux. A travaille les lundis
 * et mardis (dix jours). B travaille le mercredi : deux plages, la seconde
 * payée en direct par un client fictif à partir du 16 — et une journée posée
 * à la main le samedi 28, qu'aucune plage ne couvre.
 */
describe('brouillon d’une mission à plusieurs clients', () => {
  const plage = (du: string, au: string, parJour: Record<string, number>, facturerA: string | null = null) => ({
    du: dateISO(du), au: dateISO(au), parJour, tjm: null, facturerA
  });
  const entite = (id: string, nom: string, o: Partial<Faits['missions'][number]['entites'][number]>) => ({
    id, nom, couleur: '', adresse: '', contact: '', email: '', telephone: '',
    rythmes: [], ajustements: {}, ...o
  });
  const faits = (facturation?: 'commune' | 'par_client', recettes: Faits['recettes'] = []): Faits => ({
    ...faitsVides(),
    recettes,
    missions: [{
      id: 'mis-ag', clientId: null, clientNom: 'Agence fictive', description: 'Mission via agence',
      tjm: euros(500), debut: dateISO('2026-03-01'), fin: dateISO('2026-03-31'), statut: 'active',
      ...(facturation !== undefined ? { facturation } : {}),
      entites: [
        entite('co-a', 'Client final A', { rythmes: [plage('2026-03-01', '2026-03-31', { lun: 1, mar: 1 })] }),
        entite('co-b', 'Client final B', {
          rythmes: [
            plage('2026-03-02', '2026-03-15', { mer: 1 }),
            plage('2026-03-16', '2026-03-27', { mer: 1 }, 'Client direct fictif')
          ],
          ajustements: { '2026-03-28': { quotite: 1 } }
        })
      ]
    }]
  });
  const M = '2026-03' as Mois;

  /** Sans choix, la mission fait ce qu'elle a toujours fait : une facture à l'agence. */
  it('sans choix, une mission à deux clients fait une seule facture au payeur de la mission', () => {
    const b = brouillonsDeFacture(faits(), M);
    expect(b.map((x) => x.clientNom)).toEqual(['Agence fictive']);
    expect(b[0]?.jours).toBe(15);
    expect(b[0]?.total).toBe(7500);
  });

  it('par client, rend un brouillon par client opérationnel et par payeur', () => {
    const b = brouillonsDeFacture(faits('par_client'), M);
    expect(b.map((x) => x.cle).sort()).toEqual([
      'Agence fictive·mis-ag·co-a',
      'Agence fictive·mis-ag·co-b',
      'Client direct fictif·mis-ag·co-b'
    ]);
  });

  /** Les mercredis 18 et 25 sont couverts par la plage payée en direct ; le 4, le 11 et le samedi 28 restent à l'agence. */
  it('découpe les journées selon la plage qui les couvre', () => {
    const b = brouillonsDeFacture(faits('par_client'), M);
    expect(b.find((x) => x.clientNom === 'Client direct fictif')?.jours).toBe(2);
    expect(b.find((x) => x.cle === 'Agence fictive·mis-ag·co-b')?.jours).toBe(3);
  });

  /**
   * Passer d'un mode à l'autre ne crée ni ne perd un euro. La journée du
   * samedi 28, qu'aucune plage ne couvre, part au payeur de la mission : la
   * laisser sans payeur la ferait disparaître de toutes les factures.
   */
  it('la somme des brouillons par client retombe sur le brouillon commun', () => {
    const somme = (fs: Faits) => brouillonsDeFacture(fs, M).reduce((s, x) => s + x.total, 0);
    expect(somme(faits('par_client'))).toBe(somme(faits('commune')));
    expect(somme(faits('par_client'))).toBe(7500);
  });

  /**
   * Une facture émise ne dit pas de quel client opérationnel elle portait les
   * journées. La comparer à l'un seulement des brouillons du même payeur ferait
   * lire un écart de mille euros là où il en manque cinq cents.
   */
  it('deux brouillons au même payeur gardent leur clé, et l’écart porte sur leur ensemble', () => {
    const emise = {
      id: 'r-ag', clientNom: 'Agence fictive', libelle: 'Mars', montant: euros(6000),
      emiseLe: dateISO('2026-03-31'), encaisseeLe: null, modeReglement: null, numero: '2026-900'
    };
    const aLAgence = brouillonsDeFacture(faits('par_client', [emise]), M)
      .filter((x) => x.clientNom === 'Agence fictive');
    expect(new Set(aLAgence.map((x) => x.cle)).size).toBe(2);
    // 5 000 (A) + 1 500 (B, trois journées) − 6 000 facturés.
    expect(aLAgence.map((x) => x.ecart?.montant)).toEqual([500, 500]);
    expect(aLAgence.every((x) => x.dejaEmise === '2026-900')).toBe(true);
  });
});
