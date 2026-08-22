import { useMemo } from 'react';
import { useFaits } from '../../state/store';
import { etatProjection } from '../../state/selecteurs.argent';
import type { Mois } from '../../domain/types';
import { Montant } from '../components/Montant';
import { eur } from '../format';
import styles from './Argent.module.css';

/**
 * Où va l'argent disponible, et combien on peut s'en verser.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ON PROJETTE LE DISPONIBLE, PAS LE SOLDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * C'est ce qui distingue cette courbe de celle de l'ancienne application, et
 * ce qui la rend utilisable.
 *
 * Projeter le solde obligerait à deviner QUAND chaque dette sortira du compte.
 * Or la moitié d'entre elles n'a pas encore de date : les charges dues sur des
 * recettes déjà encaissées mais non déclarées existent, se chiffrent, et
 * l'URSSAF ne les a pas encore appelées. Une courbe de solde qui les ignore
 * monte joliment jusqu'au trimestre où elle s'effondre — et c'est exactement
 * la courbe qui fait se verser de l'argent qu'on doit.
 *
 * Le disponible a déjà tout retiré. Un encaissement de X ne lui ajoute donc
 * que sa part nette de charges, et payer une échéance ne le fait pas bouger :
 * la somme quitte le solde et les provisions du même mouvement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX SCÉNARIOS, PARCE QUE LA QUESTION EN A DEUX
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Sans versement » dit ce que le compte devient si l'on n'y touche pas.
 * « En me versant » dit ce qu'il devient au rythme maximal soutenable. Le
 * second seul serait une prescription ; le premier seul ne répondrait pas à
 * la question qu'on se pose, qui est « combien puis-je me verser ? ».
 */

/*
 * TROIS LETTRES, ET NON UNE.
 *
 * L'axe portait des initiales : « J A S O N D J F M A M ». Trois des douze
 * lettres y apparaissent deux fois, et une année qui traverse janvier se lit
 * comme si elle revenait en arrière. Le reste de l'écran — et la référence —
 * abrège sur trois lettres, où chaque mois est reconnaissable seul.
 */
/** « 2026-09 » → « septembre 2026 ». */
function moisLong(m: Mois): string {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric', timeZone: 'UTC'
  });
}

export function ProjectionPanneau() {
  const faits = useFaits((e) => e.faits);
  const etat = useMemo(() => etatProjection(faits), [faits]);
  const { projection, depensesMensuelles, tauxDeCharges } = etat;

  const dernier = projection.mois[projection.mois.length - 1];

  return (
    <div className={styles.dossier}>
      {/* La réponse, en toutes lettres, avant les barres. Un graphe se lit
          d'un coup d'œil mais ne dit pas de combien il s'agit. */}
      <p className={styles.reponse}>
        Tu peux te verser <strong><Montant>{eur(projection.versementMensuel)}</Montant></strong> par
        mois pendant un an.
        {projection.moisContraignant !== null && (
          <> C’est <strong>{moisLong(projection.moisContraignant)}</strong> qui
          limite&nbsp;: au-delà, ce mois-là passerait sous ta réserve.</>
        )}
        {projection.versementMensuel === 0 && (
          <> Rien pour l’instant&nbsp;: le disponible ne dépasse pas la réserve
          sur la période projetée.</>
        )}
      </p>

      {/* Une projection n'est vraie que de ses hypothèses. Elles sont écrites,
          et celles qui manquent sont nommées — une projection silencieusement
          incomplète est plus dangereuse qu'une absence de projection. */}
      <ul className={styles.hypotheses}>
        <li>
          Encaissements attendus&nbsp;: factures émises non réglées à leur
          échéance, et revenu prévu au planning décalé du délai de paiement.
          Aucune tendance devinée.
        </li>
        <li>
          {tauxDeCharges === null
            ? <span className={styles.manquant}>
                Taux de charges inconnu sur cette période&nbsp;: la projection
                ne retire rien, elle est donc trop haute d’environ un quart.
              </span>
            : <>Charges retenues sur chaque encaissement&nbsp;:{' '}
                {Math.round(tauxDeCharges * 100)}&nbsp;%.</>}
        </li>
        <li>
          {depensesMensuelles === null
            ? <span className={styles.manquant}>
                Dépenses courantes non estimées, faute de trois mois
                d’historique&nbsp;: la projection les ignore et se trouve donc
                trop haute d’autant.
              </span>
            : <>Dépenses courantes&nbsp;: <Montant>{eur(depensesMensuelles)}</Montant> par
                mois, moyenne des six derniers mois.</>}
        </li>
      </ul>

      {/* La carte « Disponible sur douze mois » a été RETIRÉE d'ici.
          Elle traçait la même projection que le graphe combiné du haut de
          l'écran — même série, même source — dans une autre forme et sur un
          axe d'une seule lettre. Deux dessins du même nombre sur un écran
          finissent par ne pas dire la même chose ; celui du haut porte en
          plus les entrées, les sorties et le seuil, donc c'est lui qui reste.

          Ce qui n'était QUE dans cette carte est conservé : la phrase du
          versement soutenable et les trois hypothèses sont juste au-dessus, et
          la ligne « dans un an » ci-dessous. Elle porte le seul chiffre que le
          graphe combiné ne donne pas — le versé CUMULÉ sur douze mois — et
          c'est du texte, pas un second dessin du même nombre. */}

      {dernier !== undefined && (
        <p className={styles.aide}>
          Dans un an&nbsp;: <Montant>{eur(dernier.sansVersement)}</Montant> sans
          rien te verser, <Montant>{eur(dernier.avecVersement)}</Montant> en
          t’étant versé <Montant>{eur(dernier.verseCumule)}</Montant> au total.
        </p>
      )}

      {/*
        * LE GRAPHE DES VERSEMENTS PASSÉS A ÉTÉ RETIRÉ D'ICI.
        *
        * Il confrontait les douze derniers versements au soutenable calculé
        * AUJOURD'HUI — et son infobulle l'admettait : « elle répond à “est-ce
        * que je me verse plus ou moins que ce que je peux ?”, pas à “qu'aurais-je
        * pu me verser en mars” ». Le dénominateur était le mauvais, et le dire
        * ne le rendait pas juste.
        *
        * « Capacité de versement par mois », sur le pilier Performance, répond
        * à la même question avec la capacité de CHAQUE mois — encaissé du mois,
        * charges au taux de ce mois-là, dépenses de ce mois-là — et le versé
        * dessiné À L'INTÉRIEUR de la barre. C'est aussi la forme que le handoff
        * dessine, et il n'en dessine qu'une.
        *
        * Deux réponses à une même question sur un même écran finissent par ne
        * pas tomber d'accord ; ici l'une était déjà connue pour être la moins
        * bonne. C'est le troisième retrait de ce type sur cet écran — après le
        * donut de destination et la carte « Disponible sur douze mois » — et
        * toujours pour le même motif.
        *
        * Ce qui n'était QUE dans cette carte est conservé : la phrase du
        * versement soutenable, les trois hypothèses, et la ligne « dans un an »
        * qui porte le versé CUMULÉ — un chiffre qu'aucun graphe ne donne.
        */}
    </div>
  );
}
