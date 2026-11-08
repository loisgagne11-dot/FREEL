import { describe, expect, it } from 'vitest';
import { dateISO, mois } from '../types';
import {
  ancreDeLAnnee, ancreDuMois, dansLaPeriode, finDuMois, moisDeLaPeriode, periodeCourante
} from './periode';

const LE = (s: string) => new Date(`${s}T12:00:00Z`);

describe('période courante', () => {
  it('borne le mois du premier au dernier jour', () => {
    const p = periodeCourante('mois', LE('2026-08-13'));
    expect(p).toMatchObject({ du: '2026-08-01', au: '2026-08-31', libelle: 'Août 2026' });
  });

  // Février 2028 compte 29 jours : une borne à 28 amputerait la période d'un
  // jour, et les dépenses de ce jour-là disparaîtraient de l'écran.
  it('tient compte des années bissextiles', () => {
    expect(periodeCourante('mois', LE('2028-02-10')).au).toBe('2028-02-29');
  });

  it('borne le trimestre sur ses trois mois', () => {
    const p = periodeCourante('trimestre', LE('2026-08-13'));
    expect(p).toMatchObject({ du: '2026-07-01', au: '2026-09-30', libelle: 'T3 2026' });
  });

  it('borne l’année civile', () => {
    const p = periodeCourante('annee', LE('2026-08-13'));
    expect(p).toMatchObject({ du: '2026-01-01', au: '2026-12-31', libelle: '2026' });
  });
});

describe('navigation entre périodes', () => {
  it('recule d’un mois en changeant d’année', () => {
    expect(periodeCourante('mois', LE('2026-01-15'), -1).libelle).toBe('Décembre 2025');
  });

  /**
   * Le point dur : reculer de trois trimestres depuis T1 2026 doit tomber sur
   * T2 2025. Une arithmétique qui traiterait l'année et le trimestre
   * séparément produirait un trimestre négatif, ou reboucherait sur la même
   * année.
   */
  it('recule de plusieurs trimestres à travers les années', () => {
    expect(periodeCourante('trimestre', LE('2026-02-10'), -3).libelle).toBe('T2 2025');
    expect(periodeCourante('trimestre', LE('2026-02-10'), -4).libelle).toBe('T1 2025');
    expect(periodeCourante('trimestre', LE('2026-11-10'), 1).libelle).toBe('T1 2027');
  });

  it('avance d’une année', () => {
    expect(periodeCourante('annee', LE('2026-08-13'), 1).libelle).toBe('2027');
  });

  // Naviguer dans un ensemble qui contient déjà tout ne mène nulle part.
  it('ignore le décalage sur « tout »', () => {
    expect(periodeCourante('tout', LE('2026-08-13'), -5)).toMatchObject({
      du: null, au: null, libelle: 'Tout'
    });
  });
});

describe('appartenance à une période', () => {
  const aout = periodeCourante('mois', LE('2026-08-13'));

  it('inclut les bornes', () => {
    expect(dansLaPeriode(dateISO('2026-08-01'), aout)).toBe(true);
    expect(dansLaPeriode(dateISO('2026-08-31'), aout)).toBe(true);
  });

  it('exclut ce qui est en dehors', () => {
    expect(dansLaPeriode(dateISO('2026-07-31'), aout)).toBe(false);
    expect(dansLaPeriode(dateISO('2026-09-01'), aout)).toBe(false);
  });

  /**
   * Une dépense sans date de paiement est un problème à traiter. La faire
   * disparaître de tous les écrans filtrés serait le meilleur moyen de ne
   * jamais la corriger — « Tout » reste l'endroit où on la retrouve.
   */
  it('écarte une date absente des périodes bornées, mais pas de « tout »', () => {
    expect(dansLaPeriode(null, aout)).toBe(false);
    expect(dansLaPeriode(null, periodeCourante('tout', LE('2026-08-13')))).toBe(true);
  });
});

describe('mois d’une période', () => {
  it('rend le mois quand la période en couvre exactement un', () => {
    expect(moisDeLaPeriode(periodeCourante('mois', LE('2026-08-13')))).toBe('2026-08');
  });

  it('ne rend rien pour un trimestre ou une année', () => {
    expect(moisDeLaPeriode(periodeCourante('trimestre', LE('2026-08-13')))).toBeNull();
    expect(moisDeLaPeriode(periodeCourante('annee', LE('2026-08-13')))).toBeNull();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   O1 — l'année choisie ancre la période
   ───────────────────────────────────────────────────────────────────────── */

/**
 * L'ANNÉE EST UNE ANCRE, PAS UN SECOND FILTRE.
 *
 * La barre du haut dit QUELLE ANNÉE, la barre de période dit QUELLE FINESSE.
 * Les empiler donnerait « le mois d'août, dans l'année 2025 » alors que la
 * barre pointe sur août 2026 — un ensemble vide présenté comme un résultat.
 */
describe('l’ancre d’une année', () => {
  const MAINTENANT = new Date('2026-06-10T09:00:00Z');

  /**
   * SUR L'ANNÉE COURANTE, ON GARDE AUJOURD'HUI. Ancrer au 31 décembre y
   * ferait ouvrir Facturer sur un mois qui n'est pas encore arrivé, donc vide.
   */
  it('garde aujourd’hui sur l’année en cours', () => {
    expect(ancreDeLAnnee(2026, MAINTENANT)).toBe(MAINTENANT);
    expect(periodeCourante('mois', ancreDeLAnnee(2026, MAINTENANT)).libelle).toBe('Juin 2026');
  });

  /**
   * SUR UNE AUTRE ANNÉE, ON ANCRE À SA FIN. C'est le dernier mois qui peut
   * porter des faits, donc celui d'où l'on remonte ; le 1ᵉʳ janvier
   * obligerait à avancer onze fois pour atteindre ce qu'on vient chercher.
   */
  it('ancre au dernier mois d’une année passée', () => {
    expect(periodeCourante('mois', ancreDeLAnnee(2025, MAINTENANT)).libelle)
      .toBe('Décembre 2025');
  });

  it('rend l’année entière quand la granularité est l’année', () => {
    const p = periodeCourante('annee', ancreDeLAnnee(2024, MAINTENANT));
    expect(p.du).toBe('2024-01-01');
    expect(p.au).toBe('2024-12-31');
    expect(p.libelle).toBe('2024');
  });

  /** Le décalage de la barre de période continue de fonctionner PAR-DESSUS. */
  it('laisse la barre de période naviguer dans l’année ancrée', () => {
    const ancre = ancreDeLAnnee(2025, MAINTENANT);
    expect(periodeCourante('mois', ancre, -1).libelle).toBe('Novembre 2025');
    expect(periodeCourante('trimestre', ancre).libelle).toBe('T4 2025');
  });

  /**
   * MIDI ET NON MINUIT.
   *
   * À minuit UTC, un fuseau à l'ouest ferait basculer la date au 30 décembre
   * — l'ancre changerait de mois selon le fuseau du lecteur, ce qui ferait
   * ouvrir l'écran sur novembre pour les uns et décembre pour les autres.
   */
  it('ne bascule pas de mois selon le fuseau', () => {
    const ancre = ancreDeLAnnee(2025, MAINTENANT);
    expect(ancre.getUTCMonth()).toBe(11);
    expect(ancre.getUTCHours()).toBe(12);
  });
});

describe('l’ancre d’un mois', () => {
  const MAINTENANT = new Date('2026-06-10T09:00:00Z');

  // Le mois courant garde aujourd'hui : l'ancrer à sa fin ferait compter le
  // « mois précédent » depuis le 30, pas depuis le mois où l'on est.
  it('garde aujourd’hui sur le mois en cours', () => {
    expect(ancreDuMois(mois('2026-06'), MAINTENANT)).toBe(MAINTENANT);
  });

  // Avec l'ancre d'année, choisir « mars » dans la barre du haut laissait
  // l'écran sur décembre : le mois choisi n'ancrait rien.
  it('ancre un autre mois sur son propre mois, pas sur la fin de l’année', () => {
    expect(periodeCourante('mois', ancreDuMois(mois('2026-03'), MAINTENANT)).libelle)
      .toBe('Mars 2026');
    expect(periodeCourante('trimestre', ancreDuMois(mois('2026-03'), MAINTENANT)).libelle)
      .toBe('T1 2026');
  });

  it('prend le dernier jour du mois, bissextile comprise', () => {
    const ancre = ancreDuMois(mois('2024-02'), MAINTENANT);
    expect(ancre.getUTCDate()).toBe(29);
    expect(ancre.getUTCHours()).toBe(12);
  });

  // Le même mois d'une autre année n'est PAS le mois courant.
  it('ne confond pas le même mois d’une autre année avec le mois courant', () => {
    expect(ancreDuMois(mois('2025-06'), MAINTENANT)).not.toBe(MAINTENANT);
    expect(periodeCourante('mois', ancreDuMois(mois('2025-06'), MAINTENANT)).libelle)
      .toBe('Juin 2025');
  });
});

/**
 * « 31/09/2026 » s'affichait comme fin d'ACRE : le jour était écrit en dur.
 */
describe('la fin d’un mois', () => {
  it('connaît les mois de trente jours et février, bissextile compris', () => {
    expect(finDuMois(mois('2026-09'))).toBe('2026-09-30');
    expect(finDuMois(mois('2027-06'))).toBe('2027-06-30');
    expect(finDuMois(mois('2025-12'))).toBe('2025-12-31');
    expect(finDuMois(mois('2026-02'))).toBe('2026-02-28');
    expect(finDuMois(mois('2028-02'))).toBe('2028-02-29');
  });
});
