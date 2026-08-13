import { useCallback, useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { type LigneDepense, etatAchats } from '../../state/selecteurs';
import {
  type EtatRapprochement, type ProvenanceFournisseur,
  libelleMotif
} from '../../domain/calculs/depenses';
import { dateISO, euros, ratio } from '../../domain/types';
import {
  type MetaJustificatif, type StockageJustificatifs,
  deposerJustificatif, stockageIndexedDB, verifierIntegrite
} from '../../infra/justificatifs';
import { Info } from '../components/Info';
import { Vide } from '../components/Vide';
import { Onglets, PanneauOnglet } from '../components/Onglets';
import { Sheet } from '../components/Sheet';
import { Releve } from './Releve';
import { dateCourte, eur, eurExact } from '../format';
import styles from './Achats.module.css';

/**
 * Écran Achats — dépenses, justificatifs et TVA déductible.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉCRAN QUI PORTE L'INVARIANT LE PLUS IMPORTANT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application annonçait une TVA déductible sans qu'aucune pièce
 * n'existe nulle part : les justificatifs y étaient un booléen `piece: true`,
 * sans fichier ni trace. L'audit comptable classait ces pièces « sans valeur
 * probante ». Ici, la TVA n'est récupérable que si un fichier est réellement
 * conservé, et l'écran chiffre ce que les pièces manquantes coûtent — parce
 * que « justificatif manquant » n'incite personne à chercher une facture,
 * alors qu'un montant, si.
 *
 * Aucune règle n'est écrite dans cet écran. Tout vient de
 * `domain/calculs/depenses.ts` et de `infra/justificatifs.ts` : l'écran
 * affiche et déclenche, il ne décide pas.
 */

export interface ProprietesAchats {
  /**
   * Le stockage des pièces. Injectable pour les tests, où IndexedDB n'existe
   * pas — et pour qu'un jour un stockage distant puisse s'y substituer sans
   * toucher à l'écran.
   */
  readonly stockage?: StockageJustificatifs;
}

type Section = 'depenses' | 'releve';

const SECTIONS = [
  { id: 'depenses' as Section, libelle: 'Dépenses' },
  { id: 'releve' as Section, libelle: 'Relevé bancaire' }
];

/** Ce qu'un panneau latéral affiche à un instant donné. */
type Panneau =
  | { readonly type: 'ferme' }
  | { readonly type: 'detail'; readonly id: string }
  | { readonly type: 'ajout' };

const stockageParDefaut = stockageIndexedDB();

export function Achats({ stockage = stockageParDefaut }: ProprietesAchats = {}) {
  const faits = useFaits((e) => e.faits);
  const attacherJustificatif = useFaits((e) => e.attacherJustificatif);
  const definirRapprochement = useFaits((e) => e.definirRapprochement);
  const ajouterDepense = useFaits((e) => e.ajouterDepense);
  const supprimerDepense = useFaits((e) => e.supprimerDepense);

  const [panneau, setPanneau] = useState<Panneau>({ type: 'ferme' });
  const [section, setSection] = useState<Section>('depenses');
  const idGroupe = useId();

  const etat = useMemo(() => etatAchats(faits), [faits]);
  const selection = panneau.type === 'detail'
    ? etat.lignes.find((l) => l.depense.id === panneau.id) ?? null
    : null;

  const fermer = useCallback(() => setPanneau({ type: 'ferme' }), []);

  return (
    <>
      <header className={styles.entete}>
        <h1 className={styles.titre}>Achats</h1>
        {/* Liste vide : l'action vit dans l'état vide, au milieu de l'écran,
            là où le regard se pose. La répéter ici donnerait deux commandes
            identiques à quelques centimètres — une hésitation gratuite, et
            deux cibles pour un lecteur d'écran là où il n'y a qu'une action. */}
        {section === 'depenses' && etat.lignes.length > 0 && (
          <button
            type="button"
            className={styles.actionPrincipale}
            onClick={() => setPanneau({ type: 'ajout' })}
          >
            Ajouter une dépense
          </button>
        )}
      </header>

      <div className={styles.sections}>
        <Onglets
          idGroupe={idGroupe}
          onglets={SECTIONS}
          actif={section}
          onChange={setSection}
          libelle="Sections de l’écran Achats"
        />

        <PanneauOnglet idGroupe={idGroupe} id="releve" actif={section === 'releve'}>
          {/* Monté seulement à l'ouverture : lire un relevé et calculer les
              candidats n'a pas à peser sur l'affichage des dépenses. */}
          {section === 'releve' && <Releve />}
        </PanneauOnglet>

        <PanneauOnglet idGroupe={idGroupe} id="depenses" actif={section === 'depenses'}>

      <div className={styles.grille}>
        <Chiffre libelle="Total TTC" valeur={eur(etat.resume.totalTtc)} />
        <Chiffre
          libelle="TVA récupérable"
          valeur={eur(etat.resume.tvaRecuperable)}
          ton="accent"
        />
        <Chiffre
          libelle="TVA perdue, faute de pièce"
          valeur={eur(etat.resume.tvaPerdueFauteDePiece)}
          ton={etat.resume.tvaPerdueFauteDePiece > 0 ? 'danger' : 'neutre'}
        />
        <Chiffre
          libelle="À autoliquider"
          valeur={eur(etat.resume.tvaAAutoliquider)}
          ton={etat.resume.tvaAAutoliquider > 0 ? 'attention' : 'neutre'}
        />
      </div>

      {/* Les avertissements sont au-dessus de la liste : les mettre en bas
          reviendrait à ne les montrer qu'à ceux qui n'en ont pas besoin. */}
      {etat.resume.sansJustificatif > 0 && (
        <p className={`${styles.bandeau} ${styles.bandeauDanger}`} role="status">
          <strong>{etat.resume.sansJustificatif}</strong>{' '}
          {etat.resume.sansJustificatif > 1 ? 'dépenses sont' : 'dépense est'} sans
          justificatif, soit <strong>{eur(etat.resume.tvaPerdueFauteDePiece)}</strong> de
          TVA non récupérable.
          <Info libelle="Pourquoi une pièce est indispensable">
            Une TVA déduite sans facture est un rappel assuré en contrôle. Une
            copie numérique ne vaut que si l’on peut montrer qu’elle n’a pas été
            modifiée depuis son dépôt : c’est le rôle de l’empreinte calculée
            lors de la conservation.
          </Info>
        </p>
      )}

      {etat.resume.tvaAAutoliquider > 0 && (
        <p className={`${styles.bandeau} ${styles.bandeauAttention}`} role="status">
          <strong>{eur(etat.resume.tvaAAutoliquider)}</strong> de TVA à autoliquider
          sur des achats hors de France.
          <Info libelle="Explication de l’autoliquidation">
            Sur un service acheté à un prestataire étranger, c’est l’acheteur
            qui déclare et paie la TVA française. En franchise en base, elle est
            due <em>et</em> non déductible : elle coûte réellement. Elle suppose
            un numéro de TVA intracommunautaire et une déclaration à part.
          </Info>
        </p>
      )}

      {!etat.banqueReliee && etat.lignes.length > 0 && (
        <p className={styles.bandeau}>
          Aucun relevé bancaire n’est disponible : le rapprochement est hors
          service, et aucune dépense n’est présentée comme rapprochée.
          <Info libelle="Pourquoi le rapprochement est indisponible">
            Afficher « rapprochée » sans relevé affirmerait un contrôle qui n’a
            pas lieu. L’ancienne application appariait des opérations sans
            jamais poser d’état consultable&nbsp;: on ne pouvait donc pas
            vérifier ce qu’elle avançait.
          </Info>
        </p>
      )}

      <section className={styles.carte} aria-labelledby={`${idGroupe}-liste`}>
        <h2 id={`${idGroupe}-liste`} className={styles.titreCarte}>
          Dépenses
          {etat.sansDate > 0 && (
            <span className={styles.compteur}>
              {etat.sansDate} sans date
            </span>
          )}
        </h2>

        {etat.lignes.length === 0
          ? (
            <Vide
              message={(
                <>
                  Aucune dépense enregistrée. Les charges de l’ancienne version
                  sont reprises à la migration, toutes sans
                  justificatif&nbsp;: l’ancien modèle n’en conservait aucun.
                </>
              )}
              action={(
                <button
                  type="button"
                  className={styles.actionPrincipale}
                  onClick={() => setPanneau({ type: 'ajout' })}
                >
                  Ajouter une dépense
                </button>
              )}
            />
          )
          : (
            <ul className={styles.liste}>
              {etat.lignes.map((ligne) => (
                <LigneListe
                  key={ligne.depense.id}
                  ligne={ligne}
                  onOuvrir={() => setPanneau({ type: 'detail', id: ligne.depense.id })}
                />
              ))}
            </ul>
          )}
      </section>

        </PanneauOnglet>
      </div>

      <Sheet
        ouvert={selection !== null}
        titre={selection?.depense.libelle || 'Dépense'}
        onFermer={fermer}
      >
        {selection !== null && (
          <DetailDepense
            ligne={selection}
            stockage={stockage}
            banqueReliee={etat.banqueReliee}
            onAttacher={(idJustificatif) =>
              attacherJustificatif(selection.depense.id, idJustificatif)}
            onRapprocher={(e) => definirRapprochement(selection.depense.id, e)}
            onSupprimer={() => { supprimerDepense(selection.depense.id); fermer(); }}
          />
        )}
      </Sheet>

      <Sheet ouvert={panneau.type === 'ajout'} titre="Ajouter une dépense" onFermer={fermer}>
        <FormulaireDepense
          onValider={(saisie) => {
            const id = ajouterDepense(saisie);
            // On enchaîne sur le détail : c'est là que la pièce se dépose, et
            // une dépense créée sans pièce est précisément le problème.
            setPanneau({ type: 'detail', id });
          }}
        />
      </Sheet>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Liste
   ───────────────────────────────────────────────────────────────────────── */

function LigneListe({ ligne, onOuvrir }: { ligne: LigneDepense; onOuvrir: () => void }) {
  const { depense, tva } = ligne;
  return (
    <li className={styles.ligne}>
      <button type="button" className={styles.ouvrir} onClick={onOuvrir}>
        <span className={styles.ligneTitre}>
          <span className={styles.ligneLibelle}>{depense.libelle || 'Sans libellé'}</span>
          <span className={styles.ligneMontant}>{eur(depense.montantTtc)}</span>
        </span>
        <span className={styles.ligneMeta}>
          <span>{depense.fournisseur || 'Fournisseur non renseigné'}</span>
          <span aria-hidden="true">·</span>
          <span className={depense.payeeLe === null ? styles.manquant : undefined}>
            {depense.payeeLe === null ? 'Date à saisir' : dateCourte(depense.payeeLe)}
          </span>
        </span>
        <span className={styles.pastilles}>
          <Pastille
            ton={depense.justificatifId === null ? 'danger' : 'accent'}
            texte={depense.justificatifId === null ? 'Sans pièce' : 'Pièce conservée'}
          />
          {tva.motifNonRecuperable === null
            ? <Pastille ton="accent" texte={`TVA ${eur(tva.recuperable)}`} />
            : <Pastille ton="neutre" texte={etiquetteMotif(ligne)} />}
          <Pastille ton="neutre" texte={etiquetteRapprochement(ligne.rapprochement)} />
        </span>
      </button>
    </li>
  );
}

/** Étiquette courte du motif. Le texte complet est dans le panneau de détail. */
function etiquetteMotif(ligne: LigneDepense): string {
  switch (ligne.tva.motifNonRecuperable) {
    case 'franchise': return 'Franchise';
    case 'justificatif_manquant': return 'TVA non récupérable';
    case 'autoliquidation': return 'Autoliquidation';
    case 'taux_nul': return 'Sans TVA';
    case null: return '';
  }
}

function etiquetteRapprochement(etat: EtatRapprochement): string {
  switch (etat) {
    case 'rapproche': return 'Rapprochée';
    case 'en_attente': return 'À rapprocher';
    case 'sans_banque': return 'Hors banque';
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Détail
   ───────────────────────────────────────────────────────────────────────── */

/** Ce que le dépôt d'une pièce a donné. Affiché tel quel, succès comme refus. */
type Retour = { readonly ton: 'succes' | 'echec'; readonly texte: string } | null;

function DetailDepense(
  { ligne, stockage, banqueReliee, onAttacher, onRapprocher, onSupprimer }: {
    ligne: LigneDepense;
    stockage: StockageJustificatifs;
    banqueReliee: boolean;
    onAttacher: (idJustificatif: string | null) => void;
    onRapprocher: (etat: EtatRapprochement) => void;
    onSupprimer: () => void;
  }
) {
  const { depense, tva } = ligne;
  const [retour, setRetour] = useState<Retour>(null);
  const [enCours, setEnCours] = useState(false);
  const idChamp = useId();

  async function deposer(fichier: File): Promise<void> {
    setEnCours(true);
    setRetour(null);
    try {
      const resultat = await deposerJustificatif(
        stockage,
        { nom: fichier.name, typeMime: fichier.type, contenu: fichier },
        depense.id
      );
      if (resultat.statut === 'refuse') {
        setRetour({ ton: 'echec', texte: resultat.motif });
        return;
      }
      onAttacher(resultat.meta.id);
      setRetour({ ton: 'succes', texte: resumerPiece(resultat.meta) });
    } catch {
      // Un stockage indisponible ne doit pas laisser croire que la pièce est
      // conservée : sans elle, la TVA n'est pas récupérable, et l'utilisateur
      // doit pouvoir réessayer en connaissance de cause.
      setRetour({
        ton: 'echec',
        texte: 'La pièce n’a pas pu être conservée. Rien n’a été enregistré.'
      });
    } finally {
      setEnCours(false);
    }
  }

  async function verifier(): Promise<void> {
    if (depense.justificatifId === null) return;
    setEnCours(true);
    try {
      const verdict = await verifierIntegrite(stockage, depense.justificatifId);
      setRetour(verdict.intacte
        ? { ton: 'succes', texte: 'La pièce est intacte depuis son dépôt.' }
        : { ton: 'echec', texte: verdict.motif ?? 'Vérification impossible.' });
    } catch {
      setRetour({ ton: 'echec', texte: 'La pièce n’a pas pu être relue.' });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className={styles.detail}>
      <dl className={styles.faits}>
        <Fait terme="Fournisseur" valeur={depense.fournisseur || '—'} />
        <Fait terme="Payée le" valeur={dateCourte(depense.payeeLe)} />
        <Fait terme="Montant TTC" valeur={eurExact(depense.montantTtc)} />
        <Fait terme="Taux de TVA" valeur={`${(depense.tauxTva * 100).toFixed(1).replace('.', ',')} %`} />
        <Fait terme="Provenance" valeur={libelleProvenance(depense.provenance)} />
        <Fait
          terme="Régime au paiement"
          valeur={ligne.regimeTva === 'franchise' ? 'Franchise en base' : 'Assujetti à la TVA'}
        />
      </dl>

      <section className={styles.bloc} aria-labelledby={`${idChamp}-tva`}>
        <h3 id={`${idChamp}-tva`} className={styles.titreBloc}>TVA</h3>
        {tva.motifNonRecuperable === null
          ? (
            <p className={styles.verdictAccent}>
              {eurExact(tva.recuperable)} récupérables.
            </p>
          )
          : (
            <>
              <p className={styles.verdict}>{libelleMotif(tva.motifNonRecuperable)}</p>
              {tva.aAutoliquider > 0 && (
                <p className={styles.verdictAttention}>
                  {eurExact(tva.aAutoliquider)} à autoliquider et à déclarer.
                </p>
              )}
            </>
          )}
      </section>

      <section className={styles.bloc} aria-labelledby={`${idChamp}-piece`}>
        <h3 id={`${idChamp}-piece`} className={styles.titreBloc}>
          Justificatif
          <Info libelle="Ce que conserve l’application">
            Le fichier lui-même est conservé, avec son empreinte et la date du
            dépôt. L’empreinte permet de montrer que la pièce n’a pas changé
            depuis&nbsp;: sans elle, une copie numérique ne prouve rien.
          </Info>
        </h3>

        {depense.justificatifId === null
          ? <p className={styles.verdictDanger}>Aucune pièce conservée.</p>
          : <p className={styles.verdictAccent}>Une pièce est conservée.</p>}

        <label className={styles.champFichier} htmlFor={`${idChamp}-fichier`}>
          {depense.justificatifId === null ? 'Déposer une pièce' : 'Remplacer la pièce'}
        </label>
        <input
          id={`${idChamp}-fichier`}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
          disabled={enCours}
          onChange={(e) => {
            const fichier = e.target.files?.[0];
            if (fichier) void deposer(fichier);
          }}
        />

        {depense.justificatifId !== null && (
          <div className={styles.actions}>
            <button type="button" className={styles.action} disabled={enCours} onClick={() => void verifier()}>
              Vérifier l’intégrité
            </button>
            <button
              type="button"
              className={styles.action}
              disabled={enCours}
              onClick={() => { onAttacher(null); setRetour(null); }}
            >
              Détacher
            </button>
          </div>
        )}

        {retour !== null && (
          <p
            role="status"
            className={retour.ton === 'succes' ? styles.verdictAccent : styles.verdictDanger}
          >
            {retour.texte}
          </p>
        )}
      </section>

      <section className={styles.bloc} aria-labelledby={`${idChamp}-banque`}>
        <h3 id={`${idChamp}-banque`} className={styles.titreBloc}>Rapprochement</h3>
        {banqueReliee
          ? (
            <div className={styles.actions}>
              {(['rapproche', 'en_attente', 'sans_banque'] as const).map((etat) => (
                <button
                  key={etat}
                  type="button"
                  className={`${styles.action} ${depense.rapprochement === etat ? styles.actionActive : ''}`}
                  aria-pressed={depense.rapprochement === etat}
                  onClick={() => onRapprocher(etat)}
                >
                  {etiquetteRapprochement(etat)}
                </button>
              ))}
            </div>
          )
          : (
            <p className={styles.verdict}>
              Aucun relevé bancaire n’est disponible. L’état stocké est conservé
              et sera repris dès qu’un relevé le sera.
            </p>
          )}
      </section>

      <button type="button" className={styles.supprimer} onClick={onSupprimer}>
        Supprimer cette dépense
      </button>
    </div>
  );
}

function resumerPiece(meta: MetaJustificatif): string {
  const ko = Math.max(1, Math.round(meta.taille / 1024));
  return `Pièce conservée : ${meta.nomFichier} (${ko} Ko), empreinte ${meta.empreinte.slice(0, 12)}…`;
}

function libelleProvenance(p: ProvenanceFournisseur): string {
  switch (p) {
    case 'france': return 'France';
    case 'ue': return 'Union européenne';
    case 'hors_ue': return 'Hors Union européenne';
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Saisie
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Formulaire d'ajout.
 *
 * Le taux de TVA est saisi, jamais supposé : l'ancienne version appliquait
 * 20 % par défaut, y compris sur des dépenses qui n'en portaient pas.
 */
function FormulaireDepense(
  { onValider }: { onValider: (saisie: Parameters<ReturnType<typeof useFaits.getState>['ajouterDepense']>[0]) => void }
) {
  const idChamp = useId();
  const [libelle, setLibelle] = useState('');
  const [fournisseur, setFournisseur] = useState('');
  const [montant, setMontant] = useState('');
  const [taux, setTaux] = useState('20');
  const [date, setDate] = useState('');
  const [provenance, setProvenance] = useState<ProvenanceFournisseur>('france');
  const [erreur, setErreur] = useState<string | null>(null);

  function soumettre(evenement: React.FormEvent): void {
    evenement.preventDefault();
    const valeur = Number.parseFloat(montant.replace(',', '.'));
    if (!Number.isFinite(valeur) || valeur <= 0) {
      setErreur('Le montant doit être un nombre supérieur à zéro.');
      return;
    }
    const points = Number.parseFloat(taux.replace(',', '.'));
    if (!Number.isFinite(points) || points < 0) {
      setErreur('Le taux de TVA doit être un nombre positif ou nul.');
      return;
    }
    setErreur(null);
    onValider({
      libelle: libelle.trim(),
      fournisseur: fournisseur.trim(),
      provenance,
      montantTtc: euros(valeur),
      tauxTva: ratio(points / 100),
      payeeLe: /^\d{4}-\d{2}-\d{2}$/.test(date) ? dateISO(date) : null,
      // Une dépense naît sans pièce, et l'écran le dit immédiatement. Créer
      // avec une pièce supposée serait revenir au `piece: true` de l'ancienne
      // version.
      justificatifId: null,
      rapprochement: 'en_attente'
    });
  }

  return (
    <form className={styles.formulaire} onSubmit={soumettre}>
      <Champ id={`${idChamp}-libelle`} libelle="Libellé">
        <input id={`${idChamp}-libelle`} value={libelle}
          onChange={(e) => setLibelle(e.target.value)} required />
      </Champ>

      <Champ id={`${idChamp}-fournisseur`} libelle="Fournisseur">
        <input id={`${idChamp}-fournisseur`} value={fournisseur}
          onChange={(e) => setFournisseur(e.target.value)} />
      </Champ>

      <Champ id={`${idChamp}-montant`} libelle="Montant TTC (€)">
        <input id={`${idChamp}-montant`} inputMode="decimal" value={montant}
          onChange={(e) => setMontant(e.target.value)} required />
      </Champ>

      <Champ id={`${idChamp}-taux`} libelle="Taux de TVA (%)">
        <input id={`${idChamp}-taux`} inputMode="decimal" value={taux}
          onChange={(e) => setTaux(e.target.value)} />
      </Champ>

      <Champ id={`${idChamp}-date`} libelle="Payée le">
        <input id={`${idChamp}-date`} type="date" value={date}
          onChange={(e) => setDate(e.target.value)} />
      </Champ>

      <Champ id={`${idChamp}-provenance`} libelle="Provenance du fournisseur">
        <select id={`${idChamp}-provenance`} value={provenance}
          onChange={(e) => setProvenance(e.target.value as ProvenanceFournisseur)}>
          <option value="france">France</option>
          <option value="ue">Union européenne</option>
          <option value="hors_ue">Hors Union européenne</option>
        </select>
      </Champ>

      {erreur !== null && <p role="alert" className={styles.verdictDanger}>{erreur}</p>}

      <button type="submit" className={styles.actionPrincipale}>
        Ajouter, puis déposer la pièce
      </button>
    </form>
  );
}

function Champ(
  { id, libelle, children }: { id: string; libelle: string; children: React.ReactNode }
) {
  return (
    <p className={styles.champ}>
      <label htmlFor={id}>{libelle}</label>
      {children}
    </p>
  );
}

function Fait({ terme, valeur }: { terme: string; valeur: string }) {
  return (
    <div className={styles.fait}>
      <dt>{terme}</dt>
      <dd>{valeur}</dd>
    </div>
  );
}

function Chiffre(
  { libelle, valeur, ton = 'neutre' }: {
    libelle: string;
    valeur: string;
    ton?: 'neutre' | 'accent' | 'attention' | 'danger';
  }
) {
  const classe = ton === 'danger' ? styles.danger
    : ton === 'attention' ? styles.attention
    : ton === 'accent' ? styles.accent : '';
  return (
    <div className={styles.chiffre}>
      <span className={styles.libelle}>{libelle}</span>
      <span className={`${styles.montant} ${classe}`}>{valeur}</span>
    </div>
  );
}

function Pastille({ ton, texte }: { ton: 'neutre' | 'accent' | 'danger'; texte: string }) {
  if (texte === '') return null;
  const classe = ton === 'danger' ? styles.pastilleDanger
    : ton === 'accent' ? styles.pastilleAccent : '';
  return <span className={`${styles.pastille} ${classe}`}>{texte}</span>;
}
