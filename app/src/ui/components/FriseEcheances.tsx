import { useId } from 'react';
import type { DateISO } from '../../domain/types';
import type { Echeance, NatureDette } from '../../domain/calculs/provisions';
import { Montant } from './Montant';
import styles from './FriseEcheances.module.css';

/**
 * L'année des obligations, posée sur une frise.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'UNE LISTE GROUPÉE NE PEUT PAS DIRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'écran affichait les échéances en liste, groupées par mois. C'est la bonne
 * forme pour AGIR — chaque ligne porte son bouton — et la mauvaise pour VOIR :
 * une liste ne montre pas les intervalles. Or c'est l'intervalle qui compte.
 * Deux échéances à trois semaines l'une de l'autre en octobre, c'est un
 * problème de trésorerie ; les mêmes réparties sur six mois n'en sont pas un,
 * et la liste les présente identiquement.
 *
 * La frise place chaque obligation à sa date réelle sur l'année. On voit les
 * grappes, on voit les trous, et on voit où l'on est.
 *
 * Elle ne REMPLACE pas la liste : elle la précède. La frise répond à « qu'est-ce
 * qui vient cette année », la liste à « qu'est-ce que j'en fais ». Supprimer la
 * seconde aurait retiré les seuls boutons de l'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE REPÈRE « AUJ. » EST L'ÉLÉMENT UTILE, PAS UN ORNEMENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Sans lui, une frise annuelle se lit pareil en février et en novembre. C'est
 * le même défaut que les jauges de seuil avaient avant qu'on y pose la part de
 * l'année écoulée : « 69 % du plafond » est une bonne nouvelle en mars et un
 * problème en novembre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA FRISE EST UNE IMAGE, LES ÉTIQUETTES SONT LA DONNÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chaque jalon porte son nom, sa date et son montant en TEXTE. La position sur
 * l'axe est une commodité de lecture, pas le seul support de l'information —
 * sans quoi la frise serait illisible à qui n'y voit rien.
 */

const MOIS_AXE = [
  'jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'
];

/**
 * Le nom court, pour tenir sous un jalon.
 *
 * `LIBELLE_NATURE` donne « URSSAF — cotisations sociales », qui est le bon
 * libellé dans une légende mais fait quatre lignes sous un point de frise. Les
 * deux coexistent : celui-ci ne sert qu'ici, et la légende garde l'autre.
 */
const NOM_COURT: Readonly<Record<NatureDette, string>> = {
  urssaf: 'URSSAF',
  tva: 'TVA',
  impot: 'Impôt',
  cfe: 'CFE',
  cfp: 'CFP'
};

/** Les natures présentes dans la légende, dans l'ordre du dessin. */
const ORDRE_LEGENDE: readonly NatureDette[] = ['urssaf', 'tva', 'impot', 'cfe'];

export function FriseEcheances(
  { echeances, annee, aujourdhui, formater }: {
    readonly echeances: readonly Echeance[];
    readonly annee: number;
    readonly aujourdhui: DateISO;
    readonly formater: (valeur: number) => string;
  }
) {
  const idTitre = useId();

  const jalons = echeances
    .filter((e) => e.echeanceLe.startsWith(String(annee)))
    .map((e) => ({
      id: e.id,
      nature: e.nature,
      montant: e.montant,
      date: e.echeanceLe,
      payee: e.payeeLe !== null,
      // Une échéance passée et non payée est un RETARD, pas une échéance « à
      // venir » comme les autres : c'est l'information la plus importante de
      // la frise, et elle se perdrait si on la confondait avec l'une des deux
      // autres. Le jour même reste « à payer » — comparaison stricte, comme
      // `statutDe` dans `Echeances.tsx` : on a la journée pour régler.
      enRetard: e.payeeLe === null && e.echeanceLe < aujourdhui,
      part: partDeLAnnee(e.echeanceLe)
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (jalons.length === 0) {
    return (
      <p className={styles.vide}>
        Aucune échéance enregistrée pour {annee}. Tant qu’il n’y en a pas, le
        disponible et le versable sont <strong>surestimés</strong>.
      </p>
    );
  }

  /*
   * Deux jalons proches se chevaucheraient. On les décale d'un rang, en
   * alternance, plutôt que de les serrer : une étiquette tronquée ne se lit
   * plus, et c'est justement quand deux échéances sont proches qu'on a besoin
   * de les lire toutes les deux.
   */
  const ECART_MINIMAL = 0.075;
  let precedent = -1;
  let rang = 0;
  const places = jalons.map((j) => {
    rang = precedent >= 0 && j.part - precedent < ECART_MINIMAL ? (rang + 1) % 2 : 0;
    precedent = j.part;
    return { ...j, rang };
  });

  const partDuJour = partDeLAnnee(aujourdhui);
  const dansLAnnee = aujourdhui.startsWith(String(annee));

  /*
   * La part de l'axe déjà écoulée — pas la part déjà PAYÉE.
   *
   * Le vert dit « ce temps est passé », un fait indépendant de ce qui a été
   * réglé ou non : une année où tout traîne encore impayé a quand même des
   * mois qui se sont écoulés, et l'axe doit le montrer. Confondre les deux
   * ferait dire au trait vert « tout va bien jusque-là », ce qu'il ne sait pas.
   *
   * Hors de l'année affichée, il n'y a pas de repère « auj. » à qui raccorder
   * le trait : soit l'année entière est déjà passée (tout est vert), soit elle
   * n'a pas commencé (rien ne l'est).
   */
  const partEcoulee = dansLAnnee
    ? partDuJour
    : Number(aujourdhui.slice(0, 4)) > annee ? 1 : 0;

  return (
    <figure className={styles.figure} aria-labelledby={idTitre}>
      <figcaption className={styles.horsEcran} id={idTitre}>
        Échéances et obligations de l’année {annee}
      </figcaption>

      <div className={styles.legende} aria-hidden="true">
        {ORDRE_LEGENDE.map((n) => (
          <span key={n} className={styles.entreeLegende}>
            <span className={`${styles.pastille} ${styles[n]}`} />{NOM_COURT[n]}
          </span>
        ))}
      </div>

      <div className={styles.frise}>
        {places.map((j) => (
          <span
            key={j.id}
            className={`${styles.jalon} ${j.rang === 1 ? styles.jalonHaut : ''}`}
            style={{ left: `${j.part * 100}%` }}
          >
            <span className={styles.jalonNom}>
              {NOM_COURT[j.nature]}
              {/* Une échéance réglée reste sur la frise : elle raconte l'année.
                  Mais elle ne doit pas se lire comme une charge à venir, d'où
                  la marque plutôt que la suppression. */}
              {j.payee && <span className={styles.reglee}> réglée</span>}
              {/* Le retard se dit en toutes lettres : la couleur du point ne
                  suffit pas à qui ne la distingue pas, et c'est justement
                  l'information qui ne doit pas se perdre. */}
              {j.enRetard && <span className={styles.enRetard}> en retard</span>}
            </span>
            <span className={styles.jalonMontant}>
              <Montant>{formater(j.montant)}</Montant>
            </span>
            <span className={styles.jalonDate}>{jourEtMois(j.date)}</span>
            {/*
             * PASSÉ ≠ RÉGLÉ, et le point ne doit confondre ni l'un ni l'autre.
             *
             * Pleine pour ce qui est réglé, creuse pour ce qui vient — dans cet
             * ordre, et pas l'inverse : une pastille pleine se lit comme
             * « acquis », un anneau comme « en attente », et c'est bien ce que
             * sont une échéance payée et une échéance qui ne l'est pas encore.
             *
             * Le retard n'est ni l'un ni l'autre : la date est passée mais rien
             * n'a été réglé. Le confondre avec un anneau « à venir » masquerait
             * le seul cas où le disponible est réellement en danger ; le
             * confondre avec une pastille pleine ferait croire l'argent déjà
             * sorti. D'où une troisième marque — rouge, pleine — qui ne peut
             * être prise pour aucune des deux autres.
             */}
            <span
              className={`${styles.point} ${styles[j.nature]} `
                + (j.enRetard ? styles.pointRetard : j.payee ? '' : styles.pointAVenir)}
              aria-hidden="true"
            />
          </span>
        ))}

        {/* Le repère du jour. Sans lui, une frise annuelle se lit pareil en
            février et en novembre. */}
        {dansLAnnee && (
          <span className={styles.repere} style={{ left: `${partDuJour * 100}%` }}>
            <span className={styles.repereLibelle}>auj.</span>
          </span>
        )}

        <span className={styles.axe} aria-hidden="true" />
        {/* Superposé au segment écoulé : même position verticale que `.axe`,
            mais large seulement de la part du temps déjà passée. Après lui, le
            gris de `.axe` reste visible tel quel. */}
        {partEcoulee > 0 && (
          <span
            className={styles.axeEcoule}
            aria-hidden="true"
            style={{ width: `${partEcoulee * 100}%` }}
          />
        )}
      </div>

      <div className={styles.axeMois} aria-hidden="true">
        {MOIS_AXE.map((m) => <span key={m} className={styles.moisAxe}>{m}</span>)}
      </div>
    </figure>
  );
}

/**
 * La position d'une date dans son année, entre 0 et 1.
 *
 * Calculée en UTC, comme partout ailleurs : en heure locale, un passage à
 * l'heure d'été fait un jour de 23 heures et décale tous les jalons postérieurs
 * d'une fraction de journée. Invisible à l'œil, mais deux calculs de position
 * qui ne tombent pas d'accord finissent par mettre le repère du jour du mauvais
 * côté d'une échéance qui tombe aujourd'hui.
 */
function partDeLAnnee(date: DateISO): number {
  const annee = Number(date.slice(0, 4));
  const debut = Date.UTC(annee, 0, 1);
  const fin = Date.UTC(annee + 1, 0, 1);
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return 0;
  return Math.min(1, Math.max(0, (t - debut) / (fin - debut)));
}

/** « 2026-07-05 » → « 5 juil ». */
function jourEtMois(date: DateISO): string {
  const jour = Number(date.slice(8, 10));
  const mois = MOIS_AXE[Number(date.slice(5, 7)) - 1] ?? '';
  return `${jour} ${mois}`;
}
