import { useFaits } from '../../state/store';
import type { DelaiClient } from '../../domain/calculs/activite';
import { Info } from '../components/Info';
import { Vide } from '../components/Vide';
import { Montant } from '../components/Montant';
import { eur } from '../format';
import styles from './Activite.module.css';
import { libelleDelai } from '../../domain/calculs/delaiPaiement.libelles';

/**
 * L'onglet Clients, chargé à la demande.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL VIT DANS SON PROPRE FICHIER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le budget de l'écran différé le plus lourd a été dépassé en ajoutant le
 * tableau « rapport et charge par mission ». La règle du projet est de ne
 * jamais relever un plafond mais d'extraire le module qui pèse : relever le
 * seuil revient à cesser de mesurer, et la mesure ne sert qu'à ce moment-là.
 *
 * Le carnet est le bon candidat. C'est un onglet à part entière, consulté à la
 * création d'un client puis rarement, et le plan de charge n'en dépend pas :
 * `PanneauOnglet` ne rend rien quand son onglet est inactif, donc le module
 * n'est demandé qu'à l'ouverture de l'onglet.
 */
export function OngletClients(
  { idGroupe, onOuvrirClient, delais }: {
    readonly idGroupe: string;
    readonly onOuvrirClient: (id: string | null) => void;
    readonly delais: readonly DelaiClient[];
  }
) {
  const faits = useFaits((e) => e.faits);

  return (
    <>
          <section className={styles.carte} aria-labelledby={`${idGroupe}-carnet`}>
            <h2 id={`${idGroupe}-carnet`} className={styles.titreCarte}>
              Carnet
              <Info libelle="Pourquoi le pays du client compte">
                Une prestation vendue à un professionnel d’un autre État membre
                doit figurer dans la déclaration européenne de services, dès le
                premier euro et même en franchise en base. Sans le pays et le
                numéro de TVA du client, cette obligation reste invisible.
              </Info>
            </h2>
            {faits.clients.length === 0
              ? (
                <Vide
                  message="Aucun client enregistré. Le carnet porte le pays et le numéro de TVA, sans lesquels l’obligation de déclaration européenne reste invisible."
                  action={(
                    <button type="button" className={styles.actionPrincipale}
                      onClick={() => onOuvrirClient(null)}>
                      Ajouter un client
                    </button>
                  )}
                />
              )
              : (
                <ul className={styles.liste}>
                  {faits.clients.map((c) => (
                    <li key={c.id} className={styles.ligneListe}>
                      <button type="button" className={styles.ouvrir}
                        onClick={() => onOuvrirClient(c.id)}>
                        <span className={styles.ligneTitre}>
                          <span className={styles.ligneLibelle}>{c.nom}</span>
                          <span className={styles.ligneMontant}>
                            {libelleDelai(c.delaiPaiement)}
                          </span>
                        </span>
                        <span className={styles.ligneMeta}>
                          <span>{libellePays(c.pays)}</span>
                          {c.pays !== '' && c.pays.toUpperCase() !== 'FR' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className={c.tvaIntracom === '' ? styles.attention : undefined}>
                                {c.tvaIntracom === '' ? 'n° de TVA manquant' : c.tvaIntracom}
                              </span>
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </section>

          <section className={styles.carte} aria-labelledby={`${idGroupe}-delais`}>
            <h2 id={`${idGroupe}-delais`} className={styles.titreCarte}>
              Délai de paiement observé
              <Info libelle="Pourquoi la médiane plutôt que la moyenne">
                Un client qui paie à 30 jours neuf fois et à 300 jours une fois
                n’est pas un client à 57 jours. La moyenne décrit un client qui
                n’existe pas&nbsp;; la médiane décrit le comportement habituel.
                Le délai contractuel est une intention, celui-ci est un constat.
              </Info>
            </h2>
            {delais.length === 0
              ? <p className={styles.vide}>Aucune recette enregistrée.</p>
              : (
                <ul className={styles.liste}>
                  {delais.map((client) => (
                    <li key={client.clientNom} className={styles.ligneListe}>
                      <span className={styles.ligneTitre}>
                        <span className={styles.ligneLibelle}>{client.clientNom}</span>
                        <span className={styles.ligneMontant}><Montant>{eur(client.enAttente)}</Montant></span>
                      </span>
                      <span className={styles.ligneMeta}>
                        <span>
                          {client.delaiMedian === null
                            ? 'Délai non mesurable'
                            : `${client.delaiMedian} j en médiane`}
                        </span>
                        {client.delaiMaximum !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{client.delaiMaximum} j au pire</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>
                          {client.facturesMesurees === 0
                            ? 'aucune facture réglée'
                            : `${client.facturesMesurees} facture${client.facturesMesurees > 1 ? 's' : ''} mesurée${client.facturesMesurees > 1 ? 's' : ''}`}
                        </span>
                      </span>
                      {client.enRetard > 0 && (
                        <span className={styles.alerte}>
                          {client.enRetard} facture{client.enRetard > 1 ? 's' : ''} en attente
                          au-delà de son délai habituel
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
          </section>    </>
  );
}

/** Le nom du pays, à partir de son code ISO. */
function libellePays(code: string): string {
  if (code === '') return 'Pays non renseigné';
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
