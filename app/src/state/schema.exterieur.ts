/**
 * Le contrôle de ce qui vient d'AILLEURS (lot 59, constat S8) : à part de
 * `schema.ts`, parce qu'il n'a rien à faire dans le paquet de premier rendu.
 *
 * Il ne sert qu'au moment d'adopter un bloc venu d'un fichier, du compte ou
 * de l'ancienne version — jamais au démarrage, qui relit le dossier local
 * (voir pourquoi ci-dessous). Rangé dans `schema.ts`, il faisait passer
 * l'entrée de 80 Ko ; le magasin le charge à la demande, comme les migrations.
 */
import { MONTANT_MAX } from '../infra/bornes';
import type { NatureDeclaration } from '../domain/calculs/declarations.declarees';
import type { PieceAFournir } from '../domain/calculs/pieces';
import { VERSION_SCHEMA, motifRefusFaits } from './schema';

/** Le dossier le plus profond (mission › entité › rythme › champ) en a six. */
const PROFONDEUR_MAX = 16;
/** Aucune version n'a écrit ces clés ; un `Object.assign` en ferait un prototype. */
const CLES_INTERDITES: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Le contrôle de ce qui vient d'AILLEURS : un fichier, le compte, l'ancienne
 * version (lot 59, constat S8). La forme d'abord (`motifRefusFaits`), puis
 * chaque valeur, à n'importe quelle profondeur.
 *
 * Le contrôle de forme ne descend pas dans chaque champ ; un fichier fabriqué
 * pouvait donc entrer avec `"montant": 1e309` — que `JSON.parse` lit comme
 * l'infini : chaque total devenait « ∞ € » ou `NaN`, enregistré, et rouvert
 * tel quel à chaque démarrage. Une clé `__proto__` n'a pas d'effet tant que
 * rien ne la recopie par affectation ; on ne parie pas sur ce « tant que ».
 *
 * PAS au chargement local : un montant démesuré saisi par erreur ferait
 * refuser tout le dossier au démarrage suivant, et l'application s'ouvrirait
 * vide sur des données intactes. Ce qui vient d'ailleurs, en revanche, ne
 * remplace rien tant qu'il n'est pas accepté — et le refus dit quel champ.
 */
export function motifRefusExterieur(brut: unknown): string | null {
  return motifRefusFaits(brut) ?? motifRefusChampsDuSchema25(brut) ?? motifRefusChampsDuSchema26(brut)
    ?? motifRefusValeurs(brut);
}

/*
 * Les listes exhaustives tirées des types : le compilateur refuse une nature
 * ou une sorte oubliée ici, et une nature retirée du type ne peut pas y
 * survivre. Ce n'est pas une seconde source, c'est la première, relue.
 */
const NATURES_DECLARATION: Readonly<Record<NatureDeclaration, RegExp>> = {
  urssaf: /^\d{4}-\d{2}$/u,
  des: /^\d{4}-\d{2}$/u,
  ca3: /^\d{4}-(\d{2}|T[1-4])$/u,
  ca12: /^\d{4}$/u,
  revenus: /^\d{4}$/u,
  cfe_1447c: /^\d{4}$/u
};
const SORTES_PIECE: Readonly<Record<PieceAFournir['sorte'], true>> = {
  vigilance: true, rc_pro: true, sirene: true, autre: true
};
const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const FORME_PERIODE_URSSAF = /^\d{4}-(\d{2}|T[1-4])$/u;
const FORME_MOIS = /^\d{4}-(0[1-9]|1[0-2])$/u;

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const dateOuNul = (v: unknown): boolean => v === null || (typeof v === 'string' && FORME_DATE.test(v));
const elements = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : []);

/**
 * La valeur des champs apparus au schéma 25, quand un bloc vient d'ailleurs.
 *
 * Chacun commande une date ou un montant affiché : une période déclarée d'une
 * nature inconnue, ou d'une forme qu'aucun mois n'a, ne serait jamais
 * retrouvée — la DES déposée resterait en retard, la période URSSAF
 * redeviendrait due ; un appel lié à `42` ne réglerait aucune période, et son
 * « payée le » disparaîtrait ; une pièce sans date lisible ferait lever
 * l'écran qui la compare à aujourd'hui.
 *
 * Absents, ces champs sont légitimes avant le schéma 25 : la migration les
 * comble. Présents, ils sont contrôlés QUELLE QUE SOIT la version annoncée —
 * un fichier fabriqué peut se dire au schéma 24 et les porter quand même, et
 * la fusion de surface les recopierait. Seules les périodes déclarées
 * dépendent de la version : avant le schéma 25, elles ont une autre forme, et
 * c'est la migration qui écarte une nature inconnue.
 */
function motifRefusChampsDuSchema25(brut: unknown): string | null {
  if (!estObjet(brut)) return null;

  const declarees = brut['version'] === VERSION_SCHEMA ? elements(brut['periodesDeclarees']) : [];
  for (const [i, p] of declarees.entries()) {
    const forme = estObjet(p) && typeof p['nature'] === 'string'
      && Object.hasOwn(NATURES_DECLARATION, p['nature'])
      ? NATURES_DECLARATION[p['nature'] as NatureDeclaration]
      : null;
    if (forme === null || !estObjet(p) || typeof p['periode'] !== 'string'
      || !forme.test(p['periode']) || !dateOuNul(p['declareeLe'])) {
      return `La période déclarée n° ${i + 1} n’a pas une nature, une période et une date `
        + 'lisibles : rien n’a été chargé.';
    }
  }

  for (const [i, e] of elements(brut['echeances']).entries()) {
    const periode = estObjet(e) ? e['periode'] : undefined;
    if (periode !== undefined && periode !== null
      && (typeof periode !== 'string' || !FORME_PERIODE_URSSAF.test(periode))) {
      return `L’échéance n° ${i + 1} est rattachée à une période illisible : rien n’a été chargé.`;
    }
  }

  for (const [i, p] of elements(brut['pieces']).entries()) {
    if (!estObjet(p) || typeof p['id'] !== 'string' || typeof p['libelle'] !== 'string'
      || typeof p['sorte'] !== 'string' || !Object.hasOwn(SORTES_PIECE, p['sorte'])
      || !dateOuNul(p['obtenueLe']) || !dateOuNul(p['valableJusquau'])
      || typeof p['provisoire'] !== 'boolean') {
      return `La pièce à fournir n° ${i + 1} est illisible : rien n’a été chargé.`;
    }
  }

  const entreprise = brut['entreprise'];
  if (estObjet(entreprise)) {
    const regime = entreprise['regimeTva'];
    if (regime !== undefined && regime !== 'simplifie' && regime !== 'reel_normal') {
      return 'Le champ « entreprise.regimeTva » devrait être « simplifie » ou « reel_normal ».';
    }
    const mensuelle = entreprise['ca3Mensuelle'];
    if (mensuelle !== undefined && typeof mensuelle !== 'boolean') {
      return 'Le champ « entreprise.ca3Mensuelle » devrait être vrai ou faux.';
    }
    const nom = entreprise['nomExploitant'];
    if (nom !== undefined && typeof nom !== 'string') {
      return 'Le champ « entreprise.nomExploitant » devrait être un texte.';
    }
  }
  return null;
}

/**
 * Les champs apparus au schéma 26, contrôlés comme ceux du 25 : quelle que
 * soit la version annoncée. Une caisse inconnue se lirait « SSI » sans un
 * mot — un affilié Cipav cotiserait au mauvais taux sans l'avoir choisi.
 *
 * L'histoire de l'option se lit par une recherche de la première période qui
 * couvre un mois : une liste qui n'en est pas une ferait lever chaque écran qui
 * calcule un impôt, une période sans mois lisible couvrirait des mois au
 * hasard, et deux périodes dans le désordre laisseraient la première masquer
 * la seconde — une année passée sous versement libératoire redeviendrait
 * imposée au barème.
 */
function motifRefusChampsDuSchema26(brut: unknown): string | null {
  const entreprise = estObjet(brut) ? brut['entreprise'] : undefined;
  if (!estObjet(entreprise)) return null;
  const caisse = entreprise['caisseRetraite'];
  if (caisse !== undefined && caisse !== 'ssi' && caisse !== 'cipav') {
    return 'Le champ « entreprise.caisseRetraite » devrait être « ssi » ou « cipav ».';
  }
  const historique = entreprise['historiqueVl'];
  if (historique === undefined) return null;
  const lisible = Array.isArray(historique) && historique.every((p, i) =>
    estObjet(p) && typeof p['jusquA'] === 'string' && FORME_MOIS.test(p['jusquA'])
    && typeof p['actif'] === 'boolean'
    && (i === 0 || String((historique[i - 1] as Record<string, unknown>)['jusquA']) < p['jusquA']));
  return lisible ? null
    : 'Le champ « entreprise.historiqueVl » devrait être une liste de périodes datées, dans l’ordre : '
      + 'rien n’a été chargé.';
}

/**
 * Le parcours est itératif et borné en profondeur : récursif, un fichier de
 * cent mille crochets imbriqués aurait épuisé la pile au lieu d'être refusé.
 */
function motifRefusValeurs(racine: unknown): string | null {
  const pile: (readonly [unknown, string, number])[] = [[racine, '', 0]];
  const sous = (chemin: string, pas: string): string => (chemin === '' ? pas : `${chemin} › ${pas}`);
  while (pile.length > 0) {
    const [v, chemin, profondeur] = pile.pop()!;
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || Math.abs(v) > MONTANT_MAX) {
        return `Le champ « ${chemin} » porte un nombre hors de portée (infini ou démesuré), `
          + 'qu’aucune saisie ne produit : rien n’a été chargé.';
      }
      continue;
    }
    if (typeof v !== 'object' || v === null) continue;
    if (profondeur >= PROFONDEUR_MAX) {
      return 'Ce bloc est imbriqué bien plus profondément qu’un dossier : rien n’a été chargé.';
    }
    if (Array.isArray(v)) {
      v.forEach((e, i) => { pile.push([e, sous(chemin, `n° ${i + 1}`), profondeur + 1]); });
      continue;
    }
    for (const cle of Object.keys(v)) {
      if (CLES_INTERDITES.has(cle)) {
        return `Ce bloc contient une clé « ${cle} »${chemin === '' ? '' : ` (dans « ${chemin} »)`}, `
          + 'qu’aucune version de l’application n’écrit : il a été fabriqué ou abîmé. Rien n’a été chargé.';
      }
      pile.push([(v as Record<string, unknown>)[cle], sous(chemin, cle), profondeur + 1]);
    }
  }
  return null;
}
