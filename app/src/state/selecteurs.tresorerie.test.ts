import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import { type Faits, type Mission, completerFaitsCourants, faitsVides } from './schema';
import { entiteVide } from './schema.entite';
import { etatPilote } from './selecteurs';
import { etatProjection } from './selecteurs.argent';
import { encaissementsAttendusDetailles, encaissementsAttendusParMois } from './selecteurs.pipeline';
import { sortiesDuDu } from './selecteurs.sorties';
import {
  faitsAu, faitsDuScenario, projectionDuScenario, seuilsDeLAnnee, tresorerieDeLAnnee, tresorerieDouzeMois
} from './selecteurs.tresorerie';

const MAINTENANT = new Date(2026, 5, 10, 12);

const charger = (fichier: string): Faits =>
  completerFaitsCourants(JSON.parse(readFileSync(fichier, 'utf8')) as Record<string, unknown>);
const DEMO = charger('public/jeu-de-demonstration.json');
const ESSAI = charger('src/test/jeu-d-essai.json');

function poser(m: Partial<Faits> = {}): Faits {
  return {
    ...faitsVides(),
    entreprise: { ...faitsVides().entreprise, debutActivite: dateISO('2025-01-01'), urssafPeriodicite: 'trimestriel' },
    soldeInitial: euros(10_000),
    soldeInitialAu: dateISO('2026-01-01'),
    reserve: euros(2_000),
    ...m
  } as Faits;
}

const recette = (id: string, montant: number, emise: string, encaissee: string | null) => ({
  id, clientNom: 'Client d’essai', libelle: 'Prestation', montant: euros(montant),
  emiseLe: dateISO(emise), encaisseeLe: encaissee === null ? null : dateISO(encaissee),
  modeReglement: encaissee === null ? null : 'virement' as const, numero: id,
  echeanceLe: dateISO(emise)
});

/** Une mission au planning : trois jours par semaine, au tarif dit. */
const mission = (id: string, statut: Mission['statut'], du: string, au: string, probabilite: number | null = null): Mission => ({
  id, clientId: null, clientNom: 'Client d’essai', description: id, tjm: euros(500),
  debut: dateISO(du), fin: dateISO(au), statut, probabilite,
  entites: [{
    ...entiteVide(), id: `${id}-co1`, nom: 'Client d’essai',
    rythmes: [{ du: dateISO(du), au: dateISO(au), parJour: { lun: 1, mar: 1, mer: 1 }, tjm: null, facturerA: null }]
  }]
});

/**
 * LE DÛ D'AUJOURD'HUI, DATÉ — PAS UN SECOND CALCUL.
 *
 * Si le calendrier recomptait les cotisations à sa façon, le solde prévu
 * baisserait d'un montant qui n'est dû nulle part — ou garderait de côté de
 * l'argent qui ne sortira jamais.
 */
describe('le calendrier des sorties', () => {
  it('retrouve le dû d’aujourd’hui en entier, à l’euro, sur la démonstration et le jeu d’essai', () => {
    for (const [faits, maintenant] of [[DEMO, MAINTENANT], [ESSAI, new Date(2026, 11, 15, 12)]] as const) {
      const pilote = etatPilote(faits, faits.echeances, maintenant);
      const total = sortiesDuDu(faits, pilote, maintenant, () => null).reduce((t, s) => t + s.montant, 0);
      expect(Math.abs(total - pilote.tresorerie.provisions)).toBeLessThan(0.05);
    }
  });

  /*
   * La marche du 31 juillet : les cotisations du deuxième trimestre quittent
   * le compte à la limite de sa déclaration. Posées à l'encaissement, le solde
   * prévu de juin serait trop bas et celui de juillet ne ferait pas sa marche.
   */
  it('fait sortir les cotisations d’un trimestre à la limite de sa déclaration, pas à l’encaissement', () => {
    const faits = poser({ recettes: [recette('r1', 10_000, '2026-04-10', '2026-04-15')] });
    const p = etatProjection(faits, MAINTENANT);
    const juillet = p.sorties[1] ?? [];
    expect(p.sorties[0]?.filter((s) => s.nature === 'urssaf')).toEqual([]);
    expect(juillet.filter((s) => s.nature === 'urssaf').map((s) => s.le)).toEqual(['2026-07-31']);
    // Le solde garde la charge jusqu'en juillet ; le disponible l'a retirée dès avril.
    const [juin, juil] = p.projection.mois;
    expect((juin?.solde ?? 0) - (juil?.solde ?? 0)).toBeGreaterThan(2_000);
    expect(juin?.sansVersement).toBe(juil?.sansVersement);
  });

  /*
   * Un impôt que le dû ne compte pas — sa provision est refusée, faute de
   * barème ou de parts — ne doit pas sortir du solde prévu : il ferait baisser
   * la courbe d'un montant qu'aucune ligne de « Ce qui est dû » ne porte.
   */
  it('ne date pas un impôt que le dû ne compte pas', () => {
    const barème = poser({
      partsFiscales: 1, autresRevenusFoyer: euros(0), impositionCommune: false,
      recettes: [recette('r25', 30_000, '2025-06-01', '2025-06-15'), recette('r26', 10_000, '2026-02-01', '2026-02-15')]
    });
    const pilote = etatPilote(barème, barème.echeances, MAINTENANT);
    const impot = (p: typeof pilote) => sortiesDuDu(barème, p, MAINTENANT, () => null).filter((s) => s.nature === 'impot');
    expect(impot(pilote).length).toBeGreaterThan(0);
    const refuse = { ...pilote, provisionImpotRevenu: { statut: 'refuse' as const, motif: 'essai' } };
    expect(impot(refuse)).toEqual([]);
  });

  it('démonstration : 1 970 € d’URSSAF, de formation et de versement libératoire le 31 juillet', () => {
    const p = etatProjection(DEMO, MAINTENANT);
    const auTrenteEtUn = (p.sorties[1] ?? []).filter((s) => s.le === '2026-07-31' && s.origine === 'du');
    expect(Math.round(auTrenteEtUn.reduce((t, s) => t + s.montant, 0))).toBe(1_970);
  });
});

/**
 * LE PASSÉ : LE DISPONIBLE D'UNE FIN DE MOIS, LU DANS LES FAITS DE CE SOIR-LÀ.
 */
describe('un mois constaté', () => {
  /*
   * Si le dû d'un mois passé se lisait aujourd'hui, la courbe constatée
   * retirerait de mars les cotisations d'un encaissement d'avril : un
   * disponible plus bas qu'il ne l'a jamais été.
   */
  it('ne compte que ce qui était encaissé, payé et déclaré ce soir-là', () => {
    const faits = poser({
      recettes: [recette('r1', 4_000, '2026-03-01', '2026-03-10'), recette('r2', 6_000, '2026-04-01', '2026-04-05')]
    });
    const mars = faitsAu(faits, dateISO('2026-03-31'));
    expect(mars.recettes.filter((r) => r.encaisseeLe !== null).map((r) => r.id)).toEqual(['r1']);
    const constate = tresorerieDouzeMois(faits, MAINTENANT).mois.find((m) => m.mois === '2026-03');
    expect(constate?.nature).toBe('constate');
    expect(constate?.solde).toBe(14_000);
    // Le dû de mars : les cotisations de r1 seulement, au taux du trimestre.
    const du = etatPilote(mars, mars.echeances, new Date(2026, 2, 31, 12)).tresorerie.provisions;
    expect(constate?.disponible).toBe(euros(14_000 - du));
    expect(du).toBeLessThan(4_000 * 0.5);
  });

  it('se tait avant le solde de départ', () => {
    const faits = poser({ soldeInitialAu: dateISO('2026-04-15') });
    const [mars, avril] = tresorerieDouzeMois(faits, MAINTENANT).mois;
    expect(mars?.disponible).toBeNull();
    expect(avril?.disponible).not.toBeNull();
  });
});

describe('les douze mois à venir', () => {
  it('montrent trois mois constatés, puis le mois courant et les onze suivants', () => {
    const t = tresorerieDouzeMois(DEMO, MAINTENANT);
    expect(t.mois.map((m) => m.mois)).toEqual([
      '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
      '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05'
    ]);
    expect(t.mois.map((m) => m.nature)).toEqual([...Array(3).fill('constate'), ...Array(12).fill('prevu')]);
  });

  /* Les nombres de la maquette sont ceux de la démonstration. */
  it('démonstration : 1 896 € par mois jusqu’en mai 2027, le point bas en mai', () => {
    const t = tresorerieDouzeMois(DEMO, MAINTENANT);
    expect(t.versementTenable).toBe(1_896);
    expect(t.moisContraignant).toBe('2027-05');
    expect(t.pointBas?.mois).toBe('2027-05');
    expect(Math.round(t.disponible)).toBe(9_997);
  });

  it('séparent les factures émises du planning signé, sans rien perdre', () => {
    const horizon = [mois('2026-06'), mois('2026-07'), mois('2026-08')];
    const { factures, planning } = encaissementsAttendusDetailles(DEMO, horizon, MAINTENANT);
    const total = encaissementsAttendusParMois(DEMO, horizon, MAINTENANT);
    for (const m of horizon) expect((factures.get(m) ?? 0) + (planning.get(m) ?? 0)).toBe(total.get(m));
    expect(factures.get(mois('2026-07'))).toBeGreaterThan(0);
    expect(planning.get(mois('2026-07'))).toBeGreaterThan(0);
  });
});

/**
 * LES « ET SI » : DES FAITS CHANGÉS EN MÉMOIRE, LE MÊME CALCUL (lot 49, phase D).
 */
describe('les « et si »', () => {
  const avecProspect = poser({
    soldeInitial: euros(20_000),
    missions: [mission('signee', 'active', '2026-06-01', '2026-12-31'), mission('prospect', 'prospect', '2026-09-01', '2026-10-31', 40)]
  });
  const sansProspect = { ...avecProspect, missions: avecProspect.missions.filter((m) => m.id !== 'prospect') };

  /* Un prospect compté sans qu'on le demande ferait se verser l'argent d'un devis. */
  it('ne comptent jamais le prospect sans qu’on le demande', () => {
    expect(tresorerieDouzeMois(avecProspect, MAINTENANT).versementTenable)
      .toBe(tresorerieDouzeMois(sansProspect, MAINTENANT).versementTenable);
  });

  /*
   * « Si signé » : le prospect entre en entier — 40 % d'une mission
   * n'arrivent jamais sur un compte. Pondéré, il ajouterait 40 % de son
   * planning au pipeline.
   */
  it('comptent le prospect en entier, pas pondéré par sa probabilité', () => {
    const horizon = Array.from({ length: 12 }, (_, i) => mois(`${2026 + Math.floor((5 + i) / 12)}-${String(((5 + i) % 12) + 1).padStart(2, '0')}`));
    const total = (f: Faits) => [...encaissementsAttendusParMois(f, horizon, MAINTENANT).values()].reduce((t, v) => t + v, 0);
    const signe = faitsDuScenario(avecProspect, { prospects: true, arret: null });
    const seulLeProspect = faitsDuScenario({ ...avecProspect, missions: avecProspect.missions.filter((m) => m.id === 'prospect') },
      { prospects: true, arret: null });
    expect(total(signe) - total(sansProspect)).toBe(total(seulLeProspect));
    expect(total(seulLeProspect)).toBeGreaterThan(0);
    const scenario = projectionDuScenario(avecProspect, { prospects: true, arret: null }, MAINTENANT);
    expect(scenario?.versementTenable).toBeGreaterThan(tresorerieDouzeMois(avecProspect, MAINTENANT).versementTenable);
    expect(projectionDuScenario(avecProspect, { prospects: false, arret: null }, MAINTENANT)).toBeNull();
  });

  it('arrêtent une mission à une date : son planning d’après disparaît, celui d’avant reste', () => {
    const f = faitsDuScenario(sansProspect, { prospects: false, arret: { missionId: 'signee', le: dateISO('2026-08-31') } });
    const horizon = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'].map(mois);
    const avant = encaissementsAttendusDetailles(sansProspect, horizon, MAINTENANT).planning;
    const apres = encaissementsAttendusDetailles(f, horizon, MAINTENANT).planning;
    // Août, facturé le 31 et payé au délai du client, s'encaisse en septembre : il reste.
    expect(apres.get(mois('2026-09'))).toBe(avant.get(mois('2026-09')));
    expect(apres.get(mois('2026-09'))).toBeGreaterThan(0);
    expect(apres.get(mois('2026-12'))).toBe(0);
    expect(avant.get(mois('2026-12'))).toBeGreaterThan(0);
  });

  it('ne touchent pas aux faits enregistrés', () => {
    const avant = JSON.stringify(avecProspect);
    faitsDuScenario(avecProspect, { prospects: true, arret: { missionId: 'signee', le: dateISO('2026-08-31') } });
    expect(JSON.stringify(avecProspect)).toBe(avant);
  });
});

/**
 * LES SEUILS FRANCHIS PAR LE PIPELINE, ET LES JOURS FACTURABLES (lot 49).
 */
describe('les seuils de l’année', () => {
  /*
   * Un prospect compté au pipeline annoncerait un franchissement de TVA
   * qu'aucun contrat ne porte — et ferait facturer la TVA trop tôt.
   */
  it('ne comptent au pipeline que ce qui est émis et signé', () => {
    const base = poser({
      soldeInitial: euros(0),
      recettes: [recette('r1', 30_000, '2026-03-01', '2026-03-15')],
      missions: [mission('signee', 'active', '2026-06-01', '2026-07-31')]
    });
    const avecProspect = { ...base, missions: [...base.missions, mission('prospect', 'prospect', '2026-08-01', '2026-11-30')] };
    const franchise = (f: Faits) => seuilsDeLAnnee(f, MAINTENANT).lignes.find((l) => l.nom === 'franchise');
    expect(franchise(avecProspect)?.parLePipeline).toEqual(franchise(base)?.parLePipeline);
    expect(franchise(base)?.parLePipeline).toEqual({ statut: 'prevu', mois: '2026-08' });
  });

  it('comptent les jours facturables au tarif des missions signées, et s’abstiennent sans tarif', () => {
    const avecTarif = seuilsDeLAnnee(poser({
      recettes: [recette('r1', 22_500, '2026-03-01', '2026-03-15')],
      missions: [mission('signee', 'active', '2026-01-01', '2026-12-31')]
    }), MAINTENANT).lignes.find((l) => l.nom === 'franchise');
    expect(avecTarif?.joursFacturables.statut !== 'refuse' && avecTarif?.joursFacturables.valeur).toBe(30);
    const sansTarif = seuilsDeLAnnee(poser(), MAINTENANT).lignes.find((l) => l.nom === 'franchise');
    expect(sansTarif?.joursFacturables.statut).toBe('refuse');
  });

  it('démonstration : la franchise tombe en août par le pipeline, en septembre au rythme', () => {
    const franchise = seuilsDeLAnnee(DEMO, MAINTENANT).lignes.find((l) => l.nom === 'franchise');
    expect(franchise?.parLePipeline).toEqual({ statut: 'prevu', mois: '2026-08' });
    expect(franchise?.auRythme).toEqual({ statut: 'prevu', mois: '2026-09' });
  });
});

/**
 * LA VUE ANNÉE — reprise des règles de l'ancienne « évolution du compte » (lot
 * L1) : le passé est un fait, l'avenir une hypothèse, et avant le solde de
 * départ il n'y a rien à savoir.
 */
describe('la vue Année', () => {
  it('couvre janvier à décembre de l’année choisie, pas un rouleau de douze mois', () => {
    const faits = poser();
    expect(tresorerieDeLAnnee(faits, 2025, MAINTENANT).map((m) => m.mois)[0]).toBe('2025-01');
    expect(tresorerieDeLAnnee(faits, 2026, MAINTENANT).map((m) => m.mois)).toHaveLength(12);
    expect(tresorerieDeLAnnee(faits, 2026, MAINTENANT)[11]?.mois).toBe('2026-12');
  });

  it('compte les dépenses, les échéances payées et le versé dans les sorties d’un mois clos', () => {
    const faits = poser({
      depenses: [{
        id: 'd1', libelle: 'Matériel', fournisseur: 'Fournisseur d’essai', provenance: 'france',
        montantTtc: euros(500), tauxTva: 0.2 as never, payeeLe: dateISO('2026-02-10'),
        justificatifId: null, rapprochement: 'en_attente'
      }] as never,
      echeances: [{
        id: 'e1', nature: 'urssaf', montant: euros(800), montantPaye: euros(800),
        echeanceLe: dateISO('2026-02-05'), payeeLe: dateISO('2026-02-05')
      }]
    });
    const fevrier = tresorerieDeLAnnee(faits, 2026, MAINTENANT).find((m) => m.mois === '2026-02');
    expect(fevrier?.nature).toBe('constate');
    expect(fevrier?.sorties).toBe(1_300);
  });

  /*
   * Avant le solde de départ, le solde d'un mois est INCONNU : une courbe
   * immobile au montant de départ affirmerait que le compte l'a porté toute
   * l'année. Les flux, eux, sont des écritures datées : ils restent.
   */
  it('ne prétend connaître aucun solde avant le solde de départ, mais montre les encaissements', () => {
    const faits = poser({ soldeInitialAu: dateISO('2026-01-29'), recettes: [recette('r1', 5_000, '2025-07-01', '2025-07-15')] });
    const annee = tresorerieDeLAnnee(faits, 2025, MAINTENANT);
    expect(annee.every((m) => m.disponible === null && m.solde === null)).toBe(true);
    expect(annee.find((m) => m.mois === '2025-07')?.entrees).toBe(5_000);
    expect(tresorerieDeLAnnee(faits, 2026, MAINTENANT).find((m) => m.mois === '2026-01')?.solde).not.toBeNull();
  });

  it('relit une année passée en entier, constatée', () => {
    const annee = tresorerieDeLAnnee(ESSAI, 2026, new Date(2027, 1, 10, 12));
    expect(annee.every((m) => m.nature === 'constate')).toBe(true);
  });

  /* Au-delà des douze mois de la projection, tout est fiction : le mois reste vide. */
  it('ne prévoit rien au-delà des douze mois de la projection', () => {
    const annee = tresorerieDeLAnnee(DEMO, 2027, MAINTENANT);
    expect(annee.slice(0, 5).every((m) => m.disponible !== null)).toBe(true);
    expect(annee.slice(5).every((m) => m.disponible === null)).toBe(true);
  });
});
