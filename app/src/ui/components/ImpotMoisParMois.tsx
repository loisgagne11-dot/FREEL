import { useMemo } from 'react';
import { useFaits } from '../../state/store';
import { repartitionImpotDe } from '../../state/selecteurs.impotCalendrier';
import type { Mois } from '../../domain/types';
import { Montant } from './Montant';
import { eur } from '../format';
import styles from './ImpotMoisParMois.module.css';

/**
 * La provision d'impôt dépliée mois par mois : « combien aurais-je dû avoir
 * mis de côté à la fin de chaque mois ? » — la question qu'on se pose au
 * moment du virement vers l'épargne, et à laquelle le total du jour ne répond
 * pas. La règle est celle du total (`repartitionMensuelleImpot`) : le dernier
 * mois retombe sur la note qui le précède.
 */
export function ImpotMoisParMois() {
  const faits = useFaits((e) => e.faits);
  const r = useMemo(() => repartitionImpotDe(faits), [faits]);
  if (r === null) return null;

  // La colonne des acomptes n'apparaît que s'il y en a : la première année,
  // il n'y en a aucun, et une colonne de tirets ne dit rien.
  const avecPreleves = r.lignes.some((l) => l.preleve > 0);
  const dernier = r.lignes.at(-1);
  const tiret = (v: number) => <Montant>{v > 0 ? eur(v) : '—'}</Montant>;
  return (
    <>
      <div className={styles.defilement}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Mois</th>
              <th scope="col">Encaissé</th>
              <th scope="col">Impôt du mois</th>
              {avecPreleves && <th scope="col">Acomptes prélevés</th>}
              <th scope="col">À garder fin de mois</th>
            </tr>
          </thead>
          <tbody>
            {r.lignes.map((l) => (
              <tr key={l.mois}>
                <th scope="row">{nomDuMois(l.mois)}</th>
                <td>{tiret(l.encaisse)}</td>
                <td>{tiret(l.impot)}</td>
                {avecPreleves && <td>{tiret(l.preleve)}</td>}
                <td><Montant>{eur(l.aGarder)}</Montant></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.aide}>
        Chaque euro encaissé porte la part d’impôt de l’année projetée&nbsp;; un
        acompte prélevé sort de ce qu’il faut garder.
        {dernier !== undefined && r.appelesNonPreleves > 0 && (
          <> Fin {nomDuMois(dernier.mois)}, les {eur(dernier.aGarder)} comprennent{' '}
            {eur(r.appelesNonPreleves)} d’acomptes appelés et pas encore prélevés, comptés
            avec les échéances.</>
        )}
      </p>
    </>
  );
}

/** « 2026-09 » → « septembre » : dans le tableau d'une année, l'année se tait. */
function nomDuMois(m: Mois): string {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' });
}
