import { useId, useState } from 'react';
import type { Echeance, NatureDette } from '../../domain/calculs/provisions';
import { LIBELLE_NATURE, NATURES_DETTE } from '../../domain/calculs/provisions';
import { type DateISO, type Mois, dateISO, euros } from '../../domain/types';
import { type Cadence, REPETITIONS_MAX, datesRepetees } from '../../domain/calculs/echeancier';
import { type PeriodeUrssaf, periodeDuMois } from '../../domain/calculs/declarations';
import { prelevementsDuSolde } from '../../domain/bareme/soldeImpot';
import { useFaits } from '../../state/store';
import { ajouterEcheances, modifierEcheance, supprimerEcheance } from '../../state/ecritures.echeances';
import { ConfirmationSurPlace } from '../components/ConfirmationSurPlace';
import { useToast } from '../components/Toasts';
import { Montant } from '../components/Montant';
import { dateCourte, eur, eurExact } from '../format';
import styles from './Obligations.gestes.module.css';

/**
 * La saisie d'une échéance reçue — appel de cotisations, avis d'impôt, CFE —,
 * chargée au clic sur « + Saisir » ou « Corriger » : un formulaire de huit
 * champs n'a rien à faire dans le paquet d'un écran qu'on ouvre pour lire.
 *
 * Reprise telle quelle de la carte « Échéances reçues » (lot 53, 3c), avec
 * ce qu'elle savait faire : la répétition (douze au plus), le solde de
 * l'avis découpé selon la règle de l'administration — avis tardif compris,
 * avec son aperçu —, « ce qu'elle règle » pour l'impôt. Et une chose de plus :
 * la PÉRIODE qu'un appel URSSAF saisi à la main règle (schéma 25). Sans elle,
 * l'appel ne réglait aucune période, et la déclaration en créait un second.
 */

// Les libellés viennent du domaine : trois écrans nomment les mêmes dettes, et
// rien ne garantissait qu'ils les nomment pareil.
const NATURES: readonly { readonly id: NatureDette; readonly libelle: string }[] =
  NATURES_DETTE.map((id) => ({ id, libelle: LIBELLE_NATURE[id] }));

/** La nature dans une phrase : « l'appel de TVA », « l'échéance d'impôt ». */
const DE_NATURE: Readonly<Record<NatureDette, string>> = {
  urssaf: 'de cotisations URSSAF', tva: 'de TVA', impot: 'd’impôt', cfe: 'de CFE', cfp: 'de CFP'
};

export type ChampsEcheance = Omit<Echeance, 'id'>;

const ajouterMois = (m: string, n: number): Mois => {
  const total = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}` as Mois;
};

/**
 * Les périodes qu'un appel peut régler : quinze mois en arrière, trois en
 * avant — un appel arrive après sa période, une régularisation jusqu'à un an
 * plus tard.
 */
export function periodesProposees(periodicite: 'mensuel' | 'trimestriel', aujourdhui: DateISO): readonly PeriodeUrssaf[] {
  const vues = new Map<string, PeriodeUrssaf>();
  for (let k = -15; k <= 3; k++) {
    const p = periodeDuMois(ajouterMois(aujourdhui, k), periodicite, aujourdhui);
    vues.set(p.id, p);
  }
  return [...vues.values()].sort((a, b) => b.id.localeCompare(a.id));
}

/**
 * La période qu'un appel daté du `date` règle selon l'ancienne règle —
 * celle dont la limite tombe le même mois. Une SUGGESTION, que le champ
 * montre et que l'utilisateur change : le report au jour ouvré a rendu cette
 * règle ambiguë (avril et mai 2026 revendiquaient les mêmes appels de juin).
 */
export function periodeSuggeree(
  date: string, periodes: readonly PeriodeUrssaf[]
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return periodes.find((p) => p.limite.slice(0, 7) === date.slice(0, 7))?.id ?? null;
}

/**
 * Le panneau de saisie : le formulaire, et ce qu'il écrit. Le même pour
 * « + Saisir » en tête de liste, « Corriger » et « Saisis l'avis » d'un
 * dossier — trois portes, une écriture.
 */
export function PanneauSaisie(
  { initiale, prerempli, aujourdhui, onFermer }: {
    readonly initiale: Echeance | null;
    readonly prerempli?: Partial<ChampsEcheance> | undefined;
    readonly aujourdhui: DateISO;
    readonly onFermer: () => void;
  }
) {
  const signaler = useToast();
  return (
    <SaisieEcheance
      initiale={initiale}
      aujourdhui={aujourdhui}
      {...(prerempli === undefined ? {} : { prerempli })}
      onValider={(serie) => {
        if (initiale !== null) {
          modifierEcheance(initiale.id, serie[0] as ChampsEcheance);
          signaler('Échéance corrigée.');
        } else {
          const n = ajouterEcheances(serie);
          signaler(n === 1
            ? 'Échéance enregistrée. Elle entre dans le dû.'
            : `${n} échéances enregistrées. Chacune se corrige séparément.`);
        }
        onFermer();
      }}
      {...(initiale === null ? {} : {
        onSupprimer: () => {
          supprimerEcheance(initiale.id);
          signaler('Échéance supprimée.');
          onFermer();
        }
      })}
    />
  );
}

/**
 * Ce que la suppression d'une échéance change — selon qu'elle est payée.
 *
 * Non payée, elle est l'appel que le dû retient : la supprimer le fait
 * baisser d'autant, et l'« à te verser » monte — à ne faire que pour une
 * saisie en double ou erronée. Payée, elle n'est plus dans le dû, mais son
 * paiement disparaît avec elle : la sortie quitte le flux de son mois, et pour
 * la TVA et l'impôt, ce qui était réglé ne l'est plus — le dû remonte.
 */
export function ConsequenceSuppression({ echeance: e }: { readonly echeance: Echeance }) {
  const libelle = DE_NATURE[e.nature];
  if (e.payeeLe === null) {
    return (
      <>
        L’appel {libelle} de <Montant>{eur(e.montant)}</Montant> du
        {' '}{dateCourte(e.echeanceLe)} quitte l’échéancier et le dû&nbsp;:
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
      {regle && <>, ni dans ce qui est déjà réglé — le dû remontera d’autant</>}.
    </>
  );
}


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

export function SaisieEcheance(
  { initiale, aujourdhui, onValider, onSupprimer, prerempli }: {
    readonly initiale: Echeance | null;
    readonly aujourdhui: DateISO;
    readonly onValider: (serie: readonly ChampsEcheance[]) => void;
    readonly onSupprimer?: () => void;
    /** Ce qu'un dossier sait déjà : « Saisis l'avis » d'une CFE en pose la nature et la date. */
    readonly prerempli?: Partial<ChampsEcheance>;
  }
) {
  const id = useId();
  const periodicite = useFaits((e) => e.faits.entreprise.urssafPeriodicite);
  const [nature, setNature] = useState<NatureDette>(initiale?.nature ?? prerempli?.nature ?? 'urssaf');
  // Un prélèvement d'impôt d'automne peut régler l'année en cours (acompte) ou
  // la précédente (solde de l'avis) : seule la personne qui tient l'avis le
  // sait, et c'est ce qui fait sortir le solde estimé des provisions.
  const [solde, setSolde] = useState(initiale?.exercice !== undefined);
  const [montant, setMontant] = useState(
    initiale !== null ? String(initiale.montant) : prerempli?.montant === undefined ? '' : String(prerempli.montant)
  );
  const [date, setDate] = useState<string>(initiale?.echeanceLe ?? prerempli?.echeanceLe ?? '');
  const periodes = periodesProposees(periodicite, aujourdhui);
  // `undefined` : pas encore choisie — la suggestion suit la date. Un choix,
  // même « aucune », ne bouge plus.
  const [periodeChoisie, setPeriodeChoisie] = useState<string | null | undefined>(
    initiale !== null && initiale.periode !== undefined ? initiale.periode : prerempli?.periode
  );
  const periode = periodeChoisie === undefined ? periodeSuggeree(date, periodes) : periodeChoisie;
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
      setErreur('La date d’échéance est obligatoire : sans elle, la somme pèse sur le dû sans apparaître dans aucun mois.');
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
    const urssaf = nature === 'urssaf';

    if (initiale !== null || cadence === 'aucune') {
      onValider([{ ...modele, echeanceLe: dateISO(date), ...(urssaf ? { periode } : {}) }]);
      return;
    }

    // Une série d'appels règle une période chacun : la suggestion de chaque
    // date, la première prenant le choix fait à l'écran.
    const n = Number.parseInt(repetitions, 10);
    onValider(
      datesRepetees(dateISO(date), cadence, Number.isFinite(n) ? n : 1)
        .map((echeanceLe, i) => ({
          ...modele, echeanceLe,
          ...(urssaf ? { periode: i === 0 ? periode : periodeSuggeree(echeanceLe, periodesProposees(periodicite, echeanceLe)) } : {})
        }))
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
                Saisir le solde comme tel remplace, dans le dû, l’estimation
                gardée depuis le 1er janvier.</>
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

      {nature === 'urssaf' && (
        <p className={styles.champ}>
          <label className={styles.libelle} htmlFor={`${id}-periode`}>Période réglée</label>
          <select
            id={`${id}-periode`}
            className={styles.saisie}
            value={periode ?? ''}
            onChange={(e) => setPeriodeChoisie(e.target.value === '' ? null : e.target.value)}
          >
            <option value="">Aucune — une régularisation</option>
            {periode !== null && !periodes.some((p) => p.id === periode) && <option value={periode}>{periode}</option>}
            {periodes.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
          </select>
          <span className={styles.aide}>
            La période que cet appel règle&nbsp;: elle passe à «&nbsp;payée&nbsp;» quand il l’est, et sa
            déclaration n’en crée pas un second. Proposée d’après la date&nbsp;; change-la si l’appel en
            règle une autre.
          </span>
        </p>
      )}

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
