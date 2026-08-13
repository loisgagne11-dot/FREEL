import type { FluxDuMois, LigneFlux } from '../../state/selecteurs';
import { Info } from './Info';
import { dateCourte, eur } from '../format';
import styles from './FluxCard.module.css';
import { Montant } from './Montant';

/**
 * « Le flux du mois » — la carte centrale du Pilote dans la spec de design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS COLONNES PARCE QUE CE SONT TROIS QUESTIONS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Combien est rentré », « combien doit sortir », « combien reste-t-il pour
 * moi » ne se répondent pas avec le même chiffre. Empilées dans une liste,
 * elles obligent à faire la soustraction de tête — et c'est exactement le
 * calcul qu'on se trompe à faire un jour de fatigue, celui qui fait qu'on se
 * verse de l'argent déjà dû.
 *
 * Côte à côte, l'écart se voit sans être calculé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉTAIL EST REPLIÉ, PAS ABSENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chaque colonne porte sa liste — quelles factures, quelles échéances. Le
 * chiffre seul ne permet pas de vérifier ; la liste dépliée d'emblée noierait
 * le chiffre. `<details>` fait ce travail sans une ligne de JavaScript, reste
 * ouvrable au clavier, et se laisse imprimer.
 */
export function FluxCard(
  { flux, periode, versementPossible }: {
    readonly flux: FluxDuMois;
    readonly periode: string;
    /**
     * Le versement est-il seulement possible ?
     *
     * Un bouton « Verser » actif alors que le versable est nul invite à un
     * geste qui ne peut pas aboutir.
     */
    readonly versementPossible: boolean;
  }
) {
  return (
    <section className={styles.carte} aria-labelledby="titre-flux">
      <header className={styles.entete}>
        <h2 id="titre-flux" className={styles.titreCarte}>
          Le flux du mois
          <Info libelle="Ce que montrent les trois colonnes">
            Ce qui est <strong>entré</strong> sur le mois, ce qui doit en
            <strong> sortir</strong>, et ce qu’il reste pour vous. L’argent en
            attente n’est pas borné au mois&nbsp;: une facture impayée
            n’appartient à aucun mois, et la masquer ferait disparaître de
            l’écran celle qu’il faut relancer.
          </Info>
        </h2>
        <p className={styles.periode}>{periode}</p>
      </header>

      <div className={styles.colonnes}>
        <div className={styles.colonne}>
          <span className={styles.libelle}>Entrées</span>
          <span className={`${styles.montant} ${styles.entree}`}>
            <Montant>{eur(flux.entrees.encaisse)}</Montant>
          </span>
          <p className={styles.note}>
            {flux.entrees.enAttente > 0
              ? <><Montant>{eur(flux.entrees.enAttente)}</Montant> encore en attente</>
              : 'Rien en attente de règlement.'}
          </p>
          <Detail titre="Voir les encaissements" lignes={flux.entrees.lignes} />
        </div>

        <div className={styles.colonne}>
          <span className={styles.libelle}>Sorties</span>
          <span className={`${styles.montant} ${styles.sortie}`}>
            <Montant>{eur(flux.sorties.total)}</Montant>
          </span>
          <p className={styles.note}>
            {flux.sorties.total > 0
              ? (
                <>
                  <Montant>{eur(flux.sorties.aProvisionner)}</Montant> à provisionner sur les
                  recettes encaissées, <Montant>{eur(flux.sorties.constate)}</Montant> déjà
                  constaté.
                </>
              )
              : 'Rien à mettre de côté pour l’instant.'}
          </p>
          <Detail titre="Voir les échéances" lignes={flux.sorties.lignes} />
        </div>

        <div className={styles.colonne}>
          <span className={styles.libelle}>Rémunération</span>
          <span className={styles.montant}><Montant>{eur(flux.remuneration.versable)}</Montant></span>
          <p className={styles.note}>
            Hors provision&nbsp;: <Montant>{eur(flux.remuneration.provisions)}</Montant> restent de
            côté pour les échéances à venir.
          </p>
          {versementPossible
            ? <a className={styles.action} href="#/argent">Verser sur mon compte</a>
            : (
              <p className={styles.note}>
                Rien n’est versable&nbsp;: les provisions couvrent tout le
                disponible.
              </p>
            )}
        </div>
      </div>
    </section>
  );
}

/**
 * Le détail d'une colonne.
 *
 * Rien à replier quand il n'y a rien : un `<details>` vide se déplie sur du
 * néant, et apprend que les replis ne contiennent rien.
 */
function Detail({ titre, lignes }: { titre: string; lignes: readonly LigneFlux[] }) {
  if (lignes.length === 0) return null;
  return (
    <details className={styles.repli}>
      <summary>{titre} ({lignes.length})</summary>
      <ul className={styles.lignes}>
        {lignes.map((l) => (
          <li key={l.id} className={styles.ligne}>
            <span className={styles.ligneLibelle}>
              {l.libelle}
              {l.date !== null && <> · {dateCourte(l.date)}</>}
              {!l.regle && <> · en attente</>}
            </span>
            <span className={styles.ligneMontant}><Montant>{eur(l.montant)}</Montant></span>
          </li>
        ))}
      </ul>
    </details>
  );
}
