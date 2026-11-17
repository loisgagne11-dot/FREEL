import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { dateISO, euros } from '../../domain/types';
import {
  type PeriodeUrssaf, appelsDeLaPeriode, idAppelDeDeclaration
} from '../../domain/calculs/declarations';
import { declarerUrssaf } from '../../state/ecritures.echeances';
import { dateDuJour } from '../../state/selecteurs';
import { montantDeclaration } from '../../state/selecteurs.aTraiter';
import { useFaits } from '../../state/store';
import { Montant } from './Montant';
import { useToast } from './Toasts';
import { dateCourte, eur } from '../format';
import styles from './FormulaireReglement.module.css';

/**
 * Le geste URSSAF unique : « Déclarée le … pour … € ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN GESTE, PARCE QUE DEUX LAISSAIENT UN TROU DANS LE DÛ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Marquer déclarée » faisait sortir la période du volet « à provisionner »
 * sans rien mettre au volet « constaté » : l'appel restait à saisir, ailleurs,
 * plus tard — et d'ici là, le dû baissait de toute la déclaration, « à te
 * verser » montait d'autant. La déclaration crée désormais l'appel, au
 * montant que le site de l'Urssaf a calculé : prérempli d'après les
 * encaissements de la période, corrigeable, vide quand un taux manque —
 * jamais calculé à taux zéro.
 *
 * Les deux portes — la liste des périodes et le détail de la dette — montrent
 * ce même composant, qui appelle la même écriture : deux formulaires du même
 * geste finiraient par ne plus écrire la même chose.
 */
export function DeclarationUrssaf(
  { periode, libelle, classeDeclencheur, classeConteneur }: {
    readonly periode: PeriodeUrssaf;
    /** Le libellé du bouton qui ouvre le formulaire. */
    readonly libelle: string;
    readonly classeDeclencheur: string | undefined;
    /** Le conteneur du formulaire ouvert, pour qu'il prenne la ligne entière. */
    readonly classeConteneur?: string | undefined;
  }
) {
  const [ouvert, setOuvert] = useState(false);
  if (!ouvert) {
    return (
      <button type="button" className={classeDeclencheur} onClick={() => setOuvert(true)}>
        {libelle}
      </button>
    );
  }
  return (
    <div className={classeConteneur}>
      <Formulaire periode={periode} onFermer={() => setOuvert(false)} />
    </div>
  );
}

function Formulaire({ periode, onFermer }: { readonly periode: PeriodeUrssaf; readonly onFermer: () => void }) {
  const faits = useFaits((e) => e.faits);
  const signaler = useToast();
  const aujourdhui = dateDuJour();
  const id = useId();
  const champDate = useRef<HTMLInputElement | null>(null);

  const calcul = useMemo(() => montantDeclaration(faits, periode.mois), [faits, periode.mois]);
  // Un appel déjà là — saisi à la main, ou rattaché par la migration — règle
  // la période : la déclaration n'en crée pas un second, qui doublerait le dû.
  const dejaSaisi = appelsDeLaPeriode(periode.id, faits.echeances)
    .filter((e) => e.id !== idAppelDeDeclaration(periode.id));

  const [date, setDate] = useState<string>(aujourdhui);
  const [montant, setMontant] = useState(calcul.statut === 'refuse' ? '' : String(calcul.valeur));
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const image = requestAnimationFrame(() => champDate.current?.focus());
    return () => cancelAnimationFrame(image);
  }, []);

  function valider(): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErreur('La date de la déclaration est obligatoire : c’est elle qui dit si elle a été '
        + 'faite à l’heure.');
      return;
    }
    if (date > aujourdhui) {
      setErreur('Cette date n’est pas encore arrivée : on enregistre une déclaration faite, pas prévue.');
      return;
    }
    const valeur = dejaSaisi.length > 0 ? 0 : Number.parseFloat(montant.replace(',', '.'));
    if (!Number.isFinite(valeur) || valeur < 0) {
      setErreur('Le montant déclaré doit être un nombre — zéro pour une déclaration à zéro.');
      return;
    }
    setErreur(null);
    declarerUrssaf(periode, dateISO(date), euros(valeur));
    signaler(dejaSaisi.length > 0
      ? `${periode.libelle} déclarée le ${dateCourte(date)} ; son appel était déjà saisi.`
      : valeur > 0
        ? `${periode.libelle} déclarée le ${dateCourte(date)} : l’appel de ${eur(euros(valeur))} `
          + `entre dans le dû, à payer le ${dateCourte(periode.limite)}.`
        : `${periode.libelle} déclarée à zéro le ${dateCourte(date)}.`);
    onFermer();
  }

  return (
    <div className={`${styles.formulaire} ${styles.enLigne}`}>
      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-date`}>Déclarée le</label>
        <input
          ref={champDate}
          id={`${id}-date`}
          type="date"
          className={styles.saisie}
          value={date}
          max={aujourdhui}
          required
          onChange={(e) => setDate(e.target.value)}
        />
      </p>

      {dejaSaisi.length > 0
        ? (
          <p className={styles.aide}>
            Un appel de <Montant>{eur(euros(dejaSaisi.reduce((s, e) => s + e.montant, 0)))}</Montant>
            {' '}est déjà saisi pour {periode.libelle}&nbsp;: la déclaration n’en crée pas d’autre.
          </p>
        )
        : (
          <p className={styles.champ}>
            <label className={styles.libelle} htmlFor={`${id}-montant`}>Pour (€)</label>
            <input
              id={`${id}-montant`}
              inputMode="decimal"
              className={styles.saisie}
              value={montant}
              aria-describedby={`${id}-montant-aide`}
              onChange={(e) => setMontant(e.target.value)}
            />
            <span id={`${id}-montant-aide`} className={styles.aide}>
              {calcul.statut === 'refuse'
                ? 'Un taux manque sur la période : recopie le montant que le site de l’URSSAF affiche.'
                : 'Celui que le site de l’URSSAF a calculé ; corrige-le s’il diffère.'}
              {' '}Il entre dans le dû, à payer le {dateCourte(periode.limite)}.
            </span>
          </p>
        )}

      {erreur !== null && <p role="alert" className={styles.refus}>{erreur}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.valider} onClick={valider}>
          Enregistrer la déclaration
        </button>
        {/* « Fermer », comme la maquette validée (décision 25) : « Annuler »,
            à côté d'une période déjà déclarée, se lisait « annuler la
            déclaration ». */}
        <button type="button" className={styles.annuler} onClick={onFermer}>Fermer</button>
      </div>
    </div>
  );
}
