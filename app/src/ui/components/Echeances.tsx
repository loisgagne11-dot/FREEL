import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { ajouterEcheances, enregistrerPaiement, modifierEcheance, supprimerEcheance } from '../../state/ecritures.echeances';
import type { Echeance, NatureDette } from '../../domain/calculs/provisions';
import { LIBELLE_NATURE, NATURES_DETTE } from '../../domain/calculs/provisions';
import { dateISO, euros } from '../../domain/types';
import type { DateISO, Euros } from '../../domain/types';
import { dateDuJour } from '../../state/selecteurs';
import { type Cadence, REPETITIONS_MAX, datesRepetees } from '../../domain/calculs/echeancier';
import { prelevementsDuSolde } from '../../domain/bareme/soldeImpot';
import { Info } from './Info';
import { Montant } from './Montant';
import { FormulairePaiement } from './FormulairePaiement';
import { Sheet } from './Sheet';
import { Statut, type TonStatut } from './Statut';
import { useToast } from './Toasts';
import { Vide } from './Vide';
import { CartePliable } from './CartePliable';
import { ConfirmationSurPlace } from './ConfirmationSurPlace';
import { dateCourte, eur, eurExact, moisLong } from '../format';
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

// Les libellés viennent du domaine : trois écrans nomment les mêmes dettes, et
// rien ne garantissait qu'ils les nomment pareil.
const NATURES: readonly { readonly id: NatureDette; readonly libelle: string }[] =
  NATURES_DETTE.map((id) => ({ id, libelle: LIBELLE_NATURE[id] }));

const LIBELLE: Readonly<Record<NatureDette, string>> = {
  urssaf: 'URSSAF', tva: 'TVA', impot: 'Impôt', cfe: 'CFE', cfp: 'CFP'
};

/** La nature dans une phrase : « l'appel de TVA », « l'échéance d'impôt ». */
const DE_NATURE: Readonly<Record<NatureDette, string>> = {
  urssaf: 'de cotisations URSSAF', tva: 'de TVA', impot: 'd’impôt', cfe: 'de CFE', cfp: 'de CFP'
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
            estimées juste au-dessus, dans «&nbsp;charges sur recettes
            encaissées&nbsp;». Saisir les deux compterait deux fois la même
            somme&nbsp;; c’est «&nbsp;marquer la période déclarée&nbsp;» qui
            fait passer l’une dans l’autre.
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
                ? 'Paiement enregistré. L’échéance sort des provisions.'
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
                  ? 'Échéance enregistrée. Elle entre dans les provisions.'
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
                  {' '}sera oublié&nbsp;: l’échéance redevient due, et revient dans les provisions.
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
 */
function statutDe(
  e: Echeance, jour: string
): { readonly libelle: string; readonly ton: TonStatut } {
  if (e.payeeLe !== null) return { libelle: 'Payée', ton: 'ok' };
  if (jour > e.echeanceLe) return { libelle: 'En retard', ton: 'retard' };
  return { libelle: 'À payer', ton: 'attente' };
}

/**
 * Ce que la suppression d'une échéance change — selon qu'elle est payée.
 *
 * Non payée, elle est l'appel que les provisions retiennent : la supprimer
 * les fait baisser d'autant, et le versable monte — à ne faire que pour une
 * saisie en double ou erronée. Payée, elle n'est plus provisionnée, mais son
 * paiement disparaît avec elle : la sortie quitte le flux de son mois, et pour
 * la TVA et l'impôt, ce qui était réglé ne l'est plus — la provision remonte.
 */
function ConsequenceSuppression({ echeance: e }: { readonly echeance: Echeance }) {
  const libelle = DE_NATURE[e.nature];
  if (e.payeeLe === null) {
    return (
      <>
        L’appel {libelle} de <Montant>{eur(e.montant)}</Montant> du
        {' '}{dateCourte(e.echeanceLe)} quitte l’échéancier et les provisions&nbsp;:
        ce que tu peux te verser monte d’autant. À ne faire que pour une saisie
        en double ou erronée.
      </>
    );
  }
  const regle = e.nature === 'tva' || e.nature === 'impot';
  return (
    <>
      L’échéance {libelle} du {dateCourte(e.echeanceLe)} quitte l’échéancier,
      avec son paiement du {dateCourte(e.payeeLe)}&nbsp;: il ne comptera plus
      dans les sorties de son mois
      {regle && <>, ni dans ce qui est déjà réglé — la provision remontera d’autant</>}.
    </>
  );
}

type Champs = Omit<Echeance, 'id'>;

/**
 * L'année de revenus dont l'avis est le plus récent à la date du jour.
 *
 * La déclaration en ligne donne le montant dès mai ; avant, le dernier avis
 * reçu est celui de l'année d'avant. En mars 2027, l'avis en main est celui
 * des revenus 2025, pas 2026.
 */
function revenusDuDernierAvis(jour: DateISO): number {
  const annee = Number(jour.slice(0, 4));
  return Number(jour.slice(5, 7)) >= 5 ? annee - 1 : annee - 2;
}

function Formulaire(
  { initiale, aujourdhui, onValider, onSupprimer }: {
    readonly initiale: Echeance | null;
    readonly aujourdhui: DateISO;
    readonly onValider: (serie: readonly Champs[]) => void;
    readonly onSupprimer?: () => void;
  }
) {
  const id = useId();
  const [nature, setNature] = useState<NatureDette>(initiale?.nature ?? 'urssaf');
  // Un prélèvement d'impôt d'automne peut régler l'année en cours (acompte) ou
  // la précédente (solde de l'avis) : seule la personne qui tient l'avis le
  // sait, et c'est ce qui fait sortir le solde estimé des provisions.
  const [solde, setSolde] = useState(initiale?.exercice !== undefined);
  const [montant, setMontant] = useState(initiale === null ? '' : String(initiale.montant));
  const [date, setDate] = useState(initiale?.echeanceLe ?? '');
  // La répétition n'a de sens qu'à la création : corriger une échéance d'une
  // série ne doit pas en recréer une autre.
  const [cadence, setCadence] = useState<Cadence | 'aucune'>('aucune');
  const [repetitions, setRepetitions] = useState('4');
  const [revenus, setRevenus] = useState(() => revenusDuDernierAvis(aujourdhui));
  const [tardif, setTardif] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  /*
   * À la création, le solde se saisit tel qu'il est écrit sur l'avis : un
   * montant. Le découper en quatre, retrouver les dates et ne pas se tromper
   * d'exercice revenait à la personne, et une erreur d'exercice faisait passer
   * le solde pour un acompte — compté deux fois par la provision.
   */
  const depuisLAvis = initiale === null && nature === 'impot' && solde;
  const valeurSaisie = Number.parseFloat(montant.replace(',', '.'));
  const prelevements = depuisLAvis && Number.isFinite(valeurSaisie) && valeurSaisie > 0
    ? prelevementsDuSolde(euros(valeurSaisie), revenus + 1, tardif)
    : null;
  const nombre = prelevements !== null && prelevements.statut !== 'refuse' ? prelevements.valeur.length : null;

  function soumettre(evenement: React.FormEvent): void {
    evenement.preventDefault();
    const valeur = valeurSaisie;
    if (!Number.isFinite(valeur) || valeur <= 0) {
      setErreur('Le montant doit être un nombre supérieur à zéro.');
      return;
    }
    if (depuisLAvis) {
      if (prelevements === null || prelevements.statut === 'refuse') {
        setErreur(prelevements?.motif ?? 'Le solde de l’avis doit être un montant positif.');
        return;
      }
      setErreur(null);
      onValider(prelevements.valeur.map((p) => ({
        nature: 'impot', montant: p.montant, echeanceLe: p.date,
        payeeLe: null, montantPaye: null, exercice: revenus
      })));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // Sans date, l'échéance ne peut être rattachée à aucun mois : elle
      // n'apparaîtrait dans aucun flux, tout en pesant sur les provisions.
      setErreur('La date d’échéance est obligatoire : sans elle, la somme pèse sur les provisions sans apparaître dans aucun mois.');
      return;
    }
    setErreur(null);
    // Ni date de paiement ni montant débité à la création : une échéance naît
    // à payer. L'enregistrer déjà payée sans preuve serait le « statut sans
    // écriture » qu'on refuse par ailleurs — le paiement se saisit à part,
    // avec sa date et ce qui est réellement parti.
    const modele = {
      nature, montant: euros(valeur), payeeLe: null, montantPaye: null,
      exercice: nature === 'impot' && solde ? Number(date.slice(0, 4)) - 1 : undefined
    };

    if (initiale !== null || cadence === 'aucune') {
      onValider([{ ...modele, echeanceLe: dateISO(date) }]);
      return;
    }

    const n = Number.parseInt(repetitions, 10);
    onValider(
      datesRepetees(dateISO(date), cadence, Number.isFinite(n) ? n : 1)
        .map((echeanceLe) => ({ ...modele, echeanceLe }))
    );
  }

  return (
    /* `noValidate` : les champs restent `required` — c'est l'information que
       les lecteurs d'écran annoncent — mais la validation du navigateur cède
       la place à la nôtre. « Veuillez renseigner ce champ » ne dit pas
       pourquoi la date compte ; notre message, si. */
    <form className={styles.formulaire} onSubmit={soumettre} noValidate>
      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-nature`}>Nature</label>
        <select
          id={`${id}-nature`}
          className={styles.saisie}
          value={nature}
          onChange={(e) => setNature(e.target.value as NatureDette)}
        >
          {NATURES.map((n) => <option key={n.id} value={n.id}>{n.libelle}</option>)}
        </select>
      </p>

      {nature === 'impot' && (
        <p className={styles.champ}>
          <label className={styles.libelle} htmlFor={`${id}-regle`}>Ce qu’elle règle</label>
          <select
            id={`${id}-regle`}
            className={styles.saisie}
            value={solde ? 'solde' : 'acompte'}
            onChange={(e) => setSolde(e.target.value === 'solde')}
          >
            <option value="acompte">Un acompte de l’année (prélèvement à la source)</option>
            <option value="solde">
              {initiale === null
                ? 'Le solde d’une année passée (avis d’imposition)'
                : `Le solde de l’impôt ${/^\d{4}/.test(date) ? Number(date.slice(0, 4)) - 1 : 'de l’année précédente'} (avis d’imposition)`}
            </option>
          </select>
          <span className={styles.aide}>
            {solde
              ? <>À l’automne, le solde et les acomptes de l’année se prélèvent ensemble.
                Saisir le solde comme tel le fait sortir des provisions, où il était
                gardé estimé depuis le 1er janvier.</>
              : <>L’acompte des indépendants tombe le 15 de chaque mois — ou le 15
                février, mai, août et novembre au trimestre. La première année
                d’activité, il n’y en a pas&nbsp;: ils démarrent en septembre de
                l’année suivante, avec l’avis.</>}
          </span>
        </p>
      )}

      {depuisLAvis && (
        <p className={styles.champ}>
          <label className={styles.libelle} htmlFor={`${id}-revenus`}>Revenus de l’année</label>
          <select
            id={`${id}-revenus`}
            className={styles.saisie}
            value={revenus}
            onChange={(e) => setRevenus(Number(e.target.value))}
          >
            {[revenusDuDernierAvis(aujourdhui), revenusDuDernierAvis(aujourdhui) - 1].map((a) => (
              <option key={a} value={a}>{a} — avis reçu en {a + 1}</option>
            ))}
          </select>
        </p>
      )}

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-montant`}>
          {depuisLAvis ? 'Reste à payer sur l’avis (€)' : 'Montant appelé (€)'}
        </label>
        <input
          id={`${id}-montant`}
          inputMode="decimal"
          className={styles.saisie}
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          required
        />
        {depuisLAvis && (
          <span className={styles.aide}>
            Le montant total, une fois déduits les acomptes déjà prélevés&nbsp;: Freel
            le découpe selon la règle de l’administration.
          </span>
        )}
      </p>

      {depuisLAvis && (
        <>
          <p className={styles.case}>
            <input
              id={`${id}-tardif`}
              type="checkbox"
              checked={tardif}
              onChange={(e) => setTardif(e.target.checked)}
            />
            <label htmlFor={`${id}-tardif`}>Avis reçu tardivement, à l’automne</label>
          </p>
          <ApercuDuSolde prelevements={prelevements} revenus={revenus} />
        </>
      )}

      {!depuisLAvis && <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-date`}>Date d’échéance</label>
        <input
          id={`${id}-date`}
          type="date"
          className={styles.saisie}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </p>}

      {initiale === null && !depuisLAvis && (
        <>
          <p className={styles.champ}>
            <label className={styles.libelle} htmlFor={`${id}-cadence`}>Répéter</label>
            <select
              id={`${id}-cadence`}
              className={styles.saisie}
              value={cadence}
              onChange={(e) => setCadence(e.target.value as Cadence | 'aucune')}
            >
              <option value="aucune">Une seule échéance</option>
              <option value="mensuelle">Tous les mois</option>
              <option value="trimestrielle">Tous les trimestres</option>
            </select>
            <span className={styles.aide}>
              Un échéancier URSSAF est connu d’avance&nbsp;: autant le saisir en
              une fois. Chaque échéance créée reste ensuite <strong>modifiable
              indépendamment</strong> — un trimestre se régularise, un taux
              change, un mois se reporte.
            </span>
          </p>

          {cadence !== 'aucune' && (
            <p className={styles.champ}>
              <label className={styles.libelle} htmlFor={`${id}-repetitions`}>
                Combien d’échéances
              </label>
              <input
                id={`${id}-repetitions`}
                type="number"
                min={1}
                max={REPETITIONS_MAX}
                className={styles.saisie}
                value={repetitions}
                onChange={(e) => setRepetitions(e.target.value)}
              />
              <span className={styles.aide}>
                La première à la date ci-dessus, les suivantes espacées d’autant.
                Un quantième qui n’existe pas dans le mois visé — un 31 en
                février — est ramené au dernier jour.
              </span>
            </p>
          )}
        </>
      )}

      {erreur !== null && <p role="alert" className={styles.refus}>{erreur}</p>}

      <button type="submit" className={styles.actionPrincipale}>
        {initiale !== null
          ? 'Enregistrer la correction'
          : depuisLAvis
            ? nombre === 1 ? 'Enregistrer le prélèvement' : `Enregistrer les ${nombre ?? ''} prélèvements`.replace('  ', ' ')
          : cadence === 'aucune'
            ? 'Enregistrer l’échéance'
            : 'Enregistrer les échéances'}
      </button>

      {onSupprimer !== undefined && initiale !== null && (
        <ConfirmationSurPlace
          libelle="Supprimer cette échéance"
          classeDeclencheur={styles.supprimer}
          consequence={<ConsequenceSuppression echeance={initiale} />}
          libelleConfirmer="Supprimer l’échéance"
          onConfirmer={onSupprimer}
        />
      )}
    </form>
  );
}

/**
 * Ce que l'avis donnera, avant de l'enregistrer : le nombre de prélèvements,
 * leurs dates et leurs montants. Une série de quatre échéances créée sans
 * l'avoir vue serait une surprise à défaire une à une.
 */
function ApercuDuSolde(
  { prelevements, revenus }: {
    readonly prelevements: ReturnType<typeof prelevementsDuSolde> | null;
    readonly revenus: number;
  }
) {
  if (prelevements === null || prelevements.statut === 'refuse') {
    return (
      <p className={styles.apercu} aria-live="polite">
        Saisis le reste à payer de l’avis&nbsp;: les dates de prélèvement suivront.
      </p>
    );
  }
  const p = prelevements.valeur;
  return (
    <div className={styles.apercu} aria-live="polite">
      <p className={styles.apercuTitre}>
        {p.length === 1
          ? `Prélevé en une fois — jusqu’à 300 €, le solde ne s’étale pas`
          : `Prélevé en ${p.length} fois`}
        {` · impôt des revenus ${revenus}`}
      </p>
      <ul className={styles.apercuListe}>
        {p.map((x) => (
          <li key={x.date}>
            <span>{dateCourte(x.date)}</span>
            <Montant>{eurExact(x.montant)}</Montant>
          </li>
        ))}
      </ul>
      <p className={styles.aide}>
        {prelevements.statut === 'hypothese'
          ? `Freel n’a pas relevé les dates officielles de ${revenus + 1} : le 25 du mois, ou le jour ouvré suivant. Corrige-les d’après ton avis si elles diffèrent.`
          : 'Dates publiées par l’administration fiscale.'}
        {' '}Un prélèvement déjà passé se marque payé ensuite, avec ce qui est réellement parti.
      </p>
    </div>
  );
}
