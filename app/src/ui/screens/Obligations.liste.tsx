import { useState } from 'react';
import type { DateISO } from '../../domain/types';
import type { Obligation } from '../../domain/calculs/obligations';
import { Montant } from '../components/Montant';
import { Statut } from '../components/Statut';
import { eur } from '../format';
import {
  avanceLisible, dateDe, etapeEnCours, jourMois, montantLisible, moisCourt, pastilleDe
} from './Obligations.lecture';
import styles from './Obligations.module.css';

/**
 * « À faire et à venir » : une ligne par obligation, et le dossier qu'elle
 * ouvre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE LISTE À LA PLACE DE DEUX CARTES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Échéances reçues » montrait ce qui avait été appelé, « Périodes URSSAF »
 * ce qui restait à déclarer : deux listes du même cycle, et une période
 * déclarée apparaissait dans l'une pendant que son appel apparaissait dans
 * l'autre. Ici, une ligne est une obligation — déclaration et paiement —, et
 * ses gestes vivent dans son dossier.
 *
 * Les lignes faites se replient : on ouvre l'écran pour ce qui vient. Elles
 * restent à un clic, avec l'avance de leur déclaration — « deux jours avant
 * la limite » —, qui est l'histoire qu'on vient y relire.
 */
export function ListeObligations(
  { aFaire, faites, aujourdhui, ouverte, onOuvrir }: {
    readonly aFaire: readonly Obligation[];
    readonly faites: readonly Obligation[];
    readonly aujourdhui: DateISO;
    /** L'obligation dont le dossier est ouvert, marquée dans la liste. */
    readonly ouverte: string | null;
    readonly onOuvrir: (o: Obligation) => void;
  }
) {
  const [voirFaites, setVoirFaites] = useState(false);
  return (
    <>
      {aFaire.length === 0
        ? <p className={styles.vide}>Rien à faire ni à venir cette année.</p>
        : (
          <ul className={styles.liste}>
            {aFaire.map((o) => (
              <Ligne key={o.id} obligation={o} aujourdhui={aujourdhui} ouverte={o.id === ouverte} onOuvrir={onOuvrir} />
            ))}
          </ul>
        )}
      {faites.length > 0 && (
        <>
          <button
            type="button"
            className={styles.replie}
            aria-expanded={voirFaites}
            onClick={() => setVoirFaites((v) => !v)}
          >
            {voirFaites
              ? 'Masquer les faites'
              : `Voir ${faites.length === 1 ? 'la faite' : `les ${faites.length} faites`} cette année`}
          </button>
          {voirFaites && (
            <ul className={styles.liste} aria-label="Faites cette année">
              {faites.map((o) => (
                <Ligne key={o.id} obligation={o} aujourdhui={aujourdhui} ouverte={o.id === ouverte} onOuvrir={onOuvrir} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

/**
 * Ce qu'une ligne dit sous son intitulé.
 *
 * Faite : quand, et avec quelle avance — « déclarée le 28 avril, deux jours
 * avant la limite ». Sinon, le détail de l'obligation, et pour une période
 * URSSAF ce qui est encaissé dessus : le chiffre qu'on recopiera.
 */
function Precision({ o }: { readonly o: Obligation }) {
  const d = o.declaration;
  if (etapeEnCours(o) === null && d !== undefined && d.faiteLe !== null) {
    const avance = avanceLisible(d.avance);
    return <>{o.dossier === 'des' ? 'Déposée' : 'Déclarée'} le {jourMois(d.faiteLe)}{avance === null ? '' : `, ${avance}`}</>;
  }
  const encaisse = o.assiette !== undefined && o.assiette > 0 && o.dossier === 'urssaf';
  return (
    <>
      {o.detail}
      {encaisse && (
        <>{o.detail === '' ? '' : ' · '}<Montant>{eur(o.assiette ?? 0)}</Montant> encaissés{d?.etat === 'a_venir' ? ' à ce jour' : ''}</>
      )}
    </>
  );
}

function Ligne(
  { obligation: o, aujourdhui, ouverte, onOuvrir }: {
    readonly obligation: Obligation;
    readonly aujourdhui: DateISO;
    readonly ouverte: boolean;
    readonly onOuvrir: (o: Obligation) => void;
  }
) {
  const date = dateDe(o);
  const jour = Number(date.slice(8, 10));
  const pastille = pastilleDe(o, aujourdhui);
  const montant = montantLisible(o, eur);
  // Le bloc date s'éclaire quand la limite tombe ce mois-ci : c'est elle qu'on
  // regarde d'abord.
  const ceMois = date.slice(0, 7) === aujourdhui.slice(0, 7) && etapeEnCours(o) !== null;
  const etape = etapeEnCours(o);
  // Une limite dont le jour manque — une CA3 sans nom, une déclaration de
  // revenus d'une année non publiée — se place à la fin de son mois ; le
  // bloc ne prétend pas en connaître le jour.
  const jourInconnu = etape !== null && etape.limite.statut === 'refuse';

  return (
    <li>
      <button
        type="button"
        className={ouverte ? `${styles.ligne} ${styles.ligneOuverte}` : styles.ligne}
        aria-current={ouverte ? 'true' : undefined}
        onClick={() => onOuvrir(o)}
      >
        <span className={ceMois ? `${styles.date} ${styles.dateCeMois}` : styles.date} aria-hidden="true">
          <span>{jourInconnu ? '—' : jour === 1 ? <>1<sup>er</sup></> : jour}</span>
          <small>{moisCourt(date)}</small>
        </span>
        <span className={styles.horsEcran}>
          {jourInconnu ? `${moisCourt(date)} ${date.slice(0, 4)}, jour à confirmer` : jourMois(date)} —
        </span>
        <span className={styles.intitule}>
          {o.libelle}
          <small><Precision o={o} /></small>
        </span>
        <span className={styles.droite}>
          <span className={montant === '—' ? `${styles.montant} ${styles.sansMontant}` : styles.montant}>
            {montant === '—' ? '—' : <Montant>{montant}</Montant>}
          </span>
          {pastille.court === pastille.libelle
            ? <Statut libelle={pastille.libelle} ton={pastille.ton} />
            : (
              <>
                <span className={styles.pastilleLongue}><Statut libelle={pastille.libelle} ton={pastille.ton} /></span>
                <span className={styles.pastilleCourte}><Statut libelle={pastille.court} ton={pastille.ton} /></span>
              </>
            )}
        </span>
      </button>
    </li>
  );
}
