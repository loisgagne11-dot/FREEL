import { describe, expect, it } from 'vitest';
import { VERSION_SCHEMA, faitsVides, type Faits } from './schema';
import { type Constat, deciderSynchro, memesFaits, natureLocale, schemaDuCompte } from './synchro.regle';
import type { InstantaneDistant } from '../infra/supabase';

/*
 * La règle de la synchronisation automatique, case par case. Chaque test dit
 * ce que l'appareil fait SEUL, sans qu'on lui demande rien : c'est là qu'une
 * erreur coûte le plus, puisque personne ne regarde.
 */

const AVEC_DONNEES: Faits = {
  ...faitsVides(),
  entreprise: { ...faitsVides().entreprise, nom: 'Atelier Exemple' },
  clients: [{ id: 'c1', nom: 'Client exemple' }] as never
};

const DEMONSTRATION: Faits = {
  ...AVEC_DONNEES,
  entreprise: { ...AVEC_DONNEES.entreprise, nom: 'Atelier de démonstration', siret: '000 000 000 00000' }
};

const compte = (version: number, faits: unknown = AVEC_DONNEES, schema: number = VERSION_SCHEMA): InstantaneDistant => ({
  faits: JSON.parse(JSON.stringify(faits)), version, schema, majLe: '2026-11-22T08:41:00.000Z'
});

/** Un appareil synchronisé à la version 3, qui n'a rien changé, face à un compte à la version 3. */
const constat = (modif: Partial<Constat> = {}): Constat => ({
  base: { version: 3 },
  distant: compte(3),
  modifie: false,
  local: 'donnees',
  identiques: false,
  schemaConnu: VERSION_SCHEMA,
  ...modif
});

describe('la règle de synchronisation automatique', () => {
  /**
   * LA PREMIÈRE LIAISON RESTE À L'UTILISATEUR. Sans base, rien ne dit de quel
   * côté on a changé : envoyer ce qu'on trouve ici effaçait un compte depuis
   * un appareil neuf, et prendre le compte effaçait une saisie faite avant de
   * se relier. Si la règle sautait, la première ouverture déciderait seule.
   */
  it('un appareil qui n’a jamais synchronisé ne fait rien tout seul, même modifié', () => {
    expect(deciderSynchro(constat({ base: null, modifie: true }))).toEqual({ action: 'rien', pourquoi: 'jamais-synchronise' });
    expect(deciderSynchro(constat({ base: null, distant: compte(5) }))).toEqual({ action: 'rien', pourquoi: 'jamais-synchronise' });
  });

  // Rien n'a bougé nulle part : aucune écriture, sinon chaque ouverture
  // remplirait les vingt états précédents du serveur de copies identiques.
  it('rien de changé de part et d’autre : rien à faire', () => {
    expect(deciderSynchro(constat())).toEqual({ action: 'rien', pourquoi: 'a-jour' });
  });

  /** LE CAS DU PROPRIÉTAIRE : modifié au téléphone, l'ordinateur s'ouvre et le prend. */
  it('le compte a avancé, cet appareil n’a rien changé : il prend le compte', () => {
    expect(deciderSynchro(constat({ distant: compte(4) }))).toEqual({ action: 'prendre' });
  });

  // Et l'autre sens : sans lui, chaque modification resterait sur l'appareil
  // qui l'a faite jusqu'à un « Enregistrer » manuel.
  it('cet appareil a changé, le compte n’a pas bougé : il envoie', () => {
    expect(deciderSynchro(constat({ modifie: true }))).toEqual({ action: 'envoyer' });
  });

  /**
   * AUCUNE FUSION SILENCIEUSE. Les deux côtés ont changé depuis la dernière
   * synchronisation : garder l'un efface l'autre. Si la règle sautait, l'un
   * des deux appareils perdrait sa saisie sans que personne le voie.
   */
  it('les deux côtés ont changé : FREEL demande, il ne choisit pas', () => {
    expect(deciderSynchro(constat({ modifie: true, distant: compte(4) })))
      .toEqual({ action: 'a-choisir', pourquoi: 'les-deux-ont-change' });
  });

  /**
   * UN ENVOI RÉUSSI DONT LA RÉPONSE S'EST PERDUE. Le compte a avancé, cet
   * appareil se croit modifié, et les deux disent la même chose. Le présenter
   * comme un conflit ferait choisir entre deux états identiques — et
   * apprendrait que « à choisir » se clique sans lire.
   */
  it('les deux ont avancé vers la même chose : on aligne, sans conflit', () => {
    expect(deciderSynchro(constat({ modifie: true, distant: compte(4), identiques: true }))).toEqual({ action: 'aligner' });
    expect(deciderSynchro(constat({ distant: compte(4), identiques: true }))).toEqual({ action: 'aligner' });
    expect(deciderSynchro(constat({ identiques: true }))).toEqual({ action: 'rien', pourquoi: 'a-jour' });
  });

  /**
   * UN COMPTE PLUS RÉCENT NE SE RABOTE PAS (invariant n°5). Ni pris — il
   * perdrait ce que cette version ne lit pas —, ni écrasé. Même sans
   * modification d'ici : « prendre » serait déjà raboter.
   */
  it('un compte écrit par une version plus récente est refusé, dans les deux sens', () => {
    expect(deciderSynchro(constat({ distant: compte(4, AVEC_DONNEES, VERSION_SCHEMA + 1) })))
      .toEqual({ action: 'refuser', schema: VERSION_SCHEMA + 1 });
    expect(deciderSynchro(constat({ modifie: true, distant: compte(3, AVEC_DONNEES, VERSION_SCHEMA + 1) })))
      .toEqual({ action: 'refuser', schema: VERSION_SCHEMA + 1 });
  });

  // La colonne `schema` peut mentir dans un sens : le bloc lui-même porte sa version.
  it('le schéma du compte est le plus grand de la colonne et du bloc', () => {
    const bloc = { ...JSON.parse(JSON.stringify(AVEC_DONNEES)), version: VERSION_SCHEMA + 2 };
    expect(schemaDuCompte(compte(4, bloc, VERSION_SCHEMA))).toBe(VERSION_SCHEMA + 2);
    expect(deciderSynchro(constat({ distant: compte(4, bloc, VERSION_SCHEMA) })).action).toBe('refuser');
  });

  /**
   * EFFACÉ AILLEURS. « Effacer la copie de cette version » a été demandé
   * depuis un autre appareil : renvoyer d'ici défairait un effacement voulu —
   * le droit à l'effacement, annulé par un téléphone resté dans un tiroir.
   */
  it('le compte n’a plus de ligne alors que cet appareil l’a vue : on le dit, on n’envoie rien', () => {
    expect(deciderSynchro(constat({ distant: null, modifie: true })))
      .toEqual({ action: 'anomalie', pourquoi: 'compte-efface' });
    expect(deciderSynchro(constat({ distant: null }))).toEqual({ action: 'anomalie', pourquoi: 'compte-efface' });
  });

  // Le serveur n'accepte que n → n + 1 : un compteur qui recule n'est plus la
  // suite de ce qu'on a vu. Envoyer par-dessus serait parier sur ce qu'il porte.
  it('une version du compte inférieure à la base est une anomalie, pas un envoi', () => {
    expect(deciderSynchro(constat({ distant: compte(2), modifie: true })))
      .toEqual({ action: 'anomalie', pourquoi: 'version-anterieure' });
    expect(deciderSynchro(constat({ distant: compte(1) })))
      .toEqual({ action: 'anomalie', pourquoi: 'version-anterieure' });
  });

  // Ce qui vient du réseau est hostile : un bloc abîmé ne s'adopte pas, même
  // quand le compteur dit qu'il est plus récent.
  it('un compte illisible n’est ni pris ni écrasé automatiquement', () => {
    const abime = { ...JSON.parse(JSON.stringify(AVEC_DONNEES)), recettes: 'pas une liste' };
    expect(deciderSynchro(constat({ distant: compte(4, abime) })))
      .toEqual({ action: 'anomalie', pourquoi: 'compte-illisible' });
    expect(deciderSynchro(constat({ distant: compte(3, abime), modifie: true })))
      .toEqual({ action: 'anomalie', pourquoi: 'compte-illisible' });
  });

  /**
   * « REPARTIR DE ZÉRO » PROMET DE NE PAS TOUCHER AU COMPTE. L'appareil vidé
   * est « modifié » ; l'envoyer effacerait le compte — le serveur l'accepterait,
   * la version est la bonne. C'est l'intention qui se demande.
   */
  it('un appareil vidé ne vide pas le compte tout seul : il demande', () => {
    expect(deciderSynchro(constat({ modifie: true, local: 'vide' })))
      .toEqual({ action: 'a-choisir', pourquoi: 'appareil-vide' });
  });

  // Le garde-fou est étroit : un vide sur un compte lui-même vide n'efface rien.
  it('un appareil vide sur un compte vide envoie sans rien demander', () => {
    expect(deciderSynchro(constat({ modifie: true, local: 'vide', distant: compte(3, faitsVides()) })))
      .toEqual({ action: 'envoyer' });
  });

  /**
   * LA DÉMONSTRATION NE PART PAS, ET NE SE REMPLACE PAS TOUTE SEULE. On la
   * charge pour montrer l'application : y faire apparaître les vrais chiffres
   * au retour sur l'onglet, ou remplir le compte de factures fictives, sont
   * les deux pires issues.
   */
  it('un appareil qui montre la démonstration n’envoie rien et ne reçoit rien', () => {
    expect(deciderSynchro(constat({ modifie: true, local: 'demonstration' })))
      .toEqual({ action: 'rien', pourquoi: 'demonstration' });
    expect(deciderSynchro(constat({ modifie: true, local: 'demonstration', distant: compte(4) })))
      .toEqual({ action: 'rien', pourquoi: 'demonstration' });
  });
});

describe('ce que la règle lit de l’appareil', () => {
  it('distingue les données, le vide et la démonstration', () => {
    expect(natureLocale(AVEC_DONNEES)).toBe('donnees');
    expect(natureLocale(faitsVides())).toBe('vide');
    expect(natureLocale(DEMONSTRATION)).toBe('demonstration');
  });

  // Un profil rempli sans client n'est pas « vide » : l'envoyer ne détruit rien.
  it('un profil seul compte comme des données', () => {
    const profil: Faits = { ...faitsVides(), entreprise: { ...faitsVides().entreprise, nom: 'Atelier Exemple' } };
    expect(natureLocale(profil)).toBe('donnees');
  });

  // Le compte range ses clés à sa façon (`jsonb`) : comparées telles quelles,
  // les mêmes données se liraient différentes, et tout deviendrait conflit.
  it('les mêmes faits, rangés autrement par le compte, sont les mêmes', () => {
    const range = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(AVEC_DONNEES))).reverse());
    expect(memesFaits(AVEC_DONNEES, compte(4, range))).toBe(true);
    expect(memesFaits(AVEC_DONNEES, compte(4, faitsVides()))).toBe(false);
    expect(memesFaits(AVEC_DONNEES, null)).toBe(false);
  });
});
