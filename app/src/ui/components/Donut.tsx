import { useId, type ReactNode } from 'react';
import type { TonPart } from './Repartition';
import { Montant } from './Montant';
import styles from './Donut.module.css';

/**
 * La répartition d'un total, en anneau, avec sa valeur au centre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN ANNEAU ICI, ALORS QU'UNE BARRE AILLEURS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'audit des indicateurs avait tranché pour la barre segmentée, et concluait
 * qu'il ne fallait pas « retransformer `Repartition` en donut au motif que la
 * maquette en montrait un ». La capture du handoff a contredit cette lecture :
 * elle ne montre pas un donut *à la place* des montants, elle montre un donut
 * **et** les trois montants en clair à côté, **et** la phrase qui les explique.
 * Ce qui manquait n'était donc pas la forme, c'était le reste.
 *
 * L'anneau a un avantage que la barre n'a pas, et c'est lui qui décide : son
 * centre est un emplacement. « 4 940 € · à toi, hors prov. » y tient, au milieu
 * de ce qui le compose. Une barre n'a pas de milieu — la même valeur devrait
 * aller au-dessus ou en dessous, où elle se lit comme un quatrième poste.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ANNEAU EST UNE IMAGE, LA LÉGENDE EST LA DONNÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Même règle que pour la barre, et pour la même raison : sous quelques
 * pourcents, un segment fait deux pixels sur un téléphone. Le tracé est
 * `aria-hidden`, chaque part porte son montant en toutes lettres dans la
 * légende, et ces montants passent par `Montant` — sans quoi le mode
 * confidentiel laisserait lire un solde sur un écran partagé.
 */

export interface PartDonut {
  readonly libelle: string;
  readonly montant: number;
  readonly ton: TonPart;
}

/** Le rayon du cercle sur lequel court le trait. Repère interne au SVG. */
const RAYON = 42;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

export function Donut(
  { parts, total, centre, legendeCentre, deficit = 0 }: {
    readonly parts: readonly PartDonut[];
    readonly total: number;
    /** La valeur inscrite au centre, déjà formatée. */
    readonly centre: string;
    /** Ce que cette valeur est. Une ligne, sous le montant. */
    readonly legendeCentre: string;
    /**
     * Ce qui manque quand les parts dépassent le total.
     *
     * L'anneau ne peut pas le représenter — il n'exprime que des parts d'un
     * tout — donc il est dit. Ce n'est pas une nuance d'affichage : l'argent
     * des cotisations a déjà été dépensé.
     */
    readonly deficit?: number;
  }
) {
  const idTitre = useId();
  const base = Math.max(1, total);

  /*
   * Les segments sont posés bout à bout sur un seul cercle, par décalage du
   * `stroke-dashoffset`. Un cercle par part, empilés : chacun ne dessine que sa
   * portion et laisse le reste vide.
   *
   * Le total sert de dénominateur même quand les parts ne le remplissent pas.
   * Les normaliser à 100 % ferait un anneau plein sur un compte à découvert,
   * c'est-à-dire l'image exactement inverse de la situation.
   */
  let parcouru = 0;
  const segments = parts.map((p) => {
    const part = Math.max(0, p.montant) / base;
    const segment = {
      ton: p.ton,
      longueur: part * CIRCONFERENCE,
      decalage: -parcouru * CIRCONFERENCE
    };
    parcouru += part;
    return segment;
  });

  return (
    <div className={styles.bloc}>
      <div className={styles.anneau}>
        <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          {/* Le fond de l'anneau : ce qui reste quand les parts ne remplissent
              pas le total. Sans lui, un compte à découvert n'aurait pas
              d'anneau du tout, juste un arc flottant. */}
          <circle
            cx="50" cy="50" r={RAYON}
            fill="none" stroke="var(--line)" strokeWidth="12"
          />
          {segments.map((s, i) => (
            <circle
              key={i}
              cx="50" cy="50" r={RAYON}
              fill="none"
              className={styles[s.ton]}
              strokeWidth="12"
              strokeDasharray={`${s.longueur} ${CIRCONFERENCE}`}
              strokeDashoffset={s.decalage}
              /* Le trait part de midi et tourne dans le sens des aiguilles :
                 par défaut un cercle SVG commence à 3 h et tourne à l'envers,
                 ce qui met la première part en bas à droite. */
              transform="rotate(-90 50 50)"
            />
          ))}
        </svg>
        <span className={styles.centre}>
          <span className={styles.centreValeur}><Montant>{centre}</Montant></span>
          <span className={styles.centreLegende}>{legendeCentre}</span>
        </span>
      </div>

      <ul className={styles.legende} aria-labelledby={idTitre}>
        <li className={styles.horsEcran} id={idTitre}>Répartition, part par part</li>
        {parts.map((p) => (
          <li key={p.libelle} className={styles.ligne}>
            <span className={`${styles.pastille} ${styles[p.ton]}`} aria-hidden="true" />
            <span className={styles.libelle}>{p.libelle}</span>
            <span className={styles.montant}><Montant>{fr(p.montant)}</Montant></span>
          </li>
        ))}
        {deficit > 0 && (
          <li className={styles.manque}>
            Il manque <Montant>{fr(deficit)}</Montant> pour couvrir les provisions&nbsp;:
            une partie de l’argent dû a déjà été dépensée.
          </li>
        )}
      </ul>
    </div>
  );
}

/** Formatage local, pour que le composant n'impose pas d'unité à l'appelant. */
function fr(montant: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(montant);
}

/** La phrase qui explique l'anneau, placée sous lui par l'appelant. */
export function PhraseRepartition({ children }: { readonly children: ReactNode }) {
  return <p className={styles.phrase}>{children}</p>;
}
