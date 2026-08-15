import { useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { moisCourant } from '../../state/selecteurs';
import { etatDes } from '../../state/selecteurs.livre';
import type { Mois } from '../../domain/types';
import { Info } from '../components/Info';
import { Montant } from '../components/Montant';
import { dateCourte, eur } from '../format';
import styles from './Argent.module.css';

/**
 * L'onglet DES, chargé à la demande.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL VIT DANS SON PROPRE FICHIER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le budget de l'écran différé le plus lourd — Argent — arrivait au plafond.
 * La règle du projet est de ne jamais relever un plafond mais d'extraire le
 * module qui pèse : relever le seuil revient à cesser de mesurer, et la
 * mesure ne sert qu'à ce moment-là.
 *
 * La DES est le bon candidat : c'est un onglet à part entière, consulté une
 * fois par mois au plus, et rien du reste de l'écran n'en dépend. Ouvrir la
 * trésorerie ne téléchargeait aucune raison de porter son code.
 */

/**
 * La DES.
 *
 * Elle est due par le PRESTATAIRE qui rend un service à un assujetti d'un
 * autre État membre — pas par celui qui en achète. C'est la confusion la plus
 * fréquente, et elle a commandé toute la conception : l'écran Achats détecte
 * l'autoliquidation à l'achat, celui-ci regarde les recettes.
 *
 * Trois faits qui surprennent, et que l'écran énonce plutôt que de les
 * supposer connus : la franchise en base n'en dispense pas, il n'y a aucun
 * seuil, et l'amende est de 750 € par déclaration manquante.
 */
export function DeclarationServices({ idGroupe }: { idGroupe: string }) {
  const faits = useFaits((e) => e.faits);
  const [moisAffiche, setMoisAffiche] = useState<Mois>(() => moisPrecedentDe(moisCourant()));
  const etat = useMemo(() => etatDes(faits, moisAffiche), [faits, moisAffiche]);
  const { declaration } = etat;

  return (
    <>
      {etat.retards.length > 0 && (
        <p className={`${styles.bandeau} ${styles.bandeauDanger}`} role="status">
          <strong>{etat.retards.length}</strong> déclaration
          {etat.retards.length > 1 ? 's' : ''} en retard, soit{' '}
          <strong><Montant>{eur(etat.amendeEncourue)}</Montant></strong> d’amende encourue.
          <Info libelle="Pourquoi l’amende ne dépend pas des montants">
            Elle est forfaitaire&nbsp;: 750 € par déclaration manquante ou
            inexacte, qu’on ait facturé 50 € ou 50 000 €. Une omission répétée
            sur une année coûte donc davantage que la plupart des
            redressements que cette application cherche par ailleurs à éviter.
          </Info>
        </p>
      )}

      {etat.sansNumeroIntracom && !declaration.sansObjet && (
        <p className={`${styles.bandeau} ${styles.bandeauAttention}`} role="status">
          Vous n’avez pas de numéro de TVA intracommunautaire. Il en faut un
          pour déposer une DES, <em>y compris en franchise en base</em>&nbsp;:
          il se demande au service des impôts des entreprises.
        </p>
      )}

      <section className={styles.carte} aria-labelledby={`${idGroupe}-des`}>
        <h2 id={`${idGroupe}-des`} className={styles.titreCarte}>
          Prestations à déclarer
          <Info libelle="Qui doit déposer une DES, et quand">
            Elle est due par celui qui <strong>vend</strong> un service à un
            professionnel établi dans un autre État membre — pas par celui qui
            en achète. Aucun seuil&nbsp;: une prestation de{' '}
            <Montant>50&nbsp;€</Montant> suffit. Dépôt
            au plus tard le 10 du mois suivant, sur le portail de la douane.
          </Info>
        </h2>

        <div className={styles.navigationMois}>
          <button type="button" className={styles.pas}
            onClick={() => setMoisAffiche(moisPrecedentDe(moisAffiche))}
            aria-label="Mois précédent">
            <span aria-hidden="true">‹</span>
          </button>
          <span className={styles.moisCourant} role="status">{moisLisible(moisAffiche)}</span>
          <button type="button" className={styles.pas}
            onClick={() => setMoisAffiche(moisSuivantDe(moisAffiche))}
            aria-label="Mois suivant">
            <span aria-hidden="true">›</span>
          </button>
        </div>

        {declaration.sansObjet
          ? (
            <p className={styles.vide}>
              Aucune prestation intracommunautaire ce mois-là&nbsp;: aucune
              déclaration n’est due. Un mois sans prestation ne se déclare pas.
            </p>
          )
          : (
            <>
              <dl className={styles.detail}>
                <div className={styles.ligne}>
                  <dt>À déposer avant le</dt>
                  <dd>{dateCourte(declaration.limiteLe)}</dd>
                </div>
                <div className={`${styles.ligne} ${styles.total}`}>
                  <dt>Total à déclarer</dt>
                  <dd><Montant>{eur(declaration.total)}</Montant></dd>
                </div>
              </dl>

              {declaration.lignes.length > 0 && (
                <ul className={styles.liste}>
                  {declaration.lignes.map((l) => (
                    <li key={l.recetteId} className={styles.ligneEcriture}>
                      <span className={styles.ligneTitre}>
                        <span className={styles.ligneLibelle}>{l.clientNom}</span>
                        <span className={styles.ligneMontant}><Montant>{eur(l.montant)}</Montant></span>
                      </span>
                      <span className={styles.ligneMeta}>
                        <span>{l.tvaIntracom}</span>
                        <span aria-hidden="true">·</span>
                        <span>{dateCourte(l.emiseLe)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {declaration.anomalies.length > 0 && (
                <ul className={styles.ecarts}>
                  {declaration.anomalies.map((a) => (
                    <li key={a.recetteId} className={styles.ecart}>{a.message}</li>
                  ))}
                </ul>
              )}
            </>
          )}

        <p className={styles.noteBasse}>
          Le mois retenu est celui de l’<strong>émission</strong> de la facture,
          non celui de l’encaissement&nbsp;: la taxe devient exigible chez le
          preneur à l’achèvement de la prestation. Le livre des recettes, lui,
          s’écrit à l’encaissement — les deux registres ne coïncident donc pas,
          et c’est normal.
        </p>
      </section>
    </>
  );
}
function moisPrecedentDe(m: Mois): Mois {
  const total = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) - 1;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}` as Mois;
}

function moisSuivantDe(m: Mois): Mois {
  const total = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) + 1;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}` as Mois;
}

function moisLisible(m: Mois): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
    .format(new Date(`${m}-01T00:00:00`));
}
