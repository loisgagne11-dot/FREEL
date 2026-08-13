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
export function VueSemaine(
  { planning, aujourdhui, onBasculer }: {
    readonly planning: PlanningSemaine;
    readonly aujourdhui: DateISO;
    /** Fait tourner la quotité du jour. */
    readonly onBasculer: (date: DateISO) => void;
  }
) {
  return (
    <>
      <div className={styles.semaine}>
        {JOURS.map((j) => (
          <div key={j} className={styles.enteteJour} aria-hidden="true">{j}</div>
        ))}

        {planning.jours.map((jour) => {
          const numero = Number(jour.date.slice(8, 10));
          const libelle = jour.parMission[0]?.libelle ?? '';
          const ajuste = jour.parMission.some((m) => m.ajuste);

          return (
            <div key={jour.date} className={styles.colonne}>
              <span
                className={`${styles.numero} ${jour.date === aujourdhui ? styles.aujourdhui : ''}`}
              >
                {numero}
              </span>

              {[0, 1].map((creneau) => {
                // Une quotité de 1 remplit les deux créneaux, 0,5 le premier.
                const rempli = jour.retenu >= (creneau === 0 ? 0.5 : 1);
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
                    onClick={() => onBasculer(jour.date)}
                  >
                    <span className={styles.invisible}>
                      {dateCourte(jour.date)}, {etatDuJour(jour)}
                    </span>
                    {rempli && (
                      <span className={styles.libelleCreneau} aria-hidden="true">{libelle}</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className={styles.total}>
        <span>Travaillé cette semaine</span>
        <strong>{formater(planning.totalRetenu)} j</strong>
      </p>
    </>
  );
}

/** L'état d'un jour, en toutes lettres, pour les lecteurs d'écran. */
function etatDuJour(jour: PlanningSemaine['jours'][number]): string {
  if (jour.ferie) return 'jour férié';
  if (jour.weekEnd && jour.retenu === 0) return 'week-end';
  if (jour.conge > 0 && jour.retenu === 0) return 'congé';
  if (jour.retenu === 0) return 'non travaillé';
  const quantite = jour.retenu === 1 ? 'journée entière' : `${formater(jour.retenu)} jour`;
  return jour.parMission.some((m) => m.ajuste) ? `${quantite}, ajusté` : quantite;
}

/** Une quotité lisible : « 4,5 » plutôt que « 4.5 ». */
const formater = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);
