import { describe, expect, it } from 'vitest';
import { dateISO, euros, ratio } from '../types';
import type { Depense } from './depenses';
import type { Echeance, RecetteEncaissee } from './provisions';
import type { MouvementBancaire } from './banque';
import { provenanceSolde, soldeDerive } from './solde';

const recette = (id: string, montant: number, encaisseeLe: string): RecetteEncaissee => ({
  id, montant: euros(montant), encaisseeLe: dateISO(encaisseeLe)
});

const depense = (m: Partial<Depense> = {}): Depense => ({
  id: 'd1', libelle: 'Matériel', fournisseur: 'Fournisseur test', provenance: 'france',
  montantTtc: euros(300), tauxTva: ratio(0.20), payeeLe: dateISO('2026-07-05'),
  justificatifId: null, rapprochement: 'en_attente', ...m
});

const echeance = (m: Partial<Echeance> = {}): Echeance => ({
  id: 'e1', nature: 'urssaf', montant: euros(1500), echeanceLe: dateISO('2026-07-31'),
  payeeLe: dateISO('2026-07-31'), montantPaye: null, ...m
});

const mouvement = (m: Partial<MouvementBancaire> = {}): MouvementBancaire => ({
  id: 'mvt-1', date: dateISO('2026-07-12'), libelle: 'VIR',
  montant: euros(4000), rapprocheAvec: null, sansContrepartie: null, ...m
});

// Date de solde de départ commune aux tests hérités : antérieure à tous les
// faits des fixtures ci-dessus, pour qu'ils restent POSTÉRIEURS et continuent
// à contribuer comme avant l'introduction de la date.
const AVANT_TOUT = dateISO('2026-01-01');

describe('solde dérivé — le cas nu', () => {
  // C'est le cas remonté par l'utilisateur : rien d'autre que le solde saisi
  // une fois en Config. Le chiffre doit rester exactement celui-là, pas zéro.
  it('vaut le solde initial quand aucun fait ne contribue', () => {
    expect(soldeDerive(euros(1000), AVANT_TOUT, [], [], [], []).montant).toBe(1000);
  });
});

describe('solde dérivé — chaque fait fait foi', () => {
  it('ajoute une recette encaissée', () => {
    const r = soldeDerive(
      euros(1000), AVANT_TOUT, [recette('r1', 4000, '2026-07-10')], [], [], []
    );
    expect(r.montant).toBe(5000);
  });

  it('retranche une dépense payée', () => {
    const r = soldeDerive(euros(1000), AVANT_TOUT, [], [depense()], [], []);
    expect(r.montant).toBe(700);
  });

  // Une dépense non encore payée n'est pas sortie du compte : elle ne doit
  // rien retrancher, sous peine d'un solde sous-évalué avant même le paiement.
  it('ignore une dépense pas encore payée', () => {
    const r = soldeDerive(euros(1000), AVANT_TOUT, [], [depense({ payeeLe: null })], [], []);
    expect(r.montant).toBe(1000);
  });

  it('retranche une échéance payée', () => {
    const r = soldeDerive(euros(5000), AVANT_TOUT, [], [], [echeance()], []);
    expect(r.montant).toBe(3500);
  });

  // Une échéance non payée est déjà provisionnée par `voletConstate` (voir
  // `provisions.ts`) : la retrancher ici aussi la compterait deux fois.
  it('ignore une échéance pas encore payée', () => {
    const r = soldeDerive(euros(5000), AVANT_TOUT, [], [], [echeance({ payeeLe: null })], []);
    expect(r.montant).toBe(5000);
  });

  // Un montant réellement débité qui diffère de l'appel — régularisation,
  // majoration — doit primer : c'est lui qui est réellement sorti du compte.
  it('retient le montant réellement payé d’une échéance, s’il diffère du montant appelé', () => {
    const r = soldeDerive(
      euros(5000), AVANT_TOUT, [], [],
      [echeance({ montant: euros(1500), montantPaye: euros(1620) })], []
    );
    expect(r.montant).toBe(5000 - 1620);
  });
});

describe('solde dérivé — le piège du double comptage', () => {
  /**
   * LE CŒUR DU LOT H-B. Une recette encaissée EXISTE DEUX FOIS dès qu'un
   * relevé est importé : une fois comme recette, une fois comme mouvement
   * bancaire. Le rapprochement (`rapprocheAvec`) dit explicitement que c'est
   * LE MÊME euro. Sans l'exclusion ci-dessous, la preuve par mutation qui
   * suit échouerait : le solde vaudrait 9000 au lieu de 5000, soit 4000 € qui
   * n'existent nulle part sur le compte réel.
   */
  it('ne compte pas deux fois une recette dont le mouvement est rapproché', () => {
    const r = soldeDerive(
      euros(1000), AVANT_TOUT,
      [recette('r1', 4000, '2026-07-10')],
      [], [],
      [mouvement({ rapprocheAvec: 'r1' })]
    );
    expect(r.montant).toBe(5000);
  });

  it('ne compte pas deux fois une dépense dont le mouvement est rapproché', () => {
    const r = soldeDerive(
      euros(1000), AVANT_TOUT, [], [depense()], [],
      [mouvement({ id: 'mvt-2', montant: euros(-300), rapprocheAvec: 'd1' })]
    );
    expect(r.montant).toBe(700);
  });

  /**
   * Le sous-cas qui distingue ce module d'une règle plus simple (« le relevé
   * fait foi dès qu'il existe ») : un mouvement encore À TRAITER — ni
   * rapproché, ni classé sans contrepartie — ne doit RIEN ajouter. On ignore
   * s'il double un fait déjà compté ou représente un mouvement inconnu ;
   * l'écran Relevé existe pour lever cette ambiguïté, pas ce calcul.
   */
  it('n’ajoute pas un mouvement encore à traiter', () => {
    const r = soldeDerive(euros(1000), AVANT_TOUT, [], [], [], [mouvement()]);
    expect(r.montant).toBe(1000);
  });

  // Un mouvement « à traiter » qui coexiste avec la recette qu'il double :
  // toujours 5000, jamais 9000, qu'il soit rapproché ou pas encore.
  it('n’ajoute pas non plus un mouvement à traiter qui double une recette déjà comptée', () => {
    const r = soldeDerive(
      euros(1000), AVANT_TOUT,
      [recette('r1', 4000, '2026-07-10')],
      [], [],
      [mouvement({ montant: euros(4000) })]
    );
    expect(r.montant).toBe(5000);
  });

  /**
   * Un virement de rémunération n'a, PAR CONSTRUCTION, aucun fait ailleurs :
   * ce n'est ni une recette, ni une dépense, ni une échéance (voir
   * `MouvementBancaire.sansContrepartie`). C'est le seul cas où le mouvement
   * brut doit s'ajouter — sans quoi le versement resterait invisible du
   * solde, exactement le défaut inverse de celui que ce lot corrige.
   */
  it('ajoute un mouvement sans contrepartie (versement, frais bancaires)', () => {
    const r = soldeDerive(
      euros(5000), AVANT_TOUT, [], [], [],
      [mouvement({ montant: euros(-2000), sansContrepartie: 'remuneration' })]
    );
    expect(r.montant).toBe(3000);
  });

  it('additionne plusieurs faits sans qu’aucun ne double un autre', () => {
    const r = soldeDerive(
      euros(1000), AVANT_TOUT,
      [recette('r1', 4000, '2026-07-10')],
      [depense()],
      [echeance()],
      [
        mouvement({ id: 'rapproche', rapprocheAvec: 'r1', montant: euros(4000) }),
        mouvement({ id: 'sans-contrepartie', sansContrepartie: 'remuneration', montant: euros(-500) }),
        mouvement({ id: 'a-traiter', montant: euros(999) })
      ]
    );
    // 1000 (initial) + 4000 (recette) − 300 (dépense) − 1500 (échéance)
    // − 500 (versement) : le mouvement rapproché et celui à traiter ne
    // changent rien au total.
    expect(r.montant).toBe(1000 + 4000 - 300 - 1500 - 500);
  });
});

describe('solde dérivé — le point dur : dater le solde de départ', () => {
  /**
   * LE CAS QUI REVIENDRA LE PLUS SOUVENT (lot H-C). On saisit ses factures
   * après coup : dater le solde « aujourd'hui » puis enregistrer, demain, une
   * recette encaissée hier ne doit RIEN changer au solde affiché — cet euro
   * est déjà dans le montant saisi. Sans le filtre de date, ce test échouerait
   * en rendant 15000 au lieu de 10000 : l'exact double comptage que ce lot
   * corrige, cette fois entre le solde saisi et un fait antérieur à sa date.
   */
  it('n’ajoute pas une recette encaissée avant la date du solde de départ', () => {
    const r = soldeDerive(
      euros(10_000), dateISO('2026-08-22'),
      [recette('r1', 5000, '2026-08-21')],
      [], [], []
    );
    expect(r.montant).toBe(10_000);
  });

  // Le pendant pour une dépense : payée la veille de la date du solde, elle a
  // déjà quitté le compte AVANT que le montant ne soit relevé — la retrancher
  // ici la sortirait une seconde fois.
  it('ne retranche pas une dépense payée avant la date du solde de départ', () => {
    const r = soldeDerive(
      euros(10_000), dateISO('2026-08-22'), [],
      [depense({ payeeLe: dateISO('2026-08-21') })], [], []
    );
    expect(r.montant).toBe(10_000);
  });

  /**
   * LE SENS INVERSE, TOUT AUSSI TENU : une recette encaissée APRÈS la date du
   * solde de départ doit compter, une fois et une seule — y compris si un
   * mouvement bancaire rapproché la représente aussi au relevé. Un solde daté
   * ne doit pas devenir MOINS fiable qu'un solde non daté sur ce point.
   */
  it('ajoute une seule fois une recette encaissée après la date, même rapprochée', () => {
    const r = soldeDerive(
      euros(10_000), dateISO('2026-08-01'),
      [recette('r1', 5000, '2026-08-10')],
      [], [],
      [mouvement({ date: dateISO('2026-08-10'), montant: euros(5000), rapprocheAvec: 'r1' })]
    );
    expect(r.montant).toBe(15_000);
  });

  // Borne stricte : un fait daté du JOUR MÊME du solde de départ est déjà dans
  // le montant relevé « ce soir-là » — l'ajouter compterait la journée deux
  // fois. Ce test tombe si le `>` de la comparaison devient un `>=` inversé
  // en `<=`, ou l'inverse : c'est la preuve par mutation de la borne.
  it('n’ajoute pas un fait daté le jour même du solde de départ', () => {
    const r = soldeDerive(
      euros(10_000), dateISO('2026-08-22'),
      [recette('r1', 5000, '2026-08-22')],
      [], [], []
    );
    expect(r.montant).toBe(10_000);
  });

  /**
   * SANS DATE, ON S'ABSTIENT — même quand des faits existent. C'est le
   * comportement fermé demandé par le lot : deviner en trop est le risque, pas
   * l'abstention. Le solde revient exactement à celui d'avant le lot H-B :
   * solde initial plus les seuls mouvements sans contrepartie.
   */
  it('s’abstient d’ajouter les faits quand la date du solde de départ est inconnue', () => {
    const r = soldeDerive(
      euros(10_000), null,
      [recette('r1', 5000, '2026-08-10')],
      [depense()],
      [echeance()],
      [mouvement({ montant: euros(-2000), sansContrepartie: 'remuneration' })]
    );
    // 10000 − 2000 (le seul mouvement sans contrepartie) : ni la recette, ni
    // la dépense, ni l'échéance ne contribuent.
    expect(r.montant).toBe(8000);
  });
});

describe('provenance du solde', () => {
  it('« saisi » quand ni fait ni relevé ne contribuent', () => {
    expect(provenanceSolde(AVANT_TOUT, [], [], [], [])).toBe('saisi');
  });

  it('« derive » dès qu’une recette encaissée existe, sans relevé', () => {
    expect(provenanceSolde(AVANT_TOUT, [recette('r1', 4000, '2026-07-10')], [], [], []))
      .toBe('derive');
  });

  it('« derive » dès qu’une dépense payée existe, sans relevé', () => {
    expect(provenanceSolde(AVANT_TOUT, [], [depense()], [], [])).toBe('derive');
  });

  it('« derive » dès qu’une échéance payée existe, sans relevé', () => {
    expect(provenanceSolde(AVANT_TOUT, [], [], [echeance()], [])).toBe('derive');
  });

  // Une dépense non payée ou une échéance non payée ne sont pas des faits qui
  // font bouger le solde : elles ne doivent pas, seules, sortir la provenance
  // de « saisi ».
  it('reste « saisi » avec une dépense ou une échéance non payées', () => {
    expect(
      provenanceSolde(AVANT_TOUT, [], [depense({ payeeLe: null })], [echeance({ payeeLe: null })], [])
    ).toBe('saisi');
  });

  it('« rapproche » quand un relevé existe et que tout y est classé', () => {
    const p = provenanceSolde(
      AVANT_TOUT, [recette('r1', 4000, '2026-07-10')], [], [],
      [mouvement({ rapprocheAvec: 'r1' }), mouvement({ id: 'mvt-2', sansContrepartie: 'autre' })]
    );
    expect(p).toBe('rapproche');
  });

  // Le point qui distingue « rapproche » de « derive » : un seul mouvement
  // encore à traiter suffit à dire que le relevé n'a pas fini de confirmer
  // les faits, même si le solde, lui, est déjà juste.
  it('reste « derive » tant qu’un seul mouvement du relevé est à traiter', () => {
    const p = provenanceSolde(
      AVANT_TOUT, [recette('r1', 4000, '2026-07-10')], [], [],
      [mouvement({ rapprocheAvec: 'r1' }), mouvement({ id: 'mvt-2' })]
    );
    expect(p).toBe('derive');
  });

  // Un relevé qui n'a QUE des mouvements sans contrepartie, sans aucun fait
  // par ailleurs, est tout de même rapproché : rien n'y attend de décision.
  it('« rapproche » même sans fait, si le relevé est entièrement classé', () => {
    expect(provenanceSolde(AVANT_TOUT, [], [], [], [mouvement({ sansContrepartie: 'autre' })]))
      .toBe('rapproche');
  });

  // Une recette antérieure ou égale à la date du solde de départ ne doit pas
  // faire dire « derive » : elle ne contribue à rien, la provenance doit donc
  // rester « saisi » — sans quoi l'écran afficherait une confiance que le
  // calcul ne tient pas.
  it('reste « saisi » quand la seule recette existante est antérieure à la date du solde', () => {
    expect(
      provenanceSolde(dateISO('2026-08-22'), [recette('r1', 4000, '2026-08-21')], [], [], [])
    ).toBe('saisi');
  });

  /**
   * L'ÉTAT D'ABSTENTION, DISTINCT DE « derive » ET DE « saisi ».
   *
   * Sans date, la provenance doit le dire explicitement plutôt que de se
   * confondre avec l'un des trois autres états — c'est ce qui permet à
   * l'écran d'inviter à dater le solde. Vrai même quand des faits existent :
   * l'abstention porte sur le CALCUL, pas sur l'absence de données.
   */
  it('« sansDate » quand la date du solde de départ est inconnue, faits ou pas', () => {
    expect(provenanceSolde(null, [], [], [], [])).toBe('sansDate');
    expect(provenanceSolde(null, [recette('r1', 4000, '2026-07-10')], [], [], []))
      .toBe('sansDate');
  });
});
