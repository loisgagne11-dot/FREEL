import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import type { Echeance, NatureDette } from '../../domain/calculs/provisions';
import { LIBELLE_NATURE, NATURES_DETTE } from '../../domain/calculs/provisions';
import { dateISO, euros } from '../../domain/types';
import type { DateISO, Euros } from '../../domain/types';
import { type Cadence, REPETITIONS_MAX, datesRepetees } from '../../domain/calculs/echeancier';
import { Info } from './Info';
import { Montant } from './Montant';
import { Sheet } from './Sheet';
import { Statut, type TonStatut } from './Statut';
import { useToast } from './Toasts';
import { Vide } from './Vide';
import { CartePliable } from './CartePliable';
import { dateCourte, eur, moisLong } from '../format';
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

type Panneau =
  | { readonly type: 'ferme' }
  | { readonly type: 'saisie'; readonly id: string | null }
  | { readonly type: 'paiement'; readonly id: string };

export function Echeances({ aujourdhui = new Date() }: { readonly aujourdhui?: Date }) {
  const faits = useFaits((e) => e.faits);
  const ajouterSerie = useFaits((e) => e.ajouterEcheances);
  const modifier = useFaits((e) => e.modifierEcheance);
  const supprimer = useFaits((e) => e.supprimerEcheance);
  const enregistrerPaiement = useFaits((e) => e.enregistrerPaiement);
  const signaler = useToast();

  const [panneau, setPanneau] = useState<Panneau>({ type: 'ferme' });

  const jour = aujourdhui.toISOString().slice(0, 10);
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
      titre={(
        <>
          Échéances reçues
          <Info libelle="Ce qu’il faut saisir ici">
            Les appels que vous avez réellement reçus&nbsp;: échéancier URSSAF,
            avis d’impôt, CFE. Ce n’est pas une prévision — les cotisations dues
            sur des recettes encaissées mais pas encore déclarées sont déjà
            estimées juste au-dessus, dans «&nbsp;charges sur recettes
            encaissées&nbsp;». Saisir les deux compterait deux fois la même
            somme&nbsp;; c’est «&nbsp;marquer la période déclarée&nbsp;» qui
            fait passer l’une dans l’autre.
          </Info>
        </>
      )}
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
          <FormulairePaiement
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
            <button type="button" className={styles.actionSecondaire} onClick={onDepayer}>
              Repasser à payer
            </button>
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
function FormulairePaiement(
  { echeance, onValider }: {
    readonly echeance: Echeance;
    readonly onValider: (payeeLe: DateISO, montantPaye: Euros | null) => void;
  }
) {
  const id = useId();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [montant, setMontant] = useState(String(echeance.montant));
  const [erreur, setErreur] = useState<string | null>(null);

  function soumettre(evenement: React.FormEvent): void {
    evenement.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErreur('La date du débit est obligatoire : sans elle, on ne peut ni la '
        + 'rapprocher du relevé, ni savoir de quel mois la sortie relève.');
      return;
    }
    const valeur = Number.parseFloat(montant.replace(',', '.'));
    if (!Number.isFinite(valeur) || valeur <= 0) {
      setErreur('Le montant débité doit être un nombre supérieur à zéro.');
      return;
    }
    setErreur(null);
    // `null` quand les deux coïncident : ne stocker l'écart que lorsqu'il
    // existe évite de faire croire à une différence là où il n'y en a pas.
    onValider(dateISO(date), valeur === echeance.montant ? null : euros(valeur));
  }

  return (
    <form className={styles.formulaire} onSubmit={soumettre} noValidate>
      <p className={styles.rappel}>
        {LIBELLE[echeance.nature]} — appel du {dateCourte(echeance.echeanceLe)}
        <strong><Montant>{eur(echeance.montant)}</Montant></strong>
      </p>

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-date`}>Date du débit</label>
        <input
          id={`${id}-date`}
          type="date"
          className={styles.saisie}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <span className={styles.aide}>
          Celle du relevé, pas celle de l’échéance&nbsp;: c’est elle qui permet
          de rapprocher le paiement, et de savoir de quel mois la sortie relève.
        </span>
      </p>

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-montant`}>
          Montant réellement débité (€)
        </label>
        <input
          id={`${id}-montant`}
          inputMode="decimal"
          className={styles.saisie}
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
        />
        <span className={styles.aide}>
          Prérempli à l’appel. Modifiez-le s’il diffère — régularisation,
          changement de taux, majoration&nbsp;: l’écart est conservé, c’est lui
          qui explique un solde qui ne tombe pas juste.
        </span>
      </p>

      {erreur !== null && <p role="alert" className={styles.refus}>{erreur}</p>}

      <button type="submit" className={styles.actionPrincipale}>
        Enregistrer le paiement
      </button>
    </form>
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

type Champs = Omit<Echeance, 'id'>;

function Formulaire(
  { initiale, onValider, onSupprimer }: {
    readonly initiale: Echeance | null;
    readonly onValider: (serie: readonly Champs[]) => void;
    readonly onSupprimer?: () => void;
  }
) {
  const id = useId();
  const [nature, setNature] = useState<NatureDette>(initiale?.nature ?? 'urssaf');
  const [montant, setMontant] = useState(initiale === null ? '' : String(initiale.montant));
  const [date, setDate] = useState(initiale?.echeanceLe ?? '');
  // La répétition n'a de sens qu'à la création : corriger une échéance d'une
  // série ne doit pas en recréer une autre.
  const [cadence, setCadence] = useState<Cadence | 'aucune'>('aucune');
  const [repetitions, setRepetitions] = useState('4');
  const [erreur, setErreur] = useState<string | null>(null);

  function soumettre(evenement: React.FormEvent): void {
    evenement.preventDefault();
    const valeur = Number.parseFloat(montant.replace(',', '.'));
    if (!Number.isFinite(valeur) || valeur <= 0) {
      setErreur('Le montant doit être un nombre supérieur à zéro.');
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
    const modele = { nature, montant: euros(valeur), payeeLe: null, montantPaye: null };

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

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-montant`}>Montant appelé (€)</label>
        <input
          id={`${id}-montant`}
          inputMode="decimal"
          className={styles.saisie}
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          required
        />
      </p>

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-date`}>Date d’échéance</label>
        <input
          id={`${id}-date`}
          type="date"
          className={styles.saisie}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </p>

      {initiale === null && (
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
          : cadence === 'aucune'
            ? 'Enregistrer l’échéance'
            : 'Enregistrer les échéances'}
      </button>

      {onSupprimer !== undefined && (
        <button type="button" className={styles.supprimer} onClick={onSupprimer}>
          Supprimer cette échéance
        </button>
      )}
    </form>
  );
}
