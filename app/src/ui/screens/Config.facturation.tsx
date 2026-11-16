import { useId } from 'react';
import { useFaits } from '../../state/store';
import { controlerIban } from '../../domain/calculs/identifiants';
import { mentionsDuRegime } from '../../domain/calculs/facture';
import { emetteurDe } from '../../state/selecteurs.facture';
import { dateDuJour } from '../../state/selecteurs';
import type { DateISO } from '../../domain/types';
import { Champ } from '../components/Champ';
import styles from './Config.module.css';

/**
 * Où te faire payer.
 *
 * `iban` existait au schéma et était même repris de l'ancienne application à
 * la migration — mais aucun écran ne le montrait et le document imprimé ne le
 * portait pas. Le client recevait une facture régulière sur laquelle rien
 * n'indiquait où envoyer l'argent.
 *
 * L'IBAN porte une clé mod-97 : une inversion de caractères se voit ici, et
 * non trois semaines plus tard en relançant un virement qui n'est jamais parti.
 */
export function Facturation() {
  const faits = useFaits((e) => e.faits);
  const entreprise = faits.entreprise;
  const modifier = useFaits((e) => e.modifierEntreprise);
  const idChamp = useId();

  return (
    <div className={styles.carte}>
      <div className={styles.formulaire}>
        <Champ
          id={`${idChamp}-iban`}
          libelle="IBAN"
          aide="Figure sur tes factures, pour que le client sache où virer. Rien n’est envoyé nulle part."
          controle={controlerIban(entreprise.iban)}
        >
          <input id={`${idChamp}-iban`} autoComplete="off" spellCheck={false}
            value={entreprise.iban}
            onChange={(e) => modifier({ iban: e.target.value })} />
        </Champ>

        <Champ id={`${idChamp}-bic`} libelle="BIC" aide="Facultatif pour un virement SEPA.">
          <input id={`${idChamp}-bic`} autoComplete="off" spellCheck={false}
            value={entreprise.bic}
            onChange={(e) => modifier({ bic: e.target.value })} />
        </Champ>

        {/* LA PLATEFORME AGRÉÉE, UN FAIT (lot 46). Toute entreprise doit pouvoir
            RECEVOIR des factures électroniques depuis le 01/09/2026, par une
            plateforme agréée qu'elle choisit. Le rappel du Pilote ne savait pas
            si c'était fait : il se règle ici, et s'éteint. Le nom est le tien,
            saisi — l'application n'en propose aucune. */}
        <Champ id={`${idChamp}-plateforme`} libelle="Ma plateforme agréée"
          aide="Celle par laquelle tu reçois tes factures électroniques. Laisse vide si tu n’en as pas encore choisi.">
          <input id={`${idChamp}-plateforme`} autoComplete="off"
            value={entreprise.plateformeAgreee?.nom ?? ''}
            onChange={(e) => modifier({
              plateformeAgreee: e.target.value.trim() === ''
                ? null
                : { nom: e.target.value, depuis: entreprise.plateformeAgreee?.depuis ?? null }
            })} />
        </Champ>
        {entreprise.plateformeAgreee !== null && (
          <Champ id={`${idChamp}-plateforme-depuis`} libelle="Inscrit depuis le">
            <input id={`${idChamp}-plateforme-depuis`} type="date" max={dateDuJour()}
              value={entreprise.plateformeAgreee.depuis ?? ''}
              onChange={(e) => modifier({
                plateformeAgreee: {
                  nom: entreprise.plateformeAgreee?.nom ?? '',
                  depuis: e.target.value === '' ? null : e.target.value as DateISO
                }
              })} />
          </Champ>
        )}

        {/* L'option pour la TVA d'après les débits se porte sur la facture
            (réforme 2026-2027). Sans objet en franchise : sans TVA facturée,
            elle ne règle rien, et la proposer ferait croire le contraire. */}
        {!emetteurDe(faits).enFranchise && (
          <p className={styles.champ}>
            <label>
              <input type="checkbox" checked={entreprise.optionTvaDebits}
                onChange={(e) => modifier({ optionTvaDebits: e.target.checked })} />
              {' '}J’ai opté pour le paiement de la TVA d’après les débits
            </label>
          </p>
        )}
      </div>

      {/* Le handoff montre ici la mention de franchise dans un champ. Elle
          n'est pas un réglage — la loi la dicte, et le régime la choisit —
          mais elle doit se LIRE : « posées d'office » ne disait pas lesquelles.
          Un client assujetti dans un autre État de l'Union reçoit la mention
          d'autoliquidation à la place ; elle se voit sur sa facture. */}
      <div className={styles.mentions}>
        <p className={styles.mentionsTitre}>
          Mentions portées sur chaque facture à un client en France
        </p>
        <ul>
          {mentionsDuRegime(
            emetteurDe(faits).enFranchise ? 'franchise' : 'tva_francaise',
            dateDuJour(),
            entreprise.optionTvaDebits
          ).map((m) => <li key={m}>{m}</li>)}
        </ul>
      </div>

      {/* Le handoff montre aussi un préfixe, un délai et un logo. Rien de cela
          n'existe dans les faits : afficher des champs qui n'écrivent nulle
          part laisserait croire à un réglage. */}
      <p className={styles.explication}>
        La numérotation des factures est automatique (année-numéro) et ces
        mentions suivent ton régime de TVA&nbsp;: aucun réglage n’existe encore
        pour les personnaliser.
      </p>
    </div>
  );
}
