import type { MoisEnChiffres as Chiffres } from '../../state/selecteurs.activite';
import { Montant } from './Montant';
import { eur } from '../format';
import styles from './MoisEnChiffres.module.css';

/**
 * Le mois vu du TEMPS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX RÉPARTITIONS CLIENT SUR LE MÊME ÉCRAN, ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'écran porte déjà une répartition par client, en EUROS et sur l'ANNÉE :
 * c'est la dépendance commerciale — le risque de perdre celui qui pèse 60 % du
 * chiffre d'affaires. Celle-ci est en JOURS et sur le MOIS : c'est où passe le
 * temps, maintenant.
 *
 * Elles ne coïncident pas, et c'est ce qui les rend utiles ensemble : un client
 * qui prend 40 % des journées pour 15 % du chiffre est mal tarifé, et aucune
 * des deux ne le dit seule. Chacune porte donc son unité et sa période EN
 * TOUTES LETTRES — deux barres empilées sans ces mots seraient lues comme la
 * même mesure affichée deux fois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA BARRE EST UNE IMAGE, LA LISTE EST LA DONNÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Sous quelques pourcents, un segment fait deux pixels sur un téléphone. Le
 * tracé est masqué aux technologies d'assistance ; chaque client porte ses
 * journées et sa part en clair, juste dessous.
 */
export function MoisEnChiffres({ chiffres }: { readonly chiffres: Chiffres }) {
  const { occupation, teletravail } = chiffres;

  return (
    <>
      <dl className={styles.tuiles}>
        <div className={styles.ligne}>
          <dt>Jours travaillés</dt>
          <dd className={styles.valeur}>{jours(chiffres.joursTravailles)}&nbsp;j</dd>
        </div>
        <div className={styles.ligne}>
          {/* « généré », et non « encaissé » : les deux diffèrent de tout le
              délai de paiement, et les confondre ferait lire un mois creux
              comme un mois faible. */}
          <dt>CA généré</dt>
          <dd className={styles.valeur}><Montant>{eur(chiffres.caGenere)}</Montant></dd>
        </div>
      </dl>

      <div className={styles.occupation}>
        <p className={styles.enteteOccupation}>
          <span>Occupation</span>
          {/*
            * L'ABSTENTION PLUTÔT QUE ZÉRO.
            *
            * Un mois entièrement pris en congé n'a pas une occupation de 0 %,
            * il n'en a pas : le dénominateur est vide. Afficher zéro ferait
            * lire un mois catastrophique là où il n'y a rien à lire.
            */}
          <strong
            className={occupation === null ? styles.sansValeur
              : occupation > 1 ? styles.tauxAttention : styles.taux}
          >
            {occupation === null ? '—' : `${Math.round(occupation * 100)} %`}
          </strong>
        </p>

        {occupation !== null && (
          <span
            className={styles.jauge}
            role="img"
            aria-label={`${Math.round(occupation * 100)} pour cent d’occupation`}
          >
            <span
              className={`${styles.remplissage} ${occupation > 1 ? styles.depassement : ''}`}
              // Bornée à 100 % du tracé : au-delà, la barre déborderait de sa
              // gouttière. Le dépassement se dit par la TEINTE et par le compte
              // écrit dessous, qui eux ne sont pas bornés.
              style={{ width: `${Math.min(100, occupation * 100)}%` }}
            />
          </span>
        )}

        {/* Le dénominateur, sous la jauge. « 84 % » est une bonne nouvelle sur
            22 jours ouvrés et une autre histoire sur 12 : sans lui, le taux ne
            se compare pas d'un mois à l'autre. */}
        <p className={styles.detail}>
          {jours(chiffres.joursTravailles)} / {chiffres.joursOuvrables}&nbsp;j ouvrés
          {chiffres.joursDeConge > 0 && ` · ${chiffres.joursDeConge} j de congé`}
        </p>

        {/*
          * LA CAUSE D'UN TAUX AU-DESSUS DE 100 %, DITE PLUTÔT QUE DEVINÉE.
          *
          * Le numérateur additionne les journées PAR CLIENT, le dénominateur
          * compte les jours du CALENDRIER. Deux rythmes qui prévoient tous deux
          * le vendredi — l'un à 0,5, l'autre à 1 — donnent 1,5 journée sur un
          * seul vendredi, et l'occupation dépasse 100 %.
          *
          * Le taux n'est pas faux : il rapporte fidèlement une donnée qui, elle,
          * est impossible. On ne le borne donc PAS — le borner masquerait le
          * signal. On nomme la cause, et on renvoie au geste qui la corrige : un
          * jour ne contient pas une journée et demie, et le CRA qui en sortirait
          * facturerait du temps qui n'a pas existé.
          */}
        {chiffres.joursSurengages > 0 && (
          <p className={styles.surengagement} role="status">
            <strong>
              {chiffres.joursSurengages}&nbsp;jour{chiffres.joursSurengages > 1 ? 's' : ''}
            </strong>
            {chiffres.joursSurengages > 1 ? ' portent ' : ' porte '}
            plus d’une journée de travail&nbsp;: deux rythmes s’y superposent.
            Corrige-les au planning, sans quoi le compte rendu facturera du temps
            qui n’a pas existé.
          </p>
        )}

        {/*
          * UNE MESURE OU UNE ESTIMATION, ET L'ÉCRAN DOIT LE DIRE.
          *
          * Sans rythme saisi, les journées se déduisent du montant facturé
          * divisé par le tarif journalier. Un mois facturé au trimestre affiche
          * alors 0 % alors qu'il a été travaillé, et un forfait au résultat ne
          * se convertit pas en jours du tout. Le taux reste affiché — c'est
          * mieux que rien — mais il ne se présente pas comme un fait.
          */}
        {chiffres.source === 'facturation' && (
          <p className={styles.estimation} role="status">
            Estimé depuis les montants facturés, faute de rythme saisi. Le
            planning donnerait les journées réellement retenues.
          </p>
        )}
      </div>

      <h3 className={styles.sousTitre}>Répartition du temps, ce mois</h3>

      {chiffres.parClient.length === 0
        ? (
          <p className={styles.vide}>
            Aucune journée travaillée ce mois&nbsp;: il n’y a rien à répartir.
          </p>
        )
        : (
          <>
            <span className={styles.barre} aria-hidden="true">
              {chiffres.parClient.map((c) => (
                <span
                  key={c.entiteId}
                  className={styles.segment}
                  style={{
                    width: `${c.part * 100}%`,
                    ...(c.couleur !== '' ? { background: c.couleur } : {})
                  }}
                />
              ))}
            </span>

            <ul className={styles.clients}>
              {chiffres.parClient.map((c) => (
                <li key={c.entiteId} className={styles.client}>
                  <span
                    className={styles.pastille}
                    {...(c.couleur !== '' ? { style: { background: c.couleur } } : {})}
                    aria-hidden="true"
                  />
                  <span className={styles.nomClient}>{c.nom}</span>
                  <span className={styles.joursClient}>{jours(c.jours)}&nbsp;j</span>
                </li>
              ))}
            </ul>
          </>
        )}

      <TeletravailDuMois teletravail={teletravail} />
    </>
  );
}

/**
 * La part de télétravail, et sur quoi elle est calculée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉNOMINATEUR EST L'INFORMATION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le lieu n'est connu que sur les demi-journées dont la position a été saisie.
 * Un mois de vingt jours dont deux seulement portent un lieu, tous deux à
 * domicile, donnerait « 100 % de télétravail » — parfaitement faux, et d'autant
 * plus crédible que le chiffre est rond.
 *
 * La part porte donc sur les demi-journées DOCUMENTÉES, et la ligne dit combien
 * elles sont. Quand elles ne couvrent pas tout le mois, la phrase le dit avant
 * qu'on ait fini de lire le pourcentage.
 *
 * Aucune documentée : on s'abstient, et on dit pourquoi. Un « 0 % » se lirait
 * « je n'ai jamais télétravaillé », ce qui n'est pas ce que l'absence de
 * donnée signifie.
 */
function TeletravailDuMois(
  { teletravail }: { readonly teletravail: Chiffres['teletravail'] }
) {
  if (teletravail === null) {
    return (
      <p className={styles.abstention}>
        <span>Télétravail</span>
        <span className={styles.motifAbstention}>
          aucun lieu renseigné ce mois
        </span>
      </p>
    );
  }

  const complet = teletravail.documentees >= teletravail.travaillees;
  return (
    <div className={styles.teletravail}>
      <p className={styles.enteteOccupation}>
        <span>Télétravail</span>
        <strong className={styles.taux}>
          {Math.round(teletravail.part * 100)}&nbsp;%
        </strong>
      </p>
      {!complet && (
        <p className={styles.detail}>
          sur {teletravail.documentees} demi-journée{teletravail.documentees > 1 ? 's' : ''}
          {' '}renseignée{teletravail.documentees > 1 ? 's' : ''} sur {teletravail.travaillees}
        </p>
      )}
    </div>
  );
}

/** Une quotité lisible : « 18,5 » plutôt que « 18.5 ». */
const jours = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);
