import { useId, useState } from 'react';
import { type DateISO, dateISO } from '../../domain/types';
import type { PieceAFournir } from '../../domain/calculs/pieces';
import { enregistrerPiece } from '../../state/ecritures.pieces';
import { etatDesPieces } from '../../state/selecteurs.obligations';
import { useFaits } from '../../state/store';
import { useToast } from '../components/Toasts';
import g from './Obligations.gestes.module.css';

/**
 * Une pièce à fournir, modifiée sur place : une date, et ce qu'il en dérive.
 *
 * Chaque sorte a sa règle, et c'est elle que l'aide dit au moment de la
 * saisie — une attestation de vigilance se juge à sa date d'obtention (le
 * client la veut de moins de six mois), une assurance à la fin de garantie
 * imprimée, l'avis SIRENE à rien du tout : aucune durée officielle, l'écran ne
 * dira jamais qu'il est « à jour ».
 */

export type SortePiece = PieceAFournir['sorte'];

export const NOM_PIECE: Readonly<Record<SortePiece, string>> = {
  vigilance: 'Attestation de vigilance URSSAF',
  rc_pro: 'Responsabilité civile professionnelle',
  sirene: 'Avis de situation au répertoire SIRENE',
  autre: 'Pièce à fournir'
};

const AIDE: Readonly<Record<SortePiece, string>> = {
  vigilance: 'Un client qui te confie 5 000 € ou plus doit te la demander à la signature, puis tous les six '
    + 'mois. Elle se télécharge dans ton espace Urssaf.',
  rc_pro: 'Aucune obligation générale : certaines professions y sont tenues, et des clients la demandent. '
    + 'La fin de garantie est celle de l’attestation de ton assureur.',
  sirene: 'L’avis de situation n’a aucune durée de validité officielle : c’est une photographie du '
    + 'répertoire, la veille du téléchargement. Un client peut en demander un récent.',
  autre: 'Ce qu’un client te demande d’autre, avec la date que la pièce porte.'
};

export function EditeurPiece(
  { id, sorte, aujourdhui, onFini }: {
    /** La pièce à modifier ; absente, elle est créée. */
    readonly id?: string | undefined;
    /** La sorte d'une pièce à créer. */
    readonly sorte?: SortePiece | undefined;
    readonly aujourdhui: DateISO;
    readonly onFini?: (() => void) | undefined;
  }
) {
  const faits = useFaits((e) => e.faits);
  const piece = faits.pieces.find((p) => p.id === id) ?? null;
  const s: SortePiece = piece?.sorte ?? sorte ?? 'autre';
  const etat = piece === null ? null : etatDesPieces(faits, aujourdhui).find((x) => x.piece.id === piece.id)?.etat ?? null;
  const champ = useId();
  const signaler = useToast();
  const [obtenueLe, setObtenueLe] = useState<string>(piece?.obtenueLe ?? '');
  const [valable, setValable] = useState<string>(piece?.valableJusquau ?? '');
  const [provisoire, setProvisoire] = useState(piece?.provisoire ?? false);
  const [erreur, setErreur] = useState<string | null>(null);
  const avecFin = s === 'rc_pro' || s === 'autre';

  function enregistrer(): void {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(obtenueLe) ? obtenueLe : null;
    if (date !== null && date > aujourdhui) {
      setErreur('Cette date n’est pas encore arrivée : on note une pièce reçue, pas attendue.');
      return;
    }
    const fin = avecFin && /^\d{4}-\d{2}-\d{2}$/.test(valable) ? valable : null;
    if (fin !== null && date !== null && fin < date) {
      setErreur('La fin de validité précède la date d’obtention.');
      return;
    }
    setErreur(null);
    enregistrerPiece({
      ...(piece === null ? {} : { id: piece.id }),
      sorte: s,
      libelle: piece?.libelle ?? NOM_PIECE[s],
      obtenueLe: date === null ? null : dateISO(date),
      valableJusquau: fin === null ? null : dateISO(fin),
      provisoire: s === 'vigilance' && provisoire
    });
    signaler(`${NOM_PIECE[s]} : enregistrée.`);
    onFini?.();
  }

  return (
    <div className={g.formulaire}>
      {etat?.finValidite !== null && etat?.finValidite !== undefined && (
        <p className={g.aide}>
          {etat.etat === 'expiree' ? 'Expirée depuis le ' : 'Vaut jusqu’au '}
          {new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
            .format(new Date(`${etat.finValidite}T12:00:00`))}.
        </p>
      )}
      <p className={g.champ}>
        <label className={g.libelle} htmlFor={`${champ}-obtenue`}>{s === 'sirene' ? 'Téléchargé le' : 'Obtenue le'}</label>
        <input id={`${champ}-obtenue`} type="date" className={g.saisie} value={obtenueLe} max={aujourdhui}
          onChange={(e) => setObtenueLe(e.target.value)} />
      </p>
      {avecFin && (
        <p className={g.champ}>
          <label className={g.libelle} htmlFor={`${champ}-fin`}>Valable jusqu’au</label>
          <input id={`${champ}-fin`} type="date" className={g.saisie} value={valable}
            onChange={(e) => setValable(e.target.value)} />
        </p>
      )}
      {s === 'vigilance' && (
        <p className={g.case}>
          <input id={`${champ}-provisoire`} type="checkbox" checked={provisoire}
            onChange={(e) => setProvisoire(e.target.checked)} />
          <label htmlFor={`${champ}-provisoire`}>
            Attestation provisoire de début d’activité
            <span className={g.aide}>Elle vaut jusqu’à ta première échéance URSSAF.</span>
          </label>
        </p>
      )}
      <p className={g.aide}>{AIDE[s]}</p>
      {erreur !== null && <p role="alert" className={g.refus}>{erreur}</p>}
      <div className={g.actions}>
        <button type="button" className={g.actionPrincipale} onClick={enregistrer}>Enregistrer</button>
        {onFini !== undefined && <button type="button" className={g.bouton} onClick={onFini}>Annuler</button>}
      </div>
    </div>
  );
}
