/**
 * Ce que le calendrier `.ics` contient : les obligations des douze mois à
 * venir, les fins de mission, les pièces qui expirent. Chargé à la demande —
 * avec le bouton « Ajouter à mon calendrier » d'Obligations.
 *
 * Décisions du propriétaire du 17/11 (décision 25) : les montants estimés y
 * sont, marqués « ≈ » ; aucun nom de client ; un rappel trois jours avant.
 */

import { type DateISO, type Resolution, type Euros } from '../domain/types';
import { decaler } from '../domain/calculs/calendrier';
import { type EvenementIcs, calendrierIcs } from '../domain/calculs/calendrierIcs';
import type { Etape, Obligation } from '../domain/calculs/obligations';
import type { PieceAFournir } from '../domain/calculs/pieces';
import type { Faits } from './schema';
import { obligationsEntre } from './selecteurs.obligations';

/** Trois jours : décision du propriétaire du 17/11. */
export const RAPPEL_JOURS_ICS = 3;

/** Douze mois devant soi : au-delà, une date d'aujourd'hui a toutes les chances d'avoir changé. */
const HORIZON_JOURS = 365;

/**
 * Un identifiant d'événement STABLE et MUET : condensé de l'identifiant de
 * l'obligation. Un identifiant de mission ou de pièce vient parfois d'un
 * fichier importé — il pourrait porter un nom ; un agenda le synchronise chez
 * un tiers. Deux condensés FNV-1a de 32 bits, pour que deux obligations ne
 * se confondent pas.
 */
export function uidMuet(id: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193) >>> 0;
  }
  return `freel-${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

/** Le nom d'une pièce, sans son libellé saisi — qui nomme parfois le client qui la demande. */
const NOM_DE_PIECE: Readonly<Record<PieceAFournir['sorte'], string>> = {
  vigilance: 'Attestation de vigilance URSSAF',
  rc_pro: 'Responsabilité civile professionnelle',
  sirene: 'Avis de situation SIRENE',
  autre: 'Pièce à fournir'
};

const euro = (n: number): string =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)} €`;

/** « ≈ 1 970 € » pour une estimation, « 1 970 € » pour un montant saisi ; rien sinon. */
function montantLisible(m: Resolution<Euros> | null): string | null {
  if (m === null || m.statut === 'refuse' || m.valeur <= 0) return null;
  return m.statut === 'hypothese' ? `≈ ${euro(m.valeur)}` : euro(m.valeur);
}

/** L'étape qui attend encore quelque chose, dans l'ordre du cycle. */
function etapeAVenir(o: Obligation): Etape | undefined {
  return [o.declaration, o.paiement, o.formalite]
    .find((e): e is Etape => e !== undefined && (e.etat === 'a_venir' || e.etat === 'a_faire'));
}

/**
 * Les événements du calendrier, au jour `aujourdhui`.
 *
 * Seules entrent les obligations à venir dont le JOUR est connu : une CA3
 * sans nom d'exploitant, une déclaration de revenus d'une année non publiée
 * n'ont pas de jour, et un jour inventé dans un agenda serait pris pour vrai.
 * Une date calculée le dit.
 */
export function evenementsDuCalendrier(faits: Faits, aujourdhui: DateISO): readonly EvenementIcs[] {
  const jusquA = decaler(aujourdhui, HORIZON_JOURS);
  const pieces = new Map(faits.pieces.map((p) => [p.id, p]));
  const evenements: EvenementIcs[] = [];

  for (const o of obligationsEntre(faits, aujourdhui, jusquA, aujourdhui)) {
    const e = etapeAVenir(o);
    if (e === undefined || e.limite.statut === 'refuse') continue;
    const date = e.limite.valeur;
    if (date < aujourdhui || date > jusquA) continue;
    const piece = o.dossier === 'piece' ? pieces.get(o.periode) : undefined;
    const nom = piece === undefined ? o.libelle : NOM_DE_PIECE[piece.sorte];
    const montant = montantLisible(o.montant);
    const calculee = e.limite.statut === 'hypothese' && !/date calculée/u.test(o.detail);
    evenements.push({
      uid: uidMuet(o.id),
      date,
      titre: montant === null ? nom : `${nom} · ${montant}`,
      description: [
        piece === undefined ? o.detail : 'Fin de validité : à renouveler avant que le client la réclame.',
        calculee ? `Date calculée — ${e.limite.source}.` : ''
      ].filter((t) => t !== '').join(' '),
      rappelJours: RAPPEL_JOURS_ICS
    });
  }

  for (const m of faits.missions) {
    if (m.fin === null || m.fin < aujourdhui || m.fin > jusquA) continue;
    evenements.push({
      uid: uidMuet(`mission:${m.id}:${m.fin}`),
      date: m.fin,
      // Ni client ni description : un agenda se synchronise chez un tiers.
      titre: 'Fin de mission',
      description: 'Une mission se termine : sa dernière facture et son compte rendu sont à préparer.',
      rappelJours: RAPPEL_JOURS_ICS
    });
  }

  return evenements.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid));
}

/** Le fichier `.ics`, prêt à télécharger. */
export function calendrierDesObligations(faits: Faits, maintenant: Date, aujourdhui: DateISO): string {
  return calendrierIcs(evenementsDuCalendrier(faits, aujourdhui), maintenant);
}
