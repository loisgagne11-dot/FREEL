import { useState } from 'react';
import { CartePliable } from '../components/CartePliable';
import { Montant } from '../components/Montant';
import { definirRapprochement, marquerSansContrepartie, rapprocherMouvement } from '../../state/ecritures.achats';
import { encaisserRecette } from '../../state/ecritures.recettes';
import type { MouvementBancaire } from '../../domain/calculs/banque';
import type { PropositionDepense, PropositionOperation, SuiviRapprochement } from '../../state/selecteurs.achats.suivi';
import { dateCourte, eurExact } from '../format';
import styles from './Achats.module.css';

/**
 * Le bloc « Rapprochement bancaire » de l'écran Achats.
 *
 * Il ne décide rien : chaque ligne porte l'action que le sélecteur a jugée la
 * plus probable, et c'est un clic qui l'exécute. Le geste « Associer » passe la
 * facture en encaissée À LA DATE DE L'OPÉRATION — la date du relevé fait foi,
 * pas celle d'aujourd'hui, sans quoi le livre des recettes dirait qu'un
 * virement de mai est arrivé en juin.
 */
export function BlocRapprochement(
  { suivi, onCreer, onOuvrir }: {
    readonly suivi: SuiviRapprochement;
    /** Ouvre le formulaire de dépense, pré-rempli depuis l'opération. */
    readonly onCreer: (m: MouvementBancaire) => void;
    readonly onOuvrir: (depenseId: string) => void;
  }
) {
  const [refus, setRefus] = useState<string | null>(null);

  function associer(p: PropositionOperation): void {
    if (p.action.type !== 'associer') return;
    if (p.action.encaisser) {
      // Mode « virement » : un crédit sur le compte relié en est un. Les
      // espèces ou chèques ne passent pas par une opération de ce genre.
      const motif = encaisserRecette(p.action.recetteId, p.mouvement.date, 'virement');
      if (motif !== null) { setRefus(motif); return; }
    }
    setRefus(null);
    rapprocherMouvement(p.mouvement.id, p.action.recetteId);
  }

  function relier(mouvement: MouvementBancaire, depenseId: string): void {
    rapprocherMouvement(mouvement.id, depenseId);
    // L'état stocké de la dépense suit : le registre lit cet état.
    definirRapprochement(depenseId, 'rapproche');
  }

  return (
    <CartePliable
      id="rapprochement-bancaire"
      ecran="achats"
      titre="Rapprochement bancaire"
      resume={`${suivi.aTraiter} à traiter`}
      actions={<span className={styles.compteur}>{suivi.aTraiter} à traiter</span>}
    >
      {refus !== null && <p role="alert" className={styles.verdictDanger}>{refus}</p>}

      {suivi.operations.length > 0 && (
        <>
          <h3 className={styles.sousTitreBloc}>Opérations du compte sans dépense associée</h3>
          <ul className={styles.liste}>
            {suivi.operations.map((p) => (
              <li key={p.mouvement.id} className={styles.proposition}>
                <span className={styles.propositionTexte}>
                  <span className={styles.ligneLibelle}>{p.mouvement.libelle || 'Sans libellé'}</span>
                  <span className={styles.ligneMeta}>
                    <span>{dateCourte(p.mouvement.date)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{enonce(p)}</span>
                  </span>
                </span>
                <span className={p.mouvement.montant < 0 ? styles.debit : styles.credit}>
                  <Montant>{eurExact(p.mouvement.montant)}</Montant>
                </span>
                <span className={styles.actions}>
                  {p.action.type === 'associer' && (
                    <button type="button" className={styles.actionPrincipale} onClick={() => associer(p)}>
                      Associer
                    </button>
                  )}
                  {p.action.type === 'relier' && (
                    <button
                      type="button"
                      className={styles.actionPrincipale}
                      onClick={() => p.action.type === 'relier' && relier(p.mouvement, p.action.depenseId)}
                    >
                      Relier
                    </button>
                  )}
                  {p.action.type === 'creer' && (
                    <button type="button" className={styles.actionPrincipale} onClick={() => onCreer(p.mouvement)}>
                      Créer la dépense
                    </button>
                  )}
                  {p.action.type === 'qualifier' && (
                    <button
                      type="button"
                      className={styles.action}
                      onClick={() => marquerSansContrepartie(p.mouvement.id, 'autre')}
                    >
                      Sans contrepartie
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {suivi.depenses.length > 0 && (
        <>
          <h3 className={styles.sousTitreBloc}>Dépenses saisies en attente de leur opération bancaire</h3>
          <ul className={styles.liste}>
            {suivi.depenses.map((p) => (
              <LigneDepenseEnAttente
                key={p.depense.id}
                proposition={p}
                onRelier={relier}
                onOuvrir={onOuvrir}
              />
            ))}
          </ul>
        </>
      )}
    </CartePliable>
  );
}

/** Ce que la proposition dit, en une phrase : pourquoi cette action. */
function enonce(p: PropositionOperation): string {
  switch (p.action.type) {
    case 'associer':
      return p.action.encaisser
        ? `Proposé : ${p.action.libelle} — passe la facture en encaissée à la date de l’opération`
        : `Proposé : ${p.action.libelle} — recette déjà encaissée`;
    case 'relier': return `Proposé : ${p.action.libelle} — dépense déjà saisie`;
    case 'creer': return 'Aucune dépense saisie — à créer et à joindre';
    case 'qualifier': return 'Aucune facture en attente de ce montant';
  }
}

function LigneDepenseEnAttente(
  { proposition, onRelier, onOuvrir }: {
    proposition: PropositionDepense;
    onRelier: (m: MouvementBancaire, depenseId: string) => void;
    onOuvrir: (depenseId: string) => void;
  }
) {
  const { depense, mouvement } = proposition;
  return (
    <li className={styles.proposition}>
      <span className={styles.propositionTexte}>
        <span className={styles.ligneLibelle}>{depense.fournisseur || depense.libelle || 'Sans libellé'}</span>
        <span className={styles.ligneMeta}>
          <span>{dateCourte(depense.payeeLe)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {mouvement === null
              ? 'Aucune opération compatible'
              : `Opération compatible : ${mouvement.libelle} — à confirmer`}
          </span>
        </span>
      </span>
      <span className={styles.debit}><Montant>{eurExact(-depense.montantTtc)}</Montant></span>
      <span className={styles.actions}>
        {mouvement !== null && (
          <button type="button" className={styles.actionPrincipale} onClick={() => onRelier(mouvement, depense.id)}>
            Relier
          </button>
        )}
        {/* Payée hors du compte relié : la dépense n'attend alors aucune opération. */}
        <button type="button" className={styles.action} onClick={() => definirRapprochement(depense.id, 'sans_banque')}>
          Hors compte
        </button>
        <button type="button" className={styles.action} onClick={() => onOuvrir(depense.id)}>
          Ouvrir
        </button>
      </span>
    </li>
  );
}
