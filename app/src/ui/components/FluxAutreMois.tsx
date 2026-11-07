import type { Euros } from '../../domain/types';
import type { LigneFlux } from '../../state/selecteurs';
import type { FluxDUnAutreMois } from '../../state/selecteurs.flux';
import { Pastille, VERS_FACTURES } from './FluxCard';
import { eur } from '../format';
import { Montant } from './Montant';
import styles from './FluxCard.module.css';

/**
 * Le flux d'un mois passé ou à venir — chargé quand on quitte le mois courant.
 *
 * Même carte, mêmes trois colonnes que `FluxCard`, mais d'autres chiffres :
 * un mois passé se lit en constat (encaissé, payé, versé), un mois à venir en
 * échéances (attendu, dû). Aucun des deux n'a de versable — voir l'en-tête de
 * `fluxDUnAutreMois` —, et la colonne le dit au lieu de recopier celui du jour.
 */
export function FluxAutreMois(
  { flux, periode, courant, onRevenir }: {
    readonly flux: FluxDUnAutreMois;
    readonly periode: string;
    /** Le mois courant, en toutes lettres : « Revenir à juin 2026 ». */
    readonly courant: string;
    readonly onRevenir: () => void;
  }
) {
  const passe = flux.temps === 'passe';
  const aPayer = (flux.sorties.total - flux.sorties.regle) as Euros;

  return (
    <section className={styles.carte} aria-labelledby="titre-flux">
      <header className={styles.entete}>
        <h2 id="titre-flux" className={styles.titreCarte}>Le flux du mois · {periode}</h2>
        <p className={styles.indice}>{passe ? 'ce qui s’est passé' : 'ce qui est prévu'}</p>
      </header>

      <div className={styles.colonnes}>
        <div className={styles.colonne}>
          <span className={`${styles.libelle} ${styles.entree}`}>Entrées</span>
          <span className={`${styles.montant} ${styles.entree}`}>
            <Montant>{eur(passe ? flux.entrees.encaisse : flux.entrees.attendu)}</Montant>
          </span>
          <p className={styles.note}>
            {passe
              ? (flux.entrees.attendu > 0
                ? <>encaissé · <Montant>{eur(flux.entrees.attendu)}</Montant> toujours attendu</>
                : 'encaissé')
              : 'attendu, d’après l’échéance des factures émises'}
          </p>
          <Lignes lignes={flux.entrees.lignes} vers={VERS_FACTURES} />
        </div>

        <div className={styles.colonne}>
          <span className={`${styles.libelle} ${styles.sortie}`}>Sorties</span>
          <span className={`${styles.montant} ${styles.sortie}`}>
            <Montant>{eur(flux.sorties.total)}</Montant>
          </span>
          <p className={styles.note}>
            {flux.sorties.lignes.length === 0
              ? 'Aucune échéance ce mois-là'
              : <><Montant>{eur(flux.sorties.regle)}</Montant> payé · <Montant>{eur(aPayer)}</Montant> {passe ? 'impayé' : 'à venir'}</>}
          </p>
          <Lignes lignes={flux.sorties.lignes} vers="#/argent" />
        </div>

        <div className={styles.colonne}>
          <span className={`${styles.libelle} ${styles.entree}`}>Rémunération</span>
          <span className={`${styles.montant} ${styles.versable}`}>
            {flux.verse === null ? '—' : <Montant>{eur(flux.verse)}</Montant>}
          </span>
          <p className={styles.note}>
            {passe
              ? (flux.verse === null
                ? 'Sans relevé bancaire, ce qui a été versé ce mois-là ne se lit pas.'
                : 'versé sur ton compte ce mois-là')
              : 'Le versable se calcule au jour le jour, sur ce qui est réellement entré.'}
          </p>
          <button type="button" className={`${styles.action} ${styles.dansLaColonne}`} onClick={onRevenir}>
            Revenir à {courant}
          </button>
        </div>
      </div>

      {/* Sur téléphone, le bouton du retour quitte la colonne (trop étroite)
          pour passer sous les trois totaux, comme « Verser » sur la carte du
          mois courant. */}
      <div className={styles.pied}>
        <button type="button" className={`${styles.action} ${styles.sousLesColonnes}`} onClick={onRevenir}>
          Revenir à {courant}
        </button>
      </div>
    </section>
  );
}

function Lignes({ lignes, vers }: { readonly lignes: readonly LigneFlux[]; readonly vers: string }) {
  if (lignes.length === 0) return null;
  return (
    <ul className={styles.items}>
      {lignes.map((l) => (
        <li key={l.id}>
          <a className={styles.item} href={vers}>
            <span className={styles.itemNom}>{l.libelle}</span>
            <Pastille ligne={l} vers={vers} />
          </a>
        </li>
      ))}
    </ul>
  );
}
