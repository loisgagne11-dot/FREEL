import type { TresorerieDouzeMois } from '../../state/selecteurs.tresorerie';
import { Montant } from '../components/Montant';
import { eur } from '../format';
import { capitale, moisSeul } from './Tresorerie.lecture';
import tr from './Tresorerie.module.css';

/**
 * « Voir en tableau » : les nombres de la courbe et des barres, en texte.
 *
 * Un graphe se lit d'un coup d'œil et ne dit pas de combien ; un lecteur
 * d'écran ne le lit pas du tout. Les mêmes douze mois, ligne par ligne — le
 * solde de fin de mois que les échéances font descendre, le dû qui reste, le
 * disponible avec et sans versement —, et ce que la courbe ne dit pas : le
 * versé cumulé sur un an, et les hypothèses dont la projection dépend.
 */
export function TableauDouzeMois({ t }: { readonly t: TresorerieDouzeMois }) {
  const montant = (v: number | null) => (v === null ? '—' : <Montant>{eur(v)}</Montant>);
  return (
    <div>
      <div className={tr.defile}>
        <table className={tr.tableau}>
          <caption className={tr.horsEcran}>Trésorerie, mois par mois : constaté puis prévu</caption>
          <thead>
            <tr>
              <th scope="col">Fin du mois</th>
              <th scope="col">Entrées</th>
              <th scope="col">Sorties</th>
              <th scope="col">Solde</th>
              <th scope="col">Dû</th>
              <th scope="col">Disponible</th>
              <th scope="col">Sans te verser</th>
            </tr>
          </thead>
          <tbody>
            {t.mois.map((m) => (
              <tr key={m.mois}>
                <th scope="row">{capitale(moisSeul(m.mois))} {m.mois.slice(0, 4)}{m.nature === 'constate' ? ', constaté' : ''}</th>
                <td>{montant(m.entrees)}</td>
                <td>{montant(m.sorties)}</td>
                <td>{montant(m.solde)}</td>
                <td>{montant(m.solde === null || m.disponible === null ? null : m.solde - m.disponible)}</td>
                <td>{montant(m.disponible)}</td>
                <td>{montant(m.nature === 'prevu' ? m.disponibleSansVersement : m.disponible)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={tr.hypotheses}>
        {t.dansUnAn !== null && (
          <li>
            Dans un an&nbsp;: <Montant>{eur(t.dansUnAn.sansVersement)}</Montant> sans rien te verser,{' '}
            <Montant>{eur(t.dansUnAn.avecVersement)}</Montant> en t’étant versé{' '}
            <Montant>{eur(t.dansUnAn.verseCumule)}</Montant> au total.
          </li>
        )}
        <li>
          Entrées prévues&nbsp;: les factures émises non réglées, à leur échéance, et le planning signé,
          facturé en fin de mois et payé au délai du client. Aucune tendance devinée, aucun prospect.
        </li>
        <li>
          {t.tauxDeCharges === null
            ? <span className={tr.manquant}>Taux de charges inconnu sur cette période&nbsp;: rien n’est retenu
              sur les encaissements à venir, le disponible prévu est donc trop haut.</span>
            : <>Le dû grandit de {Math.round(t.tauxDeCharges * 100)}&nbsp;% de chaque encaissement — le
              disponible le retire ce jour-là — et quitte le compte à l’échéance de sa déclaration.</>}
        </li>
        <li>
          {t.depensesMensuelles === null
            ? <span className={tr.manquant}>Dépenses courantes non estimées, faute de trois mois
              d’historique&nbsp;: la projection les ignore et se trouve donc trop haute d’autant.</span>
            : <>Dépenses courantes&nbsp;: <Montant>{eur(t.depensesMensuelles)}</Montant> par mois, moyenne des six
              derniers mois.</>}
        </li>
        <li>
          Un mois constaté est recalculé depuis les faits de ce soir-là&nbsp;: une déclaration sans date est
          réputée faite, une échéance compte dès sa date ou dès la déclaration qui l’a appelée.
        </li>
      </ul>
    </div>
  );
}
