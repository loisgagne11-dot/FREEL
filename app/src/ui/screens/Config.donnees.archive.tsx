import { useState } from 'react';
import { useToast } from '../components/Toasts';
import type { Faits } from '../../state/schema';
import { dateDuJour } from '../../state/selecteurs';
import { ANNEES_CONSERVATION } from '../../domain/bareme/recettes';
import type { MetaJustificatif, StockageJustificatifs } from '../../infra/justificatifs';
import type { BilanArchive } from '../../infra/justificatifs.archive';
import { noterArchive, piecesNonArchivees } from '../../infra/archive.derniere';
import { telecharger } from '../../infra/telechargement';
import { ErreurArchive } from '../../infra/archive.zip';
import { dateCourte } from '../format';
import styles from './Config.module.css';

/**
 * L'archive complète : les faits ET les justificatifs, dans un seul fichier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE PASSE AVANT LA SAUVEGARDE JSON
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les pièces ne vivaient que dans ce navigateur : ni l'export JSON ni la
 * synchronisation ne les emportaient. Un navigateur réinitialisé, et six ans
 * de justificatifs disparaissaient sans qu'aucune sauvegarde les ait jamais
 * contenus. Le JSON reste — léger, réimportable —, mais c'est l'archive qui
 * protège ce qui ne se ressaisit pas.
 *
 * La ligne dit aussi QUAND l'archive a été faite pour la dernière fois, et
 * combien de pièces sont arrivées depuis : une sauvegarde à laquelle personne
 * ne pense ne protège rien.
 *
 * Le module d'archive est chargé au clic : il ne sert que ce jour-là.
 */
export function RangeeArchive(
  { faits, stockage, metas, derniere, onFaite }: {
    readonly faits: Faits;
    readonly stockage: StockageJustificatifs;
    /** `null` tant que les pièces ne sont pas lues, ou si elles ne se lisent pas. */
    readonly metas: readonly MetaJustificatif[] | null;
    /** Date de la dernière archive faite DEPUIS CE NAVIGATEUR, en ISO. */
    readonly derniere: string | null;
    readonly onFaite: () => void;
  }
) {
  const signaler = useToast();
  const [enCours, setEnCours] = useState(false);
  const [bilan, setBilan] = useState<BilanArchive | null>(null);
  const [echec, setEchec] = useState<string | null>(null);

  async function archiver(): Promise<void> {
    setEnCours(true);
    setEchec(null);
    let module: typeof import('../../infra/justificatifs.archive') | null = null;
    try {
      module = await import('../../infra/justificatifs.archive');
      const maintenant = new Date();
      const resultat = await module.construireArchive(faits, stockage, maintenant);
      telecharger(
        module.nomDeLArchive(faits.entreprise.nom, dateDuJour()), resultat.archive, 'application/zip'
      );
      noterArchive(maintenant);
      setBilan(resultat.bilan);
      signaler(`Archive créée : ${compte(resultat.bilan.pieces, 'justificatif')}.`);
      onFaite();
    } catch (e) {
      // Le motif d'une ErreurArchive est écrit pour l'utilisateur ; celui
      // d'une autre erreur (quota, navigateur) ne l'est pas, souvent en anglais.
      setEchec(e instanceof ErreurArchive
        ? e.message
        : 'L’archive n’a pas pu être créée. Réessaie ; si l’échec se répète, exporte au moins la sauvegarde JSON.');
    } finally {
      setEnCours(false);
    }
  }

  const nonArchivees = metas === null ? null : piecesNonArchivees(metas, derniere);
  const octets = metas?.reduce((total, m) => total + m.taille, 0) ?? 0;

  return (
    <li className={styles.rangee}>
      <div className={styles.rangeeTexte}>
        <span className={styles.rangeeTitre}>Archive complète (ZIP)</span>
        <span className={styles.rangeeAide}>
          Tes données et
          {metas === null || metas.length === 0
            ? ' tes justificatifs'
            : <> tes {compte(metas.length, 'justificatif')} ({taille(octets)})</>}
          {' '}dans un seul fichier, rangés par année&nbsp;: lisible sans l’application,
          à garder hors de ce navigateur. Les pièces se conservent au moins
          {' '}{ANNEES_CONSERVATION.valeur}&nbsp;ans.
        </span>
        <EtatDeLArchive metas={metas} derniere={derniere} nonArchivees={nonArchivees} />
        {bilan !== null && bilan.alterees + bilan.illisibles + bilan.orphelines > 0 && (
          <span className={styles.rangeeAide} role="alert">
            {bilan.alterees > 0 && <>{compte(bilan.alterees, 'pièce altérée', 'pièces altérées')} (le fichier a changé depuis son dépôt). </>}
            {bilan.illisibles > 0 && <>{compte(bilan.illisibles, 'pièce illisible', 'pièces illisibles')}, absente{bilan.illisibles > 1 ? 's' : ''} de l’archive. </>}
            {bilan.orphelines > 0 && <>{compte(bilan.orphelines, 'pièce sans fait rattaché', 'pièces sans fait rattaché')}, rangée{bilan.orphelines > 1 ? 's' : ''} dans «&nbsp;sans-fait&nbsp;». </>}
            Le détail est dans le manifeste de l’archive.
          </span>
        )}
        {echec !== null && <span className={styles.echec} role="alert">{echec}</span>}
      </div>
      <div className={styles.rangeeAction}>
        <button
          type="button"
          className={styles.action}
          aria-label="Créer l’archive complète (ZIP)"
          disabled={enCours}
          onClick={() => { void archiver(); }}
        >
          {enCours ? 'Archive en cours…' : 'Créer l’archive'}
        </button>
      </div>
    </li>
  );
}

/**
 * Où en est la protection des pièces, en une ligne.
 *
 * La date est celle de CE navigateur : une archive faite sur un autre
 * appareil ne contient pas les pièces déposées ici.
 */
function EtatDeLArchive(
  { metas, derniere, nonArchivees }: {
    readonly metas: readonly MetaJustificatif[] | null;
    readonly derniere: string | null;
    readonly nonArchivees: number | null;
  }
) {
  if (metas === null || nonArchivees === null) return null;
  if (metas.length === 0) {
    return (
      <span className={styles.rangeeAide}>
        Aucun justificatif déposé pour l’instant&nbsp;: l’archive contiendra tes données seules.
      </span>
    );
  }
  if (derniere === null) {
    return (
      <span className={styles.rangeeAlerte}>
        Jamais archivés depuis ce navigateur&nbsp;: tes justificatifs n’existent qu’ici.
      </span>
    );
  }
  const le = dateCourte(derniere.slice(0, 10));
  return nonArchivees > 0
    ? (
      <span className={styles.rangeeAlerte}>
        Dernière archive le {le} · {compte(nonArchivees, 'justificatif déposé', 'justificatifs déposés')} depuis.
      </span>
    )
    : <span className={styles.rangeeOk}>Dernière archive le {le}&nbsp;: tous tes justificatifs y sont.</span>;
}

/** « 1 justificatif », « 3 justificatifs ». */
function compte(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${n} ${n > 1 ? pluriel : singulier}`;
}

/** « 350 Ko », « 12,4 Mo » : l'ordre de grandeur suffit pour savoir où le ranger. */
function taille(octets: number): string {
  const nombre = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v);
  if (octets < 1024 * 1024) return `${nombre(Math.max(1, Math.round(octets / 1024)))} Ko`;
  return `${nombre(octets / (1024 * 1024))} Mo`;
}
