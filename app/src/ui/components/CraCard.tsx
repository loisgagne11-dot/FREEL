import type { CraDeMission } from '../../state/selecteurs.activite';
import { Info } from './Info';
import { Montant } from './Montant';
import { Vide } from './Vide';
import { eur } from '../format';
import styles from './CraCard.module.css';

/**
 * Le compte rendu d'activité — le livrable de fin de mois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IL N'EST PAS SAISI, IL EST PRODUIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Rien ne se remplit ici. Le CRA découle du rythme de la mission et des
 * ajustements posés au planning : c'est la sortie de la chaîne, pas une
 * étape de plus. Le saisir une seconde fois serait l'occasion de le saisir
 * autrement — et un CRA qui contredit le planning ne prouve rien.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN DOCUMENT PAR MISSION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le CRA se remet au client, qui le signe. Fusionner deux missions dans un
 * document unique exposerait à l'un ce que l'autre achète — et un client qui
 * découvre le volume consacré à son concurrent ne le prend jamais bien. À
 * l'impression, chaque mission part donc sur sa propre page.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PAS DE BIBLIOTHÈQUE PDF
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Comme pour les factures : « Imprimer → Enregistrer en PDF » donne le
 * fichier, sans les 419 Ko que l'ancienne application chargeait avant la
 * première ligne utile.
 */
export function CraCard(
  { cras, periode }: {
    readonly cras: readonly CraDeMission[];
    readonly periode: string;
  }
) {
  return (
    <section className={styles.carte} aria-labelledby="titre-cra">
      <header className={styles.entete}>
        <h2 id="titre-cra" className={styles.titreCarte}>
          Compte rendu d’activité
          <Info libelle="D’où vient ce document">
            Il n’est pas saisi&nbsp;: il découle du rythme de la mission et des
            ajustements posés au planning. Corriger une journée là-bas le met à
            jour ici. Chaque mission a son document — un CRA se remet au client
            qui le signe, et deux missions sur la même page exposeraient à l’un
            ce que l’autre achète.
          </Info>
        </h2>
        {cras.length > 0 && (
          <button type="button" className={styles.action} onClick={() => window.print()}>
            Imprimer ou enregistrer en PDF
          </button>
        )}
      </header>

      {cras.length === 0
        ? (
          <Vide
            message={`Aucun jour travaillé en ${periode.toLowerCase()}. Le compte rendu se
                      remplit depuis le planning, à partir du rythme de vos missions.`}
          />
        )
        : (
          <div className={styles.document}>
            {cras.map((c) => (
              <article key={c.missionId} className={styles.mission}>
                <p className={styles.titreMission}>{c.libelle} — {periode}</p>
                {c.clientNom !== '' && <p className={styles.client}>{c.clientNom}</p>}

                <ul className={styles.jours}>
                  {c.cra.lignes.map((l) => (
                    <li
                      key={l.date}
                      className={`${styles.jour} ${l.quotite < 1 ? styles.demi : ''}`}
                    >
                      {Number(l.date.slice(8, 10))}
                      {l.quotite < 1 && <span aria-label="demi-journée"> ½</span>}
                    </li>
                  ))}
                </ul>

                <p className={styles.totaux}>
                  <span>
                    <strong>{formater(c.cra.totalJours)}</strong> jour
                    {c.cra.totalJours > 1 ? 's' : ''} travaillé
                    {c.cra.totalJours > 1 ? 's' : ''}
                  </span>
                  <strong><Montant>{eur(c.cra.montant)}</Montant></strong>
                </p>
              </article>
            ))}
          </div>
        )}
    </section>
  );
}

/** Une quotité lisible : « 4,5 » plutôt que « 4.5 ». */
const formater = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);
