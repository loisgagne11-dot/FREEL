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
 * LA COURBE PEUT CHANGER DE GRANDEUR EN COURS DE ROUTE, ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le composant ne tranche PAS ce que la courbe représente : il trace la série
 * de `niveau` qu'on lui donne, et affiche les deux noms qu'on lui passe —
 * `libelleNiveau` pour les mois clos, `libelleNiveauProjete` pour les mois à
 * venir. C'est l'appelant (`Argent.tresorerie.tsx`) qui décide de la grandeur,
 * et pour de bonnes raisons il n'en garde pas la même sur toute la largeur.
 *
 * Un mois déjà clos a un solde exact, connu jusqu'au centime : rien n'y est
 * deviné, la courbe peut donc le tracer directement, en plein. Un mois à venir
 * n'a pas ce luxe — projeter un SOLDE obligerait à deviner QUAND chaque dette
 * sortira du compte, et la moitié d'entre elles n'a pas encore de date. Une
 * courbe de solde qui les ignorerait monterait joliment jusqu'au trimestre où
 * elle s'effondre, et c'est exactement la courbe qui fait se verser de
 * l'argent qu'on doit. Voir `estProjete` ci-dessous pour comment la frontière
 * se marque à l'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE TRACÉ EST UNE IMAGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `aria-hidden` sur le SVG et sur les barres, et chaque mois porte ses trois
 * montants en texte : l'entrée au-dessus de la barre, la sortie en dessous, le
 * niveau au-dessus de son point sur la courbe. Un graphe dont l'information
 * n'existe qu'en pixels est inaccessible ; ici la donnée est lisible sans lui.
 *
 * Ça n'a pas toujours été le cas : entrées et sorties ont d'abord vécu dans un
 * `<span>` hors écran, que le vérificateur de confidentialité a signalé comme
 * un montant nu échappant au floutage — puis, pour le faire taire, dans un
 * `aria-label` sur les barres, qui rend le montant inaccessible à l'ŒIL plutôt
 * qu'inaccessible AU FLOUTAGE. Le bon correctif était le troisième : un texte
 * visible, passé par `<Montant>` comme les deux autres séries, qui satisfait
 * l'œil et le floutage à la fois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE NIVEAU NE VIT QU'À UN SEUL ENDROIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La référence pose le niveau sur la courbe, là où l'œil suit la pente. Il a
 * vécu un temps sous la colonne, avec l'entrée et la sortie — mais l'y garder
 * EN PLUS de la courbe aurait recréé, sur cette carte, le défaut que le projet
 * vient de corriger deux fois ailleurs : l'occupation en double sur Activité,
 * le « Reste à rentrer » à deux sources sur Argent. Un même nombre à deux
 * endroits d'une carte n'informe pas deux fois, il fait douter lequel des deux
 * est à jour le jour où quelqu'un n'en touche qu'un.
 *
 * Le texte est posé en HTML, PAS dans le SVG : le repère est étiré en largeur
 * par `preserveAspectRatio="none"`, et un `<text>` SVG en hériterait — les
 * glyphes s'aplatiraient avec la courbe. Un `<span>` positionné en
 * pourcentage, par-dessus, garde sa police intacte quelle que soit la largeur
 * de la carte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE FAIT ET L'HYPOTHÈSE NE SE DESSINENT PAS PAREIL (lot L1)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `estProjete` sépare les mois clos — un solde réel, connu exactement — des
 * mois à venir — une hypothèse de disponible, qui suppose déjà tout retiré ce
 * qui est dû. Confondre les deux dans un même trait plein referait la faute
 * qu'une courbe de solde projeté commet : monter joliment jusqu'au trimestre
 * où elle s'effondre, sans jamais dire qu'elle devinait.
 *
 * Le trait des mois clos reste plein ; celui des mois à venir est en
 * pointillés, comme le seuil. Chaque colonne à venir porte en plus un mot en
 * clair — « prévu » — parce qu'une différence de trait seule échappe à qui ne
 * la voit pas ou ne la cherche pas.
 */

export interface MoisEvolution {
  readonly mois: string;
  /** Abrégé de trois lettres pour l'axe — « JUIN », « AOÛT ». */
  readonly libelle: string;
  readonly entrees: number;
  /** Positif : c'est un montant qui SORT, pas une valeur négative. */
  readonly sorties: number;
  /**
   * Le niveau à la fin de ce mois — ce que la courbe trace.
   *
   * `null` quand il n'est pas CONNU : sur une année antérieure au solde de
   * départ, la dérivation n'a rien à quoi s'accrocher. La courbe ne trace
   * alors rien plutôt que de poser le montant de départ — ce qui affirmerait
   * que le compte l'a porté toute l'année.
   */
  readonly niveau: number | null;
  /**
   * `false` : `niveau` est un fait, mois déjà clos. `true` : `niveau` est une
   * hypothèse de disponible — voir l'en-tête du fichier. Détermine le trait
   * (plein ou pointillé) et le mot « prévu » sous la colonne.
   */
  readonly estProjete: boolean;
}

const HAUTEUR_COURBE = 96;
const HAUTEUR_BARRES = 64;

export function GrapheEvolution(
  {
    mois, seuil, libelleNiveau, libelleNiveauProjete, formater, formaterCourt, indexCourant = -1
  }: {
    readonly mois: readonly MoisEvolution[];
    /** Le plancher tracé en pointillés, ou `null` s'il n'y en a pas. */
    readonly seuil: number | null;
    /** Ce que la courbe représente sur les mois CLOS. Entre dans la légende. */
    readonly libelleNiveau: string;
    /**
     * Ce que la courbe représente sur les mois À VENIR — une hypothèse
     * distincte, jamais la même grandeur que `libelleNiveau` (voir l'en-tête
     * du fichier). N'entre dans la légende que si au moins un mois est projeté.
     */
    readonly libelleNiveauProjete: string;
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
  /*
   * LES MOIS SANS NIVEAU CONNU NE PÈSENT PAS SUR L'ÉCHELLE.
   *
   * Les compter pour zéro écraserait la courbe des mois qui, eux, sont
   * connus : une année dont seuls les deux derniers mois ont un solde
   * verrait ces deux points collés en haut d'un vide de dix colonnes.
   */
  const niveaux = mois
    .map((m) => m.niveau)
    .filter((n): n is number => n !== null);
  const hautNiveau = Math.max(1, ...niveaux, seuil ?? 0);
  const basNiveau = Math.min(0, ...niveaux);
  const amplitude = Math.max(1, hautNiveau - basNiveau);
  const y = (v: number): number =>
    HAUTEUR_COURBE - ((v - basNiveau) / amplitude) * HAUTEUR_COURBE;
  const x = (i: number): number => ((i + 0.5) / mois.length) * 100;

  /*
   * `null` là où le niveau n'est pas connu : le tracé s'interrompt plutôt que
   * de relier deux points par-dessus un trou. Une ligne qui traverse
   * l'inconnu affirme une continuité que rien n'établit.
   */
  const points = mois.map((m, i) => (m.niveau === null ? null : `${x(i)},${y(m.niveau)}`));

  /*
   * DEUX TRAITS, PAS UN : LE FAIT S'ARRÊTE OÙ L'HYPOTHÈSE COMMENCE.
   *
   * `indexBascule` est le dernier mois CLOS. `evolutionCompte` garantit que
   * les mois clos sont toujours en tête, contigus (voir sa documentation) :
   * chercher le dernier `!estProjete` suffit donc, pas besoin de scinder le
   * tableau ailleurs.
   *
   * Les deux tracés partagent le point de bascule : un trait plein qui
   * s'arrêterait avant le pointillé laisserait un trou visible entre les
   * deux, comme si un mois manquait.
   */
  const indexBascule = mois.reduce(
    (acc, m, i) => (!m.estProjete && m.niveau !== null ? i : acc), -1
  );
  const connus = (p: readonly (string | null)[]): string =>
    p.filter((v): v is string => v !== null).join(' ');
  const pointsFaits = indexBascule >= 0 ? connus(points.slice(0, indexBascule + 1)) : '';
  const aPortionProjetee = mois.some((m) => m.estProjete);
  const pointsProjetes = aPortionProjetee
    ? connus(points.slice(Math.max(indexBascule, 0)))
    : '';

  // L'aire ne se remplit que sous ce qui est CONNU : la remplir sous
  // l'hypothèse donnerait à une projection le même poids visuel qu'un fait.
  // L'aire part du PREMIER mois connu, pas de la première colonne : la faire
  // démarrer à gauche d'un trou la remplirait sous l'inconnu.
  const premierConnu = points.findIndex((p) => p !== null);
  const aire = indexBascule >= 0 && premierConnu >= 0
    ? `${x(premierConnu)},${HAUTEUR_COURBE} ${pointsFaits} ${x(indexBascule)},${HAUTEUR_COURBE}`
    : null;

  const mouvementMax = Math.max(1, ...mois.flatMap((m) => [m.entrees, m.sorties]));
  const titreAccessible = aPortionProjetee
    ? `${libelleNiveau}, puis ${libelleNiveauProjete} à partir des mois à venir, `
      + 'entrées et sorties, mois par mois'
    : `${libelleNiveau}, entrées et sorties, mois par mois`;

  return (
    <figure className={styles.figure} aria-labelledby={idTitre}>
      <figcaption className={styles.horsEcran} id={idTitre}>
        {titreAccessible}
      </figcaption>

      {/* Alignée à droite : la référence la pose sur la ligne du titre de la
          carte, à droite. Ce composant ne connaît pas ce titre — c'est
          `Argent.tresorerie.tsx` qui l'affiche, dans un `<h2>` hors de ce
          fichier — donc il ne peut pas la mettre sur SA ligne. L'aligner à
          droite ici est le pas qu'on peut faire sans y toucher ; la poser
          effectivement à côté du titre reste à faire côté appelant. */}
      <div className={styles.legende} aria-hidden="true">
        <span className={styles.entreeLegende}>
          <span className={styles.traitNiveau} />{libelleNiveau}
        </span>
        {aPortionProjetee && (
          <span className={styles.entreeLegende}>
            <span className={styles.traitNiveauProjete} />{libelleNiveauProjete}
          </span>
        )}
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
      <div className={styles.courbeConteneur}>
        <svg
          className={styles.courbe}
          viewBox={`0 0 100 ${HAUTEUR_COURBE}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {aire !== null && <polygon points={aire} className={styles.aire} />}
          {pointsFaits !== '' && (
            <polyline points={pointsFaits} className={styles.ligne} vectorEffect="non-scaling-stroke" />
          )}
          {pointsProjetes !== '' && (
            <polyline
              points={pointsProjetes} className={styles.ligneProjetee}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {seuil !== null && (
            <line
              x1="0" x2="100" y1={y(seuil)} y2={y(seuil)}
              className={styles.seuil} vectorEffect="non-scaling-stroke"
            />
          )}
          {/* Pas de point là où le niveau n'est pas connu : un point posé à
              zéro se lirait comme un solde vide, ce qui est une affirmation. */}
          {mois.map((m, i) => (m.niveau === null ? null : (
            <circle
              key={m.mois} cx={x(i)} cy={y(m.niveau)} r="1.6"
              className={m.estProjete ? styles.pointProjete : styles.point}
            />
          )))}
        </svg>

        {/* Le niveau, en HTML par-dessus le SVG — voir « LE NIVEAU NE VIT
            QU'À UN SEUL ENDROIT » en tête de fichier. `left`/`top` en
            pourcentage reprennent exactement `x()`/`y()` : la même échelle que
            le point qu'ils légendent, sans jamais entrer dans son repère
            étiré. */}
        <div className={styles.etiquettesNiveau}>
          {mois.map((m, i) => (m.niveau === null ? null : (
            <span
              key={m.mois}
              className={styles.etiquetteNiveau}
              style={{ left: `${x(i)}%`, top: `${(y(m.niveau) / HAUTEUR_COURBE) * 100}%` }}
            >
              <Montant>{formaterCourt(m.niveau)}</Montant>
            </span>
          )))}
        </div>
      </div>

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
              className={[
                styles.colonne,
                i === indexCourant ? styles.colonneCourante : '',
                m.estProjete ? styles.colonneProjetee : ''
              ].filter(Boolean).join(' ')}
            >
              {/* Pas de niveau ici : il est déjà sur la courbe, au-dessus de
                  ce même mois. Voir « LE NIVEAU NE VIT QU'À UN SEUL ENDROIT »
                  en tête de fichier. */}
              {/* L'entrée colle au sommet de sa barre, la sortie au pied de la
                  sienne : chaque chiffre reste soudé au trait qu'il légende, au
                  lieu de forcer un aller-retour de l'œil entre un nombre et une
                  barre parmi douze. */}
              {/*
                * UN MOIS SANS MOUVEMENT N'ÉCRIT RIEN.
                *
                * Le graphe imprimait « +0 € » et « −0 € » sur chaque mois vide,
                * plus « +0 € » de net dessous : trois zéros par colonne, et sur
                * une année qui démarre en avril, une vingtaine de zéros pour
                * douze mois. L'œil les lit comme des données, cherche ce qu'ils
                * distinguent, et ne trouve rien — le graphe passait pour cassé
                * alors qu'il disait la vérité.
                *
                * Le vide se montre en ne montrant rien. La colonne garde sa
                * place et son mois : c'est l'absence de chiffre qui dit
                * l'absence de mouvement.
                */}
              {m.entrees > 0 && (
                <span className={styles.valeurEntree}>
                  +<Montant>{formaterCourt(m.entrees)}</Montant>
                </span>
              )}
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
              {m.sorties > 0 && (
                <span className={styles.valeurSortie}>
                  −<Montant>{formaterCourt(m.sorties)}</Montant>
                </span>
              )}
              <span className={styles.axeMois}>{m.libelle}</span>
              {/* Le net sous le mois : c'est lui qui explique la pente du
                  segment juste au-dessus, et il évite la soustraction de tête
                  que deux barres imposeraient. */}
              {/*
                * LE NET N'EXPLIQUE QUE CE QUE LES DEUX FLUX NE DISENT PAS.
                *
                * Il ne s'écrit que si les DEUX flux existent. Sur un mois vide
                * il vaudrait zéro, et un zéro de plus n'explique aucune pente —
                * le segment au-dessus est plat, ce qui se voit. Sur un mois qui
                * n'a qu'une sortie, le net RÉPÈTE cette sortie : deux fois le
                * même nombre l'un sous l'autre, et l'œil cherche la différence
                * entre eux. Le net a sa raison d'être quand il évite une
                * soustraction de tête, pas quand il recopie.
                */}
              {m.entrees > 0 && m.sorties > 0 && (
                <span className={net < 0 ? styles.netNegatif : styles.netPositif}>
                  {net >= 0 ? '+' : '−'}<Montant>{formaterCourt(Math.abs(net))}</Montant>
                </span>
              )}
              {/* Un mot en clair, pas seulement un trait en pointillés : une
                  différence de trait seule échappe à qui ne la voit pas, ou ne
                  la cherche pas — voir « LE FAIT ET L'HYPOTHÈSE… » en tête de
                  fichier. */}
              {m.estProjete && <span className={styles.badgeProjete}>prévu</span>}
            </div>
          );
        })}
      </div>
    </figure>
  );
}
