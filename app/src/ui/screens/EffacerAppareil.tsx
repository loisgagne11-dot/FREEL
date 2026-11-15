import { useState } from 'react';
import { useFaits } from '../../state/store';
import { stockageIndexedDB, type MetaJustificatif, type StockageJustificatifs } from '../../infra/justificatifs';
import { type BilanAppareil, basesDuNavigateur, effacerCetAppareil } from '../../infra/appareil';
import { lireDerniereArchive } from '../../infra/archive.derniere';
import { BlocConfirmation } from '../components/ConfirmationSurPlace';
import { creerArchiveComplete, motifEchecArchive } from './Config.donnees.archive';
import { dateCourte } from '../format';
import styles from './EffacerAppareil.module.css';

/**
 * « Effacer cet appareil » (lot 59, constat S7) : le panneau qui confirme,
 * efface et dit ce qu'il a relu.
 *
 * Le même geste sous deux noms : « Se déconnecter et effacer cet appareil »
 * dans Compte, « Effacer cet appareil » dans Données. Il déconnecte s'il y a
 * une session, puis retire de ce navigateur tout ce que Freel y garde, et le
 * prouve en relisant (`effacerCetAppareil`).
 *
 * Le bouton qui l'ouvre reste à l'appelant : posé à la place du bouton, dans
 * la colonne étroite d'une ligne de Données, le panneau s'y serait tassé.
 *
 * L'archive est proposée DANS la confirmation, pas dans un autre écran :
 * c'est le seul moment où l'on y pense, et le dernier où elle peut encore
 * contenir quelque chose.
 */
export interface ProprietesEffacerAppareil {
  /** Renoncer : l'appelant referme le panneau et rend le focus à son bouton. */
  readonly onGarder: () => void;
  /** Les pièces, si l'écran les a déjà lues : leur nombre se dit. */
  readonly metas?: readonly MetaJustificatif[] | null;
  readonly stockage?: StockageJustificatifs;
  readonly classes: {
    readonly action: string | undefined;
    readonly succes: string | undefined;
    readonly echec: string | undefined;
  };
}

type Phase =
  | { readonly etape: 'repos' }
  | { readonly etape: 'en-cours' }
  | { readonly etape: 'fait'; readonly bilan: BilanAppareil };

export function PanneauEffacerAppareil(
  { onGarder, metas = null, stockage = stockageIndexedDB(), classes }: ProprietesEffacerAppareil
) {
  const faits = useFaits((e) => e.faits);
  const [phase, setPhase] = useState<Phase>({ etape: 'repos' });
  const [archive, setArchive] = useState<{ readonly enCours: boolean; readonly texte: string | null; readonly echec: boolean }>(
    { enCours: false, texte: null, echec: false }
  );
  const derniere = lireDerniereArchive();

  async function archiver(): Promise<void> {
    setArchive({ enCours: true, texte: null, echec: false });
    try {
      const bilan = await creerArchiveComplete(faits, stockage);
      setArchive({ enCours: false, echec: false, texte: `Archive créée (${bilan.pieces} pièce${bilan.pieces > 1 ? 's' : ''}) : vérifie qu’elle est bien téléchargée avant d’effacer.` });
    } catch (e) {
      setArchive({ enCours: false, echec: true, texte: motifEchecArchive(e) });
    }
  }

  async function effacer(): Promise<void> {
    setPhase({ etape: 'en-cours' });
    // La session d'abord, côté serveur : effacée seulement ici, elle resterait
    // valable jusqu'à son terme pour qui l'aurait copiée. Un échec réseau
    // n'arrête pas l'effacement — le jeton expirera de lui-même.
    try {
      const { configEffective, lireSession, seDeconnecter } = await import('../../infra/supabase');
      const config = configEffective(window.localStorage);
      const session = lireSession(window.localStorage);
      if (config !== null && session !== null) await seDeconnecter(config, session);
    } catch { /* voir ci-dessus */ }
    const bilan = await effacerCetAppareil(window.localStorage, basesDuNavigateur());
    setPhase({ etape: 'fait', bilan });
  }

  if (phase.etape === 'en-cours') return <p role="status" className={classes.succes}>Effacement…</p>;

  if (phase.etape === 'fait') {
    const { clesRestantes, baseRestante } = phase.bilan;
    const complet = clesRestantes.length === 0 && baseRestante !== true;
    return (
      <div>
        <p role={complet ? 'status' : 'alert'} className={complet ? classes.succes : classes.echec}>
          {complet
            ? <>Effacé, puis relu&nbsp;: ce navigateur ne garde plus rien de Freel — ni données, ni pièces,
                ni session, ni réglages.{baseRestante === null && ' (Ce navigateur ne permet pas de relire la base des pièces ; sa suppression a été confirmée.)'}
                {' '}Les autres onglets de Freel se rechargent, vides.</>
            : <>L’effacement est incomplet&nbsp;:
                {clesRestantes.length > 0 && ` ${clesRestantes.length} réglage(s) restent (${clesRestantes.join(', ')}).`}
                {baseRestante === true && ' La base des pièces est encore là : ferme les autres onglets de Freel, puis recommence.'}</>}
        </p>
        <button type="button" className={classes.action}
          onClick={() => { window.location.replace(window.location.pathname); }}>
          Terminer
        </button>
      </div>
    );
  }

  const nbPieces = metas?.length ?? null;
  return (
    <>
      <BlocConfirmation
        consequence={(
          <>
            Retire de ce navigateur tout ce que Freel y garde&nbsp;: tes données,
            {nbPieces === 0 ? '' : nbPieces === null ? ' tes pièces,' : ` tes ${nbPieces} pièce${nbPieces > 1 ? 's' : ''},`}
            {' '}la session et les réglages — ceux de l’ancienne version compris.
            Ce qui est sur un compte relié n’est pas touché. Rien ne les ramène
            ici, sinon une archive&nbsp;: {derniere === null
              ? 'aucune n’a été faite depuis ce navigateur.'
              : `la dernière date du ${dateCourte(derniere.slice(0, 10))}.`}
            <span className={styles.archive}>
              <button type="button" className={classes.action} disabled={archive.enCours}
                onClick={() => { void archiver(); }}>
                {archive.enCours ? 'Archive en cours…' : 'Créer l’archive d’abord'}
              </button>
            </span>
          </>
        )}
        libelleConfirmer="Effacer cet appareil"
        onConfirmer={() => { void effacer(); }}
        onGarder={onGarder}
      />
      {archive.texte !== null && (
        <p role={archive.echec ? 'alert' : 'status'} className={archive.echec ? classes.echec : classes.succes}>
          {archive.texte}
        </p>
      )}
    </>
  );
}
