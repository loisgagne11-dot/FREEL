import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import type { Echeance, NatureDette } from '../../domain/calculs/provisions';
import { dateISO, euros } from '../../domain/types';
import { Info } from './Info';
import { Montant } from './Montant';
import { Sheet } from './Sheet';
import { Statut, type TonStatut } from './Statut';
import { useToast } from './Toasts';
import { Vide } from './Vide';
import { dateCourte, eur } from '../format';
import styles from './Echeances.module.css';

/**
 * Les échéances émises — appels de cotisations, avis d'impôt, CFE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE SON ABSENCE COÛTAIT, ET DANS QUEL SENS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les provisions se tiennent en deux volets (D3) : ce qui a DÉJÀ été appelé,
 * et ce qui est dû sur des recettes encaissées mais pas encore déclaré. Le
 * premier volet se calculait sur une liste vide, parce qu'aucun écran ne
 * pouvait créer une échéance. Il valait donc zéro en permanence.
 *
 * L'erreur allait dans le sens dangereux : moins de provisions, donc plus de
 * disponible, donc plus de versable. L'application invitait à se verser de
 * l'argent qui était déjà dû. C'est exactement le mécanisme du rappel qu'on
 * ne peut plus payer — celui que cette application existe pour empêcher.
 *
 * Le flux du mois n'avait pas de sorties non plus, pour la même raison.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE ÉCHÉANCE EST UN FAIT, PAS UNE PRÉVISION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle existe parce qu'un appel est arrivé : un montant, une date, une nature.
 * C'est ce qui la distingue du volet 2, qui ESTIME une dette pas encore
 * appelée à partir des recettes encaissées. Les calculer toutes les deux
 * reviendrait à compter deux fois la même somme — et c'est précisément ce que
 * « marquer la période déclarée » évite.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PAYÉE NE VEUT PAS DIRE EFFACÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une échéance payée sort des provisions : l'argent a quitté le compte, donc
 * le solde bancaire la reflète déjà. L'y laisser retrancherait deux fois la
 * même somme du disponible. Mais elle reste dans la liste — c'est l'historique
 * de ce qui a été appelé, et il sert à vérifier le prochain appel.
 */

const NATURES: readonly { readonly id: NatureDette; readonly libelle: string }[] = [
  { id: 'urssaf', libelle: 'URSSAF — cotisations sociales' },
  { id: 'tva', libelle: 'TVA à reverser' },
  { id: 'impot', libelle: 'Impôt sur le revenu' },
  { id: 'cfe', libelle: 'CFE — cotisation foncière' },
  { id: 'cfp', libelle: 'CFP — formation professionnelle' }
];

const LIBELLE: Readonly<Record<NatureDette, string>> = {
  urssaf: 'URSSAF', tva: 'TVA', impot: 'Impôt', cfe: 'CFE', cfp: 'CFP'
};

type Panneau = { readonly type: 'ferme' } | { readonly type: 'saisie'; readonly id: string | null };

export function Echeances({ aujourdhui = new Date() }: { readonly aujourdhui?: Date }) {
  const faits = useFaits((e) => e.faits);
  const ajouter = useFaits((e) => e.ajouterEcheance);
  const modifier = useFaits((e) => e.modifierEcheance);
  const supprimer = useFaits((e) => e.supprimerEcheance);
  const marquerPayee = useFaits((e) => e.marquerEcheancePayee);
  const signaler = useToast();

  const [panneau, setPanneau] = useState<Panneau>({ type: 'ferme' });

  const jour = aujourdhui.toISOString().slice(0, 10);
  const liste = useMemo(
    // La plus proche en tête : c'est celle qu'on doit payer.
    () => [...faits.echeances].sort((a, b) => a.echeanceLe.localeCompare(b.echeanceLe)),
    [faits.echeances]
  );
  const aPayer = liste.filter((e) => !e.payee);
  const total = euros(aPayer.reduce((s, e) => s + e.montant, 0));

  const enSaisie = panneau.type === 'saisie' && panneau.id !== null
    ? faits.echeances.find((e) => e.id === panneau.id) ?? null
    : null;

  return (
    <section className={styles.carte} aria-labelledby="titre-echeances">
      <header className={styles.entete}>
        <h2 id="titre-echeances" className={styles.titreCarte}>
          Échéances reçues
          <Info libelle="Ce qu’il faut saisir ici">
            Les appels que vous avez réellement reçus&nbsp;: échéancier URSSAF,
            avis d’impôt, CFE. Ce n’est pas une prévision — les cotisations dues
            sur des recettes encaissées mais pas encore déclarées sont déjà
            estimées juste au-dessus, dans «&nbsp;charges sur recettes
            encaissées&nbsp;». Saisir les deux compterait deux fois la même
            somme&nbsp;; c’est «&nbsp;marquer la période déclarée&nbsp;» qui
            fait passer l’une dans l’autre.
          </Info>
        </h2>
        <button
          type="button"
          className={styles.actionPrincipale}
          onClick={() => setPanneau({ type: 'saisie', id: null })}
        >
          Saisir une échéance
        </button>
      </header>

      {liste.length === 0
        ? (
          <Vide
            message="Aucune échéance saisie. Tant qu’il n’y en a pas, la ligne « échéances
                     émises » reste à zéro — et le disponible est surestimé d’autant."
          />
        )
        : (
          <>
            <p className={styles.total}>
              <span>Reste à payer</span>
              <strong><Montant>{eur(total)}</Montant></strong>
            </p>
            <ul className={styles.liste}>
              {liste.map((e) => (
                <Ligne
                  key={e.id}
                  echeance={e}
                  jour={jour}
                  onBasculer={() => {
                    marquerPayee(e.id, !e.payee);
                    signaler(e.payee
                      ? `${LIBELLE[e.nature]} repassée à payer.`
                      : `${LIBELLE[e.nature]} marquée payée : elle sort des provisions.`);
                  }}
                  onCorriger={() => setPanneau({ type: 'saisie', id: e.id })}
                />
              ))}
            </ul>
          </>
        )}

      <Sheet
        ouvert={panneau.type === 'saisie'}
        titre={enSaisie === null ? 'Saisir une échéance' : 'Corriger l’échéance'}
        onFermer={() => setPanneau({ type: 'ferme' })}
      >
        {panneau.type === 'saisie' && (
          <Formulaire
            initiale={enSaisie}
            onValider={(champs) => {
              if (enSaisie === null) {
                ajouter(champs);
                signaler('Échéance enregistrée. Elle entre dans les provisions.');
              } else {
                modifier(enSaisie.id, champs);
                signaler('Échéance corrigée.');
              }
              setPanneau({ type: 'ferme' });
            }}
            {...(enSaisie === null
              ? {}
              : {
                onSupprimer: () => {
                  supprimer(enSaisie.id);
                  signaler('Échéance supprimée.');
                  setPanneau({ type: 'ferme' });
                }
              })}
          />
        )}
      </Sheet>
    </section>
  );
}

function Ligne(
  { echeance, jour, onBasculer, onCorriger }: {
    readonly echeance: Echeance;
    readonly jour: string;
    readonly onBasculer: () => void;
    readonly onCorriger: () => void;
  }
) {
  const etat = statutDe(echeance, jour);

  return (
    <li className={styles.ligne}>
      <span className={styles.ligneTitre}>
        <span className={styles.ligneLibelle}>{LIBELLE[echeance.nature]}</span>
        <span className={styles.ligneMontant}><Montant>{eur(echeance.montant)}</Montant></span>
      </span>

      <span className={styles.ligneMeta}>
        <Statut libelle={etat.libelle} ton={etat.ton} />
        <span>échéance {dateCourte(echeance.echeanceLe)}</span>
      </span>

      <span className={styles.ligneActions}>
        <button type="button" className={styles.actionLigne} onClick={onBasculer}>
          {echeance.payee ? 'Repasser à payer' : 'Marquer payée'}
        </button>
        <button type="button" className={styles.actionSecondaire} onClick={onCorriger}>
          Corriger
        </button>
      </span>
    </li>
  );
}

/**
 * Trois états, et ils ne se recouvrent pas.
 *
 * Le jour même de l'échéance, elle n'est pas en retard : on a la journée pour
 * payer. La marquer en retard ce jour-là ferait courir pour rien.
 */
function statutDe(
  e: Echeance, jour: string
): { readonly libelle: string; readonly ton: TonStatut } {
  if (e.payee) return { libelle: 'Payée', ton: 'ok' };
  if (jour > e.echeanceLe) return { libelle: 'En retard', ton: 'retard' };
  return { libelle: 'À payer', ton: 'attente' };
}

type Champs = Omit<Echeance, 'id'>;

function Formulaire(
  { initiale, onValider, onSupprimer }: {
    readonly initiale: Echeance | null;
    readonly onValider: (champs: Champs) => void;
    readonly onSupprimer?: () => void;
  }
) {
  const id = useId();
  const [nature, setNature] = useState<NatureDette>(initiale?.nature ?? 'urssaf');
  const [montant, setMontant] = useState(initiale === null ? '' : String(initiale.montant));
  const [date, setDate] = useState(initiale?.echeanceLe ?? '');
  const [payee, setPayee] = useState(initiale?.payee ?? false);
  const [erreur, setErreur] = useState<string | null>(null);

  function soumettre(evenement: React.FormEvent): void {
    evenement.preventDefault();
    const valeur = Number.parseFloat(montant.replace(',', '.'));
    if (!Number.isFinite(valeur) || valeur <= 0) {
      setErreur('Le montant doit être un nombre supérieur à zéro.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // Sans date, l'échéance ne peut être rattachée à aucun mois : elle
      // n'apparaîtrait dans aucun flux, tout en pesant sur les provisions.
      setErreur('La date d’échéance est obligatoire : sans elle, la somme pèse sur les provisions sans apparaître dans aucun mois.');
      return;
    }
    setErreur(null);
    onValider({
      nature, montant: euros(valeur), echeanceLe: dateISO(date), payee
    });
  }

  return (
    /* `noValidate` : les champs restent `required` — c'est l'information que
       les lecteurs d'écran annoncent — mais la validation du navigateur cède
       la place à la nôtre. « Veuillez renseigner ce champ » ne dit pas
       pourquoi la date compte ; notre message, si. */
    <form className={styles.formulaire} onSubmit={soumettre} noValidate>
      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-nature`}>Nature</label>
        <select
          id={`${id}-nature`}
          className={styles.saisie}
          value={nature}
          onChange={(e) => setNature(e.target.value as NatureDette)}
        >
          {NATURES.map((n) => <option key={n.id} value={n.id}>{n.libelle}</option>)}
        </select>
      </p>

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-montant`}>Montant appelé (€)</label>
        <input
          id={`${id}-montant`}
          inputMode="decimal"
          className={styles.saisie}
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          required
        />
      </p>

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-date`}>Date d’échéance</label>
        <input
          id={`${id}-date`}
          type="date"
          className={styles.saisie}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </p>

      <p className={styles.case}>
        <input
          id={`${id}-payee`}
          type="checkbox"
          checked={payee}
          onChange={(e) => setPayee(e.target.checked)}
        />
        <label htmlFor={`${id}-payee`}>
          Déjà payée
          <span className={styles.aide}>
            Une échéance payée sort des provisions&nbsp;: l’argent a quitté le
            compte, le solde bancaire la reflète déjà.
          </span>
        </label>
      </p>

      {erreur !== null && <p role="alert" className={styles.refus}>{erreur}</p>}

      <button type="submit" className={styles.actionPrincipale}>
        {initiale === null ? 'Enregistrer l’échéance' : 'Enregistrer la correction'}
      </button>

      {onSupprimer !== undefined && (
        <button type="button" className={styles.supprimer} onClick={onSupprimer}>
          Supprimer cette échéance
        </button>
      )}
    </form>
  );
}
