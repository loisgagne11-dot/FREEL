import { useId } from 'react';
import type { Ecran, IdEcran } from '../navigation';
import { useConfidentialite } from '../useConfidentialite';
import { Sheet } from './Sheet';
import { Icone, compteurDe } from './RailNav';
import styles from './RailNav.plus.module.css';

/**
 * Ce que chaque écran du volet contient, en une ligne — la maquette
 * `navigation.html` les écrit sous le nom. Au téléphone, l'entrée n'a pas le
 * rail entier autour d'elle pour se situer : « Obligations » seul ne dit pas
 * qu'on y trouve la TVA.
 *
 * « Pièces à fournir » n'y est pas, alors que la maquette écrit « déclarer,
 * payer, fournir » : elles arrivent au lot 53. Promettre un contenu absent
 * apprendrait à ne plus lire ces lignes.
 */
const CONTENU: Partial<Record<IdEcran, string>> = {
  obligations: 'déclarer, payer, tenir les registres',
  achats: 'dépenses et justificatifs',
  simulateurs: 'impôt, régime, CFE',
  reglages: 'profil, barèmes, données, compte, affichage'
};

export interface ProprietesVoletPlus {
  readonly ecrans: readonly Ecran[];
  /** L'entrée du rail de l'écran courant, pour la marquer comme telle. */
  readonly allumee: IdEcran;
  readonly compteurs?: Partial<Record<IdEcran, number>>;
  readonly onFermer: () => void;
}

/**
 * Le volet « Plus » du téléphone (décision 3 du 16/11) : les quatre entrées
 * que la barre basse n'a pas la place de montrer, et « Masquer les montants ».
 *
 * L'interrupteur est ICI et non dans la barre du haut, au téléphone : celle-ci
 * porte déjà le logo, la recherche, la synchronisation et « + Nouveau », et
 * une cinquième icône les aurait serrés sous la cible de 44 px. Il suit le
 * même état que l'icône du bureau et que Réglages › Affichage
 * (`useConfidentialite`) : basculer l'un se voit sur les autres.
 *
 * Un `Sheet` en variante `volet` : le piège de focus, la fermeture par Échap
 * ou par le voile et la restitution du focus au bouton « Plus » sont ceux de
 * tous les panneaux — un second dialogue écrit à part n'en aurait respecté
 * qu'une partie.
 */
export function VoletPlus({ ecrans, allumee, compteurs, onFermer }: ProprietesVoletPlus) {
  const [confidentiel, setConfidentiel] = useConfidentialite();
  const id = useId();

  return (
    <Sheet ouvert titre="Plus" variante="volet" onFermer={onFermer}>
      <ul className={styles.liste}>
        {ecrans.map((e) => {
          const compteur = compteurDe(e.id, compteurs);
          return (
            <li key={e.id}>
              {/* Le clic ferme le volet : l'adresse change, mais le volet
                  resterait ouvert par-dessus l'écran qu'on vient de demander. */}
              <a
                className={styles.lien}
                href={e.chemin}
                aria-current={e.id === allumee ? 'page' : undefined}
                onClick={onFermer}
              >
                <Icone trace={e.icone} />
                <span className={styles.texte}>
                  {e.libelle}
                  <small className={styles.contenu}>{CONTENU[e.id]}</small>
                </span>
                {compteur > 0 && (
                  <span className={styles.compteur}>
                    {compteur}
                    <span className={styles.horsEcran}> à traiter</span>
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
      {/* La ligne entière est la cible : l'interrupteur seul ferait 22 px. */}
      <label className={styles.bascule} htmlFor={`${id}-montants`}>
        Masquer les montants
        <input
          id={`${id}-montants`}
          type="checkbox"
          role="switch"
          checked={confidentiel}
          onChange={(ev) => setConfidentiel(ev.target.checked)}
        />
      </label>
    </Sheet>
  );
}
