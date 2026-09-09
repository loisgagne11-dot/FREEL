import { useMemo } from 'react';
import type { Mois } from '../../domain/types';
import { destinatairesDuMois } from '../../state/selecteurs.cra';
import { useFaits } from '../../state/store';
import { enJours } from '../documents/DocumentCra';
import { moisLong } from '../format';
import { Info } from '../components/Info';
import styles from './Outils.craCarte.module.css';

/**
 * La porte d'entrée du générateur de CRA, dans l'onglet du même nom.
 *
 * Elle vit à part du générateur lui-même, qui est chargé à l'ouverture : la
 * carte doit s'afficher tout de suite, l'atelier peut attendre le clic.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * « CRA RÉCENTS » DIT CE QUE NOUS SAVONS, PAS CE QUE LE DESSIN MONTRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le handoff pose une liste « CRA récents » avec un statut par ligne —
 * « envoyé le 02/06 », « validé », « archivé ». Aucun de ces trois faits n'est
 * enregistré : un CRA n'est pas un objet du modèle, c'est une VUE du planning,
 * et le prétendre archivé serait inventer.
 *
 * La colonne montre donc ce qui est vrai : les derniers mois qui ont produit
 * des journées, et pour chacun le volume et le nombre de documents à produire.
 * C'est la même liste, remplie de faits plutôt que d'états simulés. Le jour où
 * l'envoi sera enregistré, la date d'envoi viendra s'y poser.
 */
export function CarteCra(
  { annee, onOuvrir }: {
    readonly annee: number;
    readonly onOuvrir: () => void;
  }
) {
  const faits = useFaits((e) => e.faits);

  const recents = useMemo(() => {
    const lignes = [];
    for (let n = 12; n >= 1; n -= 1) {
      const m = `${annee}-${String(n).padStart(2, '0')}` as Mois;
      const destinataires = destinatairesDuMois(faits, m);
      if (destinataires.length === 0) continue;
      lignes.push({
        mois: m,
        destinataires,
        total: destinataires.reduce((s, d) => s + d.jours, 0)
      });
      if (lignes.length === 4) break;
    }
    return lignes;
  }, [faits, annee]);

  return (
    <div className={styles.rangee}>
      <section className={styles.carte} aria-labelledby="titre-cra">
        <h2 id="titre-cra" className={styles.titre}>
          Générer un compte-rendu d’activité
          <Info libelle="D’où vient ce document">
            Il n’est pas saisi : il découle du rythme de tes missions et des
            journées posées au planning. Corriger une journée là-bas le met à
            jour ici. Chaque client a le sien — un CRA se remet au client qui le
            signe, et deux clients sur la même page exposeraient à l’un ce que
            l’autre achète.
          </Info>
        </h2>

        <p className={styles.aide}>
          Le CRA est une <strong>synthèse hebdomadaire</strong> reprise du
          planning : par semaine, les jours par client en{' '}
          <strong>télétravail / sur site</strong> et les tâches accomplies, puis
          les totaux par client et le total du mois. Pas de montants — c’est un
          suivi d’activité, la facture s’occupe des €.
        </p>

        <button type="button" className={styles.action} onClick={onOuvrir}>
          Ouvrir le générateur de CRA
        </button>
      </section>

      <section className={styles.recents} aria-labelledby="titre-recents">
        <h2 id="titre-recents" className={styles.titreRecents}>Mois à documenter</h2>

        {recents.length === 0
          ? (
            <p className={styles.vide}>
              Aucune journée travaillée en {annee}. Le CRA se remplit depuis le
              planning, à partir du rythme de tes missions.
            </p>
          )
          : (
            <ul className={styles.liste}>
              {recents.map((l) => (
                <li key={l.mois} className={styles.ligne}>
                  <span className={styles.moisLigne}>{moisLong(l.mois)}</span>
                  <span className={styles.detailLigne}>
                    {enJours(l.total)} · {l.destinataires.length} document
                    {l.destinataires.length > 1 ? 's' : ''}
                  </span>
                  <span className={styles.clientsLigne}>
                    {l.destinataires.map((d) => d.nom).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
