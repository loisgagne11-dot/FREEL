import { Suspense, lazy, useMemo } from 'react';
import { useFaits } from '../../state/store';
import { etatFacture, reediterFacture } from '../../state/selecteurs.facture';
import styles from './Facture.module.css';
import { Facturier } from '../components/Facturier';
import { useRoute } from '../useRoute';
import { Apercu, useSortieDocument } from '../documents/Apercu';

/**
 * La rédaction et le document arrivent à la demande.
 *
 * On ouvre le facturier pour CONSULTER — voir ce qui est parti, ce qui reste
 * à rentrer, qui relancer. Rédiger est un geste de fin de mois, revoir un
 * document émis un geste plus rare encore. Les charger d'office faisait
 * dépasser le budget de l'écran différé le plus lourd ; le budget ne se
 * relève pas, on extrait.
 */
const NouvelleFacture = lazy(() => import('./Facture.redaction')
  .then((m) => ({ default: m.NouvelleFacture })));
/* Le document vit dans `documents/`, avec sa feuille autonome : c'est le
   MÊME papier que la rédaction montre en aperçu et que le fichier téléchargé
   emporte. Deux rendus d'une facture finiraient par ne plus s'accorder, et
   celui qu'on relit ne serait pas celui qui part. */
const DocumentFacture = lazy(() => import('../documents/DocumentFacture')
  .then((m) => ({ default: m.DocumentFacture })));


/** Le temps que le module de rédaction arrive. */
function EnAttente() {
  return <p className={styles.bandeau} role="status">Un instant…</p>;
}

export function Facture({ annee }: { readonly annee?: number } = {}) {
  /**
   * La vue vient de l'URL, pas d'un état local.
   *
   * `#/facture/nouvelle` ouvre la rédaction. Sans cela, l'action rapide
   * « Nouvelle facture » du Pilote déposerait sur la liste, et il faudrait
   * chercher le bouton une seconde fois — le reproche exact fait à l'ancienne
   * version. Corollaire gratuit : le bouton « retour » du navigateur ramène
   * au facturier, ce qu'un état local ne savait pas faire.
   */
  const { sousRoute, naviguerVers } = useRoute();

  if (sousRoute === 'nouvelle') {
    return (
      <Suspense fallback={<EnAttente />}>
        <NouvelleFacture onListe={() => naviguerVers('facture')} />
      </Suspense>
    );
  }

  /*
   * `#/facture/2026-001` ROUVRE une facture déjà émise.
   *
   * Le numéro dans l'URL plutôt qu'un état local, pour la même raison que
   * `nouvelle` juste au-dessus : le bouton « retour » du navigateur ramène au
   * facturier, et le lien se partage — c'est celui qu'on recolle dans un
   * courriel quand un client redemande sa facture.
   */
  if (sousRoute !== null && sousRoute !== '') {
    return (
      <FactureEmise
        numero={decodeURIComponent(sousRoute)}
        onListe={() => naviguerVers('facture')}
      />
    );
  }

  return (
    <>
      <header className={styles.entete}>
        <h1 className={styles.titre}>Facturer</h1>
      </header>
      <Facturier
        onNouvelle={() => naviguerVers('facture', 'nouvelle')}
        onRevoir={(numero) => naviguerVers('facture', encodeURIComponent(numero))}
        {...(annee === undefined ? {} : { annee })}
      />
    </>
  );
}

/**
 * Une facture DÉJÀ ÉMISE, rouverte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ELLE N'AVAIT AUCUN CHEMIN DE RETOUR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le document n'existait qu'à l'instant de l'émission, dans l'écran de
 * rédaction juste en dessous. Passé cet instant : plus moyen de le revoir, ni
 * de le renvoyer à un client qui dit ne pas l'avoir reçu — la réponse la plus
 * courante à une relance — ni même d'en garder une copie.
 *
 * Rien n'est stocké de plus pour autant : le document se reconstruit depuis
 * la recette, l'entreprise et le carnet. Et quand il ne peut pas l'être
 * fidèlement, on le DIT plutôt que d'en produire un approchant : il porterait
 * le numéro de l'original, donc serait indiscernable de lui pour qui le
 * reçoit.
 */
function FactureEmise(
  { numero, onListe }: { readonly numero: string; readonly onListe: () => void }
) {
  const faits = useFaits((e) => e.faits);
  const reedition = useMemo(() => reediterFacture(faits, numero), [faits, numero]);

  if (reedition.cas === 'impossible') {
    return (
      <>
        <header className={styles.entete}>
          <h1 className={styles.titre}>Facture {numero}</h1>
          <div className={styles.actions}>
            <button type="button" className={styles.action} onClick={onListe}>
              Retour au facturier
            </button>
          </div>
        </header>
        <p className={styles.bandeau} role="status">
          Cette facture ne peut pas être rééditée. {reedition.motif}
        </p>
      </>
    );
  }

  const etat = etatFacture(reedition.facture);
  const sortie = useSortieDocument();

  return (
    <>
      <header className={styles.entete}>
        <h1 className={styles.titre}>Facture {numero}</h1>
        <div className={styles.actions}>
          <button type="button" className={styles.actionPrincipale}
            onClick={() => sortie('telecharger', `Facture ${numero}`,
              ['Facture', numero, reedition.facture.destinataire.nom])}>
            Télécharger
          </button>
          <button type="button" className={styles.action}
            onClick={() => sortie('imprimer', `Facture ${numero}`,
              ['Facture', numero, reedition.facture.destinataire.nom])}>
            Imprimer
          </button>
          <button type="button" className={styles.action} onClick={onListe}>
            Retour au facturier
          </button>
        </div>
      </header>

      {/* Le détail des lignes n'est pas conservé : le document se rétablit en
          UNE désignation, celle qui a été enregistrée à l'émission. On le dit,
          parce qu'une facture d'origine à plusieurs lignes ne se présentera
          pas ici comme elle est partie. */}
      <p className={styles.bandeau} role="status">
        Document rétabli depuis ton livre des recettes. Les montants sont ceux
        qui ont été enregistrés à l’émission&nbsp;; le détail des lignes, lui,
        n’est pas conservé et tient en une désignation.
      </p>

      <Suspense fallback={<EnAttente />}>
        <Apercu>
          <DocumentFacture etat={etat} brouillon={false} />
        </Apercu>
      </Suspense>
    </>
  );
}
