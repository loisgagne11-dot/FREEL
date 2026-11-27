import { describe, expect, it } from 'vitest';
import { type DateISO, dateISO, euros, mois } from '../domain/types';
import { type Faits, type Mission, type Recette, faitsVides } from './schema';
import { brouillonsDeFacture, moisAEnregistrer } from './selecteurs.brouillon';

/** Du lundi au vendredi, à 500 € la journée, chez un seul client. */
const mission = (du: string, au: string): Mission => ({
  id: 'm1', clientId: null, clientNom: 'Client France', description: 'Mission A',
  tjm: euros(500), debut: dateISO(du), fin: dateISO(au), statut: 'active',
  entites: [{
    id: 'm1-co', nom: 'Client France', couleur: '', adresse: '', contact: '', email: '', telephone: '',
    rythmes: [{ du: dateISO(du), au: dateISO(au), parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 1 }, tjm: euros(500) }],
    ajustements: {}
  }]
});

const facture = (p: Partial<Recette> & { readonly id: string; readonly emiseLe: DateISO }): Recette => ({
  clientNom: 'Client France', libelle: 'Prestation', montant: euros(1000),
  encaisseeLe: null, modeReglement: null, numero: `F-${p.id}`, ...p
});

const faits = (recettes: readonly Recette[] = [], du = '2026-06-01', au = '2026-12-31'): Faits =>
  ({ ...faitsVides(), missions: [mission(du, au)], recettes });

const lesMois = (f: Faits, le: string): readonly string[] =>
  moisAEnregistrer(f, new Date(`${le}T09:00:00`)).map((b) => b.mois);

describe('les mois en attente d’une facture enregistrée', () => {
  /*
   * LA LISTE QUI MANQUAIT. Qui émet dans Tiime n'a plus de geste « émettre »
   * dans FREEL : rien ne lui disait que juillet avait été travaillé et
   * qu'aucune facture n'en était arrivée ici — ni au reste à rentrer, ni aux
   * relances, ni au livre des recettes.
   */
  it('liste les mois passés travaillés sans facture, le plus ancien d’abord', () => {
    expect(lesMois(faits(), '2026-10-14')).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
  });

  /*
   * UN MOIS FACTURÉ SORT DE LA LISTE — le mois que la facture COUVRE. Celle
   * d'août, émise le 2 septembre : lue à son émission, elle aurait fait sortir
   * septembre, et août serait resté à enregistrer pour toujours.
   */
  it('un mois facturé en sort, et seulement lui', () => {
    const f = faits([facture({ id: 'r1', emiseLe: dateISO('2026-09-02'), moisFacture: mois('2026-08'), emisePar: 'externe' })]);
    expect(lesMois(f, '2026-10-14')).toEqual(['2026-06', '2026-07', '2026-09']);
  });

  /* La facture qui ne dit pas son mois — toute facture d'avant — couvre celui
     de son émission, comme « facture déjà émise » le lisait déjà. */
  it('une facture sans mois dit couvre celui de son émission', () => {
    const f = faits([facture({ id: 'r1', emiseLe: dateISO('2026-07-31') })]);
    expect(lesMois(f, '2026-10-14')).toEqual(['2026-06', '2026-08', '2026-09']);
  });

  /* Une facture annulée ne facture plus rien : la compter sortirait le mois
     de la liste alors qu'il est à refacturer. */
  it('une facture annulée par un avoir rend son mois à la liste', () => {
    const f = faits([
      facture({ id: 'r1', emiseLe: dateISO('2026-09-02'), moisFacture: mois('2026-08') }),
      facture({ id: 'r1-annulation', emiseLe: dateISO('2026-09-02'), montant: euros(-1000), annuleEcriture: 'r1' })
    ]);
    expect(lesMois(f, '2026-10-14')).toContain('2026-08');
  });

  /*
   * LE MOIS EN COURS, DÈS QU'IL N'Y RESTE PLUS RIEN À FAIRE. Le 31 octobre
   * 2026 est un samedi : la facture d'octobre s'émet le vendredi 30, et
   * attendre la fin du calendrier la ferait manquer ce jour-là.
   */
  it('compte le mois en cours le jour où sa dernière journée est faite, pas avant', () => {
    expect(lesMois(faits(), '2026-10-29')).not.toContain('2026-10');
    expect(lesMois(faits(), '2026-10-30')).toContain('2026-10');
  });

  /* Au-delà d'un an, ce n'est plus un oubli : c'est un historique à reprendre,
     et trois ans listés mois par mois noieraient les derniers. */
  it('ne remonte pas au-delà des douze derniers mois', () => {
    const f = faits([], '2024-01-01', '2026-12-31');
    const liste = lesMois(f, '2026-10-14');
    expect(liste[0]).toBe('2025-10');
    expect(liste).toHaveLength(12);
  });

  /* Sans journée travaillée, rien n'est à facturer : la liste ne s'invente pas. */
  it('n’invente rien sans planning', () => {
    expect(lesMois({ ...faitsVides() }, '2026-10-14')).toEqual([]);
  });
});

describe('le montant d’un mois est celui du planning', () => {
  /* « La facture correspondra toujours aux jours du planning » (22/11) : le
     montant proposé à l'enregistrement EST le brouillon, au centime. */
  it('juillet 2026 : vingt-deux journées à 500 €, le 14 juillet chômé', () => {
    const [b] = brouillonsDeFacture(faits(), mois('2026-07'));
    // Vingt-trois jours de semaine, moins le 14 juillet, férié.
    expect(b?.jours).toBe(22);
    expect(b?.total).toBe(11_000);
  });
});
