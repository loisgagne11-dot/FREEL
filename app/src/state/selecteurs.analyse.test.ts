import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../domain/types';
import { planDeCharge } from '../domain/calculs/activite';
import { encoursDe } from '../domain/calculs/facturier';
import { type Faits, completerFaitsCourants, faitsVides } from './schema';
import { provisionIrDe } from './selecteurs';
import { tauxCotisationsAu } from './selecteurs.activite';
import { facturesSuivies } from './selecteurs.pipeline';
import {
  comparaisonAnPasse, encoursParAnciennete, joursNecessaires, moisLisse, netDePocheDeLAnnee,
  netDePocheEntre, objectifEnNet, tarifPlancher, tauxDePrelevement
} from './selecteurs.analyse';
import { chargerJeu, faitsAu, le } from '../test/jeu-d-essai';
import { valeurPubliee, valeurRefusee } from '../test/resolution';

/*
 * Ce que je gagne vraiment (lot 50). Les nombres de la démonstration au
 * 10 juin 2026 sont ceux de la maquette `direction/analyse.html` : si un calcul
 * en change un, la maquette cesse de dire la vérité sur les sélecteurs.
 */

const JUIN = new Date(2026, 5, 10, 12);
const DEMO = completerFaitsCourants(
  JSON.parse(readFileSync('public/jeu-de-demonstration.json', 'utf8')) as Record<string, unknown>
);
const DECEMBRE = le(2026, 12, 15);
const ESSAI = faitsAu(chargerJeu(), DECEMBRE);

function poser(m: Partial<Faits> = {}): Faits {
  return {
    ...faitsVides(),
    entreprise: {
      ...faitsVides().entreprise, debutActivite: dateISO('2025-01-01'), urssafPeriodicite: 'trimestriel',
      versementLiberatoire: true
    },
    soldeInitial: euros(10_000),
    soldeInitialAu: dateISO('2025-01-01'),
    besoinMensuel: euros(2_000),
    ...m
  } as Faits;
}

const encaissee = (id: string, montant: number, le_: string, tva = 0) => ({
  id, clientNom: 'Client d’essai', libelle: 'Prestation', montant: euros(montant),
  emiseLe: dateISO(le_), encaisseeLe: dateISO(le_), modeReglement: 'virement' as const, numero: id,
  echeanceLe: dateISO(le_), tvaCollectee: euros(tva)
});

const depense = (id: string, ttc: number, le_: string, autre: Record<string, unknown> = {}) => ({
  id, libelle: 'Achat', fournisseur: 'Fournisseur fictif', provenance: 'france' as const,
  montantTtc: euros(ttc), tauxTva: 0.2, payeeLe: dateISO(le_), justificatifId: 'piece', rapprochement: 'en_attente' as const,
  ...autre
});

describe('le net de poche', () => {
  /*
   * Encaissé hors taxes, moins chaque terme : un net qui oublierait les
   * dépenses ou la CFE se lirait plus haut que ce qui reste. Retirer l'un des
   * termes fait tomber ce test.
   */
  it('retire de l’encaissé les cotisations, la formation, l’impôt, la CFE et les dépenses', () => {
    const faits = poser({
      recettes: [encaissee('r', 10_000, '2026-03-15')],
      depenses: [depense('d', 500, '2026-03-20')] as Faits['depenses'],
      echeances: [{ id: 'cfe', nature: 'cfe', montant: euros(300), echeanceLe: dateISO('2026-03-15'), payeeLe: null }] as Faits['echeances']
    });
    const n = valeurPubliee(netDePocheEntre(faits, mois('2026-03'), mois('2026-03'), JUIN));
    const c = n.composition;
    expect(c.encaisse).toBe(10_000);
    expect(c.cotisations).toBeCloseTo(10_000 * valeurPubliee(tauxCotisationsAu(faits, mois('2026-03'))), 2);
    expect(c.formation).toBeGreaterThan(0);
    expect(c.impot).toBeGreaterThan(0);
    expect(c.cfe).toBe(300);
    // En franchise, une dépense coûte son TTC : rien ne se récupère.
    expect(c.depenses).toBe(500);
    expect(c.net).toBeCloseTo(10_000 - c.cotisations - c.formation - (c.impot ?? 0) - 300 - 500, 2);
  });

  /*
   * Au barème, l'impôt est celui de la provision de l'année — l'impôt de
   * l'année projetée sur son chiffre d'affaires projeté —, jamais celui de
   * l'encaissé seul : 30 000 € encaissés au 30 juin coûtent au taux d'une
   * année entière, pas d'une demi-année. Le prendre au taux du solde fait
   * tomber ce test.
   */
  it('prend l’impôt au barème au taux de l’année, sur la provision', () => {
    const faits = poser({
      entreprise: { ...poser().entreprise, versementLiberatoire: false },
      partsFiscales: 1, autresRevenusFoyer: euros(0), versementPerDeductible: euros(0), impositionCommune: false,
      recettes: [
        encaissee('r1', 25_000, '2026-02-15'), encaissee('r2', 25_000, '2026-05-15'),
        // Une facture attendue en septembre : l'année projetée vaut 75 000 €.
        { ...encaissee('r3', 25_000, '2026-06-01'), encaisseeLe: null, modeReglement: null, echeanceLe: dateISO('2026-09-15') }
      ],
      objectifCaAnnuel: null
    });
    const p = valeurPubliee(provisionIrDe(faits, JUIN));
    expect(p.partEncaissee).toBeLessThan(1);
    const n = valeurPubliee(netDePocheDeLAnnee(faits, 2026, JUIN));
    expect(n.composition.impot).toBeCloseTo(50_000 * (p.impotAnneeProjetee / p.assiette), 2);
    expect(n.composition.impot).toBeGreaterThan(0);
  });

  /*
   * Sans parts fiscales, l'impôt ne se calcule pas : le net le dit « avant
   * impôt », une hypothèse — jamais un impôt compté pour zéro, qui le ferait
   * passer pour ce qui reste vraiment.
   */
  it('se dit « avant impôt » quand l’impôt ne se calcule pas, sans le compter pour zéro', () => {
    const faits = poser({
      entreprise: { ...poser().entreprise, versementLiberatoire: false },
      recettes: [encaissee('r', 20_000, '2026-02-15')]
    });
    const r = netDePocheDeLAnnee(faits, 2026, JUIN);
    expect(r.statut).toBe('hypothese');
    const n = valeurPubliee(r);
    expect(n.composition.impot).toBeNull();
    expect(n.avantImpot).toMatch(/parts fiscales/);
  });

  /* Une cotisation sans barème : un net d'un quart trop haut ne se rend pas. */
  it('refuse quand une cotisation ne se calcule pas', () => {
    const faits = poser({
      entreprise: { ...poser().entreprise, debutActivite: dateISO('2020-01-01') },
      recettes: [encaissee('r', 5_000, '2021-03-15')]
    });
    expect(valeurRefusee(netDePocheEntre(faits, mois('2021-03'), mois('2021-03'), JUIN))).toBeTruthy();
  });

  /*
   * Chez un redevable, la TVA récupérable d'une dépense n'est pas un coût.
   * Chez un franchisé, la TVA d'un achat hors de France en est un : il la doit.
   */
  it('compte une dépense à ce qu’elle coûte vraiment, selon le régime de TVA', () => {
    const redevable = poser({
      entreprise: { ...poser().entreprise, tvaDepuis: mois('2026-01') },
      depenses: [depense('d', 120, '2026-03-20')] as Faits['depenses']
    });
    expect(valeurPubliee(netDePocheEntre(redevable, mois('2026-03'), mois('2026-03'), JUIN)).composition.depenses)
      .toBeCloseTo(100, 2);
    const franchise = poser({
      depenses: [depense('d', 100, '2026-03-20', { provenance: 'ue' })] as Faits['depenses']
    });
    expect(valeurPubliee(netDePocheEntre(franchise, mois('2026-03'), mois('2026-03'), JUIN)).composition.depenses)
      .toBeCloseTo(120, 2);
  });

  it('démonstration : 18 077 € depuis janvier, sous le versement libératoire', () => {
    const n = valeurPubliee(netDePocheDeLAnnee(DEMO, 2026, JUIN));
    expect([n.du, n.au]).toEqual(['2026-01', '2026-06']);
    expect(Math.round(n.composition.encaisse)).toBe(22_720);
    expect(Math.round(n.composition.cotisations)).toBe(2_908);
    expect(Math.round(n.composition.formation)).toBe(45);
    expect(Math.round(n.composition.impot ?? 0)).toBe(500);
    expect(Math.round(n.composition.depenses)).toBe(1_190);
    expect(Math.round(n.composition.net)).toBe(18_077);
  });

  it('jeu d’essai au 15 décembre : 44 324 €, l’impôt du foyer et la CFE retirés', () => {
    const n = valeurPubliee(netDePocheDeLAnnee(ESSAI, 2026, DECEMBRE));
    expect(Math.round(n.composition.encaisse)).toBe(72_480);
    expect(Math.round(n.composition.impot ?? 0)).toBe(10_265);
    expect(n.composition.cfe).toBe(214);
    expect(Math.round(n.composition.net)).toBe(44_324);
  });
});

describe('le mois lissé', () => {
  /*
   * La démonstration commence en octobre : huit mois entiers d'activité au
   * 10 juin. Divisés par douze, quatre mois qui n'ont pas existé compteraient
   * pour zéro et le mois lissé tomberait d'un tiers. Diviser par douze fait
   * tomber ce test.
   */
  it('divise par les mois d’activité, pas par douze — démonstration : 2 500 € par mois sur huit mois', () => {
    const l = valeurPubliee(moisLisse(DEMO, JUIN));
    expect(l.periode.mois).toBe(8);
    expect([l.periode.du, l.periode.au]).toEqual(['2025-10', '2026-05']);
    expect(Math.round(l.parMois)).toBe(2_500);
    expect(l.tendance).toHaveLength(8);
    expect(Math.round(l.tendance.reduce((t, m) => t + m.net, 0))).toBe(Math.round(l.periode.composition.net));
  });

  /*
   * Le mois en cours n'a encore ni ses encaissements ni ses dépenses : le
   * compter tirerait la moyenne vers le bas tous les débuts de mois.
   */
  it('s’arrête au dernier mois entier, sur douze mois au plus', () => {
    const l = valeurPubliee(moisLisse(ESSAI, DECEMBRE));
    expect([l.periode.du, l.periode.au, l.periode.mois]).toEqual(['2025-12', '2026-11', 12]);
    expect(Math.round(l.parMois)).toBe(3_961);
  });

  it('se tait avant le premier mois entier', () => {
    const faits = poser({ entreprise: { ...poser().entreprise, debutActivite: dateISO('2026-06-02') } });
    expect(valeurRefusee(moisLisse(faits, JUIN))).toMatch(/mois entier/);
  });
});

describe('le taux de prélèvement', () => {
  /*
   * Cotisations, formation, impôt et CFE sur l'encaissé ; les dépenses n'y
   * sont pas — elles ne grandissent pas avec ce qu'on encaisse. Les y mettre
   * fait tomber ce test.
   */
  it('rapporte ce qui est prélevé à l’encaissé, dépenses à part — démonstration : 15 %', () => {
    const n = netDePocheDeLAnnee(DEMO, 2026, JUIN);
    const c = valeurPubliee(n).composition;
    const t = valeurPubliee(tauxDePrelevement(n));
    expect(t).toBeCloseTo((c.cotisations + c.formation + (c.impot ?? 0) + c.cfe) / c.encaisse, 6);
    expect(Math.round(t * 100)).toBe(15);
  });

  it('refuse sans rien d’encaissé : zéro sur zéro n’est pas un taux', () => {
    expect(valeurRefusee(tauxDePrelevement(netDePocheEntre(poser(), mois('2026-03'), mois('2026-03'), JUIN))))
      .toMatch(/Rien d’encaissé/);
  });
});

describe('les jours nécessaires', () => {
  /*
   * Le net de poche résolu à l'envers : CA × (1 − taux) − dépenses = besoin.
   * « Besoin ÷ tarif net » oubliait les dépenses, et le net du mois tombait
   * sous le besoin de tout leur montant. Les retirer fait tomber ce test.
   */
  it('couvrent le besoin ET les dépenses, au tarif net des prélèvements — démonstration : 5,6 jours', () => {
    const j = valeurPubliee(joursNecessaires(DEMO, JUIN));
    expect(j.besoin).toBe(2_300);
    expect(j.tarif).toBe(502);
    expect(j.jours * j.tarif * (1 - j.taux) - j.depensesMensuelles).toBeCloseTo(j.besoin, 6);
    expect(j.depensesMensuelles).toBeGreaterThan(0);
    expect(Math.round(j.jours * 10) / 10).toBe(5.6);
    expect(j.tarifNet).toBe(Math.round(j.tarif * (1 - j.taux)));
  });

  it('refusent sans besoin saisi', () => {
    expect(valeurRefusee(joursNecessaires({ ...DEMO, besoinMensuel: euros(0) }, JUIN))).toMatch(/besoin mensuel/);
  });
});

describe('le tarif plancher', () => {
  /*
   * Les jours facturables sont ceux de l'occupation — jours ouvrés, fériés et
   * congés posés retirés —, sur l'année entière : la démonstration pose deux
   * jours en juin. Oublier les congés fait tomber ce test.
   */
  it('divise besoin et dépenses par les jours facturables nets des prélèvements — démonstration : 134 €', () => {
    const p = valeurPubliee(tarifPlancher(DEMO, JUIN));
    const ouvres = Array.from({ length: 12 }, (_, i) => mois(`2026-${String(i + 1).padStart(2, '0')}`))
      .reduce((t, m) => t + planDeCharge(m, DEMO.conges, 0).joursOuvrables, 0);
    expect(p.joursFacturables).toBe(ouvres);
    expect(p.joursFacturables).toBe(250);
    // Le tarif est arrondi au centime : 250 jours le portent à quelques dixièmes.
    expect(p.tarif * p.joursFacturables * (1 - p.taux)).toBeCloseTo(p.besoinAnnuel + p.depensesAnnuelles, 0);
    expect(Math.round(p.tarif)).toBe(134);
  });

  /* Un taux sous ACRE ou les dépenses d'une installation ne disent pas une année. */
  it('refuse sous trois mois d’historique', () => {
    const faits = poser({
      entreprise: { ...poser().entreprise, debutActivite: dateISO('2026-04-01') },
      recettes: [encaissee('r', 5_000, '2026-04-15')]
    });
    expect(valeurRefusee(tarifPlancher(faits, JUIN))).toMatch(/3 mois d’activité/);
    expect(tarifPlancher({ ...faits, entreprise: { ...faits.entreprise, debutActivite: dateISO('2026-03-01') } }, JUIN).statut)
      .not.toBe('refuse');
  });
});

describe('l’objectif exprimé en net', () => {
  it('dit ce que l’objectif de chiffre d’affaires laisse par mois — démonstration : 72 000 € → 5 018 €', () => {
    const o = valeurPubliee(objectifEnNet(DEMO, JUIN));
    expect(o.objectif).toBe(72_000);
    expect(o.netParMois * 12).toBeCloseTo(o.objectif * (1 - o.taux) - o.depensesAnnuelles, 0);
    expect(Math.round(o.netParMois)).toBe(5_018);
  });

  /*
   * Les deux sens se répondent : l'objectif qui vaudrait le chiffre d'affaires
   * nécessaire au besoin laisse exactement le besoin. Deux calculs qui ne
   * tomberaient pas d'accord feraient dire « il te faut 34 000 € » et « 34 000 €
   * te laissent 2 100 € » sur le même écran.
   */
  it('répond aux jours nécessaires : le chiffre d’affaires du besoin laisse le besoin', () => {
    const j = valeurPubliee(joursNecessaires(DEMO, JUIN));
    const o = valeurPubliee(objectifEnNet({ ...DEMO, objectifCaAnnuel: euros(j.caMensuel * 12) }, JUIN));
    expect(o.netParMois).toBeCloseTo(j.besoin, 0);
  });

  it('refuse sans objectif fixé', () => {
    expect(valeurRefusee(objectifEnNet({ ...DEMO, objectifCaAnnuel: null }, JUIN))).toMatch(/objectif/);
  });
});

describe('l’encours par ancienneté', () => {
  it('démonstration : 4 810 € non échus, 1 200 € à moins de trente jours — le reste à encaisser entier', () => {
    const t = encoursParAnciennete(DEMO, JUIN);
    expect(t.map((x) => [x.anciennete, x.montant, x.nombre])).toEqual([
      ['non_echue', 4_810, 2], ['retard_1_30', 1_200, 1], ['retard_31_60', 0, 0], ['retard_au_dela', 0, 0]
    ]);
    expect(t.reduce((s, x) => s + x.montant, 0)).toBe(encoursDe(facturesSuivies(DEMO, JUIN)).resteARentrer);
  });

  /* Trente jours sont encore « 1 à 30 », le trente-et-unième passe à « 31 à 60 ». */
  it('range chaque facture à sa borne', () => {
    const due = (id: string, echeance: string) => ({
      ...encaissee(id, 100, '2026-01-02'), encaisseeLe: null, modeReglement: null, echeanceLe: dateISO(echeance)
    });
    const faits = poser({
      recettes: [due('a', '2026-05-11'), due('b', '2026-05-10'), due('c', '2026-04-11'), due('d', '2026-04-10'), due('e', '2026-06-10')]
    });
    expect(encoursParAnciennete(faits, JUIN).map((x) => x.nombre)).toEqual([1, 1, 2, 1]);
  });
});

describe('l’an passé à la même date', () => {
  /*
   * La démonstration commence en octobre 2025 : au 10 juin, il n'y a pas
   * d'an passé à comparer, et le dire vaut mieux qu'un « +∞ % ».
   */
  it('se tait sous douze mois d’activité, et dit quand il parlera', () => {
    expect(valeurRefusee(comparaisonAnPasse(DEMO, JUIN))).toMatch(/octobre 2026/);
  });

  /*
   * Même période, pas l'année entière : comparer le 15 décembre à une année
   * close dirait « moins » d'une année qui n'a pas fini.
   */
  it('compare la même période — jeu d’essai : 72 480 € et 197 jours, contre 23 760 € et 134 jours', () => {
    const c = valeurPubliee(comparaisonAnPasse(ESSAI, DECEMBRE));
    expect([c.cetteAnnee.du, c.cetteAnnee.au, c.anPasse.du, c.anPasse.au])
      .toEqual(['2026-01-01', '2026-12-15', '2025-01-01', '2025-12-15']);
    expect([c.cetteAnnee.encaisse, c.cetteAnnee.jours]).toEqual([72_480, 197]);
    expect([c.anPasse.encaisse, c.anPasse.jours]).toEqual([23_760, 134]);
  });

  it('compare un 29 février au 28', () => {
    const faits = poser({ entreprise: { ...poser().entreprise, debutActivite: dateISO('2026-01-01') } });
    const c = valeurPubliee(comparaisonAnPasse(faits, new Date(2028, 1, 29, 12)));
    expect(c.anPasse.au).toBe('2027-02-28');
  });
});
