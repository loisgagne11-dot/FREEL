import { useId, useState } from 'react';
import type { FactureSuivie } from '../../domain/calculs/facturier';
import type { Recette } from '../../state/schema';
import { dateDuJour } from '../../state/selecteurs';
import { dateCourte } from '../format';
import styles from './Facturier.module.css';

/**
 * La date d'envoi d'une facture : la poser, ou la corriger.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DATE SE PROPOSE, ELLE NE S'IMPOSE PLUS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Marquer envoyée » écrivait la date du jour, sans rien demander : on
 * clique en sortant du courriel, et une question à ce moment-là faisait
 * abandonner le geste. Mais la facture partie hier, ou vendredi depuis Tiime,
 * se retrouvait datée d'aujourd'hui — et c'est cette date que relit la
 * relance, et qu'on oppose à « je ne l'ai jamais reçue ». Aujourd'hui reste
 * proposé : le geste courant coûte un clic de plus, le cas d'hier devient
 * juste.
 *
 * Elle se CORRIGE ensuite, parce qu'elle n'est imprimée nulle part : la date
 * d'émission d'une facture de FREEL est une mention légale figée, la date
 * d'envoi un fait de suivi, qu'une erreur de saisie ne doit pas graver.
 */
export function PanneauEnvoi(
  { facture, refus, onValider }: {
    readonly facture: FactureSuivie<Recette>;
    readonly refus: string | null;
    readonly onValider: (date: string) => void;
  }
) {
  const r = facture.recette;
  const aujourdhui = dateDuJour();
  const correction = r.envoyeeLe != null;
  const [date, setDate] = useState<string>(r.envoyeeLe ?? aujourdhui);
  const id = useId();

  return (
    <div className={`${styles.panneau} ${styles.saisieFacture}`}>
      <p className={styles.rappel}>
        {r.numero || 'Sans numéro'} — {r.clientNom || 'client non renseigné'}
        <span>émise le {dateCourte(r.emiseLe)}</span>
      </p>
      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-date`}>Date d’envoi</label>
        <input id={`${id}-date`} type="date" className={styles.saisie} value={date}
          min={r.emiseLe ?? undefined} max={aujourdhui} onChange={(e) => setDate(e.target.value)}
          aria-describedby={`${id}-aide`} />
        <span id={`${id}-aide`} className={styles.aide}>
          {correction
            ? `Enregistrée au ${dateCourte(r.envoyeeLe ?? null)}. Elle n’est imprimée nulle part : elle se corrige, contrairement à la date d’émission.`
            : 'Le jour où la facture est partie chez le client — aujourd’hui, si c’est le cas.'}
        </span>
      </p>
      {refus !== null && <p className={styles.refus} role="alert">{refus}</p>}
      <div className={styles.ligneActions}>
        <button type="button" className={styles.actionPrincipale} onClick={() => onValider(date)}>
          {correction ? 'Corriger la date d’envoi' : 'Confirmer l’envoi'}
        </button>
      </div>
    </div>
  );
}
