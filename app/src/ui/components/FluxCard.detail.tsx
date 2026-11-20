import type { LigneFlux } from '../../state/selecteurs';
import { dateCourte, eur } from '../format';
import { Montant } from './Montant';
import { Pastille, gesteDe, pointable } from './FluxCard';
import styles from './FluxCard.module.css';

/**
 * Où mène une ligne : une sortie ouvre le dossier de l'obligation qui porte
 * son échéance (`#/obligations/saisie-<id>`, lot 53) — arriver en haut de
 * l'écran faisait chercher la ligne une seconde fois. L'estimation « à
 * provisionner » n'est pas une échéance : elle garde l'écran. Écrite ici et
 * dans le flux d'un autre mois plutôt que partagée : un module commun aux
 * deux paquets différés s'inscrivait dans la liste de préchargement du
 * premier rendu, dont le budget est plein.
 */
const versLaLigne = (vers: string, l: LigneFlux): string =>
  (vers === '#/obligations' && l.id !== 'a-provisionner' ? `${vers}/saisie-${encodeURIComponent(l.id)}` : vers);


/** Le détail déplié du flux : toutes les lignes, sur la largeur. Différé — voir `FluxCard`. */
export function DetailDuFlux(
  { blocs }: {
    readonly blocs: readonly {
      cle: string; titre: string; lignes: readonly LigneFlux[]; vers: string;
      onPointer?: ((id: string) => void) | undefined;
    }[];
  }
) {
  return (
    <>
      {blocs.map((d) => (
        <Detail key={d.cle} titre={d.titre} lignes={d.lignes} vers={d.vers} onPointer={d.onPointer} />
      ))}
    </>
  );
}

/**
 * Sur téléphone, c'est ici qu'on voit les lignes : la pastille d'une facture en
 * attente ou d'une échéance à payer y ouvre le même panneau qu'en grand écran.
 */
function Detail(
  { titre, lignes, vers, onPointer }: {
    titre: string; lignes: readonly LigneFlux[]; vers: string;
    onPointer?: ((id: string) => void) | undefined;
  }
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
              {onPointer !== undefined && pointable(l)
                ? (
                  <button type="button" className={styles.boutonPastille} onClick={() => onPointer(l.id)}>
                    <Pastille ligne={l} vers={vers} />
                    {' '}<span className={styles.horsEcran}>— {gesteDe(vers)} : {l.libelle}</span>
                  </button>
                )
                : <a href={versLaLigne(vers, l)} className={styles.lienPastille}><Pastille ligne={l} vers={vers} /></a>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
