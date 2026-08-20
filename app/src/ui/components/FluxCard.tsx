import { useId, useState } from 'react';
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
 * CÔTE À CÔTE Y COMPRIS SUR TÉLÉPHONE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La version précédente ne mettait les colonnes côte à côte qu'au-delà de
 * 900 px : sur téléphone — là où l'application est réellement consultée — les
 * trois chiffres s'empilaient sur trois écrans, et la comparaison qui fait
 * tout l'intérêt de la carte redevenait un calcul de tête.
 *
 * La spec de design tranche autrement (`v1.11.css`, media query téléphone) :
 * `.flux3{grid-template-columns:repeat(3,1fr)}`, libellé à 9 px, montant à
 * 19 px, sous-ligne à 10 px. Trois colonnes tiennent dans 390 px à condition
 * que chacune se réduise au strict nécessaire — un libellé, un montant, une
 * sous-ligne courte. C'est ce que fait ce composant, et c'est pourquoi les
 * sous-lignes sont des fragments et non des phrases.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉTAIL EST REPLIÉ, PAS ABSENT — ET IL EST HORS DES COLONNES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chaque colonne a sa liste — quelles factures, quelles échéances. Mais une
 * liste dans une colonne de 110 px n'est plus lisible : la spec s'en sort en
 * masquant les montants du détail sur téléphone, ce qu'on refuse ici — un
 * « voir le détail » qui montre des libellés sans montants ne détaille rien.
 *
 * Les listes sont donc sorties des colonnes, sous un seul dépliant qui les
 * ouvre ensemble. Elles occupent toute la largeur en portrait, et se
 * réalignent sous leur colonne quand la place existe.
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
  const [ouvert, setOuvert] = useState(false);
  const idDetail = useId();

  const detaillables = [
    { cle: 'entrees', titre: 'Encaissements', lignes: flux.entrees.lignes },
    { cle: 'sorties', titre: 'Échéances', lignes: flux.sorties.lignes }
  ].filter((d) => d.lignes.length > 0);

  return (
    <section className={styles.carte} aria-labelledby="titre-flux">
      <header className={styles.entete}>
        <h2 id="titre-flux" className={styles.titreCarte}>
          Le flux du mois
          <Info libelle="Ce que montrent les trois colonnes">
            Ce qui est <strong>entré</strong> sur le mois, ce qui doit en
            <strong> sortir</strong>, et ce qu’il reste pour toi. L’argent en
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
              : 'Rien en attente'}
          </p>
        </div>

        <div className={styles.colonne}>
          <span className={styles.libelle}>Sorties</span>
          <span className={`${styles.montant} ${styles.sortie}`}>
            <Montant>{eur(flux.sorties.total)}</Montant>
          </span>
          {/* Deux fragments plutôt qu'une phrase : dans une colonne étroite,
              une phrase se hache en six lignes et le rapport entre les deux
              montants — le seul renseignement utile — s'y perd. */}
          <p className={styles.note}>
            {flux.sorties.total > 0
              ? (
                <>
                  <span className={styles.fragment}>
                    <Montant>{eur(flux.sorties.aProvisionner)}</Montant> à provisionner
                  </span>
                  <span className={styles.fragment}>
                    <Montant>{eur(flux.sorties.constate)}</Montant> déjà constaté
                  </span>
                </>
              )
              : 'Rien à mettre de côté'}
          </p>
        </div>

        <div className={styles.colonne}>
          <span className={styles.libelle}>Rémunération</span>
          <span className={styles.montant}><Montant>{eur(flux.remuneration.versable)}</Montant></span>
          <p className={styles.note}>
            {versementPossible
              ? <><Montant>{eur(flux.remuneration.provisions)}</Montant> restent de côté</>
              : 'Rien n’est versable'}
          </p>
        </div>
      </div>

      <div className={styles.pied}>
        {versementPossible && (
          <a className={`${styles.action} ${styles.principale}`} href="#/argent">
            Verser sur mon compte
          </a>
        )}
        {detaillables.length > 0 && (
          <button
            type="button"
            className={styles.action}
            aria-expanded={ouvert}
            aria-controls={idDetail}
            onClick={() => setOuvert((o) => !o)}
          >
            {ouvert ? 'Masquer le détail' : 'Voir le détail'}
          </button>
        )}
      </div>

      {/* Le conteneur existe toujours pour que `aria-controls` désigne quelque
          chose ; c'est son contenu qui apparaît. */}
      <div id={idDetail} className={styles.details} hidden={!ouvert}>
        {detaillables.map((d) => (
          <Detail key={d.cle} titre={d.titre} lignes={d.lignes} />
        ))}
      </div>
    </section>
  );
}

/** Une liste de détail, sous son intitulé. */
function Detail({ titre, lignes }: { titre: string; lignes: readonly LigneFlux[] }) {
  return (
    <div className={styles.bloc}>
      <h3 className={styles.titreBloc}>{titre} ({lignes.length})</h3>
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
    </div>
  );
}
