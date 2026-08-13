import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import {
  destinataireDe, emetteurDe, etatFacture, numeroSuivant
} from '../../state/selecteurs';
import type { Facture as FactureDomaine, LigneFacture } from '../../domain/calculs/facture';
import { dateISO, euros, ratio } from '../../domain/types';
import { Info } from '../components/Info';
import { dateCourte, eurExact } from '../format';
import styles from './Facture.module.css';
import { Montant } from '../components/Montant';

/**
 * Émission d'une facture.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS DE BIBLIOTHÈQUE PDF
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application chargeait jsPDF — 627 Ko de bibliothèques bloquantes
 * avant le premier rendu, pour produire un document que le navigateur sait
 * déjà fabriquer. Ici, la facture est du HTML mis en page pour l'impression, et
 * « Imprimer → Enregistrer en PDF » donne le fichier.
 *
 * Trois gains, et un renoncement assumé :
 *   · zéro octet de dépendance, donc aucun coût au chargement ;
 *   · la typographie est celle du système, pas celle d'un moteur de rendu
 *     approximatif — les accents et l'euro ne posent aucun problème ;
 *   · le document imprimé est exactement celui affiché, donc vérifiable à
 *     l'œil avant émission.
 *   · en revanche, aucun fichier n'est produit par programme : joindre la
 *     facture à un courriel suppose de passer par la boîte d'impression.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES MANQUES SE VOIENT PENDANT LA SAISIE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Découvrir qu'il manque l'adresse du client après avoir tout rempli fait
 * perdre la saisie. Les mentions absentes sont donc constatées à chaque frappe,
 * avec l'amende encourue — 15 € par mention et par facture. Et l'émission est
 * BLOQUÉE tant qu'il en manque une : une facture irrégulière ne se corrige pas,
 * elle s'annule par un avoir et se réémet sous un nouveau numéro.
 */

const TAUX_TVA_COURANTS = [
  { valeur: 0.20, libelle: '20 % — taux normal' },
  { valeur: 0.10, libelle: '10 % — taux intermédiaire' },
  { valeur: 0.055, libelle: '5,5 % — taux réduit' },
  { valeur: 0, libelle: 'Sans TVA' }
];

const ligneVide = (): LigneFacture => ({
  designation: '', quantite: 1, prixUnitaireHt: euros(0), tauxTva: ratio(0.20)
});

export function Facture() {
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

  const numero = useMemo(() => numeroSuivant(faits), [faits]);
  const client = faits.clients.find((c) => c.nom === clientNom);

  const facture: FactureDomaine = useMemo(() => ({
    numero,
    emiseLe: /^\d{4}-\d{2}-\d{2}$/.test(emiseLe) ? dateISO(emiseLe) : dateISO('1970-01-01'),
    emetteur: emetteurDe(faits),
    destinataire: client === undefined
      ? {
        nom: clientNom, adresse: '', siret: '', pays: '', tvaIntracom: '',
        delaiPaiementJours: 30
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

  function emettre(): void {
    if (!emissionPossible) return;
    ajouterRecette({
      clientNom: facture.destinataire.nom,
      libelle: lignes.map((l) => l.designation).filter((d) => d !== '').join(', '),
      // Le montant porté au livre est le HT : c'est l'assiette du chiffre
      // d'affaires en micro, et celle que l'URSSAF réclame.
      montant: etat.totaux.totalHt,
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
              onClick={() => window.print()}>
              Imprimer ou enregistrer en PDF
            </button>
            <button type="button" className={styles.action} onClick={() => {
              setEmise(null); setLignes([ligneVide()]); setClientNom('');
            }}>
              Nouvelle facture
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

        <DocumentFacture etat={emise} />
      </>
    );
  }

  return (
    <>
      <header className={styles.entete}>
        <h1 className={styles.titre}>Nouvelle facture</h1>
        <span className={styles.numero}>{numero}</span>
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

/* ─────────────────────────────────────────────────────────────────────────
   Le document
   ───────────────────────────────────────────────────────────────────────── */

/**
 * La facture telle qu'elle s'imprime.
 *
 * Le même balisage sert à l'écran et au papier : la feuille de style
 * d'impression masque le reste de l'application et met ce bloc en page. Un
 * gabarit distinct pour l'impression finirait par diverger de ce qui est
 * affiché, et l'utilisateur signerait un document qu'il n'a pas relu.
 */
function DocumentFacture({ etat }: { etat: ReturnType<typeof etatFacture> }) {
  const { facture: f, totaux: t } = etat;
  const { emetteur: em, destinataire: de } = f;

  return (
    <article className={styles.document} aria-label={`Facture ${f.numero}`}>
      <header className={styles.docEntete}>
        <div>
          <p className={styles.docNom}>{em.nom}</p>
          <p className={styles.docLigne}>{em.adresse}</p>
          <p className={styles.docLigne}>{em.codePostal} {em.ville}</p>
          <p className={styles.docLigne}>SIRET {em.siret}</p>
          {em.tvaIntracom !== '' && (
            <p className={styles.docLigne}>TVA {em.tvaIntracom}</p>
          )}
        </div>
        <div className={styles.docTitre}>
          <p className={styles.docFacture}>Facture</p>
          <p className={styles.docNumero}>{f.numero}</p>
          <p className={styles.docLigne}>Émise le {dateCourte(f.emiseLe)}</p>
          <p className={styles.docLigne}>Échéance {dateCourte(t.echeanceLe)}</p>
        </div>
      </header>

      <section className={styles.docClient}>
        <p className={styles.docLabel}>Facturé à</p>
        <p className={styles.docNom}>{de.nom}</p>
        <p className={styles.docLigne}>{de.adresse}</p>
        {de.siret !== '' && <p className={styles.docLigne}>SIRET {de.siret}</p>}
        {de.tvaIntracom !== '' && (
          <p className={styles.docLigne}>TVA {de.tvaIntracom}</p>
        )}
      </section>

      <table className={styles.docTable}>
        <thead>
          <tr>
            <th scope="col">Désignation</th>
            <th scope="col">Qté</th>
            <th scope="col">P.U. HT</th>
            {t.totalTva > 0 && <th scope="col">TVA</th>}
            <th scope="col">Total HT</th>
          </tr>
        </thead>
        <tbody>
          {f.lignes.filter((l) => l.designation.trim() !== '').map((l, i) => (
            <tr key={i}>
              <td>{l.designation}</td>
              <td>{l.quantite}</td>
              <td><Montant>{eurExact(l.prixUnitaireHt)}</Montant></td>
              {t.totalTva > 0 && (
                <td>{(l.tauxTva * 100).toFixed(1).replace('.', ',')} %</td>
              )}
              <td><Montant>{eurExact(euros(l.quantite * l.prixUnitaireHt))}</Montant></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.docTotaux}>
        <Totaux etat={etat} />
      </div>

      <footer className={styles.docPied}>
        {etat.mentions.map((m) => <p key={m} className={styles.docMention}>{m}</p>)}
      </footer>
    </article>
  );
}
