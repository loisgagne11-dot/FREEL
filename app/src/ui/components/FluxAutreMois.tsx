import type { ReactNode } from 'react';
import type { Euros } from '../../domain/types';
import type { LigneFlux } from '../../state/selecteurs';
import type { FluxDUnAutreMois } from '../../state/selecteurs.flux';
import { Pastille, TitreMois, VERS_FACTURES } from './FluxCard';
import { eur } from '../format';
import { Montant } from './Montant';
import styles from './FluxCard.module.css';

/**
 * Le flux d'un mois passé ou à venir — chargé quand on quitte le mois courant.
 *
 * Même carte, mêmes trois colonnes que `FluxCard`, mais d'autres chiffres :
 * un mois passé se lit en constat (encaissé, payé, versé), un mois à venir en
 * échéances (attendu, dû). Aucun des deux n'a d'« à te verser » — voir l'en-tête de
 * `fluxDUnAutreMois` —, et la colonne le dit au lieu de recopier celui du jour.
 */
export function FluxAutreMois(
  { flux, periode, navigation, courant, onRevenir }: {
    readonly flux: FluxDUnAutreMois;
    readonly periode: string;
    /** La commande du mois, comme sur la carte du mois courant. */
    readonly navigation?: ReactNode;
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
        <h2 id="titre-flux" className={styles.titreCarte}>
          Le flux du mois<TitreMois periode={periode} navigation={navigation} />
        </h2>
        <p className={styles.indice}>{passe ? 'ce qui s’est passé' : 'ce qui est prévu'}</p>
        {navigation !== undefined && <div className={styles.navigation}>{navigation}</div>}
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
          {/* Les échéances du mois — ce qui était, ou sera, dû —, payées ou
              non : le même mot que la colonne du mois courant. */}
          <span className={`${styles.libelle} ${styles.sortie}`}>Dû</span>
          <span className={`${styles.montant} ${styles.sortie}`}>
            <Montant>{eur(flux.sorties.total)}</Montant>
          </span>
          <p className={styles.note}>
            {flux.sorties.lignes.length === 0
              ? 'Aucune échéance ce mois-là'
              : <><Montant>{eur(flux.sorties.regle)}</Montant> payé · <Montant>{eur(aPayer)}</Montant> {passe ? 'impayé' : 'à venir'}</>}
          </p>
          <Lignes lignes={flux.sorties.lignes} vers="#/obligations" />
        </div>

        <div className={styles.colonne}>
          {/* Un mois passé montre ce qui a été VERSÉ, un fait du relevé : ce
              n'est pas l'« à te verser » du jour, et le titre ne lui prête pas
              ce nom. Un mois à venir n'a pas de montant, et dit pourquoi. */}
          <span className={`${styles.libelle} ${styles.entree}`}>{passe ? 'Rémunération' : 'À te verser'}</span>
          <span className={`${styles.montant} ${styles.versable}`}>
            {flux.verse === null ? '—' : <Montant>{eur(flux.verse)}</Montant>}
          </span>
          <p className={styles.note}>
            {passe
              ? (flux.verse === null
                ? 'Sans relevé bancaire, ce qui a été versé ce mois-là ne se lit pas.'
                : 'versé sur ton compte ce mois-là')
              : 'Il se calcule au jour le jour, sur ce qui est réellement entré.'}
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
