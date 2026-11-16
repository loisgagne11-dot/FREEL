import { describe, expect, it } from 'vitest';
import {
  ECRANS, ID_ECRAN_PAR_DEFAUT, resoudreEcran, resoudreRoute, ECRANS_DU_RAIL, entreeDuRail,
  redirection
} from './navigation';

describe('navigation — définition des écrans', () => {
  it('définit les huit écrans du rail et la rédaction d’une facture', () => {
    expect(ECRANS).toHaveLength(9);
  });

  it('donne à chaque écran un identifiant unique', () => {
    const ids = ECRANS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('donne à chaque écran un libellé non vide', () => {
    for (const ecran of ECRANS) {
      expect(ecran.libelle.trim().length).toBeGreaterThan(0);
    }
  });

  it('donne à chaque écran un chemin de route unique', () => {
    const chemins = ECRANS.map((e) => e.chemin);
    expect(new Set(chemins).size).toBe(chemins.length);
  });

  it('donne à chaque écran une icône non vide', () => {
    for (const ecran of ECRANS) {
      expect(ecran.icone.trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * SIX ENTRÉES POUR CE QU'ON VIENT FAIRE, DEUX SOUS LE FILET (décision 1).
   *
   * L'ordre est celui de la maquette `navigation.html` : il dit la fréquence,
   * du Pilote qu'on ouvre tous les matins aux Achats qu'on saisit en fin de
   * mois. Simulateurs et Réglages passent sous un filet — mêlés aux six, ils
   * se liraient comme deux questions du même rang.
   */
  it('met au rail les six entrées de la maquette, puis Simulateurs et Réglages en pied', () => {
    expect(ECRANS_DU_RAIL.filter((e) => e.pied === undefined).map((e) => e.libelle))
      .toEqual(['Pilote', 'Activité', 'Factures', 'Trésorerie', 'Obligations', 'Achats']);
    expect(ECRANS_DU_RAIL.filter((e) => e.pied === true).map((e) => e.libelle))
      .toEqual(['Simulateurs', 'Réglages']);
  });

  /* La barre basse du téléphone : quatre entrées et « Plus » (décision 3). */
  it('met dans la barre du téléphone Pilote, Activité, Factures et Trésorerie', () => {
    expect(ECRANS_DU_RAIL.filter((e) => e.barre === true).map((e) => e.id))
      .toEqual(['pilote', 'activite', 'factures', 'tresorerie']);
  });

  it('allume « Factures » sur une facture, et chaque autre écran sur lui-même', () => {
    expect(entreeDuRail('facture')).toBe('factures');
    expect(entreeDuRail('tresorerie')).toBe('tresorerie');
  });

  it('résout toujours les routes des factures', () => {
    expect(resoudreEcran('#/facture/nouvelle').id).toBe('facture');
  });
});

describe('navigation — résolution du hash', () => {
  it('retombe sur Pilote quand le hash est vide', () => {
    expect(resoudreEcran('').id).toBe(ID_ECRAN_PAR_DEFAUT);
  });

  it('retombe sur Pilote quand le hash est inconnu', () => {
    expect(resoudreEcran('#/nimportequoi').id).toBe(ID_ECRAN_PAR_DEFAUT);
  });

  it('résout un hash connu vers le bon écran', () => {
    expect(resoudreEcran('#/tresorerie').id).toBe('tresorerie');
    expect(resoudreEcran('#/achats').id).toBe('achats');
  });

  it("ne fait jamais de correspondance par préfixe de texte — c'est le bug qu'on supprime", () => {
    // "#/pi" est un préfixe de "#/pilote" : une correspondance par préfixe le
    // résoudrait à tort vers Pilote. La comparaison doit être stricte.
    expect(resoudreEcran('#/pi').id).toBe(ID_ECRAN_PAR_DEFAUT);
  });
});

/**
 * LES SOUS-ROUTES EXISTENT POUR QUE LES ACTIONS RAPIDES SOIENT HONNÊTES.
 *
 * Une action « Nouvelle facture » qui dépose sur la liste des factures oblige à
 * chercher le bouton une deuxième fois. Elle doit ouvrir la rédaction.
 */
describe('navigation — sous-routes', () => {
  it('sépare l’écran de ce qui le suit', () => {
    const route = resoudreRoute('#/facture/nouvelle');
    expect(route.ecran.id).toBe('facture');
    expect(route.sousRoute).toBe('nouvelle');
  });

  it('rend une sous-route vide quand il n’y en a pas', () => {
    expect(resoudreRoute('#/facture').sousRoute).toBe('');
    expect(resoudreRoute('').sousRoute).toBe('');
  });

  // La barre oblique finale est une variante d'écriture, pas une sous-route.
  it('ne prend pas une barre oblique finale pour un segment', () => {
    expect(resoudreRoute('#/facture/').sousRoute).toBe('');
  });

  /**
   * Le découpage par segments ne doit pas rouvrir la porte au préfixe : un
   * écran inconnu reste inconnu, quelle que soit sa suite.
   */
  it('ignore la sous-route d’un écran inconnu', () => {
    const route = resoudreRoute('#/pi/nouvelle');
    expect(route.ecran.id).toBe(ID_ECRAN_PAR_DEFAUT);
    expect(route.sousRoute).toBe('');
  });
});

/**
 * LES ANCIENNES ADRESSES MÈNENT À LEUR NOUVELLE PLACE (lot 51).
 *
 * Une ligne par adresse : retirer une redirection fait tomber la ligne qui la
 * nomme. Sans elles, un favori `#/argent` ouvrirait le Pilote comme une
 * adresse inconnue — on croirait la page disparue —, et `#/activite/factures`
 * ouvrirait le planning, puisque Activité existe toujours.
 */
describe('navigation — redirection des anciennes adresses', () => {
  it.each([
    ['#/argent', '#/tresorerie'],
    ['#/argent/tva', '#/obligations/tva'],
    ['#/argent/livre', '#/obligations/livre'],
    ['#/outils', '#/simulateurs'],
    ['#/outils/cra', '#/activite/compte-rendu'],
    ['#/config', '#/reglages'],
    ['#/config/profil', '#/reglages/profil'],
    ['#/config/fiscal', '#/reglages/fiscal'],
    ['#/config/reserve', '#/reglages/reserve'],
    ['#/config/facturation', '#/reglages/facturation'],
    ['#/config/compte', '#/reglages/compte'],
    ['#/config/donnees', '#/reglages/donnees'],
    ['#/config/affichage', '#/reglages/affichage'],
    ['#/config/livre', '#/obligations/livre'],
    ['#/activite/factures', '#/factures'],
    ['#/activite/clients', '#/factures/clients'],
    ['#/achats/releve', '#/tresorerie/releve'],
    ['#/facture', '#/factures']
  ])('%s mène à %s', (ancienne, nouvelle) => {
    expect(redirection(ancienne)).toBe(nouvelle);
  });

  /* Les adresses actuelles ne bougent pas — y compris les sous-routes de geste
     d'un écran dont une autre sous-route a déménagé. */
  it.each([
    '', '#/pilote', '#/pilote/encaissements', '#/activite', '#/activite/missions',
    '#/activite/nouvelle-mission', '#/activite/conges', '#/factures', '#/factures/clients',
    '#/facture/nouvelle', '#/facture/2026-001', '#/tresorerie', '#/obligations/tva',
    '#/achats', '#/achats/depense', '#/simulateurs', '#/reglages/compte', '#/nimportequoi'
  ])('%s reste où il est', (actuelle) => {
    expect(redirection(actuelle)).toBeNull();
  });

  /* L'adresse est saisie par n'importe qui : un nom hérité de tout objet ne
     doit pas passer pour une ancienne adresse. */
  it('ne prend pas un nom hérité pour une ancienne adresse', () => {
    expect(redirection('#/constructor')).toBeNull();
    expect(redirection('#/__proto__/x')).toBeNull();
  });

  /* Une redirection mène toujours à un écran qui existe : sinon elle
     remplacerait un favori par le Pilote, en silence. */
  it('ne mène qu’à des écrans qui existent', () => {
    for (const ancienne of ['#/argent', '#/outils/cra', '#/config/livre', '#/achats/releve']) {
      const nouvelle = redirection(ancienne) ?? '';
      expect(resoudreEcran(nouvelle).chemin).toBe(`#/${nouvelle.split('/')[1]}`);
    }
  });
});
