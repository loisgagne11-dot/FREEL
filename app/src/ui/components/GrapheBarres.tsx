import { useId } from 'react';
import styles from './GrapheBarres.module.css';

/**
 * Graphe à barres groupées, en SVG.
 *
 * Remplace Chart.js, qui pesait avec jsPDF 627 Ko bloquants et non cachables
 * dans l'ancienne version — 34 % du fichier, chargés avant le premier rendu
 * pour neuf graphiques. Ici, aucune dépendance : du SVG et des tokens.
 *
 * Le graphe n'est pas qu'une image. Un graphique dont l'information n'existe
 * que sous forme de pixels est inaccessible, et les lecteurs d'écran n'y voient
 * rien. Le SVG est donc marqué `aria-hidden`, et **la même donnée est fournie
 * en tableau**, visuellement masqué mais lisible par les technologies
 * d'assistance. Ce n'est pas une redondance : c'est la seule version que
 * certains utilisateurs pourront consulter.
 *
 * Le design veut les valeurs **au-dessus** des barres, et les montants libellés
 * en k€.
 */

export interface SerieBarres {
  readonly id: string;
  readonly libelle: string;
  /** Une valeur par catégorie, dans le même ordre que `categories`. */
  readonly valeurs: readonly number[];
  /** Token de couleur, sans le `var()`. */
  readonly token: string;
}

export interface ProprietesGrapheBarres {
  readonly titre: string;
  readonly categories: readonly string[];
  readonly series: readonly SerieBarres[];
  /** Formate une valeur pour l'affichage au-dessus des barres et en tableau. */
  readonly formater: (valeur: number) => string;
}

const HAUTEUR = 180;
const MARGE_HAUT = 22;   // place pour les valeurs au-dessus des barres
const MARGE_BAS = 22;    // place pour les libellés de catégorie
const LARGEUR_VUE = 600; // repère interne ; le SVG s'adapte par viewBox

export function GrapheBarres(
  { titre, categories, series, formater }: ProprietesGrapheBarres
) {
  const idTitre = useId();

  const toutes = series.flatMap((s) => s.valeurs);
  // Un maximum nul rendrait toutes les barres pleine hauteur : on garde 1 pour
  // que le graphe reste lisible et plat plutôt que faux.
  const maximum = Math.max(1, ...toutes);

  const hauteurTracee = HAUTEUR - MARGE_HAUT - MARGE_BAS;
  const largeurGroupe = LARGEUR_VUE / Math.max(1, categories.length);
  const largeurBarre = Math.min(28, (largeurGroupe * 0.62) / Math.max(1, series.length));
  const ecart = 3;

  /**
   * Le design veut les valeurs au-dessus des barres, et c'est juste — quand
   * elles tiennent. Sur douze mois et deux séries, cela fait vingt-quatre
   * étiquettes dans la largeur du graphe : elles se chevauchent et deviennent
   * illisibles, ce qui est pire que leur absence.
   *
   * La règle s'adapte donc à la place disponible. Quand les étiquettes ne
   * tiennent pas, seule la valeur maximale est repérée — elle donne l'échelle —
   * et le détail complet reste disponible dans le tableau.
   */
  const LARGEUR_MINI_ETIQUETTE = 22;
  const etiquettesParBarre = largeurBarre >= LARGEUR_MINI_ETIQUETTE;

  // `aria-labelledby` explicite plutôt que de compter sur le `figcaption` :
  // toutes les implémentations ne dérivent pas le nom de la figure depuis sa
  // légende, et ce nom est l'information qui dit de quoi parle le graphe.
  return (
    <figure className={styles.figure} aria-labelledby={idTitre}>
      <figcaption className={styles.titre} id={idTitre}>{titre}</figcaption>

      <div className={styles.legende}>
        {series.map((s) => (
          <span key={s.id} className={styles.entreeLegende}>
            <span
              className={styles.pastille}
              style={{ background: `var(--${s.token})` }}
              aria-hidden="true"
            />
            {s.libelle}
          </span>
        ))}
      </div>

      {/* Le tracé est décoratif : la donnée est dans le tableau ci-dessous.

          `preserveAspectRatio="none"` est délibéré, et c'est un arbitrage
          assumé : le repère s'étire en largeur sans grandir en hauteur, donc
          le graphe ne pousse jamais la page en portrait. Le laisser à sa
          valeur par défaut le ferait soit déborder, soit rétrécir jusqu'à
          l'illisible sur un téléphone — et retrouver la proportion demanderait
          de mesurer le conteneur en JavaScript, ce que cet écran s'interdit. */}
      <svg
        className={styles.trace}
        viewBox={`0 0 ${LARGEUR_VUE} ${HAUTEUR}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        {/* Ligne de base */}
        <line
          x1={0} y1={HAUTEUR - MARGE_BAS} x2={LARGEUR_VUE} y2={HAUTEUR - MARGE_BAS}
          stroke="var(--line-2)" strokeWidth={1} vectorEffect="non-scaling-stroke"
        />
        {categories.map((categorie, iCat) => {
          const centre = largeurGroupe * (iCat + 0.5);
          const largeurTotale = series.length * largeurBarre + (series.length - 1) * ecart;
          const depart = centre - largeurTotale / 2;

          /* La clé est le RANG, pas le libellé : sur douze mois, l'axe porte
             « J F M A M J J A S O N D » — deux « J », deux « M », deux « A ».
             React fusionnait alors des groupes distincts, et une barre pouvait
             en garder l'état d'une autre. Un axe se répète ; un rang, non. */
          return (
            <g key={iCat}>
              {series.map((serie, iSerie) => {
                const valeur = serie.valeurs[iCat] ?? 0;
                const hauteur = (valeur / maximum) * hauteurTracee;
                const x = depart + iSerie * (largeurBarre + ecart);
                const y = HAUTEUR - MARGE_BAS - hauteur;
                return (
                  <g key={serie.id}>
                    {/* Pas d'arrondi : le repère est étiré en largeur pour
                        tenir la hauteur fixe (voir `preserveAspectRatio`), et
                        un rayon uniforme y deviendrait un ovale, différent
                        d'une largeur d'écran à l'autre. Un angle droit est
                        franc à toutes les tailles. */}
                    <rect
                      x={x} y={y} width={largeurBarre} height={Math.max(0, hauteur)}
                      fill={`var(--${serie.token})`}
                    />
                    {/* Valeur au-dessus de la barre. Masquée quand les barres
                        sont trop serrées (voir `etiquettesParBarre`) ou la barre
                        trop basse pour que l'étiquette ne la chevauche pas. */}
                    {etiquettesParBarre && hauteur > 12 && (
                      <text
                        x={x + largeurBarre / 2} y={y - 5}
                        className={styles.valeur} textAnchor="middle"
                      >
                        {formater(valeur)}
                      </text>
                    )}
                  </g>
                );
              })}
              <text
                x={centre} y={HAUTEUR - 6}
                className={styles.categorie} textAnchor="middle"
              >
                {categorie}
              </text>
            </g>
          );
        })}
        {/* Repère d'échelle, quand les étiquettes par barre ne tiennent pas.
            Sans lui, le graphe n'aurait plus aucun chiffre et ne dirait que des
            proportions. */}
        {!etiquettesParBarre && maximum > 0 && (
          <text x={2} y={MARGE_HAUT - 8} className={styles.repere}>
            max {formater(maximum)}
          </text>
        )}
      </svg>

      {/* La même donnée, en tableau. Masquée visuellement, jamais du DOM.

          Le masque est porté par un CONTENEUR et non par le tableau lui-même :
          un tableau ne se laisse pas rétrécir sous la largeur de son contenu,
          et son `<caption>` échappe même à `table-layout: fixed`. Le poser sur
          le tableau revenait donc à demander une contrainte qu'il n'applique
          pas. Un conteneur d'un pixel à `overflow: hidden` découpe pour de
          bon, et le tableau reste entier pour les lecteurs d'écran. */}
      <div className={styles.masque}>
      <table className={styles.tableau}>
        <caption>{titre}</caption>
        <thead>
          <tr>
            <th scope="col">Période</th>
            {series.map((s) => <th key={s.id} scope="col">{s.libelle}</th>)}
          </tr>
        </thead>
        <tbody>
          {categories.map((categorie, iCat) => (
            <tr key={iCat}>
              <th scope="row">{categorie}</th>
              {series.map((s) => (
                <td key={s.id}>{formater(s.valeurs[iCat] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}
