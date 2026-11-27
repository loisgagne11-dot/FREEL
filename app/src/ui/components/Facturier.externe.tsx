import { useMemo } from 'react';
import { useFaits } from '../../state/store';
import { brouillonsDeFacture, facturesARattacher, moisAEnregistrer } from '../../state/selecteurs.brouillon';
import { rattacherAuMois } from '../../state/ecritures.recettes';
import type { Faits } from '../../state/schema';
import { useToast } from './Toasts';
import type { BrouillonDeFacture } from '../../domain/calculs/brouillon';
import { decalerMois } from '../../domain/calculs/periode';
import type { Mois } from '../../domain/types';
import { deMois } from '../../domain/calculs/aTraiter.libelles';
import { Info } from './Info';
import { Montant } from './Montant';
import { dateCourte, eur, formaterJours, moisLong } from '../format';
import styles from './Facturier.module.css';

/**
 * Le haut du facturier quand les factures s'émettent dans un autre logiciel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PAS DE « RÉDIGER », PAS D'ÉCART
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le propriétaire émet dans Tiime (22/11) : FREEL ne rédige rien, il
 * enregistre ce qui est parti. Le montant d'un mois est celui du planning —
 * « la facture correspondra toujours aux jours du planning » —, donc aucun
 * écart facture / planning ne se calcule ici : il dirait faux chaque fois que
 * Tiime arrondit autrement, et rien de vrai le reste du temps.
 *
 * Chargé à la demande : avec FREEL, personne ne le télécharge.
 */
export function FacturesAEnregistrer(
  { mois, onMois, onEnregistrer }: {
    readonly mois: Mois;
    readonly onMois: (m: Mois) => void;
    /** Ouvre le formulaire prérempli depuis ce brouillon. */
    readonly onEnregistrer: (b: BrouillonDeFacture) => void;
  }
) {
  const faits = useFaits((e) => e.faits);
  const attente = useMemo(() => moisAEnregistrer(faits), [faits]);
  const duMois = useMemo(() => brouillonsDeFacture(faits, mois), [faits, mois]);

  return (
    <>
      {attente.length > 0 && <MoisEnAttente faits={faits} attente={attente} onEnregistrer={onEnregistrer} />}
      {duMois.length > 0 && (
        <section className={styles.carte} aria-labelledby="titre-a-enregistrer">
          <header className={styles.entete}>
            <h2 id="titre-a-enregistrer" className={styles.titreCarte}>
              {duMois.every((b) => b.dejaEmise !== null)
                ? `La facture ${deMois(moisLong(mois))}`
                : `À enregistrer : ${moisLong(mois)}`}
              <Info libelle="D’où vient ce montant">
                Du <strong>planning</strong>, celui-là même qui produit le compte
                rendu d’activité&nbsp;: les journées retenues, ajustements
                compris. La facture émise dans ton logiciel reprend ces jours —
                FREEL l’enregistre, sans la comparer.
              </Info>
            </h2>
            {/* Les flèches déplacent le mois de l'application, comme celles du
                brouillon de FREEL : on cherche ici la facture du mois
                précédent, le jour où on l'enregistre. */}
            <div className={styles.navigationMois}>
              <button type="button" className={styles.pas}
                onClick={() => onMois(decalerMois(mois, -1))} aria-label="Mois précédent">‹</button>
              <span className={styles.moisCourant} role="status" aria-label="Mois facturé">
                {moisLong(mois)}
              </span>
              <button type="button" className={styles.pas}
                onClick={() => onMois(decalerMois(mois, 1))} aria-label="Mois suivant">›</button>
            </div>
          </header>

          <ul className={styles.liste}>
            {duMois.map((b) => (
              <li key={b.cle} className={styles.ligneBrouillon}>
                <div className={styles.brouillonTitre}>
                  <span className={styles.brouillonClient}>{b.clientNom}</span>
                  <span className={styles.brouillonTotal}>
                    <Montant>{eur(b.total)}</Montant>
                    <span className={styles.montantNote}> HT</span>
                  </span>
                </div>
                <p className={styles.dejaEmise}>
                  {formaterJours(b.jours)} j au planning
                  {b.lignes.length > 1 && <> · {b.lignes.length} missions</>}
                </p>
                {b.dejaEmise === null
                  ? (
                    <button type="button" className={styles.actionPrincipale} onClick={() => onEnregistrer(b)}>
                      Enregistrer la facture émise
                    </button>
                  )
                  : (
                    <p className={styles.dejaEmise}>
                      Facture {b.dejaEmise} enregistrée pour {moisLong(mois)}.
                    </p>
                  )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * Les mois travaillés que rien n'a encore facturé ici.
 *
 * Une ligne par mois et par payeur, un geste chacune : on rattrape juillet,
 * août et septembre en une fois, sans naviguer de mois en mois — c'est la
 * situation du jour où l'on commence à suivre Tiime depuis FREEL. Les mois se
 * disent d'abord en une phrase, parce que c'est elle qu'on lit : « juillet,
 * août, septembre ».
 */
function MoisEnAttente(
  { faits, attente, onEnregistrer }: {
    readonly faits: Faits;
    readonly attente: readonly BrouillonDeFacture[];
    readonly onEnregistrer: (b: BrouillonDeFacture) => void;
  }
) {
  const signaler = useToast();
  const lesMois = [...new Set(attente.map((b) => b.mois))];
  return (
    <section className={styles.carte} aria-labelledby="titre-mois-en-attente">
      <header className={styles.entete}>
        <h2 id="titre-mois-en-attente" className={styles.titreCarte}>
          Les mois en attente
          <Info libelle="Ce qui fait entrer un mois ici, et l’en fait sortir">
            Un mois travaillé au planning, sur les douze derniers — et le mois
            en cours dès qu’il n’y reste plus de journée à venir —, pour lequel
            aucune facture à ce client n’est enregistrée. Il sort de la liste
            dès qu’une facture le couvre&nbsp;: c’est le mois que tu indiques en
            l’enregistrant, ou à défaut celui de son émission. Une facture
            déjà au livre qui ne dit pas son mois se désigne d’un geste.
          </Info>
        </h2>
      </header>
      <p className={styles.aide}>{phrase(lesMois)}&nbsp;: travaillés, et aucune facture enregistrée.</p>
      <ul className={styles.liste}>
        {attente.map((b) => (
          <li key={`${b.mois}-${b.cle}`} className={styles.ligne}>
            <span className={styles.ligneTitre}>
              <span className={styles.ligneLibelle}>
                {capitale(moisLong(b.mois))} — {b.clientNom}
              </span>
              <span className={styles.ligneMontant}>
                <Montant>{eur(b.total)}</Montant>
                <span className={styles.montantNote}> HT</span>
              </span>
            </span>
            <span className={styles.ligneMeta}>{formaterJours(b.jours)} j au planning</span>
            <span className={styles.ligneActions}>
              <button type="button" className={styles.actionLigne}
                aria-label={`Enregistrer la facture ${deMois(moisLong(b.mois))} pour ${b.clientNom}`}
                onClick={() => onEnregistrer(b)}>
                Enregistrer
              </button>
              {/* La facture est peut-être déjà au livre, sans mois dit : la
                  réenregistrer serait refusé (son numéro y est), et le mois
                  resterait en attente un an. On la désigne d'un geste. */}
              {facturesARattacher(faits, b).map((r) => (
                <button key={r.id} type="button" className={styles.actionSecondaire}
                  onClick={() => {
                    const motif = rattacherAuMois(r.id, b.mois);
                    signaler(motif ?? `La facture ${r.numero || 'sans numéro'} couvre désormais ${moisLong(b.mois)}.`);
                  }}>
                  C’est la {r.numero || 'facture sans numéro'}, émise le {dateCourte(r.emiseLe)}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const NOM_DU_MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' });

const capitale = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * « Novembre, décembre 2025 et janvier 2026 » : l'année une fois par année,
 * après son dernier mois. « juillet 2026, août 2026, septembre 2026 » se
 * lisait comme trois dates, et la liste qu'on voulait voir d'un coup d'œil
 * redevenait un tableau.
 */
function phrase(mois: readonly Mois[]): string {
  const noms = mois.map((m, i) => {
    const nom = NOM_DU_MOIS.format(new Date(`${m}-01T00:00:00Z`));
    return mois[i + 1]?.slice(0, 4) === m.slice(0, 4) ? nom : `${nom} ${m.slice(0, 4)}`;
  });
  const texte = noms.length <= 1 ? noms.join('') : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1] ?? ''}`;
  return capitale(texte);
}
