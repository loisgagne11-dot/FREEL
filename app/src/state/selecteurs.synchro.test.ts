import { describe, expect, it } from 'vitest';
import { VERSION_SCHEMA, faitsVides, type Faits } from './schema';
import { etatDeSynchronisation } from './selecteurs.synchro';

const instantane = (faits: unknown) => ({ faits, version: 3, schema: VERSION_SCHEMA, majLe: '2026-11-22T08:41:00Z' });

const AVEC_DONNEES: Faits = {
  ...faitsVides(),
  entreprise: { ...faitsVides().entreprise, nom: 'Atelier Exemple' },
  clients: [{ id: 'c1', nom: 'Client exemple' }] as never
};

/** Les mêmes faits, clés rangées dans l'autre sens — ce que fait une colonne `jsonb`. */
function rangerAutrement(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(rangerAutrement);
  if (typeof v === 'object' && v !== null) {
    return Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, rangerAutrement(x)]));
  }
  return v;
}

const DEMONSTRATION: Faits = {
  ...AVEC_DONNEES,
  entreprise: { ...AVEC_DONNEES.entreprise, nom: 'Atelier de démonstration', siret: '000 000 000 00000' }
};

describe('état de synchronisation', () => {
  // Envoyer « au cas où » sur un compte qu'on n'a pas lu peut recouvrir des données.
  it('un compte qui n’a pas pu être lu est « inconnu », jamais « à jour »', () => {
    expect(etatDeSynchronisation(AVEC_DONNEES, 'inconnu')).toBe('inconnu');
  });

  /**
   * LE COMPTE RANGE SES CLÉS. Comparés tels quels, les faits que cet appareil
   * vient d'envoyer se reliraient « diffère » à la seconde même, et la
   * pastille ne dirait jamais « à jour ».
   */
  it('les mêmes faits, rangés autrement par le compte, sont « à jour »', () => {
    const relu = rangerAutrement(JSON.parse(JSON.stringify(AVEC_DONNEES)));
    expect(etatDeSynchronisation(AVEC_DONNEES, instantane(relu))).toBe('a-jour');
  });

  it('un compte vide et un appareil qui a des données : « à envoyer »', () => {
    expect(etatDeSynchronisation(AVEC_DONNEES, null)).toBe('a-envoyer');
    expect(etatDeSynchronisation(AVEC_DONNEES, instantane({ ...faitsVides() }))).toBe('a-envoyer');
  });

  it('un appareil vide et un compte qui a des données : « à recevoir »', () => {
    expect(etatDeSynchronisation(faitsVides(), instantane(AVEC_DONNEES))).toBe('a-recevoir');
  });

  /**
   * Le jeu de démonstration n'est pas un dossier : le dire « à envoyer »
   * pousserait à écraser le compte avec des factures fictives.
   */
  it('la démonstration ne compte pas comme des données à envoyer', () => {
    expect(etatDeSynchronisation(DEMONSTRATION, null)).toBe('rien');
    expect(etatDeSynchronisation(DEMONSTRATION, instantane(AVEC_DONNEES))).toBe('a-recevoir');
  });

  // Rien ne dit lequel est le plus récent : l'heure d'un autre appareil ne tranche pas.
  it('deux côtés différents qui ont chacun des données : « diffère », le sens se choisit', () => {
    const autre = { ...AVEC_DONNEES, clients: [{ id: 'c2', nom: 'Autre client' }] };
    expect(etatDeSynchronisation(AVEC_DONNEES, instantane(autre))).toBe('differe');
  });

  it('un compte écrit par une version plus récente est « illisible » ici', () => {
    expect(etatDeSynchronisation(AVEC_DONNEES, instantane({ version: VERSION_SCHEMA + 1 }))).toBe('illisible');
  });
});
