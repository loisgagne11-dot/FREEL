/**
 * Contrôle des identifiants : SIRET et IBAN.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ces deux numéros ont chacun une **clé de contrôle** : une faute de frappe s'y
 * détecte sans rien interroger, hors ligne, à la saisie. Ne pas s'en servir
 * coûte cher dans les deux cas, et de deux façons différentes :
 *
 *  · **IBAN faux** — la facture part, le client tente le virement, il échoue ou
 *    part ailleurs. On l'apprend en relançant, des semaines plus tard.
 *  · **SIRET faux** — c'est une mention obligatoire de la facture. Un numéro
 *    erroné vaut mention absente, à 15 € d'amende par mention et par facture.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ON SIGNALE, ON NE BLOQUE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une clé de contrôle dit qu'un numéro est **improbable**, jamais qu'il est
 * faux — et l'inverse est encore plus vrai : elle ne prouve pas qu'un IBAN
 * juste appartient au bon compte. Bloquer une émission sur un test qui n'est
 * pas une preuve empêcherait de facturer pour une raison que l'application ne
 * peut pas garantir.
 *
 * Le contrôle a donc un statut à trois valeurs, et l'écran s'en sert pour
 * avertir sans interdire.
 */

/** Ce qu'on peut dire d'un identifiant sans rien interroger. */
export type ControleIdentifiant =
  /** Rien n'est saisi. Ce n'est pas une erreur : c'est une absence. */
  | { readonly statut: 'absent' }
  /** La clé de contrôle passe. Ne prouve pas que le numéro soit LE BON. */
  | { readonly statut: 'plausible' }
  /** La forme ou la clé ne passe pas. Presque toujours une faute de frappe. */
  | { readonly statut: 'suspect'; readonly motif: string };

/** Enlève espaces et ponctuation de mise en forme. */
const compacter = (v: string): string => v.replace(/[\s.\-]/gu, '').toUpperCase();

/**
 * Clé de Luhn, telle que l'emploient le SIREN et le SIRET.
 *
 * On double un chiffre sur deux **en partant de la droite**, on retranche 9 aux
 * résultats supérieurs à 9, et la somme doit être un multiple de 10.
 */
function luhn(chiffres: string): boolean {
  let somme = 0;
  for (let i = 0; i < chiffres.length; i++) {
    const rang = chiffres.length - 1 - i;
    const chiffre = Number(chiffres[rang]);
    if (!Number.isFinite(chiffre)) return false;
    if (i % 2 === 1) {
      const double = chiffre * 2;
      somme += double > 9 ? double - 9 : double;
    } else {
      somme += chiffre;
    }
  }
  return somme % 10 === 0;
}

/**
 * SIREN de La Poste, seul établissement dont les SIRET ne suivent pas Luhn.
 *
 * Leur règle est différente : la somme des chiffres doit être un multiple de 5.
 * Un micro-entrepreneur n'est évidemment jamais La Poste — mais coder une
 * exception connue coûte trois lignes, et l'ignorer produirait un avertissement
 * qu'on ne saurait pas expliquer le jour où il apparaît.
 */
const SIREN_LA_POSTE = '356000000';

/**
 * Contrôle un SIRET : 14 chiffres, clé de Luhn.
 *
 * Le SIRET est le SIREN (9 chiffres, l'entreprise) suivi du NIC (5 chiffres,
 * l'établissement). La clé porte sur les 14.
 */
export function controlerSiret(saisie: string): ControleIdentifiant {
  const v = compacter(saisie);
  if (v === '') return { statut: 'absent' };

  if (!/^\d+$/u.test(v)) {
    return { statut: 'suspect', motif: 'Un SIRET ne contient que des chiffres.' };
  }
  if (v.length !== 14) {
    return {
      statut: 'suspect',
      motif: v.length === 9
        ? 'Ceci est un SIREN (9 chiffres). Le SIRET en compte 14 : le SIREN suivi des '
          + '5 chiffres de l’établissement.'
        : `Un SIRET compte 14 chiffres ; celui-ci en compte ${v.length}.`
    };
  }

  const valide = v.startsWith(SIREN_LA_POSTE)
    ? [...v].reduce((t, c) => t + Number(c), 0) % 5 === 0
    : luhn(v);

  return valide
    ? { statut: 'plausible' }
    : {
      statut: 'suspect',
      motif: 'La clé de contrôle ne tombe pas juste : il y a probablement un chiffre '
        + 'erroné ou inversé.'
    };
}

/**
 * Contrôle un IBAN : forme, longueur par pays, et clé mod-97.
 *
 * Le calcul est normalisé (ISO 13616) : on place les quatre premiers caractères
 * à la fin, on remplace chaque lettre par sa position dans l'alphabet plus 9
 * (A = 10 … Z = 35), et le nombre obtenu doit valoir 1 modulo 97.
 *
 * Le nombre dépasse largement les entiers exacts de JavaScript : on réduit au
 * fil de la lecture plutôt que de le construire en entier. Un `Number` sur la
 * chaîne complète donnerait un résultat faux **sans lever d'erreur**, ce qui
 * est le pire des deux mondes pour un contrôle.
 */
export function controlerIban(saisie: string): ControleIdentifiant {
  const v = compacter(saisie);
  if (v === '') return { statut: 'absent' };

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/u.test(v)) {
    return {
      statut: 'suspect',
      motif: 'Un IBAN commence par deux lettres de pays et deux chiffres de contrôle, '
        + 'par exemple FR76.'
    };
  }
  if (v.length < 15 || v.length > 34) {
    return { statut: 'suspect', motif: 'Cet IBAN n’a pas une longueur valide.' };
  }

  const longueurAttendue = LONGUEURS_IBAN[v.slice(0, 2)];
  if (longueurAttendue !== undefined && v.length !== longueurAttendue) {
    return {
      statut: 'suspect',
      motif: `Un IBAN ${v.slice(0, 2)} compte ${longueurAttendue} caractères ; `
        + `celui-ci en compte ${v.length}.`
    };
  }

  const reordonne = v.slice(4) + v.slice(0, 4);
  let reste = 0;
  for (const caractere of reordonne) {
    const valeur = /\d/u.test(caractere)
      ? caractere
      : String(caractere.charCodeAt(0) - 55);
    for (const chiffre of valeur) reste = (reste * 10 + Number(chiffre)) % 97;
  }

  return reste === 1
    ? { statut: 'plausible' }
    : {
      statut: 'suspect',
      motif: 'La clé de contrôle ne tombe pas juste : il y a probablement un caractère '
        + 'erroné ou inversé.'
    };
}

/**
 * Longueurs d'IBAN par pays, pour les pays d'où viennent les clients d'un
 * indépendant français.
 *
 * La liste est volontairement partielle : un pays absent n'est pas refusé, il
 * passe simplement au seul contrôle de clé. Prétendre couvrir les quatre-vingts
 * pays de la zone IBAN à partir de ce fichier reviendrait à inventer des
 * données de référence — ce que le projet s'interdit ailleurs.
 */
const LONGUEURS_IBAN: Readonly<Record<string, number>> = {
  FR: 27, BE: 16, DE: 22, ES: 24, IT: 27, LU: 20, NL: 18, PT: 25,
  CH: 21, GB: 22, IE: 22, AT: 20, DK: 18, FI: 18, SE: 24, PL: 28,
  MC: 27, // Monaco partage le format français.
  NO: 15
};

/**
 * Met un IBAN en forme par groupes de quatre.
 *
 * Ce n'est pas de la coquetterie : un IBAN de vingt-sept caractères d'un seul
 * tenant ne se relit pas, et c'est ainsi qu'il figure sur les relevés — donc
 * ainsi que le client le comparera au sien.
 */
export function formaterIban(saisie: string): string {
  const v = compacter(saisie);
  return v.replace(/(.{4})/gu, '$1 ').trim();
}
