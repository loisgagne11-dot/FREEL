import { useState } from 'react';
import type { Creneau, Lieu, Portee, TypeDeSaisie } from '../../domain/calculs/planning';
import { LIEUX } from '../../domain/calculs/planning';
import type { JourDeLaSemaine } from '../../state/selecteurs.activite';
import { dateCourte } from '../format';
import styles from './EditeurDemiJournee.module.css';

/** Une mission et l'un de ses clients opérationnels. */
export interface Affectation {
  readonly missionId: string;
  readonly entiteId: string;
  readonly libelle: string;
  /** La teinte du client, pour retrouver dans la liste celle de la grille. */
  readonly couleur: string;
}

/** Ce que l'éditeur rend quand on enregistre. */
export interface SaisieDemiJournee {
  readonly portee: Portee;
  readonly type: TypeDeSaisie;
  /** Vides hors travail : personne ne reçoit un congé. */
  readonly missionId: string;
  readonly entiteId: string;
  readonly lieu: Lieu | null;
}

const NOM_PORTEE: Readonly<Record<Portee, string>> = {
  matin: 'Matin',
  apresMidi: 'Après-midi',
  journee: 'Journée'
};

const NOM_TYPE: Readonly<Record<TypeDeSaisie, string>> = {
  travail: 'Travail',
  conge: 'Congé',
  libre: 'Libre'
};

const NOM_LIEU: Readonly<Record<Lieu, string>> = {
  teletravail: 'Télétravail',
  sur_site: 'Sur site'
};

/**
 * L'éditeur d'une demi-journée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN CLIC, UNE QUESTION, TROIS RÉPONSES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La grille basculait le travail et rien d'autre : cliquer une moitié la
 * remplissait ou la vidait. Poser un congé demandait une SECONDE grille, en
 * dessous, avec son propre calendrier — deux trames du même mois, l'une pour
 * « qu'ai-je travaillé », l'autre pour « quand suis-je absent », et il fallait
 * quitter l'une pour agir sur l'autre.
 *
 * Le dessin ne fait qu'une grille : « Clique n'importe quelle demi-journée
 * pour l'attribuer, poser un congé ou la libérer ». Ce panneau est cette
 * phrase — et c'est lui qui a permis de retirer la seconde grille, dont
 * l'utilisateur a dit qu'elle ne servait à rien puisque la première fait tout.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ON GAGNE ET CE QU'ON PERD
 * ─────────────────────────────────────────────────────────────────────────
 *
 * On perd le clic unique qui basculait le travail : il faut maintenant
 * confirmer. On gagne le lieu, le choix du client, le congé à la
 * demi-journée — et surtout le geste qui DÉSATTRIBUE une moitié tenue par
 * deux clients à la fois, la seule façon de corriger une journée et demie
 * posée sur un seul vendredi.
 *
 * Le panneau s'ouvre PRÉ-REMPLI sur ce que la moitié porte déjà : enregistrer
 * sans rien toucher ne change rien. C'est ce qui rend le clic sûr — ouvrir par
 * erreur ne coûte qu'une fermeture.
 */
export function EditeurDemiJournee(
  { jour, creneauInitial, affectations, onEnregistrer, onAnnuler }: {
    readonly jour: JourDeLaSemaine;
    readonly creneauInitial: Creneau;
    readonly affectations: readonly Affectation[];
    readonly onEnregistrer: (saisie: SaisieDemiJournee) => void;
    readonly onAnnuler: () => void;
  }
) {
  const occupant = jour.creneaux
    .find((c) => c.creneau === creneauInitial)?.occupants[0];

  const [portee, setPortee] = useState<Portee>(creneauInitial);
  const [type, setType] = useState<TypeDeSaisie>(
    occupant !== undefined ? 'travail' : jour.conge > 0 ? 'conge' : 'travail'
  );
  const [affectation, setAffectation] = useState<string>(
    cle(occupant?.missionId ?? '', occupant?.entiteId ?? '')
  );
  // `null` et non un lieu par défaut : poser « télétravail » d'office
  // remplirait le plan de charge de journées à domicile que personne n'a
  // déclarées, indiscernables des vraies.
  const [lieu, setLieu] = useState<Lieu | null>(occupant?.lieu ?? null);

  const choisie = affectations.find((a) => cle(a.missionId, a.entiteId) === affectation)
    ?? affectations[0];

  // Rien à quoi rattacher du travail : le bouton existerait pour ne rien
  // faire. La journée reste posable en congé ou libérable.
  const travailPossible = affectations.length > 0;
  const typesOfferts: readonly TypeDeSaisie[] = travailPossible
    ? ['travail', 'conge', 'libre']
    : ['conge', 'libre'];

  function enregistrer(): void {
    const effectif: TypeDeSaisie = type === 'travail' && !travailPossible ? 'libre' : type;
    onEnregistrer({
      portee,
      type: effectif,
      missionId: effectif === 'travail' ? choisie?.missionId ?? '' : '',
      entiteId: effectif === 'travail' ? choisie?.entiteId ?? '' : '',
      lieu: effectif === 'travail' ? lieu : null
    });
  }

  return (
    <div className={styles.editeur}>
      <p className={styles.jour}>
        {dateCourte(jour.date)}
        {jour.ferie && <span className={styles.mention}> · jour férié</span>}
        {jour.weekEnd && <span className={styles.mention}> · week-end</span>}
      </p>

      {/* La PORTÉE d'abord : elle décide de ce que les réponses suivantes
          engagent. La poser après le type ferait relire tout le panneau pour
          savoir si « Congé » vaut pour la matinée ou pour la journée. */}
      <fieldset className={styles.groupe}>
        <legend className={styles.legende}>Ce que la saisie couvre</legend>
        <div className={styles.segments} role="group" aria-label="Portée de la saisie">
          {(['matin', 'apresMidi', 'journee'] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={`${styles.segment} ${portee === p ? styles.segmentActif : ''}`}
              aria-pressed={portee === p}
              onClick={() => setPortee(p)}
            >
              {NOM_PORTEE[p]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.groupe}>
        <legend className={styles.legende}>Type</legend>
        <div className={styles.types} role="group" aria-label="Type de demi-journée">
          {typesOfferts.map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.type} ${styles[t] ?? ''} ${type === t ? styles.typeActif : ''}`}
              aria-pressed={type === t}
              onClick={() => setType(t)}
            >
              {NOM_TYPE[t]}
            </button>
          ))}
        </div>
        {!travailPossible && (
          <p className={styles.aide}>
            Aucune mission active&nbsp;: il n’y a rien à quoi rattacher du
            travail. Crée une mission pour pouvoir attribuer cette demi-journée.
          </p>
        )}
      </fieldset>

      {type === 'travail' && travailPossible && (
        <>
          {/*
            * LE CLIENT SE CHOISIT, IL NE SE DEVINE PAS.
            *
            * Une première version prenait la première mission active en
            * silence. Une journée rattachée au mauvais client fausse DEUX
            * comptes rendus d'un coup — celui qui la reçoit à tort et celui à
            * qui elle manque — et rien ne le signale.
            */}
          <fieldset className={styles.groupe}>
            <legend className={styles.legende}>À qui</legend>
            <div className={styles.clients}>
              {affectations.map((a) => {
                const k = cle(a.missionId, a.entiteId);
                return (
                  <button
                    key={k}
                    type="button"
                    className={`${styles.client} ${affectation === k ? styles.clientActif : ''}`}
                    aria-pressed={affectation === k}
                    onClick={() => setAffectation(k)}
                  >
                    <span
                      className={styles.pastille}
                      {...(a.couleur !== '' ? { style: { background: a.couleur } } : {})}
                      aria-hidden="true"
                    />
                    {a.libelle}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* « Non précisé » est une RÉPONSE, pas l'absence de réponse : la
              part de télétravail se calcule sur les demi-journées documentées,
              et un lieu inventé la fausserait sans qu'on puisse le voir. */}
          <fieldset className={styles.groupe}>
            <legend className={styles.legende}>Où</legend>
            <div className={styles.segments} role="group" aria-label="Lieu">
              {LIEUX.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`${styles.segment} ${lieu === l ? styles.segmentActif : ''}`}
                  aria-pressed={lieu === l}
                  onClick={() => setLieu(l)}
                >
                  {NOM_LIEU[l]}
                </button>
              ))}
              <button
                type="button"
                className={`${styles.segment} ${lieu === null ? styles.segmentActif : ''}`}
                aria-pressed={lieu === null}
                onClick={() => setLieu(null)}
              >
                Non précisé
              </button>
            </div>
          </fieldset>
        </>
      )}

      <p className={styles.consequence} role="status">{consequence(portee, type)}</p>

      <div className={styles.pied}>
        <button type="button" className={styles.annuler} onClick={onAnnuler}>
          Annuler
        </button>
        <button type="button" className={styles.enregistrer} onClick={enregistrer}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}

/**
 * Ce que le geste va faire, écrit avant qu'on l'exécute.
 *
 * « Enregistrer » sur une grille qui recalcule tout ne dit pas ce qui va
 * changer. La conséquence la moins attendue est la libération : attribuer une
 * matinée à un client la RETIRE à celui qui la tenait, et c'est justement le
 * geste qui corrige une journée et demie — encore faut-il l'avoir voulu.
 */
function consequence(portee: Portee, type: TypeDeSaisie): string {
  const quoi = portee === 'journee' ? 'La journée' : `Le ${NOM_PORTEE[portee].toLowerCase()}`;
  if (type === 'travail') {
    return `${quoi} revient à ce client seul : toute autre mission qui l’occupait le rend.`;
  }
  if (type === 'conge') {
    return `${quoi} passe en congé et sort du dénominateur d’occupation.`;
  }
  return `${quoi} redevient libre : ni travail déclaré, ni congé.`;
}

/** L'identité d'une affectation dans une liste de boutons. */
const cle = (missionId: string, entiteId: string): string => `${missionId}·${entiteId}`;
