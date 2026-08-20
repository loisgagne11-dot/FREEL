import { describe, expect, it } from 'vitest';
import { dateISO } from '../types';
import {
  FORMULE_PAR_DEFAUT, echeanceDe, formuleDepuisJours, formuleOuNull
} from './delaiPaiement';
import {
  FORMULES_DELAI, depassementLegal, libelleDelai
} from './delaiPaiement.libelles';

/**
 * LES DEUX CONVENTIONS « FIN DE MOIS » NE TOMBENT PAS LE MÊME JOUR.
 *
 * C'est la confusion que ce module existe pour rendre impossible. Le tableau
 * du plan d'achèvement prend la facture du 12 juin comme cas de référence :
 * ces tests le vérifient date par date.
 */
describe('facture du 12 juin, chaque formule', () => {
  const douzeJuin = dateISO('2026-06-12');

  it('paiement à réception : le jour même', () => {
    expect(echeanceDe(douzeJuin, 'reception')).toBe('2026-06-12');
  });

  it('30 jours nets : le 12 juillet', () => {
    expect(echeanceDe(douzeJuin, 'net_30')).toBe('2026-07-12');
  });

  it('45 jours nets : le 27 juillet', () => {
    expect(echeanceDe(douzeJuin, 'net_45')).toBe('2026-07-27');
  });

  it('60 jours nets : le 11 août', () => {
    expect(echeanceDe(douzeJuin, 'net_60')).toBe('2026-08-11');
  });

  /**
   * Dix-neuf jours d'écart avec « 30 jours nets ». C'est ce que le calcul
   * précédent — une simple addition de jours — perdait sur chaque facture.
   */
  it('30 jours fin de mois : le 31 juillet, pas le 12', () => {
    expect(echeanceDe(douzeJuin, 'fdm_30')).toBe('2026-07-31');
  });

  it('45 jours fin de mois : le 31 juillet aussi', () => {
    expect(echeanceDe(douzeJuin, 'fdm_45')).toBe('2026-07-31');
  });

  it('60 jours fin de mois : le 31 août', () => {
    expect(echeanceDe(douzeJuin, 'fdm_60')).toBe('2026-08-31');
  });

  it('fin de mois + 30 jours : le 30 juillet', () => {
    expect(echeanceDe(douzeJuin, 'fin_de_mois_plus_30')).toBe('2026-07-30');
  });

  it('fin de mois + 45 jours : le 14 août', () => {
    expect(echeanceDe(douzeJuin, 'fin_de_mois_plus_45')).toBe('2026-08-14');
  });

  /**
   * Le cœur du module : les deux formules qu'on confond, côte à côte. Un jour
   * d'écart ici — et c'est l'écart qui décide si une relance part ou non.
   */
  it('distingue « 30 jours fin de mois » de « fin de mois + 30 jours »', () => {
    expect(echeanceDe(douzeJuin, 'fdm_30'))
      .not.toBe(echeanceDe(douzeJuin, 'fin_de_mois_plus_30'));
  });
});

/**
 * LES MOIS COURTS SONT LE PIÈGE CLASSIQUE.
 *
 * Une arithmétique sur les numéros de mois produit un 31 février. Le calcul
 * passe par un objet `Date`, qui déborde correctement.
 */
describe('débordements de mois', () => {
  it('31 janvier + 30 jours nets tombe en mars, pas sur un 31 février', () => {
    expect(echeanceDe(dateISO('2026-01-31'), 'net_30')).toBe('2026-03-02');
  });

  it('31 janvier à 30 jours fin de mois : fin mars', () => {
    expect(echeanceDe(dateISO('2026-01-31'), 'fdm_30')).toBe('2026-03-31');
  });

  it('trouve le bon dernier jour d’un février bissextile', () => {
    // 2028 est bissextile : « fin de mois » y répond le 29, pas le 28.
    expect(echeanceDe(dateISO('2028-02-03'), 'reception')).toBe('2028-02-03');
    expect(echeanceDe(dateISO('2028-01-31'), 'fin_de_mois_plus_30')).toBe('2028-03-01');
    expect(echeanceDe(dateISO('2028-02-01'), 'fin_de_mois_plus_30')).toBe('2028-03-30');
  });

  it('une facture du dernier jour du mois reste dans son mois à réception', () => {
    expect(echeanceDe(dateISO('2026-04-30'), 'reception')).toBe('2026-04-30');
  });
});

/**
 * ON CONSTATE, ON NE REFUSE PAS.
 *
 * Il arrive de signer ce qu'on n'a pas choisi. Une application qui interdirait
 * de saisir ses conditions réelles obligerait à mentir sur ses propres
 * factures. Mais elle le dit, parce que c'est une information qui sert quand on
 * négocie.
 */
describe('bornes légales', () => {
  it('laisse passer 60 jours nets et 45 jours fin de mois, qui sont les plafonds', () => {
    expect(depassementLegal('net_60')).toBeNull();
    expect(depassementLegal('fdm_45')).toBeNull();
  });

  it('signale 60 jours fin de mois', () => {
    expect(depassementLegal('fdm_60')).toMatch(/L441-10/);
  });

  it('signale fin de mois + 45 jours', () => {
    expect(depassementLegal('fin_de_mois_plus_45')).toMatch(/L441-10/);
  });

  it('ne signale rien sur les formules courtes', () => {
    for (const f of ['reception', 'net_30', 'net_45', 'fdm_30'] as const) {
      expect(depassementLegal(f)).toBeNull();
    }
  });
});

describe('libellés et lecture', () => {
  it('donne un libellé à chaque formule, sans doublon', () => {
    const libelles = FORMULES_DELAI.map(libelleDelai);
    expect(libelles).toHaveLength(FORMULES_DELAI.length);
    expect(new Set(libelles).size).toBe(FORMULES_DELAI.length);
  });

  /**
   * Un compte écrit par une version plus récente pourrait porter une formule
   * inconnue. La remplacer en silence par le défaut changerait des dates
   * d'échéance sans que personne le voie.
   */
  it('rend null sur une formule inconnue, au lieu de retomber sur le défaut', () => {
    expect(formuleOuNull('net_90')).toBeNull();
    expect(formuleOuNull(30)).toBeNull();
    expect(formuleOuNull(null)).toBeNull();
    expect(formuleOuNull('fdm_30')).toBe('fdm_30');
  });

  it('propose « 30 jours fin de mois » par défaut', () => {
    expect(FORMULE_PAR_DEFAUT).toBe('fdm_30');
  });
});

/**
 * LA MIGRATION TRADUIT VERS « NETS », ET C'EST DÉLIBÉRÉ.
 *
 * C'est exactement ce que l'ancien code calculait : `emiseLe + N jours`.
 * Traduire un ancien `30` par « 30 jours fin de mois » aurait décalé de
 * plusieurs semaines l'échéance de factures déjà émises, sous couvert de les
 * corriger.
 */
describe('reprise d’un ancien délai en jours', () => {
  it('traduit vers une formule « nets », pas « fin de mois »', () => {
    expect(formuleDepuisJours(30)).toBe('net_30');
    expect(formuleDepuisJours(45)).toBe('net_45');
    expect(formuleDepuisJours(60)).toBe('net_60');
  });

  it('traduit zéro par un paiement à réception', () => {
    expect(formuleDepuisJours(0)).toBe('reception');
    expect(formuleDepuisJours(-5)).toBe('reception');
  });

  it('arrondit vers la formule nommée la plus proche par le haut', () => {
    expect(formuleDepuisJours(15)).toBe('net_30');
    expect(formuleDepuisJours(90)).toBe('net_60');
  });
});
