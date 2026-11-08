import { useId } from 'react';
import { useFaits } from '../../state/store';
import { controlerIban } from '../../domain/calculs/identifiants';
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
  const entreprise = useFaits((e) => e.faits.entreprise);
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

      {/* Le handoff montre ici un préfixe, un délai, des pénalités et un logo.
          Rien de cela n'existe dans les faits : afficher des champs qui
          n'écrivent nulle part laisserait croire à un réglage. On dit donc ce
          qui est, plutôt que de dessiner des champs morts. */}
      <p className={styles.explication}>
        La numérotation des factures est automatique (année-numéro) et les
        mentions légales sont posées d’office&nbsp;: aucun réglage n’existe
        encore pour les personnaliser.
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
