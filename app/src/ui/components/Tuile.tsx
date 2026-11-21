import type { ReactNode } from 'react';
import { cheminMonotone } from './courbe';
import styles from './Tuile.module.css';

/**
 * La tuile à tendance de la planche (`e-tile`) : une étiquette, un nombre, une
 * phrase qui l'explique, et la forme de son année à droite.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CONSTRUITE À SON PREMIER USAGE, COMMUNE DÈS LE PREMIER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La planche l'a dessinée au lot 51 ; elle a attendu un écran qui en ait
 * besoin (Activité › Missions, lot 48), et le Pilote la reprendra au lot 52.
 * Un composant écrit pour un écran se recopie au second, et les deux copies
 * divergent au premier réglage — d'où le composant, et non trois blocs de
 * style dans l'onglet.
 *
 * La courbe est décorative (`aria-hidden`) : ses nombres existent ailleurs en
 * texte — la rangée des jours signés, l'occupation du mois. Une courbe sans
 * axe ne se lit pas au lecteur d'écran, et la décrire point par point
 * doublerait ce que la page dit déjà.
 */
export function Tuile(
  { etiquette, valeur, explication, tendance, teinte = 'vert', pastille }: {
    readonly etiquette: string;
    readonly valeur: ReactNode;
    readonly explication: ReactNode;
    /** La série, du plus ancien au plus récent ; `null` : pas de point ce mois-là. */
    readonly tendance?: readonly (number | null)[];
    /** `urssaf` : la teinte du carnet dans la maquette ; `vert` : celle de l'occupation. */
    readonly teinte?: 'vert' | 'urssaf';
    /** Une pastille d'état à la place de la courbe (« ◇ À préparer »). */
    readonly pastille?: ReactNode;
  }
) {
  return (
    /* Un groupe et non une région : trois tuiles en tête d'écran feraient
       trois repères de navigation pour trois nombres. */
    <div className={styles.tuile} role="group" aria-label={etiquette}>
      <div className={styles.texte}>
        <div className={styles.etiquette} aria-hidden="true">{etiquette}</div>
        <div className={styles.valeur}>{valeur}</div>
        <p className={styles.explication}>{explication}</p>
      </div>
      {tendance !== undefined && <Tendance serie={tendance} teinte={teinte} />}
      {pastille !== undefined && <div className={styles.pastille}>{pastille}</div>}
    </div>
  );
}

const LARGEUR = 120;
const HAUT = 6;
const BAS = 30;

/** La courbe : sans axe, lissée sans dépasser ses points, le dernier marqué. */
function Tendance({ serie, teinte }: { readonly serie: readonly (number | null)[]; readonly teinte: 'vert' | 'urssaf' }) {
  const connus = serie.filter((v): v is number => v !== null);
  if (connus.length < 2) return null;
  const min = Math.min(...connus);
  const max = Math.max(...connus);
  const pas = (LARGEUR - 8) / Math.max(serie.length - 1, 1);
  // Une série plate se dessine au milieu : en haut, elle dirait un maximum.
  const y = (v: number): number => (max === min ? (HAUT + BAS) / 2 : BAS - ((v - min) / (max - min)) * (BAS - HAUT));
  const points = serie.flatMap((v, i) => (v === null ? [] : [{ x: 4 + i * pas, y: y(v) }]));
  const dernier = points[points.length - 1] as { x: number; y: number };
  return (
    <svg className={`${styles.courbe} ${teinte === 'urssaf' ? styles.urssaf : styles.vert}`}
      viewBox={`0 0 ${LARGEUR} 36`} aria-hidden="true" focusable="false">
      <path className={styles.trait} d={cheminMonotone(points)} pathLength={1} />
      <circle className={styles.point} cx={dernier.x} cy={dernier.y} r={3.5} />
    </svg>
  );
}
