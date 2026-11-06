import type { EtatFacture } from '../../state/selecteurs.facture';
import { euros } from '../../domain/types';
import { formaterIban } from '../../domain/calculs/identifiants';
import { Montant } from '../components/Montant';
import { dateCourte, eurExact } from '../format';

/**
 * La facture telle qu'elle part chez le client.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE MÊME DOCUMENT PENDANT ET APRÈS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Il ne s'affichait qu'APRÈS l'émission. On remplissait donc un formulaire à
 * l'aveugle, on émettait — geste irréversible, une facture irrégulière ne se
 * corrige pas, elle s'annule par un avoir — et on découvrait ensuite ce qu'on
 * venait de produire. Le handoff montre l'aperçu à côté de la saisie, et il a
 * raison : c'est le seul moment où corriger coûte encore zéro.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IL PORTE LES DEUX MONTANTS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * HT et net à payer, avec la TVA entre les deux — même en franchise, où la
 * ligne dit « — » plutôt que de disparaître. Une ligne absente laisse croire
 * à un oubli ; une ligne à zéro assumée dit que la question a été traitée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SUR LA FEUILLE PARTAGÉE, PAS SUR UN MODULE CSS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Comme le compte rendu d'activité : le fichier téléchargé s'ouvre chez le
 * client, sans notre application autour, et un nom de classe haché par
 * l'empaqueteur ne voyage pas. Voir `documents/feuille.ts`.
 */
export interface ProprietesDocumentFacture {
  readonly etat: EtatFacture;
  /**
   * La facture n'est pas encore émise.
   *
   * Le document porte alors un bandeau, et ce bandeau part AVEC le fichier :
   * un brouillon téléchargé porte un numéro qui n'est pas encore attribué, et
   * deux brouillons du même jour portent le même. Envoyé tel quel, l'un des
   * deux devient un doublon au livre de quelqu'un.
   */
  readonly brouillon: boolean;
}

export function DocumentFacture({ etat, brouillon }: ProprietesDocumentFacture) {
  const { facture: f, totaux: t } = etat;
  const { emetteur: em, destinataire: de } = f;
  const lignes = f.lignes.filter((l) => l.designation.trim() !== '');
  const avecTva = t.totalTva > 0;

  return (
    <article className="doc" aria-label={`Facture ${f.numero}`}>
      {brouillon && (
        <p className="doc-brouillon">
          Brouillon — non émise · le numéro {f.numero} n’est pas encore attribué
        </p>
      )}

      <header className="doc-entete">
        <div>
          <p className="doc-marque">{em.nom}</p>
          <p className="doc-emetteur">
            {em.adresse !== '' && <>{em.adresse}<br /></>}
            {[em.codePostal, em.ville].filter((x) => x !== '').join(' ')}
            {em.siret !== '' && <><br />SIRET {em.siret}</>}
            {em.tvaIntracom !== '' && <><br />TVA {em.tvaIntracom}</>}
          </p>
        </div>
        <div className="doc-titre">
          <h1 className="doc-grosTitre">Facture</h1>
          <p className="doc-numero">{f.numero}</p>
          <p className="doc-destinataire">
            Émise le {dateCourte(f.emiseLe)}<br />
            Échéance {dateCourte(t.echeanceLe)}
          </p>
        </div>
      </header>

      <section className="doc-bloc">
        <p className="doc-label">Facturé à</p>
        {/* Un bloc vide se lit comme un défaut d'affichage, pas comme un champ
            qui reste à remplir. Tant que le client n'est pas nommé, le
            document le dit — c'est aussi la première mention obligatoire qui
            manque, et l'aperçu la met sous les yeux. */}
        <p>
          {de.nom.trim() === ''
            ? <em className="doc-sansLieu">Client à renseigner</em>
            : <strong>{de.nom}</strong>}
        </p>
        {de.adresse !== '' && <p>{de.adresse}</p>}
        {de.siret !== '' && <p>SIRET {de.siret}</p>}
        {de.tvaIntracom !== '' && <p>TVA {de.tvaIntracom}</p>}
      </section>

      <table className="doc-table">
        <thead>
          <tr>
            <th scope="col">Désignation</th>
            <th scope="col" className="doc-n">Qté</th>
            <th scope="col" className="doc-n">P.U. HT</th>
            {avecTva && <th scope="col" className="doc-n">TVA</th>}
            <th scope="col" className="doc-n">Total HT</th>
          </tr>
        </thead>
        <tbody>
          {lignes.length === 0
            ? (
              <tr>
                <td colSpan={avecTva ? 5 : 4} className="doc-sansLieu">
                  Aucune prestation saisie.
                </td>
              </tr>
            )
            : lignes.map((l, i) => (
              // Les lignes n'ont pas d'identité propre : leur rang EST leur
              // clé, et il ne bouge que si l'utilisateur en retire une — ce
              // qui redessine de toute façon la liste entière.
              <tr key={i}>
                <td>{l.designation}</td>
                <td className="doc-n">{nombre(l.quantite)}</td>
                <td className="doc-n"><Montant>{eurExact(l.prixUnitaireHt)}</Montant></td>
                {avecTva && (
                  <td className="doc-n">{nombre(l.tauxTva * 100)} %</td>
                )}
                <td className="doc-n doc-fort">
                  <Montant>{eurExact(euros(l.quantite * l.prixUnitaireHt))}</Montant>
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      <div className="doc-totaux">
        <dl>
          <div>
            <dt>Total HT</dt>
            <dd><Montant>{eurExact(t.totalHt)}</Montant></dd>
          </div>
          <div>
            <dt>TVA{etat.regime === 'franchise' ? ' (franchise)' : ''}</dt>
            {/* « — » et non « 0,00 € » : en franchise, il n'y a pas une TVA
                nulle, il n'y a pas de TVA. Le tiret dit la différence. */}
            <dd>
              {etat.regime === 'franchise'
                ? '—'
                : <Montant>{eurExact(t.totalTva)}</Montant>}
            </dd>
          </div>
          <div className="doc-net">
            <dt>Net à payer</dt>
            <dd><Montant>{eurExact(t.totalTtc)}</Montant></dd>
          </div>
        </dl>
      </div>

      {/* OÙ PAYER.
          `entreprise.iban` existait au schéma, était repris de l'ancienne
          application à la migration — et n'atteignait aucun écran. Le client
          recevait une facture régulière sur laquelle rien n'indiquait où
          envoyer l'argent. Ce n'est pas une mention obligatoire ; c'est
          seulement ce qui fait la différence entre une facture et une facture
          payable. */}
      {em.iban !== '' && (
        <section className="doc-bloc">
          <p className="doc-label">Règlement</p>
          {/* L'IBAN dans son propre élément, en chasse fixe : c'est un
              numéro qu'on recopie à la main dans une banque, et un caractère
              lu de travers fait un virement perdu. */}
          <p>Par virement — IBAN <span className="doc-iban">{formaterIban(em.iban)}</span></p>
          {em.bic !== '' && <p>BIC {em.bic}</p>}
        </section>
      )}

      <footer className="doc-mentions">
        {etat.mentions.map((m) => <p key={m}>{m}</p>)}
      </footer>
    </article>
  );
}

/** Un nombre lisible : « 1,5 » et jamais « 1.5 ». */
const nombre = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
