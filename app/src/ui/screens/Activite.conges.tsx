import { useId, useState } from 'react';
import { joursCongeables } from '../../domain/calculs/activite';
import { dateISO } from '../../domain/types';
import { useFaits } from '../../state/store';
import { Info } from '../components/Info';
import { useToast } from '../components/Toasts';
import styles from './Activite.module.css';

/*
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FORMULAIRE VIT DANS SON PROPRE MODULE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * On pose ses vacances trois ou quatre fois par an ; on ouvre le plan de charge
 * tous les matins. Ce formulaire n'a donc rien à faire dans le paquet de
 * l'écran, et l'invariant du projet est d'EXTRAIRE ce qui n'y a pas sa place
 * plutôt que de relever un budget — ce qui vient d'arriver : l'écran Activité
 * est l'écran différé le plus lourd, et il a franchi son plafond de 0,02 Ko en
 * gagnant l'ancrage à l'année. C'est un dépassement ridicule, et c'est
 * exactement le moment où la règle vaut : la relever une fois pour vingt
 * octets, c'est la relever.
 */

/**
 * Poser ou retirer une plage de congés.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * VINGT ET UN CLICS POUR TROIS SEMAINES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `poserPlageDeConges` existait dans le magasin depuis le début, testée, et
 * aucun écran ne l'appelait : le calendrier ne posait qu'un jour à la fois.
 * Des vacances d'été se saisissaient case par case, et la demi-journée — que le
 * schéma porte depuis la v2 et que le solde de congés compte correctement —
 * était tout simplement inatteignable.
 *
 * C'est la même famille de défaut que les quatre actions non câblées du 13/08 :
 * une action du magasin est une promesse d'interface, et une promesse qu'aucun
 * écran ne tient n'existe pas pour celui qui s'en sert.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA PLAGE EST RÉDUITE AUX JOURS OUVRÉS, ET ON LE DIT AVANT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Du 1er au 21 août » vaut quinze jours ouvrés, pas vingt et un. Enregistrer
 * les week-ends et les fériés gonflerait le solde de congés de moitié — et le
 * dénominateur d'occupation avec. Le compte est donc annoncé AVANT le geste :
 * découvrir après coup qu'on a posé six jours de plus que voulu oblige à
 * défaire à la main ce qu'on croyait avoir fait d'un coup.
 */
export function PlageDeConges() {
  const poserPlage = useFaits((e) => e.poserPlageDeConges);
  const signaler = useToast();
  const id = useId();

  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [demiJournee, setDemiJournee] = useState(false);

  const valide = /^\d{4}-\d{2}-\d{2}$/.test(du) && /^\d{4}-\d{2}-\d{2}$/.test(au);
  const jours = valide ? joursCongeables(dateISO(du), dateISO(au)) : [];

  function appliquer(pose: boolean): void {
    if (jours.length === 0) return;
    poserPlage(jours, pose, demiJournee ? 0.5 : 1);
    const quoi = demiJournee ? 'demi-journée' : 'jour';
    signaler(
      pose
        ? `${jours.length} ${quoi}${jours.length > 1 ? 's' : ''} de congé posée${jours.length > 1 ? 's' : ''}.`
        : `${jours.length} jour${jours.length > 1 ? 's' : ''} retiré${jours.length > 1 ? 's' : ''} des congés.`
    );
    setDu(''); setAu('');
  }

  return (
    <section className={styles.plage} aria-labelledby={`${id}-titre`}>
      <h3 id={`${id}-titre`} className={styles.plageTitre}>
        Poser une plage
        <Info libelle="Ce que la plage enregistre">
          Seuls les jours ouvrés sont retenus&nbsp;: les week-ends et les jours
          fériés sont écartés, parce qu’un congé posé un dimanche gonflerait
          ton solde et ton taux d’occupation sans correspondre à rien.
        </Info>
      </h3>

      <div className={styles.plageChamps}>
        <label className={styles.plageChamp} htmlFor={`${id}-du`}>
          <span>Du</span>
          <input id={`${id}-du`} type="date" value={du}
            onChange={(e) => setDu(e.target.value)} />
        </label>

        <label className={styles.plageChamp} htmlFor={`${id}-au`}>
          <span>Au</span>
          <input id={`${id}-au`} type="date" value={au}
            onChange={(e) => setAu(e.target.value)} />
        </label>

        <label className={styles.plageCase} htmlFor={`${id}-demi`}>
          <input id={`${id}-demi`} type="checkbox" checked={demiJournee}
            onChange={(e) => setDemiJournee(e.target.checked)} />
          <span>Demi-journées</span>
        </label>
      </div>

      {/*
        * Le compte AVANT le geste : c'est lui qui fait la différence entre
        * « je pose mes vacances » et « je découvre ce que j'ai posé ».
        *
        * Pas de région live, volontairement. Il se recalcule à chaque frappe
        * dans un champ de date — l'annoncer à voix haute autant de fois serait
        * du bruit, et il entrerait en concurrence avec le `role="status"` du
        * navigateur de mois, qui lui a une vraie raison d'interrompre.
        */}
      <p className={styles.plageCompte}>
        {!valide
          ? 'Choisissez deux dates.'
          : jours.length === 0
            ? 'Aucun jour ouvré dans cette plage.'
            : `${jours.length} jour${jours.length > 1 ? 's' : ''} ouvré${jours.length > 1 ? 's' : ''}`
              + `${demiJournee ? ', comptés pour une demi-journée chacun' : ''}.`}
      </p>

      <div className={styles.plageActions}>
        <button type="button" className={styles.plageAction}
          disabled={jours.length === 0} onClick={() => appliquer(true)}>
          Poser ces congés
        </button>
        {/* Retirer coûte le même geste que poser : corriger une erreur de
            saisie ne doit pas être plus cher que la faire. */}
        <button type="button" className={styles.plageAction}
          disabled={jours.length === 0} onClick={() => appliquer(false)}>
          Les retirer
        </button>
      </div>
    </section>
  );
}
