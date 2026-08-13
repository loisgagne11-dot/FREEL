import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { etatFacturier } from '../../state/selecteurs.facture';
import {
  LIBELLE_STATUT, type FactureSuivie, type StatutFacture
} from '../../domain/calculs/facturier';
import type { ModeReglement } from '../../domain/calculs/livreRecettes';
import {
  type Granularite, type Periode, periodeCourante
} from '../../domain/calculs/periode';
import { dateISO } from '../../domain/types';
import type { Recette } from '../../state/schema';
import { BarrePeriode } from './BarrePeriode';
import { Info } from './Info';
import { Montant } from './Montant';
import { Sheet } from './Sheet';
import { Statut, type TonStatut } from './Statut';
import { useToast } from './Toasts';
import { Vide } from './Vide';
import { dateCourte, eur } from '../format';
import styles from './Facturier.module.css';

/**
 * Le facturier — toutes les factures, et ce qu'on peut en faire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT, ET CE QUE ÇA COÛTAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'écran Facturer ne savait qu'ÉMETTRE. Les factures déjà émises n'étaient
 * visibles que dans Argent, réparties entre deux listes — les encaissements au
 * livre, les factures en attente juste en dessous — et aucune des deux ne
 * portait d'action.
 *
 * Le magasin savait pourtant encaisser une recette depuis le début. Personne
 * ne l'appelait. Conséquence : une facture émise ne pouvait JAMAIS passer en
 * encaissée. Le chiffre d'affaires encaissé restait donc figé, les provisions
 * calculées dessus étaient fausses, et la trésorerie disponible avec elles.
 *
 * Un bouton manquant ne se voit pas dans une capture d'écran ; il se voit au
 * bout d'un mois, quand les chiffres ne ressemblent plus à rien.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ENCAISSER N'EST PAS COCHER UNE CASE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La date ET le mode de règlement sont exigés ensemble : ce sont deux mentions
 * obligatoires du livre des recettes. L'ancienne application portait un champ
 * `status` qu'on passait à « payée » sans rien d'autre — le registre affichait
 * alors une facture réglée qu'aucune écriture ne prouvait.
 *
 * D'où le panneau plutôt qu'une case à cocher : il n'y a pas de geste en un
 * clic qui produise une écriture conforme.
 */

const TONS: Readonly<Record<StatutFacture, TonStatut>> = {
  brouillon: 'neutre',
  emise: 'attente',
  en_retard: 'retard',
  encaissee: 'ok',
  annulee: 'neutre',
  annulation: 'neutre'
};

const MODES: readonly { readonly id: ModeReglement; readonly libelle: string }[] = [
  { id: 'virement', libelle: 'Virement' },
  { id: 'carte', libelle: 'Carte' },
  { id: 'cheque', libelle: 'Chèque' },
  { id: 'especes', libelle: 'Espèces' },
  { id: 'autre', libelle: 'Autre' }
];

/** Les filtres proposés. « Tout » d'abord : c'est la vue par défaut. */
const FILTRES: readonly { readonly id: StatutFacture | 'tout'; readonly libelle: string }[] = [
  { id: 'tout', libelle: 'Tout' },
  { id: 'en_retard', libelle: 'En retard' },
  { id: 'emise', libelle: 'À encaisser' },
  { id: 'encaissee', libelle: 'Encaissées' },
  { id: 'brouillon', libelle: 'Brouillons' }
];

export function Facturier({ onNouvelle }: { readonly onNouvelle: () => void }) {
  const faits = useFaits((e) => e.faits);
  const encaisserRecette = useFaits((e) => e.encaisserRecette);
  const annulerRecette = useFaits((e) => e.annulerRecette);
  const supprimerBrouillon = useFaits((e) => e.supprimerBrouillon);
  const signaler = useToast();

  const [granularite, setGranularite] = useState<Granularite>('tout');
  const [decalage, setDecalage] = useState(0);
  const [filtre, setFiltre] = useState<StatutFacture | 'tout'>('tout');
  const [aEncaisser, setAEncaisser] = useState<FactureSuivie<Recette> | null>(null);
  const [refus, setRefus] = useState<string | null>(null);

  const periode: Periode = useMemo(
    () => periodeCourante(granularite, new Date(), decalage),
    [granularite, decalage]
  );
  const etat = useMemo(() => etatFacturier(faits, periode), [faits, periode]);

  const visibles = filtre === 'tout'
    ? etat.factures
    : etat.factures.filter((f) => f.statut === filtre);

  function encaisser(id: string, date: string, mode: ModeReglement): void {
    const motif = encaisserRecette(id, dateISO(date), mode);
    if (motif !== null) { setRefus(motif); return; }
    setAEncaisser(null);
    setRefus(null);
    // L'effet est invisible : la ligne quitte « à encaisser » pour rejoindre
    // le livre, dans un écran qu'on ne regarde pas.
    signaler('Règlement enregistré au livre des recettes.');
  }

  function annuler(f: FactureSuivie<Recette>): void {
    const motif = annulerRecette(f.recette.id);
    signaler(motif ?? `Avoir émis pour la facture ${f.recette.numero || 'sans numéro'}.`);
  }

  function jeter(f: FactureSuivie<Recette>): void {
    const motif = supprimerBrouillon(f.recette.id);
    signaler(motif ?? 'Brouillon supprimé, son numéro est de nouveau libre.');
  }

  return (
    <>
      <BarrePeriode
        periode={periode}
        onGranularite={(g) => { setGranularite(g); setDecalage(0); }}
        onDecaler={(pas) => setDecalage((d) => d + pas)}
      />

      <div className={styles.grille}>
        <Chiffre libelle="Reste à rentrer" valeur={eur(etat.resteARentrer)} />
        <Chiffre
          libelle="Dont en retard"
          valeur={eur(etat.enRetard)}
          ton={etat.enRetard > 0 ? 'alerte' : 'neutre'}
        />
        <Chiffre libelle="Encaissé sur la période" valeur={eur(etat.encaisse)} ton="accent" />
      </div>

      <section className={styles.carte} aria-labelledby="titre-facturier">
        <header className={styles.entete}>
          <h2 id="titre-facturier" className={styles.titreCarte}>
            Factures
            <Info libelle="Quelle date range les factures">
              Celle d’ÉMISSION — celle que porte le document, et celle qu’on a
              en tête en cherchant «&nbsp;la facture de juin&nbsp;». Filtrer sur
              l’encaissement ferait sortir de juin une facture émise en juin et
              réglée en août, alors que c’est justement celle qu’on cherche
              quand on relance. Les brouillons restent visibles quelle que soit
              la période&nbsp;: un brouillon caché est un brouillon oublié, et
              il retient un numéro.
            </Info>
          </h2>
          <button type="button" className={styles.actionPrincipale} onClick={onNouvelle}>
            Nouvelle facture
          </button>
        </header>

        <div className={styles.filtres} role="group" aria-label="Filtrer par état">
          {FILTRES.map((f) => {
            const n = f.id === 'tout' ? etat.factures.length : etat.parStatut[f.id];
            return (
              <button
                key={f.id}
                type="button"
                className={`${styles.filtre} ${filtre === f.id ? styles.filtreActif : ''}`}
                aria-pressed={filtre === f.id}
                onClick={() => setFiltre(f.id)}
              >
                {f.libelle}
                <span className={styles.compteur}>{n}</span>
              </button>
            );
          })}
        </div>

        {visibles.length === 0
          ? (
            /* Aucune action ici : « Nouvelle facture » est déjà dans l'en-tête
               de la carte, à deux centimètres. Deux boutons identiques dans le
               même cadre font hésiter sur ce qui les distingue. */
            <Vide
              message={filtre === 'tout'
                ? 'Aucune facture sur cette période. Émettez-en une, ou élargissez la période.'
                : 'Aucune facture dans cet état sur cette période.'}
            />
          )
          : (
            <ul className={styles.liste}>
              {visibles.map((f) => (
                <Ligne
                  key={f.recette.id}
                  facture={f}
                  onEncaisser={() => { setRefus(null); setAEncaisser(f); }}
                  onAnnuler={() => annuler(f)}
                  onJeter={() => jeter(f)}
                />
              ))}
            </ul>
          )}
      </section>

      <Sheet
        ouvert={aEncaisser !== null}
        titre="Enregistrer le règlement"
        onFermer={() => { setAEncaisser(null); setRefus(null); }}
      >
        {aEncaisser !== null && (
          <PanneauEncaissement
            facture={aEncaisser}
            refus={refus}
            onValider={(date, mode) => encaisser(aEncaisser.recette.id, date, mode)}
          />
        )}
      </Sheet>
    </>
  );
}

function Ligne(
  { facture, onEncaisser, onAnnuler, onJeter }: {
    readonly facture: FactureSuivie<Recette>;
    readonly onEncaisser: () => void;
    readonly onAnnuler: () => void;
    readonly onJeter: () => void;
  }
) {
  const { recette: r, statut, echeanceLe, joursDeRetard } = facture;

  return (
    <li className={styles.ligne}>
      <span className={styles.ligneTitre}>
        <span className={styles.ligneLibelle}>
          {r.libelle || 'Sans désignation'}
        </span>
        <span className={styles.ligneMontant}><Montant>{eur(r.montant)}</Montant></span>
      </span>

      <span className={styles.ligneMeta}>
        <Statut libelle={LIBELLE_STATUT[statut]} ton={TONS[statut]} />
        <span>{r.clientNom || 'Client non renseigné'}</span>
        <span aria-hidden="true">·</span>
        <span>{r.numero || 'Sans numéro'}</span>
        {r.emiseLe !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span>émise le {dateCourte(r.emiseLe)}</span>
          </>
        )}
        {r.encaisseeLe !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span>réglée le {dateCourte(r.encaisseeLe)}</span>
          </>
        )}
        {statut === 'en_retard' && echeanceLe !== null && (
          <>
            <span aria-hidden="true">·</span>
            {/* Le nombre de jours, pas seulement l'étiquette : « en retard »
                se relativise, « 43 jours » se relance. */}
            <span className={styles.retard}>
              {joursDeRetard} jour{joursDeRetard > 1 ? 's' : ''} de retard
            </span>
          </>
        )}
        {statut === 'emise' && echeanceLe !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span>échéance {dateCourte(echeanceLe)}</span>
          </>
        )}
      </span>

      <span className={styles.ligneActions}>
        {(statut === 'emise' || statut === 'en_retard') && (
          <button type="button" className={styles.actionLigne} onClick={onEncaisser}>
            Enregistrer le règlement
          </button>
        )}
        {/* Une facture émise ne se supprime pas : elle a circulé, et retirer
            son numéro laisserait un trou que le contrôle lit comme une
            facture escamotée. Elle s'annule par un avoir. */}
        {(statut === 'emise' || statut === 'en_retard' || statut === 'encaissee') && (
          <button type="button" className={styles.actionSecondaire} onClick={onAnnuler}>
            Annuler par un avoir
          </button>
        )}
        {statut === 'brouillon' && (
          <button type="button" className={styles.actionSecondaire} onClick={onJeter}>
            Supprimer le brouillon
          </button>
        )}
      </span>
    </li>
  );
}

function PanneauEncaissement(
  { facture, refus, onValider }: {
    readonly facture: FactureSuivie<Recette>;
    readonly refus: string | null;
    readonly onValider: (date: string, mode: ModeReglement) => void;
  }
) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<ModeReglement>('virement');
  const id = useId();

  return (
    <div className={styles.panneau}>
      <p className={styles.rappel}>
        {facture.recette.numero || 'Sans numéro'} — {facture.recette.clientNom || 'client non renseigné'}
        <strong className={styles.rappelMontant}>
          <Montant>{eur(facture.recette.montant)}</Montant>
        </strong>
      </p>

      {/* `htmlFor` explicite plutôt qu'un label enveloppant : l'aide fait
          partie du contenu du label, et l'envelopper collerait ses deux
          phrases au nom accessible du champ. */}
      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-date`}>Date d’encaissement</label>
        <input
          id={`${id}-date`}
          type="date"
          className={styles.saisie}
          value={date}
          aria-describedby={`${id}-date-aide`}
          onChange={(e) => setDate(e.target.value)}
        />
        <span id={`${id}-date-aide`} className={styles.aide}>
          La date où l’argent est arrivé, pas celle de la facture&nbsp;: en
          micro, le chiffre d’affaires se compte à l’encaissement.
        </span>
      </p>

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-mode`}>Mode de règlement</label>
        <select
          id={`${id}-mode`}
          className={styles.saisie}
          value={mode}
          aria-describedby={`${id}-mode-aide`}
          onChange={(e) => setMode(e.target.value as ModeReglement)}
        >
          {MODES.map((m) => <option key={m.id} value={m.id}>{m.libelle}</option>)}
        </select>
        <span id={`${id}-mode-aide`} className={styles.aide}>
          Mention obligatoire du livre des recettes. C’est elle qui manquait à
          l’ancienne application, et qui rendait son registre non conforme.
        </span>
      </p>

      {refus !== null && <p className={styles.refus} role="alert">{refus}</p>}

      <button
        type="button"
        className={styles.actionPrincipale}
        onClick={() => onValider(date, mode)}
      >
        Porter au livre des recettes
      </button>
    </div>
  );
}

function Chiffre(
  { libelle, valeur, ton = 'neutre' }: {
    readonly libelle: string;
    readonly valeur: string;
    readonly ton?: 'neutre' | 'accent' | 'alerte';
  }
) {
  return (
    <div className={`${styles.tuile} ${styles[ton]}`}>
      <span className={styles.tuileLibelle}>{libelle}</span>
      <strong className={styles.tuileValeur}><Montant>{valeur}</Montant></strong>
    </div>
  );
}
