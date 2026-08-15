import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { brouillonsDeFacture, etatFacturier } from '../../state/selecteurs.facture';
import {
  LIBELLE_STATUT, type FactureSuivie, type StatutFacture
} from '../../domain/calculs/facturier';
import type { ModeReglement } from '../../domain/calculs/livreRecettes';
import {
  type Granularite, type Periode, periodeCourante
} from '../../domain/calculs/periode';
import type { Mois } from '../../domain/types';
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
import { dateDuJour, moisCourant } from '../../state/selecteurs';
import { detteDeRetard, redigerRelance } from '../../domain/calculs/relance';
import {
  type BrouillonDeFacture, libelleDeLaFacture
} from '../../domain/calculs/brouillon';
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
  // « Envoyée » n'est pas « en attente » d'un geste de notre part : la balle
  // est chez le client. Le ton le dit.
  envoyee: 'attente',
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

/**
 * Combien de lignes on rend d'un coup.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE LISTE QU'ON NE PEUT PAS LIRE N'EST PAS UNE LISTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Trois ans d'activité font plus de quatre cents factures. Les rendre toutes
 * produit sept mille nœuds et près de neuf cents millisecondes avant
 * l'affichage — mesuré, pas supposé (`verifier:vitesse`). Et personne ne lit
 * quatre cents lignes : on cherche celles qui ne sont pas payées, ou celle
 * d'un mois précis, et les filtres sont là pour ça.
 *
 * Les TOTAUX, eux, restent calculés sur l'ensemble. Un « reste à rentrer » qui
 * ne compterait que les lignes affichées serait faux — et faux dans le sens
 * rassurant, le pire.
 */
const LIGNES_PAR_PAGE = 50;

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
  const consignerRelance = useFaits((e) => e.consignerRelance);
  const marquerEnvoyee = useFaits((e) => e.marquerEnvoyee);
  const signaler = useToast();

  const [granularite, setGranularite] = useState<Granularite>('tout');
  const [decalage, setDecalage] = useState(0);
  const [filtre, setFiltre] = useState<StatutFacture | 'tout'>('tout');
  const [aEncaisser, setAEncaisser] = useState<FactureSuivie<Recette> | null>(null);
  const [aRelancer, setARelancer] = useState<FactureSuivie<Recette> | null>(null);
  const [limite, setLimite] = useState(LIGNES_PAR_PAGE);
  const [refus, setRefus] = useState<string | null>(null);

  const periode: Periode = useMemo(
    () => periodeCourante(granularite, new Date(), decalage),
    [granularite, decalage]
  );
  const etat = useMemo(() => etatFacturier(faits, periode), [faits, periode]);

  const retenues = filtre === 'tout'
    ? etat.factures
    : etat.factures.filter((f) => f.statut === filtre);
  const visibles = retenues.slice(0, limite);
  const restantes = retenues.length - visibles.length;

  function encaisser(id: string, date: string, mode: ModeReglement): void {
    const motif = encaisserRecette(id, dateISO(date), mode);
    if (motif !== null) { setRefus(motif); return; }
    setAEncaisser(null);
    setRefus(null);
    // L'effet est invisible : la ligne quitte « à encaisser » pour rejoindre
    // le livre, dans un écran qu'on ne regarde pas.
    signaler('Règlement enregistré au livre des recettes.');
  }

  /**
   * Marque la facture envoyée, à la date du jour.
   *
   * La date du jour et non un formulaire : on clique en sortant du courriel,
   * et demander une date à ce moment-là ferait abandonner le geste — après
   * quoi plus rien ne distinguerait une facture partie d'une facture oubliée.
   * Le fait qui compte est qu'elle soit partie ; l'antidatage a ses limites,
   * mais l'absence d'information n'en a aucune.
   */
  function envoyer(f: FactureSuivie<Recette>): void {
    const motif = marquerEnvoyee(f.recette.id, dateDuJour());
    signaler(motif ?? `Facture ${f.recette.numero || 'sans numéro'} marquée envoyée.`);
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
        onGranularite={(g) => { setGranularite(g); setDecalage(0); setLimite(LIGNES_PAR_PAGE); }}
        onDecaler={(pas) => { setDecalage((d) => d + pas); setLimite(LIGNES_PAR_PAGE); }}
      />

      <BrouillonDuMois />

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
                onClick={() => { setFiltre(f.id); setLimite(LIGNES_PAR_PAGE); }}
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
                  onRelancer={() => setARelancer(f)}
                  onEnvoyer={() => envoyer(f)}
                />
              ))}
            </ul>
          )}

        {restantes > 0 && (
          <button
            type="button"
            className={styles.actionSecondaire}
            onClick={() => setLimite((n) => n + LIGNES_PAR_PAGE)}
          >
            Voir {Math.min(restantes, LIGNES_PAR_PAGE)} facture
            {Math.min(restantes, LIGNES_PAR_PAGE) > 1 ? 's' : ''} de plus
            {' '}({restantes} restante{restantes > 1 ? 's' : ''})
          </button>
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

      <Sheet
        ouvert={aRelancer !== null}
        titre="Relancer"
        onFermer={() => setARelancer(null)}
      >
        {aRelancer !== null && (
          <PanneauRelance
            facture={aRelancer}
            onConsigner={() => {
              consignerRelance(aRelancer.recette.id, dateISO(dateDuJour()));
              signaler('Relance consignée.');
              setARelancer(null);
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function Ligne(
  { facture, onEncaisser, onAnnuler, onJeter, onRelancer, onEnvoyer }: {
    readonly facture: FactureSuivie<Recette>;
    readonly onEncaisser: () => void;
    readonly onAnnuler: () => void;
    readonly onJeter: () => void;
    readonly onRelancer: () => void;
    readonly onEnvoyer: () => void;
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
        {/* La date d'envoi se lit à côté de celle d'émission : c'est l'écart
            entre les deux qui explique un client qui n'a rien reçu. */}
        {r.envoyeeLe != null && (
          <>
            <span aria-hidden="true">·</span>
            <span>envoyée le {dateCourte(r.envoyeeLe)}</span>
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
        {(statut === 'emise' || statut === 'envoyee') && echeanceLe !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span>échéance {dateCourte(echeanceLe)}</span>
          </>
        )}
      </span>

      <span className={styles.ligneActions}>
        {/* Le geste manquant : une facture pouvait être émise et réglée, mais
            jamais « partie ». On relançait donc des clients qui n'avaient rien
            reçu, et on ne savait pas répondre à « je ne l'ai jamais reçue ». */}
        {(statut === 'emise' || (statut === 'en_retard' && r.envoyeeLe == null)) && (
          <button type="button" className={styles.actionLigne} onClick={onEnvoyer}>
            Marquer envoyée
          </button>
        )}
        {(statut === 'emise' || statut === 'envoyee' || statut === 'en_retard') && (
          <button type="button" className={styles.actionLigne} onClick={onEncaisser}>
            Enregistrer le règlement
          </button>
        )}
        {/* L'application désignait déjà « précisément celle qu'il faut
            relancer » et ne proposait rien au bout. Relancer ne demande pas
            d'envoyer : cela demande de savoir quoi écrire, ce qu'on peut
            réclamer, et quand on l'a déjà fait. */}
        {statut === 'en_retard' && (
          <button type="button" className={styles.actionSecondaire} onClick={onRelancer}>
            Relancer
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

/**
 * Le panneau de relance.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'APPLICATION RÉDIGE, ELLE N'ENVOIE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle n'a aucun service d'expédition, et un envoi qu'elle ne saurait ni tracer
 * ni prouver ne vaudrait rien le jour où il faudrait démontrer qu'on a relancé.
 * Le texte se copie, part de la messagerie de l'utilisateur, et c'est LUI qui
 * consigne l'avoir envoyé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE TAUX SE SAISIT, IL NE SE DEVINE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le taux de pénalité est celui des conditions de vente. À défaut, le code
 * retient le taux BCE majoré de dix points, avec un plancher à trois fois
 * l'intérêt légal — deux valeurs semestrielles qu'aucune source automatisable
 * ne fournit. Sans lui, la relance RÉSERVE les pénalités au lieu de les
 * chiffrer : réclamer un montant calculé sur un taux supposé fragiliserait
 * précisément le document qu'on cherche à rendre solide.
 *
 * L'indemnité forfaitaire de 40 €, elle, est certaine, datée et sourcée : elle
 * s'affiche toujours.
 */
function PanneauRelance(
  { facture, onConsigner }: {
    readonly facture: FactureSuivie<Recette>;
    readonly onConsigner: () => void;
  }
) {
  const [tauxSaisi, setTauxSaisi] = useState('');
  const [copie, setCopie] = useState(false);
  const id = useId();

  const taux = tauxSaisi.trim() === '' ? null : Number(tauxSaisi.replace(',', '.'));
  const tauxValide = taux !== null && Number.isFinite(taux) && taux >= 0 ? taux / 100 : null;

  const relancesFaites = facture.recette.relancesLe?.length ?? 0;
  const echeance = facture.echeanceLe;

  // Sans échéance, il n'y a pas de retard à calculer — et le bouton « Relancer »
  // n'apparaît que sur une facture en retard, qui en a donc une.
  if (echeance === null) return <p>Cette facture n’a pas d’échéance.</p>;

  const dette = detteDeRetard(
    facture.recette.montant, echeance, dateISO(dateDuJour()), tauxValide
  );
  const brouillon = redigerRelance({
    numero: facture.recette.numero,
    montant: facture.recette.montant,
    echeanceLe: echeance,
    dette,
    relancesFaites
  });

  return (
    <div className={styles.relance}>
      <p className={styles.relanceEtat}>
        {relancesFaites === 0
          ? 'Jamais relancée.'
          : `${relancesFaites} relance${relancesFaites > 1 ? 's' : ''} — la dernière le `
            + `${dateCourte(facture.recette.relancesLe?.[relancesFaites - 1] as never)}.`}
        {' '}{dette.joursDeRetard} jour{dette.joursDeRetard > 1 ? 's' : ''} de retard.
      </p>

      <dl className={styles.relanceDus}>
        <div className={styles.ligne}>
          <dt>
            Indemnité forfaitaire
            <Info libelle="Ce qu’est l’indemnité forfaitaire">
              Due de plein droit entre professionnels, par facture en retard, quels
              que soient la durée du retard et le montant (article L441-10 du code
              de commerce). Elle n’a pas à être réclamée en justice, mais elle
              n’est exigible que si la facture l’annonce&nbsp;— ce que fait le
              document émis ici.
            </Info>
          </dt>
          <dd><Montant>{eur(dette.indemniteForfaitaire)}</Montant></dd>
        </div>
        <div className={styles.ligne}>
          <dt>Pénalités de retard</dt>
          <dd>
            {dette.penalites === null
              ? <span className={styles.relanceInconnu}>taux non renseigné</span>
              : <Montant>{eur(dette.penalites)}</Montant>}
          </dd>
        </div>
      </dl>

      <label className={styles.champ} htmlFor={`${id}-taux`}>
        <span className={styles.libelle}>Taux de pénalité de vos conditions de vente (%)</span>
        <input
          id={`${id}-taux`}
          type="text"
          inputMode="decimal"
          className={styles.saisie}
          value={tauxSaisi}
          onChange={(e) => setTauxSaisi(e.target.value)}
          placeholder="Laisser vide si vous ne le connaissez pas"
        />
      </label>

      <p className={styles.libelle}>Objet</p>
      <p className={styles.relanceObjet}>{brouillon.objet}</p>

      <p className={styles.libelle}>Message</p>
      <textarea className={styles.relanceCorps} readOnly value={brouillon.corps} rows={12} />

      <div className={styles.relanceActions}>
        <button
          type="button"
          className={styles.actionSecondaire}
          onClick={() => {
            // `clipboard` peut être absent ou refusé : la sélection manuelle
            // reste toujours possible, le texte est à l'écran.
            void navigator.clipboard?.writeText(brouillon.corps)
              .then(() => setCopie(true))
              .catch(() => setCopie(false));
          }}
        >
          {copie ? 'Copié' : 'Copier le message'}
        </button>
        {/* Consigner est un geste SÉPARÉ de la copie : on copie souvent pour
            relire, on ne relance qu'une fois. Les confondre ferait passer au
            ton suivant sans qu'un message soit parti. */}
        <button type="button" className={styles.actionLigne} onClick={onConsigner}>
          J’ai envoyé cette relance
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   La facture du mois, avant qu'elle existe
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Le brouillon de la facture du mois, qui n'a pas été demandé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IL SUIT L'ACTIVITÉ PARCE QU'IL N'EN EST PAS SÉPARÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Rien n'est stocké : le brouillon se recalcule à chaque lecture depuis le
 * planning, celui-là même qui produit le compte rendu et la prévision. Une
 * journée corrigée à l'Activité change la facture dans le même mouvement, non
 * par un mécanisme de mise à jour mais parce qu'il n'y a rien à mettre à jour.
 *
 * Émettre est le geste qui ENGAGE : à partir de là, la facture porte un
 * numéro, entre au registre, et ne bouge plus qu'à l'annulation. C'est
 * pourquoi c'est un bouton, et le seul de cette carte.
 */
function BrouillonDuMois() {
  const faits = useFaits((e) => e.faits);
  const ajouterRecette = useFaits((e) => e.ajouterRecette);
  const signaler = useToast();

  const [mois, setMois] = useState<Mois>(() => moisCourant());
  const brouillons = useMemo(() => brouillonsDeFacture(faits, mois), [faits, mois]);

  if (brouillons.length === 0) return null;

  function emettre(b: BrouillonDeFacture): void {
    ajouterRecette({
      clientNom: b.clientNom,
      libelle: libelleDeLaFacture(b),
      montant: b.total,
      emiseLe: dateDuJour(),
      encaisseeLe: null,
      modeReglement: null
    });
    signaler(`Facture émise pour ${b.clientNom}. Elle porte un numéro et entre au registre.`);
  }

  return (
    <section className={styles.carte} aria-labelledby="titre-brouillon">
      <header className={styles.entete}>
        <h2 id="titre-brouillon" className={styles.titreCarte}>
          La facture de {moisLisible(mois)}
          <Info libelle="D’où vient ce brouillon et pourquoi il bouge">
            Il n’est enregistré nulle part&nbsp;: il se recalcule depuis le
            <strong> planning</strong>, celui-là même qui produit le compte
            rendu d’activité. Corriger une journée à l’Activité corrige la
            facture dans le même mouvement — et garantit que le document et le
            compte rendu signé disent le même nombre de jours. Les journées
            valorisées sont celles <em>retenues</em>, ajustements compris&nbsp;:
            on facture ce qui a été fait.
          </Info>
        </h2>
        <div className={styles.navigationMois}>
          <button type="button" className={styles.pas}
            onClick={() => setMois(decalerMois(mois, -1))} aria-label="Mois précédent">
            ‹
          </button>
          <span className={styles.moisCourant} role="status" aria-label="Mois facturé">
            {moisLisible(mois)}
          </span>
          <button type="button" className={styles.pas}
            onClick={() => setMois(decalerMois(mois, 1))} aria-label="Mois suivant">
            ›
          </button>
        </div>
      </header>

      <ul className={styles.liste}>
        {brouillons.map((b) => (
          <li key={b.clientNom} className={styles.ligneBrouillon}>
            <div className={styles.brouillonTitre}>
              <span className={styles.brouillonClient}>{b.clientNom}</span>
              <span className={styles.brouillonTotal}>
                <Montant>{eur(b.total)}</Montant>
              </span>
            </div>

            <ul className={styles.brouillonLignes}>
              {b.lignes.map((l) => (
                <li key={`${l.missionId}-${l.entiteId}`}>
                  <span>{l.libelle}</span>
                  <span className={styles.brouillonDetail}>
                    {l.jours} j · <Montant>{eur(l.montant)}</Montant>
                  </span>
                </li>
              ))}
            </ul>

            {/* Le brouillon d'un client déjà facturé reste affiché, marqué.
                Le faire disparaître empêcherait de voir qu'on a facturé douze
                jours là où le planning en compte quatorze — l'écart qu'on veut
                constater avant que le client le constate. */}
            {b.dejaEmise === null
              ? (
                <button type="button" className={styles.actionPrincipale}
                  onClick={() => emettre(b)}>
                  Émettre cette facture
                </button>
              )
              : (
                <p className={styles.dejaEmise}>
                  Facture {b.dejaEmise} déjà émise pour {moisLisible(mois)}.
                  Ce brouillon reste affiché pour que l’écart se voie.
                </p>
              )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** « 2026-07 » → « juillet 2026 ». */
function moisLisible(m: Mois): string {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric', timeZone: 'UTC'
  });
}

function decalerMois(m: Mois, pas: number): Mois {
  const total = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) + pas;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}` as Mois;
}
