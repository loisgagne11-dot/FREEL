import { beforeEach, describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import type { Echeance } from '../domain/calculs/provisions';
import { idAppelDeDeclaration, periodeDuMois } from '../domain/calculs/declarations';
import { type Faits, type Recette, faitsVides } from './schema';
import { useFaits } from './store';
import { etatPilote } from './selecteurs';
import { montantDeclaration } from './selecteurs.aTraiter';
import { ajouterEcheances, annulerDeclarationUrssaf, declarerUrssaf } from './ecritures.echeances';

const MAINTENANT = new Date('2026-08-13T09:00:00Z');
const T2 = periodeDuMois(mois('2026-04'), 'trimestriel', '2026-08-13');

const encaissee = (id: string, le: string, montant: number): Recette => ({
  id, clientNom: 'Client fictif', libelle: 'Prestation', montant: euros(montant),
  emiseLe: dateISO(le), encaisseeLe: dateISO(le), modeReglement: 'virement', numero: id
});

const base = (): Faits => ({
  ...faitsVides(),
  entreprise: {
    ...faitsVides().entreprise, urssafPeriodicite: 'trimestriel',
    debutActivite: dateISO('2026-04-01'), versementLiberatoire: true
  },
  recettes: [encaissee('r1', '2026-04-10', 3000), encaissee('r2', '2026-05-20', 2500)]
});

const faits = (): Faits => useFaits.getState().faits;
const du = (f: Faits): number => {
  const e = etatPilote(f, f.echeances, MAINTENANT);
  return e.voletConstate + e.voletAProvisionner;
};

beforeEach(() => {
  useFaits.setState({ faits: base() });
});

/**
 * LE DÛ NE BAISSE PAS EN DÉCLARANT.
 *
 * Une période déclarée quitte le volet « à provisionner ». Tant que l'appel
 * n'était pas saisi, sa dette n'était plus nulle part : le dû baissait de
 * toute la déclaration, et l'application proposait de se verser des
 * cotisations déclarées, donc dues. La déclaration crée l'appel : ce qui
 * quitte l'estimation entre au constaté, au même montant.
 */
describe('déclarer à l’URSSAF', () => {
  it('garde le dû : ce qui quitte l’estimation entre comme appel', () => {
    const avant = du(faits());
    const calcul = montantDeclaration(faits(), T2.mois);
    if (calcul.statut === 'refuse') throw new Error(calcul.motif);

    declarerUrssaf(T2, dateISO('2026-07-28'), calcul.valeur);

    expect(etatPilote(faits(), faits().echeances, MAINTENANT).voletConstate).toBeCloseTo(calcul.valeur, 2);
    expect(du(faits())).toBeCloseTo(avant, 1);
  });

  it('crée un appel lié, daté de la limite, et non payé', () => {
    declarerUrssaf(T2, dateISO('2026-07-28'), euros(1300));
    expect(faits().echeances).toEqual([{
      id: idAppelDeDeclaration('2026-T2'), nature: 'urssaf', montant: 1300,
      echeanceLe: '2026-07-31', payeeLe: null, montantPaye: null, periode: '2026-T2'
    }]);
  });

  /* Deux appels pour une période feraient payer deux fois la même dette. */
  it('redéclarer corrige l’appel créé au lieu d’en ajouter un second', () => {
    declarerUrssaf(T2, dateISO('2026-07-28'), euros(1300));
    declarerUrssaf(T2, dateISO('2026-07-29'), euros(1280));
    expect(faits().echeances.map((e) => e.montant)).toEqual([1280]);
    expect(faits().periodesDeclarees.every((p) => p.declareeLe === '2026-07-29')).toBe(true);
  });

  it('déclarer à zéro n’appelle rien, et retire l’appel non payé d’une déclaration précédente', () => {
    declarerUrssaf(T2, dateISO('2026-07-28'), euros(1300));
    declarerUrssaf(T2, dateISO('2026-07-28'), euros(0));
    expect(faits().echeances).toEqual([]);
    expect(faits().periodesDeclarees).toHaveLength(3);
  });

  /* Un appel saisi à la main, ou repris par la migration, règle déjà la
     période : en créer un second doublerait le dû — c'est le cas d'un compte
     repris de l'ancienne version, dont les prélèvements sont déjà là. */
  it('ne crée pas de second appel quand la période en porte déjà un', () => {
    const repris: Echeance = {
      id: 'ech-repris', nature: 'urssaf', montant: euros(1290), echeanceLe: dateISO('2026-07-31'),
      payeeLe: dateISO('2026-07-31'), montantPaye: null, periode: '2026-T2'
    };
    useFaits.setState({ faits: { ...faits(), echeances: [repris] } });
    declarerUrssaf(T2, dateISO('2026-07-28'), euros(1300));
    expect(faits().echeances).toEqual([repris]);
    expect(faits().periodesDeclarees).toHaveLength(3);
  });

  it('ne touche pas à un appel déjà payé', () => {
    declarerUrssaf(T2, dateISO('2026-07-28'), euros(1300));
    const paye = { ...faits().echeances[0] as Echeance, payeeLe: dateISO('2026-07-31') };
    useFaits.setState({ faits: { ...faits(), echeances: [paye] } });
    declarerUrssaf(T2, dateISO('2026-07-28'), euros(999));
    expect(faits().echeances).toEqual([paye]);
  });
});

/**
 * ANNULER RETIRE L'APPEL DE LA DÉCLARATION, ET LUI SEUL.
 *
 * L'appel créé par la déclaration, resté dans le dû après elle, s'ajouterait
 * à l'estimation qui revient. Mais un appel payé — l'argent est parti — et
 * un appel recopié d'un vrai courrier ne se perdent pas sur ce clic.
 */
describe('annuler une déclaration URSSAF', () => {
  it('retire l’appel non payé qu’elle avait créé', () => {
    declarerUrssaf(T2, dateISO('2026-07-28'), euros(1300));
    annulerDeclarationUrssaf(T2);
    expect(faits().periodesDeclarees).toEqual([]);
    expect(faits().echeances).toEqual([]);
  });

  it('garde un appel payé, et un appel saisi à la main', () => {
    declarerUrssaf(T2, dateISO('2026-07-28'), euros(1300));
    const paye = { ...faits().echeances[0] as Echeance, payeeLe: dateISO('2026-07-31') };
    const aLaMain: Echeance = {
      id: 'ech-main', nature: 'urssaf', montant: euros(40), echeanceLe: dateISO('2026-07-31'),
      payeeLe: null, montantPaye: null, periode: '2026-T2'
    };
    useFaits.setState({ faits: { ...faits(), echeances: [paye, aLaMain] } });
    annulerDeclarationUrssaf(T2);
    expect(faits().echeances).toEqual([paye, aLaMain]);
  });
});

/**
 * Un appel URSSAF saisi à la main ne règle aucune période tant qu'on ne le
 * dit pas : `null`, posé. Absent, la migration le rattacherait par l'ancienne
 * règle au premier compte relu.
 */
describe('saisir un appel URSSAF à la main', () => {
  it('le dit sans période, et laisse les autres natures sans le champ', () => {
    ajouterEcheances([
      { nature: 'urssaf', montant: euros(40), echeanceLe: dateISO('2026-09-30'), payeeLe: null, montantPaye: null },
      { nature: 'cfe', montant: euros(148), echeanceLe: dateISO('2026-12-15'), payeeLe: null, montantPaye: null }
    ]);
    const [urssaf, cfe] = faits().echeances;
    expect(urssaf).toHaveProperty('periode', null);
    expect(cfe).not.toHaveProperty('periode');
  });
});
