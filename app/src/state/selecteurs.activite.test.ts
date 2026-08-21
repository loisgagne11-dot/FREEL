import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import { type Faits, faitsVides } from './schema';
import {
  craDuMoisParMission, etatActivite, lundiDeLaSemaine, planningDeLaSemaine,
  rapportParMission
} from './selecteurs.activite';

const D = (s: string) => dateISO(s);

/** Lundi à jeudi pleins, vendredi à mi-temps — le rythme le plus courant. */
const MISSION = {
  id: 'm1', clientId: null, clientNom: 'Client de démo', description: 'Mission',
  tjm: euros(500), debut: D('2026-01-01'), fin: D('2026-12-31'),
  statut: 'active' as const,
  // Le rythme appartient au CLIENT OPÉRATIONNEL depuis le schéma 4 : c'est ce
  // qui permet deux donneurs d'ordre par mission, chacun avec le sien.
  entites: [{
    id: 'm1-co1', nom: 'Client de démo', couleur: '', adresse: '', contact: '',
    email: '', telephone: '',
    rythmes: [{
      du: D('2026-01-01'), au: D('2026-12-31'),
      parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 0.5 },
      tjm: euros(500)
    }],
    ajustements: {}
  }]
};

/**
 * La même mission, avec un ajustement posé sur son client opérationnel.
 *
 * Les appels donnent la seule quotité : c'est tout ce que l'occupation regarde.
 * Le créneau et le lieu, arrivés au schéma 14, ne changent aucun de ces calculs
 * — les écrire ici ferait croire le contraire.
 */
const avecAjustement = (quotites: Record<string, number>) => ({
  ...MISSION,
  entites: [{
    ...(MISSION.entites[0] as (typeof MISSION)['entites'][number]),
    ajustements: Object.fromEntries(
      Object.entries(quotites).map(([date, quotite]) => [date, { quotite }])
    )
  }]
});

const avec = (m: Partial<Faits> = {}): Faits => ({ ...faitsVides(), missions: [MISSION], ...m });

describe('lundi de la semaine', () => {
  it('rend le lundi pour n’importe quel jour de la semaine', () => {
    expect(lundiDeLaSemaine(D('2026-08-12'))).toBe('2026-08-10'); // mercredi
    expect(lundiDeLaSemaine(D('2026-08-10'))).toBe('2026-08-10'); // lundi
  });

  /**
   * Le dimanche est le dernier jour de la semaine française, pas le premier.
   * `getUTCDay()` le numérote 0 : reculer d'un jour ferait commencer sa
   * semaine le lendemain, et le planning afficherait la semaine suivante.
   */
  it('rattache le dimanche à la semaine qui s’achève', () => {
    expect(lundiDeLaSemaine(D('2026-08-16'))).toBe('2026-08-10');
  });
});

describe('planning de la semaine', () => {
  it('remplit la semaine depuis le rythme, sans rien saisir', () => {
    const p = planningDeLaSemaine(avec(), D('2026-08-12'));
    expect(p.lundi).toBe('2026-08-10');
    expect(p.jours).toHaveLength(7);
    expect(p.jours.map((j) => j.retenu)).toEqual([1, 1, 1, 1, 0.5, 0, 0]);
    expect(p.totalRetenu).toBe(4.5);
  });

  it('retranche un congé, demi-journée comprise', () => {
    const p = planningDeLaSemaine(
      avec({ conges: [{ date: D('2026-08-11'), quotite: 0.5 }] }), D('2026-08-12')
    );
    expect(p.jours[1]?.retenu).toBe(0.5);
    expect(p.jours[1]?.conge).toBe(0.5);
  });

  /**
   * Sans priorité absolue de l'ajustement, effacer une journée serait
   * impossible : le rythme la remettrait, et le CRA facturerait un jour qui
   * n'a pas eu lieu.
   */
  it('laisse l’ajustement l’emporter sur le rythme', () => {
    const p = planningDeLaSemaine(
      avec({ missions: [avecAjustement({ '2026-08-10': 0 })] }),
      D('2026-08-12')
    );
    expect(p.jours[0]?.prevu).toBe(1);
    expect(p.jours[0]?.retenu).toBe(0);
    expect(p.jours[0]?.parMission[0]?.ajuste).toBe(true);
  });

  it('additionne deux missions sur la même journée', () => {
    const seconde = { ...MISSION, id: 'm2', description: 'Autre mission' };
    const p = planningDeLaSemaine(avec({ missions: [MISSION, seconde] }), D('2026-08-12'));
    expect(p.jours[0]?.retenu).toBe(2);
    expect(p.jours[0]?.parMission).toHaveLength(2);
  });

  // Le vide se lit mieux qu'une ligne à zéro : une mission qui ne prévoit
  // rien ce jour-là n'encombre pas la case.
  it('n’encombre pas les jours où une mission ne prévoit rien', () => {
    const p = planningDeLaSemaine(avec(), D('2026-08-12'));
    expect(p.jours[5]?.parMission).toEqual([]); // samedi
  });

  /**
   * Une semaine à cheval sur le 31 décembre touche deux années : ne charger
   * les fériés que d'une seule ferait travailler le 1er janvier.
   */
  it('connaît les fériés des deux années quand la semaine est à cheval', () => {
    const p = planningDeLaSemaine(avec(), D('2026-12-30'));
    const premierJanvier = p.jours.find((j) => j.date === '2027-01-01');
    expect(premierJanvier?.ferie).toBe(true);
    expect(premierJanvier?.retenu).toBe(0);
  });

  // Une mission perdue ou en prospect ne produit aucun jour travaillé : la
  // faire figurer au planning gonflerait l'activité d'une mission qui n'existe
  // pas.
  it('ignore les missions perdues et les prospects', () => {
    const p = planningDeLaSemaine(
      avec({ missions: [{ ...MISSION, statut: 'perdue' as const }] }), D('2026-08-12')
    );
    expect(p.totalRetenu).toBe(0);
  });
});

/**
 * DEUX DONNEURS D'ORDRE DERRIÈRE UNE MÊME MISSION.
 *
 * Une mission passée par une agence peut couvrir plusieurs clients finaux.
 * Chacun a SON rythme — c'est ce qui permet « lundi-mardi chez l'un,
 * mercredi-jeudi chez l'autre » sans avoir à trancher, jour par jour, à qui
 * revient la journée.
 */
describe('clients opérationnels', () => {
  const via = (): Faits['missions'][number] => ({
    ...MISSION,
    description: 'Mission via agence',
    entites: [
      {
        id: 'co-a', nom: 'Client A', couleur: '#22c55e', adresse: '', contact: '',
        email: '', telephone: '',
        rythmes: [{
          du: D('2026-01-01'), au: D('2026-12-31'), parJour: { lun: 1, mar: 1 }, tjm: null
        }],
        ajustements: {}
      },
      {
        id: 'co-b', nom: 'Client B', couleur: '#38bdf8', adresse: '', contact: '',
        email: '', telephone: '',
        rythmes: [{
          du: D('2026-01-01'), au: D('2026-12-31'), parJour: { mer: 1, jeu: 1 }, tjm: null
        }],
        ajustements: {}
      }
    ]
  });

  it('donne une ligne de planning par client, avec sa teinte', () => {
    const semaine = planningDeLaSemaine(avec({ missions: [via()] }), D('2026-08-12'));
    const lundi = semaine.jours[0];
    expect(lundi?.parMission.map((l) => l.entiteId)).toEqual(['co-a']);
    expect(lundi?.parMission[0]?.couleur).toBe('#22c55e');

    const mercredi = semaine.jours[2];
    expect(mercredi?.parMission.map((l) => l.entiteId)).toEqual(['co-b']);
  });

  // Le nom de la mission seul rendrait deux lignes indiscernables.
  it('nomme chaque ligne quand il y en a plusieurs', () => {
    const semaine = planningDeLaSemaine(avec({ missions: [via()] }), D('2026-08-12'));
    expect(semaine.jours[0]?.parMission[0]?.libelle).toBe('Mission via agence — Client A');
  });

  /**
   * Le cas ordinaire ne doit RIEN montrer du concept : un seul client, le
   * libellé reste celui de la mission. Personne n'a à apprendre le mot
   * « client opérationnel » pour saisir une mission simple.
   */
  it('ne nomme pas le client quand il n’y en a qu’un', () => {
    const semaine = planningDeLaSemaine(avec(), D('2026-08-12'));
    expect(semaine.jours[0]?.parMission[0]?.libelle).toBe('Mission');
  });

  /**
   * Un CRA par client qui signe. Les fusionner exposerait à l'un le volume
   * consacré à l'autre.
   */
  it('rend un CRA par client opérationnel', () => {
    const cras = craDuMoisParMission(avec({ missions: [via()] }), mois('2026-08'));
    expect(cras).toHaveLength(2);
    expect(cras.map((c) => c.clientNom)).toEqual(['Client A', 'Client B']);
  });

  it('ne compte dans chaque CRA que les jours de son client', () => {
    const cras = craDuMoisParMission(avec({ missions: [via()] }), mois('2026-08'));
    // Août 2026 : 5 lundis, 4 mardis pour A ; 4 mercredis, 4 jeudis pour B.
    expect(cras[0]?.cra.totalJours).toBe(9);
    expect(cras[1]?.cra.totalJours).toBe(8);
  });
});

/**
 * CE QUE CHAQUE MISSION A PRODUIT — L'INDICATEUR QUI ATTRIBUAIT TOUT À LA
 * PREMIÈRE.
 *
 * Une facture ne porte pas le nom de la mission qui l'a produite : le modèle
 * ne relie que le client. Le rattachement précédent donnait l'intégralité du
 * chiffre d'affaires du client à la première de ses missions et ZÉRO aux
 * suivantes, sans le dire. On lisait « Charte éditoriale — 0 € » et on en
 * concluait que la mission ne rapportait rien.
 */
describe('ce que chaque mission a produit', () => {
  const M = (id: string, debut: string | null, fin: string | null, client = 'Client de démo') => ({
    ...MISSION, id, clientNom: client, description: id,
    debut: debut === null ? null : D(debut),
    fin: fin === null ? null : D(fin)
  });

  const R = (id: string, montant: number, emiseLe: string | null, encaisseeLe: string | null) => ({
    id, clientNom: 'Client de démo', libelle: id, montant: euros(montant),
    emiseLe: emiseLe === null ? null : D(emiseLe),
    encaisseeLe: encaisseeLe === null ? null : D(encaisseeLe),
    modeReglement: 'virement' as const, numero: id
  });

  const lignes = (f: Faits) => etatActivite(f, mois('2026-07'), new Date('2026-07-15T12:00:00Z')).missions;

  /**
   * LE CAS QUI COMPTE. Deux missions successives chez le même client : chacune
   * prend les factures émises pendant qu'elle courait. C'est la situation
   * courante, et c'est celle qui affichait 0 €.
   */
  it('sépare deux missions successives d’un même client par leurs dates', () => {
    const f = avec({
      missions: [M('printemps', '2026-01-01', '2026-04-30'), M('été', '2026-05-01', '2026-08-31')],
      recettes: [R('a', 3000, '2026-03-10', null), R('b', 5000, '2026-06-10', null)]
    });
    const [printemps, ete] = [
      lignes(f).find((l) => l.mission.id === 'printemps'),
      lignes(f).find((l) => l.mission.id === 'été')
    ];

    expect(printemps?.facture).toBe(3000);
    expect(ete?.facture).toBe(5000);
    expect(printemps?.missionsQuiPartagent).toBe(1);
  });

  /**
   * Deux missions d'un même client actives EN MÊME TEMPS : aucune date ne peut
   * trancher. Le montant est celui du client, et il faut le DIRE plutôt que de
   * choisir au hasard — ou d'afficher zéro.
   */
  it('signale le partage quand deux missions se recouvrent', () => {
    const f = avec({
      missions: [M('a', '2026-01-01', '2026-12-31'), M('b', '2026-01-01', '2026-12-31')],
      recettes: [R('r', 4000, '2026-06-10', null)]
    });
    for (const l of lignes(f)) {
      expect(l.facture).toBe(4000);
      expect(l.missionsQuiPartagent).toBe(2);
    }
  });

  /** Un brouillon n'a pas été envoyé : un devis en attente n'est pas du CA. */
  it('ne compte pas les brouillons dans le chiffre d’affaires', () => {
    const f = avec({
      missions: [M('m', null, null)],
      recettes: [R('brouillon', 9000, null, null), R('émise', 1000, '2026-06-01', null)]
    });
    expect(lignes(f)[0]?.facture).toBe(1000);
  });

  it('distingue l’encaissé du facturé, et ce qui reste à rentrer', () => {
    const f = avec({
      missions: [M('m', null, null)],
      recettes: [R('payée', 2000, '2026-05-01', '2026-06-01'), R('due', 3000, '2026-06-01', null)]
    });
    const l = lignes(f)[0];
    expect(l?.facture).toBe(5000);
    expect(l?.encaisse).toBe(2000);
    expect(l?.resteARentrer).toBe(3000);
  });

  /** Une mission sans dates prend tout ce que le client a facturé. */
  it('retient tout quand la mission n’a pas de fenêtre', () => {
    const f = avec({
      missions: [M('m', null, null)],
      recettes: [R('vieille', 1000, '2024-01-01', null), R('récente', 2000, '2026-06-01', null)]
    });
    expect(lignes(f)[0]?.facture).toBe(3000);
  });

  /** Deux clients ne se mélangent jamais, quelles que soient les dates. */
  it('ne mélange pas deux clients', () => {
    const f = avec({
      missions: [M('a', null, null), M('b', null, null, 'Autre client')],
      recettes: [R('r', 4000, '2026-06-10', null)]
    });
    expect(lignes(f).find((l) => l.mission.id === 'b')?.facture).toBe(0);
  });
});

/**
 * L'OCCUPATION AVAIT UN DÉNOMINATEUR JUSTE ET UN NUMÉRATEUR INVENTÉ.
 *
 * Les jours ouvrables sont comptés pour de vrai — fériés calculés, congés
 * déduits. Mais les jours travaillés se déduisaient du montant FACTURÉ divisé
 * par le tarif journalier. Or le planning donne les journées directement :
 * déduire des jours d'un montant quand on a les jours fabrique une
 * approximation là où le fait existe.
 */
describe('d’où viennent les jours travaillés', () => {
  const juillet = mois('2026-07');
  const enJuillet = new Date('2026-07-15T12:00:00Z');

  /**
   * LE CAS QUI CASSAIT. Un mois entièrement travaillé, rien de facturé — une
   * mission réglée au trimestre, un forfait, une facture pas encore émise.
   * L'ancienne mesure annonçait 0 % d'occupation sur un mois plein.
   */
  it('compte les journées du planning même sans aucune facture', () => {
    const etat = etatActivite(avec({ recettes: [] }), juillet, enJuillet);

    expect(etat.sourceCharge).toBe('planning');
    expect(etat.plan.joursFactures).toBeGreaterThan(0);
    expect(etat.plan.occupation).toBeGreaterThan(0);
  });

  /** Le planning l'emporte : c'est un fait, la division n'est qu'une estimation. */
  it('préfère le planning aux montants facturés', () => {
    const avecFactures = avec({
      recettes: [{
        id: 'r', clientNom: 'Client de démo', libelle: 'r', montant: euros(500),
        emiseLe: D('2026-07-10'), encaisseeLe: null,
        modeReglement: 'virement' as const, numero: 'r'
      }]
    });
    const etat = etatActivite(avecFactures, juillet, enJuillet);

    expect(etat.sourceCharge).toBe('planning');
    // Un seul jour serait déduit de la facture ; le planning en retient
    // beaucoup plus.
    expect(etat.plan.joursFactures).toBeGreaterThan(1);
  });

  /**
   * Sans rythme saisi, la division reste le seul recours — mais elle
   * s'annonce comme telle, pour que l'écran ne présente pas une estimation
   * comme une mesure.
   */
  it('retombe sur les montants facturés quand aucun rythme n’est saisi', () => {
    const sansRythme = avec({
      missions: [{ ...MISSION, entites: [] }],
      recettes: [{
        id: 'r', clientNom: 'Client de démo', libelle: 'r', montant: euros(1500),
        emiseLe: D('2026-07-10'), encaisseeLe: null,
        modeReglement: 'virement' as const, numero: 'r'
      }]
    });
    const etat = etatActivite(sansRythme, juillet, enJuillet);

    expect(etat.sourceCharge).toBe('facturation');
    expect(etat.plan.joursFactures).toBe(3);
  });

  /** Les ajustements comptent : une journée retirée retire de l'occupation. */
  it('suit les ajustements du planning', () => {
    const plein = etatActivite(avec({ recettes: [] }), juillet, enJuillet);
    const ampute = etatActivite(
      avec({ recettes: [], missions: [avecAjustement({ '2026-07-06': 0, '2026-07-07': 0 })] }),
      juillet, enJuillet
    );

    expect(ampute.plan.joursFactures).toBe(plein.plan.joursFactures - 2);
  });
});

/**
 * « QUELLE MISSION ME RAPPORTE QUOI ET ME PREND COMBIEN DE CHARGE DE TEMPS »
 *
 * La question était posée telle quelle, et aucune des deux sources ne pouvait
 * y répondre : l'ancienne application avait le rapport et la charge dans deux
 * écrans jamais croisés, la maquette les jours sans le chiffre d'affaires en
 * face.
 */
describe('rapport et charge par mission', () => {
  const rythme = (tjm: number) => ({
    du: D('2026-01-01'), au: D('2026-12-31'),
    parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 1 },
    tjm: euros(tjm)
  });

  const M = (id: string, tjm: number, du: string, au: string) => ({
    ...MISSION, id, description: id, clientNom: id, tjm: euros(tjm),
    debut: D(du), fin: D(au),
    entites: [{
      id: `${id}-co`, nom: id, couleur: '', adresse: '', contact: '',
      email: '', telephone: '',
      rythmes: [{ ...rythme(tjm), du: D(du), au: D(au) }],
      ajustements: {}
    }]
  });

  /**
   * LE POINT QUI COMPTE. On compare des RATIOS, pas des proportions : une
   * mission qui pèse peu dans le chiffre d'affaires en consommant beaucoup de
   * temps est un problème que sa part ne montre pas.
   */
  it('met l’euro-jour en première ligne, du meilleur au moins bon', () => {
    const r = rapportParMission(avec({
      missions: [M('petite', 800, '2026-01-01', '2026-01-31'),
                 M('grosse', 400, '2026-01-01', '2026-06-30')]
    }), 2026);

    expect(r[0]?.libelle).toBe('petite');
    expect(r[0]?.parJour).toBe(800);
    expect(r[1]?.parJour).toBe(400);
  });

  /** La charge en face du rapport : c'est la moitié de la question. */
  it('donne la part du temps que chaque mission consomme', () => {
    const r = rapportParMission(avec({
      missions: [M('a', 500, '2026-01-01', '2026-01-31'),
                 M('b', 500, '2026-02-01', '2026-02-28')]
    }), 2026);

    const total = r.reduce((s, l) => s + l.partDuTemps, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(r.every((l) => l.jours > 0)).toBe(true);
  });

  /**
   * Le montant est celui du travail PRODUIT et non de l'encaissé : l'encaissé
   * ne se rattache qu'au client, jamais à la mission. Une recette n'a donc
   * aucun effet sur ce tableau.
   */
  it('ne dépend pas des recettes encaissées', () => {
    const missions = [M('a', 500, '2026-01-01', '2026-03-31')];
    const sans = rapportParMission(avec({ missions, recettes: [] }), 2026);
    const avecRecette = rapportParMission(avec({
      missions,
      recettes: [{
        id: 'r', clientNom: 'a', libelle: 'r', montant: euros(99_000),
        emiseLe: D('2026-02-01'), encaisseeLe: D('2026-02-15'),
        modeReglement: 'virement' as const, numero: 'r'
      }]
    }), 2026);

    expect(avecRecette[0]?.produit).toBe(sans[0]?.produit);
  });

  /** Une mission sans journée retenue n'a pas d'euro-jour à montrer. */
  it('écarte les missions sans aucune journée', () => {
    const r = rapportParMission(avec({
      missions: [M('a', 500, '2026-01-01', '2026-01-31'),
                 M('future', 500, '2027-01-01', '2027-12-31')]
    }), 2026);

    expect(r).toHaveLength(1);
    expect(r[0]?.libelle).toBe('a');
  });

  /** Les journées valent le tarif en vigueur À LEUR DATE, comme le CRA. */
  it('valorise chaque journée au tarif de sa date', () => {
    const mission = {
      ...MISSION, id: 'm', description: 'm', clientNom: 'm', tjm: euros(999),
      debut: D('2026-01-01'), fin: D('2026-02-28'),
      entites: [{
        id: 'm-co', nom: 'm', couleur: '', adresse: '', contact: '',
        email: '', telephone: '',
        rythmes: [
          { ...rythme(400), du: D('2026-01-01'), au: D('2026-01-31') },
          { ...rythme(600), du: D('2026-02-01'), au: D('2026-02-28') }
        ],
        ajustements: {}
      }]
    };
    const r = rapportParMission(avec({ missions: [mission] }), 2026);

    // Entre les deux tarifs, jamais au-dessus ni en dessous.
    expect(r[0]?.parJour).toBeGreaterThan(400);
    expect(r[0]?.parJour).toBeLessThan(600);
  });

  /** Une année sans mission ne fait pas échouer le calcul. */
  it('rend une liste vide sans mission', () => {
    expect(rapportParMission(avec({ missions: [] }), 2026)).toHaveLength(0);
  });
});
