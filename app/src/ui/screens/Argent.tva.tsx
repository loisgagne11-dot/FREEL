import { useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { dossierTvaDuTrimestre } from '../../state/selecteurs.argent';
import { estComplet, estUnCredit } from '../../domain/calculs/dossierTva';
import type { DateISO } from '../../domain/types';
import { euros } from '../../domain/types';
import { Info } from '../components/Info';
import { Montant } from '../components/Montant';
import { dateCourte, eur } from '../format';
import styles from './Argent.module.css';

/**
 * Le dossier de déclaration de TVA.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CRITÈRE DE RÉUSSITE N'EST PAS UN AFFICHAGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Je dois déclarer ma TVA pour un trimestre. Au clic, j'ai toutes les
 * informations pour remplir ma déclaration. » L'exigence est d'usage : le
 * critère est qu'on puisse remplir le formulaire officiel sans quitter l'écran
 * ni chercher ailleurs. Les listes de pièces sont donc rendues en ENTIER, et
 * non résumées — un total seul oblige à rouvrir le facturier pour vérifier une
 * ligne, et tout est perdu.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN PANNEAU, ET SON PROPRE MODULE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * On déclare quatre fois par an. Une carte permanente ferait porter à chaque
 * consultation de la trésorerie le poids d'un écran qu'on ouvre un jour par
 * trimestre — et le budget de l'écran différé l'a dit en dépassant. C'est
 * aussi ce que demande l'énoncé : le dossier s'atteint DEPUIS son jalon, pas
 * en permanence.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE TRIMESTRE PAR DÉFAUT EST CELUI QU'ON DÉCLARE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'écoulé, jamais celui en cours : déclarer un trimestre qui n'est pas fini
 * n'a pas de sens, et faire reculer d'un cran à chaque ouverture est un geste
 * de trop.
 */

/** Le trimestre civil décalé de `decalage` par rapport à celui de `d`. */
export function trimestreDe(
  d: Date, decalage = 0
): { readonly du: DateISO; readonly au: DateISO; readonly libelle: string } {
  const rang = Math.floor(d.getUTCMonth() / 3) + decalage;
  // Division euclidienne : un décalage négatif doit reculer d'une année, pas
  // produire un « T0 ». `Math.floor` sur un quotient négatif fait le travail,
  // le modulo doit être ramené dans [0, 4[ à la main.
  const annee = d.getUTCFullYear() + Math.floor(rang / 4);
  const t = ((rang % 4) + 4) % 4;
  const premierMois = t * 3 + 1;
  const dernierJour = new Date(Date.UTC(annee, premierMois + 2, 0)).getUTCDate();

  return {
    du: `${annee}-${String(premierMois).padStart(2, '0')}-01` as DateISO,
    au: `${annee}-${String(premierMois + 2).padStart(2, '0')}-${dernierJour}` as DateISO,
    libelle: `T${t + 1} ${annee}`
  };
}

export function DossierTvaPanneau() {
  const faits = useFaits((e) => e.faits);
  const [decalage, setDecalage] = useState(-1);
  const trimestre = useMemo(() => trimestreDe(new Date(), decalage), [decalage]);
  const dossier = useMemo(
    () => dossierTvaDuTrimestre(faits, trimestre.du, trimestre.au),
    [faits, trimestre]
  );

  const credit = estUnCredit(dossier);
  const complet = estComplet(dossier);

  return (
    <div className={styles.dossier}>
      <div className={styles.navigationMois}>
        <button type="button" className={styles.pas}
          onClick={() => setDecalage((d) => d - 1)} aria-label="Trimestre précédent">
          ‹
        </button>
        <span className={styles.moisCourant} role="status" aria-label="Trimestre déclaré">
          {trimestre.libelle}
        </span>
        <button type="button" className={styles.pas}
          onClick={() => setDecalage((d) => d + 1)} aria-label="Trimestre suivant">
          ›
        </button>
        <Info libelle="Quelle date fait entrer une facture dans la déclaration">
          Celle de l’<strong>encaissement</strong>, et non de l’émission&nbsp;:
          sur les prestations de services, la TVA est exigible au paiement
          (art. 269-2-c du CGI). Une facture émise en juin et réglée en août
          relève du trimestre d’août. C’est l’inverse de la règle qui range les
          factures partout ailleurs ici, et les confondre décale la déclaration
          d’un trimestre entier. La TVA déductible suit la même logique&nbsp;:
          elle se déduit sur la période de <em>paiement</em> de la dépense.
        </Info>
      </div>

      <dl className={styles.detail}>
        <div className={styles.ligne}>
          <dt>Base hors taxes encaissée</dt>
          <dd><Montant>{eur(dossier.baseHt)}</Montant></dd>
        </div>
        <div className={styles.ligne}>
          <dt>TVA collectée</dt>
          <dd><Montant>{eur(dossier.collectee)}</Montant></dd>
        </div>
        <div className={styles.ligne}>
          <dt>TVA déductible sur achats</dt>
          <dd><Montant>{eur(dossier.deductible)}</Montant></dd>
        </div>
        <div className={`${styles.ligne} ${styles.total}`}>
          {/* Un crédit n'est pas une somme à payer : afficher « −450 € à
              reverser » ferait chercher une erreur là où il y a un droit. */}
          <dt>{credit ? 'Crédit de TVA à reporter' : 'TVA à reverser'}</dt>
          <dd><Montant>{eur(euros(Math.abs(dossier.aPayer)))}</Montant></dd>
        </div>
      </dl>

      {/* Sous-évaluer une TVA collectée est le sens dangereux de l'erreur :
          c'est celui qui produit un rappel. On le dit plutôt que d'annoncer un
          total qui a l'air complet — c'est un montant qui part sur un
          formulaire officiel. */}
      {!complet && (
        <p className={styles.bandeau} role="status">
          {dossier.encaissementsSansTva.length} encaissement
          {dossier.encaissementsSansTva.length > 1 ? 's ne portent' : ' ne porte'} pas
          de TVA connue&nbsp;: le total collecté est <strong>sous-évalué</strong> d’autant.
          <Info libelle="Pourquoi cette TVA manque">
            La TVA d’une facture ne se recalcule pas&nbsp;: ses lignes ne sont
            pas conservées, et un document peut porter plusieurs taux — 20 %,
            10 %, 5,5 %. Les factures émises depuis que l’application la garde
            la portent&nbsp;; les plus anciennes sont à relever sur le document
            lui-même.
          </Info>
        </p>
      )}

      <h3 className={styles.sousTitre}>
        Encaissements du trimestre ({dossier.encaissements.length})
      </h3>
      {dossier.encaissements.length === 0
        ? <p className={styles.vide}>Aucun encaissement sur ce trimestre.</p>
        : (
          <ul className={styles.listePieces}>
            {dossier.encaissements.map((e) => (
              <li key={e.id}>
                <span className={styles.pieceNom}>
                  {e.numero || 'Sans numéro'} — {e.clientNom || 'Client non renseigné'}
                </span>
                <span className={styles.pieceDate}>{dateCourte(e.encaisseeLe)}</span>
                <span className={styles.pieceMontant}>
                  <Montant>{eur(e.montantHt)}</Montant>
                </span>
                <span className={styles.pieceMontant}>
                  {e.tva === null
                    ? <span className={styles.manquant}>TVA inconnue</span>
                    : <Montant>{eur(e.tva)}</Montant>}
                </span>
              </li>
            ))}
          </ul>
        )}

      <h3 className={styles.sousTitre}>
        Achats déductibles du trimestre ({dossier.achats.length})
      </h3>
      {dossier.achats.length === 0
        ? <p className={styles.vide}>Aucun achat à TVA récupérable sur ce trimestre.</p>
        : (
          <ul className={styles.listePieces}>
            {dossier.achats.map((a) => (
              <li key={a.id}>
                <span className={styles.pieceNom}>{a.libelle || 'Sans libellé'}</span>
                <span className={styles.pieceDate}>{dateCourte(a.payeeLe)}</span>
                <span className={styles.pieceMontant}>
                  <Montant>{eur(a.montantTtc)}</Montant>
                </span>
                <span className={styles.pieceMontant}>
                  <Montant>{eur(a.tvaRecuperable)}</Montant>
                </span>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
