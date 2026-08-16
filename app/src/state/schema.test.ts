import { describe, expect, it } from 'vitest';
import {
  VERSION_SCHEMA, completerFaits, entrepriseVide, faitsVides, motifRefusFaits
} from './schema';

/**
 * Validation d'un bloc de faits.
 *
 * Ces contrôles n'avaient pas lieu d'être tant que les faits ne venaient que
 * du navigateur : l'application relisait ce qu'elle avait écrit. Ils
 * deviennent nécessaires dès qu'un bloc arrive d'un compte distant, donc
 * potentiellement d'une AUTRE version de l'application.
 */

describe('acceptation d’un bloc de faits', () => {
  it('accepte ce que l’application produit elle-même', () => {
    expect(motifRefusFaits(faitsVides())).toBeNull();
  });

  it('refuse ce qui n’est pas un objet', () => {
    expect(motifRefusFaits(null)).not.toBeNull();
    expect(motifRefusFaits('des faits')).not.toBeNull();
    expect(motifRefusFaits([])).not.toBeNull();
  });

  it('refuse un bloc sans numéro de schéma', () => {
    const { version: _version, ...sansVersion } = faitsVides();
    expect(motifRefusFaits(sansVersion)).toMatch(/numéro de schéma/i);
  });

  /**
   * Le point dur. Une version ancienne de l'application qui charge un bloc
   * récent en ignore les champs inconnus — puis les EFFACE au premier renvoi
   * sur le compte. Elle détruirait le travail fait sur une version plus
   * récente, depuis un autre appareil, sans que rien ne l'annonce.
   */
  it('refuse un schéma plus récent que celui qu’il sait lire', () => {
    const motif = motifRefusFaits({ ...faitsVides(), version: VERSION_SCHEMA + 1 });
    expect(motif).toMatch(/plus récente/i);
    expect(motif).toContain(String(VERSION_SCHEMA + 1));
  });

  // Un schéma antérieur est légitime : il lui manque les champs ajoutés depuis.
  it('accepte un schéma antérieur', () => {
    expect(motifRefusFaits({ version: 0, clients: [] })).toBeNull();
  });

  it('refuse une liste qui n’en est pas une', () => {
    expect(motifRefusFaits({ ...faitsVides(), recettes: {} })).toMatch(/recettes/);
    expect(motifRefusFaits({ ...faitsVides(), depenses: 'aucune' })).toMatch(/depenses/);
  });

  it('refuse un montant qui n’est pas un nombre fini', () => {
    expect(motifRefusFaits({ ...faitsVides(), reserve: '1000' })).toMatch(/reserve/);
    expect(motifRefusFaits({ ...faitsVides(), soldeInitial: Number.NaN })).toMatch(/soldeInitial/);
  });

  it('refuse une entreprise qui n’est pas un objet', () => {
    expect(motifRefusFaits({ ...faitsVides(), entreprise: 'Moi' })).toMatch(/entreprise/);
  });
});

describe('complétion d’un bloc accepté', () => {
  it('comble les listes absentes plutôt que de les laisser indéfinies', () => {
    const faits = completerFaits({ version: 0 });
    expect(faits.clients).toEqual([]);
    expect(faits.recettes).toEqual([]);
    expect(faits.mouvementsBancaires).toEqual([]);
    expect(faits.entreprise).toEqual(entrepriseVide());
  });

  it('conserve ce que le bloc porte', () => {
    const faits = completerFaits({
      version: VERSION_SCHEMA,
      clients: [{ id: 'c1', nom: 'Client de démonstration' }],
      reserve: 3000
    });
    expect(faits.clients).toHaveLength(1);
    expect(faits.reserve).toBe(3000);
  });

  // Les champs manquants viennent d'être comblés : le bloc n'est plus à
  // l'ancien format, et le renvoyer sous son ancien numéro le ferait migrer
  // une seconde fois au prochain chargement.
  it('porte le numéro de schéma de ce code après complétion', () => {
    expect(completerFaits({ version: 0 }).version).toBe(VERSION_SCHEMA);
  });

  it('complète une entreprise partielle sans perdre ses champs', () => {
    const faits = completerFaits({ version: 0, entreprise: { nom: 'Entreprise de démo' } });
    expect(faits.entreprise.nom).toBe('Entreprise de démo');
    expect(faits.entreprise.typeActivite).toBe('BNC');
    expect(faits.entreprise.onboardingFait).toBe(false);
  });
});

/**
 * Migration du schéma 1 vers le schéma 2.
 *
 * Le schéma 1 portait `conges: ['2026-08-10', …]` — de simples chaînes. Tout
 * bloc déjà enregistré, sur le poste comme sur le compte distant, est à ce
 * format. Le laisser passer donnerait des congés dont `date` vaut `undefined`
 * : le calendrier n'afficherait plus rien, le décompte tomberait à zéro, et
 * rien ne le signalerait. Une migration de schéma qu'on oublie ne lève pas
 * d'erreur — elle vide les données en silence.
 */
describe('congés d’un bloc au schéma 1', () => {
  it('convertit les dates nues en journées entières', () => {
    const faits = completerFaits({ version: 1, conges: ['2026-08-10', '2026-08-11'] });
    expect(faits.conges).toEqual([
      { date: '2026-08-10', quotite: 1 },
      { date: '2026-08-11', quotite: 1 }
    ]);
  });

  it('conserve les quotités d’un bloc déjà au schéma 2', () => {
    const faits = completerFaits({
      version: 2, conges: [{ date: '2026-08-10', quotite: 0.5 }]
    });
    expect(faits.conges).toEqual([{ date: '2026-08-10', quotite: 0.5 }]);
  });

  // Une entrée sans date n'est pas un congé : la garder produirait une case
  // de calendrier qui ne correspond à aucun jour.
  it('écarte une entrée sans date exploitable', () => {
    const faits = completerFaits({ version: 2, conges: [{ quotite: 1 }, 42, null] });
    expect(faits.conges).toEqual([]);
  });

  it('retombe sur la journée entière quand la quotité est illisible', () => {
    const faits = completerFaits({
      version: 2, conges: [{ date: '2026-08-10', quotite: 'moitié' }]
    });
    expect(faits.conges).toEqual([{ date: '2026-08-10', quotite: 1 }]);
  });
});

/**
 * Les champs ajoutés À L'INTÉRIEUR des missions au schéma 2.
 *
 * Bug constaté dans un vrai navigateur : `completerFaits` fusionnait les
 * défauts au premier niveau seulement. Une liste `missions` présente écrasait
 * le défaut en bloc, donc `rythmes` restait `undefined`, le planning lisait sa
 * longueur, et l'écran Activité tombait entièrement — pour tout compte
 * enregistré avant le schéma 2, c'est-à-dire tous.
 */
describe('missions d’un bloc au schéma 1', () => {
  const missionV1 = {
    id: 'm1', clientId: null, clientNom: 'Client', description: 'Mission',
    tjm: 500, debut: '2026-01-01', fin: '2026-12-31', statut: 'active'
  };

  it('donne un rythme et des ajustements vides plutôt qu’absents', () => {
    const faits = completerFaits({ version: 1, missions: [missionV1] });
    expect(faits.missions[0]?.entites[0]?.rythmes).toEqual([]);
    expect(faits.missions[0]?.entites[0]?.ajustements).toEqual({});
  });

  it('n’écrase pas un rythme déjà déclaré', () => {
    const faits = completerFaits({
      version: 2,
      missions: [{
        ...missionV1,
        rythmes: [{ debut: '2026-01-01', fin: null, jours: { 1: 1, 2: 1 } }],
        ajustements: { '2026-03-04': 0 }
      }]
    });
    expect(faits.missions[0]?.entites[0]?.rythmes).toHaveLength(1);
    // Zéro est un ajustement légitime — c'est ainsi qu'on retire une journée.
    expect(faits.missions[0]?.entites[0]?.ajustements).toEqual({ '2026-03-04': 0 });
  });

  it('écarte une entrée qui n’est pas un objet', () => {
    const faits = completerFaits({ version: 1, missions: [null, 42, missionV1] });
    expect(faits.missions).toHaveLength(1);
  });

  // Le champ absent de bout en bout : `missions` lui-même peut manquer.
  it('accepte un bloc sans missions du tout', () => {
    expect(completerFaits({ version: 1 }).missions).toEqual([]);
  });
});

/**
 * `sansContrepartie` passe du booléen au motif (schéma 4 → 5).
 *
 * LE PIÈGE : le champ valait `true` ou `false`. Sans conversion, un `false`
 * enregistré hier serait lu comme « différent de null », donc comme un
 * mouvement DÉJÀ classé — tous les mouvements à traiter disparaîtraient de la
 * file, sans que rien ne le signale.
 *
 * Troisième champ imbriqué à migrer, après les congés et les rythmes. La règle
 * est acquise : une migration descend jusqu'où les champs ont bougé.
 */
describe('mouvements bancaires d’un bloc au schéma 4', () => {
  const mv = (sansContrepartie: unknown) => ({
    id: 'mv1', date: '2026-08-05', libelle: 'PRLV', montant: -120,
    rapprocheAvec: null, sansContrepartie
  });

  it('rend un mouvement non classé à la file « à traiter »', () => {
    const faits = completerFaits({ version: 4, mouvementsBancaires: [mv(false)] });
    expect(faits.mouvementsBancaires[0]?.sansContrepartie).toBeNull();
  });

  /**
   * Un `true` d'hier ne disait pas POURQUOI. Il devient « autre » : le
   * requalifier en rémunération inventerait une information que l'ancien
   * format n'a jamais portée.
   */
  it('convertit un ancien « vrai » en motif « autre »', () => {
    const faits = completerFaits({ version: 4, mouvementsBancaires: [mv(true)] });
    expect(faits.mouvementsBancaires[0]?.sansContrepartie).toBe('autre');
  });

  it('conserve un motif déjà au schéma 5', () => {
    const faits = completerFaits({ version: 5, mouvementsBancaires: [mv('remuneration')] });
    expect(faits.mouvementsBancaires[0]?.sansContrepartie).toBe('remuneration');
  });

  it('écarte une valeur illisible plutôt que de la garder', () => {
    const faits = completerFaits({ version: 5, mouvementsBancaires: [mv('salaire')] });
    expect(faits.mouvementsBancaires[0]?.sansContrepartie).toBeNull();
  });
});

/**
 * `payee` devient une DATE de paiement (schéma 5 → 6).
 *
 * Quatrième champ imbriqué à migrer, après les congés, les rythmes et le motif
 * des mouvements. La règle est acquise et se vérifie à chaque fois : une
 * migration descend jusqu'où les champs ont bougé.
 */
describe('échéances d’un bloc au schéma 5', () => {
  const ech = (p: Record<string, unknown>) => ({
    id: 'e1', nature: 'urssaf', montant: 2400, echeanceLe: '2026-07-31', ...p
  });

  /**
   * Retenir la date d'échéance n'est pas une invention pour les seules données
   * qui existent : elles viennent toutes de la reprise des mouvements
   * « Charge », où la date d'échéance a été posée à partir de la date du
   * mouvement — c'est-à-dire du paiement.
   */
  it('convertit un « payée » en date, celle de l’échéance', () => {
    const faits = completerFaits({ version: 5, echeances: [ech({ payee: true })] });
    expect(faits.echeances[0]?.payeeLe).toBe('2026-07-31');
  });

  it('laisse une échéance non payée sans date', () => {
    const faits = completerFaits({ version: 5, echeances: [ech({ payee: false })] });
    expect(faits.echeances[0]?.payeeLe).toBeNull();
  });

  it('comble le montant payé absent', () => {
    const faits = completerFaits({ version: 5, echeances: [ech({ payee: false })] });
    expect(faits.echeances[0]?.montantPaye).toBeNull();
  });

  it('conserve une échéance déjà au schéma 6', () => {
    const faits = completerFaits({
      version: 6,
      echeances: [ech({ payeeLe: '2026-08-05', montantPaye: 2512.4 })]
    });
    expect(faits.echeances[0]?.payeeLe).toBe('2026-08-05');
    expect(faits.echeances[0]?.montantPaye).toBe(2512.4);
  });

  // Une échéance payée dont la date d'échéance est illisible ne peut pas
  // recevoir de date de paiement : mieux vaut « à payer » qu'une date fausse.
  it('n’invente pas de date quand l’échéance n’en a pas', () => {
    const faits = completerFaits({
      version: 5, echeances: [{ id: 'e1', nature: 'urssaf', montant: 2400, payee: true }]
    });
    expect(faits.echeances[0]?.payeeLe).toBeNull();
  });
});

/**
 * v7 → v8 : LES RECETTES PORTENT LEUR DATE D'ENVOI.
 *
 * Émise n'est pas envoyée : le document peut exister, porter son numéro, et
 * dormir dans un dossier. Le champ est nouveau, donc absent partout — et la
 * règle du projet s'applique une fois de plus : une migration descend jusqu'où
 * les champs ont bougé, ce que la fusion de surface de `completerFaits` ne fait
 * pas.
 */
describe('recettes d’un bloc au schéma 7', () => {
  const recette = (o: Record<string, unknown> = {}) => ({
    id: 'r1', clientNom: 'C', libelle: 'l', montant: 1000,
    emiseLe: '2026-06-01', encaisseeLe: null, modeReglement: null,
    numero: '2026-001', ...o
  });

  /**
   * LE POINT QUI COMPTE. `undefined` deviendrait « pas encore envoyée » par
   * accident. On pose `null` explicitement : cela dit la même chose, mais le
   * dit — et une facture d'avant le schéma 8 n'a effectivement aucune date
   * d'envoi enregistrée, quoi qu'il se soit passé dans la vraie vie.
   */
  it('pose null plutôt que de laisser le champ absent', () => {
    const f = completerFaits({ version: 7, recettes: [recette()] });
    expect(f.recettes[0]).toHaveProperty('envoyeeLe');
    expect(f.recettes[0]?.envoyeeLe).toBeNull();
  });

  it('conserve une date d’envoi déjà présente', () => {
    const f = completerFaits({
      version: 8, recettes: [recette({ envoyeeLe: '2026-06-03' })]
    });
    expect(f.recettes[0]?.envoyeeLe).toBe('2026-06-03');
  });

  /** Une valeur d'un autre type ne doit pas circuler comme une date. */
  it('refuse une date d’envoi qui n’en est pas une', () => {
    const f = completerFaits({ version: 8, recettes: [recette({ envoyeeLe: 42 })] });
    expect(f.recettes[0]?.envoyeeLe).toBeNull();
  });

  /** Le champ des relances, arrivé au schéma 7, ne doit pas régresser. */
  it('comble aussi les relances, sans les perdre', () => {
    const f = completerFaits({
      version: 7, recettes: [recette({ relancesLe: ['2026-07-01'] }), recette({ id: 'r2' })]
    });
    expect(f.recettes[0]?.relancesLe).toEqual(['2026-07-01']);
    expect(f.recettes[1]?.relancesLe).toEqual([]);
  });

  /** Le bloc ressort au numéro de schéma de CE code. */
  it('porte la version courante après complétion', () => {
    expect(completerFaits({ version: 7, recettes: [recette()] }).version).toBe(VERSION_SCHEMA);
  });

  /**
   * v8 → v9 : LA TVA DU DOCUMENT.
   *
   * `null` reste `null` et ne devient PAS zéro. Une facture d'avant le schéma 9
   * portait peut-être de la TVA ; la compter pour zéro sous-évaluerait une
   * déclaration — le sens dangereux de l'erreur, celui qui produit un rappel.
   */
  it('laisse la TVA inconnue à null, jamais à zéro', () => {
    const f = completerFaits({ version: 8, recettes: [recette()] });
    expect(f.recettes[0]).toHaveProperty('tvaCollectee');
    expect(f.recettes[0]?.tvaCollectee).toBeNull();
    expect(f.recettes[0]?.tvaCollectee).not.toBe(0);
  });

  it('conserve une TVA déjà enregistrée, y compris à zéro', () => {
    const avec = completerFaits({ version: 9, recettes: [recette({ tvaCollectee: 1000 })] });
    expect(avec.recettes[0]?.tvaCollectee).toBe(1000);

    // Zéro est une valeur JUSTE : une facture émise en franchise ne porte pas
    // de TVA, et ce n'est pas la même chose qu'une TVA inconnue.
    const franchise = completerFaits({ version: 9, recettes: [recette({ tvaCollectee: 0 })] });
    expect(franchise.recettes[0]?.tvaCollectee).toBe(0);
  });
});

/**
 * v10 → v11 : LA PART GARDÉE AU VERSEMENT.
 *
 * Le champ est de PREMIER NIVEAU. La fusion de surface de `completerFaits`
 * suffit donc à le combler — mais c'est ce que ces tests VÉRIFIENT, plutôt que
 * ce que le code suppose : le jour où le champ descendrait dans un élément de
 * liste, la fusion cesserait de suffire en silence, exactement comme pour les
 * congés du schéma 1 et les rythmes du schéma 2.
 */
describe('schéma 10 → 11 : la part gardée au versement', () => {
  it('comble un compte de schéma 10 à zéro, jamais à undefined', () => {
    const f = completerFaits({ version: 10, reserve: 3000 });
    expect(f).toHaveProperty('partGardeeAuVersement');
    expect(f.partGardeeAuVersement).toBe(0);
    expect(f.partGardeeAuVersement).not.toBeUndefined();
  });

  /**
   * LE DÉFAUT EST ZÉRO, ET SÛREMENT PAS 0,5.
   *
   * Si ce test sautait et que le défaut passait à 50 %, le versable de TOUT
   * compte existant serait coupé en deux au premier chargement, sans qu'un
   * geste ait été fait. Un réglage par défaut qui change un montant affiché est
   * un chiffre faux.
   */
  it('ne propose aucune part gardée tant que personne n’a réglé le curseur', () => {
    expect(faitsVides().partGardeeAuVersement).toBe(0);
    expect(completerFaits({ version: 0 }).partGardeeAuVersement).toBe(0);
  });

  it('conserve une part déjà réglée', () => {
    expect(completerFaits({ version: 11, partGardeeAuVersement: 0.3 }).partGardeeAuVersement)
      .toBe(0.3);
  });

  /**
   * LE CONTRÔLE PORTE SUR CE QUI ENGAGE.
   *
   * Au-delà de 1, `versable × (1 − part)` devient négatif : l'écran proposerait
   * de se verser une dette. En dessous de 0, il proposerait plus que le
   * versable. Ce sont les deux erreurs qu'un bloc venu d'ailleurs peut porter.
   */
  it('refuse une part qui n’est pas un ratio', () => {
    expect(motifRefusFaits({ ...faitsVides(), partGardeeAuVersement: '0,3' }))
      .toMatch(/partGardeeAuVersement/);
    expect(motifRefusFaits({ ...faitsVides(), partGardeeAuVersement: 1.5 }))
      .toMatch(/partGardeeAuVersement/);
    expect(motifRefusFaits({ ...faitsVides(), partGardeeAuVersement: -0.1 }))
      .toMatch(/partGardeeAuVersement/);
    expect(motifRefusFaits({ ...faitsVides(), partGardeeAuVersement: Number.NaN }))
      .toMatch(/partGardeeAuVersement/);
  });

  // Aucun compte d'avant le schéma 11 ne la porte : la refuser pour absence les
  // rejetterait tous.
  it('accepte son absence', () => {
    expect(motifRefusFaits({ version: 10, reserve: 3000 })).toBeNull();
  });
});
