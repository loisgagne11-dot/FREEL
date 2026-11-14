/**
 * Le jeu d'essai à forme réelle, et de quoi le lire à une date donnée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN JEU DE PLUS À CÔTÉ DES FAITS MINIMAUX
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les tests construisent des faits à la main, juste assez pour exercer une
 * règle. Ils ne peuvent donc pas voir ce que seule l'INTERACTION des règles
 * produit : une TVA franchie en juin avec des factures d'avant et d'après, un
 * avoir qui tombe un trimestre après sa facture, un foyer dont la décote
 * efface l'impôt des seuls autres revenus, le 31 décembre qui change l'année
 * de l'horloge sans changer celle des encaissements. Chacun de ces défauts
 * n'a été vu que sur un compte réel ; ce jeu est fictif mais en a la forme.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DateISO, Mois } from '../domain/types';
import { type Faits } from '../state/schema';
import { completerFaits } from '../state/schema.migrations';
import type { Recette } from '../state/schema';

const CHEMIN = join(import.meta.dirname, 'jeu-d-essai.json');

/** Le jeu tel que le fichier le porte, passé par le comblement de schéma. */
export function chargerJeuBrut(): unknown {
  return JSON.parse(readFileSync(CHEMIN, 'utf8'));
}

export function chargerJeu(): Faits {
  return completerFaits(chargerJeuBrut());
}

/** Une date locale à neuf heures : l'application lit l'horloge en local. */
export function le(annee: number, mois: number, jour: number): Date {
  return new Date(annee, mois - 1, jour, 9, 0, 0);
}

export function isoDe(d: Date): DateISO {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const jj = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${jj}` as DateISO;
}

/**
 * Les faits tels qu'ils étaient CE JOUR-LÀ.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SANS CELA, CHAQUE DATE LIRAIT LE MÊME COMPTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le jeu court de 2025 à fin 2026. Interrogé au 15 mai avec tous ses faits,
 * `etatPilote` compterait les encaissements de novembre dans le solde — et les
 * six dates du test rendraient six fois le même versable, ce qui ne prouverait
 * rien sur aucune. Rien dans l'application ne tient compte de l'horloge pour
 * écarter un fait futur (un compte réel n'en contient pas), c'est donc ici
 * qu'on les retire :
 *
 *  - une facture émise après la date n'existe pas encore ;
 *  - un encaissement ou un paiement postérieur n'a pas eu lieu — la facture
 *    redevient « émise, pas réglée », elle ne disparaît pas ;
 *  - un avoir postérieur est retiré ENTIER : le laisser sans encaissement
 *    ferait passer une écriture négative pour une facture impayée ;
 *  - un appel (échéance) postérieur n'est pas encore arrivé ;
 *  - une période n'est déclarée qu'une fois son mois écoulé.
 */
export function faitsAu(faits: Faits, date: Date): Faits {
  const jour = isoDe(date);
  const moisDuJour = jour.slice(0, 7) as Mois;

  const recettes: Recette[] = faits.recettes
    .filter((r) => !(typeof r.annuleEcriture === 'string'
      && r.encaisseeLe !== null && r.encaisseeLe > jour))
    .filter((r) => r.emiseLe === null || r.emiseLe <= jour)
    .map((r) => (r.encaisseeLe !== null && r.encaisseeLe > jour
      ? { ...r, encaisseeLe: null, modeReglement: null }
      : r));

  return {
    ...faits,
    recettes,
    depenses: faits.depenses.map((d) =>
      (d.payeeLe !== null && d.payeeLe > jour ? { ...d, payeeLe: null } : d)),
    echeances: faits.echeances
      .filter((e) => e.echeanceLe <= jour)
      .map((e) => (e.payeeLe !== null && e.payeeLe > jour ? { ...e, payeeLe: null } : e)),
    mouvementsBancaires: faits.mouvementsBancaires.filter((m) => m.date <= jour),
    periodesDeclarees: faits.periodesDeclarees.filter((p) => p.mois < moisDuJour)
  };
}
