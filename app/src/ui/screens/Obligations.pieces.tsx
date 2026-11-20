import { Suspense, lazy, useMemo, useState } from 'react';
import type { DateISO } from '../../domain/types';
import { type EtatDePiece, NOM_DE_PIECE, type PieceAFournir } from '../../domain/calculs/pieces';
import { ECHEANCES_REGLEMENTAIRES, etatDesPieces } from '../../state/selecteurs.obligations';
import type { Faits } from '../../state/schema';
import { Statut, type TonStatut } from '../components/Statut';
import { jourMois } from './Obligations.lecture';
import styles from './Obligations.module.css';

/**
 * La saisie d'une pièce, au clic sur sa carte : une date, et ce qu'il en
 * dérive. Le formulaire n'a rien à faire dans le paquet de l'écran.
 */
const EditeurPiece = lazy(() => import('./Obligations.piece').then((m) => ({ default: m.EditeurPiece })));

/**
 * « Pièces à fournir à tes clients » : ce qu'un client ou un intermédiaire
 * demande avant de signer, et où chacune en est.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA GRILLE NE PRÉTEND PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La maquette disait l'avis SIRENE « ● À jour » : aucune durée de validité
 * officielle n'existe — c'est une photographie du répertoire. Il dit donc
 * « téléchargé le … » et « ○ Pas de validité » (décision 25). L'attestation
 * de vigilance ne porte aucune date de fin : le client la veut de moins de
 * six mois ; elle dit « obtenue le … », jamais « valable jusqu'au ». La
 * plateforme de facturation électronique est lue sur l'entreprise, là où
 * Réglages › Facturation l'enregistre : une copie ici divergerait.
 */
export function PiecesAFournir({ faits, aujourdhui }: { readonly faits: Faits; readonly aujourdhui: DateISO }) {
  const etats = useMemo(() => etatDesPieces(faits, aujourdhui), [faits, aujourdhui]);
  const [enCours, setEnCours] = useState<PieceAFournir['sorte'] | null>(null);
  const derniere = (sorte: PieceAFournir['sorte']) => etats
    .filter((x) => x.piece.sorte === sorte)
    .sort((a, b) => (a.piece.obtenueLe ?? '').localeCompare(b.piece.obtenueLe ?? ''))
    .at(-1) ?? null;
  const plateforme = faits.entreprise.plateformeAgreee;

  return (
    <section className={styles.carte} aria-labelledby="titre-pieces">
      <div className={styles.entete}>
        <h2 id="titre-pieces" className={styles.titreCarte}>Pièces à fournir à tes clients</h2>
        <span className={styles.indice}>Ce qu’un client ou un intermédiaire te demande avant de signer</span>
      </div>
      <ul className={styles.pieces}>
        {(['vigilance', 'rc_pro', 'sirene'] as const).map((sorte) => {
          const x = derniere(sorte);
          const lecture = lirePiece(sorte, x?.piece ?? null, x?.etat ?? null);
          return (
            <li key={sorte} className={styles.piece}>
              {enCours === sorte
                ? (
                  <>
                    <span className={styles.pieceNom}>{NOM_DE_PIECE[sorte]}</span>
                    <Suspense fallback={<p role="status" className={styles.vide}>Chargement…</p>}>
                      <EditeurPiece id={x?.piece.id} sorte={sorte} aujourdhui={aujourdhui} onFini={() => setEnCours(null)} />
                    </Suspense>
                  </>
                )
                : (
                  <button
                    type="button"
                    className={styles.pieceBouton}
                    aria-label={`${NOM_DE_PIECE[sorte]} — ${lecture.precision}, ${lecture.libelle}. Modifier`}
                    onClick={() => setEnCours(sorte)}
                  >
                    <span className={styles.pieceNom}>
                      {NOM_DE_PIECE[sorte]}
                      <small>{lecture.precision}</small>
                    </span>
                    <Statut libelle={lecture.libelle} ton={lecture.ton} />
                  </button>
                )}
            </li>
          );
        })}
        <li className={styles.piece}>
          <a
            className={styles.pieceBouton}
            href="#/reglages/facturation"
            aria-label={`Plateforme de facturation électronique — ${plateforme === null ? 'à inscrire' : `inscrite : ${plateforme.nom}`}. Modifier dans Réglages`}
          >
            <span className={styles.pieceNom}>
              Plateforme de facturation électronique
              <small>
                {plateforme === null
                  ? `Obligatoire au ${longue(RECEPTION)} pour recevoir`
                  : `${plateforme.nom}${plateforme.depuis === null ? '' : `, depuis le ${jourMois(plateforme.depuis)}`}`}
              </small>
            </span>
            {plateforme === null
              ? <Statut libelle="À inscrire" ton="attente" />
              : <Statut libelle="Inscrite" ton="ok" />}
          </a>
        </li>
      </ul>
    </section>
  );
}

const longue = (d: string): string => `${jourMois(d)} ${d.slice(0, 4)}`;

/** La date de la réception obligatoire : celle des échéances réglementaires, pas une copie. */
const RECEPTION = ECHEANCES_REGLEMENTAIRES.find((r) => r.id === 'facturation-electronique-reception')?.date ?? '';

/**
 * Ce qu'une carte dit d'une pièce : une précision datée, et un état — signe
 * et mot. Une pièce qu'on n'a pas n'est pas « en retard » : rien n'oblige à
 * l'avoir avant qu'un client la demande.
 */
export function lirePiece(
  sorte: PieceAFournir['sorte'], piece: PieceAFournir | null, etat: EtatDePiece | null
): { readonly precision: string; readonly libelle: string; readonly ton: TonStatut } {
  if (piece === null || etat === null || piece.obtenueLe === null) {
    return {
      precision: sorte === 'sirene' ? 'Pas encore téléchargé' : 'Pas encore enregistrée',
      libelle: sorte === 'sirene' ? 'À télécharger' : 'À obtenir',
      ton: 'neutre'
    };
  }
  if (sorte === 'sirene') {
    return { precision: `Téléchargé le ${longue(piece.obtenueLe)}`, libelle: 'Pas de validité', ton: 'neutre' };
  }
  const precision = sorte === 'vigilance'
    ? (piece.provisoire
      ? `Provisoire, obtenue le ${longue(piece.obtenueLe)} · vaut jusqu’à ta première échéance`
      : `Obtenue le ${longue(piece.obtenueLe)} · à refaire tous les six mois`)
    : etat.finValidite === null
      ? `Obtenue le ${longue(piece.obtenueLe)} · fin de garantie non saisie`
      : `Valable jusqu’au ${longue(etat.finValidite)}`;
  switch (etat.etat) {
    case 'a_jour': return { precision, libelle: 'À jour', ton: 'ok' };
    case 'a_renouveler': return { precision, libelle: 'À renouveler', ton: 'attente' };
    case 'expiree': return { precision, libelle: 'Expirée', ton: 'retard' };
    default: return { precision, libelle: 'Sans date de fin', ton: 'neutre' };
  }
}
