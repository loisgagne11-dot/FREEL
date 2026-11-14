import { useState } from 'react';
import { useFaits } from '../../state/store';
import { VERSION_SCHEMA, motifRefusFaits } from '../../state/schema';
import { completerFaits } from '../../state/schema.migrations';
import {
  type ConfigSupabase, type InstantaneDistant, type Session, pousserFaits
} from '../../infra/supabase';
import {
  type EtatPrecedent, ETATS_GARDES, lireEtatPrecedent, listerEtatsPrecedents, sqlMemoireDuCompte
} from '../../infra/supabase.memoire';
import { ConfirmationSurPlace } from '../components/ConfirmationSurPlace';
import { AlerteSql } from './Compte.acces';
import styles from './Compte.module.css';

/**
 * « États précédents du compte » (lot 57).
 *
 * La liste se charge À LA DEMANDE : la relire à chaque ouverture de l'écran
 * ferait une requête de plus pour un geste qu'on fait rarement — et qu'on fait
 * précisément quand quelque chose a mal tourné, donc en le cherchant.
 */
export interface ProprietesEtatsPrecedents {
  readonly config: ConfigSupabase;
  readonly session: Session;
  /** L'état du compte lu ; `inconnu` interdit le retour : on ne sait pas ce qu'on recouvrirait. */
  readonly distant: InstantaneDistant | null | 'inconnu';
  readonly desactive: boolean;
  /** Le compte a changé, ou n'est plus celui qu'on croyait : le parent le reprend (`null` = à relire). */
  readonly onCompteModifie: (instantane: InstantaneDistant | null) => void;
}

type Liste =
  | { readonly phase: 'repos' }
  | { readonly phase: 'chargement' }
  | { readonly phase: 'non-installe' }
  | { readonly phase: 'erreur'; readonly motif: string }
  | { readonly phase: 'lue'; readonly etats: readonly EtatPrecedent[] };

const horodatage = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const quand = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : horodatage.format(d);
};

export function EtatsPrecedents(
  { config, session, distant, desactive, onCompteModifie }: ProprietesEtatsPrecedents
) {
  const adopterFaitsDistants = useFaits((e) => e.adopterFaitsDistants);
  const [liste, setListe] = useState<Liste>({ phase: 'repos' });
  const [enCours, setEnCours] = useState(false);
  const [bilan, setBilan] = useState<{ readonly echec: boolean; readonly texte: string } | null>(null);

  async function charger(): Promise<void> {
    setListe({ phase: 'chargement' });
    const r = await listerEtatsPrecedents(config, session);
    if (r.statut === 'non-installe') setListe({ phase: 'non-installe' });
    else if (r.statut === 'erreur') setListe({ phase: 'erreur', motif: r.motif });
    else setListe({ phase: 'lue', etats: r.valeur });
  }

  /**
   * Le compte D'ABORD, l'appareil ensuite.
   *
   * Dans l'ordre inverse, un compte qui a bougé entre-temps (un autre appareil
   * vient d'enregistrer) laisserait cet appareil revenu en arrière et le
   * compte non : deux vérités, et le prochain envoi trancherait au hasard.
   * Le compte refuse alors l'écriture, et rien n'a bougé nulle part. Les deux
   * remplacements gardent leur filet : le serveur archive l'état qu'on quitte
   * (il entre en tête de cette liste), l'appareil met le sien de côté (lot 1).
   */
  async function revenir(etat: EtatPrecedent): Promise<void> {
    if (distant === 'inconnu') return;
    setEnCours(true);
    setBilan(null);
    const echec = (texte: string): void => { setEnCours(false); setBilan({ echec: true, texte }); };

    const lu = await lireEtatPrecedent(config, session, etat.id);
    if (lu.statut === 'erreur') { echec(lu.motif); return; }
    if (lu.valeur === null) {
      echec('Cet état n’est plus sur le compte : la liste a été relue.');
      void charger();
      return;
    }
    // Un état écrit par une version plus récente est refusé AVANT toute
    // écriture : le charger effacerait au premier renvoi ce que ce code ne
    // sait pas lire.
    const motif = lu.valeur.schema > VERSION_SCHEMA
      ? 'Cet état a été écrit par une version plus récente de l’application : mets-la à jour pour y revenir.'
      : motifRefusFaits(lu.valeur.faits);
    if (motif !== null) { echec(motif); return; }
    const faits = completerFaits(lu.valeur.faits);

    const r = await pousserFaits(
      config, session, faits, VERSION_SCHEMA, distant === null ? null : distant.version
    );
    if (r.statut === 'erreur') { echec(r.motif); return; }
    if (r.statut === 'conflit') {
      onCompteModifie(r.distant);
      echec('Le compte a changé entre-temps — un autre appareil vient d’enregistrer. '
        + 'Rien n’a été modifié, ni sur le compte ni ici ; la liste est relue.');
      void charger();
      return;
    }
    onCompteModifie(r.instantane);
    const refus = await adopterFaitsDistants(faits);
    setEnCours(false);
    void charger();
    setBilan(refus === null
      ? {
        echec: false,
        texte: `Le compte et cet appareil sont revenus à l’état remplacé le ${quand(etat.remplaceLe)}. `
          + 'L’état que tu quittes est en tête de la liste ; celui de cet appareil est mis de côté dans Données.'
      }
      : {
        echec: true,
        texte: `Le compte est revenu à l’état remplacé le ${quand(etat.remplaceLe)}, mais cet appareil n’a pas pu suivre (${refus}). `
          + '« Charger le compte sur cet appareil » le rattrape.'
      });
  }

  return (
    <>
      <h3 className={styles.sousTitre}>États précédents du compte</h3>
      <p className={styles.explication}>
        À chaque enregistrement, le serveur garde l’état qu’il remplace — les
        {' '}{ETATS_GARDES} derniers. Ils protègent d’un <strong>écrasement par
        erreur</strong>&nbsp;: un appareil en retard qui enregistre par-dessus.
        Pas d’une session volée&nbsp;: qui peut tout effacer efface aussi ces
        états, et ce sont alors tes appareils qui gardent leur copie.
      </p>

      {liste.phase === 'repos' && (
        <button type="button" className={styles.action} disabled={desactive}
          onClick={() => void charger()}>
          Voir les états précédents
        </button>
      )}
      {liste.phase === 'chargement' && <p role="status" className={styles.consequence}>Lecture…</p>}
      {liste.phase === 'erreur' && <p role="alert" className={styles.echec}>{liste.motif}</p>}
      {liste.phase === 'non-installe' && (
        <AlerteSql
          titre="Le serveur ne garde pas encore les états précédents."
          consigne="Le script du projet n’a pas été exécuté depuis cette version. Copie ce SQL dans l’éditeur SQL du projet Supabase, exécute-le, puis rouvre cette liste — ou exécute « docs/supabase.sql » en entier."
          sql={sqlMemoireDuCompte()}
        />
      )}
      {liste.phase === 'lue' && liste.etats.length === 0 && (
        <p className={styles.consequence}>
          Aucun pour l’instant&nbsp;: le premier apparaîtra au prochain enregistrement.
        </p>
      )}
      {liste.phase === 'lue' && liste.etats.length > 0 && (
        <ul className={styles.operations} aria-label="États précédents du compte">
          {liste.etats.map((e) => (
            <li key={e.id} className={styles.operation}>
              <span>
                Remplacé le {quand(e.remplaceLe)}
                <span className={styles.consequence}> · enregistrement n°&nbsp;{e.version}</span>
              </span>
              {e.schema > VERSION_SCHEMA
                ? (
                  <p className={styles.consequence}>
                    Écrit par une version plus récente de l’application&nbsp;: mets-la à jour pour y revenir.
                  </p>
                )
                : (
                  <ConfirmationSurPlace
                    libelle="Revenir à cet état"
                    classeDeclencheur={styles.action}
                    desactive={desactive || enCours || distant === 'inconnu'}
                    consequence={(
                      <>
                        Le compte, puis cet appareil, reviendront à l’état
                        remplacé le {quand(e.remplaceLe)}. Rien ne se perd&nbsp;: l’état
                        actuel du compte rejoint cette liste, celui de cet
                        appareil est mis de côté dans Données.
                      </>
                    )}
                    libelleConfirmer="Revenir à cet état"
                    onConfirmer={() => void revenir(e)}
                  />
                )}
            </li>
          ))}
        </ul>
      )}
      {bilan !== null && (
        <p role={bilan.echec ? 'alert' : 'status'} className={bilan.echec ? styles.echec : styles.succes}>
          {bilan.texte}
        </p>
      )}
    </>
  );
}
