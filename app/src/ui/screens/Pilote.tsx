import { useMemo, useState } from 'react';
import { euros } from '../../domain/types';
import { useFaits } from '../../state/store';
import { etatPilote, moisCourant } from '../../state/selecteurs';
import { eur, moisLong, moisTexte } from '../format';
import styles from './Pilote.module.css';

/**
 * Écran Pilote — « combien je peux me verser, et qu'est-ce qui coince ».
 *
 * INVARIANT : aucun nombre n'est écrit dans ce fichier. Tout vient des faits et
 * du domaine, via `etatPilote`. C'est ce qui empêche la dérive qui produisait
 * cinq valeurs concurrentes du taux de cotisations dans l'ancienne version.
 *
 * Le curseur de réserve est le SEUL endroit de l'application qui écrit la
 * réserve (décision D4).
 */
export function Pilote() {
  const faits = useFaits((e) => e.faits);
  const chargement = useFaits((e) => e.chargement);
  const definirReserve = useFaits((e) => e.definirReserve);

  const mois = moisCourant();
  // Recalculé à chaque changement de faits, jamais stocké.
  const etat = useMemo(() => etatPilote(faits), [faits]);

  return (
    <>
      <header className={styles.entete}>
        <h1 className={styles.titre}>Pilote</h1>
        <p className={styles.periode}>{moisLong(mois)}</p>
      </header>

      {chargement.phase === 'sans-persistance' && (
        <Bandeau ton="alerte" titre="Vos saisies ne sont pas conservées">
          {chargement.motif}
        </Bandeau>
      )}

      {chargement.phase === 'pret' && chargement.migrationEffectuee && (
        <Bandeau ton="info" titre="Données reprises de la version précédente">
          Une sauvegarde de l’état d’origine a été archivée avant toute écriture.
        </Bandeau>
      )}

      {/* Un calcul incomplet n'est jamais présenté comme un résultat : un
          versable trop élevé conduirait à se verser de l'argent déjà dû. */}
      {etat.tresorerie.incomplet && (
        <Bandeau ton="alerte" titre="Montants sous-évalués">
          Certaines recettes ne peuvent pas être provisionnées faute de barème
          pour leur période. Les montants ci-dessous sont donc <strong>plus élevés
          que la réalité</strong>.
          <ul className={styles.motifs}>
            {etat.tresorerie.motifsIncomplets.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </Bandeau>
      )}

      {etat.tauxImpotIndisponible && etat.motifTauxImpot !== null && (
        <Bandeau ton="alerte" titre="Barème d’imposition manquant">
          {etat.motifTauxImpot}
        </Bandeau>
      )}

      <section className={styles.versable} aria-labelledby="titre-versable">
        <h2 id="titre-versable" className={styles.libelle}>Je peux me verser</h2>
        <p className={styles.montantPrincipal}>{eur(etat.tresorerie.versable)}</p>
        <p className={styles.sousLigne}>
          Autonomie&nbsp;: {moisTexte(etat.autonomie)}
          {faits.besoinMensuel <= 0 && (
            <span className={styles.note}> — renseignez votre besoin mensuel pour la calculer</span>
          )}
        </p>
      </section>

      <div className={styles.grille}>
        <Chiffre libelle="Solde" valeur={eur(etat.tresorerie.solde)} />
        <Chiffre
          libelle="À garder de côté"
          valeur={eur(etat.tresorerie.provisions)}
          ton={etat.tresorerie.provisions > 0 ? 'attention' : 'neutre'}
        />
        <Chiffre
          libelle="Disponible"
          valeur={eur(etat.tresorerie.dispo)}
          ton={etat.tresorerie.dispo < 0 ? 'danger' : 'neutre'}
        />
        <Chiffre libelle="Réserve" valeur={eur(etat.tresorerie.reserve)} />
      </div>

      <section className={styles.carte} aria-labelledby="titre-provisions">
        <h2 id="titre-provisions" className={styles.titreCarte}>Ce que je dois</h2>
        <dl className={styles.detail}>
          <div className={styles.ligne}>
            <dt>Échéances à payer</dt>
            <dd>{eur(etat.voletConstate)}</dd>
          </div>
          <div className={styles.ligne}>
            <dt>
              Charges sur recettes encaissées
              <span className={styles.aide}>
                non encore déclarées — la dette naît à l’encaissement
              </span>
            </dt>
            <dd>{eur(etat.voletAProvisionner)}</dd>
          </div>
          <div className={`${styles.ligne} ${styles.total}`}>
            <dt>Total</dt>
            <dd>{eur(etat.tresorerie.provisions)}</dd>
          </div>
        </dl>
      </section>

      <CurseurReserve
        reserve={etat.tresorerie.reserve}
        maximum={Math.max(etat.tresorerie.solde, etat.tresorerie.reserve)}
        onChange={(v) => definirReserve(euros(v))}
      />
    </>
  );
}

/* ---------- éléments locaux ---------- */

function Bandeau(
  { ton, titre, children }: {
    ton: 'info' | 'alerte';
    titre: string;
    children: React.ReactNode;
  }
) {
  return (
    // `role="status"` plutôt que `alert` : ces bandeaux sont présents au
    // rendu, ils n'interrompent pas l'utilisateur en cours de tâche.
    <section className={`${styles.bandeau} ${ton === 'alerte' ? styles.bandeauAlerte : styles.bandeauInfo}`} role="status">
      <strong className={styles.bandeauTitre}>{titre}</strong>
      <div className={styles.bandeauCorps}>{children}</div>
    </section>
  );
}

function Chiffre(
  { libelle, valeur, ton = 'neutre' }: {
    libelle: string;
    valeur: string;
    ton?: 'neutre' | 'attention' | 'danger';
  }
) {
  const classeTon = ton === 'danger' ? styles.danger : ton === 'attention' ? styles.attention : '';
  return (
    <div className={styles.chiffre}>
      <span className={styles.libelle}>{libelle}</span>
      <span className={`${styles.montant} ${classeTon}`}>{valeur}</span>
    </div>
  );
}

/**
 * Curseur de réserve — source unique du matelas de sécurité (D4).
 *
 * L'état local ne sert qu'à la fluidité du glissement ; la valeur est écrite
 * dans le magasin à chaque changement, de sorte qu'il n'existe jamais deux
 * vérités sur la réserve.
 */
function CurseurReserve(
  { reserve, maximum, onChange }: {
    reserve: number;
    maximum: number;
    onChange: (valeur: number) => void;
  }
) {
  const [saisie, setSaisie] = useState<number | null>(null);
  const affiche = saisie ?? reserve;
  // Un maximum nul rendrait le curseur inutilisable : on garde une plage
  // minimale plutôt qu'un contrôle mort.
  const borne = Math.max(maximum, 1000);
  const pas = 50;

  return (
    <section className={styles.carte} aria-labelledby="titre-reserve">
      <h2 id="titre-reserve" className={styles.titreCarte}>Réserve de sécurité</h2>
      <p className={styles.aideCarte}>
        Montant que vous gardez sur le compte quoi qu’il arrive. Il est retiré du
        disponible pour obtenir ce que vous pouvez vous verser.
      </p>
      <div className={styles.curseurRangee}>
        <input
          type="range"
          className={styles.curseur}
          min={0}
          max={borne}
          step={pas}
          value={affiche}
          aria-label="Réserve de sécurité en euros"
          aria-valuetext={eur(affiche)}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSaisie(v);
            onChange(v);
          }}
          onBlur={() => setSaisie(null)}
        />
        <output className={styles.curseurValeur}>{eur(affiche)}</output>
      </div>
    </section>
  );
}
