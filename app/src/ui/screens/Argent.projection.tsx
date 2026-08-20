import { useMemo } from 'react';
import { useFaits } from '../../state/store';
import { etatProjection } from '../../state/selecteurs.argent';
import type { Mois } from '../../domain/types';
import { GrapheBarres, type SerieBarres } from '../components/GrapheBarres';
import { Info } from '../components/Info';
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

const MOIS_COURTS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** L'initiale du mois, pour l'axe. */
const initiale = (m: Mois): string => MOIS_COURTS[Number(m.slice(5, 7)) - 1] ?? m;

/** « 2026-09 » → « septembre 2026 ». */
function moisLong(m: Mois): string {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric', timeZone: 'UTC'
  });
}

/** En k€ : un montant complet au-dessus d'une barre se chevaucherait. */
function enKiloEuros(valeur: number): string {
  if (valeur === 0) return '0';
  const k = valeur / 1000;
  const arrondi = Math.abs(k) >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(arrondi)} k€`;
}

export function ProjectionPanneau() {
  const faits = useFaits((e) => e.faits);
  const etat = useMemo(() => etatProjection(faits), [faits]);
  const { projection, depensesMensuelles, tauxDeCharges, versementsPasses } = etat;

  const series: readonly SerieBarres[] = [
    {
      id: 'sans',
      libelle: 'Sans versement',
      valeurs: projection.mois.map((m) => m.sansVersement),
      token: 'sable'
    },
    {
      id: 'avec',
      // Pas de montant dans le libellé : une légende de graphe est du texte
      // brut, hors de `Montant`, donc illisible au vérificateur de
      // confidentialité et lisible sur un écran partagé. Le montant est dit
      // au-dessus, dans la phrase, où il est masquable.
      libelle: 'En me versant chaque mois',
      valeurs: projection.mois.map((m) => m.avecVersement),
      token: 'green'
    }
  ];

  const versements: readonly SerieBarres[] = [
    {
      id: 'verse',
      libelle: 'Versé',
      valeurs: versementsPasses.map((v) => v.montant),
      token: 'green'
    },
    {
      id: 'soutenable',
      libelle: 'Soutenable',
      valeurs: versementsPasses.map(() => projection.versementMensuel),
      token: 'sable'
    }
  ];

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

      <section className={styles.carte} aria-labelledby="titre-projection">
        <h3 id="titre-projection" className={styles.titreCarte}>
          Disponible sur douze mois
          <Info libelle="Pourquoi le disponible et non le solde">
            Projeter le <em>solde</em> obligerait à deviner quand chaque dette
            sortira du compte — et la moitié d’entre elles n’a pas encore de
            date, puisque l’URSSAF n’a pas appelé les charges des recettes
            déjà encaissées. Une courbe de solde monte donc joliment jusqu’au
            trimestre où elle s’effondre. Le <strong>disponible</strong>, lui,
            a déjà tout retiré&nbsp;: un encaissement ne lui ajoute que sa part
            nette, et payer une échéance ne le fait pas bouger.
          </Info>
        </h3>
        <GrapheBarres
          titre="Disponible projeté, avec et sans versement mensuel"
          categories={projection.mois.map((m) => initiale(m.mois))}
          series={series}
          formater={enKiloEuros}
        />
        {dernier !== undefined && (
          <p className={styles.aide}>
            Dans un an&nbsp;: <Montant>{eur(dernier.sansVersement)}</Montant> sans
            rien te verser, <Montant>{eur(dernier.avecVersement)}</Montant> en
            t’étant versé <Montant>{eur(dernier.verseCumule)}</Montant> au total.
          </p>
        )}
      </section>

      <section className={styles.carte} aria-labelledby="titre-versements">
        <h3 id="titre-versements" className={styles.titreCarte}>
          Ce que tu t’es versé
          <Info libelle="D’où viennent ces montants">
            Du <strong>relevé bancaire</strong>&nbsp;: ce sont les mouvements
            que tu as marqués comme rémunération. Rien n’est saisi deux
            fois — en micro, un virement du compte professionnel vers le
            compte personnel ne crée ni charge ni recette, il change seulement
            de poche. La barre de référence est le versement soutenable
            calculé <em>aujourd’hui</em>&nbsp;: elle répond à « est-ce que je
            me verse plus ou moins que ce que je peux&nbsp;? », pas à « qu’aurais-je
            pu me verser en mars ».
          </Info>
        </h3>
        <GrapheBarres
          titre="Versements des douze derniers mois, face au soutenable"
          categories={versementsPasses.map((v) => initiale(v.mois))}
          series={versements}
          formater={enKiloEuros}
        />
      </section>
    </div>
  );
}
