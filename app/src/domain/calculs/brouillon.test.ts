import { describe, expect, it } from 'vitest';
import { euros, mois } from '../types';
import type { LigneDeBrouillon } from './brouillon';
import { brouillonsDuMois, libelleDeLaFacture } from './brouillon';

const M = mois('2026-07');

const ligne = (o: Partial<LigneDeBrouillon> = {}): LigneDeBrouillon => ({
  missionId: 'm', entiteId: 'e', libelle: 'Mission', clientNom: 'Client',
  jours: 10, montant: euros(5000), ...o
});

/**
 * UN BROUILLON QU'ON NE DEMANDE PAS, ET QUI SUIT L'ACTIVITÉ.
 *
 * Un brouillon enregistré serait juste à l'instant de sa création et faux dès
 * la première journée corrigée au planning — et on ne saurait jamais lequel
 * des deux croire. Celui-ci est dérivé : il suit par construction, non par un
 * mécanisme de mise à jour, parce qu'il n'a pas d'existence séparée à faire
 * diverger.
 */
describe('brouillon de facture du mois', () => {
  it('rassemble les journées d’un client en une seule facture', () => {
    const b = brouillonsDuMois(M, [
      ligne({ missionId: 'a', libelle: 'Mission A', jours: 6, montant: euros(3000) }),
      ligne({ missionId: 'b', libelle: 'Mission B', jours: 4, montant: euros(2400) })
    ]);

    expect(b).toHaveLength(1);
    expect(b[0]?.lignes).toHaveLength(2);
    expect(b[0]?.jours).toBe(10);
    expect(b[0]?.total).toBe(5400);
  });

  /**
   * LE POINT QUI COMPTE. On envoie une facture, pas quatre. Deux missions chez
   * le même donneur d'ordre font deux LIGNES d'un même document — c'est aussi
   * ce que le client attend de recevoir.
   */
  it('sépare deux clients, en groupe un seul', () => {
    const b = brouillonsDuMois(M, [
      ligne({ clientNom: 'Alpha', montant: euros(4000) }),
      ligne({ clientNom: 'Alpha', missionId: 'a2', montant: euros(1000) }),
      ligne({ clientNom: 'Beta', montant: euros(2000) })
    ]);

    expect(b).toHaveLength(2);
    expect(b.find((x) => x.clientNom === 'Alpha')?.total).toBe(5000);
    expect(b.find((x) => x.clientNom === 'Beta')?.total).toBe(2000);
  });

  /** Le plus gros d'abord : c'est celui qu'on envoie en premier. */
  it('met le plus gros montant en tête', () => {
    const b = brouillonsDuMois(M, [
      ligne({ clientNom: 'Petit', montant: euros(800) }),
      ligne({ clientNom: 'Gros', montant: euros(9000) })
    ]);
    expect(b[0]?.clientNom).toBe('Gros');
  });

  /**
   * Facturer zéro jour n'est pas une facture à zéro euro, c'est une facture
   * qui n'a pas lieu d'être.
   */
  it('ne fabrique rien pour une mission sans journée', () => {
    expect(brouillonsDuMois(M, [ligne({ jours: 0, montant: euros(0) })])).toHaveLength(0);
  });

  it('ne fabrique rien sans aucune ligne', () => {
    expect(brouillonsDuMois(M, [])).toHaveLength(0);
  });

  /**
   * LE CAS QUI ÉVITE LA FACTURE EN DOUBLE — sans effacer l'information.
   *
   * Le brouillon d'un client déjà facturé reste affiché, marqué. Le faire
   * disparaître empêcherait de voir qu'on a facturé douze jours là où le
   * planning en compte quatorze : l'écart qu'on veut constater avant que le
   * client le constate.
   */
  it('marque le client déjà facturé sans supprimer son brouillon', () => {
    const b = brouillonsDuMois(
      M, [ligne({ clientNom: 'Alpha' })], new Map([['Alpha', '2026-014']])
    );

    expect(b).toHaveLength(1);
    expect(b[0]?.dejaEmise).toBe('2026-014');
    expect(b[0]?.total).toBe(5000);
  });

  it('laisse à null les clients pas encore facturés', () => {
    const b = brouillonsDuMois(M, [ligne({ clientNom: 'Beta' })], new Map([['Alpha', '1']]));
    expect(b[0]?.dejaEmise).toBeNull();
  });
});

/**
 * Le libellé dit la période autant que la mission : c'est ce que le client
 * lira six mois plus tard en cherchant à quoi correspondait ce virement.
 */
describe('libellé de la facture', () => {
  it('nomme la mission et le mois quand il n’y en a qu’une', () => {
    const b = brouillonsDuMois(M, [ligne({ libelle: 'Refonte du site' })]);
    expect(libelleDeLaFacture(b[0] as never)).toBe('Refonte du site — juillet 2026');
  });

  it('compte les missions quand il y en a plusieurs', () => {
    const b = brouillonsDuMois(M, [
      ligne({ missionId: 'a', libelle: 'A' }),
      ligne({ missionId: 'b', libelle: 'B' })
    ]);
    expect(libelleDeLaFacture(b[0] as never)).toBe('2 missions — juillet 2026');
  });
});
