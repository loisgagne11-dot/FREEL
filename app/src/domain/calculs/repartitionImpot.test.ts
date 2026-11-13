import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois } from '../types';
import { repartitionMensuelleImpot } from './repartitionImpot';

const e = (le: string, montant: number) => ({ le: dateISO(le), montant: euros(montant) });

/*
 * Une année projetée à 30 000 € de chiffre d'affaires et 3 000 € d'impôt :
 * 10 % de chaque euro encaissé. Valeurs fictives.
 */
const base = {
  annee: 2026,
  jusquA: mois('2026-05'),
  impotAnneeProjetee: euros(3000),
  caProjete: euros(30000),
  encaissements: [e('2026-01-20', 6000), e('2026-03-05', 9000), e('2026-03-28', 3000)],
  prelevements: [] as ReturnType<typeof e>[]
};

describe('la provision d’impôt, mois par mois', () => {
  it('suit l’argent reçu, pas le calendrier : un mois sans encaissement n’ajoute rien', () => {
    const r = repartitionMensuelleImpot(base);
    expect(r.map((l) => l.mois)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']);
    expect(r.map((l) => l.impot)).toEqual([600, 0, 1200, 0, 0]);
    expect(r.map((l) => l.aGarder)).toEqual([600, 600, 1800, 1800, 1800]);
  });

  // Le dernier cumul est le total que l'écran affiche au-dessus du tableau :
  // `impôt × part encaissée`. Arrondir chaque mois puis additionner l'en
  // écarterait de quelques centimes.
  it('retombe au centime sur le total : impôt de l’année × part encaissée', () => {
    const r = repartitionMensuelleImpot({
      ...base,
      impotAnneeProjetee: euros(1000),
      encaissements: [e('2026-01-10', 1), e('2026-02-10', 1), e('2026-03-10', 1)],
      caProjete: euros(7)
    });
    const total = r.reduce((s, l) => s + l.impot, 0);
    expect(Math.round(total * 100) / 100).toBe(Math.round(1000 * 3 / 7 * 100) / 100);
    expect(r.at(-1)?.aGarder).toBe(Math.round(1000 * 3 / 7 * 100) / 100);
  });

  // Un acompte appelé et pas encore prélevé est encore sur le compte : l'argent
  // qui le réglera doit y rester. Seul le prélèvement réel le fait sortir.
  it('retranche les acomptes prélevés, au mois où ils sont partis', () => {
    const r = repartitionMensuelleImpot({ ...base, prelevements: [e('2026-04-15', 500)] });
    expect(r.map((l) => l.preleve)).toEqual([0, 0, 0, 500, 0]);
    expect(r.map((l) => l.aGarder)).toEqual([600, 600, 1800, 1300, 1300]);
  });

  it('ne descend pas sous zéro quand les acomptes dépassent l’impôt déjà dû', () => {
    const r = repartitionMensuelleImpot({ ...base, prelevements: [e('2026-01-15', 900)] });
    expect(r[0]?.aGarder).toBe(0);
  });

  it('ignore ce qui est entré une autre année', () => {
    const r = repartitionMensuelleImpot({ ...base, encaissements: [...base.encaissements, e('2025-12-20', 9000)] });
    expect(r[0]?.impot).toBe(600);
  });

  it('couvre l’année entière quand elle est passée', () => {
    expect(repartitionMensuelleImpot({ ...base, jusquA: mois('2027-02') })).toHaveLength(12);
  });
});
