import { useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { aTraiter } from '../../state/selecteurs';
import type { EcranCible, SujetATraiter } from '../../domain/calculs/aTraiter';
import { Sheet } from './Sheet';
import styles from './IndicateurATraiter.module.css';

/**
 * L'indicateur « à traiter » — `.todofab` de la spec de design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX NIVEAUX, ET LE SECOND MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le handoff décrit un système d'alertes à deux niveaux. Le premier — un
 * badge chiffré sur chaque onglet — existait. Le second, non : l'écran « À
 * traiter » était une carte du seul Pilote.
 *
 * L'écart n'est pas cosmétique. Depuis Achats, le badge de l'onglet dit
 * « 5 » ; rien ne dit LESQUELS, et il faut revenir au Pilote pour le savoir.
 * On finit par ne plus regarder un chiffre qu'on ne peut pas ouvrir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SEULEMENT CE QUI CONCERNE L'ÉCRAN OÙ L'ON EST
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La pastille ne montre que les sujets de l'onglet courant — sauf sur le
 * Pilote, poste de pilotage, où elle montre tout. C'est ce qui la rend
 * lisible : sur Achats, « 5 » veut dire « cinq choses ici », pas « cinq
 * choses quelque part ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ABSENTE QUAND IL N'Y A RIEN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Zéro n'est pas une information à afficher, c'est une absence à constater.
 * Une pastille « 0 à traiter » occuperait un coin d'écran en permanence pour
 * ne rien dire, et rendrait invisible le jour où elle porte un chiffre.
 */
export function IndicateurATraiter({ ecranActif }: { readonly ecranActif: string }) {
  const faits = useFaits((e) => e.faits);
  const [ouvert, setOuvert] = useState(false);

  const tous = useMemo(() => aTraiter(faits), [faits]);
  // Le Pilote est le poste de pilotage : il montre tout. Ailleurs, on ne
  // montre que ce qui se règle ici.
  const sujets = ecranActif === 'pilote'
    ? tous
    : tous.filter((s) => s.ecran === (ecranActif as EcranCible));

  const total = sujets.reduce((n, s) => n + s.nombre, 0);
  if (total === 0) return null;

  return (
    <>
      <button
        type="button"
        className={styles.pastille}
        onClick={() => setOuvert(true)}
        aria-haspopup="dialog"
      >
        <span className={styles.compte}>{total}</span>
        <span className={styles.libelle}>à traiter</span>
      </button>

      <Sheet
        ouvert={ouvert}
        titre={ecranActif === 'pilote' ? 'À traiter' : `À traiter · ${LIBELLES[ecranActif] ?? ecranActif}`}
        onFermer={() => setOuvert(false)}
      >
        <ul className={styles.liste}>
          {sujets.map((s) => <Ligne key={s.id} sujet={s} onSuivi={() => setOuvert(false)} />)}
        </ul>
      </Sheet>
    </>
  );
}

const LIBELLES: Readonly<Record<string, string>> = {
  activite: 'Activité', argent: 'Argent', facture: 'Facturer',
  achats: 'Achats', outils: 'Outils', config: 'Config'
};

function Ligne({ sujet, onSuivi }: { readonly sujet: SujetATraiter; readonly onSuivi: () => void }) {
  return (
    <li className={`${styles.ligne} ${styles[sujet.gravite] ?? ''}`}>
      <span className={styles.ligneTitre}>
        <span className={styles.ligneNombre}>{sujet.nombre}</span>
        <span className={styles.ligneIntitule}>{sujet.intitule}</span>
      </span>
      <span className={styles.ligneContexte}>{sujet.contexte}</span>
      {/* Un lien, pas un bouton : c'est une navigation, et elle doit s'ouvrir
          dans un nouvel onglet comme n'importe quel lien si on le demande. */}
      <a className={styles.ligneAction} href={`#/${sujet.ecran}`} onClick={onSuivi}>
        {sujet.action}
      </a>
    </li>
  );
}
