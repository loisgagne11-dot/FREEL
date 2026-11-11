import { useMemo, useRef, useState } from 'react';
import { dateISO, euros } from '../../domain/types';
import { type FactureSuivie, montantsDeLaFacture } from '../../domain/calculs/facturier';
import type { ModeReglement } from '../../domain/calculs/livreRecettes';
import type { Client, Recette } from '../../state/schema';
import { useFaits } from '../../state/store';
import { encaisserRecette } from '../../state/ecritures.recettes';
import { dernierModeDeReglement } from '../../state/selecteurs.encaissement';
import { facturesAEncaisser } from '../../state/selecteurs.pipeline';
import { dateCourte, eur, initiales } from '../format';
import { FormulaireEncaissement } from './FormulaireEncaissement';
import { Montant } from './Montant';
import { Sheet } from './Sheet';
import { useToast } from './Toasts';
import styles from './Pointage.module.css';

/**
 * Le panneau « Encaissements » du Pilote : pointer une facture comme payée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE GESTE DU QUOTIDIEN, LÀ OÙ L'ON REGARDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La carte « Le flux du mois » disait « clique un statut pour le mettre à
 * jour », et un clic emmenait au facturier : on quittait l'écran qui montre
 * l'argent attendu pour un autre qui montre toutes les factures de l'année,
 * filtres compris, pour y retrouver celle qu'on venait de voir. Un virement
 * arrive, on le pointe — c'est le geste le plus fréquent de l'outil, et il en
 * demandait quatre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA MÊME RÈGLE QUE LE FACTURIER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Marquer payé » n'écrit rien : il ouvre la date et le mode de règlement,
 * les deux mentions que le livre des recettes exige, et c'est « Confirmer »
 * qui appelle `encaisserRecette` — la même écriture, avec les mêmes refus, que
 * celle du facturier. Un pointage en un clic aurait porté au livre la date du
 * jour pour un virement reçu la semaine dernière, à cheval sur un trimestre
 * déjà déclaré.
 *
 * La liste vient de `facturesAEncaisser`, celle qui fait la colonne Entrées
 * du flux : le panneau ne peut pas compter trois factures en attente sous une
 * carte qui en annonce deux.
 *
 * Chargé à la demande : le Pilote vit dans le paquet d'entrée, et ce panneau
 * ne s'ouvre qu'au moment de pointer.
 */
export function Encaissements(
  { cible, onFermer }: {
    /** La facture dont on a cliqué la pastille : sa ligne s'ouvre directement. */
    readonly cible: string | null;
    readonly onFermer: () => void;
  }
) {
  const faits = useFaits((e) => e.faits);
  const signaler = useToast();
  const attente = useMemo(() => facturesAEncaisser(faits), [faits]);
  // Les brouillons ne s'encaissent pas, mais ils comptent dans ce qu'on
  // attend : une facture jamais émise est de l'argent qui ne viendra pas tant
  // qu'on ne l'aura pas envoyée. Le handoff les montre grisés, au bout.
  const brouillons = useMemo(
    () => faits.recettes.filter((r) => r.emiseLe === null && r.montant > 0),
    [faits]
  );
  const [ouverte, setOuverte] = useState<string | null>(
    () => (cible !== null && attente.some((f) => f.recette.id === cible) ? cible : null)
  );
  const [refus, setRefus] = useState<string | null>(null);
  const teintes = useMemo(() => teintesDesClients(faits.clients), [faits.clients]);
  const liste = useRef<HTMLUListElement | null>(null);
  const termine = useRef<HTMLButtonElement | null>(null);

  const total = euros(attente.reduce((s, f) => s + f.recette.montant, 0));
  const montants = attente.map((f) => montantsDeLaFacture(f.recette));
  // Le TTC n'est annoncé que s'il est connu pour CHAQUE facture : un total
  // fait de TTC et de HT mêlés ne correspondrait à rien sur le relevé.
  const ttcConnu = montants.every((m) => m.ttc !== null);
  const avecTva = montants.some((m) => m.tva !== null && m.tva > 0);
  const totalTtc = euros(montants.reduce((s, m) => s + (m.ttc ?? m.ht), 0));

  function ouvrir(id: string): void {
    setRefus(null);
    setOuverte(id);
  }

  function confirmer(id: string, date: string, mode: ModeReglement): void {
    const motif = encaisserRecette(id, dateISO(date), mode);
    if (motif !== null) { setRefus(motif); return; }
    const rang = attente.findIndex((f) => f.recette.id === id);
    setOuverte(null);
    setRefus(null);
    signaler('Règlement enregistré au livre des recettes.');
    // La ligne disparaît avec le bouton qui avait le focus : sans relais, le
    // clavier retomberait au début de la page, derrière le dialogue.
    requestAnimationFrame(() => {
      const boutons = liste.current?.querySelectorAll<HTMLButtonElement>('button[data-pointer]') ?? [];
      (boutons[Math.min(rang, boutons.length - 1)] ?? termine.current)?.focus();
    });
  }

  return (
    <Sheet
      ouvert
      variante="atelier"
      titre="Encaissements"
      sousTitre="pointe une facture comme payée"
      onFermer={onFermer}
      pied={(
        <>
          <p className={styles.rappelPied}>
            Encaissé ≠ facturé — seul l’<strong>encaissé</strong> compte pour l’URSSAF
          </p>
          <button ref={termine} type="button" className={styles.termine} onClick={onFermer}>
            Terminé
          </button>
        </>
      )}
    >
      <div className={styles.plan}>
        <aside className={styles.cote}>
          <h3 className={styles.intitule}>Reste à encaisser</h3>
          <p className={styles.reste}>
            <span>
              {attente.length === 0
                ? 'Aucune facture en attente'
                : `${attente.length} facture${attente.length > 1 ? 's' : ''} en attente`}
            </span>
            <strong className={styles.resteMontant}><Montant>{eur(total)}</Montant></strong>
          </p>
          {avecTva && ttcConnu && (
            <p className={styles.precision}>
              Hors TVA. Sur ton compte, attends <Montant>{eur(totalTtc)}</Montant> TTC.
            </p>
          )}

          <h3 className={styles.intitule}>Astuce</h3>
          <p className={styles.precision}>
            Pointe à la date où l’argent est <strong>arrivé</strong>, pas à celle
            de la facture&nbsp;: en micro, le chiffre d’affaires se compte à
            l’encaissement, et c’est cette date qui le range dans un trimestre.
          </p>
          <p className={styles.precision}>
            Tu importes tes relevés&nbsp;? Le rapprochement d’Achats pointe les
            virements reconnus pour toi.
          </p>
        </aside>

        <div className={styles.principal}>
          {attente.length === 0 && brouillons.length === 0 && (
            <p className={styles.vide}>
              Rien à encaisser&nbsp;: toutes tes factures émises sont réglées.
            </p>
          )}
          <ul ref={liste} className={styles.liste} aria-label="Factures en attente de règlement">
            {attente.map((f) => (
              <Ligne
                key={f.recette.id}
                facture={f}
                teinte={teintes(f.recette.clientNom)}
                ouverte={ouverte === f.recette.id}
                focaliser={cible === f.recette.id}
                refus={ouverte === f.recette.id ? refus : null}
                modeParDefaut={dernierModeDeReglement(faits, f.recette.clientNom)}
                onOuvrir={() => ouvrir(f.recette.id)}
                onAnnuler={() => { setOuverte(null); setRefus(null); }}
                onConfirmer={(date, mode) => confirmer(f.recette.id, date, mode)}
              />
            ))}
            {brouillons.map((r) => <Brouillon key={r.id} recette={r} teinte={teintes(r.clientNom)} />)}
          </ul>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * La teinte de la pastille d'initiales, par rang du client au carnet.
 *
 * Deux clients côte à côte doivent se distinguer d'un coup d'œil, comme dans
 * le handoff — « SL » deux fois en vert, puis « AN » en bleu, se lit avant le
 * nom. Trois teintes du thème plutôt que des couleurs en dur, qui ne suivraient
 * pas les quatre palettes.
 */
function teintesDesClients(clients: readonly Client[]): (nom: string) => string {
  const rang = new Map(clients.map((c, i) => [c.nom, i]));
  return (nom) => styles[`teinte${(rang.get(nom) ?? 0) % 3}`] ?? '';
}

function Ligne(
  { facture, teinte, ouverte, focaliser, refus, modeParDefaut, onOuvrir, onAnnuler, onConfirmer }: {
    readonly facture: FactureSuivie<Recette>;
    readonly teinte: string;
    readonly ouverte: boolean;
    readonly focaliser: boolean;
    readonly refus: string | null;
    readonly modeParDefaut: ModeReglement;
    readonly onOuvrir: () => void;
    readonly onAnnuler: () => void;
    readonly onConfirmer: (date: string, mode: ModeReglement) => void;
  }
) {
  const { recette: r, statut, echeanceLe } = facture;
  const client = r.clientNom !== '' ? r.clientNom : 'Client non renseigné';
  const m = montantsDeLaFacture(r);
  const enRetard = statut === 'en_retard';

  return (
    <li className={`${styles.ligne} ${enRetard ? styles.ligneEnRetard : ''}`}>
      <div className={styles.entete}>
        <span className={`${styles.avatar} ${teinte}`} aria-hidden="true">
          {initiales(client)}
        </span>
        <span className={styles.texte}>
          <span className={styles.client}>{client}</span>
          <span className={styles.meta}>
            {r.numero || 'Sans numéro'} · émise le {dateCourte(r.emiseLe)} · échéance {dateCourte(echeanceLe)}
          </span>
        </span>
        {enRetard && <span className={styles.pastille}>en retard</span>}
        <span className={styles.montant}>
          {/* Le montant qu'on lit sur le relevé : le TTC, quand il y a une TVA. */}
          <Montant>{eur(m.ttc !== null && m.tva !== null && m.tva > 0 ? m.ttc : m.ht)}</Montant>
          {m.tva !== null && m.tva > 0 && (
            <span className={styles.ht}><Montant>{eur(m.ht)}</Montant> HT</span>
          )}
        </span>
        {!ouverte && (
          <button type="button" data-pointer className={styles.marquer} onClick={onOuvrir}>
            Marquer payé
            <span className={styles.horsEcran}> — {r.numero || 'sans numéro'}, {client}</span>
          </button>
        )}
      </div>
      {ouverte && (
        <div className={styles.saisie}>
          <FormulaireEncaissement
            enLigne
            focaliser={focaliser}
            modeParDefaut={modeParDefaut}
            refus={refus}
            libelleValider="Confirmer le règlement"
            onValider={onConfirmer}
            onAnnuler={onAnnuler}
          />
        </div>
      )}
    </li>
  );
}

/** Un brouillon : rien à pointer, mais de l'argent qui n'est pas encore demandé. */
function Brouillon({ recette: r, teinte }: { readonly recette: Recette; readonly teinte: string }) {
  const client = r.clientNom !== '' ? r.clientNom : 'Client non renseigné';
  return (
    <li className={`${styles.ligne} ${styles.ligneBrouillon}`}>
      <div className={styles.entete}>
        <span className={`${styles.avatar} ${teinte}`} aria-hidden="true">
          {initiales(client)}
        </span>
        <span className={styles.texte}>
          <span className={styles.client}>{client}</span>
          <span className={styles.meta}>{r.numero || 'Sans numéro'} · brouillon, pas encore émise</span>
        </span>
        <span className={styles.montant}><Montant>{eur(r.montant)}</Montant></span>
        <a className={styles.emettre} href="#/activite/factures">
          à émettre
          <span className={styles.horsEcran}> — {r.numero || 'sans numéro'}, {client}, dans le facturier</span>
        </a>
      </div>
    </li>
  );
}
