import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import { PERIODES_CIPAV, PERIODES_URSSAF } from '../domain/bareme/urssaf';
import type { CaisseRetraite } from '../domain/bareme/urssaf';
import { type Faits, type Recette, faitsVides } from './schema';
import { periodesUrssafEffectives } from './selecteurs';
import { tauxDeChargesAu } from './selecteurs.activite';
import { ventilationDeclaration } from './selecteurs.obligations';

const encaissee = (id: string, le: string, montant: number): Recette => ({
  id, clientNom: 'Client fictif', libelle: 'Prestation', montant: euros(montant),
  emiseLe: dateISO(le), encaisseeLe: dateISO(le), modeReglement: 'virement', numero: id
});

/** Un libéral fictif, trimestriel, qui a encaissé 10 000 € au deuxième trimestre 2026. */
const liberal = (caisse: CaisseRetraite, modifications: Partial<Faits['entreprise']> = {}): Faits => ({
  ...faitsVides(),
  entreprise: {
    ...faitsVides().entreprise, caisseRetraite: caisse, urssafPeriodicite: 'trimestriel',
    debutActivite: dateISO('2025-01-01'), ...modifications
  },
  recettes: [encaissee('r1', '2026-04-10', 6000), encaissee('r2', '2026-06-20', 4000)]
});

const T2 = [mois('2026-04'), mois('2026-05'), mois('2026-06')];

/*
 * La source unique du barème appliqué : provisions, dette, activité,
 * performance et déclaration la lisent toutes. Si elle ignorait la caisse,
 * tout l'écran d'un affilié Cipav tournerait au taux de la SSI.
 */
describe('le barème appliqué suit la caisse de retraite', () => {
  it('sert la table de la Cipav à un libéral de la Cipav, celle de la SSI aux autres', () => {
    expect(periodesUrssafEffectives(liberal('cipav'))).toEqual(PERIODES_CIPAV);
    expect(periodesUrssafEffectives(liberal('ssi'))).toEqual(PERIODES_URSSAF);
  });

  it('ignore la caisse d’une activité BIC', () => {
    expect(periodesUrssafEffectives(liberal('cipav', { typeActivite: 'BIC_service' }))).toEqual(PERIODES_URSSAF);
  });

  /* Le cumul que lit « ce qu'il te reste par jour » : 23,2 % + 2,2 % + 0,2 %.
     Au taux de la SSI, il dirait 28 %, et le tarif plancher serait trop haut. */
  it('compte 25,6 % de charges à un affilié Cipav sous versement libératoire, en 2026', () => {
    const r = tauxDeChargesAu(liberal('cipav', { versementLiberatoire: true }), mois('2026-05'));
    expect(r.statut !== 'refuse' && r.valeur).toBeCloseTo(0.256, 10);
  });
});

/*
 * Le montant recopié sur le site de l'URSSAF. Faux de la caisse, il se
 * déclarerait à 2 560 € de cotisations au lieu de 2 320 € — et l'écart
 * reviendrait en régularisation, ou en majoration s'il allait dans l'autre sens.
 */
describe('la déclaration d’un trimestre d’un affilié Cipav', () => {
  it('porte 23,2 % de cotisations et 0,2 % de CFP sur les recettes du trimestre', () => {
    const v = ventilationDeclaration(liberal('cipav'), T2);
    if (v.statut === 'refuse') throw new Error(v.motif);
    expect(v.valeur.cotisations).toBeCloseTo(2320, 2);
    expect(v.valeur.impot).toBe(0);
    expect(v.valeur.cfp).toBeCloseTo(20, 2);
    expect(v.valeur.total).toBeCloseTo(2340, 2);
  });

  it('y ajoute 2,2 % de versement libératoire quand l’option court', () => {
    const v = ventilationDeclaration(liberal('cipav', { versementLiberatoire: true }), T2);
    if (v.statut === 'refuse') throw new Error(v.motif);
    expect(v.valeur.impot).toBeCloseTo(220, 2);
    expect(v.valeur.total).toBeCloseTo(2560, 2);
  });
});
