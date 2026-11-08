import { useId } from 'react';
import { useFaits } from '../../state/store';
import { controlerIban } from '../../domain/calculs/identifiants';
import { mentionsDuRegime } from '../../domain/calculs/facture';
import { emetteurDe } from '../../state/selecteurs.facture';
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
          {mentionsDuRegime(emetteurDe(faits).enFranchise ? 'franchise' : 'tva_francaise')
            .map((m) => <li key={m}>{m}</li>)}
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

/**
 * Le livre des recettes n'a rien à régler : il se remplit tout seul, à
 * l'encaissement. La section existe parce que le handoff la place ici, et
 * parce qu'on la cherche dans les réglages avant de la chercher dans Argent.
 */
export function LivreDesRecettes() {
  return (
    <div className={styles.carte}>
      <p className={styles.explication}>
        Le registre des recettes est obligatoire. Il se remplit à
        l’encaissement&nbsp;: une facture émise mais non payée n’y figure pas
        encore.
      </p>
      <a className={styles.lien} href="#/argent/livre">Ouvrir le livre des recettes</a>
    </div>
  );
}
