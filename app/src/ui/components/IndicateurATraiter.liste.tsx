import type { SujetATraiter } from '../../domain/calculs/aTraiter';
import { formuler } from '../../domain/calculs/aTraiter.libelles';
import styles from './IndicateurATraiter.module.css';

/**
 * La liste des sujets « à traiter », chargée avec le panneau.
 *
 * Elle vit à part parce qu'elle tire `aTraiter.libelles` — dix kilo-octets de
 * phrases françaises. La pastille de la barre du haut, elle, n'affiche qu'un
 * nombre, et elle est rendue au premier écran chez tout le monde. Faire
 * voyager les phrases avec le nombre revenait à faire payer à chaque ouverture
 * un panneau que la plupart des visites n'ouvrent jamais.
 */
export function ListeSujets(
  { sujets, onSuivi }: {
    readonly sujets: readonly SujetATraiter[];
    readonly onSuivi: () => void;
  }
) {
  return (
    <ul className={styles.liste}>
      {sujets.map((s) => <Ligne key={s.id} sujet={s} onSuivi={onSuivi} />)}
    </ul>
  );
}

function Ligne({ sujet, onSuivi }: { readonly sujet: SujetATraiter; readonly onSuivi: () => void }) {
  const { intitule, contexte, action } = formuler(sujet);
  return (
    <li className={`${styles.ligne} ${styles[sujet.gravite] ?? ''}`}>
      <span className={styles.ligneTitre}>
        <span className={styles.ligneNombre}>{sujet.nombre}</span>
        <span className={styles.ligneIntitule}>{intitule}</span>
      </span>
      <span className={styles.ligneContexte}>{contexte}</span>
      {/* Un lien, pas un bouton : c'est une navigation, et elle doit s'ouvrir
          dans un nouvel onglet comme n'importe quel lien si on le demande. */}
      <a className={styles.ligneAction} href={`#/${sujet.ecran}`} onClick={onSuivi}>
        {action}
      </a>
    </li>
  );
}
