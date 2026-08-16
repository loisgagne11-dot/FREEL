import { useMemo } from 'react';
import { useFaits } from '../../state/store';
import { etatLivre } from '../../state/selecteurs.livre';
import { estAnnulation } from '../../domain/calculs/livreRecettes';
import { Info } from '../components/Info';
import { Montant } from '../components/Montant';
import { Statut, statutRecette } from '../components/Statut';
import { Vide } from '../components/Vide';
import { Chiffre } from '../components/Chiffre';
import { dateCourte, eur } from '../format';
import styles from './Argent.module.css';

/**
 * L'onglet « Livre des recettes », chargé à la demande.
 *
 * Cinquième application de la même règle : le registre se consulte pour
 * vérifier ou justifier, pas en ouvrant sa trésorerie. Le budget de l'écran
 * différé le plus lourd l'a demandé en dépassant, et le projet extrait plutôt
 * que de relever un plafond.
 */

/**
 * Le registre obligatoire.
 *
 * L'ancienne application ne portait ni date d'encaissement ni mode de
 * règlement : son registre n'était pas conforme, et rien ne le disait. Ici,
 * les écarts sont constatés et nommés — « registre non conforme » sans plus de
 * précision n'aide personne à le rendre conforme.
 *
 * Le livre ne contient QUE des encaissements. Une facture émise et non réglée
 * n'y figure pas : l'y faire figurer serait déclarer une recette qui n'a pas
 * eu lieu.
 */
export function LivreDesRecettes({ idGroupe }: { idGroupe: string }) {
  const faits = useFaits((e) => e.faits);
  const annulerRecette = useFaits((e) => e.annulerRecette);
  const etat = useMemo(() => etatLivre(faits), [faits]);

  return (
    <>
      <div className={styles.grille}>
        <Chiffre libelle="Écritures au livre" valeur={String(etat.total.ecritures)} />
        <Chiffre libelle="Total encaissé" valeur={eur(etat.total.total)} ton="accent" />
        <Chiffre
          libelle="Écarts de conformité"
          valeur={String(etat.ecarts.length)}
          ton={etat.ecarts.length > 0 ? 'danger' : 'neutre'}
        />
      </div>

      {etat.ecarts.length > 0 && (
        <section className={styles.carte} aria-labelledby={`${idGroupe}-ecarts`}>
          <h2 id={`${idGroupe}-ecarts`} className={styles.titreCarte}>
            À corriger
            <Info libelle="Ce qui rend un registre opposable">
              Le livre des recettes doit présenter, pour chaque encaissement, sa
              date, son montant, l’identité du client, le mode de règlement et
              la référence de la pièce. Une numérotation trouée se lit, en
              contrôle, comme une facture retirée du registre.
            </Info>
          </h2>
          <ul className={styles.ecarts}>
            {etat.ecarts.map((ecart, i) => (
              <li key={`${ecart.nature}-${ecart.ecritureId ?? i}`} className={styles.ecart}>
                {ecart.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.carte} aria-labelledby={`${idGroupe}-ecritures`}>
        <h2 id={`${idGroupe}-ecritures`} className={styles.titreCarte}>
          Écritures
          <Info libelle="Pourquoi rien ne s’efface ici">
            Le registre se tient en ajout seul&nbsp;: une recette encaissée
            s’annule par une écriture inverse, datée du jour de la correction,
            et les deux restent visibles. Un registre qu’on peut réécrire ne
            prouve rien — c’est précisément ce qu’un contrôle vérifie.
          </Info>
        </h2>

        {etat.ecritures.length === 0
          ? (
            <Vide
              message="Aucun encaissement enregistré. Le livre des recettes se remplit quand une facture émise est marquée encaissée."
              action={<a className={styles.actionPrincipale} href="#/facture">Émettre une facture</a>}
            />
          )
          : (
            <ul className={styles.liste}>
              {etat.ecritures.map((e) => (
                <li key={e.id} className={styles.ligneEcriture}>
                  <span className={styles.ligneTitre}>
                    <span className={styles.ligneLibelle}>{e.libelle}</span>
                    <span className={styles.ligneMontant}><Montant>{eur(e.montant)}</Montant></span>
                  </span>
                  <span className={styles.ligneMeta}>
                    <span>{dateCourte(e.encaisseeLe)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{e.clientNom || 'Client non renseigné'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{e.numero || 'Sans numéro'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{libelleMode(e.modeReglement)}</span>
                  </span>
                  {etat.ecartsParEcriture.get(e.id)?.map((ecart) => (
                    <span key={ecart.nature} className={styles.alerteLigne}>{ecart.message}</span>
                  ))}
                  {!estAnnulation(e) && (
                    <button
                      type="button"
                      className={styles.actionLigne}
                      onClick={() => annulerRecette(e.id)}
                    >
                      Annuler par écriture inverse
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
      </section>

      {etat.enAttente.length > 0 && (
        <section className={styles.carte} aria-labelledby={`${idGroupe}-attente`}>
          <h2 id={`${idGroupe}-attente`} className={styles.titreCarte}>
            Émises, pas encore encaissées
            <Info libelle="Pourquoi elles ne sont pas au livre">
              Le livre des recettes enregistre des encaissements. Une facture
              émise et non réglée n’y a pas sa place&nbsp;: l’y inscrire
              reviendrait à déclarer une recette qui n’a pas eu lieu, et à payer
              des cotisations dessus.
            </Info>
          </h2>
          <ul className={styles.liste}>
            {etat.enAttente.map((r) => (
              <li key={r.id} className={styles.ligneEcriture}>
                <span className={styles.ligneTitre}>
                  <span className={styles.ligneLibelle}>{r.libelle}</span>
                  <span className={styles.ligneMontant}><Montant>{eur(r.montant)}</Montant></span>
                </span>
                <span className={styles.ligneMeta}>
                  <Statut {...statutRecette({ encaissee: false, echeanceDepassee: r.enRetard })} />
                  <span>Émise le {dateCourte(r.emiseLe)}</span>
                  {r.echeanceLe !== null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>échéance {dateCourte(r.echeanceLe)}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>{r.numero || 'Sans numéro'}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
function libelleMode(mode: string | null): string {
  switch (mode) {
    case 'virement': return 'Virement';
    case 'cheque': return 'Chèque';
    case 'especes': return 'Espèces';
    case 'carte': return 'Carte';
    case 'autre': return 'Autre';
    default: return 'Mode non renseigné';
  }
}
