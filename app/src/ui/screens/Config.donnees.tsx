import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useToast } from '../components/Toasts';
import { instantaneAvantRemplacement, useFaits } from '../../state/store';
import { dateDuJour } from '../../state/selecteurs';
import { CLE_STOCKAGE, faitsVides, type Recette } from '../../state/schema';
import { livreRecettesCsv } from '../../domain/calculs/livreRecettesCsv';
import { dateCourte } from '../format';
import { nomSauvegarde, telecharger } from '../../infra/telechargement';
import {
  stockageIndexedDB, type MetaJustificatif, type StockageJustificatifs
} from '../../infra/justificatifs';
import type { lireArchive } from '../../infra/justificatifs.archive';
import { lireDerniereArchive } from '../../infra/archive.derniere';
import { ErreurArchive } from '../../infra/archive.zip';
import { RangeeArchive } from './Config.donnees.archive';
import styles from './Config.module.css';

/* ─────────────────────────────────────────────────────────────────────────
   Données
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Export des faits.
 *
 * Un export brut et complet, pas un rapport : ce qui compte ici est de pouvoir
 * récupérer ses données sans l'application. Les pièces justificatives ne sont
 * pas incluses — elles vivent dans IndexedDB et pèsent trop pour un fichier
 * texte —, et le dire vaut mieux que de laisser croire à une sauvegarde
 * complète.
 *
 * Une ligne par geste, titre et explication à gauche, bouton à droite, comme
 * le handoff : la section empilait un tableau de comptes, un bouton isolé et
 * le champ fichier natif du navigateur (« Choose File »), et le livre des
 * recettes n'y figurait pas — il fallait savoir qu'il vivait dans le menu
 * « Exporter » de la barre du haut.
 */
const stockageParDefaut = stockageIndexedDB();

export function Donnees(
  { stockage = stockageParDefaut }: { readonly stockage?: StockageJustificatifs } = {}
) {
  const faits = useFaits((e) => e.faits);
  const nomFichier = nomSauvegarde(faits.entreprise.nom, dateDuJour());
  const chargement = useFaits((e) => e.chargement);
  const adopter = useFaits((e) => e.adopterFaitsDistants);
  const signaler = useToast();
  const idChamp = useId();
  const annees = useMemo(() => anneesDuLivre(faits.recettes, dateDuJour()), [faits.recettes]);
  const [annee, setAnnee] = useState<number>(annees[0] ?? Number(dateDuJour().slice(0, 4)));
  /**
   * Ce qu'une sauvegarde contient, AVANT de l'appliquer.
   *
   * Restaurer écrase tout. Le faire au clic sur « parcourir » ferait perdre
   * une saisie du jour sans que personne l'ait vue passer — c'est la même
   * précaution que sur l'écran Compte, et pour la même raison.
   */
  const [aRestaurer, setARestaurer] = useState<Restauration | null>(null);
  /**
   * La confirmation s'affiche sous toutes les lignes : sur téléphone, à trois
   * cents pixels sous « Choisir un fichier » qui l'a demandée, hors de la vue.
   * On choisissait un fichier et rien ne semblait se passer. Elle vient donc
   * à l'écran, et le focus avec elle — le clavier y est aussitôt.
   */
  const refConfirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (aRestaurer === null) return;
    refConfirmation.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    refConfirmation.current?.focus({ preventScroll: true });
  }, [aRestaurer]);
  // Relue à chaque changement des faits : un remplacement vient d'en écrire
  // une. `faits` n'est pas lu dans le calcul, il en est le DÉCLENCHEUR.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const avant = useMemo(() => instantaneAvantRemplacement(), [faits]);

  /**
   * Les pièces de ce navigateur, relues après chaque archive ou restauration.
   * `null` si elles ne se lisent pas (IndexedDB absent ou bloqué) : l'écran
   * se tait plutôt que d'annoncer « aucun justificatif » à tort.
   */
  const [metas, setMetas] = useState<readonly MetaJustificatif[] | null>(null);
  const [derniere, setDerniere] = useState<string | null>(() => lireDerniereArchive());
  const relirePieces = useCallback(() => {
    setDerniere(lireDerniereArchive());
    stockage.lister().then(setMetas, () => setMetas(null));
  }, [stockage]);
  useEffect(() => { relirePieces(); }, [relirePieces]);
  /** Les pièces qu'une restauration a refusées : elles se disent, une par une. */
  const [refusPieces, setRefusPieces] =
    useState<readonly { readonly nomFichier: string; readonly motif: string }[] | null>(null);

  /**
   * Restaure les pièces d'une archive, puis — si demandé — ses faits.
   *
   * Les pièces D'ABORD : leur dépôt est additif et ne détruit rien. Adopter
   * les faits en premier, puis échouer sur les pièces, laisserait des faits
   * qui pointent vers des fichiers absents.
   */
  async function restaurerArchive(
    lue: Awaited<ReturnType<typeof lireArchive>>, avecLesFaits: boolean
  ): Promise<void> {
    const { restaurerPieces } = await import('../../infra/justificatifs.archive');
    const bilan = await restaurerPieces(lue, stockage);
    const refus = avecLesFaits ? await adopter(lue.faits) : null;
    const pieces = `${bilan.ajoutees}\u00a0pièce(s) ajoutée(s), ${bilan.dejaPresentes} déjà présente(s)`;
    signaler(refus ?? (avecLesFaits ? `Archive restaurée : ${pieces}.` : `${pieces}.`));
    setRefusPieces(bilan.refusees.length > 0 ? bilan.refusees : null);
    setARestaurer(null);
    relirePieces();
  }

  function exporter(): void {
    telecharger(nomFichier, JSON.stringify(faits, null, 2), 'application/json;charset=utf-8');
  }

  function exporterLivre(): void {
    telecharger(
      `livre-des-recettes-${annee}.csv`,
      livreRecettesCsv(faits.recettes, annee),
      'text/csv;charset=utf-8'
    );
  }

  return (
    <div className={styles.carte}>

      {chargement.phase === 'sans-persistance' && (
        <p className={styles.echec} role="alert">{chargement.motif}</p>
      )}

      <ul className={styles.rangees}>
        <li className={styles.rangee}>
          <div className={styles.rangeeTexte}>
            <span className={styles.rangeeTitre}>Livre des recettes (CSV)</span>
            <span className={styles.rangeeAide}>
              Les encaissements de l’année, dans l’ordre du registre obligatoire —
              à ouvrir dans un tableur ou à remettre à ton comptable.
            </span>
          </div>
          <div className={styles.rangeeAction}>
            {/* En janvier, c'est le livre de l'année qui vient de finir qu'on
                cherche : l'année se choisit dès qu'il y en a plus d'une. */}
            {annees.length > 1 && (
              <select
                aria-label="Année du livre des recettes"
                className={styles.choixAnnee}
                value={annee}
                onChange={(e) => setAnnee(Number(e.target.value))}
              >
                {annees.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            )}
            <button
              type="button"
              className={styles.action}
              aria-label={`Télécharger le livre des recettes ${annee} (CSV)`}
              onClick={exporterLivre}
            >
              Télécharger
            </button>
          </div>
        </li>

        <RangeeArchive
          faits={faits} stockage={stockage} metas={metas} derniere={derniere}
          onFaite={relirePieces}
        />

        <li className={styles.rangee}>
          <div className={styles.rangeeTexte}>
            <span className={styles.rangeeTitre}>Sauvegarde des données (JSON)</span>
            <span className={styles.rangeeAide}>
              {compte(faits.recettes.length, 'recette')}, {compte(faits.depenses.length, 'dépense')},
              {' '}{compte(faits.missions.length, 'mission')}, {compte(faits.clients.length, 'client')} et
              {' '}{compte(faits.periodesDeclarees.length, 'période déclarée', 'périodes déclarées')}&nbsp;:
              un fichier léger, réimportable à tout moment. Les justificatifs n’y sont
              pas&nbsp;: seule l’archive complète les emporte.
            </span>
          </div>
          <div className={styles.rangeeAction}>
            <button
              type="button"
              className={styles.action}
              aria-label="Sauvegarder mes données sans les justificatifs (JSON)"
              onClick={exporter}
            >
              Sauvegarder
            </button>
          </div>
        </li>

        <li className={styles.rangee}>
          <div className={styles.rangeeTexte}>
            <span className={styles.rangeeTitre}>Restaurer une sauvegarde</span>
            <span className={styles.rangeeAide}>
              Une archive (ZIP) ou une sauvegarde (JSON) produite ici. Son contenu
              te sera montré avant d’écraser quoi que ce soit.
            </span>
          </div>
          <div className={styles.rangeeAction}>
            {/* Le champ fichier natif parle la langue du navigateur (« Choose
                File ») et ne se stylise pas : il reste dans le libellé, hors de
                la vue mais au clavier, et c'est le libellé qui a l'air d'un
                bouton. */}
            <label className={`${styles.action} ${styles.choixFichier}`}>
              Choisir un fichier
              <input
                id={`${idChamp}-restaurer`}
                className={styles.invisible}
                aria-label="Restaurer une sauvegarde"
                type="file"
                accept="application/json,.json,application/zip,.zip"
                onChange={(e) => {
                  const fichier = e.target.files?.[0];
                  // Le champ est vidé pour que rechoisir le MÊME fichier déclenche à
                  // nouveau l'événement : sans cela, annuler puis recommencer avec le
                  // même fichier ne ferait rien, et l'écran paraîtrait cassé.
                  e.target.value = '';
                  if (fichier === undefined) return;
                  void lireSauvegarde(fichier, metas).then(setARestaurer);
                }}
              />
            </label>
          </div>
        </li>

        {/* Une application vide ne montre rien de ce qu'elle sait faire : les
            graphes sont plats, les indicateurs à zéro, et on ne peut pas juger.
            Le jeu de démonstration passe par la MÊME confirmation qu'une
            restauration — il écrase autant qu'elle, et l'appeler « démonstration »
            ne le rend pas moins destructeur. */}
        <li className={styles.rangee}>
          <div className={styles.rangeeTexte}>
            <span className={styles.rangeeTitre}>Jeu de démonstration</span>
            <span className={styles.rangeeAide}>
              Des clients, des missions, des factures et des échéances manifestement
              fictifs, pour voir l’application remplie. Ils remplacent tes données.
            </span>
          </div>
          <div className={styles.rangeeAction}>
            <button
              type="button"
              className={styles.action}
              aria-label="Charger un jeu de démonstration"
              onClick={() => { void lireJeuDeDemonstration().then(setARestaurer); }}
            >
              Charger
            </button>
          </div>
        </li>

        {/* Le handoff porte « Effacer toutes les données — suppression
            définitive (RGPD) ». Rien ici n'efface le compte distant, et une
            suppression sans retour juste après avoir chargé la démonstration
            par curiosité serait un piège : repartir de zéro met de côté ce
            qu'on avait, comme une restauration. */}
        <li className={`${styles.rangee} ${styles.rangeeDanger}`}>
          <div className={styles.rangeeTexte}>
            <span className={styles.rangeeTitre}>Repartir de zéro</span>
            <span className={styles.rangeeAide}>
              Vide l’application dans ce navigateur. Ce que tu as maintenant est
              mis de côté&nbsp;: «&nbsp;Revenir à l’état d’avant&nbsp;» le rétablit.
              Un compte relié n’est pas touché, et les justificatifs restent conservés.
            </span>
          </div>
          <div className={styles.rangeeAction}>
            <button
              type="button"
              className={`${styles.action} ${styles.actionDanger}`}
              aria-label="Vider l’application"
              onClick={() => setARestaurer(VIDER)}
            >
              Vider
            </button>
          </div>
        </li>
      </ul>

      {aRestaurer !== null && (
        <div ref={refConfirmation} tabIndex={-1} className={styles.confirmation} role="alert">
          {aRestaurer.statut === 'illisible'
            ? <p className={styles.echec}>{aRestaurer.motif}</p>
            : (
              <>
                {aRestaurer.origine === 'archive' && aRestaurer.archive !== undefined
                  ? <ConfirmationArchive archive={aRestaurer.archive} resume={aRestaurer.resume} />
                  : aRestaurer.origine === 'vide'
                  ? (
                    <p>
                      L’application sera <strong>vide</strong>&nbsp;: ni client, ni mission,
                      ni facture, ni réglage.
                    </p>
                  )
                  : (
                    <p>
                      Cette sauvegarde contient <strong>{aRestaurer.resume.recettes}</strong> recette(s),
                      {' '}<strong>{aRestaurer.resume.depenses}</strong> dépense(s),
                      {' '}<strong>{aRestaurer.resume.missions}</strong> mission(s) et
                      {' '}<strong>{aRestaurer.resume.clients}</strong> client(s).
                    </p>
                  )}
                {aRestaurer.origine !== 'archive' && (
                  <p className={styles.explication}>
                    {aRestaurer.origine === 'vide' ? 'Vider' : 'La restaurer'} <strong>remplace</strong> tout
                    ce qui est actuellement dans l’application, qui est mis de côté.
                    Les justificatifs déposés ne sont pas concernés&nbsp;: ils vivent
                    à part, et une sauvegarde JSON ne les contient pas.
                  </p>
                )}
                {aRestaurer.origine === 'archive' && aRestaurer.archive !== undefined ? (
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.actionPrincipale}
                      onClick={() => { void restaurerArchive(aRestaurer.archive!.lue, true); }}
                    >
                      Tout remplacer par cette archive
                    </button>
                    <button
                      type="button"
                      className={styles.action}
                      onClick={() => { void restaurerArchive(aRestaurer.archive!.lue, false); }}
                    >
                      Ajouter seulement les pièces manquantes
                    </button>
                    <button type="button" className={styles.action} onClick={() => setARestaurer(null)}>
                      Annuler
                    </button>
                  </div>
                ) : (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.actionPrincipale}
                    onClick={() => {
                      const vide = aRestaurer.origine === 'vide';
                      void adopter(vide ? faitsVides() : aRestaurer.brut).then((refus) => {
                        signaler(refus ?? (vide ? 'Application vidée.' : 'Sauvegarde restaurée.'));
                        setARestaurer(null);
                      });
                    }}
                  >
                    {aRestaurer.origine === 'vide'
                      ? 'Vider l’application'
                      : 'Remplacer mes données par cette sauvegarde'}
                  </button>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => setARestaurer(null)}
                  >
                    Annuler
                  </button>
                </div>
                )}
              </>
            )}
        </div>
      )}

      {refusPieces !== null && (
        <div className={styles.confirmation} role="alert">
          <p>
            {refusPieces.length} pièce(s) de l’archive n’ont pas été restaurées&nbsp;:
          </p>
          <ul className={styles.listeRefus}>
            {refusPieces.map((r) => <li key={`${r.nomFichier}-${r.motif}`}>{r.nomFichier} — {r.motif}</li>)}
          </ul>
          <div className={styles.actions}>
            <button type="button" className={styles.action} onClick={() => setRefusPieces(null)}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {avant !== null && (
        <div className={styles.confirmation}>
          <p className={styles.explication}>
            Tes données d’avant le dernier remplacement ({dateCourte(avant.le.slice(0, 10))})
            ont été mises de côté. Y revenir met à son tour de côté ce que tu as
            maintenant&nbsp;: rien ne se perd.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                let bloc: unknown = null;
                try { bloc = JSON.parse(avant.brut); } catch { /* refusé plus bas */ }
                void adopter(bloc).then((refus) => {
                  signaler(refus ?? 'Données d’avant le remplacement rétablies.');
                });
              }}
            >
              Revenir à l’état d’avant
            </button>
          </div>
        </div>
      )}

      <p className={styles.explication}>
        Les faits vivent dans ce navigateur, sous la clé{' '}
        <span className={styles.source}>{CLE_STOCKAGE}</span>. Les données de
        l’ancienne version restent en place et ne sont jamais effacées.
      </p>
    </div>
  );
}

/** « 1 recette », « 13 recettes », « 0 recette ». */
function compte(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${n}\u00a0${n > 1 ? pluriel : singulier}`;
}

/**
 * Les années dont le livre a quelque chose à dire, la plus récente d'abord.
 *
 * L'année en cours y est toujours, même vide : c'est celle qu'on cherche en
 * premier, et un sélecteur qui l'omettrait en janvier ferait croire qu'elle
 * n'existe pas.
 */
function anneesDuLivre(recettes: readonly Recette[], jour: string): readonly number[] {
  const annees = new Set<number>([Number(jour.slice(0, 4))]);
  for (const r of recettes) {
    if (r.encaisseeLe !== null) annees.add(Number(r.encaisseeLe.slice(0, 4)));
  }
  return [...annees].sort((a, b) => b - a);
}

/* ─────────────────────────────────────────────────────────────────────────
   Restauration d'une sauvegarde
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Une sauvegarde lue, et ce qu'on peut en dire sans l'appliquer.
 *
 * L'export existait depuis le début, la restauration non. Une sauvegarde qu'on
 * ne sait pas relire n'est pas une sauvegarde : c'est un fichier qui rassure.
 */
type Restauration =
  | { readonly statut: 'illisible'; readonly motif: string }
  | {
    readonly statut: 'lisible';
    /** « vide » : repartir de zéro — même confirmation, autre annonce. */
    readonly origine: 'sauvegarde' | 'vide' | 'archive';
    /** Ce qu'une archive ZIP ajoute à l'annonce : ses pièces, sa date. */
    readonly archive?: {
      readonly lue: Awaited<ReturnType<typeof lireArchive>>;
      readonly pieces: number;
      readonly produiteLe: string;
      /** Pièces d'ici dont le fait n'existera plus si l'on adopte ses faits. */
      readonly orphelines: number;
    };
    readonly brut: unknown;
    readonly resume: {
      readonly recettes: number; readonly depenses: number;
      readonly missions: number; readonly clients: number;
    };
  };

/** Repartir de zéro : le bloc vide est construit au moment d'adopter. */
const VIDER: Restauration = {
  statut: 'lisible', origine: 'vide', brut: null,
  resume: { recettes: 0, depenses: 0, missions: 0, clients: 0 }
};

/**
 * Le jeu de démonstration, servi comme fichier statique.
 *
 * Il n'est PAS importé dans le paquet : ce sont douze kilo-octets que quelqu'un
 * qui saisit ses vraies données ne téléchargera jamais. Il est aussi la source
 * dont `scripts/capturer-app.mjs` se sert pour rendre nos écrans dans les mêmes
 * conditions que le handoff — un seul fichier, pas une copie qui dérive.
 *
 * Écrit au 10 juin 2026, il est recalé sur la date du jour avant d'être
 * proposé : voir `recalerDemonstration`. Les captures, elles, le chargent tel
 * quel, horloge figée.
 */
async function lireJeuDeDemonstration(): Promise<Restauration> {
  try {
    const reponse = await fetch(`${import.meta.env.BASE_URL}jeu-de-demonstration.json`);
    if (!reponse.ok) {
      return { statut: 'illisible', motif: 'Le jeu de démonstration n’a pas pu être chargé.' };
    }
    const brut: unknown = await reponse.json();
    const { recalerJeuBrut } = await import('../../state/demonstration.recalage');
    return resumerBloc(recalerJeuBrut(brut, dateDuJour()));
  } catch {
    return { statut: 'illisible', motif: 'Le jeu de démonstration n’a pas pu être chargé.' };
  }
}

/**
 * Lit un fichier de sauvegarde sans rien écrire.
 *
 * La validation de fond — schéma trop récent, listes mal formées — appartient
 * à `adopterFaitsDistants`, qui la fait au moment d'adopter. Ici on ne vérifie
 * que ce qu'il faut pour ANNONCER le contenu : un fichier illisible doit se
 * dire tout de suite, pas après une confirmation.
 */
async function lireSauvegarde(
  fichier: File, metas: readonly MetaJustificatif[] | null
): Promise<Restauration> {
  if (/\.zip$/i.test(fichier.name) || /zip/.test(fichier.type)) return lireArchiveComplete(fichier, metas);
  let texte: string;
  try {
    texte = await fichier.text();
  } catch {
    return { statut: 'illisible', motif: 'Le fichier n’a pas pu être lu.' };
  }

  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return {
      statut: 'illisible',
      motif: 'Ce fichier n’est pas du JSON. Choisis un export produit par l’application.'
    };
  }

  return resumerBloc(brut);
}

/**
 * Lit une archive complète sans rien écrire : ni pièce, ni fait.
 *
 * Le module d'archive arrive à la demande. Le motif d'une `ErreurArchive`
 * est écrit pour l'utilisateur ; celui d'une autre erreur ne l'est pas.
 */
async function lireArchiveComplete(
  fichier: File, metas: readonly MetaJustificatif[] | null
): Promise<Restauration> {
  let module: typeof import('../../infra/justificatifs.archive') | null = null;
  try {
    module = await import('../../infra/justificatifs.archive');
    const lue = await module.lireArchive(fichier);
    const resume = resumerBloc(lue.faits);
    if (resume.statut === 'illisible') return resume;
    return {
      ...resume,
      origine: 'archive',
      archive: {
        lue,
        pieces: lue.manifeste.pieces.filter((p) => p.chemin !== null).length,
        produiteLe: lue.manifeste.produiteLe,
        orphelines: metas === null ? 0 : module.orphelinesApres(metas, lue.faits)
      }
    };
  } catch (e) {
    return {
      statut: 'illisible',
      motif: e instanceof ErreurArchive
        ? e.message
        : 'Cette archive n’a pas pu être lue.'
    };
  }
}

/** Ce qu'une archive apporte, et ce qu'elle laisserait sans fait. */
function ConfirmationArchive(
  { archive, resume }: {
    readonly archive: NonNullable<Extract<Restauration, { statut: 'lisible' }>['archive']>;
    readonly resume: Extract<Restauration, { statut: 'lisible' }>['resume'];
  }
) {
  return (
    <>
      <p>
        Cette archive du {dateCourte(archive.produiteLe.slice(0, 10))} contient
        {' '}<strong>{resume.recettes}</strong> recette(s), <strong>{resume.depenses}</strong> dépense(s),
        {' '}<strong>{resume.missions}</strong> mission(s), <strong>{resume.clients}</strong> client(s)
        {' '}et <strong>{archive.pieces}</strong> justificatif(s).
      </p>
      <p className={styles.explication}>
        «&nbsp;Tout remplacer&nbsp;» restaure d’abord les justificatifs, puis
        remplace tes données, qui sont mises de côté. «&nbsp;Ajouter seulement
        les pièces manquantes&nbsp;» garde tes données telles quelles — c’est
        le geste quand tu changes de navigateur. Aucun justificatif d’ici n’est
        jamais supprimé.
        {archive.orphelines > 0 && (
          <> Si tu remplaces tout, {archive.orphelines} justificatif(s) déposé(s) ici
          ne correspondront plus à aucun fait&nbsp;: ils restent conservés, mais
          détachés.</>
        )}
      </p>
    </>
  );
}

/** Annonce ce qu'un bloc contient, sans rien adopter. */
function resumerBloc(brut: unknown): Restauration {
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) {
    return {
      statut: 'illisible',
      motif: 'Ce fichier ne contient pas un bloc de faits exploitable.'
    };
  }

  const o = brut as Record<string, unknown>;
  const compter = (cle: string) => (Array.isArray(o[cle]) ? (o[cle] as unknown[]).length : 0);

  return {
    statut: 'lisible',
    origine: 'sauvegarde',
    brut,
    resume: {
      recettes: compter('recettes'),
      depenses: compter('depenses'),
      missions: compter('missions'),
      clients: compter('clients')
    }
  };
}
