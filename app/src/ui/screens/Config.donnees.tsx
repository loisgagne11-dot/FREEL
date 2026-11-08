import { useId, useMemo, useState } from 'react';
import { useToast } from '../components/Toasts';
import { instantaneAvantRemplacement, useFaits } from '../../state/store';
import { dateDuJour } from '../../state/selecteurs';
import { CLE_STOCKAGE, faitsVides, type Recette } from '../../state/schema';
import { livreRecettesCsv } from '../../domain/calculs/livreRecettesCsv';
import { dateCourte } from '../format';
import { nomSauvegarde, telecharger } from '../../infra/telechargement';
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
export function Donnees() {
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
  // Relue à chaque changement des faits : un remplacement vient d'en écrire
  // une. `faits` n'est pas lu dans le calcul, il en est le DÉCLENCHEUR.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const avant = useMemo(() => instantaneAvantRemplacement(), [faits]);

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

        <li className={styles.rangee}>
          <div className={styles.rangeeTexte}>
            <span className={styles.rangeeTitre}>Sauvegarde complète (JSON)</span>
            <span className={styles.rangeeAide}>
              {compte(faits.recettes.length, 'recette')}, {compte(faits.depenses.length, 'dépense')},
              {' '}{compte(faits.missions.length, 'mission')}, {compte(faits.clients.length, 'client')} et
              {' '}{compte(faits.periodesDeclarees.length, 'période déclarée', 'périodes déclarées')}&nbsp;:
              tout, réimportable à tout moment. Les justificatifs n’y sont pas&nbsp;:
              ce sont des fichiers, conservés à part dans le navigateur.
            </span>
          </div>
          <div className={styles.rangeeAction}>
            <button
              type="button"
              className={styles.action}
              aria-label="Sauvegarder toutes mes données (JSON)"
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
              Un fichier produit par «&nbsp;Sauvegarder&nbsp;». Son contenu te sera
              montré avant d’écraser quoi que ce soit.
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
                accept="application/json,.json"
                onChange={(e) => {
                  const fichier = e.target.files?.[0];
                  // Le champ est vidé pour que rechoisir le MÊME fichier déclenche à
                  // nouveau l'événement : sans cela, annuler puis recommencer avec le
                  // même fichier ne ferait rien, et l'écran paraîtrait cassé.
                  e.target.value = '';
                  if (fichier === undefined) return;
                  void lireSauvegarde(fichier).then(setARestaurer);
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
              Un compte relié n’est pas touché.
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
        <div className={styles.confirmation} role="alert">
          {aRestaurer.statut === 'illisible'
            ? <p className={styles.echec}>{aRestaurer.motif}</p>
            : (
              <>
                {aRestaurer.origine === 'vide'
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
                <p className={styles.explication}>
                  {aRestaurer.origine === 'vide' ? 'Vider' : 'La restaurer'} <strong>remplace</strong> tout
                  ce qui est actuellement dans l’application, qui est mis de côté.
                  Les justificatifs déposés ne sont pas concernés&nbsp;: ils vivent
                  à part, et une sauvegarde JSON ne les contient pas.
                </p>
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
              </>
            )}
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
    readonly origine: 'sauvegarde' | 'vide';
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
async function lireSauvegarde(fichier: File): Promise<Restauration> {
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
