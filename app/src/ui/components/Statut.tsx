import styles from './Statut.module.css';

export type TonStatut = 'ok' | 'attente' | 'retard' | 'neutre';

/**
 * L'étiquette de statut — `.chip2` / `.bdg` de la spec de design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE STATUT EST UN MOT, PAS UNE COULEUR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La spec associe un ton à chaque état : vert payé, ambre envoyé, rouge en
 * retard, neutre brouillon. La couleur accélère la lecture d'une liste — mais
 * elle ne peut pas la porter seule : un daltonien, une impression en noir et
 * blanc, un écran en plein soleil, et l'information disparaît.
 *
 * Le libellé est donc toujours écrit. La couleur ne fait que le renforcer.
 */
export function Statut({ libelle, ton }: { readonly libelle: string; readonly ton: TonStatut }) {
  return <span className={`${styles.statut} ${styles[ton]}`}>{libelle}</span>;
}

/**
 * Le statut d'une recette au livre.
 *
 * Trois états seulement, et ils ne se recouvrent pas : encaissée, en retard,
 * en attente. Une recette « en retard » est en attente elle aussi — c'est
 * l'échéance dépassée qui la distingue, et c'est la seule distinction qui
 * appelle une action.
 */
export function statutRecette(
  { encaissee, echeanceDepassee }: {
    readonly encaissee: boolean;
    readonly echeanceDepassee: boolean;
  }
): { readonly libelle: string; readonly ton: TonStatut } {
  if (encaissee) return { libelle: 'Encaissée', ton: 'ok' };
  if (echeanceDepassee) return { libelle: 'En retard', ton: 'retard' };
  return { libelle: 'En attente', ton: 'attente' };
}
