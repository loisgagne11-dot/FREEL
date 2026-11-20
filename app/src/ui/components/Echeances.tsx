import { useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { ajouterEcheances, enregistrerPaiement, modifierEcheance, supprimerEcheance } from '../../state/ecritures.echeances';
import type { Echeance, NatureDette } from '../../domain/calculs/provisions';
import { euros } from '../../domain/types';
import type { DateISO, Euros } from '../../domain/types';
import { dateDuJour } from '../../state/selecteurs';
import { Info } from './Info';
import { Montant } from './Montant';
import { FormulairePaiement } from './FormulairePaiement';
import { Sheet } from './Sheet';
import { Statut, type TonStatut } from './Statut';
import { useToast } from './Toasts';
import { Vide } from './Vide';
import { CartePliable } from './CartePliable';
import { ConfirmationSurPlace } from './ConfirmationSurPlace';
import { dateCourte, eur, moisLong } from '../format';
import { type ChampsEcheance as Champs, SaisieEcheance as Formulaire } from '../screens/Obligations.saisie';
import styles from './Echeances.module.css';

/**
 * Les échéances émises — appels de cotisations, avis d'impôt, CFE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE SON ABSENCE COÛTAIT, ET DANS QUEL SENS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les provisions se tiennent en deux volets (D3) : ce qui a DÉJÀ été appelé,
 * et ce qui est dû sur des recettes encaissées mais pas encore déclaré. Le
 * premier volet se calculait sur une liste vide, parce qu'aucun écran ne
 * pouvait créer une échéance. Il valait donc zéro en permanence.
 *
 * L'erreur allait dans le sens dangereux : moins de provisions, donc plus de
 * disponible, donc plus de versable. L'application invitait à se verser de
 * l'argent qui était déjà dû. C'est exactement le mécanisme du rappel qu'on
 * ne peut plus payer — celui que cette application existe pour empêcher.
 *
 * Le flux du mois n'avait pas de sorties non plus, pour la même raison.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE ÉCHÉANCE EST UN FAIT, PAS UNE PRÉVISION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle existe parce qu'un appel est arrivé : un montant, une date, une nature.
 * C'est ce qui la distingue du volet 2, qui ESTIME une dette pas encore
 * appelée à partir des recettes encaissées. Les calculer toutes les deux
 * reviendrait à compter deux fois la même somme — et c'est précisément ce que
 * « marquer la période déclarée » évite.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE FRISE, PAS UNE LISTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ce qu'on vient chercher ici est une question de calendrier : « qu'est-ce qui
 * tombe, et quand ». Les échéances sont donc groupées PAR MOIS, avec le total
 * de chacun — c'est ce total qui dit si le mois passe ou non.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PAYER SE PROUVE PAR UNE DATE ET UN MONTANT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La première version portait une case « payée ». C'était exactement le défaut
 * reproché à l'ancienne application sur les factures : un statut qu'aucune
 * écriture ne prouve. On exige une date et un mode de règlement pour encaisser
 * une recette ; se contenter d'une case pour une échéance était incohérent.
 *
 * On enregistre donc la DATE du débit et le MONTANT réellement parti. Ce
 * dernier diffère plus souvent qu'on ne croit — régularisation de fin de
 * trimestre, changement de taux, majoration de retard — et l'écart n'est pas
 * une erreur à corriger : c'est lui qui explique un solde qui ne tombe pas
 * juste.
 *
 * Une échéance payée sort des provisions : l'argent a quitté le compte, donc
 * le solde bancaire la reflète déjà. L'y laisser retrancherait deux fois la
 * même somme du disponible. Mais elle reste dans la frise — c'est l'historique
 * de ce qui a été appelé, et il sert à vérifier le prochain appel.
 */

const LIBELLE: Readonly<Record<NatureDette, string>> = {
  urssaf: 'URSSAF', tva: 'TVA', impot: 'Impôt', cfe: 'CFE', cfp: 'CFP'
};

type Panneau =
  | { readonly type: 'ferme' }
  | { readonly type: 'saisie'; readonly id: string | null }
  | { readonly type: 'paiement'; readonly id: string };

export function Echeances({ aujourdhui = new Date() }: { readonly aujourdhui?: Date }) {
  const faits = useFaits((e) => e.faits);
  const ajouterSerie = ajouterEcheances;
  const modifier = modifierEcheance;
  const supprimer = supprimerEcheance;
  const signaler = useToast();

  const [panneau, setPanneau] = useState<Panneau>({ type: 'ferme' });

  const jour = dateDuJour(aujourdhui);
  const mois = useMemo(() => grouperParMois(faits.echeances), [faits.echeances]);
  const aPayer = faits.echeances.filter((e) => e.payeeLe === null);
  const total = euros(aPayer.reduce((s, e) => s + e.montant, 0));

  const enSaisie = panneau.type === 'saisie' && panneau.id !== null
    ? faits.echeances.find((e) => e.id === panneau.id) ?? null
    : null;
  const enPaiement = panneau.type === 'paiement'
    ? faits.echeances.find((e) => e.id === panneau.id) ?? null
    : null;

  /**
   * Ce que l'échéancier dit une fois replié.
   *
   * Le montant restant à payer, et la prochaine date. Ce sont les deux seules
   * questions qu'on se pose sans ouvrir la carte — et la date importe autant
   * que la somme : une échéance à trois jours et une à trois mois n'appellent
   * pas la même décision.
   */
  const prochaine = [...aPayer].sort((a, b) => a.echeanceLe.localeCompare(b.echeanceLe))[0];
  const resume = aPayer.length === 0
    ? 'Aucune échéance en attente de paiement.'
    : (
      <>
        <Montant>{eur(total)}</Montant> à payer
        {' sur '}{aPayer.length} échéance{aPayer.length > 1 ? 's' : ''}
        {prochaine !== undefined && <>{' · prochaine le '}{dateCourte(prochaine.echeanceLe)}</>}
      </>
    );

  return (
    <CartePliable
      id="echeancier"
      ecran="argent"
      resume={resume}
      actions={(
        <button
          type="button"
          className={styles.actionPrincipale}
          onClick={() => setPanneau({ type: 'saisie', id: null })}
        >
          Saisir une échéance
        </button>
      )}
      titre="Échéances reçues"
            aide={<Info libelle="Ce qu’il faut saisir ici">
            Les appels que tu as réellement reçus&nbsp;: échéancier URSSAF,
            avis d’impôt, CFE. Ce n’est pas une prévision — les cotisations dues
            sur des recettes encaissées mais pas encore déclarées sont déjà
            estimées dans le dû, à la ligne «&nbsp;charges sur recettes
            encaissées non déclarées&nbsp;» de Trésorerie. Saisir les deux compterait deux fois la même
            somme&nbsp;; c’est la déclaration de la période, dans
            «&nbsp;Périodes URSSAF&nbsp;», qui fait passer l’une dans l’autre —
            et qui crée son appel&nbsp;: ne le saisis pas une seconde fois ici.
          </Info>}
    >

      {mois.length === 0
        ? (
          <Vide
            message="Aucune échéance saisie. Tant qu’il n’y en a pas, la ligne « échéances
                     émises » reste à zéro — et le disponible est surestimé d’autant."
          />
        )
        : (
          <>
            <p className={styles.total}>
              <span>Reste à payer</span>
              <strong><Montant>{eur(total)}</Montant></strong>
            </p>

            {mois.map((m) => (
              <section key={m.mois} className={styles.mois}>
                <header className={styles.moisEntete}>
                  <h3 className={styles.moisTitre}>{moisLong(m.mois)}</h3>
                  <span className={styles.moisTotal}>
                    <Montant>{eur(m.restant)}</Montant>
                    {m.restant !== m.total && (
                      <span className={styles.moisPaye}>
                        {' '}sur <Montant>{eur(m.total)}</Montant>
                      </span>
                    )}
                  </span>
                </header>
                <ul className={styles.liste}>
                  {m.echeances.map((e) => (
                    <Ligne
                      key={e.id}
                      echeance={e}
                      jour={jour}
                      onPayer={() => setPanneau({ type: 'paiement', id: e.id })}
                      onDepayer={() => {
                        enregistrerPaiement(e.id, null, null);
                        signaler(`${LIBELLE[e.nature]} repassée à payer.`);
                      }}
                      onCorriger={() => setPanneau({ type: 'saisie', id: e.id })}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}

      <Sheet
        ouvert={panneau.type === 'paiement'}
        titre="Enregistrer le paiement"
        onFermer={() => setPanneau({ type: 'ferme' })}
      >
        {enPaiement !== null && (
          <PanneauPaiement
            echeance={enPaiement}
            onValider={(payeeLe, montantPaye) => {
              enregistrerPaiement(enPaiement.id, payeeLe, montantPaye);
              signaler(montantPaye === null
                ? 'Paiement enregistré. L’échéance sort du dû.'
                : 'Paiement enregistré, avec son écart au montant appelé.');
              setPanneau({ type: 'ferme' });
            }}
          />
        )}
      </Sheet>

      <Sheet
        ouvert={panneau.type === 'saisie'}
        titre={enSaisie === null ? 'Saisir une échéance' : 'Corriger l’échéance'}
        onFermer={() => setPanneau({ type: 'ferme' })}
      >
        {panneau.type === 'saisie' && (
          <Formulaire
            initiale={enSaisie}
            aujourdhui={jour}
            onValider={(serie) => {
              if (enSaisie !== null) {
                modifier(enSaisie.id, serie[0] as Champs);
                signaler('Échéance corrigée.');
              } else {
                const n = ajouterSerie(serie);
                signaler(n === 1
                  ? 'Échéance enregistrée. Elle entre dans le dû.'
                  : `${n} échéances enregistrées. Chacune se corrige séparément.`);
              }
              setPanneau({ type: 'ferme' });
            }}
            {...(enSaisie === null
              ? {}
              : {
                onSupprimer: () => {
                  supprimer(enSaisie.id);
                  signaler('Échéance supprimée.');
                  setPanneau({ type: 'ferme' });
                }
              })}
          />
        )}
      </Sheet>
    </CartePliable>
  );
}

function Ligne(
  { echeance, jour, onPayer, onDepayer, onCorriger }: {
    readonly echeance: Echeance;
    readonly jour: string;
    readonly onPayer: () => void;
    readonly onDepayer: () => void;
    readonly onCorriger: () => void;
  }
) {
  const etat = statutDe(echeance, jour);
  const payee = echeance.payeeLe !== null;
  const ecart = echeance.montantPaye === null
    ? 0
    : echeance.montantPaye - echeance.montant;

  return (
    <li className={styles.ligne}>
      <span className={styles.ligneTitre}>
        {/*
          * LA COULEUR FIXE PAR TYPE DE CHARGE.
          *
          * L'annexe du handoff nomme DEUX mécanismes structurants à conserver :
          * le pli à synthèse, et celui-ci — « une charge garde sa couleur
          * partout ». Les jetons existaient dans les quatre palettes et
          * n'étaient câblés nulle part : la nature d'une dette ne se lisait
          * qu'en toutes lettres.
          *
          * Un filet de 3 px, pas une pastille pleine : la couleur doit
          * identifier la charge sans entrer en concurrence avec le vert, l'ambre
          * et le rouge, qui codent l'ÉTAT. Deux systèmes de couleur sur la même
          * ligne, et aucun des deux ne se lit plus.
          *
          * Le libellé reste écrit : la couleur est un repère, jamais la seule
          * porteuse de l'information — c'est la règle pour qui ne la distingue
          * pas.
          */}
        <span className={styles.nature}>
          <span className={styles.teinte} data-charge={echeance.nature} aria-hidden="true" />
          <span className={styles.ligneLibelle}>{LIBELLE[echeance.nature]}</span>
        </span>
        <span className={styles.ligneMontant}>
          <Montant>{eur(echeance.montantPaye ?? echeance.montant)}</Montant>
        </span>
      </span>

      <span className={styles.ligneMeta}>
        <Statut libelle={etat.libelle} ton={etat.ton} />
        <span>échéance {dateCourte(echeance.echeanceLe)}</span>
        {payee && (
          <>
            <span aria-hidden="true">·</span>
            <span>payée le {dateCourte(echeance.payeeLe)}</span>
          </>
        )}
        {/* L'écart n'est pas une erreur à corriger : c'est lui qui explique un
            solde qui ne tombe pas juste. On le montre, signe compris. */}
        {ecart !== 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span className={styles.ecart}>
              {ecart > 0 ? '+' : '−'}<Montant>{eur(euros(Math.abs(ecart)))}</Montant>
              {' '}sur l’appel de <Montant>{eur(echeance.montant)}</Montant>
            </span>
          </>
        )}
      </span>

      <span className={styles.ligneActions}>
        {payee
          ? (
            /* Repasser à payer efface la date du débit et le montant
               réellement parti — l'écart compris, qui expliquait un solde.
               Rien ne les retrouve : confirmé. */
            <ConfirmationSurPlace
              libelle="Repasser à payer"
              precision={`${LIBELLE[echeance.nature]}, échéance le ${dateCourte(echeance.echeanceLe)}`}
              classeDeclencheur={styles.actionSecondaire}
              consequence={(
                <>
                  Le paiement du {dateCourte(echeance.payeeLe)}
                  {' '}(<Montant>{eur(echeance.montantPaye ?? echeance.montant)}</Montant>)
                  {' '}sera oublié&nbsp;: l’échéance redevient due, et revient dans le dû.
                </>
              )}
              libelleConfirmer="Repasser à payer"
              libelleGarder="Garder le paiement"
              onConfirmer={onDepayer}
            />
          )
          : (
            <button type="button" className={styles.actionLigne} onClick={onPayer}>
              Enregistrer le paiement
            </button>
          )}
        <button type="button" className={styles.actionSecondaire} onClick={onCorriger}>
          Corriger
        </button>
      </span>
    </li>
  );
}

/**
 * Le paiement : sa date, et ce qui est réellement parti.
 *
 * Le montant est prérempli à celui appelé — le cas ordinaire — mais reste
 * modifiable, parce que le cas ordinaire n'est pas le seul : une
 * régularisation de fin de trimestre, un changement de taux ou une majoration
 * de retard font partir autre chose.
 */
/** Le rappel de l'appel, puis le formulaire partagé : voir `FormulairePaiement`. */
function PanneauPaiement(
  { echeance, onValider }: {
    readonly echeance: Echeance;
    readonly onValider: (payeeLe: DateISO, montantPaye: Euros | null) => void;
  }
) {
  return (
    <div className={styles.formulaire}>
      <p className={styles.rappel}>
        {LIBELLE[echeance.nature]} — appel du {dateCourte(echeance.echeanceLe)}
        <strong><Montant>{eur(echeance.montant)}</Montant></strong>
      </p>
      <FormulairePaiement
        avecAides
        montantAppele={echeance.montant}
        libelleValider="Enregistrer le paiement"
        onValider={onValider}
      />
    </div>
  );
}

/**
 * Les échéances groupées par mois, la plus proche en tête.
 *
 * Ce qu'on vient chercher est une question de calendrier — « qu'est-ce qui
 * tombe, et quand ». Le total du mois dit s'il passe ou non ; celui qui reste
 * à payer et celui appelé sont distingués, sans quoi un mois entièrement réglé
 * afficherait la même somme qu'un mois entièrement dû.
 */
function grouperParMois(echeances: readonly Echeance[]): readonly {
  readonly mois: string;
  readonly echeances: readonly Echeance[];
  readonly total: Euros;
  readonly restant: Euros;
}[] {
  const parMois = new Map<string, Echeance[]>();
  for (const e of echeances) {
    const m = e.echeanceLe.slice(0, 7);
    const liste = parMois.get(m);
    if (liste) liste.push(e); else parMois.set(m, [e]);
  }

  return [...parMois.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mois, liste]) => ({
      mois,
      echeances: [...liste].sort((a, b) => a.echeanceLe.localeCompare(b.echeanceLe)),
      total: euros(liste.reduce((s, e) => s + (e.montantPaye ?? e.montant), 0)),
      restant: euros(
        liste.filter((e) => e.payeeLe === null).reduce((s, e) => s + e.montant, 0)
      )
    }));
}

/**
 * Trois états, et ils ne se recouvrent pas.
 *
 * Le jour même de l'échéance, elle n'est pas en retard : on a la journée pour
 * payer. La marquer en retard ce jour-là ferait courir pour rien.
 *
 * Exporté pour le test d'accord avec les obligations (lot 53) : ce que cette
 * liste montre doit s'y retrouver, ligne pour ligne, avant qu'elle ne cède la
 * place à l'écran qui les lit.
 */
export function statutDe(
  e: Echeance, jour: string
): { readonly libelle: string; readonly ton: TonStatut } {
  if (e.payeeLe !== null) return { libelle: 'Payée', ton: 'ok' };
  if (jour > e.echeanceLe) return { libelle: 'En retard', ton: 'retard' };
  return { libelle: 'À payer', ton: 'attente' };
}

