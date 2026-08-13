import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { etatAchats } from '../../state/selecteurs.achats';
import type { EcritureRapprochable, MouvementBancaire } from '../../domain/calculs/banque';
import { decoderFichier, lireReleve, type RapportLecture } from '../../infra/releveCsv';
import { Info } from '../components/Info';
import { dateCourte, eur } from '../format';
import styles from './Releve.module.css';
import { Montant } from '../components/Montant';

/**
 * Relevé bancaire — import et rapprochement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉCRAN PROPOSE, L'UTILISATEUR TRANCHE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application appariait automatiquement les opérations et écrivait
 * le résultat sans poser d'état consultable. Un appariement faux devenait donc
 * invisible, et « chaque opération est rapprochée » ne renvoyait à aucun fait
 * vérifiable.
 *
 * Ici, chaque mouvement affiche ses candidats et attend une décision. Un
 * candidat unique reste un candidat : le valider d'office ferait exactement ce
 * qu'on reproche à l'ancienne version, en plus discret.
 *
 * L'import dit aussi ce qu'il a COMPRIS du fichier — colonnes reconnues,
 * format de date, lignes écartées et pourquoi. Il n'existe pas de format
 * d'export bancaire, et une colonne mal interprétée entrerait sinon dans les
 * comptes sans que rien ne le signale.
 */

type Retour =
  | { readonly ton: 'succes'; readonly texte: string; readonly rapport: RapportLecture }
  | { readonly ton: 'echec'; readonly texte: string }
  | null;

export function Releve() {
  const faits = useFaits((e) => e.faits);
  const importerReleve = useFaits((e) => e.importerReleve);
  const viderReleve = useFaits((e) => e.viderReleve);

  const [retour, setRetour] = useState<Retour>(null);
  const [enCours, setEnCours] = useState(false);
  const idChamp = useId();

  const etat = useMemo(() => etatAchats(faits), [faits]);
  const resume = etat.resumeBanque;

  async function importer(fichier: File): Promise<void> {
    setEnCours(true);
    setRetour(null);
    try {
      const lecture = lireReleve(await decoderFichier(fichier));
      if (lecture.statut === 'refuse') {
        setRetour({ ton: 'echec', texte: lecture.motif });
        return;
      }
      const { ajoutes, deja } = importerReleve(lecture.rapport.lignes);
      setRetour({
        ton: 'succes',
        // Le nombre d'opérations déjà connues est dit explicitement : c'est
        // ce qui rassure sur le fait qu'un réimport n'a pas doublé le solde.
        texte: `${ajoutes} opération(s) ajoutée(s)`
          + (deja > 0 ? `, ${deja} déjà présente(s) et non dupliquée(s).` : '.'),
        rapport: lecture.rapport
      });
    } catch {
      setRetour({ ton: 'echec', texte: 'Le fichier n’a pas pu être lu.' });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <>
      <div className={styles.grille}>
        <Chiffre libelle="Opérations" valeur={String(resume.total)} />
        <Chiffre libelle="Rapprochées" valeur={String(resume.rapproches)} ton="accent" />
        <Chiffre
          libelle="À trancher"
          valeur={String(resume.propositionsEvidentes + resume.ambigus)}
          ton={resume.propositionsEvidentes + resume.ambigus > 0 ? 'attention' : 'neutre'}
        />
        <Chiffre libelle="Sans candidat" valeur={String(resume.sansCandidat)} />
      </div>

      <section className={styles.carte} aria-labelledby={`${idChamp}-import`}>
        <h2 id={`${idChamp}-import`} className={styles.titreCarte}>
          Importer un relevé
          <Info libelle="Ce que l’import accepte, et ce qu’il en fait">
            Un fichier CSV exporté depuis la banque. Il n’existe pas de format
            commun&nbsp;: séparateur, format de date, montant signé ou réparti
            sur deux colonnes Débit et Crédit varient d’un établissement à
            l’autre. L’import dit ce qu’il a compris, pour que vous puissiez le
            vérifier. Réimporter un relevé qui recouvre le précédent n’ajoute
            que ce qui manque&nbsp;: le solde ne double pas.
          </Info>
        </h2>

        <label className={styles.champFichier} htmlFor={`${idChamp}-fichier`}>
          Fichier CSV du relevé
        </label>
        <input
          id={`${idChamp}-fichier`}
          type="file"
          accept=".csv,text/csv,text/plain"
          disabled={enCours}
          onChange={(e) => {
            const fichier = e.target.files?.[0];
            if (fichier) void importer(fichier);
          }}
        />

        {retour !== null && (
          <div role="status" className={styles.retour}>
            <p className={retour.ton === 'succes' ? styles.succes : styles.echec}>
              {retour.texte}
            </p>
            {retour.ton === 'succes' && <Interpretation rapport={retour.rapport} />}
          </div>
        )}

        {resume.total > 0 && (
          <button
            type="button"
            className={styles.action}
            onClick={() => { viderReleve(); setRetour(null); }}
          >
            Effacer les opérations importées
          </button>
        )}
      </section>

      {resume.total === 0
        ? (
          <section className={styles.carte}>
            <p className={styles.vide}>
              Aucun relevé importé. Tant qu’il n’y en a pas, le solde affiché
              reste le solde initial saisi&nbsp;: il n’est pas suivi, et les
              dépenses ne sont présentées comme rapprochées nulle part.
            </p>
          </section>
        )
        : (
          <section className={styles.carte} aria-labelledby={`${idChamp}-operations`}>
            <h2 id={`${idChamp}-operations`} className={styles.titreCarte}>
              Opérations
              <Info libelle="Pourquoi rien n’est rapproché automatiquement">
                Une seule correspondance ne fait pas une certitude. L’ancienne
                application appariait seule et n’en laissait aucune
                trace&nbsp;: un appariement faux devenait invisible, et
                « tout est rapproché » ne renvoyait à aucun fait vérifiable.
              </Info>
            </h2>
            <ul className={styles.liste}>
              {etat.mouvements.map((m) => (
                <LigneMouvement
                  key={m.id}
                  mouvement={m}
                  candidats={etat.candidats.get(m.id) ?? []}
                />
              ))}
            </ul>
          </section>
        )}
    </>
  );
}

/**
 * Ce que la lecture a compris du fichier.
 *
 * Affiché systématiquement, pas seulement en cas de doute : une colonne mal
 * interprétée produit des montants plausibles, et rien ne la signalerait.
 */
function Interpretation({ rapport }: { rapport: RapportLecture }) {
  const { interpretation: i, ignorees } = rapport;
  return (
    <>
      <dl className={styles.detail}>
        <div className={styles.ligne}><dt>Séparateur</dt><dd>{i.separateur}</dd></div>
        <div className={styles.ligne}><dt>Colonne date</dt><dd>{i.colonneDate}</dd></div>
        <div className={styles.ligne}><dt>Colonne libellé</dt><dd>{i.colonneLibelle}</dd></div>
        <div className={styles.ligne}><dt>Colonne montant</dt><dd>{i.colonneMontant}</dd></div>
        <div className={styles.ligne}><dt>Format de date</dt><dd>{i.formatDate}</dd></div>
      </dl>
      {ignorees.length > 0 && (
        <details className={styles.repli}>
          <summary>{ignorees.length} ligne(s) écartée(s)</summary>
          <ul className={styles.ecartes}>
            {ignorees.slice(0, 20).map((l) => (
              <li key={l.ligne}>Ligne {l.ligne} — {l.motif}</li>
            ))}
            {ignorees.length > 20 && <li>…et {ignorees.length - 20} autre(s).</li>}
          </ul>
        </details>
      )}
    </>
  );
}

function LigneMouvement(
  { mouvement, candidats }: {
    mouvement: MouvementBancaire;
    candidats: readonly EcritureRapprochable[];
  }
) {
  const rapprocher = useFaits((e) => e.rapprocherMouvement);
  const marquerSans = useFaits((e) => e.marquerSansContrepartie);
  const debit = mouvement.montant < 0;

  return (
    <li className={styles.mouvement}>
      <span className={styles.ligneTitre}>
        <span className={styles.ligneLibelle}>{mouvement.libelle || 'Sans libellé'}</span>
        <span className={`${styles.ligneMontant} ${debit ? styles.debit : styles.credit}`}>
          <Montant>{eur(mouvement.montant)}</Montant>
        </span>
      </span>
      <span className={styles.ligneMeta}>
        <span>{dateCourte(mouvement.date)}</span>
        <span aria-hidden="true">·</span>
        <span>{debit ? 'Débit' : 'Crédit'}</span>
      </span>

      {mouvement.rapprocheAvec !== null
        ? (
          <span className={styles.actions}>
            <span className={styles.etatAccent}>Rapprochée</span>
            <button
              type="button"
              className={styles.action}
              onClick={() => rapprocher(mouvement.id, null)}
            >
              Défaire
            </button>
          </span>
        )
        : mouvement.sansContrepartie !== null
          ? (
            <span className={styles.actions}>
              <span className={styles.etat}>
                {mouvement.sansContrepartie === 'remuneration'
                  ? 'Rémunération versée'
                  : 'Sans contrepartie'}
              </span>
              <button
                type="button"
                className={styles.action}
                onClick={() => marquerSans(mouvement.id, null)}
              >
                Reprendre
              </button>
            </span>
          )
          : (
            <>
              {candidats.length === 0
                ? (
                  <span className={styles.etat}>
                    Aucune écriture de même montant à {debit ? 'cette dépense' : 'cette recette'}
                    {' '}dans les jours voisins.
                  </span>
                )
                : (
                  <span className={styles.etat}>
                    {candidats.length === 1
                      ? 'Une écriture correspond :'
                      : `${candidats.length} écritures correspondent :`}
                  </span>
                )}
              <span className={styles.actions}>
                {candidats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={styles.action}
                    onClick={() => rapprocher(mouvement.id, c.id)}
                  >
                    {c.libelle || 'Sans libellé'} — {dateCourte(c.date)}
                  </button>
                ))}
                {/* La rémunération est proposée sur les DÉBITS seulement :
                    un crédit ne peut pas être un virement qu'on s'est versé,
                    et l'offrir inviterait à mal classer une recette. */}
                {debit && (
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => marquerSans(mouvement.id, 'remuneration')}
                  >
                    Rémunération que je me suis versée
                  </button>
                )}
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => marquerSans(mouvement.id, 'autre')}
                >
                  Sans contrepartie
                </button>
              </span>
            </>
          )}
    </li>
  );
}

function Chiffre(
  { libelle, valeur, ton = 'neutre' }: {
    libelle: string;
    valeur: string;
    ton?: 'neutre' | 'accent' | 'attention';
  }
) {
  const classe = ton === 'attention' ? styles.attention
    : ton === 'accent' ? styles.accent : '';
  return (
    <div className={styles.chiffre}>
      <span className={styles.libelle}>{libelle}</span>
      <span className={`${styles.montant} ${classe}`}><Montant>{valeur}</Montant></span>
    </div>
  );
}
