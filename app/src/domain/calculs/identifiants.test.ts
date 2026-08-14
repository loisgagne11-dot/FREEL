import { describe, expect, it } from 'vitest';
import { controlerIban, controlerSiret, formaterIban } from './identifiants';

/**
 * DEUX FAUTES DE FRAPPE QUI COÛTENT CHER, ET QUI SE DÉTECTENT HORS LIGNE.
 *
 * Un IBAN faux : la facture part, le virement échoue, on l'apprend en relançant
 * des semaines plus tard. Un SIRET faux : c'est une mention obligatoire, et un
 * numéro erroné vaut mention absente — 15 € par mention et par facture.
 *
 * Les deux portent une clé de contrôle. S'en priver, c'est laisser passer une
 * erreur que trente lignes de code attrapent.
 */
describe('SIRET', () => {
  // Un SIRET réel et public : celui de l'INSEE, qui publie le répertoire.
  it('accepte un SIRET dont la clé tombe juste', () => {
    expect(controlerSiret('12000101100010').statut).toBe('plausible');
  });

  it('tolère les espaces de mise en forme', () => {
    expect(controlerSiret('120 001 011 00010').statut).toBe('plausible');
  });

  /** Le cas courant : deux chiffres inversés. Luhn l'attrape. */
  it('repère une inversion de chiffres', () => {
    const r = controlerSiret('12000101100001');
    expect(r.statut).toBe('suspect');
    if (r.statut === 'suspect') expect(r.motif).toMatch(/clé de contrôle/);
  });

  /**
   * L'erreur la plus fréquente n'est pas une faute de frappe : c'est de donner
   * son SIREN. Le message doit le dire, sinon on cherche une coquille qui
   * n'existe pas.
   */
  it('reconnaît un SIREN donné à la place d’un SIRET', () => {
    const r = controlerSiret('120001011');
    expect(r.statut).toBe('suspect');
    if (r.statut === 'suspect') expect(r.motif).toMatch(/SIREN/);
  });

  it('refuse ce qui n’est pas numérique', () => {
    const r = controlerSiret('1200010110001A');
    expect(r.statut).toBe('suspect');
    if (r.statut === 'suspect') expect(r.motif).toMatch(/que des chiffres/);
  });

  /**
   * Une absence n'est pas une erreur : c'est le champ pas encore rempli. Les
   * confondre afficherait un avertissement rouge sur un formulaire vierge, et
   * on cesserait de le lire.
   */
  it('distingue l’absence de l’erreur', () => {
    expect(controlerSiret('').statut).toBe('absent');
    expect(controlerSiret('   ').statut).toBe('absent');
  });

  /**
   * La Poste est le seul établissement dont les SIRET ne suivent pas Luhn :
   * chez elle, la somme des chiffres doit être un multiple de 5. Un
   * micro-entrepreneur n'est jamais La Poste, mais l'exception coûte trois
   * lignes et évite un avertissement inexplicable.
   *
   * Le numéro ci-dessous est CONSTRUIT pour démontrer la règle, pas relevé
   * d'un établissement réel : sa somme vaut 15, et il échoue à Luhn. S'il
   * passe, c'est donc bien par la branche La Poste et par aucune autre —
   * une valeur qui passerait Luhn ne prouverait rien.
   */
  it('connaît l’exception de La Poste', () => {
    expect(controlerSiret('35600000000001').statut).toBe('plausible');
    // Le même numéro sous un autre SIREN reste suspect : c'est l'exception
    // qui l'a sauvé, pas une indulgence générale.
    expect(controlerSiret('35700000000001').statut).toBe('suspect');
  });
});

/**
 * AUCUN IBAN FRANÇAIS VALIDE N'EST ÉCRIT DANS CE DÉPÔT, Y COMPRIS ICI.
 *
 * `tests/smoke-test.js` interdit toute donnée bancaire en clair, et il a raison
 * de ne pas négocier : « une donnée bancaire ne devient pas inoffensive parce
 * qu'elle change de place dans la syntaxe ». Un fichier de test n'est pas une
 * exception — c'est justement là qu'une vraie valeur se glisse sans être vue.
 *
 * La contrainte ne coûte rien à la couverture : **la clé mod-97 ne dépend pas
 * du pays.** Les deux IBAN valides ci-dessous, polonais et maltais, éprouvent
 * exactement le même calcul. Le français ne sert qu'aux règles qui, elles, lui
 * sont propres — sa longueur — et il est alors manifestement factice.
 */
describe('IBAN', () => {
  // Publiés comme exemples, hors de toute portée personnelle.
  const PL_VALIDE = 'PL61109010140000071219812874';
  const MT_VALIDE = 'MT84MALT011000012345MTLCAST001S';

  it('accepte un IBAN dont la clé tombe juste', () => {
    expect(controlerIban(PL_VALIDE).statut).toBe('plausible');
    expect(controlerIban(MT_VALIDE).statut).toBe('plausible');
  });

  it('tolère les espaces, comme on le recopie d’un relevé', () => {
    expect(controlerIban('PL61 1090 1014 0000 0712 1981 2874').statut).toBe('plausible');
  });

  it('repère un caractère erroné', () => {
    const r = controlerIban('PL61109010140000071219812875');
    expect(r.statut).toBe('suspect');
    if (r.statut === 'suspect') expect(r.motif).toMatch(/clé de contrôle/);
  });

  /**
   * Un IBAN français fait 27 caractères : un de moins se dit avant la clé, et
   * le message doit nommer la longueur attendue — « clé invalide » enverrait
   * chercher une coquille là où il manque un groupe entier.
   */
  it('connaît la longueur attendue par pays', () => {
    const r = controlerIban('FR00 0000 0000 0000 0000 000');
    expect(r.statut).toBe('suspect');
    if (r.statut === 'suspect') expect(r.motif).toMatch(/27 caractères/);
  });

  it('refuse une forme qui n’est pas un IBAN', () => {
    const r = controlerIban('0004101005050001302606');
    expect(r.statut).toBe('suspect');
    if (r.statut === 'suspect') expect(r.motif).toMatch(/deux lettres de pays/);
  });

  it('distingue l’absence de l’erreur', () => {
    expect(controlerIban('').statut).toBe('absent');
  });

  /**
   * LE PIÈGE ARITHMÉTIQUE. Un IBAN converti en nombre dépasse largement les
   * entiers exacts de JavaScript : construire la chaîne entière puis appeler
   * `Number` donnerait un modulo faux SANS lever d'erreur. La réduction se fait
   * donc au fil de la lecture — et ces deux-là le prouvent, à 28 et 31
   * caractères.
   */
  it('reste exact sur un IBAN long', () => {
    expect(controlerIban(PL_VALIDE).statut).toBe('plausible');
    expect(controlerIban(MT_VALIDE).statut).toBe('plausible');
  });

  // Malte n'est pas dans la table des longueurs : un pays absent n'est pas
  // refusé, il passe au seul contrôle de clé plutôt que d'être rejeté sur une
  // donnée de référence qu'on n'a pas.
  it('n’écarte pas un pays absent de la liste des longueurs', () => {
    expect(controlerIban(MT_VALIDE).statut).toBe('plausible');
  });
});

/**
 * Un IBAN de vingt-sept caractères d'un seul tenant ne se relit pas — et c'est
 * groupé par quatre qu'il figure sur les relevés, donc groupé par quatre que le
 * client le comparera au sien.
 */
describe('mise en forme', () => {
  it('groupe par quatre', () => {
    expect(formaterIban('PL61109010140000071219812874'))
      .toBe('PL61 1090 1014 0000 0712 1981 2874');
  });

  // Recopié d'un relevé, un IBAN arrive déjà espacé — et rarement bien.
  it('reformate proprement une saisie déjà espacée', () => {
    expect(formaterIban('pl61 1090  1014')).toBe('PL61 1090 1014');
  });

  // Un groupe final incomplet ne doit pas traîner d'espace : il serait recopié.
  it('ne laisse pas d’espace en fin de chaîne', () => {
    expect(formaterIban('MT84MALT011000012345MTLCAST001S').endsWith(' ')).toBe(false);
  });
});
