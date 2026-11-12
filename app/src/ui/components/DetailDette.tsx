import { useState } from 'react';
import type { DetailDette, LigneDette, StatutLigneDette } from '../../domain/calculs/detailDette';
import { declarerPeriode, enregistrerPaiement } from '../../state/ecritures.echeances';
import { dateDuJour } from '../../state/selecteurs';
import type { DateISO, Euros } from '../../domain/types';
import { FormulairePaiement } from './FormulairePaiement';
import { Montant } from './Montant';
import { useToast } from './Toasts';
import { dateCourte, eur, moisLong } from '../format';
import styles from './DetailDette.module.css';

/**
 * Le détail d'une dette, et ce qu'il reste à faire dessus.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN TOTAL NE SE VÉRIFIE PAS, ET NE S'AGIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La vignette de provision disait « 5 414 € d'URSSAF ». C'est le bon chiffre,
 * et il ne permet ni de vérifier ni d'agir : on ne sait pas quel mois n'a pas
 * été déclaré, ni quel appel attend son règlement, ni pourquoi le total est
 * celui-là plutôt qu'un autre.
 *
 * Ce panneau répond aux trois : d'où sort le montant, où il en est, et quel
 * geste le fait avancer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE GESTE SUIT L'ORIGINE DE LA LIGNE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une dette ESTIMÉE avance en déclarant sa période — après quoi elle repasse
 * en dette appelée. Une dette APPELÉE se solde en enregistrant son paiement.
 * Proposer « enregistrer le paiement » sur une dette que personne n'a encore
 * appelée ferait inscrire un règlement sans appel en face : le rapprochement
 * bancaire ne retrouverait rien, et le montant sortirait deux fois le jour où
 * l'appel arrive vraiment.
 */
export function PanneauDetailDette({ detail }: { readonly detail: DetailDette }) {
  return (
    <div className={styles.detail}>
      <dl className={styles.totaux}>
        <div className={styles.totalBloc}>
          <dt>Reste à sortir</dt>
          <dd className={styles.resteValeur}><Montant>{eur(detail.reste)}</Montant></dd>
        </div>
        <div className={styles.totalBloc}>
          <dt>Déjà payé</dt>
          <dd className={styles.payeValeur}><Montant>{eur(detail.paye)}</Montant></dd>
        </div>
      </dl>

      {/*
        * UN TOTAL PARTIEL SE DIT, sinon il a l'air d'une réponse.
        *
        * Le barème ne couvre pas toujours le mois d'un encaissement ancien.
        * On s'abstient alors de calculer sa part plutôt que d'inventer un
        * taux — mais le total affiché est incomplet d'autant, et le lecteur
        * n'a aucun moyen de le deviner.
        */}
      {detail.nonCalculables.length > 0 && (
        <p className={styles.abstention} role="status">
          {detail.nonCalculables.length === 1 ? 'Un mois n’est pas compté' : `${detail.nonCalculables.length} mois ne sont pas comptés`}
          {' '}dans ce total&nbsp;: {detail.nonCalculables[0]?.motif}
        </p>
      )}

      {detail.impotRevenu !== null && (
        <p className={styles.provisionIr} role="status">
          {detail.impotRevenu.statut === 'refuse'
            ? <>Impôt sur le revenu non provisionné&nbsp;: {detail.impotRevenu.motif}</>
            : (
              <>
                Impôt sur le revenu à mettre de côté&nbsp;:{' '}
                <strong><Montant>{eur(detail.impotRevenu.valeur)}</Montant></strong>
                {' '}en plus des lignes ci-dessous
                {detail.impotRevenu.statut === 'hypothese' && ' (estimation)'}
              </>
            )}
        </p>
      )}

      {/* « dont » : la part autoliquidée est déjà dans la provision de TVA,
          elle ne s'y ajoute pas. Pas de date : aucune n'est connue. */}
      {detail.tvaAutoliquidee !== null && detail.tvaAutoliquidee.statut !== 'refuse' && (
        <p className={styles.provisionIr} role="status">
          dont TVA autoliquidée sur tes achats de services dans l’Union&nbsp;:{' '}
          <strong><Montant>{eur(detail.tvaAutoliquidee.valeur)}</Montant></strong>
          {' '}— date de dépôt à confirmer auprès de ton service des impôts
        </p>
      )}

      {detail.annees.length === 0 && detail.impotRevenu === null && detail.tvaAutoliquidee === null
        ? (
          <p className={styles.vide}>
            Rien à ce titre pour l’instant. Cette enveloppe se remplira quand un
            appel arrivera, ou quand un encaissement produira sa part.
          </p>
        )
        : detail.annees.map((a) => (
          <section key={a.annee} className={styles.annee}>
            <h3 className={styles.anneeTitre}>
              {a.annee}
              <span className={styles.anneeReste}>
                <Montant>{eur(a.reste)}</Montant> à sortir
              </span>
            </h3>
            <ul className={styles.lignes}>
              {a.lignes.map((l) => (
                <Ligne key={`${l.mois}-${l.echeanceId ?? 'estime'}`} ligne={l} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

const LIBELLE_STATUT: Readonly<Record<StatutLigneDette, string>> = {
  a_declarer: 'à déclarer',
  a_payer: 'à payer',
  payee: 'payée'
};

/** Une ligne du détail, avec le geste qui la fait avancer. */
function Ligne({ ligne }: { readonly ligne: LigneDette }) {
  const signaler = useToast();
  const [confirme, setConfirme] = useState(false);

  function declarer(): void {
    // Datée du jour : c'est en sortant du site de l'URSSAF qu'on la coche.
    // La date se corrige dans l'échéancier.
    declarerPeriode([ligne.mois], dateDuJour());
    signaler(
      `${moisLong(ligne.mois)} marqué déclaré. Sa dette quitte l’estimation `
      + 'et attend son appel.'
    );
  }

  function payer(payeeLe: DateISO, montantPaye: Euros | null): void {
    if (ligne.echeanceId === null) return;
    enregistrerPaiement(ligne.echeanceId, payeeLe, montantPaye);
    signaler(`Paiement enregistré. Le solde s’en trouve allégé d’autant.`);
  }

  return (
    <li className={`${styles.ligne} ${styles[ligne.statut]}`}>
      <span className={styles.ligneTexte}>
        <span className={styles.ligneLibelle}>{ligne.libelle}</span>
        <span className={styles.ligneMeta}>
          <span className={`${styles.statut} ${styles[`statut_${ligne.statut}`]}`}>
            {LIBELLE_STATUT[ligne.statut]}
          </span>
          {ligne.echeanceLe !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span>échéance le {dateCourte(ligne.echeanceLe)}</span>
            </>
          )}
        </span>
      </span>

      <span className={styles.ligneMontant}><Montant>{eur(ligne.montant)}</Montant></span>

      {/* Le geste n'apparaît que là où il a un sens. Un bouton présent qui ne
          ferait rien apprend à ne plus le regarder. */}
      {ligne.statut === 'a_declarer' && (
        <button type="button" className={styles.action} onClick={declarer}>
          Marquer déclaré
        </button>
      )}

      {/*
        * ENREGISTRER UN PAIEMENT DEMANDE UNE CONFIRMATION.
        *
        * Déclarer une période se défait (`annulerDeclaration`). Un
        * paiement enregistré fait bouger le solde et le disponible, donc ce
        * qu'on croit pouvoir se verser. Un clic malencontreux sur une liste
        * qu'on parcourt coûterait plus cher que le clic de confirmation.
        */}
      {ligne.statut === 'a_payer' && !confirme && (
        <button type="button" className={styles.action} onClick={() => setConfirme(true)}>
          Enregistrer le paiement
        </button>
      )}
      {/* « Payé aujourd'hui » ne laissait ni la date ni le montant : un
          prélèvement passé hier tombait dans le mauvais mois le premier du
          mois, et l'écart à l'appel partait à l'échéancier. Le formulaire de
          l'échéancier, le même partout. */}
      {ligne.statut === 'a_payer' && confirme && (
        <div className={styles.confirmation}>
          <FormulairePaiement
            focaliser
            montantAppele={ligne.montant}
            libelleValider="Confirmer le paiement"
            onValider={payer}
            onAnnuler={() => setConfirme(false)}
          />
        </div>
      )}
    </li>
  );
}
