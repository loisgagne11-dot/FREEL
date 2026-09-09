import type { CraDeMission } from '../../state/selecteurs.activite';
import { Info } from './Info';
import { Montant } from './Montant';
import { Vide } from './Vide';
import { eur } from '../format';
import styles from './CraCard.module.css';

/**
 * Ce que le mois a produit, et la porte vers le document.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE N'EST PLUS LE DOCUMENT, C'EST LE RÉCAPITULATIF
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Cette carte DESSINAIT le compte rendu : une liste de numéros de jours, un
 * bouton d'impression, et le montant valorisé au TJM. Trois défauts en un.
 *
 *  1. **Deux documents pour une même notion.** Le générateur d'Outils produit
 *     désormais le CRA — par semaine, ventilé par lieu, avec les tâches. Deux
 *     rendus du même papier auraient fini par ne plus dire la même chose, et
 *     l'utilisateur n'aurait pas su lequel il venait d'envoyer.
 *  2. **Un montant sur un document client.** Un CRA qui porte un prix se
 *     renégocie au lieu de se signer.
 *  3. **Une liste de numéros de jours.** « 1 2 3 4 7 8 9½ 10 » est exact et
 *     illisible : le client veut le volume, pas un calendrier à recopier.
 *
 * Ce qui reste ici est ce qui a sa place sur l'écran Activité : combien chaque
 * client a consommé ce mois-ci, ET ce que ça vaut. Ce second chiffre ne part
 * PAS chez le client — c'est un indicateur interne, et le dire évite qu'on
 * l'ajoute un jour au document en croyant réparer un oubli.
 */
export function CraCard(
  { cras, periode }: {
    readonly cras: readonly CraDeMission[];
    readonly periode: string;
  }
) {
  const total = cras.reduce((s, c) => s + c.cra.totalJours, 0);

  return (
    <section className={styles.carte} aria-labelledby="titre-cra">
      <header className={styles.entete}>
        <h2 id="titre-cra" className={styles.titreCarte}>
          Ce que le mois a produit
          <Info libelle="D’où viennent ces jours">
            Ils ne sont pas saisis&nbsp;: ils découlent du rythme de tes
            missions et des journées posées au planning. Corriger une journée
            ici met à jour le compte rendu d’activité, qui se génère depuis
            Outils. La valeur au tarif journalier est pour toi&nbsp;: le
            document remis au client ne porte aucun montant.
          </Info>
        </h2>
        {cras.length > 0 && (
          <a className={styles.action} href="#/outils/cra">
            Générer le compte-rendu
          </a>
        )}
      </header>

      {cras.length === 0
        ? (
          <Vide
            message={`Aucun jour travaillé en ${periode.toLowerCase()}. Le compte rendu se
                      remplit depuis le planning, à partir du rythme de tes missions.`}
          />
        )
        : (
          <>
            <dl className={styles.lignes}>
              {cras.map((c) => (
                <div key={`${c.missionId}-${c.entiteId}`} className={styles.ligne}>
                  <dt className={styles.client}>
                    {c.clientNom}
                    {c.libelle !== c.clientNom && (
                      <span className={styles.mission}>{c.libelle}</span>
                    )}
                  </dt>
                  <dd className={styles.valeurs}>
                    <span className={styles.jours}>
                      {formater(c.cra.totalJours)} j
                    </span>
                    <span className={styles.montant}>
                      <Montant>{eur(c.cra.montant)}</Montant>
                    </span>
                  </dd>
                </div>
              ))}
            </dl>

            <p className={styles.total}>
              <span>{formater(total)} jour{total > 1 ? 's' : ''} sur {periode.toLowerCase()}</span>
              <span className={styles.note}>
                un document par client — le CRA ne porte aucun montant
              </span>
            </p>
          </>
        )}
    </section>
  );
}

/** Une quotité lisible : « 4,5 » plutôt que « 4.5 ». */
const formater = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);
