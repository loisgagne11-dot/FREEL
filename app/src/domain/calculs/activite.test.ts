import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../types';
import {
  type RecettePayee,
  calendrierDuMois, chargeDuMois, decompterJours, delaisParClient, estWeekEnd,
  joursCongeables, joursDuMois, joursEntre, joursEquivalents, joursFeries,
  paques, planDeCharge
} from './activite';

describe('date de Pâques', () => {
  // Quatre jours fériés en découlent : une erreur ici décale le dénominateur
  // de l'occupation de quatre jours par an.
  it('retrouve les dimanches de Pâques connus', () => {
    expect(paques(2024)).toBe('2024-03-31');
    expect(paques(2025)).toBe('2025-04-20');
    expect(paques(2026)).toBe('2026-04-05');
    expect(paques(2027)).toBe('2027-03-28');
  });

  it('tient sur les bornes extrêmes du comput', () => {
    // Pâques ne peut tomber qu'entre le 22 mars et le 25 avril.
    for (let annee = 2020; annee <= 2050; annee++) {
      const p = paques(annee);
      expect(p >= `${annee}-03-22`).toBe(true);
      expect(p <= `${annee}-04-25`).toBe(true);
    }
  });

  it('tombe toujours un dimanche', () => {
    for (let annee = 2020; annee <= 2040; annee++) {
      expect(new Date(`${paques(annee)}T00:00:00Z`).getUTCDay()).toBe(0);
    }
  });
});

describe('jours fériés', () => {
  it('en compte onze en régime général', () => {
    expect(joursFeries(2026)).toHaveLength(11);
  });

  it('place les fériés mobiles de 2026 aux bonnes dates', () => {
    const feries = joursFeries(2026);
    // Pâques 2026 : 5 avril. Lundi 6, Ascension 14 mai, Pentecôte 25 mai.
    expect(feries).toContain('2026-04-06');
    expect(feries).toContain('2026-05-14');
    expect(feries).toContain('2026-05-25');
  });

  it('place les fériés fixes', () => {
    const feries = joursFeries(2026);
    for (const d of ['2026-01-01', '2026-05-01', '2026-05-08', '2026-07-14',
      '2026-08-15', '2026-11-01', '2026-11-11', '2026-12-25']) {
      expect(feries).toContain(d);
    }
  });

  // Les ignorer surestimerait les jours ouvrables, et donc sous-estimerait
  // l'occupation de qui y travaille.
  it('ajoute les deux jours du droit local d\'Alsace-Moselle', () => {
    const locaux = joursFeries(2026, 'alsace_moselle');
    expect(locaux).toHaveLength(13);
    expect(locaux).toContain('2026-04-03'); // Vendredi saint
    expect(locaux).toContain('2026-12-26'); // Saint-Étienne
  });

  it('rend les dates triées', () => {
    const feries = joursFeries(2027, 'alsace_moselle');
    expect([...feries].sort()).toEqual(feries);
  });
});

describe('jours du mois', () => {
  it('compte les jours de chaque mois', () => {
    expect(joursDuMois(mois('2026-01'))).toHaveLength(31);
    expect(joursDuMois(mois('2026-04'))).toHaveLength(30);
    expect(joursDuMois(mois('2026-02'))).toHaveLength(28);
  });

  // Une année bissextile mal gérée fait disparaître un jour ouvrable.
  it('gère le 29 février d\'une année bissextile', () => {
    const fevrier = joursDuMois(mois('2028-02'));
    expect(fevrier).toHaveLength(29);
    expect(fevrier[28]).toBe('2028-02-29');
  });

  it('reconnaît les samedis et dimanches', () => {
    expect(estWeekEnd(dateISO('2026-07-25'))).toBe(true);  // samedi
    expect(estWeekEnd(dateISO('2026-07-26'))).toBe(true);  // dimanche
    expect(estWeekEnd(dateISO('2026-07-27'))).toBe(false); // lundi
  });
});

/** Un congé d'une journée entière — le cas courant. */
const jour = (d: string) => ({ date: dateISO(d), quotite: 1 });
/** Une demi-journée, telle que l'ancienne application les pose. */
const demi = (d: string) => ({ date: dateISO(d), quotite: 0.5 });

describe('calendrier du mois', () => {
  // Compter un congé posé un jour férié le ferait payer deux fois : une fois
  // sur le solde de congés, une fois sur l'occupation.
  it('ne compte pas comme congé un jour déjà férié', () => {
    const calendrier = calendrierDuMois(mois('2026-05'), [jour('2026-05-01')]);
    const premier = calendrier.find((j) => j.date === '2026-05-01');
    expect(premier?.nature).toBe('ferie');
    expect(calendrier.filter((j) => j.nature === 'conge')).toHaveLength(0);
  });

  it('ne compte pas comme congé un samedi', () => {
    const calendrier = calendrierDuMois(mois('2026-07'), [jour('2026-07-25')]);
    expect(calendrier.find((j) => j.date === '2026-07-25')?.nature).toBe('week_end');
  });

  it('marque un congé posé un jour ouvrable', () => {
    const calendrier = calendrierDuMois(mois('2026-07'), [jour('2026-07-27')]);
    expect(calendrier.find((j) => j.date === '2026-07-27')?.nature).toBe('conge');
  });

  it('couvre tout le mois, un jour par date', () => {
    expect(calendrierDuMois(mois('2026-02'), [])).toHaveLength(28);
  });
});

describe('plan de charge', () => {
  // L'ancienne application divisait par 20. Un mois de mai à 19 jours ouvrés
  // donnait 95 % à qui avait travaillé tous les jours ouvrables.
  it('compte les jours ouvrables réels du mois, pas une constante', () => {
    // Mai 2026 : 31 jours, 21 jours de semaine, moins le 1er (vendredi),
    // le 8 (vendredi), l'Ascension le 14 (jeudi) et le lundi de Pentecôte
    // le 25 → 17 jours ouvrables.
    const plan = planDeCharge(mois('2026-05'), [], 17);
    expect(plan.joursFeries).toBe(4);
    expect(plan.joursOuvrables).toBe(17);
    expect(plan.occupation).toBe(1);
  });

  it('retire les congés du dénominateur', () => {
    const conges = [jour('2026-07-27'), jour('2026-07-28')];
    const sans = planDeCharge(mois('2026-07'), [], 10);
    const avec = planDeCharge(mois('2026-07'), conges, 10);
    expect(avec.joursOuvrables).toBe(sans.joursOuvrables - 2);
    expect(avec.joursDeConge).toBe(2);
    // Le même travail sur moins de jours disponibles fait monter l'occupation :
    // c'est le sens de la mesure.
    expect(avec.occupation as number).toBeGreaterThan(sans.occupation as number);
  });

  // Un mois entièrement pris en congé n'a pas une occupation de 0 % : il n'en
  // a pas. Afficher 0 % laisserait croire à un mois creux.
  it('n\'a pas d\'occupation quand aucun jour n\'est ouvrable', () => {
    const toutLeMois = joursDuMois(mois('2026-07')).map((d) => ({ date: d, quotite: 1 }));
    expect(planDeCharge(mois('2026-07'), toutLeMois, 0).occupation).toBeNull();
  });

  it('n\'écrête pas au-delà de 100 % : un dépassement doit se voir', () => {
    const plan = planDeCharge(mois('2026-07'), [], 30);
    expect(plan.occupation as number).toBeGreaterThan(1);
  });
});

describe('équivalent-jours facturés', () => {
  it('déduit les jours du montant et du tarif journalier', () => {
    expect(joursEquivalents(euros(3800), euros(380))).toBe(10);
  });

  // Diviser par zéro donnerait l'infini, qui se propage dans tout l'écran.
  it('rend zéro plutôt que l\'infini quand le tarif est absent', () => {
    expect(joursEquivalents(euros(3800), euros(0))).toBe(0);
  });
});

describe('charge d\'un mois', () => {
  const tarifs = new Map([['ClientA', euros(400)], ['SansTarif', euros(0)]]);
  const rec = (clientNom: string, montant: number, emiseLe: string | null) =>
    ({ clientNom, montant: euros(montant), emiseLe: emiseLe === null ? null : dateISO(emiseLe) });

  it('convertit les recettes du mois en équivalent-jours', () => {
    const charge = chargeDuMois([rec('ClientA', 4000, '2026-07-31')], tarifs, mois('2026-07'));
    expect(charge.jours).toBe(10);
  });

  it('ignore les recettes des autres mois', () => {
    const charge = chargeDuMois([
      rec('ClientA', 4000, '2026-06-30'),
      rec('ClientA', 800, '2026-07-15')
    ], tarifs, mois('2026-07'));
    expect(charge.jours).toBe(2);
  });

  // Les compter à un tarif supposé fabriquerait de l'occupation.
  it('ne compte pas les recettes dont le tarif est inconnu, et les dénombre', () => {
    const charge = chargeDuMois([
      rec('Inconnu', 5000, '2026-07-10'),
      rec('SansTarif', 5000, '2026-07-10'),
      rec('ClientA', 400, '2026-07-10')
    ], tarifs, mois('2026-07'));
    expect(charge.jours).toBe(1);
    expect(charge.recettesSansTarif).toBe(2);
  });

  it('ignore une recette sans date d\'émission', () => {
    expect(chargeDuMois([rec('ClientA', 4000, null)], tarifs, mois('2026-07')).jours).toBe(0);
  });
});

describe('délai de paiement par client', () => {
  const r = (
    clientNom: string, montant: number, emiseLe: string | null, encaisseeLe: string | null
  ): RecettePayee => ({
    clientNom,
    montant: euros(montant),
    emiseLe: emiseLe === null ? null : dateISO(emiseLe),
    encaisseeLe: encaisseeLe === null ? null : dateISO(encaisseeLe)
  });

  const AUJOURDHUI = dateISO('2026-09-30');

  it('compte les jours entre émission et encaissement', () => {
    expect(joursEntre(dateISO('2026-06-30'), dateISO('2026-07-15'))).toBe(15);
  });

  // Un client qui paie à 30 jours neuf fois et à 300 une fois n'est pas un
  // client à 57 jours. La moyenne décrit un client qui n'existe pas.
  it('retient la médiane, qu\'un règlement aberrant ne déplace pas', () => {
    const recettes = [
      ...Array.from({ length: 9 }, (_, i) => r('A', 1000, `2026-01-0${(i % 9) + 1}`, `2026-01-3${0}`)),
      r('A', 1000, '2026-02-01', '2026-11-28')
    ];
    const [client] = delaisParClient(recettes, AUJOURDHUI);
    expect(client?.delaiMedian).toBeLessThan(35);
    expect(client?.delaiMaximum).toBeGreaterThan(250);
  });

  it('sépare les clients et les range par encours décroissant', () => {
    const resultat = delaisParClient([
      r('Petit', 500, '2026-08-01', null),
      r('Gros', 9000, '2026-08-01', null)
    ], AUJOURDHUI);
    expect(resultat.map((c) => c.clientNom)).toEqual(['Gros', 'Petit']);
    expect(resultat[0]?.enAttente).toBe(9000);
  });

  // Une saisie fautive tirerait la médiane vers le bas et ferait croire à un
  // client plus rapide qu'il n'est.
  it('écarte un encaissement antérieur à l\'émission', () => {
    const [client] = delaisParClient([
      r('A', 1000, '2026-08-01', '2026-07-01'),
      r('A', 1000, '2026-08-01', '2026-09-01')
    ], AUJOURDHUI);
    expect(client?.facturesMesurees).toBe(1);
    expect(client?.delaiMedian).toBe(31);
  });

  it('ne mesure rien sur une facture dont une date manque', () => {
    const [client] = delaisParClient([r('A', 1000, null, '2026-09-01')], AUJOURDHUI);
    expect(client?.facturesMesurees).toBe(0);
    expect(client?.delaiMedian).toBeNull();
  });

  // Accuser un client de retard sans référence serait pire que se taire.
  it('ne déclare aucun retard tant qu\'aucun historique n\'existe', () => {
    const [client] = delaisParClient([r('Nouveau', 4000, '2026-01-01', null)], AUJOURDHUI);
    expect(client?.enRetard).toBe(0);
  });

  it('signale une facture en attente au-delà du délai habituel du client', () => {
    const [client] = delaisParClient([
      r('A', 1000, '2026-01-01', '2026-02-01'), // 31 jours
      r('A', 1000, '2026-03-01', '2026-04-01'), // 31 jours
      r('A', 5000, '2026-06-01', null)          // en attente depuis bien plus
    ], AUJOURDHUI);
    expect(client?.delaiMedian).toBe(31);
    expect(client?.enRetard).toBe(1);
    expect(client?.enAttente).toBe(5000);
  });

  it('regroupe sous un nom lisible les recettes sans client', () => {
    const [client] = delaisParClient([r('', 100, '2026-01-01', null)], AUJOURDHUI);
    expect(client?.clientNom).toBe('Client non renseigné');
  });

  it('sur une liste vide, ne produit aucun client', () => {
    expect(delaisParClient([], AUJOURDHUI)).toEqual([]);
  });
});

/**
 * La demi-journée.
 *
 * L'ancienne application la gère depuis longtemps — un congé y est écrit
 * `'2026-08-14'` ou `'2026-08-14_half'`. La première version de ce schéma ne
 * portait qu'une liste de dates : elle comptait donc une demi-journée comme
 * une journée entière, gonflant le solde de congés de l'utilisateur.
 */
describe('demi-journées de congé', () => {
  // La case doit se voir au calendrier : c'est le DÉCOMPTE qui distingue la
  // moitié de l'entier, pas l'affichage.
  it('marque la case comme congé, même à mi-temps', () => {
    const calendrier = calendrierDuMois(mois('2026-07'), [demi('2026-07-27')]);
    expect(calendrier.find((j) => j.date === '2026-07-27')?.nature).toBe('conge');
  });

  it('ne compte qu’un demi-jour au décompte', () => {
    const plan = planDeCharge(mois('2026-07'), [demi('2026-07-27')], 10);
    expect(plan.joursDeConge).toBe(0.5);
  });

  it('additionne deux demi-journées en un jour', () => {
    const plan = planDeCharge(
      mois('2026-07'), [demi('2026-07-27'), demi('2026-07-28')], 10
    );
    expect(plan.joursDeConge).toBe(1);
  });

  // Un congé posé hors du mois observé ne doit pas s'y ajouter.
  it('ne compte que les congés du mois', () => {
    const plan = planDeCharge(
      mois('2026-07'), [jour('2026-07-27'), jour('2026-08-03')], 10
    );
    expect(plan.joursDeConge).toBe(1);
  });
});

/**
 * POSER UNE PLAGE DE CONGÉS.
 *
 * `poserPlageDeConges` existait dans le magasin depuis le début, testée, et
 * AUCUN écran ne l'appelait : le calendrier ne posait qu'un jour à la fois.
 * Trois semaines de vacances demandaient vingt et un clics, et la demi-journée
 * — que le schéma porte depuis la v2 — était inatteignable.
 *
 * La réduction de la plage aux jours ouvrés est une règle, pas une commodité
 * d'affichage : « du 1er au 21 août » vaut quinze jours ouvrés, pas vingt et un.
 */
describe('jours congeables d’une plage', () => {
  it('écarte les week-ends', () => {
    // Du lundi 3 au dimanche 9 août 2026 : cinq jours ouvrés.
    const jours = joursCongeables(dateISO('2026-08-03'), dateISO('2026-08-09'));
    expect(jours).toHaveLength(5);
    expect(jours).not.toContain('2026-08-08');
    expect(jours).not.toContain('2026-08-09');
  });

  /**
   * Le 15 août 2026 tombe un samedi ; prenons plutôt le 14 juillet 2026, un
   * mardi. L'inclure gonflerait le solde de congés d'un jour non dû.
   */
  it('écarte les jours fériés', () => {
    const jours = joursCongeables(dateISO('2026-07-13'), dateISO('2026-07-15'));
    expect(jours).not.toContain('2026-07-14');
    expect(jours).toEqual(['2026-07-13', '2026-07-15']);
  });

  // Sélectionner de la fin vers le début est un geste courant, pas une faute.
  it('accepte les bornes dans les deux sens', () => {
    const endroit = joursCongeables(dateISO('2026-08-03'), dateISO('2026-08-07'));
    const envers = joursCongeables(dateISO('2026-08-07'), dateISO('2026-08-03'));
    expect(envers).toEqual(endroit);
  });

  it('inclut les deux bornes', () => {
    const jours = joursCongeables(dateISO('2026-08-03'), dateISO('2026-08-04'));
    expect(jours).toEqual(['2026-08-03', '2026-08-04']);
  });

  /**
   * Une plage qui enjambe le 31 décembre traverse deux années de fériés. Ne
   * charger que celle du départ laisserait passer le 1er janvier.
   */
  it('connaît les fériés des deux années quand la plage enjambe le nouvel an', () => {
    const jours = joursCongeables(dateISO('2026-12-30'), dateISO('2027-01-04'));
    expect(jours).not.toContain('2027-01-01');
    expect(jours).toContain('2026-12-30');
  });

  it('rend une plage d’un seul jour ouvré', () => {
    expect(joursCongeables(dateISO('2026-08-03'), dateISO('2026-08-03')))
      .toEqual(['2026-08-03']);
  });

  // Un dimanche seul ne donne rien : il n'y a rien à poser.
  it('rend une liste vide quand la plage ne contient aucun jour ouvré', () => {
    expect(joursCongeables(dateISO('2026-08-08'), dateISO('2026-08-09'))).toEqual([]);
  });
});

/**
 * UN MOT NE PEUT PAS DÉSIGNER DEUX NOMBRES.
 *
 * Le plan de charge du mois compte comme « jours ouvrables » les jours ni
 * week-end, ni fériés, ni posés en congé — c'est le dénominateur du taux
 * d'occupation. La vue semaine avait d'abord compté les jours ouvrés congés
 * COMPRIS, dans son propre composant.
 *
 * Les deux nombres portaient le même nom, sur le même écran : une semaine avec
 * deux jours de congé annonçait « 5 jours ouvrés » pendant que le mois n'en
 * comptait que 3 pour cette semaine-là. Deux vérités pour la même réalité —
 * exactement ce que la refonte existe pour supprimer.
 *
 * Les deux sont pourtant justes, pour deux questions différentes. D'où deux
 * noms, et une seule fonction qui les rend tous les deux.
 */
describe('décompte des jours d’une période', () => {
  const jour = (o: Partial<{ ferie: boolean; weekEnd: boolean; conge: number }> = {}) =>
    ({ ferie: false, weekEnd: false, conge: 0, ...o });

  it('compte les jours ouvrés congés compris', () => {
    const d = decompterJours([jour(), jour(), jour({ conge: 1 })]);
    expect(d.ouvres).toBe(3);
  });

  it('compte à part ceux qui sont posés en congé', () => {
    const d = decompterJours([jour(), jour({ conge: 1 }), jour({ conge: 0.5 })]);
    expect(d.enConge).toBe(2);
  });

  /**
   * LE NOMBRE QUI SERT DE DÉNOMINATEUR. Retirer les congés est juste ici :
   * sinon partir en vacances ferait chuter un taux d'occupation qui ne
   * mesurerait plus rien.
   */
  it('rend les travaillables, congés retirés', () => {
    const d = decompterJours([jour(), jour(), jour({ conge: 1 })]);
    expect(d.travaillables).toBe(2);
  });

  it('écarte week-ends et fériés des trois comptes', () => {
    const d = decompterJours([
      jour(), jour({ weekEnd: true }), jour({ ferie: true }), jour({ conge: 1 })
    ]);
    expect(d).toEqual({ ouvres: 2, enConge: 1, travaillables: 1 });
  });

  /**
   * Une demi-journée de congé occupe le jour : il n'est plus travaillable en
   * entier. Le compter comme travaillable gonflerait le dénominateur.
   */
  it('tient une demi-journée pour un jour en congé', () => {
    const d = decompterJours([jour({ conge: 0.5 })]);
    expect(d).toEqual({ ouvres: 1, enConge: 1, travaillables: 0 });
  });

  /**
   * LA COHÉRENCE AVEC LE MOIS, qui est la raison d'être de cette fonction.
   * `travaillables` doit valoir ce que `planDeCharge` appelle `joursOuvrables`
   * — sans quoi on aurait recréé la divergence qu'on vient de supprimer.
   */
  it('donne le même nombre que le plan de charge du mois', () => {
    const m = mois('2026-07');
    const conges = [
      { date: dateISO('2026-07-06'), quotite: 1 },
      { date: dateISO('2026-07-07'), quotite: 1 }
    ];
    const plan = planDeCharge(m, conges, 0);
    const jours = calendrierDuMois(m, conges).map((j) => ({
      ferie: j.nature === 'ferie',
      weekEnd: j.nature === 'week_end',
      conge: j.nature === 'conge' ? 1 : 0
    }));

    expect(decompterJours(jours).travaillables).toBe(plan.joursOuvrables);
  });
});
