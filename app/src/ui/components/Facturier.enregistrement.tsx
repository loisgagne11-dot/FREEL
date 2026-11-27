import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { attacherJustificatifRecette, enregistrerFactureEmise } from '../../state/ecritures.recettes';
import { destinataireDe, emetteurDe } from '../../state/selecteurs.facture';
import { dateDuJour } from '../../state/selecteurs';
import { type BrouillonDeFacture, libelleDeLaFacture } from '../../domain/calculs/brouillon';
import { regimeDeLaFacture } from '../../domain/calculs/facture';
import { FORMULE_PAR_DEFAUT, echeanceDe } from '../../domain/calculs/delaiPaiement';
import { libelleDelai } from '../../domain/calculs/delaiPaiement.libelles';
import { dateISO, euros, type DateISO, type Mois } from '../../domain/types';
import {
  type StockageJustificatifs, deposerJustificatif, motifRefusFichier
} from '../../infra/justificatifs';
import { Montant } from './Montant';
import { eur, formaterJours, moisLong } from '../format';
import styles from './Facturier.module.css';

const TAUX = [
  { valeur: 0.20, libelle: '20 % — taux normal' },
  { valeur: 0.10, libelle: '10 % — taux intermédiaire' },
  { valeur: 0.055, libelle: '5,5 % — taux réduit' },
  { valeur: 0, libelle: 'Sans TVA' }
] as const;

type Envoi = 'meme_jour' | 'autre_jour' | 'pas_encore';

const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const FORME_MOIS = /^\d{4}-(0[1-9]|1[0-2])$/u;

/** « 2 880,5 » ou « 2880.50 » : la virgule de la saisie française comme le point. */
function lireMontant(t: string): number {
  const n = Number(t.replace(/\s/gu, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : Number.NaN;
}

/**
 * Le formulaire d'une facture émise dans un autre logiciel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PRÉREMPLI DEPUIS LE PLANNING, CORRIGEABLE PARTOUT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le client et le montant viennent du brouillon du mois — « la facture
 * correspondra toujours aux jours du planning » (22/11) —, mais ils restent
 * modifiables : c'est le document de Tiime qui fait foi, et FREEL recopie ce
 * qu'il porte. Ce qui ne se devine pas se saisit : le numéro, celui de Tiime,
 * et les dates. L'envoi se dit « le même jour » par défaut, parce que c'est
 * le cas courant quand on émet depuis un logiciel qui expédie lui-même.
 *
 * La pièce est contrôlée AVANT d'écrire la facture (`motifRefusFichier`, la
 * règle du dépôt) : un PDF refusé après coup laissait une facture sans pièce
 * que personne n'avait choisie.
 */
export function FormulaireFactureEmise(
  { brouillon, moisParDefaut, stockage, onFini }: {
    /** Le brouillon d'où l'on part, ou `null` pour une facture sans planning. */
    readonly brouillon: BrouillonDeFacture | null;
    readonly moisParDefaut: Mois;
    readonly stockage: StockageJustificatifs;
    /** Appelé une fois la facture enregistrée, avec la phrase à dire. */
    readonly onFini: (message: string) => void;
  }
) {
  const faits = useFaits((e) => e.faits);
  const id = useId();
  const aujourdhui = dateDuJour();

  const [clientNom, setClientNom] = useState(brouillon?.clientNom ?? '');
  const [montantSaisi, setMontantSaisi] = useState(
    brouillon === null ? '' : String(brouillon.total).replace('.', ',')
  );
  const [mois, setMois] = useState<string>(brouillon?.mois ?? moisParDefaut);
  const [numero, setNumero] = useState('');
  const [emiseLe, setEmiseLe] = useState<string>(aujourdhui);
  const [envoi, setEnvoi] = useState<Envoi>('meme_jour');
  const [envoyeeLe, setEnvoyeeLe] = useState<string>(aujourdhui);
  /* L'échéance suit la date d'émission tant qu'on ne l'a pas touchée : une
     fois corrigée, c'est celle du document, et elle ne bouge plus. */
  const [echeanceSaisie, setEcheanceSaisie] = useState<string | null>(null);
  const [taux, setTaux] = useState<number>(0.20);
  const [fichier, setFichier] = useState<File | null>(null);
  const [refusFichier, setRefusFichier] = useState<string | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const client = faits.clients.find((c) => c.nom === clientNom.trim());
  const formule = client?.delaiPaiement ?? FORMULE_PAR_DEFAUT;
  const echeanceCalculee = FORME_DATE.test(emiseLe) ? echeanceDe(dateISO(emiseLe), formule) : '';
  const echeance = echeanceSaisie ?? echeanceCalculee;

  /*
   * LA TVA SELON LE RÉGIME, ET NON UN TAUX PROPOSÉ À TOUS.
   *
   * En franchise, la facture n'en porte pas ; à un client d'un autre État de
   * l'Union qui a un numéro de TVA, elle est autoliquidée. Dans les deux cas
   * la proposer ferait recopier un montant que Tiime n'a pas facturé. Le
   * régime est le même que celui de la rédaction (`regimeDeLaFacture`) : deux
   * règles finiraient par ne plus s'accorder sur le même client.
   */
  const regime = useMemo(() => regimeDeLaFacture(
    emetteurDe(faits),
    client === undefined
      ? { nom: clientNom, adresse: '', siret: '', pays: '', tvaIntracom: '', delaiPaiement: FORMULE_PAR_DEFAUT }
      : destinataireDe(client)
  ), [faits, client, clientNom]);
  const tauxRetenu = regime === 'tva_francaise' ? taux : 0;
  const montant = lireMontant(montantSaisi);
  const tva = Number.isFinite(montant) ? Math.round(montant * tauxRetenu * 100) / 100 : Number.NaN;

  function choisirFichier(f: File | undefined): void {
    if (f === undefined) { setFichier(null); setRefusFichier(null); return; }
    const motif = motifRefusFichier({ typeMime: f.type, taille: f.size });
    setRefusFichier(motif);
    setFichier(motif === null ? f : null);
  }

  async function enregistrer(): Promise<void> {
    if (!FORME_MOIS.test(mois)) { setRefus('Indique le mois que la facture couvre.'); return; }
    if (!Number.isFinite(montant)) { setRefus('Le montant hors taxes n’est pas un nombre.'); return; }
    const libelle = brouillon !== null && brouillon.mois === mois
      ? libelleDeLaFacture(brouillon)
      : `Prestations — ${moisLong(mois)}`;
    const resultat = enregistrerFactureEmise({
      clientNom,
      libelle,
      montant: euros(montant),
      tvaCollectee: euros(tva),
      numero,
      emiseLe: emiseLe as DateISO,
      envoyeeLe: envoi === 'pas_encore' ? null : (envoi === 'meme_jour' ? emiseLe : envoyeeLe) as DateISO,
      echeanceLe: echeance as DateISO,
      moisFacture: mois as Mois
    });
    if ('motif' in resultat) { setRefus(resultat.motif); return; }
    setRefus(null);

    const dit = `Facture ${numero.trim()} enregistrée — aucun numéro de FREEL n’a été pris.`;
    if (fichier === null) { onFini(dit); return; }
    setEnCours(true);
    try {
      const depot = await deposerJustificatif(
        stockage,
        { nom: fichier.name, typeMime: fichier.type, contenu: fichier },
        { nature: 'recette', id: resultat.id }
      );
      if (depot.statut === 'depose') {
        attacherJustificatifRecette(resultat.id, depot.meta.id);
        onFini(`${dit} Son PDF est joint.`);
      } else {
        onFini(`${dit} Le PDF n’a pas été joint : ${depot.motif}`);
      }
    } catch {
      // La facture est au livre ; c'est le stockage des pièces qui a manqué.
      // Le dire, plutôt que de laisser croire la pièce conservée.
      onFini(`${dit} Le PDF n’a pas pu être conservé : joins-le depuis la liste.`);
    } finally {
      setEnCours(false);
    }
  }

  return (
    /* `noValidate` : les refus se disent en phrases, par l'écriture elle-même
       (`enregistrerFactureEmise`), et non par la bulle du navigateur — qui ne
       sait pas dire pourquoi une échéance ne précède pas l'émission. */
    <form className={`${styles.panneau} ${styles.saisieFacture}`} noValidate onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
      <p className={styles.aide}>
        Recopie ce que porte la facture de ton logiciel. FREEL ne lui donne pas
        de numéro et n’en produit pas le document&nbsp;: elle entre au suivi —
        envoi, échéance, règlement, relances.
      </p>

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-client`}>Client</label>
        <input id={`${id}-client`} className={styles.saisie} value={clientNom} list={`${id}-clients`}
          required onChange={(e) => setClientNom(e.target.value)} />
        <datalist id={`${id}-clients`}>
          {faits.clients.map((c) => <option key={c.id} value={c.nom} />)}
        </datalist>
      </p>

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-mois`}>Mois facturé</label>
        <input id={`${id}-mois`} type="month" className={styles.saisie} value={mois} required
          onChange={(e) => setMois(e.target.value)} />
        <span className={styles.aide}>Celui des journées facturées, pas celui de l’émission.</span>
      </p>

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-montant`}>Montant HT</label>
        <input id={`${id}-montant`} className={styles.saisie} inputMode="decimal" value={montantSaisi}
          required onChange={(e) => setMontantSaisi(e.target.value)} aria-describedby={`${id}-montant-aide`} />
        <span id={`${id}-montant-aide`} className={styles.aide}>
          {brouillon !== null
            ? <>Repris du planning&nbsp;: {formaterJours(brouillon.jours)} j pour <Montant>{eur(brouillon.total)}</Montant>.</>
            : 'Le hors-taxes de la facture.'}
        </span>
      </p>

      {regime === 'tva_francaise'
        ? (
          <p className={styles.champ}>
            <label className={styles.libelle} htmlFor={`${id}-taux`}>TVA</label>
            <select id={`${id}-taux`} className={styles.saisie} value={String(taux)}
              onChange={(e) => setTaux(Number(e.target.value))}>
              {TAUX.map((t) => <option key={t.valeur} value={String(t.valeur)}>{t.libelle}</option>)}
            </select>
            {Number.isFinite(tva) && (
              <span className={styles.aide}>
                <Montant>{eur(tva)}</Montant> de TVA, <Montant>{eur(montant + tva)}</Montant> TTC.
              </span>
            )}
          </p>
        )
        : (
          <p className={styles.aide}>
            {regime === 'franchise'
              ? 'Pas de TVA : tu es en franchise en base.'
              : 'Pas de TVA française : le client, établi dans l’Union, l’autoliquide.'}
          </p>
        )}

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-numero`}>Numéro de la facture</label>
        <input id={`${id}-numero`} className={styles.saisie} value={numero} required autoComplete="off"
          spellCheck={false} onChange={(e) => setNumero(e.target.value)} aria-describedby={`${id}-numero-aide`} />
        <span id={`${id}-numero-aide`} className={styles.aide}>Celui que ton logiciel lui a donné, tel quel.</span>
      </p>

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-emise`}>Date d’émission</label>
        <input id={`${id}-emise`} type="date" className={styles.saisie} value={emiseLe} max={aujourdhui}
          required onChange={(e) => setEmiseLe(e.target.value)} />
      </p>

      <fieldset className={styles.choix}>
        <legend className={styles.libelle}>Envoyée au client</legend>
        {([['meme_jour', 'Le même jour'], ['autre_jour', 'Un autre jour'], ['pas_encore', 'Pas encore']] as const)
          .map(([valeur, libelle]) => (
            <label key={valeur} className={styles.option}>
              <input type="radio" name={`${id}-envoi`} value={valeur} checked={envoi === valeur}
                onChange={() => setEnvoi(valeur)} />
              {libelle}
            </label>
          ))}
      </fieldset>
      {envoi === 'autre_jour' && (
        <p className={styles.champ}>
          <label className={styles.libelle} htmlFor={`${id}-envoyee`}>Date d’envoi</label>
          <input id={`${id}-envoyee`} type="date" className={styles.saisie} value={envoyeeLe}
            min={emiseLe} max={aujourdhui} required onChange={(e) => setEnvoyeeLe(e.target.value)} />
        </p>
      )}

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-echeance`}>Échéance</label>
        <input id={`${id}-echeance`} type="date" className={styles.saisie} value={echeance} min={emiseLe}
          required onChange={(e) => setEcheanceSaisie(e.target.value)} aria-describedby={`${id}-echeance-aide`} />
        <span id={`${id}-echeance-aide`} className={styles.aide}>
          {echeanceSaisie === null
            ? `Calculée : ${libelleDelai(formule)}${client === undefined ? ' (client hors carnet : délai par défaut)' : ''}.`
            : 'Celle que porte la facture.'}
        </span>
      </p>

      <p className={styles.champ}>
        <label className={styles.libelle} htmlFor={`${id}-pdf`}>La facture en PDF</label>
        <input id={`${id}-pdf`} type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
          disabled={enCours} onChange={(e) => choisirFichier(e.target.files?.[0])}
          aria-describedby={`${id}-pdf-aide`} />
        <span id={`${id}-pdf-aide`} className={styles.aide}>
          Facultatif, et précieux en contrôle. Elle reste sur cet appareil&nbsp;: les
          pièces ne suivent pas encore ton compte — l’archive complète, dans
          Réglages › Données, les emporte.
        </span>
      </p>
      {refusFichier !== null && <p className={styles.refus} role="alert">{refusFichier}</p>}

      {refus !== null && <p className={styles.refus} role="alert">{refus}</p>}

      <div className={styles.ligneActions}>
        <button type="submit" className={styles.actionPrincipale} disabled={enCours}>
          Enregistrer la facture
        </button>
      </div>
    </form>
  );
}
