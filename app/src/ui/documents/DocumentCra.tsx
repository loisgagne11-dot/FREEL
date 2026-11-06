import { Fragment } from 'react';
import type { SemaineCra, SyntheseCra, VolumeClient } from '../../domain/calculs/cra';
import type { Entreprise } from '../../state/schema';
import { moisLong } from '../format';

/**
 * Le compte rendu d'activité tel qu'il part chez le client.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUCUN MONTANT, ET C'EST LA RÈGLE DU DOCUMENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La carte qu'il remplace affichait le total de jours ET sa valorisation au
 * TJM. Un CRA qui porte un prix se renégocie au lieu de se signer : le client
 * y lit une facture, la conteste ligne à ligne, et le document perd sa seule
 * fonction — attester du volume. Le suivi d'activité et la facturation sont
 * deux conversations, et ce papier n'en tient qu'une.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES COLONNES DE LIEU N'APPARAISSENT QUE SI ON SAIT QUELQUE CHOSE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un compte importé de l'ancienne application n'a aucun lieu enregistré :
 * afficher « Télétrav. 0 j · Sur site 0 j · Total 12 j » ferait lire douze
 * journées sans lieu comme douze journées à zéro partout. Quand rien n'est
 * connu du mois, les deux colonnes disparaissent et il ne reste que le
 * volume — ce qui est exactement ce qu'on sait.
 */
export interface ProprietesDocumentCra {
  readonly synthese: SyntheseCra;
  readonly entreprise: Entreprise;
  /** Le client qui signe, ou `null` pour le document tous clients. */
  readonly destinataire: string | null;
  /** La phrase de tâches d'une semaine, par lundi. */
  readonly taches: Readonly<Record<string, string>>;
}

/** Une quotité lisible : « 4,5 j » et jamais « 4.5 j ». */
export const enJours = (n: number): string =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n)} j`;

/** Le jour et le mois d'une date ISO : « 04 juin ». */
function jourEtMois(date: string): string {
  const mois = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`));
  return `${date.slice(8, 10)} ${mois}`;
}

/**
 * La plage d'une semaine : « 01 → 05 juin », ou le seul jour travaillé.
 *
 * Exportée, et lue AUSSI par la colonne de saisie du générateur. Elle y était
 * réécrite en deux lignes, et rendait « 13 → 13 » là où le document disait
 * « 13 juillet » — deux formulations pour une même semaine, sur le même écran.
 */
export function plageDeSemaine(s: SemaineCra, avecMois = true): string {
  const fin = avecMois ? jourEtMois(s.dernierJour) : s.dernierJour.slice(8, 10);
  return s.premierJour === s.dernierJour
    ? (avecMois ? jourEtMois(s.premierJour) : s.premierJour.slice(8, 10))
    : `${s.premierJour.slice(8, 10)} → ${fin}`;
}

export function DocumentCra(
  { synthese, entreprise, destinataire, taches }: ProprietesDocumentCra
) {
  const periode = moisLong(synthese.mois);
  // Ce que le mois sait vraiment du lieu. Voir l'en-tête : c'est ce qui décide
  // d'afficher les colonnes ou de s'en abstenir.
  const lieuConnu = synthese.parClient.some((v) => v.teletravail > 0 || v.surSite > 0);
  const lieuIncomplet = synthese.parClient.some((v) => v.nonPrecise > 0);
  const colonnes = lieuConnu ? 5 : 3;

  return (
    <article
      className="doc"
      aria-label={`Compte-rendu d’activité — ${periode}${destinataire === null ? '' : ` — ${destinataire}`}`}
    >
      <header className="doc-entete">
        <div>
          <p className="doc-marque">{marque(entreprise.nom)}</p>
          <p className="doc-emetteur">
            {entreprise.adresse !== '' && <>{entreprise.adresse}<br /></>}
            {[entreprise.codePostal, entreprise.ville].filter((x) => x !== '').join(' ')}
            {entreprise.siret !== '' && <><br />SIRET {entreprise.siret}</>}
          </p>
        </div>
        <div className="doc-titre">
          <h1>Compte-rendu d’activité</h1>
          <p className="doc-periode">{periode}</p>
          <p className="doc-destinataire">
            Synthèse hebdomadaire<br />
            {destinataire ?? 'Tous clients'}
          </p>
        </div>
      </header>

      <table className="doc-table">
        <thead>
          <tr>
            <th scope="col">Semaine</th>
            <th scope="col">Client</th>
            {lieuConnu && <th scope="col" className="doc-n">Télétrav.</th>}
            {lieuConnu && <th scope="col" className="doc-n">Sur site</th>}
            <th scope="col" className="doc-n">Total</th>
          </tr>
        </thead>
        <tbody>
          {synthese.semaines.map((s) => {
            const phrase = taches[s.lundi] ?? '';
            return (
              <Fragment key={s.lundi}>
                <tr className="doc-semaine">
                  <td>Semaine {s.rang}</td>
                  <td>{plageDeSemaine(s)}</td>
                  {lieuConnu && <td className="doc-n" />}
                  {lieuConnu && <td className="doc-n" />}
                  <td className="doc-n">{enJours(s.total)}</td>
                </tr>
                {s.volumes.map((v) => (
                  <LigneVolume key={v.client} volume={v} lieuConnu={lieuConnu} decale />
                ))}
                {phrase !== '' && (
                  <tr className="doc-taches">
                    <td colSpan={colonnes}>Tâches — {phrase}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {synthese.parClient.length > 1 && (
        <>
          <p className="doc-sousTitre">Totaux du mois par client</p>
          <table className="doc-table">
            <tbody>
              {synthese.parClient.map((v) => (
                <LigneVolume key={v.client} volume={v} lieuConnu={lieuConnu} decale={false} />
              ))}
            </tbody>
          </table>
        </>
      )}

      <table className="doc-table">
        <tbody>
          <tr className="doc-total">
            <td colSpan={colonnes - 1}>Grand total · {periode}</td>
            <td className="doc-n">{enJours(synthese.total)}</td>
          </tr>
        </tbody>
      </table>

      <p className="doc-note">
        Suivi d’activité uniquement — <strong>aucun montant</strong> : la
        facturation se fait depuis les factures.
        {lieuIncomplet && (
          <> Certaines journées n’ont pas de lieu renseigné&nbsp;; elles comptent
          dans le total sans être réparties.</>
        )}
      </p>

      <div className="doc-signatures">
        <p className="doc-signature">Validé par le prestataire<span /></p>
        <p className="doc-signature">
          Bon pour accord — {destinataire ?? 'client(s)'}<span />
        </p>
      </div>
    </article>
  );
}

function LigneVolume(
  { volume, lieuConnu, decale }: {
    readonly volume: VolumeClient;
    readonly lieuConnu: boolean;
    readonly decale: boolean;
  }
) {
  return (
    <tr className={decale ? 'doc-client' : ''}>
      <td />
      <td className={decale ? '' : 'doc-fort'}>{volume.client}</td>
      {lieuConnu && <td className="doc-n">{enJours(volume.teletravail)}</td>}
      {lieuConnu && <td className="doc-n">{enJours(volume.surSite)}</td>}
      <td className="doc-n doc-fort">
        {enJours(volume.total)}
        {/* La part non répartie se dit À CÔTÉ du total, jamais à sa place : le
            total, lui, est certain. */}
        {lieuConnu && volume.nonPrecise > 0 && (
          <><br /><span className="doc-sansLieu">dont {enJours(volume.nonPrecise)} sans lieu</span></>
        )}
      </td>
    </tr>
  );
}

/**
 * Le nom de l'entreprise, dont le dernier mot passe en italique vert.
 *
 * C'est le traitement du handoff — « Atelier <i>L.</i> ». Un nom d'un seul mot
 * reste entier : le couper produirait une initiale isolée qui n'est pas un nom.
 */
function marque(nom: string) {
  const mots = nom.trim().split(/\s+/);
  if (mots.length < 2) return nom;
  const dernier = mots[mots.length - 1] as string;
  return <>{mots.slice(0, -1).join(' ')} <em>{dernier}</em></>;
}
