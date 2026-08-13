import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import { type Faits, faitsVides } from './schema';
import {
  craDuMoisParMission, lundiDeLaSemaine, planningDeLaSemaine
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

/** La même mission, avec un ajustement posé sur son client opérationnel. */
const avecAjustement = (ajustements: Record<string, number>) => ({
  ...MISSION,
  entites: [{ ...(MISSION.entites[0] as (typeof MISSION)['entites'][number]), ajustements }]
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
