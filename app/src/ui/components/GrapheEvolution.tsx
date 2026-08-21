import { useId } from 'react';
import { Montant } from './Montant';
import styles from './GrapheEvolution.module.css';

/**
 * Entrées, sorties et courbe, sur un même repère.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SEUL GRAPHE ET NON TROIS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La question n'est pas « combien rentre » ni « combien sort », c'est
 * « est-ce que ça tient ». Elle ne se répond qu'en voyant les trois ensemble :
 * un mois qui encaisse 8 000 € et en sort 9 000 € est un mauvais mois, et deux
 * graphes côte à côte laissent faire la soustraction de tête, douze fois.
 *
 * D'où la forme du dessin, reprise ici : la courbe en haut porte le niveau, les
 * barres en bas portent le mouvement autour d'un zéro, et le net est écrit sous
 * chaque mois. On lit la pente, puis on descend voir quel mois l'explique.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA COURBE EST LE DISPONIBLE, PAS LE SOLDE — ET LA CARTE LE DIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le dessin trace un solde. L'application s'y refuse, et c'est un arbitrage
 * ancien : projeter le solde obligerait à deviner QUAND chaque dette sortira du
 * compte, et la moitié d'entre elles n'a pas encore de date — rien ne les a
 * appelées. Une courbe de solde monte joliment jusqu'au trimestre où elle
 * s'effondre, et c'est exactement la courbe qui fait se verser de l'argent
 * qu'on doit.
 *
 * Le composant ne tranche pas : il trace la série qu'on lui donne et affiche le
 * nom qu'on lui passe. C'est l'appelant qui doit dire ce qu'il trace.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE TRACÉ EST UNE IMAGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `aria-hidden` sur le SVG et sur les barres, et chaque mois porte ses trois
 * montants en texte : l'entrée au-dessus de la barre, la sortie en dessous, le
 * niveau tout en haut de la colonne. Un graphe dont l'information n'existe
 * qu'en pixels est inaccessible ; ici la donnée est lisible sans lui.
 *
 * Ça n'a pas toujours été le cas : entrées et sorties ont d'abord vécu dans un
 * `<span>` hors écran, que le vérificateur de confidentialité a signalé comme
 * un montant nu échappant au floutage — puis, pour le faire taire, dans un
 * `aria-label` sur les barres, qui rend le montant inaccessible à l'ŒIL plutôt
 * qu'inaccessible AU FLOUTAGE. Le bon correctif était le troisième : un texte
 * visible, passé par `<Montant>` comme les deux autres séries, qui satisfait
 * l'œil et le floutage à la fois.
 */

export interface MoisEvolution {
  readonly mois: string;
  /** Abrégé de trois lettres pour l'axe — « JUIN », « AOÛT ». */
  readonly libelle: string;
  readonly entrees: number;
  /** Positif : c'est un montant qui SORT, pas une valeur négative. */
  readonly sorties: number;
  /** Le niveau à la fin de ce mois — ce que la courbe trace. */
  readonly niveau: number;
}

const HAUTEUR_COURBE = 96;
const HAUTEUR_BARRES = 64;

export function GrapheEvolution(
  { mois, seuil, libelleNiveau, formater, formaterCourt, indexCourant = -1 }: {
    readonly mois: readonly MoisEvolution[];
    /** Le plancher tracé en pointillés, ou `null` s'il n'y en a pas. */
    readonly seuil: number | null;
    /** Ce que la courbe représente. Entre dans la légende et le nom accessible. */
    readonly libelleNiveau: string;
    readonly formater: (valeur: number) => string;
    /**
     * Format abrégé, pour les douze étiquettes de colonne.
     *
     * Douze montants en euros pleins sur la largeur d'une carte se touchent :
     * « 11 328 € » fait huit caractères, et il y en a douze côte à côte. Le
     * dessin abrège en k€ au-dessus des colonnes et garde les euros pleins dans
     * la phrase, qui a la place. Même partage ici.
     */
    readonly formaterCourt: (valeur: number) => string;
    /** Le mois à mettre en évidence, ou −1. */
    readonly indexCourant?: number;
  }
) {
  const idTitre = useId();
  if (mois.length === 0) {
    return <p className={styles.vide}>Rien à projeter&nbsp;: aucun encaissement attendu.</p>;
  }

  /*
   * L'échelle de la courbe part de ZÉRO, et non du minimum observé.
   *
   * Une échelle qui commence au minimum transforme une variation de 3 % en
   * falaise. Sur une trésorerie, c'est la pire des exagérations : elle fait
   * paniquer sur un mois ordinaire, puis cesse d'être crue quand la falaise
   * est réelle. Le zéro est gardé, et le seuil est tracé à sa vraie hauteur.
   */
  const niveaux = mois.map((m) => m.niveau);
  const hautNiveau = Math.max(1, ...niveaux, seuil ?? 0);
  const basNiveau = Math.min(0, ...niveaux);
  const amplitude = Math.max(1, hautNiveau - basNiveau);
  const y = (v: number): number =>
    HAUTEUR_COURBE - ((v - basNiveau) / amplitude) * HAUTEUR_COURBE;
  const x = (i: number): number => ((i + 0.5) / mois.length) * 100;

  const points = mois.map((m, i) => `${x(i)},${y(m.niveau)}`).join(' ');
  const aire = `${x(0)},${HAUTEUR_COURBE} ${points} ${x(mois.length - 1)},${HAUTEUR_COURBE}`;

  const mouvementMax = Math.max(1, ...mois.flatMap((m) => [m.entrees, m.sorties]));

  return (
    <figure className={styles.figure} aria-labelledby={idTitre}>
      <figcaption className={styles.horsEcran} id={idTitre}>
        {libelleNiveau}, entrées et sorties, mois par mois
      </figcaption>

      <div className={styles.legende} aria-hidden="true">
        <span className={styles.entreeLegende}>
          <span className={styles.traitNiveau} />{libelleNiveau}
        </span>
        <span className={styles.entreeLegende}>
          <span className={styles.pastilleEntrees} />entrées
        </span>
        <span className={styles.entreeLegende}>
          <span className={styles.pastilleSorties} />sorties
        </span>
      </div>

      {/* `preserveAspectRatio="none"` : le repère s'étire en largeur sans
          grandir en hauteur, donc le graphe ne pousse jamais la page en
          portrait. Même arbitrage que `GrapheBarres`, et pour la même raison. */}
      <svg
        className={styles.courbe}
        viewBox={`0 0 100 ${HAUTEUR_COURBE}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <polygon points={aire} className={styles.aire} />
        <polyline points={points} className={styles.ligne} vectorEffect="non-scaling-stroke" />
        {seuil !== null && (
          <line
            x1="0" x2="100" y1={y(seuil)} y2={y(seuil)}
            className={styles.seuil} vectorEffect="non-scaling-stroke"
          />
        )}
        {mois.map((m, i) => (
          <circle key={m.mois} cx={x(i)} cy={y(m.niveau)} r="1.6" className={styles.point} />
        ))}
      </svg>

      {seuil !== null && (
        <p className={styles.libelleSeuil}>
          <span className={styles.traitSeuil} aria-hidden="true" />
          seuil <Montant>{formater(seuil)}</Montant>
        </p>
      )}

      <div className={styles.colonnes}>
        {mois.map((m, i) => {
          const net = m.entrees - m.sorties;
          return (
            <div
              key={m.mois}
              className={`${styles.colonne} ${i === indexCourant ? styles.colonneCourante : ''}`}
            >
              <span className={styles.valeurNiveau}>
                <Montant>{formaterCourt(m.niveau)}</Montant>
              </span>
              {/* L'entrée colle au sommet de sa barre, la sortie au pied de la
                  sienne : chaque chiffre reste soudé au trait qu'il légende, au
                  lieu de forcer un aller-retour de l'œil entre un nombre et une
                  barre parmi douze. */}
              <span className={styles.valeurEntree}>
                +<Montant>{formaterCourt(m.entrees)}</Montant>
              </span>
              {/* Les barres elles-mêmes restent décoratives : le pixel n'ajoute
                  rien que les deux montants qui l'encadrent ne disent déjà. */}
              <span className={styles.barres} aria-hidden="true">
                <span
                  className={styles.barreEntrees}
                  style={{ height: `${(m.entrees / mouvementMax) * HAUTEUR_BARRES}px` }}
                />
                <span
                  className={styles.barreSorties}
                  style={{ height: `${(m.sorties / mouvementMax) * HAUTEUR_BARRES}px` }}
                />
              </span>
              <span className={styles.valeurSortie}>
                −<Montant>{formaterCourt(m.sorties)}</Montant>
              </span>
              <span className={styles.axeMois}>{m.libelle}</span>
              {/* Le net sous le mois : c'est lui qui explique la pente du
                  segment juste au-dessus, et il évite la soustraction de tête
                  que deux barres imposeraient. */}
              <span className={net < 0 ? styles.netNegatif : styles.netPositif}>
                {net >= 0 ? '+' : '−'}<Montant>{formaterCourt(Math.abs(net))}</Montant>
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
