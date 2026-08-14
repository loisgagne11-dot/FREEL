import type { PlanningSemaine } from '../../state/selecteurs.activite';
import type { DateISO } from '../../domain/types';
import { dateCourte } from '../format';
import styles from './VueSemaine.module.css';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/**
 * La vue semaine du planning — `WeekView` de la spec de design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA SEMAINE EST LA MAILLE DE LA CORRECTION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le rythme remplit le mois d'un coup ; ce qu'on corrige, on le corrige à la
 * semaine, parce que c'est l'horizon dont on se souvient. Une grille de
 * trente-et-un jours oblige à retrouver le bon — et une correction qu'on
 * renonce à faire est un CRA faux.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX CRÉNEAUX PARCE QUE LA DEMI-JOURNÉE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chaque jour porte deux créneaux : c'est la seule façon de rendre visible
 * une demi-journée, que l'ancienne application gère depuis toujours. Une
 * quotité de 1 les remplit tous les deux, 0,5 le premier. Le partage
 * matin/après-midi n'est pas un fait — l'application ne sait pas QUELLE
 * moitié a été travaillée — c'est une convention d'affichage, et l'infobulle
 * de l'écran le dit.
 *
 * Un clic fait le tour : journée → demi-journée → rien → retour au rythme.
 * « Retour au rythme » est un état distinct de « rien » : il efface
 * l'ajustement au lieu d'en poser un à zéro, et le jour redevient ce que le
 * rythme prévoit.
 */
/**
 * ─────────────────────────────────────────────────────────────────────────
 * UNE PAIRE DE CRÉNEAUX PAR CLIENT OPÉRATIONNEL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Deux donneurs d'ordre peuvent occuper la même journée — lundi chez l'un,
 * lundi après-midi chez l'autre. Une seule paire de créneaux par jour
 * obligerait à décider laquelle des deux lignes un clic corrige, et le choix
 * serait forcément arbitraire.
 *
 * Chaque ligne a donc ses propres créneaux, dans sa propre teinte. Le cas
 * ordinaire — un seul client — donne exactement l'affichage d'avant : une
 * paire, sans rien qui trahisse l'existence du concept.
 */
export function VueSemaine(
  { planning, aujourdhui, onBasculer, onRevenirAuRythme }: {
    readonly planning: PlanningSemaine;
    readonly aujourdhui: DateISO;
    /** Fait tourner la quotité d'une ligne du jour. */
    readonly onBasculer: (date: DateISO, missionId: string, entiteId: string) => void;
    /** Efface les corrections de la semaine : les journées redeviennent le rythme. */
    readonly onRevenirAuRythme: () => void;
  }
) {
  // Le bouton n'apparaît que s'il y a quelque chose à défaire. Un bouton
  // toujours là qui ne fait rien apprend à ne plus le regarder.
  const corrigee = planning.jours.some((j) => j.parMission.some((l) => l.ajuste));

  /**
   * Les jours ouvrés de la semaine affichée.
   *
   * La spec de design demande ce compte « sur la période visible (semaine ou
   * mois) ». Le mois l'avait, la semaine non — et c'est là qu'il manque le
   * plus : cinq jours ouvrés n'est pas toujours la réponse. Une semaine avec un
   * férié en compte quatre, et un taux d'occupation lu sans le savoir est faux
   * d'un cinquième.
   *
   * Les congés posés ne sont pas retirés ici : ils restent des jours OUVRÉS
   * qu'on a choisi de ne pas travailler. Les soustraire du dénominateur ferait
   * afficher 100 % d'occupation à quelqu'un en vacances.
   */
  const joursOuvres = planning.jours.filter((j) => !j.ferie && !j.weekEnd).length;

  return (
    <>
      {/* Le compte, et rien d'autre : le total retenu est déjà lisible sous la
          grille, et le répéter ici n'ajouterait qu'une occasion de diverger. */}
      <p className={styles.resumeSemaine}>
        {joursOuvres} jour{joursOuvres > 1 ? 's' : ''} ouvré{joursOuvres > 1 ? 's' : ''}
        {' cette semaine'}
      </p>

      <div className={styles.semaine}>
        {JOURS.map((j) => (
          <div key={j} className={styles.enteteJour} aria-hidden="true">{j}</div>
        ))}

        {planning.jours.map((jour) => {
          const numero = Number(jour.date.slice(8, 10));
          // Un jour sans aucune ligne garde une paire de créneaux vides : la
          // grille doit rester une grille, et c'est là qu'on clique pour
          // déclarer une journée que le rythme ne prévoyait pas.
          const lignes = jour.parMission.length > 0 ? jour.parMission : [null];

          return (
            <div key={jour.date} className={styles.colonne}>
              <span
                className={`${styles.numero} ${jour.date === aujourdhui ? styles.aujourdhui : ''}`}
              >
                {numero}
              </span>

              {lignes.map((ligne, rang) => (
                <div key={ligne?.entiteId ?? rang} className={styles.pile}>
                  {[0, 1].map((creneau) => {
                    const retenu = ligne?.retenu ?? 0;
                    // Une quotité de 1 remplit les deux créneaux, 0,5 le premier.
                    const rempli = retenu >= (creneau === 0 ? 0.5 : 1);
                    const ajuste = ligne?.ajuste ?? false;
                    const classes = [
                      styles.creneau,
                      rempli ? styles.travaille : '',
                      ajuste && rempli ? styles.ajuste : '',
                      jour.conge > 0 && !rempli ? styles.conge : '',
                      jour.ferie ? styles.ferie : '',
                      jour.weekEnd ? styles.weekEnd : ''
                    ].filter((c) => c !== '').join(' ');

                    return (
                      <button
                        key={creneau}
                        type="button"
                        className={classes}
                        // La teinte du client opérationnel prime sur celle du
                        // thème quand elle est choisie : c'est ce qui distingue
                        // deux lignes d'un coup d'œil. Absente, le thème reprend
                        // la main — une couleur oubliée ne casse rien.
                        {...(rempli && ligne !== null && ligne.couleur !== ''
                          ? { style: { background: ligne.couleur, borderColor: ligne.couleur } }
                          : {})}
                        onClick={() => onBasculer(
                          jour.date,
                          ligne?.missionId ?? '',
                          ligne?.entiteId ?? ''
                        )}
                      >
                        <span className={styles.invisible}>
                          {dateCourte(jour.date)}
                          {ligne !== null && ligne.libelle !== '' ? `, ${ligne.libelle}` : ''}
                          , {etatDeLaLigne(jour, ligne)}
                        </span>
                        {rempli && ligne !== null && (
                          <span className={styles.libelleCreneau} aria-hidden="true">
                            {ligne.libelle}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <p className={styles.total}>
        <span>Travaillé cette semaine</span>
        <strong>{formater(planning.totalRetenu)} j</strong>
      </p>

      {corrigee && (
        <button type="button" className={styles.revenir} onClick={onRevenirAuRythme}>
          Revenir au rythme sur cette semaine
        </button>
      )}
    </>
  );
}

/**
 * L'état d'une ligne, en toutes lettres, pour les lecteurs d'écran.
 *
 * La quotité annoncée est celle de la LIGNE, pas du jour : un lecteur d'écran
 * qui entendrait « journée entière » sur un créneau à moitié rempli n'aurait
 * aucun moyen de savoir laquelle des deux lignes il écoute.
 */
function etatDeLaLigne(
  jour: PlanningSemaine['jours'][number],
  ligne: PlanningSemaine['jours'][number]['parMission'][number] | null
): string {
  const retenu = ligne?.retenu ?? 0;
  if (jour.ferie) return 'jour férié';
  if (jour.weekEnd && retenu === 0) return 'week-end';
  if (jour.conge > 0 && retenu === 0) return 'congé';
  if (retenu === 0) return 'non travaillé';
  const quantite = retenu === 1 ? 'journée entière' : `${formater(retenu)} jour`;
  return ligne?.ajuste === true ? `${quantite}, ajusté` : quantite;
}

/** Une quotité lisible : « 4,5 » plutôt que « 4.5 ». */
const formater = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);
