import { Fragment } from 'react';
import type { LigneVolumeCra, ModeleCra } from './modeleCra';

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
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE COMPOSANT NE DÉCIDE D'AUCUN TEXTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Tout ce qu'il affiche vient de `modeleDuCra`, que le PDF lit aussi. Un mot
 * ajouté ici et pas là, et le fichier envoyé au client cesserait de dire ce
 * que l'aperçu montrait.
 */
export interface ProprietesDocumentCra {
  readonly modele: ModeleCra;
}

export function DocumentCra({ modele }: ProprietesDocumentCra) {
  const colonnes = modele.colonnes.length;

  return (
    <article className="doc" aria-label={modele.titre}>
      <header className="doc-entete">
        <div>
          <p className="doc-marque">
            {modele.marque.fin === null
              ? modele.marque.debut
              : <>{modele.marque.debut} <em>{modele.marque.fin}</em></>}
          </p>
          <p className="doc-emetteur">
            {modele.emetteur.map((ligne, i) => (
              <Fragment key={i}>{i > 0 && <br />}{ligne}</Fragment>
            ))}
          </p>
        </div>
        <div className="doc-titre">
          <h1>{modele.intitule}</h1>
          <p className="doc-periode">{modele.periode}</p>
          <p className="doc-destinataire">
            {modele.sousTitre}<br />
            {modele.destinataire}
          </p>
        </div>
      </header>

      <table className="doc-table">
        <thead>
          <tr>
            {modele.colonnes.map((c) => (
              <th key={c.intitule} scope="col" className={c.nombre ? 'doc-n' : undefined}>
                {c.intitule}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modele.semaines.map((s) => (
            <Fragment key={s.cle}>
              <tr className="doc-semaine">
                <td>{s.libelle}</td>
                <td>{s.plage}</td>
                {modele.lieuConnu && <td className="doc-n" />}
                {modele.lieuConnu && <td className="doc-n" />}
                <td className="doc-n">{s.total}</td>
              </tr>
              {s.volumes.map((v) => (
                <LigneVolume key={v.client} ligne={v} decale />
              ))}
              {s.taches !== null && (
                <tr className="doc-taches">
                  <td colSpan={colonnes}>{s.taches}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      {modele.totaux !== null && (
        <>
          <p className="doc-sousTitre">{modele.totaux.titre}</p>
          <table className="doc-table">
            <tbody>
              {modele.totaux.lignes.map((v) => (
                <LigneVolume key={v.client} ligne={v} decale={false} />
              ))}
            </tbody>
          </table>
        </>
      )}

      <table className="doc-table">
        <tbody>
          <tr className="doc-total">
            <td colSpan={colonnes - 1}>{modele.grandTotal.libelle}</td>
            <td className="doc-n">{modele.grandTotal.valeur}</td>
          </tr>
        </tbody>
      </table>

      <p className="doc-note">
        {modele.note.map((s, i) => (
          s.fort ? <strong key={i}>{s.texte}</strong> : <Fragment key={i}>{s.texte}</Fragment>
        ))}
      </p>

      <div className="doc-signatures">
        {modele.signatures.map((s, i) => (
          <p key={i} className="doc-signature">{s}<span /></p>
        ))}
      </div>
    </article>
  );
}

function LigneVolume(
  { ligne, decale }: { readonly ligne: LigneVolumeCra; readonly decale: boolean }
) {
  return (
    <tr className={decale ? 'doc-client' : ''}>
      <td />
      <td className={decale ? '' : 'doc-fort'}>{ligne.client}</td>
      {ligne.teletravail !== null && <td className="doc-n">{ligne.teletravail}</td>}
      {ligne.surSite !== null && <td className="doc-n">{ligne.surSite}</td>}
      <td className="doc-n doc-fort">
        {ligne.total}
        {ligne.sansLieu !== null && (
          <><br /><span className="doc-sansLieu">{ligne.sansLieu}</span></>
        )}
      </td>
    </tr>
  );
}
