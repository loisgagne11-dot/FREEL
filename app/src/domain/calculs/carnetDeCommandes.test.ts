import { describe, expect, it } from 'vitest';
import { type DateISO, type Mois, dateISO, euros, mois } from '../types';
import {
  type CommandeDeMission, PREAVIS_FIN_PAR_DEFAUT_JOURS, SANS_FIN_FIXEE,
  ajouterMoisALaDate, carnetSigne, courtJusquA, echeanceEnCours, etatDeLaMission, finAnnoncee,
  finDeVisibilite, joursSignesDesMois, resteAProduire, travailAcheve
} from './carnetDeCommandes';

const AUJOURDHUI = dateISO('2026-06-10');

const mission = (m: Partial<CommandeDeMission> = {}): CommandeDeMission => ({
  id: 'm1', statut: 'active', debut: dateISO('2026-05-01'), fin: dateISO('2026-07-31'),
  joursCommandes: null, preavisFinJours: null, reconduction: null, ...m
});

const publie = (valeur: number) => ({ statut: 'publie' as const, valeur, source: 'essai', verifieLe: AUJOURDHUI });

/**
 * Le carnet signé, ce sur quoi l'on décide de refuser une mission ou d'en
 * chercher une autre. Un prospect compté dedans fait lire comme acquis un mois
 * que rien ne garantit — et c'est précisément celui-là qu'on découvre vide.
 */
describe('le carnet signé', () => {
  it('ne compte jamais un prospect, même avec un volume et une probabilité', () => {
    const carnet = carnetSigne([
      { statut: 'active', nom: 'Signée', tjm: euros(500), reste: publie(10) },
      { statut: 'prospect', nom: 'Devis', tjm: euros(500), reste: publie(25) },
      { statut: 'perdue', nom: 'Perdue', tjm: euros(500), reste: publie(5) }
    ]);
    expect(carnet).toMatchObject({ jours: 10, euros: 5000, signees: 1 });
  });

  it('additionne jours et euros, jours × TJM de chaque mission', () => {
    expect(carnetSigne([
      { statut: 'active', nom: 'A', tjm: euros(520), reste: publie(16.5) },
      { statut: 'active', nom: 'B', tjm: euros(460), reste: publie(2.5) }
    ])).toMatchObject({ jours: 19, euros: 9730 });
  });

  /* Une mission sans fin compte pour rien, mais se NOMME : la taire ferait lire
     un carnet complet ; la compter pour zéro, une mission soldée. */
  it('nomme la mission sans fin fixée au lieu de la compter pour zéro', () => {
    const carnet = carnetSigne([
      { statut: 'active', nom: 'Bornée', tjm: euros(500), reste: publie(4) },
      { statut: 'active', nom: 'Ouverte', tjm: euros(500), reste: { statut: 'refuse', motif: SANS_FIN_FIXEE } }
    ]);
    expect(carnet).toMatchObject({ jours: 4, euros: 2000, sansFinFixee: ['Ouverte'] });
  });

  it('compte les jours d’une mission sans tarif, sans en inventer les euros', () => {
    expect(carnetSigne([{ statut: 'active', nom: 'Sans tarif', tjm: euros(0), reste: publie(3) }]))
      .toMatchObject({ jours: 3, euros: 0, sansTarif: ['Sans tarif'] });
  });
});

/**
 * Ce qui reste à produire : le volume commandé l'emporte, parce que c'est ce
 * que le client a signé ; sans lui, les jours planifiés jusqu'à l'échéance.
 */
describe('le reste à produire d’une mission signée', () => {
  it('se lit sur le volume commandé quand il est connu, et non sur le planning', () => {
    const r = resteAProduire(mission({ joursCommandes: 32 }), 15.5, 12, AUJOURDHUI);
    expect(r).toMatchObject({ statut: 'publie', valeur: 16.5 });
  });

  it('se lit sur le planning jusqu’à l’échéance quand aucun volume n’est commandé', () => {
    const r = resteAProduire(mission(), 15.5, 12, AUJOURDHUI);
    expect(r).toMatchObject({ statut: 'publie', valeur: 12 });
  });

  /* Les demi-journées sont la règle, pas l'exception : 12,5 commandés moins
     4,5 faits laissent 8, et non 7 ou 9 par un arrondi au jour. */
  it('tient les demi-journées', () => {
    expect(resteAProduire(mission({ joursCommandes: 12.5 }), 4.5, 0, AUJOURDHUI))
      .toMatchObject({ statut: 'publie', valeur: 8 });
  });

  it('se dit « sans fin fixée », sans aucun nombre, sans volume ni fin', () => {
    expect(resteAProduire(mission({ fin: null }), 40, 200, AUJOURDHUI))
      .toEqual({ statut: 'refuse', motif: SANS_FIN_FIXEE });
  });

  it('reste chiffré sans fin quand le volume est connu', () => {
    expect(resteAProduire(mission({ fin: null, joursCommandes: 20 }), 5, 0, AUJOURDHUI))
      .toMatchObject({ statut: 'publie', valeur: 15 });
  });

  it('ne descend pas sous zéro quand le volume est dépassé', () => {
    expect(resteAProduire(mission({ joursCommandes: 10 }), 12, 3, AUJOURDHUI))
      .toMatchObject({ statut: 'publie', valeur: 0 });
  });

  it('n’existe pas pour un prospect', () => {
    expect(resteAProduire(mission({ statut: 'prospect', joursCommandes: 25 }), 0, 0, AUJOURDHUI).statut).toBe('refuse');
  });
});

/**
 * Le préavis : soixante jours par défaut — le temps de négocier une suite ou
 * de trouver une autre mission —, ou celui que la mission choisit. Un défaut
 * perdu, et une fin de contrat arrive sans qu'aucun écran l'ait annoncée.
 */
describe('la fin annoncée', () => {
  it('s’annonce au préavis par défaut de soixante jours, et pas un jour avant', () => {
    expect(PREAVIS_FIN_PAR_DEFAUT_JOURS).toBe(60);
    expect(finAnnoncee(mission({ fin: dateISO('2026-08-09') }), AUJOURDHUI)).toMatchObject({ jours: 60 });
    expect(finAnnoncee(mission({ fin: dateISO('2026-08-10') }), AUJOURDHUI)).toBeNull();
  });

  it('suit le préavis choisi par la mission', () => {
    const fin = dateISO('2026-07-31'); // dans 51 jours
    expect(finAnnoncee(mission({ fin, preavisFinJours: 30 }), AUJOURDHUI)).toBeNull();
    expect(finAnnoncee(mission({ fin, preavisFinJours: 90 }), AUJOURDHUI)).toMatchObject({ jours: 51, reconduitLe: null });
  });

  it('n’annonce rien d’un prospect, d’une mission terminée, ni d’une fin déjà passée', () => {
    const fin = dateISO('2026-06-30');
    expect(finAnnoncee(mission({ fin, statut: 'prospect' }), AUJOURDHUI)).toBeNull();
    expect(finAnnoncee(mission({ fin, statut: 'terminee' }), AUJOURDHUI)).toBeNull();
    expect(finAnnoncee(mission({ fin: dateISO('2026-06-09') }), AUJOURDHUI)).toBeNull();
  });

  /* Avec reconduction, la phrase dit « se reconduit le … sauf dénonciation » :
     le jour d'après l'échéance de la période en cours. */
  it('dit le jour de la reconduction tacite', () => {
    expect(finAnnoncee(mission({ fin: dateISO('2026-06-30'), reconduction: { dureeMois: 1 } }), AUJOURDHUI))
      .toEqual({ echeance: '2026-06-30', jours: 20, reconduitLe: '2026-07-01' });
  });
});

/**
 * La reconduction : `fin` est l'échéance de la période saisie, les suivantes
 * se dérivent. Un contrat trimestriel signé fin mars est, en juin, à
 * l'échéance du 30 juin — le prendre pour fini en mars le sortirait du carnet.
 */
describe('l’échéance d’un contrat reconduit', () => {
  it('avance par périodes jusqu’à la période en cours', () => {
    const m = mission({ fin: dateISO('2026-03-31'), reconduction: { dureeMois: 3 } });
    expect(echeanceEnCours(m, AUJOURDHUI)).toBe('2026-06-30');
  });

  it('garde la fin saisie tant qu’elle n’est pas passée, et sans reconduction', () => {
    expect(echeanceEnCours(mission({ fin: dateISO('2026-07-31'), reconduction: { dureeMois: 3 } }), AUJOURDHUI))
      .toBe('2026-07-31');
    expect(echeanceEnCours(mission({ fin: dateISO('2026-03-31') }), AUJOURDHUI)).toBe('2026-03-31');
  });

  it('garde une fin de mois en fin de mois, sans glisser d’un pas à l’autre', () => {
    expect(ajouterMoisALaDate(dateISO('2026-01-31'), 1)).toBe('2026-02-28');
    expect(ajouterMoisALaDate(dateISO('2026-01-31'), 2)).toBe('2026-03-31');
    expect(ajouterMoisALaDate(dateISO('2026-04-30'), 3)).toBe('2026-07-31');
    expect(ajouterMoisALaDate(dateISO('2026-01-30'), 1)).toBe('2026-02-28');
    expect(ajouterMoisALaDate(dateISO('2026-01-30'), 2)).toBe('2026-03-30');
    expect(ajouterMoisALaDate(dateISO('2026-11-15'), 3)).toBe('2027-02-15');
  });
});

/** « Couvert jusqu'au 31 juillet », « Couvert, sans fin fixée », « Rien de signé ». */
describe('la fin de visibilité', () => {
  it('est la plus tardive des échéances signées, prospects ignorés', () => {
    const v = finDeVisibilite([
      mission({ id: 'a', fin: dateISO('2026-06-30') }),
      mission({ id: 'b', fin: dateISO('2026-07-31') }),
      mission({ id: 'p', statut: 'prospect', fin: dateISO('2026-12-31') })
    ], AUJOURDHUI);
    expect(v).toMatchObject({ type: 'date', date: '2026-07-31', jours: 51, missionId: 'b', aPreparer: true });
  });

  it('dit « sans fin fixée » dès qu’une mission signée n’a pas de fin', () => {
    const v = finDeVisibilite([mission({ id: 'a' }), mission({ id: 'b', fin: null, joursCommandes: 40 })], AUJOURDHUI);
    expect(v).toEqual({ type: 'sans_fin', missions: ['b'] });
  });

  it('ne dit rien de signé sans mission signée, ni avec des échéances déjà passées', () => {
    expect(finDeVisibilite([mission({ statut: 'prospect' })], AUJOURDHUI)).toEqual({ type: 'rien' });
    expect(finDeVisibilite([mission({ fin: dateISO('2026-05-03') })], AUJOURDHUI)).toEqual({ type: 'rien' });
  });

  it('n’a rien « à préparer » hors du préavis, ni quand le contrat se reconduit', () => {
    expect(finDeVisibilite([mission({ preavisFinJours: 30 })], AUJOURDHUI)).toMatchObject({ aPreparer: false });
    expect(finDeVisibilite([mission({ reconduction: { dureeMois: 3 } })], AUJOURDHUI))
      .toMatchObject({ aPreparer: false, reconduite: true });
  });
});

/**
 * La rangée « Jours signés » : un nombre tant qu'une mission ou un prospect
 * court encore — un zéro sous un prospect est un mois à remplir —, « — »
 * au-delà, où rien n'a encore à se dire.
 */
describe('les jours signés de chaque mois', () => {
  const douze: readonly Mois[] = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map(mois);

  it('écrit zéro tant qu’un prospect court encore, et rien au-delà', () => {
    const jusqua = courtJusquA([
      mission({ fin: dateISO('2026-07-31') }),
      mission({ statut: 'prospect', debut: dateISO('2026-09-01'), fin: dateISO('2026-09-30') })
    ], AUJOURDHUI);
    expect(jusqua).toBe('2026-09');
    const parMois = new Map<Mois, number>([[mois('2026-06'), 19.5], [mois('2026-07'), 7]]);
    expect(joursSignesDesMois(douze, parMois, jusqua)).toEqual([19.5, 7, 0, 0, null, null]);
  });

  it('écrit un nombre partout quand une mission court sans fin, et rien quand rien ne court', () => {
    expect(courtJusquA([mission({ fin: null })], AUJOURDHUI)).toBe('toujours');
    expect(joursSignesDesMois(douze, new Map(), 'toujours')).toEqual([0, 0, 0, 0, 0, 0]);
    expect(courtJusquA([mission({ statut: 'terminee' })], AUJOURDHUI)).toBeNull();
    expect(joursSignesDesMois(douze, new Map(), null)).toEqual([null, null, null, null, null, null]);
  });
});

/** L'état d'une mission, un signe et un mot ; ce qui appelle un geste d'abord. */
describe('l’état d’une mission', () => {
  const chiffres = (o: Partial<{ aujourdhui: DateISO; aFacturer: number; facture: number; resteARentrer: number }> = {}) => ({
    aujourdhui: AUJOURDHUI, aFacturer: euros(o.aFacturer ?? 0), facture: euros(o.facture ?? 0),
    resteARentrer: euros(o.resteARentrer ?? 0)
  });

  it('met l’argent qui attend sa facture avant la fin qui approche', () => {
    expect(etatDeLaMission(mission({ fin: dateISO('2026-06-30') }), chiffres({ aFacturer: 1380 })))
      .toEqual({ type: 'a_facturer', montant: 1380 });
    expect(etatDeLaMission(mission({ fin: dateISO('2026-06-30') }), chiffres()))
      .toEqual({ type: 'fin_annoncee', jours: 20, reconduitLe: null });
  });

  it('dit en cours hors du préavis, et fin passée quand l’échéance est derrière', () => {
    expect(etatDeLaMission(mission({ fin: dateISO('2026-12-31') }), chiffres())).toEqual({ type: 'en_cours' });
    expect(etatDeLaMission(mission({ fin: dateISO('2026-05-31') }), chiffres()))
      .toEqual({ type: 'fin_passee', le: '2026-05-31' });
  });

  it('dit soldée une mission terminée facturée et encaissée, et seulement elle', () => {
    expect(etatDeLaMission(mission({ statut: 'terminee' }), chiffres({ facture: 11960 })))
      .toEqual({ type: 'terminee', aEncaisser: 0, soldee: true });
    expect(etatDeLaMission(mission({ statut: 'terminee' }), chiffres({ facture: 11960, resteARentrer: 2400 })))
      .toEqual({ type: 'terminee', aEncaisser: 2400, soldee: false });
    expect(etatDeLaMission(mission({ statut: 'terminee' }), chiffres()))
      .toEqual({ type: 'terminee', aEncaisser: 0, soldee: false });
  });

  it('porte la probabilité d’un prospect quand elle est dite', () => {
    expect(etatDeLaMission({ ...mission({ statut: 'prospect' }), probabilite: 60 }, chiffres()))
      .toEqual({ type: 'prospect', probabilite: 60 });
    expect(etatDeLaMission(mission({ statut: 'prospect' }), chiffres())).toEqual({ type: 'prospect', probabilite: null });
  });
});

/**
 * Seule une mission achevée a quelque chose « à facturer » : en cours de mois,
 * le travail non facturé est la règle, et l'annoncer partout n'apprendrait
 * rien.
 */
describe('le travail achevé', () => {
  it('l’est au volume atteint, ou à l’échéance passée sans reconduction', () => {
    expect(travailAcheve(mission({ joursCommandes: 3 }), 3, AUJOURDHUI)).toBe(true);
    expect(travailAcheve(mission({ joursCommandes: 3 }), 2.5, AUJOURDHUI)).toBe(false);
    expect(travailAcheve(mission({ fin: dateISO('2026-06-09') }), 0, AUJOURDHUI)).toBe(true);
    expect(travailAcheve(mission({ fin: dateISO('2026-06-09'), reconduction: { dureeMois: 1 } }), 0, AUJOURDHUI)).toBe(false);
    expect(travailAcheve(mission({ statut: 'prospect', joursCommandes: 0.5 }), 1, AUJOURDHUI)).toBe(false);
  });
});
