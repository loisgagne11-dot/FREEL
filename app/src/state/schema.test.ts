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
