import type { CreneauDuJour, JourDeLaSemaine, PlanningPeriode } from '../../state/selecteurs.activite';
import type { Creneau } from '../../domain/calculs/planning';
import type { DateISO } from '../../domain/types';
import { dateCourte } from '../format';
import { decompterJours } from '../../domain/calculs/activite';
import styles from './VueMois.module.css';

const ENTETES = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

const NOM_CRENEAU: Readonly<Record<Creneau, string>> = {
  matin: 'matin',
  apresMidi: 'après-midi'
};

/**
 * Le mois entier, deux créneaux par jour.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LE MOIS DIT ET QUE LA SEMAINE NE DIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La semaine est la maille où l'on CORRIGE ; le mois est celle où l'on VOIT.
 * Trois semaines chez le même client puis une semaine vide ne se remarque pas
 * en feuilletant quatre écrans — et c'est exactement la forme de trou de
 * trésorerie qui arrive six semaines plus tard, quand la facture manquante
 * aurait dû être encaissée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DES INITIALES, PARCE QU'UNE CASE DE MOIS FAIT 60 PIXELS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La semaine a sept colonnes et peut écrire « Brasserie Vent d'Ouest ». Le mois
 * en a sept aussi mais sur cinq rangs, et chaque case tient un tiers de la
 * hauteur : le nom complet y serait tronqué à « Brass… », ce qui ne distingue
 * plus deux clients. Les initiales le font, à condition que la LÉGENDE les
 * donne — sans elle, « BV » n'est qu'un code.
 *
 * Le nom entier reste dans le nom accessible de chaque case : un lecteur
 * d'écran n'a pas de contrainte de largeur, et lui servir des initiales serait
 * lui servir moins que ce que l'œil reçoit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA GRILLE COMMENCE UN LUNDI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les cases d'avant le 1ᵉʳ sont VIDES et non cliquables : elles appartiennent
 * au mois précédent. Les afficher grisées mais actives ferait poser une journée
 * sur un mois qu'on ne regarde pas, et le CRA du mois affiché n'en dirait rien.
 */
export function VueMois(
  { planning, libellePeriode, aujourdhui, onBasculer }: {
    readonly planning: PlanningPeriode;
    /** « juin 2026 ». Un LIBELLÉ, pas un `Mois` : il ne sert qu'au nom du groupe. */
    readonly libellePeriode: string;
    readonly aujourdhui: DateISO;
    readonly onBasculer: (
      date: DateISO, missionId: string, entiteId: string, creneau: Creneau
    ) => void;
  }
) {
  const decompte = decompterJours(planning.jours);

  /** Les clients présents ce mois-ci, pour la légende — et leurs initiales. */
  const presents = new Map<string, { readonly nom: string; readonly couleur: string }>();
  for (const jour of planning.jours) {
    for (const ligne of jour.parMission) {
      if (ligne.retenu > 0 && !presents.has(ligne.entiteId)) {
        presents.set(ligne.entiteId, { nom: ligne.nom, couleur: ligne.couleur });
      }
    }
  }

  /*
   * Le décalage du 1ᵉʳ : combien de cases vides avant lui.
   *
   * Calculé en UTC comme partout ailleurs. En heure locale, `new Date` sur une
   * date nue tombe la veille au soir en heure d'hiver, et toute la grille
   * glisserait d'un jour — un mois entier de journées attribuées au mauvais
   * jour de semaine.
   */
  const premier = planning.jours[0];
  const decalage = premier === undefined
    ? 0
    : (new Date(`${premier.date}T00:00:00Z`).getUTCDay() + 6) % 7;

  return (
    <>
      <p className={styles.resume}>
        <span>couleur&nbsp;=&nbsp;client · deux créneaux par jour</span>
        {' · '}
        <strong>
          {decompte.ouvres} jour{decompte.ouvres > 1 ? 's' : ''} ouvré{decompte.ouvres > 1 ? 's' : ''}
          {decompte.enConge > 0 && `, dont ${decompte.enConge} de congé`}
        </strong>
      </p>

      <div className={styles.grille} role="group" aria-label={`Plan de charge de ${libellePeriode}`}>
        {ENTETES.map((e, i) => (
          <div key={`${e}-${i}`} className={styles.entete} aria-hidden="true">{e}</div>
        ))}

        {/* Les cases d'avant le 1ᵉʳ. Vides, hors du flux de tabulation, et
            invisibles aux technologies d'assistance : elles ne portent rien. */}
        {Array.from({ length: decalage }, (_, i) => (
          <div key={`vide-${i}`} className={styles.horsMois} aria-hidden="true" />
        ))}

        {planning.jours.map((jour) => (
          <CaseDeJour
            key={jour.date}
            jour={jour}
            estAujourdhui={jour.date === aujourdhui}
            onBasculer={onBasculer}
          />
        ))}
      </div>

      <ul className={styles.legende}>
        {[...presents.values()].map((c) => (
          <li key={c.nom} className={styles.legendeEntree}>
            <span
              className={styles.pastille}
              {...(c.couleur !== '' ? { style: { background: c.couleur } } : {})}
              aria-hidden="true"
            />
            <span className={styles.initialesLegende} aria-hidden="true">{initiales(c.nom)}</span>
            {c.nom}
          </li>
        ))}
        <li className={styles.legendeEntree}>
          <span className={`${styles.pastille} ${styles.pastilleConge}`} aria-hidden="true" />
          <span className={styles.initialesLegende} aria-hidden="true">C</span>
          Congé
        </li>
        <li className={styles.legendeEntree}>
          <span className={styles.lieu} aria-hidden="true">⌂</span>télétravail
        </li>
        <li className={styles.legendeEntree}>
          <span className={styles.lieu} aria-hidden="true">▤</span>sur site
        </li>
      </ul>

      <p className={styles.total}>
        <span>Travaillé ce mois</span>
        <strong>{formater(planning.totalRetenu)} j</strong>
      </p>
    </>
  );
}

function CaseDeJour(
  { jour, estAujourdhui, onBasculer }: {
    readonly jour: JourDeLaSemaine;
    readonly estAujourdhui: boolean;
    readonly onBasculer: (
      date: DateISO, missionId: string, entiteId: string, creneau: Creneau
    ) => void;
  }
) {
  const classes = [
    styles.jour,
    estAujourdhui ? styles.jourCourant : '',
    jour.weekEnd ? styles.weekEnd : '',
    jour.ferie ? styles.ferie : ''
  ].filter((c) => c !== '').join(' ');

  return (
    <div className={classes}>
      <span className={styles.numero} aria-hidden="true">{Number(jour.date.slice(8, 10))}</span>
      {jour.creneaux.map((creneau) => (
        <Demi key={creneau.creneau} jour={jour} creneau={creneau} onBasculer={onBasculer} />
      ))}
    </div>
  );
}

function Demi(
  { jour, creneau, onBasculer }: {
    readonly jour: JourDeLaSemaine;
    readonly creneau: CreneauDuJour;
    readonly onBasculer: (
      date: DateISO, missionId: string, entiteId: string, creneau: Creneau
    ) => void;
  }
) {
  const [premier] = creneau.occupants;
  const occupe = premier !== undefined;
  const enConge = !occupe && jour.conge > 0;

  return (
    <button
      type="button"
      className={`${styles.demi} ${occupe ? styles.occupee : ''} ${enConge ? styles.conge : ''}`}
      // La teinte du client TEINTE la case : c'est le « couleur = client » du
      // dessin, et sur une case de 60 px c'est le seul repère qui se lit de
      // loin. `color-mix` en ligne parce que la teinte vient de la donnée.
      {...(occupe && premier.couleur !== ''
        ? {
          style: {
            background: `color-mix(in srgb, ${premier.couleur} 22%, transparent)`,
            borderColor: `color-mix(in srgb, ${premier.couleur} 55%, transparent)`,
            color: premier.couleur
          }
        }
        : {})}
      onClick={() => onBasculer(
        jour.date, premier?.missionId ?? '', premier?.entiteId ?? '', creneau.creneau
      )}
    >
      <span className={styles.invisible}>
        {dateCourte(jour.date)}, {NOM_CRENEAU[creneau.creneau]}, {etat(jour, creneau)}
      </span>
      <span className={styles.initiales} aria-hidden="true">
        {occupe ? initiales(premier.nom) : enConge ? 'C' : ''}
      </span>
      {/* Le lieu vient du créneau SAISI. Sur un créneau réparti, il n'y en a
          pas : en dessiner un serait l'inventer. */}
      {premier?.sur === 'saisi' && premier.lieu !== null && (
        <span className={styles.lieu} aria-hidden="true">
          {premier.lieu === 'teletravail' ? '⌂' : '▤'}
        </span>
      )}
    </button>
  );
}

/**
 * « Brasserie Vent d'Ouest » → « BV ».
 *
 * Deux lettres, prises sur les deux premiers mots. Un seul mot donne ses deux
 * premières lettres — « Kessler » ferait sinon un « K » solitaire, que tout
 * autre client en K rendrait ambigu.
 */
function initiales(nom: string): string {
  const mots = nom.split(/[\s'’-]+/u).filter((m) => m !== '');
  if (mots.length === 0) return '?';
  if (mots.length === 1) return (mots[0] as string).slice(0, 2).toUpperCase();
  return `${(mots[0] as string)[0] ?? ''}${(mots[1] as string)[0] ?? ''}`.toUpperCase();
}

/**
 * L'état d'une moitié, en toutes lettres.
 *
 * Le NOM COMPLET, jamais les initiales : un lecteur d'écran n'a pas de
 * contrainte de largeur, et lui servir « BV » serait lui servir moins que ce
 * que l'œil reçoit de la case colorée plus sa légende.
 */
function etat(jour: JourDeLaSemaine, creneau: CreneauDuJour): string {
  const noms = creneau.occupants.map((o) => o.nom).join(' et ');
  if (noms !== '') return noms;
  if (jour.ferie) return 'jour férié';
  if (jour.conge > 0) return 'congé';
  if (jour.weekEnd) return 'week-end';
  return 'libre';
}

const formater = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);
