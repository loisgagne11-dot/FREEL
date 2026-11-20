import { useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { dateDuJour, moisCourant } from '../../state/selecteurs';
import { type EtatDes, etatDes } from '../../state/selecteurs.livre';
import { annulerDeclaration, declarerPeriode } from '../../state/ecritures.echeances';
import type { DateISO, Mois } from '../../domain/types';
import { Info } from '../components/Info';
import { Montant } from '../components/Montant';
import { Statut } from '../components/Statut';
import { useToast } from '../components/Toasts';
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
          Tu n’as pas de numéro de TVA intracommunautaire. Il en faut un
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
            <Montant>50&nbsp;€</Montant> suffit. Dépôt au plus tard le
            dixième jour ouvrable du mois suivant — samedis compris, et un
            samedi limite n’est pas reporté —, sur le portail de la douane.
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
                  {/* « Au plus tard », pas « avant » : le texte (CGI ann. III art. 96 N)
                      compte le jour limite, et « avant le 12 » se lisait « le 11 ». */}
                  <dt>À déposer au plus tard le</dt>
                  <dd>{dateCourte(declaration.limiteLe)}</dd>
                </div>
                <div className={`${styles.ligne} ${styles.total}`}>
                  <dt>Total à déclarer</dt>
                  <dd><Montant>{eur(declaration.total)}</Montant></dd>
                </div>
              </dl>

              <DepotDuMois etat={etat} libelle={moisLisible(moisAffiche)} />

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
/**
 * Le dépôt de la DES du mois : « Déposée le … », sur le modèle de la
 * déclaration URSSAF.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SANS CE GESTE, L'AMENDE AFFICHÉE ÉTAIT FAUSSE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Rien ne permettait de dire qu'une DES avait été déposée : passé sa limite,
 * chaque mois de prestation à l'Union devenait un retard, et le bandeau
 * annonçait 750 € par mois à qui déposait à l'heure. Le geste daté du jour —
 * on le fait en sortant du portail de la douane —, la date se lit et se
 * corrige au même endroit : vide, elle dit « date non enregistrée » sans
 * phrase de plus, et jamais demain. Il se défait.
 *
 * Un mois en cours ne se marque pas : la douane n'ouvre le dépôt qu'au
 * premier jour du mois suivant, et le marquer d'avance éteindrait un retard
 * qui n'a pas commencé — pour des prestations encore à venir ce mois-là.
 */
function DepotDuMois({ etat, libelle }: { readonly etat: EtatDes; readonly libelle: string }) {
  const signaler = useToast();
  const jour = dateDuJour();
  const m = etat.moisAffiche;

  if (etat.depot !== null) {
    return (
      <p className={styles.declarationActions}>
        <Statut libelle="Déposée" ton="ok" />
        <label className={styles.declarationDate}>
          <span>le</span>
          <input
            type="date"
            aria-label={`Date de dépôt de la DES de ${libelle}`}
            value={etat.depot.le ?? ''}
            max={jour}
            onChange={(e) => {
              const saisie = e.target.value;
              if (saisie !== '' && saisie > jour) return;
              declarerPeriode('des', [m], saisie === '' ? null : saisie as DateISO);
            }}
          />
        </label>
        <button
          type="button"
          className={styles.actionLigne}
          onClick={() => {
            annulerDeclaration('des', [m]);
            signaler(`La DES de ${libelle} n’est plus marquée déposée.`);
          }}
        >
          {/* Ce qui se défait, c'est la marque : le dépôt fait auprès de la
              douane, lui, ne s'annule pas d'ici. */}
          Annuler le dépôt
        </button>
      </p>
    );
  }

  if (!etat.deposable) {
    return (
      <p className={styles.declarationAttente}>
        Mois en cours&nbsp;: la DES se dépose à partir du 1er du mois suivant.
      </p>
    );
  }

  return (
    <p className={styles.declarationActions}>
      <button
        type="button"
        className={styles.actionLigne}
        onClick={() => {
          declarerPeriode('des', [m], jour);
          signaler(`DES de ${libelle} marquée déposée aujourd’hui.`);
        }}
      >
        Marquer déposée
      </button>
    </p>
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
