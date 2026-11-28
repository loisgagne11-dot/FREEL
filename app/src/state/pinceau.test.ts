import { describe, expect, it } from 'vitest';
import { dateISO, euros } from '../domain/types';
import type { DateISO } from '../domain/types';
import type { AjustementJour } from '../domain/calculs/planning';
import { type Faits, faitsVides } from './schema';
import { type Geste, type Pinceau, annulerChangements, appliquerPinceau } from './pinceau';

const D = (s: string) => dateISO(s);

/** Du lundi 11 au lundi 18 mai 2026 : le jeudi 14 est l'Ascension. */
const DU_11_AU_18_MAI = ['11', '12', '13', '14', '15', '16', '17', '18']
  .map((j) => D(`2026-05-${j}`));

const entite = (id: string, nom: string, o: {
  parJour?: Record<string, number>;
  ajustements?: Record<string, AjustementJour>;
  au?: string;
} = {}) => ({
  id, nom, couleur: '', adresse: '', contact: '', email: '', telephone: '',
  rythmes: o.parJour === undefined ? [] : [{
    du: D('2026-01-01'), au: D(o.au ?? '2026-12-31'), parJour: o.parJour, tjm: euros(500)
  }],
  ajustements: o.ajustements ?? {}
});

const mission = (id: string, entites: ReturnType<typeof entite>[]): Faits['missions'][number] => ({
  id, clientId: null, clientNom: entites[0]?.nom ?? id, description: '',
  tjm: euros(500), debut: D('2026-01-01'), fin: null, statut: 'active', entites
});

/** Studio, sans rythme : tout ce qu'il a, il le tient du pinceau. */
const STUDIO = mission('mis-studio', [entite('co-studio', 'Studio Démo')]);
const AU_STUDIO: Pinceau = { type: 'travail', missionId: 'mis-studio', entiteId: 'co-studio', lieu: 'sur_site' };

const faits = (m: Partial<Faits> = {}): Faits => ({ ...faitsVides(), missions: [STUDIO], ...m });
const geste = (o: Partial<Geste> & { dates: readonly DateISO[] }): Geste =>
  ({ pinceau: AU_STUDIO, portee: 'journee', isole: false, ...o });
const ajustements = (f: Faits, missionId = 'mis-studio') =>
  f.missions.find((m) => m.id === missionId)?.entites[0]?.ajustements ?? {};

describe('le pinceau sur une plage', () => {
  /**
   * LA RÈGLE QUE LE PROPRIÉTAIRE A DEMANDÉE : glisser du lundi au lundi
   * suivant pose les jours ouvrés, et seulement eux. Poser aussi le samedi, le
   * dimanche et l'Ascension ferait trois corrections à défaire une à une — et
   * un CRA qui facture un jour chômé.
   */
  it('pose cinq jours et saute samedi, dimanche et le férié', () => {
    const a = appliquerPinceau(faits(), geste({ dates: DU_11_AU_18_MAI }));
    expect(a.jours).toEqual(['2026-05-11', '2026-05-12', '2026-05-13', '2026-05-15', '2026-05-18']);
    expect(a.demiJournees).toBe(10);
    expect(a.sautes.map((s) => [s.date, s.motif])).toEqual([
      ['2026-05-14', 'ferie'], ['2026-05-16', 'weekEnd'], ['2026-05-17', 'weekEnd']
    ]);
    // Le message nomme le férié : il le reçoit d'ici.
    expect(a.sautes[0]?.ferie?.nom).toBe('Ascension');
    expect(Object.keys(ajustements(a.faits)).sort()).toEqual(a.jours);
    expect(ajustements(a.faits)['2026-05-11']).toEqual({
      quotite: 1, creneaux: ['matin', 'apresMidi'], lieu: 'sur_site'
    });
  });

  /**
   * Un congé déjà pris ne se repeint pas en glissant : il sortirait du solde
   * de congés sans qu'on l'ait voulu, et l'occupation remonterait d'autant.
   */
  it('saute un congé déjà posé', () => {
    const a = appliquerPinceau(
      faits({ conges: [{ date: D('2026-05-12'), quotite: 1 }] }),
      geste({ dates: [D('2026-05-11'), D('2026-05-12'), D('2026-05-13')] })
    );
    expect(a.jours).toEqual(['2026-05-11', '2026-05-13']);
    expect(a.faits.conges).toEqual([{ date: '2026-05-12', quotite: 1 }]);
  });

  it('ne pose que la moitié de la portée', () => {
    const a = appliquerPinceau(faits(), geste({ dates: [D('2026-05-11'), D('2026-05-12')], portee: 'apresMidi' }));
    expect(a.demiJournees).toBe(2);
    expect(ajustements(a.faits)['2026-05-11']?.creneaux).toEqual(['apresMidi']);
  });
});

describe('le pinceau sur un jour isolé', () => {
  /**
   * Un clic sur UN jour le pose, même férié : c'est ainsi qu'on déclare une
   * astreinte ou un rendu le jour de l'Ascension. Le sauter, comme une plage,
   * rendrait la journée impossible à saisir autrement que par l'éditeur.
   */
  it('pose un férié', () => {
    const a = appliquerPinceau(faits(), geste({ dates: [D('2026-05-14')], isole: true }));
    expect(a.sautes).toEqual([]);
    expect(ajustements(a.faits)['2026-05-14']?.quotite).toBe(1);
  });

  it('pose un samedi, et remplace un congé', () => {
    const a = appliquerPinceau(
      faits({ conges: [{ date: D('2026-05-12'), quotite: 1 }] }),
      geste({ dates: [D('2026-05-12')], isole: true })
    );
    expect(ajustements(a.faits)['2026-05-12']?.quotite).toBe(1);
    // Travail et congé ne tiennent pas sur la même moitié : le congé part.
    expect(a.faits.conges).toEqual([]);
    expect(ajustements(appliquerPinceau(faits(), geste({ dates: [D('2026-05-16')], isole: true })).faits)['2026-05-16']?.quotite).toBe(1);
  });
});

describe('ce que le pinceau prend aux autres', () => {
  /** L'agence tient le vendredi entier, sur site, par son rythme. */
  const agence = (ajustementsDeLAgence: Record<string, AjustementJour> = {}) => mission('mis-agence', [
    entite('co-agence', 'Agence Démo', { parJour: { ven: 1 }, ajustements: ajustementsDeLAgence })
  ]);

  /**
   * Une moitié de journée n'a qu'un occupant. Peindre le vendredi matin au
   * studio le RETIRE à l'agence : sans cela, le vendredi compterait une
   * journée et demie, et deux CRA factureraient la même matinée.
   */
  it('rend la moitié peinte à celui qui la tenait', () => {
    const a = appliquerPinceau(
      faits({ missions: [STUDIO, agence()] }),
      geste({ dates: [D('2026-05-15')], portee: 'matin', isole: true })
    );
    expect(ajustements(a.faits)['2026-05-15']?.creneaux).toEqual(['matin']);
    expect(ajustements(a.faits, 'mis-agence')['2026-05-15']?.creneaux).toEqual(['apresMidi']);
  });

  /**
   * Le lieu choisi est celui du client peint. L'écran le passait à TOUS les
   * occupants : rendre la matinée à l'agence, sur site l'après-midi, la
   * requalifiait en télétravail sans que personne l'ait dit — et la part de
   * télétravail du mois mentait.
   */
  it('laisse son lieu à celui qui rend la moitié', () => {
    const a = appliquerPinceau(
      faits({
        missions: [STUDIO, agence({
          '2026-05-15': { quotite: 1, creneaux: ['matin', 'apresMidi'], lieu: 'sur_site' }
        })]
      }),
      geste({
        dates: [D('2026-05-15')], portee: 'matin', isole: true,
        pinceau: { ...AU_STUDIO, lieu: 'teletravail' }
      })
    );
    expect(ajustements(a.faits)['2026-05-15']?.lieu).toBe('teletravail');
    expect(ajustements(a.faits, 'mis-agence')['2026-05-15']?.lieu).toBe('sur_site');
  });

  /**
   * Un client opérationnel arrêté ne reçoit plus de journée : la lui peindre
   * repousserait sa fin, et le CRA compterait une journée chez un client parti.
   */
  it('ne peint pas un client après son arrêt', () => {
    const deux = mission('mis-deux', [
      entite('co-parti', 'Parti Démo', { parJour: { lun: 1 }, au: '2026-05-08' }),
      entite('co-reste', 'Reste Démo', { parJour: { mar: 1 } })
    ]);
    const a = appliquerPinceau(faits({ missions: [deux] }), geste({
      dates: [D('2026-05-07'), D('2026-05-11')],
      pinceau: { type: 'travail', missionId: 'mis-deux', entiteId: 'co-parti', lieu: null }
    }));
    expect(a.jours).toEqual(['2026-05-07']);
    expect(a.sautes.map((s) => s.motif)).toEqual(['arret']);
  });
});

describe('les autres pinceaux', () => {
  it('pose un congé, et libère la moitié qu’un rythme occupait', () => {
    const avecRythme = mission('mis-studio', [entite('co-studio', 'Studio Démo', { parJour: { lun: 1 } })]);
    const a = appliquerPinceau(faits({ missions: [avecRythme] }), geste({
      dates: [D('2026-05-11')], pinceau: { type: 'conge' }
    }));
    expect(a.faits.conges).toEqual([{ date: '2026-05-11', quotite: 1 }]);
    expect(ajustements(a.faits)['2026-05-11']?.quotite).toBe(0);
  });

  /**
   * Effacer RETIRE la correction : la journée redevient ce que le rythme
   * prévoit, ce qui n'est pas zéro. Et il ne touche pas aux congés, qui ne
   * sont pas des corrections du rythme.
   */
  it('efface les corrections, et laisse les congés', () => {
    const corrige = mission('mis-studio', [entite('co-studio', 'Studio Démo', {
      parJour: { lun: 1 }, ajustements: { '2026-05-11': { quotite: 0 } }
    })]);
    const a = appliquerPinceau(
      faits({ missions: [corrige], conges: [{ date: D('2026-05-11'), quotite: 0.5 }] }),
      geste({ dates: [D('2026-05-11')], pinceau: { type: 'effacer' }, isole: true })
    );
    expect(ajustements(a.faits)).toEqual({});
    expect(a.faits.conges).toEqual([{ date: '2026-05-11', quotite: 0.5 }]);
  });

  /** Repeindre ce qui est déjà là n'écrit rien : rien à synchroniser, rien à annuler. */
  it('ne change rien quand les jours portent déjà le pinceau', () => {
    const deja = faits();
    const premier = appliquerPinceau(deja, geste({ dates: [D('2026-05-11')] }));
    const second = appliquerPinceau(premier.faits, geste({ dates: [D('2026-05-11')] }));
    expect(second.faits).toBe(premier.faits);
    expect(second.changements).toEqual({ ajustements: [], conges: [] });
  });
});

describe('annuler un geste', () => {
  /**
   * « Annuler » rétablit l'état d'avant, EN ENTIER, en un geste : les
   * ajustements posés, ceux qu'on a pris aux autres, et les congés remplacés.
   * Un retour partiel laisserait une journée et demie là où il y en avait une.
   */
  it('rétablit l’état d’avant', () => {
    const avant = faits({
      missions: [STUDIO, mission('mis-agence', [entite('co-agence', 'Agence Démo', { parJour: { ven: 1 } })])],
      conges: [{ date: D('2026-05-13'), quotite: 0.5 }]
    });
    const a = appliquerPinceau(avant, geste({ dates: DU_11_AU_18_MAI.slice(0, 5), isole: false }));
    const b = appliquerPinceau(a.faits, geste({ dates: [D('2026-05-13')], isole: true }));
    const { faits: defait, rendus } = annulerChangements(b.faits, b.changements);
    expect(rendus).toBeGreaterThan(0);
    expect(defait).toEqual(a.faits);
    expect(annulerChangements(defait, a.changements).faits).toEqual(avant);
  });

  /**
   * Seul ce qui porte encore ce que le geste a posé est rétabli : une journée
   * réécrite depuis — par l'éditeur, un autre appareil — garde sa saisie.
   * L'écraser pour défaire un geste plus ancien la perdrait en silence.
   */
  it('ne défait pas ce qui a été réécrit depuis', () => {
    const a = appliquerPinceau(faits(), geste({ dates: [D('2026-05-11'), D('2026-05-12')] }));
    const reecrit = appliquerPinceau(a.faits, geste({
      dates: [D('2026-05-12')], isole: true, pinceau: { ...AU_STUDIO, lieu: 'teletravail' }
    })).faits;
    const { faits: defait, rendus } = annulerChangements(reecrit, a.changements);
    expect(rendus).toBe(1);
    expect(ajustements(defait)['2026-05-11']).toBeUndefined();
    expect(ajustements(defait)['2026-05-12']?.lieu).toBe('teletravail');
  });
});
