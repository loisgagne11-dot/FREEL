/**
 * La RÉDACTION d'une facture, et le document qu'elle produit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE À PART
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Il pesait la moitié de l'écran Facturer, qui est devenu le plus lourd des
 * écrans différés — au-delà de son budget. Or on ouvre le facturier pour
 * CONSULTER : voir ce qui est parti, ce qui reste à rentrer, qui relancer.
 * Rédiger une facture est un geste de fin de mois, et revoir un document
 * émis un geste plus rare encore.
 *
 * Le budget ne se relève pas : on extrait ce qui n'a pas à être chargé pour
 * la consultation. C'est le même motif que `Activite.formulaires`, et le
 * même remède.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'APERÇU VIT PENDANT LA SAISIE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le document ne s'affichait qu'APRÈS l'émission. On remplissait donc un
 * formulaire à l'aveugle, on émettait — geste irréversible : une facture
 * irrégulière ne se corrige pas, elle s'annule par un avoir et se réémet sous
 * un nouveau numéro —, et on découvrait ensuite ce qu'on venait de produire.
 *
 * Le handoff pose l'aperçu à côté de la saisie, et il a raison : c'est le seul
 * moment où corriger coûte encore zéro. Le document lui-même vit désormais
 * dans `documents/DocumentFacture`, sur la feuille que le fichier téléchargé
 * emporte avec lui.
 */

import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import {
  destinataireDe, emetteurDe, etatFacture, numeroSuivant
} from '../../state/selecteurs.facture';
import type { Facture as FactureDomaine, LigneFacture } from '../../domain/calculs/facture';
import { dateISO, euros, ratio } from '../../domain/types';
import { Info } from '../components/Info';
import { dateCourte, eurExact } from '../format';
import styles from './Facture.module.css';
import { Montant } from '../components/Montant';
import { Apercu, useSortieDocument } from '../documents/Apercu';
import { DocumentFacture } from '../documents/DocumentFacture';

const TAUX_TVA_COURANTS = [
  { valeur: 0.20, libelle: '20 % — taux normal' },
  { valeur: 0.10, libelle: '10 % — taux intermédiaire' },
  { valeur: 0.055, libelle: '5,5 % — taux réduit' },
  { valeur: 0, libelle: 'Sans TVA' }
];

const ligneVide = (): LigneFacture => ({
  designation: '', quantite: 1, prixUnitaireHt: euros(0), tauxTva: ratio(0.20)
});

/**
 * L'écran a deux temps : le facturier, et la rédaction.
 *
 * Le facturier d'abord, parce que c'est ce qu'on vient faire le plus souvent —
 * regarder qui n'a pas payé, enregistrer un règlement qui vient d'arriver.
 * Émettre est plus rare, et c'est un geste qu'on décide : il mérite un clic.
 *
 * L'inverse — ouvrir sur un formulaire vierge — obligeait à chercher ses
 * factures ailleurs, et l'ailleurs en question (Argent, sous-onglet livre des
 * recettes) n'était pas trouvable.
 */
export function NouvelleFacture({ onListe }: { readonly onListe: () => void }) {
  const faits = useFaits((e) => e.faits);
  const ajouterRecette = useFaits((e) => e.ajouterRecette);
  const idChamp = useId();

  const [clientNom, setClientNom] = useState('');
  const [emiseLe, setEmiseLe] = useState(() => new Date().toISOString().slice(0, 10));
  const [lignes, setLignes] = useState<readonly LigneFacture[]>([ligneVide()]);
  /**
   * La facture émise, FIGÉE.
   *
   * Conserver seulement son numéro ne suffisait pas : `numeroSuivant` se
   * recalcule dès que la recette est enregistrée, et le document imprimé
   * portait alors un numéro différent de celui inscrit au livre. Un document
   * comptable qui ne correspond pas à son écriture est inexploitable.
   */
  const [emise, setEmise] = useState<ReturnType<typeof etatFacture> | null>(null);

  const sortie = useSortieDocument();
  const numero = useMemo(() => numeroSuivant(faits), [faits]);
  const client = faits.clients.find((c) => c.nom === clientNom);

  const facture: FactureDomaine = useMemo(() => ({
    numero,
    emiseLe: /^\d{4}-\d{2}-\d{2}$/.test(emiseLe) ? dateISO(emiseLe) : dateISO('1970-01-01'),
    emetteur: emetteurDe(faits),
    destinataire: client === undefined
      ? {
        nom: clientNom, adresse: '', siret: '', pays: '', tvaIntracom: '',
        delaiPaiement: 'net_30'
      }
      : destinataireDe(client),
    lignes
  }), [numero, emiseLe, faits, client, clientNom, lignes]);

  const etat = useMemo(() => etatFacture(facture), [facture]);
  const emissionPossible = etat.manques.length === 0;

  /**
   * La saisie a-t-elle commencé ?
   *
   * Une facture vierge manque forcément de tout : nom du client, adresse,
   * désignation, montant. Afficher « 4 mentions obligatoires manquent » en
   * rouge avant la première frappe reproche à l'utilisateur de n'avoir pas
   * encore rempli un formulaire qu'il vient d'ouvrir. Un avertissement qu'on
   * voit systématiquement cesse d'être lu — y compris le jour où il porte sur
   * une vraie omission, juste avant l'émission.
   *
   * Le contrôle ne change pas d'un iota : l'émission reste bloquée tant qu'il
   * manque une mention. Seul le moment où on le DIT change.
   */
  const aCommence = clientNom !== ''
    || lignes.some((l) => l.designation !== '' || l.prixUnitaireHt > 0);

  /* Sortir la facture émise : le numéro est attribué, le document est celui
     qui est porté au livre. */
  const sortirEmise = (action: 'imprimer' | 'telecharger'): void =>
    sortie(action, `Facture ${emise?.facture.numero ?? ''}`,
      ['Facture', emise?.facture.numero ?? '', emise?.facture.destinataire.nom ?? '']);

  /*
   * Sortir le BROUILLON, avant émission.
   *
   * Autorisé, parce qu'on relit un devis ou une facture avant de l'émettre, et
   * parfois sur papier. Mais le fichier porte « brouillon » dans son nom ET
   * dans le document : son numéro n'est pas encore attribué, deux brouillons
   * du même jour portent le même, et l'un des deux deviendrait un doublon au
   * livre de quelqu'un s'il partait tel quel.
   */
  const sortirBrouillon = (action: 'imprimer' | 'telecharger'): void =>
    sortie(action, `Brouillon de facture ${numero}`,
      ['Brouillon', 'facture', numero, clientNom]);

  function emettre(): void {
    if (!emissionPossible) return;
    ajouterRecette({
      clientNom: facture.destinataire.nom,
      libelle: lignes.map((l) => l.designation).filter((d) => d !== '').join(', '),
      // Le montant porté au livre est le HT : c'est l'assiette du chiffre
      // d'affaires en micro, et celle que l'URSSAF réclame.
      montant: etat.totaux.totalHt,
      // La TVA du document est conservée telle quelle : elle ne se recalcule
      // pas — les lignes ne sont pas gardées, et une facture peut porter
      // plusieurs taux. La jeter obligeait à la supposer au moment de
      // déclarer, sur un formulaire officiel.
      tvaCollectee: etat.totaux.totalTva,
      emiseLe: facture.emiseLe,
      // L'encaissement viendra plus tard : porter une recette comme encaissée
      // à l'émission ferait déclarer un revenu qui n'est pas rentré.
      encaisseeLe: null,
      modeReglement: null,
      numero
    });
    setEmise(etat);
  }

  if (emise !== null) {
    return (
      <>
        <header className={styles.entete}>
          <h1 className={styles.titre}>Facture {emise.facture.numero}</h1>
          <div className={styles.actions}>
            <button type="button" className={styles.actionPrincipale}
              onClick={() => sortirEmise('telecharger')}>
              Télécharger
            </button>
            <button type="button" className={styles.action}
              onClick={() => sortirEmise('imprimer')}>
              Imprimer
            </button>
            <button type="button" className={styles.action} onClick={() => {
              setEmise(null); setLignes([ligneVide()]); setClientNom('');
            }}>
              Nouvelle facture
            </button>
            <button type="button" className={styles.action} onClick={onListe}>
              Retour au facturier
            </button>
          </div>
        </header>

        <p className={styles.bandeau} role="status">
          Facture {emise.facture.numero} portée au livre des recettes, non encaissée. Elle y
          entrera comme recette encaissée le jour où le règlement arrive.
          <Info libelle="Pourquoi l’émission ne vaut pas encaissement">
            En micro, le chiffre d’affaires se compte à l’encaissement. Porter
            une facture comme encaissée dès son émission ferait déclarer — et
            cotiser sur — un revenu qui n’est pas rentré.
          </Info>
        </p>

        <Apercu>
          <DocumentFacture etat={emise} brouillon={false} />
        </Apercu>
      </>
    );
  }

  return (
    <>
      <header className={styles.entete}>
        <h1 className={styles.titre}>Nouvelle facture</h1>
        <span className={styles.numero}>{numero}</span>
        <button type="button" className={styles.action} onClick={onListe}>
          Retour au facturier
        </button>
      </header>

      {aCommence && etat.manques.length > 0 && (
        <div className={`${styles.bandeau} ${styles.bandeauDanger}`} role="status">
          <p>
            <strong>{etat.manques.length}</strong> mention
            {etat.manques.length > 1 ? 's' : ''} obligatoire
            {etat.manques.length > 1 ? 's' : ''} manque
            {etat.manques.length > 1 ? 'nt' : ''}
            {etat.amendeEncourue > 0 && <> — jusqu’à <Montant>{eurExact(etat.amendeEncourue)}</Montant> d’amende</>}.
            <Info libelle="Pourquoi l’émission est bloquée">
              Une mention absente expose à 15 € d’amende par mention et par
              facture, mais surtout donne à un client de mauvaise foi un motif
              de refuser le paiement. Une facture irrégulière ne se corrige
              pas&nbsp;: elle s’annule par un avoir et se réémet sous un
              nouveau numéro. Mieux vaut donc ne pas l’émettre.
            </Info>
          </p>
          <ul className={styles.manques}>
            {etat.manques.map((m) => <li key={m.mention}>{m.message}</li>)}
          </ul>
        </div>
      )}

      {/* L'ATELIER : la saisie à gauche, le document à droite.
          En portrait les deux s'empilent — l'aperçu passe alors SOUS la
          saisie, parce qu'on remplit d'abord et qu'on relit ensuite. */}
      <div className={styles.atelier}>
        <div className={styles.colonneSaisie}>
      <section className={styles.carte} aria-labelledby={`${idChamp}-saisie`}>
        <h2 id={`${idChamp}-saisie`} className={styles.titreCarte}>Destinataire</h2>

        <div className={styles.formulaire}>
          <p className={styles.champ}>
            <label htmlFor={`${idChamp}-client`}>Client</label>
            <input id={`${idChamp}-client`} value={clientNom} required
              list={`${idChamp}-clients`}
              onChange={(e) => setClientNom(e.target.value)} />
            {client === undefined && clientNom !== '' && (
              <span className={styles.aide}>
                Ce client n’est pas au carnet : son adresse et son pays manqueront.
                Créez-le dans Activité → Clients.
              </span>
            )}
          </p>
          <datalist id={`${idChamp}-clients`}>
            {faits.clients.map((c) => <option key={c.id} value={c.nom} />)}
          </datalist>

          <p className={styles.champ}>
            <label htmlFor={`${idChamp}-date`}>Date d’émission</label>
            <input id={`${idChamp}-date`} type="date" value={emiseLe}
              onChange={(e) => setEmiseLe(e.target.value)} />
          </p>
        </div>

        {etat.regime !== 'tva_francaise' && (
          <p className={styles.note}>
            {etat.regime === 'franchise'
              ? 'Facture sans TVA (franchise en base). La mention légale sera portée automatiquement.'
              : 'Prestation intracommunautaire : facture sans TVA française, avec mention d’autoliquidation. Elle devra figurer dans la DES du mois d’émission.'}
          </p>
        )}
      </section>

      <section className={styles.carte} aria-labelledby={`${idChamp}-lignes`}>
        <h2 id={`${idChamp}-lignes`} className={styles.titreCarte}>Prestations</h2>

        {lignes.map((ligne, i) => (
          <div key={i} className={styles.ligneSaisie}>
            <p className={styles.champ}>
              <label htmlFor={`${idChamp}-des-${i}`}>Désignation</label>
              <input id={`${idChamp}-des-${i}`} value={ligne.designation}
                onChange={(e) => setLignes(remplacer(lignes, i, { designation: e.target.value }))} />
            </p>
            <p className={styles.champEtroit}>
              <label htmlFor={`${idChamp}-qte-${i}`}>Quantité</label>
              <input id={`${idChamp}-qte-${i}`} inputMode="decimal" value={String(ligne.quantite)}
                onChange={(e) => setLignes(remplacer(lignes, i, {
                  quantite: Number.parseFloat(e.target.value.replace(',', '.')) || 0
                }))} />
            </p>
            <p className={styles.champEtroit}>
              <label htmlFor={`${idChamp}-pu-${i}`}>Prix unitaire HT</label>
              <input id={`${idChamp}-pu-${i}`} inputMode="decimal"
                value={String(ligne.prixUnitaireHt)}
                onChange={(e) => setLignes(remplacer(lignes, i, {
                  prixUnitaireHt: euros(Number.parseFloat(e.target.value.replace(',', '.')) || 0)
                }))} />
            </p>
            {etat.regime === 'tva_francaise' && (
              <p className={styles.champEtroit}>
                <label htmlFor={`${idChamp}-tva-${i}`}>TVA</label>
                <select id={`${idChamp}-tva-${i}`} value={String(ligne.tauxTva)}
                  onChange={(e) => setLignes(remplacer(lignes, i, {
                    tauxTva: ratio(Number.parseFloat(e.target.value))
                  }))}>
                  {TAUX_TVA_COURANTS.map((t) => (
                    <option key={t.valeur} value={t.valeur}>{t.libelle}</option>
                  ))}
                </select>
              </p>
            )}
            {lignes.length > 1 && (
              <button type="button" className={styles.retirer}
                onClick={() => setLignes(lignes.filter((_, j) => j !== i))}
                aria-label={`Retirer la ligne ${i + 1}`}>
                <span aria-hidden="true">✕</span>
              </button>
            )}
          </div>
        ))}

        <button type="button" className={styles.action}
          onClick={() => setLignes([...lignes, ligneVide()])}>
          Ajouter une ligne
        </button>
      </section>

      <section className={styles.carte} aria-labelledby={`${idChamp}-totaux`}>
        <h2 id={`${idChamp}-totaux`} className={styles.titreCarte}>Totaux</h2>
        <Totaux etat={etat} />
        <button type="button" className={styles.actionPrincipale}
          disabled={!emissionPossible} onClick={emettre}>
          {emissionPossible ? 'Émettre la facture' : 'Compléter les mentions manquantes'}
        </button>
      </section>
        </div>

        <div className={styles.colonneApercu}>
          <Apercu>
            <DocumentFacture etat={etat} brouillon />
          </Apercu>
          <div className={styles.sorties}>
            <button type="button" className={styles.action}
              onClick={() => sortirBrouillon('imprimer')}>
              Imprimer le brouillon
            </button>
            <button type="button" className={styles.action}
              onClick={() => sortirBrouillon('telecharger')}>
              Télécharger le brouillon
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function remplacer(
  lignes: readonly LigneFacture[], i: number, modification: Partial<LigneFacture>
): readonly LigneFacture[] {
  return lignes.map((l, j) => (j === i ? { ...l, ...modification } : l));
}

function Totaux({ etat }: { etat: ReturnType<typeof etatFacture> }) {
  const { totaux: t } = etat;
  return (
    <dl className={styles.detail}>
      <div className={styles.ligne}>
        <dt>Total HT</dt>
        <dd><Montant>{eurExact(t.totalHt)}</Montant></dd>
      </div>
      {t.parTaux.map((g) => (
        <div key={g.taux} className={styles.ligne}>
          <dt>TVA {(g.taux * 100).toFixed(1).replace('.', ',')} % sur <Montant>{eurExact(g.base)}</Montant></dt>
          <dd><Montant>{eurExact(g.tva)}</Montant></dd>
        </div>
      ))}
      <div className={`${styles.ligne} ${styles.total}`}>
        <dt>Total {t.totalTva > 0 ? 'TTC' : 'à payer'}</dt>
        <dd><Montant>{eurExact(t.totalTtc)}</Montant></dd>
      </div>
      <div className={styles.ligne}>
        <dt>Échéance</dt>
        <dd>{dateCourte(t.echeanceLe)}</dd>
      </div>
    </dl>
  );
}
