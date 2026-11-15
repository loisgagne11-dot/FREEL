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
import { motifRefusFaits } from './schema';

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
  return motifRefusFaits(brut) ?? motifRefusValeurs(brut);
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
