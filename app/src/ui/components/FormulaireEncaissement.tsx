import { useEffect, useId, useRef, useState } from 'react';
import type { ModeReglement } from '../../domain/calculs/livreRecettes';
import { dateDuJour } from '../../state/selecteurs';
import styles from './FormulaireEncaissement.module.css';

/**
 * Les deux mentions qu'exige un encaissement : la date et le mode de règlement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN SEUL FORMULAIRE POUR DEUX ÉCRANS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le facturier avait ce formulaire ; le panneau « Encaissements » du Pilote en
 * a besoin du même. Le dupliquer, c'est laisser deux écrans appliquer à terme
 * deux règles : l'un qui préremplit la date, l'autre qui l'oublie — et un
 * encaissement sans date n'a aucune place au livre des recettes.
 *
 * Le composant n'ÉCRIT rien : il rend la date et le mode choisis, et c'est
 * l'appelant qui écrit (`encaisserRecette`). Rien n'est donc écrit avant que
 * l'utilisateur ait confirmé. Il refuse seulement ce qui ne peut pas être une
 * date d'encaissement — un champ vidé, ou un jour qui n'est pas encore arrivé :
 * l'argent qui arrivera demain n'est pas encaissé, et le porter au livre
 * aujourd'hui avancerait le chiffre d'affaires d'un trimestre déclaré.
 */

const MODES: readonly { readonly id: ModeReglement; readonly libelle: string }[] = [
  { id: 'virement', libelle: 'Virement' },
  { id: 'carte', libelle: 'Carte' },
  { id: 'cheque', libelle: 'Chèque' },
  { id: 'especes', libelle: 'Espèces' },
  { id: 'autre', libelle: 'Autre' }
];

export function FormulaireEncaissement(
  {
    modeParDefaut = 'virement', refus, libelleValider, onValider, onAnnuler,
    avecAides = false, enLigne = false, focaliser = false
  }: {
    /** Le mode proposé : le dernier utilisé avec ce client, sinon le virement. */
    readonly modeParDefaut?: ModeReglement;
    /** Le motif du refus de l'écriture, rendu au-dessus du bouton. */
    readonly refus: string | null;
    readonly libelleValider: string;
    readonly onValider: (date: string, mode: ModeReglement) => void;
    readonly onAnnuler?: () => void;
    /** Les phrases d'aide sous chaque champ : utiles dans un panneau, trop lourdes sur une ligne. */
    readonly avecAides?: boolean;
    /** Champs côte à côte plutôt qu'empilés, pour s'ouvrir sous une ligne de liste. */
    readonly enLigne?: boolean;
    /**
     * Place le curseur sur la date à l'ouverture. Différé d'une image : le
     * dialogue qui contient le formulaire pose son propre focus APRÈS les
     * effets de ses enfants, et l'emporterait sinon.
     */
    readonly focaliser?: boolean;
  }
) {
  const aujourdhui = dateDuJour();
  const [date, setDate] = useState<string>(aujourdhui);
  const [mode, setMode] = useState<ModeReglement>(modeParDefaut);
  const [saisieRefusee, setSaisieRefusee] = useState<string | null>(null);
  const champDate = useRef<HTMLInputElement | null>(null);
  const id = useId();

  useEffect(() => {
    if (!focaliser) return;
    const image = requestAnimationFrame(() => champDate.current?.focus());
    return () => cancelAnimationFrame(image);
  }, [focaliser]);

  function valider(): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setSaisieRefusee('Indique la date où l’argent est arrivé.');
      return;
    }
    if (date > aujourdhui) {
      setSaisieRefusee('Cette date n’est pas encore arrivée : on pointe un argent reçu, pas attendu.');
      return;
    }
    setSaisieRefusee(null);
    onValider(date, mode);
  }

  const motif = saisieRefusee ?? refus;

  return (
    <div className={`${styles.formulaire} ${enLigne ? styles.enLigne : ''}`}>
      {/* `htmlFor` explicite plutôt qu'un label enveloppant : l'aide fait
          partie du contenu du label, et l'envelopper collerait ses phrases au
          nom accessible du champ. */}
      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-date`}>Date d’encaissement</label>
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
            La date où l’argent est arrivé, pas celle de la facture&nbsp;: en
            micro, le chiffre d’affaires se compte à l’encaissement.
          </span>
        )}
      </p>

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-mode`}>Mode de règlement</label>
        <select
          id={`${id}-mode`}
          className={styles.saisie}
          value={mode}
          {...(avecAides ? { 'aria-describedby': `${id}-mode-aide` } : {})}
          onChange={(e) => setMode(e.target.value as ModeReglement)}
        >
          {MODES.map((m) => <option key={m.id} value={m.id}>{m.libelle}</option>)}
        </select>
        {avecAides && (
          <span id={`${id}-mode-aide`} className={styles.aide}>
            Mention obligatoire du livre des recettes. C’est elle qui manquait à
            l’ancienne application, et qui rendait son registre non conforme.
          </span>
        )}
      </p>

      {motif !== null && <p className={styles.refus} role="alert">{motif}</p>}

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
