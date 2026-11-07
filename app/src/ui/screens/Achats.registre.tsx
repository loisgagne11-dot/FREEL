import { Montant } from '../components/Montant';
import type { LigneDepense } from '../../state/selecteurs.achats';
import type { EtatRapprochement } from '../../domain/calculs/depenses';
import type { Periode } from '../../domain/calculs/periode';
import { eurExact } from '../format';
import styles from './Achats.module.css';

/**
 * Le registre des achats, en tableau.
 *
 * Le tableau défile DANS sa carte (`.defilement`) et jamais dans la page : sur
 * téléphone, six colonnes ne tiennent pas, et un débordement de la page
 * décalerait toute la mise en page.
 *
 * La ligne entière ouvre la dépense, comme l'ancienne liste. Le bouton du
 * fournisseur n'est là que pour le clavier : il ne porte pas de gestionnaire,
 * le clic remonte à la ligne.
 */
export function RegistreAchats(
  { lignes, periode, recurrentes, totalTtc, totalTva, onOuvrir }: {
    readonly lignes: readonly LigneDepense[];
    readonly periode: Periode;
    readonly recurrentes: ReadonlySet<string>;
    readonly totalTtc: number;
    readonly totalTva: number;
    readonly onOuvrir: (id: string) => void;
  }
) {
  return (
    <div className={styles.defilement}>
      <table className={styles.tableau}>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Fournisseur</th>
            <th scope="col" className={styles.numerique}>TTC</th>
            <th scope="col" className={styles.numerique}>dont TVA</th>
            <th scope="col">Justificatif</th>
            <th scope="col">Rapprochement</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne) => {
            const { depense, tva } = ligne;
            return (
              <tr key={depense.id} className={styles.rangee} onClick={() => onOuvrir(depense.id)}>
                <td className={depense.payeeLe === null ? styles.manquant : undefined}>
                  {depense.payeeLe === null ? 'Date à saisir' : jourMois(depense.payeeLe)}
                </td>
                <td>
                  <button type="button" className={styles.ouvrir}>
                    <span className={styles.ligneLibelle}>
                      {depense.fournisseur || 'Fournisseur non renseigné'}
                      {recurrentes.has(depense.id) && (
                        <span role="img" aria-label="récurrente" title="récurrente" className={styles.recurrente}>
                          {' '}↻
                        </span>
                      )}
                    </span>
                    <span className={styles.ligneMeta}>{depense.libelle || 'Sans libellé'}</span>
                  </button>
                </td>
                <td className={styles.numerique}><Montant>{eurExact(depense.montantTtc)}</Montant></td>
                <td className={styles.numerique} title={tva.motifNonRecuperable === null ? undefined : motif(ligne)}>
                  {tva.motifNonRecuperable === null
                    ? <Montant>{eurExact(tva.recuperable)}</Montant>
                    : '—'}
                </td>
                <td>
                  {depense.justificatifId === null
                    ? <button type="button" className={`${styles.lienPiece} ${styles.manquant}`}><span aria-hidden="true">⚠ </span>à joindre</button>
                    : <span className={styles.pieceJointe}><span aria-hidden="true">✓ </span>pièce jointe</span>}
                </td>
                <td>
                  <span className={styles.etatRapprochement} data-etat={ligne.rapprochement}>
                    <span aria-hidden="true">{ligne.rapprochement === 'rapproche' ? '✓ ' : ligne.rapprochement === 'en_attente' ? '◷ ' : ''}</span>
                    {etat(ligne.rapprochement)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              Total {periode.granularite === 'mois' ? periode.libelle.toLowerCase() : periode.libelle} · {lignes.length} achat{lignes.length > 1 ? 's' : ''}
            </th>
            <td className={styles.numerique}><Montant>{eurExact(totalTtc)}</Montant></td>
            <td className={styles.numerique}><Montant>{eurExact(totalTva)}</Montant></td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** « 12/06 » : l'année est dans le titre de la période, la répéter alourdit la colonne. */
const jourMois = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function etat(e: EtatRapprochement): string {
  switch (e) {
    case 'rapproche': return 'rapprochée';
    case 'en_attente': return 'en attente';
    case 'sans_banque': return 'sans relevé';
  }
}

function motif(ligne: LigneDepense): string {
  switch (ligne.tva.motifNonRecuperable) {
    case 'franchise': return 'Franchise en base';
    case 'justificatif_manquant': return 'TVA non récupérable : pièce manquante';
    case 'autoliquidation': return 'Autoliquidation';
    case 'taux_nul': return 'Sans TVA';
    case null: return '';
  }
}

