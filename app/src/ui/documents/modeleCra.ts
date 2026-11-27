import type { SemaineCra, SyntheseCra, VolumeClient } from '../../domain/calculs/cra';
import type { Entreprise } from '../../state/schema';
import { moisLong } from '../format';

/**
 * Le compte rendu d'activité, une fois pour toutes : ce qu'il DIT, sans la
 * façon de le dessiner.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODÈLE, ET NON DEUX RENDUS QUI CALCULENT CHACUN LEUR TEXTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le CRA sort sous deux formes : l'aperçu HTML (qu'on imprime) et le fichier
 * PDF. Si chacune formatait ses jours, ses plages et ses phrases, la première
 * retouche n'en toucherait qu'une — « 4,5 j » ici, « 4.5 j » là, une note
 * « sans lieu » oubliée dans le fichier —, et le client signerait un papier
 * que l'utilisateur n'a pas relu à l'écran. Tout le texte se décide donc ICI,
 * déjà formaté ; `DocumentCra` et `craPdf` ne font que le placer.
 *
 * Les décisions de fond restent celles du document (voir `DocumentCra`) :
 * aucun montant, et les colonnes de lieu seulement quand le mois en sait
 * quelque chose.
 */

/** Une colonne du tableau, et si elle aligne des nombres à droite. */
export interface ColonneCra {
  readonly intitule: string;
  readonly nombre: boolean;
}

/** Le volume d'un client, prêt à lire. */
export interface LigneVolumeCra {
  readonly client: string;
  /** `null` quand le document ne porte pas les colonnes de lieu. */
  readonly teletravail: string | null;
  readonly surSite: string | null;
  readonly total: string;
  /**
   * « dont 0,5 j sans lieu » — À CÔTÉ du total, jamais à sa place : le total,
   * lui, est certain. `null` quand tout est réparti, ou quand rien ne l'est
   * (les colonnes ont alors disparu, et la phrase n'aurait rien à nuancer).
   */
  readonly sansLieu: string | null;
}

export interface SemaineDuCra {
  /** Le lundi : clé stable, de la note de tâches comme de l'élément React. */
  readonly cle: string;
  readonly libelle: string;
  readonly plage: string;
  readonly total: string;
  readonly volumes: readonly LigneVolumeCra[];
  /** « Tâches — … », ou `null` quand la semaine n'a pas de phrase. */
  readonly taches: string | null;
}

/** Un morceau de paragraphe : le gras se dit, il ne se devine pas. */
export interface SegmentCra {
  readonly texte: string;
  readonly fort: boolean;
}

export interface ModeleCra {
  /** Le nom du document : étiquette de l'aperçu, titre du PDF. */
  readonly titre: string;
  /** Ce dont le nom du fichier se compose, à nettoyer par `nomDeFichier`. */
  readonly morceauxDuNom: readonly string[];
  /** Le nom de l'entreprise ; `fin` est le mot qui passe en italique vert. */
  readonly marque: { readonly debut: string; readonly fin: string | null };
  /** Les lignes de l'émetteur, dans l'ordre : adresse, localité, SIRET. */
  readonly emetteur: readonly string[];
  readonly intitule: string;
  readonly periode: string;
  readonly sousTitre: string;
  readonly destinataire: string;
  readonly lieuConnu: boolean;
  readonly colonnes: readonly ColonneCra[];
  readonly semaines: readonly SemaineDuCra[];
  /** Les totaux du mois par client — seulement s'il y en a plusieurs. */
  readonly totaux: { readonly titre: string; readonly lignes: readonly LigneVolumeCra[] } | null;
  readonly grandTotal: { readonly libelle: string; readonly valeur: string };
  readonly note: readonly SegmentCra[];
  readonly signatures: readonly [string, string];
}

/** Une quotité lisible : « 4,5 j » et jamais « 4.5 j ». */
export const enJours = (n: number): string =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n)} j`;

/** Le jour et le mois d'une date ISO : « 04 juin ». */
function jourEtMois(date: string): string {
  const mois = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`));
  return `${date.slice(8, 10)} ${mois}`;
}

/**
 * La plage d'une semaine : « 01 → 05 juin », ou le seul jour travaillé.
 *
 * Exportée, et lue AUSSI par la colonne de saisie du générateur. Elle y était
 * réécrite en deux lignes, et rendait « 13 → 13 » là où le document disait
 * « 13 juillet » — deux formulations pour une même semaine, sur le même écran.
 */
export function plageDeSemaine(s: SemaineCra, avecMois = true): string {
  const fin = avecMois ? jourEtMois(s.dernierJour) : s.dernierJour.slice(8, 10);
  return s.premierJour === s.dernierJour
    ? (avecMois ? jourEtMois(s.premierJour) : s.premierJour.slice(8, 10))
    : `${s.premierJour.slice(8, 10)} → ${fin}`;
}

/**
 * Le nom de l'entreprise, dont le dernier mot passe en italique vert.
 *
 * C'est le traitement du handoff — « Atelier <i>L.</i> ». Un nom d'un seul mot
 * reste entier : le couper produirait une initiale isolée qui n'est pas un nom.
 */
function marque(nom: string): ModeleCra['marque'] {
  const mots = nom.trim().split(/\s+/);
  if (mots.length < 2) return { debut: nom, fin: null };
  return { debut: mots.slice(0, -1).join(' '), fin: mots[mots.length - 1] as string };
}

function ligneVolume(v: VolumeClient, lieuConnu: boolean): LigneVolumeCra {
  return {
    client: v.client,
    teletravail: lieuConnu ? enJours(v.teletravail) : null,
    surSite: lieuConnu ? enJours(v.surSite) : null,
    total: enJours(v.total),
    sansLieu: lieuConnu && v.nonPrecise > 0 ? `dont ${enJours(v.nonPrecise)} sans lieu` : null
  };
}

export function modeleDuCra(
  synthese: SyntheseCra,
  entreprise: Entreprise,
  /** Le client qui signe, ou `null` pour le document tous clients. */
  destinataire: string | null,
  /** La phrase de tâches d'une semaine, par lundi. */
  taches: Readonly<Record<string, string>>
): ModeleCra {
  const periode = moisLong(synthese.mois);
  // Ce que le mois sait vraiment du lieu : c'est ce qui décide d'afficher les
  // colonnes ou de s'en abstenir (voir l'en-tête de `DocumentCra`).
  const lieuConnu = synthese.parClient.some((v) => v.teletravail > 0 || v.surSite > 0);
  const lieuIncomplet = synthese.parClient.some((v) => v.nonPrecise > 0);

  /* La localité reste une ligne même vide : c'est ce que l'aperçu a toujours
     rendu, et le modèle ne doit pas changer le papier en changeant de forme. */
  const emetteur = [
    ...(entreprise.adresse !== '' ? [entreprise.adresse] : []),
    [entreprise.codePostal, entreprise.ville].filter((x) => x !== '').join(' '),
    ...(entreprise.siret !== '' ? [`SIRET ${entreprise.siret}`] : [])
  ];

  return {
    titre: `Compte-rendu d’activité — ${periode}${destinataire === null ? '' : ` — ${destinataire}`}`,
    morceauxDuNom: ['CRA', synthese.mois, destinataire ?? 'tous-clients'],
    marque: marque(entreprise.nom),
    emetteur,
    intitule: 'Compte-rendu d’activité',
    periode,
    sousTitre: 'Synthèse hebdomadaire',
    destinataire: destinataire ?? 'Tous clients',
    lieuConnu,
    colonnes: [
      { intitule: 'Semaine', nombre: false },
      { intitule: 'Client', nombre: false },
      ...(lieuConnu
        ? [{ intitule: 'Télétrav.', nombre: true }, { intitule: 'Sur site', nombre: true }]
        : []),
      { intitule: 'Total', nombre: true }
    ],
    semaines: synthese.semaines.map((s) => {
      const phrase = taches[s.lundi] ?? '';
      return {
        cle: s.lundi,
        libelle: `Semaine ${s.rang}`,
        plage: plageDeSemaine(s),
        total: enJours(s.total),
        volumes: s.volumes.map((v) => ligneVolume(v, lieuConnu)),
        taches: phrase !== '' ? `Tâches — ${phrase}` : null
      };
    }),
    totaux: synthese.parClient.length > 1
      ? {
        titre: 'Totaux du mois par client',
        lignes: synthese.parClient.map((v) => ligneVolume(v, lieuConnu))
      }
      : null,
    grandTotal: { libelle: `Grand total · ${periode}`, valeur: enJours(synthese.total) },
    note: [
      { texte: 'Suivi d’activité uniquement — ', fort: false },
      { texte: 'aucun montant', fort: true },
      { texte: ' : la facturation se fait depuis les factures.', fort: false },
      ...(lieuIncomplet
        ? [{
          texte: ' Certaines journées n’ont pas de lieu renseigné ; elles comptent dans le total sans être réparties.',
          fort: false
        }]
        : [])
    ],
    signatures: ['Validé par le prestataire', `Bon pour accord — ${destinataire ?? 'client(s)'}`]
  };
}
