import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../types';
import {
  type EcritureRapprochable, type MouvementBancaire,
  candidatsPour, empreinteMouvement, importerMouvements, resumerRapprochement,
  soldeBancaire
} from './banque';

const ligne = (date: string, libelle: string, montant: number) =>
  ({ date: dateISO(date), libelle, montant: euros(montant) });

function mouvement(m: Partial<MouvementBancaire> = {}): MouvementBancaire {
  return {
    id: 'mvt-1', date: dateISO('2026-07-16'), libelle: 'PRLV ABONNEMENT',
    montant: euros(-120), rapprocheAvec: null, sansContrepartie: false, ...m
  };
}

function ecriture(e: Partial<EcritureRapprochable> = {}): EcritureRapprochable {
  return {
    id: 'dep-1', libelle: 'Abonnement', montant: euros(120),
    date: dateISO('2026-07-15'), nature: 'depense', dejaRapprochee: false, ...e
  };
}

describe('identité d’un mouvement', () => {
  // Réimporter un relevé qui chevauche le précédent est le cas ordinaire :
  // on exporte « le mois dernier », puis « les trois derniers mois ».
  it('est stable d’un import à l’autre', () => {
    expect(empreinteMouvement(dateISO('2026-07-15'), euros(-120), 'PRLV ABO'))
      .toBe(empreinteMouvement(dateISO('2026-07-15'), euros(-120), 'PRLV ABO'));
  });

  // Une même opération peut être exportée avec une mise en forme différente.
  it('ignore casse, accents et espaces multiples du libellé', () => {
    expect(empreinteMouvement(dateISO('2026-07-15'), euros(-120), 'PRLV  SOCIÉTÉ'))
      .toBe(empreinteMouvement(dateISO('2026-07-15'), euros(-120), 'prlv societe'));
  });

  it('distingue deux montants ou deux dates différentes', () => {
    const a = empreinteMouvement(dateISO('2026-07-15'), euros(-120), 'X');
    expect(a).not.toBe(empreinteMouvement(dateISO('2026-07-15'), euros(-121), 'X'));
    expect(a).not.toBe(empreinteMouvement(dateISO('2026-07-16'), euros(-120), 'X'));
  });
});

describe('import', () => {
  it('ajoute les mouvements d’un premier relevé', () => {
    const r = importerMouvements([], [
      ligne('2026-07-15', 'VIR CLIENT A', 4000),
      ligne('2026-07-16', 'PRLV ABONNEMENT', -120)
    ]);
    expect(r.ajoutes).toBe(2);
    expect(r.deja).toBe(0);
    expect(r.mouvements).toHaveLength(2);
  });

  // Sans identité stable, le solde doublerait sur la période commune.
  it('n’ajoute pas deux fois le même mouvement', () => {
    const premier = importerMouvements([], [ligne('2026-07-15', 'VIR CLIENT A', 4000)]);
    const second = importerMouvements(premier.mouvements, [
      ligne('2026-07-15', 'VIR CLIENT A', 4000),
      ligne('2026-08-01', 'VIR CLIENT B', 2000)
    ]);
    expect(second.ajoutes).toBe(1);
    expect(second.deja).toBe(1);
    expect(second.mouvements).toHaveLength(2);
  });

  // C'est la propriété qui rend le réimport sans risque, donc utilisable.
  it('conserve un rapprochement déjà tranché', () => {
    const premier = importerMouvements([], [ligne('2026-07-15', 'VIR CLIENT A', 4000)]);
    const rapproche = premier.mouvements.map((m) => ({ ...m, rapprocheAvec: 'rec-1' }));
    const second = importerMouvements(rapproche, [ligne('2026-07-15', 'VIR CLIENT A', 4000)]);
    expect(second.mouvements[0]?.rapprocheAvec).toBe('rec-1');
  });

  it('range du plus récent au plus ancien', () => {
    const r = importerMouvements([], [
      ligne('2026-07-15', 'A', 100),
      ligne('2026-09-01', 'B', 200),
      ligne('2026-08-01', 'C', 300)
    ]);
    expect(r.mouvements.map((m) => m.libelle)).toEqual(['B', 'C', 'A']);
  });
});

describe('solde', () => {
  it('part du solde initial et applique les mouvements', () => {
    const r = importerMouvements([], [
      ligne('2026-07-15', 'VIR', 4000),
      ligne('2026-07-16', 'PRLV', -120.5)
    ]);
    expect(soldeBancaire(euros(1000), r.mouvements)).toBe(4879.5);
  });

  // Tant qu'aucun relevé n'est importé, le solde vaut le solde initial — et
  // l'écran doit dire qu'il n'est pas suivi.
  it('vaut le solde initial sans aucun mouvement', () => {
    expect(soldeBancaire(euros(1000), [])).toBe(1000);
  });
});

describe('candidats de rapprochement', () => {
  it('propose une écriture de même montant et de date proche', () => {
    expect(candidatsPour(mouvement(), [ecriture()]).map((e) => e.id)).toEqual(['dep-1']);
  });

  // Une tolérance sur le montant masquerait un écart de règlement, qui est
  // précisément ce qu'un rapprochement doit faire apparaître.
  it('exige le montant au centime', () => {
    expect(candidatsPour(mouvement(), [ecriture({ montant: euros(119.5) })])).toEqual([]);
    expect(candidatsPour(mouvement({ montant: euros(-120.5) }),
      [ecriture({ montant: euros(120.5) })])).toHaveLength(1);
  });

  // Un débit ne peut correspondre qu'à une dépense, un crédit qu'à une recette.
  it('respecte le sens de l’opération', () => {
    const recette = ecriture({ id: 'rec-1', nature: 'recette' });
    expect(candidatsPour(mouvement(), [recette])).toEqual([]);
    expect(candidatsPour(mouvement({ montant: euros(120) }), [recette])).toHaveLength(1);
  });

  // Un virement émis un vendredi arrive le lundi ; un prélèvement est daté de
  // l'échéance, pas du débit.
  it('accepte un écart de quelques jours', () => {
    expect(candidatsPour(mouvement(), [ecriture({ date: dateISO('2026-07-10') })]))
      .toHaveLength(1);
  });

  it('écarte au-delà de la fenêtre', () => {
    expect(candidatsPour(mouvement(), [ecriture({ date: dateISO('2026-05-01') })]))
      .toEqual([]);
  });

  it('retient une écriture sans date, faute de pouvoir l’écarter', () => {
    expect(candidatsPour(mouvement(), [ecriture({ date: null })])).toHaveLength(1);
  });

  it('n’en propose pas une déjà rapprochée', () => {
    expect(candidatsPour(mouvement(), [ecriture({ dejaRapprochee: true })])).toEqual([]);
  });

  it('n’en propose aucune pour un mouvement déjà tranché', () => {
    expect(candidatsPour(mouvement({ rapprocheAvec: 'dep-1' }), [ecriture()])).toEqual([]);
    expect(candidatsPour(mouvement({ sansContrepartie: true }), [ecriture()])).toEqual([]);
  });

  it('met la date la plus proche en tête', () => {
    const candidats = candidatsPour(mouvement(), [
      ecriture({ id: 'loin', date: dateISO('2026-07-10') }),
      ecriture({ id: 'proche', date: dateISO('2026-07-16') })
    ]);
    expect(candidats.map((e) => e.id)).toEqual(['proche', 'loin']);
  });
});

describe('résumé du rapprochement', () => {
  // « Évidente » dit que l'utilisateur n'aura pas à choisir — pas qu'on peut
  // valider à sa place. C'est là que l'ancienne version tranchait seule.
  it('distingue proposition unique, ambiguïté et absence de candidat', () => {
    const mouvements = [
      mouvement({ id: 'un-seul', montant: euros(-120) }),
      mouvement({ id: 'ambigu', montant: euros(-50) }),
      mouvement({ id: 'orphelin', montant: euros(-999) })
    ];
    const ecritures = [
      ecriture({ id: 'd120', montant: euros(120) }),
      ecriture({ id: 'd50a', montant: euros(50) }),
      ecriture({ id: 'd50b', montant: euros(50) })
    ];

    expect(resumerRapprochement(mouvements, ecritures)).toMatchObject({
      total: 3, propositionsEvidentes: 1, ambigus: 1, sansCandidat: 1, rapproches: 0
    });
  });

  // Sans cet état, frais bancaires et virements personnels resteraient
  // éternellement « à traiter », et l'écran finirait par ne plus être regardé.
  it('compte à part ce que l’utilisateur a déclaré sans contrepartie', () => {
    const resume = resumerRapprochement([
      mouvement({ id: 'frais', sansContrepartie: true }),
      mouvement({ id: 'fait', rapprocheAvec: 'dep-1' })
    ], []);
    expect(resume).toMatchObject({ sansContrepartie: 1, rapproches: 1, sansCandidat: 0 });
  });

  it('sur un relevé vide, ne compte rien', () => {
    expect(resumerRapprochement([], [])).toMatchObject({ total: 0, sansCandidat: 0 });
  });
});
