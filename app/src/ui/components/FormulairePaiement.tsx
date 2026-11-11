import { useEffect, useId, useRef, useState } from 'react';
import { type DateISO, type Euros, dateISO, euros } from '../../domain/types';
import { dateDuJour } from '../../state/selecteurs';
import styles from './FormulaireReglement.module.css';

/**
 * Le paiement d'une échéance : la date du débit, et le montant réellement parti.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN SEUL FORMULAIRE POUR TROIS ENDROITS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'échéancier avait ce formulaire ; le détail de la dette, lui, n'offrait que
 * « Payé aujourd'hui » — un prélèvement passé hier n'y recevait pas sa date,
 * et le mois de la sortie était faux le premier du mois. Le panneau « Sorties »
 * du Pilote en a besoin à son tour. Un seul composant, donc une seule règle :
 * la date est exigée et ne peut pas être future (un débit à venir n'est pas
 * un débit), le montant est prérempli à l'appel, et l'écart n'est gardé que
 * lorsqu'il existe.
 *
 * Il n'écrit rien : c'est l'appelant qui enregistre (`enregistrerPaiement`).
 */
export function FormulairePaiement(
  {
    montantAppele, libelleValider, onValider, onAnnuler,
    avecAides = false, enLigne = false, focaliser = false
  }: {
    readonly montantAppele: Euros;
    readonly libelleValider: string;
    /** `montantPaye` vaut `null` quand il coïncide avec l'appel. */
    readonly onValider: (payeeLe: DateISO, montantPaye: Euros | null) => void;
    readonly onAnnuler?: () => void;
    readonly avecAides?: boolean;
    readonly enLigne?: boolean;
    /** Voir `FormulaireEncaissement` : le dialogue pose son focus après ses enfants. */
    readonly focaliser?: boolean;
  }
) {
  const aujourdhui = dateDuJour();
  const [date, setDate] = useState<string>(aujourdhui);
  const [montant, setMontant] = useState(String(montantAppele));
  const [erreur, setErreur] = useState<string | null>(null);
  const champDate = useRef<HTMLInputElement | null>(null);
  const id = useId();

  useEffect(() => {
    if (!focaliser) return;
    const image = requestAnimationFrame(() => champDate.current?.focus());
    return () => cancelAnimationFrame(image);
  }, [focaliser]);

  function valider(): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErreur('La date du débit est obligatoire : sans elle, on ne peut ni la '
        + 'rapprocher du relevé, ni savoir de quel mois la sortie relève.');
      return;
    }
    if (date > aujourdhui) {
      setErreur('Cette date n’est pas encore arrivée : on pointe un débit passé, pas prévu.');
      return;
    }
    const valeur = Number.parseFloat(montant.replace(',', '.'));
    if (!Number.isFinite(valeur) || valeur <= 0) {
      setErreur('Le montant débité doit être un nombre supérieur à zéro.');
      return;
    }
    setErreur(null);
    // `null` quand les deux coïncident : ne stocker l'écart que lorsqu'il
    // existe évite de faire croire à une différence là où il n'y en a pas.
    onValider(dateISO(date), valeur === montantAppele ? null : euros(valeur));
  }

  return (
    <div className={`${styles.formulaire} ${enLigne ? styles.enLigne : ''}`}>
      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-date`}>Date du débit</label>
        <input
          ref={champDate}
          id={`${id}-date`}
          type="date"
          className={styles.saisie}
          value={date}
          max={aujourdhui}
          required
          {...(avecAides ? { 'aria-describedby': `${id}-date-aide` } : {})}
          onChange={(e) => setDate(e.target.value)}
        />
        {avecAides && (
          <span id={`${id}-date-aide`} className={styles.aide}>
            Celle du relevé, pas celle de l’échéance&nbsp;: c’est elle qui permet
            de rapprocher le paiement, et de savoir de quel mois la sortie relève.
          </span>
        )}
      </p>

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-montant`}>Montant réellement débité (€)</label>
        <input
          id={`${id}-montant`}
          inputMode="decimal"
          className={styles.saisie}
          value={montant}
          {...(avecAides ? { 'aria-describedby': `${id}-montant-aide` } : {})}
          onChange={(e) => setMontant(e.target.value)}
        />
        {avecAides && (
          <span id={`${id}-montant-aide`} className={styles.aide}>
            Prérempli à l’appel. Modifie-le s’il diffère — régularisation,
            changement de taux, majoration&nbsp;: l’écart est conservé, c’est lui
            qui explique un solde qui ne tombe pas juste.
          </span>
        )}
      </p>

      {erreur !== null && <p role="alert" className={styles.refus}>{erreur}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.valider} onClick={valider}>
          {libelleValider}
        </button>
        {onAnnuler !== undefined && (
          <button type="button" className={styles.annuler} onClick={onAnnuler}>Annuler</button>
        )}
      </div>
    </div>
  );
}
