import type { LigneFlux } from '../../state/selecteurs';
import { dateCourte, eur } from '../format';
import { Montant } from './Montant';
import { Pastille } from './FluxCard';
import styles from './FluxCard.module.css';

/** Le détail déplié du flux : toutes les lignes, sur la largeur. Différé — voir `FluxCard`. */
export function DetailDuFlux(
  { blocs }: {
    readonly blocs: readonly { cle: string; titre: string; lignes: readonly LigneFlux[]; vers: string }[];
  }
) {
  return (
    <>
      {blocs.map((d) => <Detail key={d.cle} titre={d.titre} lignes={d.lignes} vers={d.vers} />)}
    </>
  );
}

function Detail(
  { titre, lignes, vers }: { titre: string; lignes: readonly LigneFlux[]; vers: string }
) {
  return (
    <div className={styles.bloc}>
      <h3 className={styles.titreBloc}>{titre} ({lignes.length})</h3>
      <ul className={styles.lignes}>
        {lignes.map((l) => (
          <li key={l.id} className={styles.ligne}>
            <span className={styles.ligneLibelle}>
              {l.libelle}
              {l.date !== null && <span className={styles.ligneDate}> · {dateCourte(l.date)}</span>}
            </span>
            <span className={styles.ligneDroite}>
              <span className={styles.ligneMontant}><Montant>{eur(l.montant)}</Montant></span>
              <a href={vers} className={styles.lienPastille}><Pastille ligne={l} vers={vers} /></a>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
