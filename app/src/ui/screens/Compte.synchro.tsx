import { useEffect, useId, useRef, useState } from 'react';
import { VERSION_SCHEMA, type Faits } from '../../state/schema';
import { completerFaits } from '../../state/schema.migrations';
import type { BaseSynchro } from '../../infra/synchro.appareil';
import type { EtatSynchroAppareil } from '../../infra/synchro.etat';
import { nomSauvegarde, telecharger } from '../../infra/telechargement';
import { dateDuJour } from '../../state/selecteurs';
import { quandSynchro } from '../synchro.affichage';
import styles from './Compte.module.css';

/**
 * Réglages › Compte, quand l'appareil se synchronise tout seul (lot 42) : la
 * phrase sous « Sauvegardé », et la carte « À choisir ».
 */

type Phase = EtatSynchroAppareil['phase'];

/**
 * « Dernière synchronisation à 9 h 41 », puis ce que l'état veut dire pour
 * la suite. L'heure en gras, comme la maquette : c'est la réponse à « est-ce
 * parti ? ». Elle vient de cet appareil (`BaseSynchro.le`) et non du compte :
 * l'heure écrite par un autre appareil dirait quand LUI a envoyé, pas quand
 * celui-ci s'est mis d'accord avec le compte.
 */
export function PhraseAutomatique({ etat, base }: { readonly etat: EtatSynchroAppareil; readonly base: BaseSynchro }) {
  const quand = quandSynchro(etat.phase === 'a-jour' ? etat.le : base.le);
  const suite: Readonly<Record<Phase, string>> = {
    inactif: 'Tes autres appareils reçoivent ce qui change ici à leur prochaine ouverture, ou quand tu y reviens.',
    'a-jour': 'Tes autres appareils reçoivent ce qui change ici à leur prochaine ouverture, ou quand tu y reviens.',
    envoi: 'Tes dernières modifications partent vers le compte.',
    'attente-saisie': 'Le compte a changé depuis un autre appareil : FREEL le prendra quand le formulaire '
      + 'ouvert sera fermé, pour ne rien changer sous tes doigts.',
    'hors-ligne': etat.phase === 'hors-ligne' && etat.aEnvoyer
      ? 'Hors ligne : tes modifications sont enregistrées ici et partiront au retour du réseau.'
      : 'Hors ligne : FREEL regardera le compte au retour du réseau.',
    'a-choisir': 'Cet appareil et le compte ont changé chacun de leur côté : choisis ci-dessus lequel garder.',
    erreur: `Le serveur n’a pas accepté la synchronisation${etat.phase === 'erreur' ? ` (${etat.motif})` : ''}. `
      + 'Nouvel essai dans quelques minutes ; rien n’est perdu ici.',
    reconnecter: 'La session a été refusée par le serveur. Tes données restent sur cet appareil, rien n’est '
      + 'perdu : « Me déconnecter », puis reconnecte-toi.',
    'mettre-a-jour': `Le compte a été enregistré par une version plus récente de FREEL (schéma `
      + `${etat.phase === 'mettre-a-jour' ? etat.schema : '?'}, connu ici : ${VERSION_SCHEMA}). Recharge la `
      + 'page pour mettre FREEL à jour : d’ici là, rien n’est envoyé ni reçu.',
    anomalie: etat.phase === 'anomalie' ? ANOMALIES[etat.pourquoi] : '',
    demonstration: 'Cet appareil montre la démonstration : rien n’est envoyé ni reçu. « Charger le compte sur '
      + 'cet appareil » reprend tes données.'
  };
  const alerte = ['a-choisir', 'erreur', 'reconnecter', 'mettre-a-jour', 'anomalie'].includes(etat.phase);
  return (
    <p className={alerte ? styles.avertissement : styles.explication}>
      Dernière synchronisation <strong>{quand.long}</strong>. {suite[etat.phase]}
    </p>
  );
}

const ANOMALIES: Readonly<Record<Extract<EtatSynchroAppareil, { phase: 'anomalie' }>['pourquoi'], string>> = {
  'compte-efface': 'Le compte ne contient plus rien : il a sans doute été effacé depuis un autre appareil. '
    + 'FREEL ne l’y remet pas tout seul : « Enregistrer cet appareil sur le compte » le fait, si c’est ce que '
    + 'tu veux.',
  'version-anterieure': 'Le compte est revenu à un état plus ancien que celui que cet appareil a vu — recréé, '
    + 'ou restauré ailleurs. FREEL n’envoie rien tout seul : choisis le sens ci-dessous.',
  'compte-illisible': 'Le contenu du compte ne se lit pas ici. FREEL n’y touche pas tout seul : « Enregistrer '
    + 'cet appareil sur le compte » le remplace, si c’est ce que tu veux.'
};

const resume = (f: Faits) => `${f.recettes.length} recette(s), ${f.depenses.length} dépense(s), ${f.clients.length} client(s)`;

/**
 * Les deux côtés ont changé depuis la dernière synchronisation — ou cet
 * appareil a été vidé. AUCUNE FUSION SILENCIEUSE : FREEL demande lequel
 * garder, avec les dates, et propose d'abord de télécharger celui qu'on
 * écarte. Les vingt états précédents du serveur restent le filet, et
 * l'appareil garde une copie de ce qu'il remplace.
 *
 * Les dates disent QUAND, pas QUI a raison : deux horloges d'appareils
 * divergent, et c'est pour cela que la décision revient à une personne.
 */
export function AChoisir(
  { etat, ici, desactive, onTrancher }: {
    readonly etat: Extract<EtatSynchroAppareil, { phase: 'a-choisir' }>;
    readonly ici: Faits;
    readonly desactive: boolean;
    readonly onTrancher: (choix: 'garder-ici' | 'prendre-compte') => Promise<void>;
  }
) {
  const id = useId();
  const [choix, setChoix] = useState<'garder-ici' | 'prendre-compte' | null>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  // La confirmation vient à l'écran, et le clavier avec elle : sur téléphone,
  // elle s'ouvrait sous le pli, et le geste semblait sans effet.
  useEffect(() => {
    if (choix === null) return;
    confirmation.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    confirmation.current?.focus({ preventScroll: true });
  }, [choix]);

  const compte = completerFaits(etat.distant.faits);
  const modifieIci = etat.modifieLe === null ? 'depuis la dernière synchronisation' : quandSynchro(etat.modifieLe).long;
  const modifieLaBas = etat.distant.majLe === null ? '' : ` ${quandSynchro(etat.distant.majLe).long}`;
  const vide = etat.pourquoi === 'appareil-vide';

  function telechargerEcartee(): void {
    if (choix === null) return;
    const jour = dateDuJour();
    // Garder ici écarte le COMPTE ; prendre le compte écarte CET APPAREIL. Le
    // fichier est une sauvegarde ordinaire : Données › « Choisir un fichier »
    // la restaure.
    if (choix === 'garder-ici') {
      telecharger(nomSauvegarde(`${ici.entreprise.nom} compte`, jour),
        JSON.stringify(etat.distant.faits, null, 2), 'application/json;charset=utf-8');
    } else {
      telecharger(nomSauvegarde(`${ici.entreprise.nom} appareil`, jour),
        JSON.stringify(ici, null, 2), 'application/json;charset=utf-8');
    }
  }

  return (
    <section className={styles.carte} aria-labelledby={`${id}-titre`}>
      <h3 id={`${id}-titre`} className={styles.titreCarte}>À choisir</h3>
      <p className={styles.avertissement}>
        {vide
          ? <>Cet appareil a été <strong>vidé</strong> {modifieIci}, et le compte porte encore tes données.</>
          : <>Cet appareil a été modifié <strong>{modifieIci}</strong>, le compte
            <strong>{modifieLaBas}</strong> depuis un autre appareil.</>}
        {' '}FREEL ne mélange pas les deux&nbsp;: choisis lequel garder.
      </p>
      <dl className={styles.detail}>
        <div className={styles.ligne}><dt>Cet appareil</dt><dd>{vide ? 'vide' : resume(ici)}</dd></div>
        <div className={styles.ligne}><dt>Le compte</dt><dd>{resume(compte)}</dd></div>
      </dl>

      {choix === null
        ? (
          <div className={styles.actions}>
            <button type="button" className={styles.actionPrincipale} disabled={desactive}
              onClick={() => setChoix('garder-ici')}>
              Garder ce que j’ai ici
            </button>
            <button type="button" className={styles.actionPrincipale} disabled={desactive}
              onClick={() => setChoix('prendre-compte')}>
              Prendre celui du compte
            </button>
          </div>
        )
        : (
          <div ref={confirmation} tabIndex={-1} className={styles.apercu} role="group"
            aria-label={choix === 'garder-ici' ? 'Garder ce que j’ai ici' : 'Prendre celui du compte'}>
            <p className={styles.consequence}>
              {choix === 'garder-ici'
                ? <>Le compte prendra ce qu’il y a sur cet appareil{vide ? <> : <strong>il sera vidé lui aussi</strong></> : null}.
                  Sa version actuelle part dans ses états précédents, d’où elle se récupère.</>
                : <>Cet appareil prendra ce qu’il y a sur le compte. Ce qu’il y a ici est mis de côté
                  dans Données, «&nbsp;Revenir à l’état d’avant&nbsp;».</>}
              {' '}Avant, garde une copie à toi de ce que tu écartes.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.action} onClick={telechargerEcartee}>
                Télécharger la version que tu écartes
              </button>
              <button type="button" className={`${styles.actionPrincipale} ${styles.actionVerte}`} disabled={desactive}
                onClick={() => { void onTrancher(choix).then(() => setChoix(null)); }}>
                {choix === 'garder-ici' ? 'Garder ce que j’ai ici' : 'Prendre celui du compte'}
              </button>
              <button type="button" className={styles.action} disabled={desactive} onClick={() => setChoix(null)}>
                Revenir
              </button>
            </div>
          </div>
        )}
    </section>
  );
}
