import { useMemo, useRef, useState } from 'react';
import type { DateISO, Euros } from '../../domain/types';
import { euros } from '../../domain/types';
import type { NatureDette } from '../../domain/calculs/provisions';
import { useFaits } from '../../state/store';
import { enregistrerPaiement } from '../../state/ecritures.echeances';
import { type EcheanceAPayer, LIBELLE_NATURE, echeancesAPayer } from '../../state/selecteurs';
import { dateCourte, eur } from '../format';
import { FormulairePaiement } from './FormulairePaiement';
import { Montant } from './Montant';
import { Sheet } from './Sheet';
import { useToast } from './Toasts';
import styles from './Pointage.module.css';

/**
 * Le panneau « Sorties » du Pilote : pointer une échéance comme payée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE JUMEAU DU PANNEAU D'ENCAISSEMENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un prélèvement URSSAF part : on le pointait à l'échéancier, au fond de
 * l'écran Argent, ou dans le détail d'une dette en « Payé aujourd'hui » — sans
 * date ni montant, si bien qu'un débit d'hier tombait dans le mauvais mois le
 * premier du mois. Le handoff n'a pas d'écran pour ce geste ; le panneau
 * reprend celui des encaissements, pour que les deux colonnes du flux se
 * mettent à jour de la même façon.
 *
 * « Marquer payée » n'écrit rien : il ouvre la date du débit et le montant
 * réellement parti (`FormulairePaiement`, le même que l'échéancier), et
 * « Confirmer » appelle `enregistrerPaiement`.
 *
 * La liste vient de `echeancesAPayer`, celle qui fait la colonne Sorties :
 * jusqu'à la fin du mois, retards compris. Le reste de l'échéancier — un
 * appel annuel saisi d'un coup en compte douze — est compté, et mène à
 * l'échéancier : il n'a pas à remplir ce panneau.
 */

/** Une abréviation par nature, pour la pastille : la nature se lit avant le libellé. */
const SIGLE: Readonly<Record<NatureDette, string>> = {
  urssaf: 'UR', tva: 'TVA', impot: 'IR', cfe: 'CFE', cfp: 'CFP'
};

export function Sorties(
  { cible, onFermer }: {
    /** L'échéance dont on a cliqué la pastille : sa ligne s'ouvre directement. */
    readonly cible: string | null;
    readonly onFermer: () => void;
  }
) {
  const echeances = useFaits((e) => e.faits.echeances);
  const signaler = useToast();
  const { maintenant, plusTard } = useMemo(() => echeancesAPayer(echeances), [echeances]);
  const [ouverte, setOuverte] = useState<string | null>(
    () => (cible !== null && maintenant.some((e) => e.id === cible) ? cible : null)
  );
  const liste = useRef<HTMLUListElement | null>(null);
  const termine = useRef<HTMLButtonElement | null>(null);

  const total = euros(maintenant.reduce((s, e) => s + e.montant, 0));
  const totalPlusTard = euros(plusTard.reduce((s, e) => s + e.montant, 0));

  function confirmer(id: string, payeeLe: DateISO, montantPaye: Euros | null): void {
    const rang = maintenant.findIndex((e) => e.id === id);
    enregistrerPaiement(id, payeeLe, montantPaye);
    setOuverte(null);
    signaler(montantPaye === null
      ? 'Paiement enregistré. L’échéance sort des provisions.'
      : 'Paiement enregistré, avec son écart au montant appelé.');
    // La ligne disparaît avec le bouton qui avait le focus : voir le panneau
    // d'encaissement.
    requestAnimationFrame(() => {
      const boutons = liste.current?.querySelectorAll<HTMLButtonElement>('button[data-pointer]') ?? [];
      (boutons[Math.min(rang, boutons.length - 1)] ?? termine.current)?.focus();
    });
  }

  return (
    <Sheet
      ouvert
      variante="atelier"
      titre="Sorties"
      sousTitre="pointe une échéance comme payée"
      onFermer={onFermer}
      pied={(
        <>
          <p className={styles.rappelPied}>
            Payée, l’échéance sort des <strong>provisions</strong> — le solde la reflète déjà
          </p>
          <button ref={termine} type="button" className={styles.termine} onClick={onFermer}>
            Terminé
          </button>
        </>
      )}
    >
      <div className={styles.plan}>
        <aside className={styles.cote}>
          <h3 className={styles.intitule}>Reste à payer ce mois-ci</h3>
          <p className={styles.reste}>
            <span>
              {maintenant.length === 0
                ? 'Aucune échéance à payer'
                : `${maintenant.length} échéance${maintenant.length > 1 ? 's' : ''} à payer`}
            </span>
            <strong className={styles.resteMontant}><Montant>{eur(total)}</Montant></strong>
          </p>
          {plusTard.length > 0 && (
            <p className={styles.precision}>
              <a className={styles.lien} href="#/argent">
                {plusTard.length} autre{plusTard.length > 1 ? 's' : ''} plus tard
                {' '}(<Montant>{eur(totalPlusTard)}</Montant>) — voir l’échéancier
              </a>
            </p>
          )}

          <h3 className={styles.intitule}>Astuce</h3>
          <p className={styles.precision}>
            Pointe à la date du <strong>débit</strong> sur ton relevé, pas à celle
            de l’échéance&nbsp;: c’est elle qui dit de quel mois la sortie relève.
          </p>
          <p className={styles.precision}>
            Les charges sur des encaissements pas encore déclarés n’ont rien à
            payer ici&nbsp;: déclare la période, l’appel suivra.
          </p>
        </aside>

        <div className={styles.principal}>
          {maintenant.length === 0 && (
            <p className={styles.vide}>Rien à payer d’ici la fin du mois.</p>
          )}
          <ul ref={liste} className={styles.liste} aria-label="Échéances à payer">
            {maintenant.map((e) => (
              <Ligne
                key={e.id}
                echeance={e}
                ouverte={ouverte === e.id}
                focaliser={cible === e.id}
                onOuvrir={() => setOuverte(e.id)}
                onAnnuler={() => setOuverte(null)}
                onConfirmer={(payeeLe, montantPaye) => confirmer(e.id, payeeLe, montantPaye)}
              />
            ))}
          </ul>
        </div>
      </div>
    </Sheet>
  );
}

function Ligne(
  { echeance: e, ouverte, focaliser, onOuvrir, onAnnuler, onConfirmer }: {
    readonly echeance: EcheanceAPayer;
    readonly ouverte: boolean;
    readonly focaliser: boolean;
    readonly onOuvrir: () => void;
    readonly onAnnuler: () => void;
    readonly onConfirmer: (payeeLe: DateISO, montantPaye: Euros | null) => void;
  }
) {
  const libelle = LIBELLE_NATURE[e.nature];
  return (
    <li className={`${styles.ligne} ${e.enRetard ? styles.ligneEnRetard : ''}`}>
      <div className={styles.entete}>
        <span className={`${styles.avatar} ${styles.teinte2}`} aria-hidden="true">{SIGLE[e.nature]}</span>
        <span className={styles.texte}>
          <span className={styles.client}>{libelle}</span>
          <span className={styles.meta}>échéance le {dateCourte(e.echeanceLe)}</span>
        </span>
        {e.enRetard && <span className={styles.pastille}>en retard</span>}
        <span className={styles.montant}><Montant>{eur(e.montant)}</Montant></span>
        {!ouverte && (
          <button type="button" data-pointer className={styles.marquer} onClick={onOuvrir}>
            Marquer payée
            <span className={styles.horsEcran}> — {libelle}, échéance le {dateCourte(e.echeanceLe)}</span>
          </button>
        )}
      </div>
      {ouverte && (
        <div className={styles.saisie}>
          <FormulairePaiement
            enLigne
            focaliser={focaliser}
            montantAppele={e.montant}
            libelleValider="Confirmer le paiement"
            onValider={onConfirmer}
            onAnnuler={onAnnuler}
          />
        </div>
      )}
    </li>
  );
}
