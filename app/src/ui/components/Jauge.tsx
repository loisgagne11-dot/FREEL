import type { ReactNode } from 'react';
import { Montant } from './Montant';
import styles from './Jauge.module.css';

/**
 * Un entier lisible : séparateurs de milliers, jamais de décimales.
 *
 * Un seuil s'annonce en dizaines de milliers d'euros ; le centime n'y apporte
 * rien et allonge la ligne. Mais « 27700 » se déchiffre, il ne se lit pas —
 * et cet écran sert justement à savoir d'un coup d'œil où l'on en est.
 */
const nombre = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);

/**
 * Une jauge de seuil — le `Gauge` de la spec de design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA BARRE N'EST PAS L'INFORMATION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une barre remplie à 86 % se lit d'un coup d'œil, et c'est tout son intérêt.
 * Mais elle ne dit ni combien il reste, ni à partir de quand ça devient un
 * problème. Les deux chiffres sont donc écrits à côté — la barre les résume,
 * elle ne les remplace pas.
 *
 * `role="img"` avec un nom accessible : sans lui, un lecteur d'écran ne
 * rencontre que deux `<div>` vides.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE REPÈRE DE DATE, ET POURQUOI IL CHANGE TOUT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Sans lui, la jauge répond à « combien du seuil ai-je consommé » et pas à
 * « est-ce que je vais le dépasser ». Or 69 % est une excellente nouvelle au
 * 15 mars et un problème au 15 novembre : le même chiffre veut dire deux
 * choses opposées, et rien ne les distinguait.
 *
 * Le repère est un FAIT de calendrier, pas une extrapolation : au 15 novembre,
 * 87 % de l'année est passée quoi qu'on fasse. Remplissage à gauche du
 * repère, on est sous le rythme d'une année linéaire ; à droite, au-dessus.
 */
export function Jauge(
  { libelle, atteint, seuil, unite, alerteA = 0.85, repere = null, note = null }: {
    readonly libelle: string;
    readonly atteint: number;
    readonly seuil: number;
    readonly unite: string;
    /** Part du seuil à partir de laquelle la jauge passe en alerte. */
    readonly alerteA?: number;
    /**
     * Un repère posé sur la piste, entre 0 et 1, avec ce qu'il signifie.
     *
     * Employé pour la part de l'année écoulée. Le libellé entre dans le nom
     * accessible : un trait vertical ne se décrit pas de lui-même.
     */
    readonly repere?: { readonly part: number; readonly libelle: string } | null;
    /**
     * Ce que la jauge ne peut pas montrer — une projection, une abstention.
     *
     * Séparé du détail chiffré parce que ce n'en est pas de même nature : le
     * détail constate, la note extrapole, et les mêler ferait lire la seconde
     * avec l'autorité du premier.
     */
    readonly note?: ReactNode;
  }
) {
  const part = seuil > 0 ? atteint / seuil : 0;
  // Au-delà du seuil, la barre reste pleine : elle ne peut pas déborder de sa
  // piste, et le dépassement se lit dans le texte, en clair.
  const largeur = Math.min(100, Math.max(0, part * 100));
  const depasse = atteint > seuil;
  const ton = depasse ? styles.depasse : part >= alerteA ? styles.proche : styles.normal;
  const reste = Math.max(0, seuil - atteint);

  return (
    <div className={styles.jauge}>
      <div className={styles.entete}>
        <span className={styles.libelle}>{libelle}</span>
        <span className={styles.part}>{Math.round(part * 100)} %</span>
      </div>

      <div
        className={styles.piste}
        role="img"
        aria-label={
          `${libelle} : ${Math.round(part * 100)} % du seuil de ${nombre(seuil)} ${unite}`
          + (repere === null ? '' : `, ${repere.libelle}`)
        }
      >
        <div className={`${styles.remplissage} ${ton}`} style={{ width: `${largeur}%` }} />
        {repere !== null && (
          <span
            className={styles.repere}
            style={{ left: `${Math.min(100, Math.max(0, repere.part * 100))}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      <p className={styles.detail}>
        {depasse
          ? <>Seuil dépassé de <strong><Montant>{nombre(atteint - seuil)}&nbsp;{unite}</Montant></strong>.</>
          : (
            <>
              Il reste <strong><Montant>{nombre(reste)}&nbsp;{unite}</Montant></strong> avant le
              seuil de <Montant>{nombre(seuil)}&nbsp;{unite}</Montant>.
            </>
          )}
      </p>

      {note !== null && <p className={styles.note}>{note}</p>}
    </div>
  );
}
