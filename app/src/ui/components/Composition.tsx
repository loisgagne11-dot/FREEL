import type { CleComposition, TermeComposition } from '../../domain/calculs/composition';
import { compositionDe } from '../../state/selecteurs.composition';
import { useFaits } from '../../state/store';
import { Montant } from './Montant';
import { Sheet } from './Sheet';
import { dateCourte, eur } from '../format';
import styles from './Composition.module.css';

/**
 * D'où sort un chiffre — la formule, ses termes, et ce qu'il tait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE PANNEAU RÉPARE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Quatre chiffres commandent toutes les décisions de l'application, et ils
 * s'enchaînent : le solde donne le disponible, le disponible donne le
 * versable. L'écran n'en montrait que les résultats. Après un import de
 * données, l'utilisateur trouvait quatre nombres qu'il ne pouvait recouper ni
 * entre eux ni contre sa banque, et disait — à raison — qu'il ne comprenait
 * pas les données.
 *
 * Ici, chaque terme est le total d'une autre composition, ou une somme de
 * faits qu'on peut aller compter. On remonte la chaîne jusqu'aux faits sans
 * jamais rencontrer un nombre qui vienne de nulle part.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL EST DIFFÉRÉ, ET POURQUOI IL PORTE SON PROPRE `Sheet`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le budget de l'écran différé le plus lourd était à cent octets de son
 * plafond, et l'invariant du projet interdit de relever un budget : on extrait
 * ce qui n'a pas à être là. Ce panneau ne se lit qu'au clic sur une tuile —
 * il n'a donc rien à faire dans le paquet d'un écran qu'on ouvre tous les
 * matins. Il emporte son `Sheet` avec lui pour la même raison : le Pilote,
 * qui vit dans le paquet d'entrée, n'en utilisait aucun jusqu'ici.
 */
export function Composition(
  { cle, onFermer }: { readonly cle: CleComposition; readonly onFermer: () => void }
) {
  const faits = useFaits((e) => e.faits);
  const c = compositionDe(faits, cle);

  return (
    <Sheet ouvert titre={`${c.titre} — d’où vient ce chiffre`} onFermer={onFermer}>
      <div className={styles.composition}>
        <p className={styles.formule}>{c.formule}</p>

        <dl className={styles.termes}>
          {c.termes.map((t) => <Terme key={t.libelle} terme={t} />)}
        </dl>

        <p className={styles.resultat}>
          <span className={styles.resultatLibelle}>{c.titre}</span>
          <span className={styles.resultatMontant}><Montant>{eur(c.total)}</Montant></span>
        </p>

        {/*
          * L'ÉCART SE MONTRE, IL NE SE TAIT PAS.
          *
          * Il vaut zéro sur tous les chemins connus, et des tests le vérifient
          * pour chaque composition. S'il cesse un jour de valoir zéro, c'est
          * qu'un terme manque à la formule : le dire vaut mieux que d'afficher
          * une colonne qui ne tombe pas juste sans expliquer pourquoi — le
          * lecteur, lui, le verra de toute façon en additionnant.
          */}
        {c.ecart !== 0 && (
          <p className={styles.ecart} role="status">
            <strong>La colonne ne tombe pas juste.</strong> Il manque{' '}
            <Montant>{eur(c.ecart)}</Montant> entre le détail et le total — un
            terme n’est pas expliqué ici. Le total reste celui de la tuile&nbsp;:
            c’est lui qui fait foi.
          </p>
        )}

        <p className={styles.lecture}>{c.lecture}</p>

        {c.reserves.map((r) => (
          <p key={r} className={styles.reserve}>{r}</p>
        ))}
      </div>
    </Sheet>
  );
}

/** Le signe du terme, lisible à l'œil comme au lecteur d'écran. */
const SIGNE: Readonly<Record<TermeComposition['signe'], string>> = {
  depart: '',
  plus: '+',
  moins: '−'
};

/**
 * Le signe dit à voix haute.
 *
 * « + » et « − » ne s'annoncent pas de façon fiable d'un lecteur d'écran à
 * l'autre — certains les passent en silence, et la colonne devient alors une
 * suite de montants dont on ne sait plus lesquels se retranchent. Le mot est
 * donc porté séparément, hors de la vue.
 */
const SIGNE_DIT: Readonly<Record<TermeComposition['signe'], string>> = {
  depart: 'au départ',
  plus: 'plus',
  moins: 'moins'
};

function Terme({ terme }: { readonly terme: TermeComposition }) {
  return (
    <div className={`${styles.terme} ${terme.signe === 'moins' ? styles.retranche : ''}`}>
      <dt className={styles.termeTexte}>
        <span className={styles.signe} aria-hidden="true">{SIGNE[terme.signe]}</span>
        <span className={styles.termeLibelle}>
          <span className={styles.horsEcran}>{SIGNE_DIT[terme.signe]} </span>
          {terme.libelle}
        </span>
        {(terme.precision !== null || terme.date !== null) && (
          <span className={styles.termePrecision}>
            {terme.date !== null && `au ${dateCourte(terme.date)}`}
            {terme.date !== null && terme.precision !== null && ' · '}
            {terme.precision}
          </span>
        )}
      </dt>
      <dd className={styles.termeMontant}><Montant>{eur(terme.montant)}</Montant></dd>
    </div>
  );
}
