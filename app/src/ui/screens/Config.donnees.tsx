import { useId, useMemo, useState } from 'react';
import { useToast } from '../components/Toasts';
import { instantaneAvantRemplacement, useFaits } from '../../state/store';
import { dateDuJour } from '../../state/selecteurs';
import { CLE_STOCKAGE } from '../../state/schema';
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
 */
export function Donnees() {
  const faits = useFaits((e) => e.faits);
  const nomFichier = nomSauvegarde(faits.entreprise.nom, dateDuJour());
  const chargement = useFaits((e) => e.chargement);
  const adopter = useFaits((e) => e.adopterFaitsDistants);
  const signaler = useToast();
  const idChamp = useId();
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

  return (
    <div className={styles.carte}>

      {chargement.phase === 'sans-persistance' && (
        <p className={styles.echec} role="alert">{chargement.motif}</p>
      )}

      <dl className={styles.detail}>
        <div className={styles.ligne}>
          <dt>Recettes</dt>
          <dd>{faits.recettes.length}</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Dépenses</dt>
          <dd>{faits.depenses.length}</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Missions</dt>
          <dd>{faits.missions.length}</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Clients</dt>
          <dd>{faits.clients.length}</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Périodes déclarées</dt>
          <dd>{faits.periodesDeclarees.length}</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Emplacement</dt>
          <dd className={styles.source}>{CLE_STOCKAGE}</dd>
        </div>
      </dl>

      <button type="button" className={styles.actionPrincipale} onClick={exporter}>
        Exporter mes données
      </button>

      <p className={styles.champ}>
        <label htmlFor={`${idChamp}-restaurer`}>Restaurer une sauvegarde</label>
        <input
          id={`${idChamp}-restaurer`}
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
        <span className={styles.aide}>
          Un fichier produit par «&nbsp;Exporter mes données&nbsp;». Son contenu
          te sera montré avant d’écraser quoi que ce soit.
        </span>
      </p>

      {/* Une application vide ne montre rien de ce qu'elle sait faire : les
          graphes sont plats, les indicateurs à zéro, et on ne peut pas juger.
          Le jeu de démonstration passe par la MÊME confirmation qu'une
          restauration — il écrase autant qu'elle, et l'appeler « démonstration »
          ne le rend pas moins destructeur. */}
      <button
        type="button"
        className={styles.action}
        onClick={() => { void lireJeuDeDemonstration().then(setARestaurer); }}
      >
        Charger un jeu de démonstration
      </button>
      <p className={styles.explication}>
        Des clients, des missions, des factures et des échéances manifestement
        fictifs, pour voir l’application remplie. Ils remplacent tes données&nbsp;:
        exporte-les d’abord si elles comptent.
      </p>

      {aRestaurer !== null && (
        <div className={styles.confirmation} role="alert">
          {aRestaurer.statut === 'illisible'
            ? <p className={styles.echec}>{aRestaurer.motif}</p>
            : (
              <>
                <p>
                  Cette sauvegarde contient <strong>{aRestaurer.resume.recettes}</strong> recette(s),
                  {' '}<strong>{aRestaurer.resume.depenses}</strong> dépense(s),
                  {' '}<strong>{aRestaurer.resume.missions}</strong> mission(s) et
                  {' '}<strong>{aRestaurer.resume.clients}</strong> client(s).
                </p>
                <p className={styles.explication}>
                  La restaurer <strong>remplace</strong> tout ce qui est actuellement
                  dans l’application. Les justificatifs déposés ne sont pas concernés&nbsp;:
                  ils vivent à part, et une sauvegarde JSON ne les contient pas.
                </p>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.actionPrincipale}
                    onClick={() => {
                      void adopter(aRestaurer.brut).then((refus) => {
                        signaler(refus ?? 'Sauvegarde restaurée.');
                        setARestaurer(null);
                      });
                    }}
                  >
                    Remplacer mes données par cette sauvegarde
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
        L’export contient tous les faits saisis, au format JSON. Les
        justificatifs n’y sont pas&nbsp;: ce sont des fichiers, conservés à part
        dans le navigateur. Les données de l’ancienne version restent en place
        et ne sont jamais effacées.
      </p>
    </div>
  );
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
    readonly brut: unknown;
    readonly resume: {
      readonly recettes: number; readonly depenses: number;
      readonly missions: number; readonly clients: number;
    };
  };

/**
 * Lit un fichier de sauvegarde sans rien écrire.
 *
 * La validation de fond — schéma trop récent, listes mal formées — appartient
 * à `adopterFaitsDistants`, qui la fait au moment d'adopter. Ici on ne vérifie
 * que ce qu'il faut pour ANNONCER le contenu : un fichier illisible doit se
 * dire tout de suite, pas après une confirmation.
 */
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
    brut,
    resume: {
      recettes: compter('recettes'),
      depenses: compter('depenses'),
      missions: compter('missions'),
      clients: compter('clients')
    }
  };
}
