import { describe, expect, it } from 'vitest';
import { faitsVides, type Faits } from './schema';
import { completerFaitsCourants } from './schema';
import { empreinte } from './synchro.empreinte';

const AVEC_DONNEES: Faits = {
  ...faitsVides(),
  entreprise: { ...faitsVides().entreprise, nom: 'Atelier Exemple' },
  clients: [{ id: 'c1', nom: 'Client exemple' }] as never
};

describe('l’empreinte des faits', () => {
  /**
   * C'EST ELLE QUI DIT « MODIFIÉ ». Si une simple relecture du disque la
   * changeait, chaque rechargement de page passerait pour une modification :
   * envoi inutile, puis faux conflit sur l'autre appareil s'il a changé aussi.
   */
  it('ne change pas quand les faits sont relus depuis le disque', () => {
    const relus = completerFaitsCourants(JSON.parse(JSON.stringify(AVEC_DONNEES)) as Record<string, unknown>);
    expect(empreinte(relus)).toBe(empreinte(AVEC_DONNEES));
  });

  it('ne dépend pas de l’ordre des clés', () => {
    const range = Object.fromEntries(Object.entries(AVEC_DONNEES).reverse());
    expect(empreinte(range)).toBe(empreinte(AVEC_DONNEES));
  });

  // Le contraire du premier test : une modification qui ne changerait pas
  // l'empreinte ne partirait jamais, et serait écrasée au prochain « prendre ».
  it('change au moindre fait modifié', () => {
    const renomme: Faits = { ...AVEC_DONNEES, clients: [{ id: 'c1', nom: 'Client exemplE' }] as never };
    expect(empreinte(renomme)).not.toBe(empreinte(AVEC_DONNEES));
    expect(empreinte({ ...AVEC_DONNEES, reserve: 1 })).not.toBe(empreinte({ ...AVEC_DONNEES, reserve: 10 }));
  });
});
