import { describe, expect, it } from 'vitest';
import { type DateISO, dateISO, euros, mois } from '../domain/types';
import { type Faits, type Mission, type Recette, faitsVides } from './schema';
import { craDuMoisParMission } from './selecteurs.activite';
import { etatDuCarnet } from './selecteurs.carnet';

/** Midi, heure locale : `dateDuJour` lit l'horloge du poste. */
const LE_10_JUIN = new Date('2026-06-10T12:00:00');

const SEMAINE_PLEINE = { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 1 } as const;

const mission = (m: Partial<Mission> & { readonly id: string }, parJour: Record<string, number> = SEMAINE_PLEINE,
  ajustements: Mission['entites'][number]['ajustements'] = {}): Mission => ({
  clientId: null, clientNom: `Client ${m.id}`, description: `Mission ${m.id}`, tjm: euros(500),
  debut: dateISO('2026-06-01'), fin: dateISO('2026-06-30'), statut: 'active',
  joursCommandes: null, preavisFinJours: null, reconduction: null, probabilite: null,
  ...m,
  entites: m.entites ?? [{
    id: `${m.id}-co1`, nom: '', couleur: '', adresse: '', contact: '', email: '', telephone: '',
    rythmes: [{
      du: m.debut ?? dateISO('2026-06-01'), au: m.fin ?? dateISO('2026-12-31'), parJour, tjm: null
    }],
    ajustements
  }]
});

const faits = (missions: readonly Mission[], o: Partial<Faits> = {}): Faits => ({ ...faitsVides(), missions, ...o });
const ligne = (f: Faits, id: string) => etatDuCarnet(f, LE_10_JUIN).lignes.find((l) => l.mission.id === id);

/**
 * Les jours faits se lisent sur le planning — le même que celui du CRA et de
 * la facture du mois. Un second compte finirait par dire 28,5 jours faits sur
 * la liste et 27 sur le compte rendu envoyé au client.
 */
describe('les jours faits d’une mission', () => {
  it('sont ceux du planning jusqu’à aujourd’hui inclus, ajustements, demi-journées et congés compris', () => {
    // Du lundi 1er au mercredi 10 juin : huit jours ouvrés. Le 3, une
    // demi-journée ; le 9, un congé posé.
    const f = faits([mission({ id: 'a' }, SEMAINE_PLEINE, { '2026-06-03': { quotite: 0.5 } })],
      { conges: [{ date: dateISO('2026-06-09'), quotite: 1 }] });
    expect(ligne(f, 'a')?.joursFaits).toBe(6.5);
  });

  it('disent, pour un mois clos, exactement ce que dit le compte rendu', () => {
    const m = mission({ id: 'a', debut: dateISO('2026-05-01'), fin: dateISO('2026-05-31') }, { lun: 1, mer: 0.5 },
      { '2026-05-20': { quotite: 1 } });
    const cra = craDuMoisParMission(faits([m]), mois('2026-05'))[0]?.cra.totalJours;
    expect(ligne(faits([m]), 'a')?.joursFaits).toBe(cra);
  });

  it('n’existent pas pour un prospect', () => {
    expect(ligne(faits([mission({ id: 'p', statut: 'prospect', joursCommandes: 25 })]), 'p')?.joursFaits).toBeNull();
  });
});

describe('le carnet signé, sur les faits', () => {
  /* Un prospect — même avec un rythme, un volume, une probabilité — n'entre
     ni dans les jours, ni dans les euros, ni dans les jours signés par mois. */
  it('ne compte jamais un prospect', () => {
    const signee = mission({ id: 'a', joursCommandes: 20 });
    const seule = etatDuCarnet(faits([signee]), LE_10_JUIN);
    const avecProspect = etatDuCarnet(faits([signee, mission({
      id: 'p', statut: 'prospect', joursCommandes: 25, probabilite: 90,
      debut: dateISO('2026-06-01'), fin: dateISO('2026-12-31')
    })]), LE_10_JUIN);
    expect(avecProspect.carnet).toEqual(seule.carnet);
    expect(avecProspect.joursSignes.slice(0, 1)).toEqual(seule.joursSignes.slice(0, 1));
  });

  it('prend le volume commandé quand il est connu, le planning restant sinon', () => {
    // Huit jours faits au 10 juin ; quatorze ouvrés encore jusqu'au 30.
    const f = faits([mission({ id: 'v', joursCommandes: 20 }), mission({ id: 'p' })]);
    expect(ligne(f, 'v')?.reste).toMatchObject({ statut: 'publie', valeur: 12 });
    expect(ligne(f, 'p')?.reste).toMatchObject({ statut: 'publie', valeur: 14 });
    expect(etatDuCarnet(f, LE_10_JUIN).carnet).toMatchObject({ jours: 26, euros: 13000 });
  });

  it('dit « sans fin fixée » d’une mission sans volume ni fin, et ne l’invente pas', () => {
    const f = faits([mission({ id: 'o', fin: null })]);
    expect(ligne(f, 'o')?.reste).toEqual({ statut: 'refuse', motif: 'sans fin fixée' });
    expect(etatDuCarnet(f, LE_10_JUIN).carnet).toMatchObject({ jours: 0, sansFinFixee: ['Mission o'] });
    expect(etatDuCarnet(f, LE_10_JUIN).visibilite).toMatchObject({ type: 'sans_fin' });
  });
});

/**
 * La rangée « Jours signés » : le mois courant compte en entier — c'est
 * l'occupation du mois qu'on lit en regard —, les suivants au planning.
 */
describe('les jours signés par mois', () => {
  it('comptent le mois courant entier, puis zéro tant qu’un contrat court, puis rien', () => {
    const f = faits([
      mission({ id: 'a', fin: dateISO('2026-07-31') }, { lun: 1, mar: 1 }),
      mission({ id: 'p', statut: 'prospect', debut: dateISO('2026-09-01'), fin: dateISO('2026-09-30') })
    ]);
    const e = etatDuCarnet(f, LE_10_JUIN);
    expect(e.mois[0]).toBe('2026-06');
    // Juin : cinq lundis, cinq mardis ; juillet : quatre et quatre, moins le
    // mardi 14, férié.
    expect(e.joursSignes.slice(0, 5)).toEqual([10, 7, 0, 0, null]);
  });

  /* Le mois courant se lit en regard de la tuile d'occupation : une mission
     terminée le 5 juin a bien travaillé en juin, et les deux nombres doivent
     être le même. */
  it('disent pour le mois courant les jours de l’occupation, mission terminée dans le mois comprise', () => {
    const f = faits([
      mission({ id: 'a', fin: dateISO('2026-07-31') }, { lun: 1 }),
      mission({ id: 't', statut: 'terminee', fin: dateISO('2026-06-05') }, { jeu: 1, ven: 1 })
    ]);
    const e = etatDuCarnet(f, LE_10_JUIN);
    expect(e.joursSignes[0]).toBe(7);
    expect(e.joursSignes[0]).toBe(e.occupation.chiffres.joursTravailles);
  });
});

/** Seule une mission achevée a quelque chose « à facturer ». */
describe('ce qui attend sa facture', () => {
  const facture = (montant: number, emiseLe: DateISO): Recette => ({
    id: `r-${emiseLe}`, clientNom: 'Client c', libelle: 'Prestation', montant: euros(montant),
    emiseLe, encaisseeLe: null, modeReglement: null, numero: `F-${emiseLe}`
  });

  it('se dit sur une mission dont le volume est atteint, moins ce qui est déjà facturé', () => {
    const m = mission({ id: 'c', joursCommandes: 3 }, { lun: 1 }); // lundis 1er et 8 : 2 jours
    const atteint = mission({ id: 'c', joursCommandes: 2 }, { lun: 1 });
    expect(ligne(faits([m]), 'c')?.etat).toMatchObject({ type: 'fin_annoncee' });
    expect(ligne(faits([atteint]), 'c')?.etat).toEqual({ type: 'a_facturer', montant: 1000 });
    expect(ligne(faits([atteint], { recettes: [facture(400, dateISO('2026-06-08'))] }), 'c')?.aFacturer).toBe(600);
  });
});
