import { useEffect, useState } from 'react';
import type { Lieu, Portee } from '../../domain/calculs/planning';
import { useFaits } from '../../state/store';
import type { Mission } from '../../state/schema';
import { type Application, type Pinceau, aucunChangement } from '../../state/pinceau';
import type { Affectation } from '../components/EditeurDemiJournee';
import { Info } from '../components/Info';
import styles from './Activite.pinceau.module.css';

/**
 * La barre de pinceaux, au-dessus du calendrier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CHOISIR UNE FOIS, POSER PARTOUT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Demandée par le propriétaire le 22/11 (voir l'en-tête de `state/pinceau`).
 * Une puce par mission en cours, plus « Congé », « Libre » et « Effacer » ;
 * à côté, la portée et le lieu. Aucun pinceau choisi : la grille se comporte
 * comme avant, le clic ouvre l'éditeur — rien n'a changé pour qui ne s'en
 * sert pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CHARGÉE À LA DEMANDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le fragment de l'écran Activité est à 36 / 40 Ko, et l'entrée à 79,87 / 80 :
 * la barre, ses messages et son Ctrl+Z vivent ici, et arrivent au repos avec
 * l'écran. Le geste sur la grille, lui, est dans l'écran (`Activite.geste`) :
 * il doit répondre au premier clic.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CHAQUE GESTE S'ANNULE, EN UNE FOIS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un glissé sur deux semaines change vingt demi-journées d'un coup : le
 * message le dit, et « Annuler » — ou Ctrl+Z — les rétablit toutes ensemble.
 * Sans ce filet, le geste qui fait gagner le plus de clics serait aussi celui
 * qu'on hésite le plus à faire.
 */

/** Ce que la barre dit du dernier geste. */
export type RetourDuGeste =
  | { readonly id: number; readonly pinceau: Pinceau; readonly application: Application }
  | { readonly id: number; readonly annules: number };

/** Combien de temps le message reste. Ctrl+Z, lui, reste valable après. */
const DUREE_DU_MESSAGE = 8000;

const NOM_PORTEE: Readonly<Record<Portee, string>> = {
  journee: 'Journée', matin: 'Matin', apresMidi: 'Après-midi'
};
const NOM_LIEU: Readonly<Record<Lieu, string>> = { teletravail: 'télétravail', sur_site: 'sur site' };

/**
 * Le lieu « par défaut » d'un client : le dernier qu'on a saisi pour lui.
 *
 * Ni la mission ni le client ne portent de lieu au schéma, et en ajouter un
 * stockerait une préférence qu'on peut DÉDUIRE de ce qui a été déclaré. La
 * déduction se trompe moins : un client chez qui l'on va le mardi depuis
 * trois mois le dit par ses journées. Sans journée documentée, aucun lieu :
 * l'inventer remplirait la part de télétravail de journées que personne n'a
 * déclarées.
 */
function lieuHabituel(e: Mission['entites'][number]): Lieu | null {
  let quand = '';
  let lieu: Lieu | null = null;
  for (const [date, a] of Object.entries(e.ajustements)) {
    if (a.lieu !== undefined && date > quand) { quand = date; lieu = a.lieu; }
  }
  return lieu;
}

export function BarrePinceaux({
  affectations, pinceau, onPinceau, portee, onPortee, vue, onRaccourci,
  retour, peutAnnuler, onAnnuler
}: {
  /** Les missions en cours, celles que l'éditeur propose aussi. */
  readonly affectations: readonly Affectation[];
  readonly pinceau: Pinceau | null;
  readonly onPinceau: (p: Pinceau | null) => void;
  readonly portee: Portee;
  readonly onPortee: (p: Portee) => void;
  readonly vue: 'mois' | 'semaine';
  readonly onRaccourci: () => void;
  readonly retour: RetourDuGeste | null;
  readonly peutAnnuler: boolean;
  readonly onAnnuler: () => void;
}) {
  const missions = useFaits((e) => e.faits.missions);
  const [masque, setMasque] = useState<number | null>(null);

  const puces = affectations.map((a) => {
    const m = missions.find((x) => x.id === a.missionId);
    const e = m?.entites.find((x) => x.id === a.entiteId);
    return {
      ...a,
      // Le nom du client, comme la grille l'écrit ; le libellé de la mission
      // reste dans l'infobulle.
      nom: e !== undefined && e.nom !== '' ? e.nom : (m?.clientNom ?? a.libelle),
      lieu: e === undefined ? null : lieuHabituel(e)
    };
  });
  // Deux missions chez le même client : le nom seul ne les distinguerait plus.
  const nomDe = (p: (typeof puces)[number]): string =>
    puces.filter((q) => q.nom === p.nom).length > 1 ? p.libelle : p.nom;

  const choisi = (p: Pinceau): boolean => pinceau !== null && pinceau.type === p.type
    && (p.type !== 'travail' || (pinceau.type === 'travail'
      && pinceau.missionId === p.missionId && pinceau.entiteId === p.entiteId));
  // Un second appui sur le pinceau en main le repose : la grille rouvre alors
  // l'éditeur au clic, comme avant.
  const basculer = (p: Pinceau): void => onPinceau(choisi(p) ? null : p);

  useEffect(() => {
    if (retour === null) return undefined;
    const minuteur = window.setTimeout(() => setMasque(retour.id), DUREE_DU_MESSAGE);
    return () => window.clearTimeout(minuteur);
  }, [retour]);

  /*
   * Ctrl+Z (⌘Z) défait le dernier geste du planning — pas la frappe d'un champ
   * (le navigateur s'en charge), ni ce qui se passe dans un panneau ouvert par
   * dessus la grille.
   */
  useEffect(() => {
    if (!peutAnnuler) return undefined;
    const ecouter = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
      const cible = e.target instanceof Element ? e.target : null;
      if (cible?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') != null) return;
      e.preventDefault();
      onAnnuler();
    };
    document.addEventListener('keydown', ecouter);
    return () => document.removeEventListener('keydown', ecouter);
  }, [peutAnnuler, onAnnuler]);

  const visible = retour !== null && masque !== retour.id;
  const nomDuPinceau = (p: Pinceau): string => {
    if (p.type !== 'travail') return '';
    const puce = puces.find((q) => q.missionId === p.missionId && q.entiteId === p.entiteId);
    return puce === undefined ? 'la mission' : nomDe(puce);
  };

  return (
    <div className={styles.barre}>
      <div className={styles.ligne}>
        <span className={styles.etiquette} aria-hidden="true">Pinceau</span>
        <div className={styles.puces} role="group" aria-label="Pinceau">
          {puces.map((p) => {
            const cible: Pinceau = { type: 'travail', missionId: p.missionId, entiteId: p.entiteId, lieu: p.lieu };
            return (
              <button
                key={`${p.missionId}·${p.entiteId}`}
                type="button"
                className={`${styles.puce} ${choisi(cible) ? styles.puceActive : ''}`}
                aria-pressed={choisi(cible)}
                title={p.libelle}
                onClick={() => basculer(cible)}
              >
                <span
                  className={styles.pastille}
                  {...(p.couleur !== '' ? { style: { background: p.couleur } } : {})}
                  aria-hidden="true"
                />
                {/* « Pinceau » est dit, pas montré : l'étiquette le montre
                    déjà, et sans lui « Congé » ou « ClientA » se confondraient,
                    pour un lecteur d'écran, avec les boutons de l'éditeur. */}
                <span className={styles.invisible}>Pinceau</span>{' '}
                {nomDe(p)}
                {p.lieu !== null && <span className={styles.lieu}>, {NOM_LIEU[p.lieu]}</span>}
              </button>
            );
          })}
          {(['conge', 'libre', 'effacer'] as const).map((type) => (
            <button
              key={type}
              type="button"
              className={`${styles.puce} ${choisi({ type }) ? styles.puceActive : ''}`}
              aria-pressed={choisi({ type })}
              onClick={() => basculer({ type })}
            >
              <span className={`${styles.pastille} ${styles[type] ?? ''}`} aria-hidden="true" />
              <span className={styles.invisible}>Pinceau</span>{' '}
              {type === 'conge' ? 'Congé' : type === 'libre' ? 'Libre' : 'Effacer'}
            </button>
          ))}
        </div>
        <Info libelle="Comment poser au pinceau">
          Choisis ce que tu poses, puis touche un jour&nbsp;: il le reçoit, même
          un samedi ou un férié. Glisse pour une plage — au téléphone, appuie
          un instant avant de glisser, pour ne pas confondre avec le
          défilement&nbsp;; Maj + clic pose du dernier jour touché à
          celui-ci. Une plage saute les week-ends, les fériés et les congés
          déjà posés. Au clavier&nbsp;: flèches, Maj + flèches pour étendre,
          Entrée pour poser. Le double-clic (au téléphone, l’appui long sans
          glisser) ouvre le détail d’une demi-journée. «&nbsp;Effacer&nbsp;»
          rend les journées au rythme&nbsp;; un congé se retire avec
          «&nbsp;Libre&nbsp;».
        </Info>
      </div>

      {pinceau !== null && (
        <div className={styles.ligne}>
          {pinceau.type === 'effacer'
            ? <p className={styles.note}>Effacer agit sur la journée entière.</p>
            : (
              <div className={styles.segments} role="group" aria-label="Portée du pinceau">
                {(['journee', 'matin', 'apresMidi'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`${styles.segment} ${portee === p ? styles.segmentActif : ''}`}
                    aria-pressed={portee === p}
                    onClick={() => onPortee(p)}
                  >
                    {NOM_PORTEE[p]}
                  </button>
                ))}
              </div>
            )}

          {/* « Non précisé » est une réponse : la part de télétravail ne se
              calcule que sur les demi-journées documentées. */}
          {pinceau.type === 'travail' && (
            <div className={styles.segments} role="group" aria-label="Lieu du pinceau">
              {([['teletravail', 'Télétravail'], ['sur_site', 'Sur site'], [null, 'Non précisé']] as const)
                .map(([l, nom]) => (
                  <button
                    key={nom}
                    type="button"
                    className={`${styles.segment} ${pinceau.lieu === l ? styles.segmentActif : ''}`}
                    aria-pressed={pinceau.lieu === l}
                    onClick={() => onPinceau({ ...pinceau, lieu: l })}
                  >
                    {nom}
                  </button>
                ))}
            </div>
          )}

          <button type="button" className={styles.raccourci} onClick={onRaccourci}>
            {vue === 'semaine' ? 'Toute la semaine' : 'Jours ouvrés du mois'}
          </button>
        </div>
      )}

      {/* Toujours dans le document, vide entre deux gestes : une région
          annoncée doit exister AVANT que son texte change, sinon le lecteur
          d'écran ne dit rien. */}
      <p className={styles.retour} role="status">
        {visible && (
          <>
            {'annules' in retour ? phraseDAnnulation(retour.annules) : phrase(retour, nomDuPinceau)}
            {'application' in retour && peutAnnuler && !aucunChangement(retour.application.changements) && (
              <button type="button" className={styles.annuler} onClick={onAnnuler}>Annuler</button>
            )}
          </>
        )}
      </p>
    </div>
  );
}

const pluriel = (n: number, mot: string): string => `${n} ${mot}${n > 1 ? 's' : ''}`;

function phraseDAnnulation(rendus: number): string {
  return rendus === 0
    ? 'Rien à annuler : ces journées ont été réécrites depuis.'
    : 'Annulé : les journées sont revenues à leur état d’avant.';
}

/**
 * Ce que le geste a fait, en une phrase — et ce qu'il a sauté.
 *
 * « Sautés » se dit toujours : un glissé du lundi au lundi qui ne pose que
 * quatre jours, sans dire que le jeudi était l'Ascension, ferait croire à un
 * geste raté et le ferait recommencer à la main.
 */
function phrase(
  retour: Extract<RetourDuGeste, { readonly application: Application }>,
  nomDuPinceau: (p: Pinceau) => string
): string {
  const { application: a, pinceau: p } = retour;
  const n = a.demiJournees;
  const posees = `${pluriel(n, 'demi-journée')} ${n > 1 ? 'posées' : 'posée'}`;
  const tete = a.jours.length === 0
    ? 'Rien de posé'
    : aucunChangement(a.changements)
      ? (p.type === 'effacer'
        ? 'Rien à effacer : ces journées suivent déjà le rythme'
        : 'Rien à changer : ces journées portaient déjà ce pinceau')
      : p.type === 'effacer'
        ? `${pluriel(a.jours.length, 'journée')} ${a.jours.length > 1 ? 'rendues' : 'rendue'} au rythme`
        : p.type === 'conge'
          ? `${posees} en congé`
          : p.type === 'libre'
            ? `${pluriel(n, 'demi-journée')} ${n > 1 ? 'libérées' : 'libérée'}`
            : `${posees} pour ${nomDuPinceau(p)}`;
  if (a.sautes.length === 0) return `${tete}.`;

  const combien = (motif: string): number => a.sautes.filter((s) => s.motif === motif).length;
  const parts = [
    combien('weekEnd') > 0 ? `${pluriel(combien('weekEnd'), 'jour')} de week-end` : '',
    ...a.sautes.filter((s) => s.motif === 'ferie').map((s) => s.ferie?.nom ?? 'un férié'),
    combien('conge') > 0 ? `${pluriel(combien('conge'), 'jour')} de congé` : '',
    combien('arret') > 0 ? `${pluriel(combien('arret'), 'jour')} après l’arrêt du client` : ''
  ].filter((x) => x !== '');
  return `${tete} · ${a.sautes.length > 1 ? 'sautés' : 'sauté'} : ${parts.join(', ')}.`;
}
