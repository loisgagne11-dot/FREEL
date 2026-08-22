import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../types';
import type { JourPlanifie, Rythme } from './planning';
import {
  basculerCreneau, congeApresSaisie, craDuMois, creneauxOccupes, jourDeSemaine,
  planifier, quotitePrevue, rythmePour, saisirSurPortee
} from './planning';

const D = (s: string) => dateISO(s);

/** Lundi à jeudi pleins, vendredi à mi-temps — le rythme le plus courant. */
const SEMAINE: Rythme = {
  du: D('2026-01-01'), au: D('2026-12-31'),
  parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 0.5 },
  tjm: euros(500)
};

const SANS = { rythmes: [SEMAINE], ajustements: {}, feries: new Set<string>(), conges: {} };

describe('jour de semaine', () => {
  /**
   * Calculé en UTC, jamais dans le fuseau local : à Paris, `new Date('...')`
   * sur une date nue tombe la veille au soir en heure d'hiver, et le lundi
   * devient dimanche. Un planning décalé d'un jour est un CRA faux.
   */
  it('ne dépend pas du fuseau', () => {
    expect(jourDeSemaine(D('2026-08-10'))).toBe('lun');
    expect(jourDeSemaine(D('2026-08-16'))).toBe('dim');
  });
});

describe('rythme applicable', () => {
  it('trouve celui qui couvre la date', () => {
    expect(rythmePour(D('2026-06-15'), [SEMAINE])).toBe(SEMAINE);
    expect(rythmePour(D('2027-01-05'), [SEMAINE])).toBeUndefined();
  });

  /**
   * L'ancienne application autorise des périodes qui se chevauchent. Le
   * dernier déclaré décrit l'intention la plus fraîche : prendre le premier
   * appliquerait un rythme que l'utilisateur croit avoir remplacé.
   */
  it('retient le dernier déclaré quand deux se chevauchent', () => {
    const ancien: Rythme = { ...SEMAINE, parJour: { lun: 1 }, tjm: euros(400) };
    const nouveau: Rythme = { ...SEMAINE, parJour: { lun: 0.5 }, tjm: euros(600) };
    expect(rythmePour(D('2026-06-15'), [ancien, nouveau])).toBe(nouveau);
  });

  it('rend la quotité du jour de semaine', () => {
    expect(quotitePrevue(D('2026-08-10'), [SEMAINE])).toBe(1);    // lundi
    expect(quotitePrevue(D('2026-08-14'), [SEMAINE])).toBe(0.5);  // vendredi
    expect(quotitePrevue(D('2026-08-15'), [SEMAINE])).toBe(0);    // samedi, absent du rythme
  });
});

describe('planning', () => {
  it('remplit la semaine depuis le rythme, sans rien saisir', () => {
    const jours = planifier(
      ['2026-08-10', '2026-08-11', '2026-08-14', '2026-08-15'].map(D),
      SANS
    );
    expect(jours.map((j) => j.retenu)).toEqual([1, 1, 0.5, 0]);
  });

  it('ne prévoit ni week-end ni jour férié', () => {
    const jours = planifier(['2026-08-15', '2026-07-14'].map(D), {
      ...SANS, feries: new Set(['2026-07-14'])
    });
    expect(jours[0]?.weekEnd).toBe(true);
    expect(jours[1]?.ferie).toBe(true);
    expect(jours.every((j) => j.retenu === 0)).toBe(true);
  });

  it('retranche le congé du prévu', () => {
    const [plein, demi] = planifier(['2026-08-10', '2026-08-11'].map(D), {
      ...SANS, conges: { '2026-08-10': 1, '2026-08-11': 0.5 }
    });
    expect(plein?.retenu).toBe(0);
    expect(demi?.retenu).toBe(0.5);
  });

  /**
   * LE POINT DUR. Sans priorité absolue de l'ajustement, effacer une journée
   * serait impossible : le rythme la remettrait à chaque calcul, et le CRA
   * facturerait un jour qui n'a pas eu lieu.
   */
  it('laisse l’ajustement l’emporter, y compris à zéro', () => {
    const [j] = planifier(
      [D('2026-08-10')], { ...SANS, ajustements: { '2026-08-10': { quotite: 0 } } }
    );
    expect(j?.prevu).toBe(1);
    expect(j?.retenu).toBe(0);
    expect(j?.ajuste).toBe(true);
  });

  /**
   * Les astreintes et les rendus de nuit existent. Un CRA qui les efface
   * parce que c'était un dimanche fait perdre de l'argent.
   */
  it('permet de déclarer un jour travaillé un week-end ou un férié', () => {
    const [samedi, ferie] = planifier(['2026-08-15', '2026-07-14'].map(D), {
      ...SANS,
      feries: new Set(['2026-07-14']),
      ajustements: { '2026-08-15': { quotite: 1 }, '2026-07-14': { quotite: 0.5 } }
    });
    expect(samedi?.retenu).toBe(1);
    expect(ferie?.retenu).toBe(0.5);
  });

  it('ne prévoit rien hors de la plage du rythme', () => {
    const [j] = planifier([D('2027-03-01')], SANS);
    expect(j?.retenu).toBe(0);
  });
});

describe('compte rendu d’activité', () => {
  const AOUT = ['2026-08-10', '2026-08-11', '2026-08-14', '2026-08-15'].map(D);

  it('totalise les jours réellement travaillés', () => {
    const cra = craDuMois(mois('2026-08'), planifier(AOUT, SANS), [SEMAINE], euros(500));
    expect(cra.totalJours).toBe(2.5);
    expect(cra.montant).toBe(1250);
  });

  // Un CRA qui liste des zéros n'est pas plus complet, il est seulement plus
  // long à relire — et le client le signe moins volontiers.
  it('ne liste que les jours travaillés', () => {
    const cra = craDuMois(mois('2026-08'), planifier(AOUT, SANS), [SEMAINE], euros(500));
    expect(cra.lignes).toHaveLength(3);
    expect(cra.lignes.every((l) => l.quotite > 0)).toBe(true);
  });

  it('ignore les jours d’un autre mois', () => {
    const planning = planifier([...AOUT, D('2026-09-07')], SANS);
    expect(craDuMois(mois('2026-08'), planning, [SEMAINE], euros(500)).lignes).toHaveLength(3);
  });

  /**
   * Chaque jour est valorisé au TJM en vigueur À SA DATE. Appliquer le tarif
   * du jour de l'édition réécrirait le passé à chaque renégociation — et un
   * CRA déjà signé changerait de montant.
   */
  it('valorise au tarif en vigueur à la date, pas au dernier connu', () => {
    const avant: Rythme = {
      du: D('2026-01-01'), au: D('2026-08-12'), parJour: { lun: 1, mar: 1 }, tjm: euros(400)
    };
    const apres: Rythme = {
      du: D('2026-08-13'), au: D('2026-12-31'), parJour: { lun: 1, mar: 1 }, tjm: euros(600)
    };
    const dates = ['2026-08-10', '2026-08-18'].map(D); // un lundi avant, un mardi après
    const planning = planifier(dates, {
      ...SANS, rythmes: [avant, apres]
    });
    const cra = craDuMois(mois('2026-08'), planning, [avant, apres], euros(999));
    expect(cra.totalJours).toBe(2);
    expect(cra.montant).toBe(1000); // 400 + 600, jamais 2 × 999
  });

  // Sans TJM de période, celui de la mission s'applique : c'est le cas le
  // plus courant, et exiger un tarif par période obligerait à le répéter.
  it('retombe sur le TJM de la mission', () => {
    const sansTjm: Rythme = { ...SEMAINE, tjm: null };
    const cra = craDuMois(
      mois('2026-08'), planifier([D('2026-08-10')], { ...SANS, rythmes: [sansTjm] }),
      [sansTjm], euros(700)
    );
    expect(cra.montant).toBe(700);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Les deux moitiés de la journée
   ───────────────────────────────────────────────────────────────────────── */

describe('créneaux occupés', () => {
  /**
   * LA CONVENTION N'EST QUE LE RECOURS.
   *
   * Avant le schéma 14, la position d'une demi-journée n'existait pas : la
   * dessiner supposait de remplir le premier créneau et de le dire ailleurs.
   * C'est une convention d'affichage, pas une donnée — et elle reste le recours
   * pour toutes les journées d'avant, qu'aucune migration ne peut renseigner.
   */
  it('répartit une journée sans position saisie', () => {
    expect(creneauxOccupes(1, null).map((o) => o.creneau)).toEqual(['matin', 'apresMidi']);
    expect(creneauxOccupes(0.5, null).map((o) => o.creneau)).toEqual(['matin']);
    expect(creneauxOccupes(0, null)).toEqual([]);
  });

  /** Et elle le DIT : une position répartie n'est pas une position su. */
  it('marque « reparti » ce qui vient de la convention', () => {
    expect(creneauxOccupes(1, null).every((o) => o.sur === 'reparti')).toBe(true);
    expect(creneauxOccupes(1, ['matin']).every((o) => o.sur === 'saisi')).toBe(true);
  });

  /**
   * LE POINT DUR. Une demi-journée d'APRÈS-MIDI occupe la seconde moitié et
   * laisse la première vide. La convention seule remplissait le matin, toujours
   * — et se trompait une fois sur deux.
   */
  it('laisse les créneaux saisis l’emporter sur la convention', () => {
    expect(creneauxOccupes(0.5, ['apresMidi']).map((o) => o.creneau)).toEqual(['apresMidi']);
  });

  /**
   * Un tableau VIDE est une réponse — « aucune moitié travaillée » — là où
   * `null` dit « on ne sait pas ». Les confondre ferait réapparaître, par la
   * convention, une journée que l'utilisateur venait d'effacer.
   */
  it('distingue « aucun créneau » de « position inconnue »', () => {
    expect(creneauxOccupes(1, [])).toEqual([]);
    expect(creneauxOccupes(1, null)).toHaveLength(2);
  });

  /** Les créneaux sortent toujours dans l'ordre de la journée, quel que soit
      celui dans lequel ils ont été saisis. */
  it('rend les créneaux dans l’ordre de la journée', () => {
    expect(creneauxOccupes(1, ['apresMidi', 'matin']).map((o) => o.creneau))
      .toEqual(['matin', 'apresMidi']);
  });

  /**
   * Une quotité intermédiaire — 0,25 d'astreinte — occupe au moins la matinée.
   * L'arrondir à rien effacerait du travail réel de la grille, pendant que le
   * CRA continuerait de le compter.
   */
  it('occupe au moins une moitié dès qu’il y a du travail', () => {
    expect(creneauxOccupes(0.25, null).map((o) => o.creneau)).toEqual(['matin']);
  });
});

describe('bascule d’un créneau', () => {
  const journee = (o: Partial<JourPlanifie> = {}): JourPlanifie => ({
    date: D('2026-08-10'),
    prevu: 1, retenu: 1, ajuste: false, ferie: false, weekEnd: false, conge: 0,
    creneaux: null, lieu: null,
    ...o
  });

  /**
   * CE QU'AUCUN CYCLE SUR LA JOURNÉE ENTIÈRE NE POUVAIT EXPRIMER.
   *
   * Retirer l'après-midi laisse le matin. L'écran d'avant faisait tourner la
   * JOURNÉE — entière, demie, rien — et « demie » remplissait toujours le
   * matin : retirer la matinée était impossible.
   */
  it('retire la moitié cliquée et garde l’autre', () => {
    expect(basculerCreneau(journee(), 'apresMidi'))
      .toEqual({ quotite: 0.5, creneaux: ['matin'] });
    expect(basculerCreneau(journee(), 'matin'))
      .toEqual({ quotite: 0.5, creneaux: ['apresMidi'] });
  });

  /** Une moitié vide se remplit : c'est ainsi qu'on déclare un rendu de nuit. */
  it('ajoute la moitié cliquée quand elle est libre', () => {
    const libre = journee({ prevu: 0, retenu: 0, weekEnd: true });
    expect(basculerCreneau(libre, 'matin')).toEqual({ quotite: 0.5, creneaux: ['matin'] });
  });

  it('vide la journée quand on retire la seconde moitié', () => {
    const demi = journee({ retenu: 0.5, creneaux: ['matin'], ajuste: true });
    expect(basculerCreneau(demi, 'matin')).toEqual({ quotite: 0, creneaux: [] });
  });

  /**
   * LE POINT DUR, ET C'EST CE QUE LE TROISIÈME ÉTAT DU CYCLE TENAIT VRAIMENT.
   *
   * Revenir exactement à ce que le rythme prévoit EFFACE l'ajustement. Sans
   * cela, une correction annulée à la main laisserait derrière elle un
   * ajustement qui dit la même chose que le rythme — invisible, jusqu'au jour
   * où le rythme change et où cette journée-là ne suit pas.
   */
  it('efface l’ajustement quand la journée retombe sur le rythme', () => {
    const corrigee = journee({ prevu: 1, retenu: 0.5, creneaux: ['matin'], ajuste: true });
    expect(basculerCreneau(corrigee, 'apresMidi')).toBeNull();
  });

  // Le rythme ne prévoit rien : vider la journée, c'est y revenir.
  it('efface l’ajustement quand une journée déclarée est vidée', () => {
    const declaree = journee({
      prevu: 0, retenu: 0.5, creneaux: ['matin'], ajuste: true, weekEnd: true
    });
    expect(basculerCreneau(declaree, 'matin')).toBeNull();
  });

  /**
   * Le lieu SURVIT au geste : retirer une matinée ne dit pas qu'on ne sait
   * plus d'où l'après-midi a été travaillé. L'effacer obligerait à le ressaisir
   * à chaque correction — et c'est ainsi qu'on cesse de le saisir.
   */
  it('conserve le lieu déjà posé', () => {
    const surSite = journee({ lieu: 'sur_site' });
    expect(basculerCreneau(surSite, 'matin'))
      .toEqual({ quotite: 0.5, creneaux: ['apresMidi'], lieu: 'sur_site' });
  });
});

describe('saisie sur une portée', () => {
  const journee = (o: Partial<JourPlanifie> = {}): JourPlanifie => ({
    date: D('2026-08-10'),
    prevu: 1, retenu: 1, ajuste: false, ferie: false, weekEnd: false, conge: 0,
    creneaux: null, lieu: null,
    ...o
  });

  /**
   * LE GESTE QUI CORRIGE LA JOURNÉE ET DEMIE.
   *
   * Deux rythmes prévoient tous deux le vendredi : l'occupation passe au-dessus
   * de 100 % et le CRA facture du temps qui n'a pas existé. Attribuer la
   * matinée à l'un la RETIRE à l'autre — c'est l'appelant qui passe `occupe`
   * à faux pour toutes les autres affectations.
   */
  it('libère la portée de l’affectation qui ne la tient pas', () => {
    expect(saisirSurPortee(journee(), 'matin', false, null))
      .toEqual({ quotite: 0.5, creneaux: ['apresMidi'] });
  });

  it('donne la portée à l’affectation qui la tient', () => {
    const vide = journee({ prevu: 0, retenu: 0, weekEnd: true });
    expect(saisirSurPortee(vide, 'apresMidi', true, null))
      .toEqual({ quotite: 0.5, creneaux: ['apresMidi'] });
  });

  /** La journée entière est un geste, pas deux : voir `PORTEES`. */
  it('prend les deux moitiés d’un coup sur la portée journée', () => {
    const vide = journee({ prevu: 0, retenu: 0, weekEnd: true });
    expect(saisirSurPortee(vide, 'journee', true, null))
      .toEqual({ quotite: 1, creneaux: ['matin', 'apresMidi'] });
    expect(saisirSurPortee(journee(), 'journee', false, null))
      .toEqual({ quotite: 0, creneaux: [] });
  });

  /** Une moitié déjà tenue ne se dédouble pas quand on redéclare l'autre. */
  it('ajoute la portée à ce qui est déjà tenu', () => {
    const matin = journee({ prevu: 0.5, retenu: 0.5, creneaux: ['matin'] });
    expect(saisirSurPortee(matin, 'apresMidi', true, null))
      .toEqual({ quotite: 1, creneaux: ['matin', 'apresMidi'] });
  });

  it('efface l’ajustement quand la saisie retombe sur le rythme', () => {
    const corrigee = journee({ prevu: 1, retenu: 0.5, creneaux: ['matin'], ajuste: true });
    expect(saisirSurPortee(corrigee, 'apresMidi', true, null)).toBeNull();
  });

  /**
   * LE LIEU EMPÊCHE L'EFFACEMENT, ET C'EST LE POINT DUR.
   *
   * Préciser « sur site » sur une journée que le rythme prévoyait déjà ne la
   * ramène pas au rythme : elle porte maintenant une information de plus.
   * L'effacer comme identique perdrait le lieu que l'utilisateur vient de
   * saisir, sans rien signaler — le pire des deux, puisque le geste a l'air
   * d'avoir fonctionné.
   */
  it('garde l’ajustement quand la saisie ne fait qu’ajouter un lieu', () => {
    expect(saisirSurPortee(journee(), 'journee', true, 'sur_site'))
      .toEqual({ quotite: 1, creneaux: ['matin', 'apresMidi'], lieu: 'sur_site' });
  });

  /** Le lieu saisi l'emporte sur celui déjà posé : c'est une correction. */
  it('remplace le lieu déjà posé par celui qu’on saisit', () => {
    const domicile = journee({ lieu: 'teletravail' });
    expect(saisirSurPortee(domicile, 'journee', true, 'sur_site'))
      .toEqual({ quotite: 1, creneaux: ['matin', 'apresMidi'], lieu: 'sur_site' });
  });

  /** Sans lieu saisi, celui de la journée survit — comme à la bascule. */
  it('conserve le lieu quand la saisie n’en donne pas', () => {
    const surSite = journee({ lieu: 'sur_site' });
    expect(saisirSurPortee(surSite, 'matin', false, null))
      .toEqual({ quotite: 0.5, creneaux: ['apresMidi'], lieu: 'sur_site' });
  });
});

describe('congé après une saisie', () => {
  /**
   * UN MAXIMUM, ET NON UNE SOMME.
   *
   * Le schéma stocke « 0,5 j de congé », sans dire quelle moitié. Un second
   * clic sur la même matinée compterait donc un jour de congé qui n'a pas été
   * pris — et c'est ce chiffre qui alimente le solde.
   */
  it('ne compte pas deux fois la même moitié', () => {
    expect(congeApresSaisie(0.5, 'matin', 'conge')).toBe(0.5);
  });

  it('porte la journée entière au congé', () => {
    expect(congeApresSaisie(0, 'journee', 'conge')).toBe(1);
    expect(congeApresSaisie(0.5, 'journee', 'conge')).toBe(1);
  });

  /** Réversible moitié par moitié : c'est ce qui rend le geste rattrapable. */
  it('retire une moitié à la fois', () => {
    expect(congeApresSaisie(1, 'apresMidi', 'libre')).toBe(0.5);
    expect(congeApresSaisie(0.5, 'matin', 'libre')).toBe(0);
  });

  it('ne descend jamais sous zéro', () => {
    expect(congeApresSaisie(0, 'journee', 'libre')).toBe(0);
  });

  /**
   * Travail et congé ne tiennent pas sur le même créneau : laisser les deux
   * ferait sortir le jour du dénominateur d'occupation pendant qu'il compte au
   * numérateur — un taux faux des deux côtés à la fois.
   */
  it('retire le congé de la moitié qu’on déclare travaillée', () => {
    expect(congeApresSaisie(1, 'matin', 'travail')).toBe(0.5);
  });
});
