import type { CreneauDuJour, JourDeLaSemaine, PlanningSemaine } from '../../state/selecteurs.activite';
import type { Creneau, Lieu } from '../../domain/calculs/planning';
import type { DateISO } from '../../domain/types';
import { dateCourte } from '../format';
import { decompterJours } from '../../domain/calculs/activite';
import styles from './VueSemaine.module.css';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Les deux moitiés, telles que le dessin les nomme au-dessus de chaque case. */
const NOM_CRENEAU: Readonly<Record<Creneau, string>> = {
  matin: 'MATIN',
  apresMidi: 'APRÈS-M.'
};

/** Le lieu, en toutes lettres. Le pictogramme seul ne se lit pas. */
const NOM_LIEU: Readonly<Record<Lieu, string>> = {
  teletravail: 'télétravail',
  sur_site: 'sur site'
};

/**
 * La vue semaine du planning.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA SEMAINE EST LA MAILLE DE LA CORRECTION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le rythme remplit le mois d'un coup ; ce qu'on corrige, on le corrige à la
 * semaine, parce que c'est l'horizon dont on se souvient. Une grille de
 * trente-et-un jours oblige à retrouver le bon — et une correction qu'on
 * renonce à faire est un CRA faux.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA JOURNÉE SE LIT PAR CRÉNEAU, ET NON PAR CLIENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La version précédente empilait une paire de cases par client opérationnel.
 * C'était la seule forme possible tant que la position d'une demi-journée
 * n'existait pas : deux clients le même jour donnaient deux paires, sans qu'on
 * puisse dire lequel occupait la matinée.
 *
 * Le dessin range dans l'autre sens — une ligne MATIN, une ligne APRÈS-MIDI,
 * et le client À L'INTÉRIEUR — et c'est la question qu'on se pose vraiment en
 * regardant sa semaine : « où j'étais mercredi matin ». Depuis le schéma 14, la
 * donnée permet d'y répondre.
 *
 * Un créneau peut porter DEUX occupants : deux rythmes qui prévoient tous deux
 * le lundi matin. Le dessin ne montre jamais le cas parce que son jeu d'exemple
 * ne l'a pas ; n'en afficher qu'un ferait disparaître du travail déclaré, en
 * silence, pendant que le CRA continuerait de le compter.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE LIEU NE S'AFFICHE QUE S'IL EST SU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un créneau `reparti` — déduit de la seule quotité, sans position saisie —
 * n'a pas de lieu, et on n'en dessine pas. Poser « télétravail » par défaut
 * remplirait le plan de charge de journées à domicile que personne n'a
 * déclarées, indiscernables des vraies.
 */
export function VueSemaine(
  { planning, aujourdhui, onBasculer, onRevenirAuRythme }: {
    readonly planning: PlanningSemaine;
    readonly aujourdhui: DateISO;
    /** Bascule UN créneau d'une ligne. Ligne vide : on demande à qui l'affecter. */
    readonly onBasculer: (
      date: DateISO, missionId: string, entiteId: string, creneau: Creneau
    ) => void;
    /** Efface les corrections de la semaine : les journées redeviennent le rythme. */
    readonly onRevenirAuRythme: () => void;
  }
) {
  // Le bouton n'apparaît que s'il y a quelque chose à défaire. Un bouton
  // toujours là qui ne fait rien apprend à ne plus le regarder.
  const corrigee = planning.jours.some((j) => j.parMission.some((l) => l.ajuste));

  /**
   * Le décompte de la semaine affichée, calculé par le DOMAINE.
   *
   * Le calcul ne vit PAS ici. Une première version le faisait dans ce
   * composant, et comptait les congés parmi les ouvrés là où le plan de charge
   * du mois les en retire : même mot, deux nombres, même écran. Les deux
   * réponses étaient justes pour deux questions différentes — d'où deux noms,
   * et une seule fonction qui les rend tous les deux.
   */
  const decompte = decompterJours(planning.jours);

  /** Les clients présents cette semaine, pour la légende. Un seul par teinte. */
  const presents = new Map<string, { readonly nom: string; readonly couleur: string }>();
  for (const jour of planning.jours) {
    for (const ligne of jour.parMission) {
      if (ligne.retenu > 0 && !presents.has(ligne.entiteId)) {
        presents.set(ligne.entiteId, { nom: ligne.nom, couleur: ligne.couleur });
      }
    }
  }

  return (
    <>
      {/*
        * La ligne de lecture du dessin : ce que la grille montre, puis le
        * compte. « matin / après-midi » y est une CONVENTION d'affichage pour
        * toute journée dont la position n'a pas été saisie — l'écrire ici est
        * la seule façon de ne pas laisser croire à un fait.
        */}
      <p className={styles.resumeSemaine}>
        <span className={styles.conventions}>matin&nbsp;/&nbsp;après-midi · client · lieu</span>
        {' · '}
        <strong>
          {decompte.ouvres} jour{decompte.ouvres > 1 ? 's' : ''} ouvré{decompte.ouvres > 1 ? 's' : ''}
          {decompte.enConge > 0 && `, dont ${decompte.enConge} de congé`}
        </strong>
      </p>

      <div className={styles.semaine}>
        {planning.jours.map((jour, index) => {
          const numero = Number(jour.date.slice(8, 10));
          const estAujourdhui = jour.date === aujourdhui;

          return (
            <div
              key={jour.date}
              className={`${styles.colonne} ${estAujourdhui ? styles.colonneDuJour : ''}`}
            >
              <div className={styles.enteteJour}>
                <span aria-hidden="true">{JOURS[index]} {numero}</span>
                <span className={styles.invisible}>{dateCourte(jour.date)}</span>
              </div>

              {jour.creneaux.map((creneau) => (
                <CaseDeCreneau
                  key={creneau.creneau}
                  jour={jour}
                  creneau={creneau}
                  onBasculer={onBasculer}
                />
              ))}
            </div>
          );
        })}
      </div>

      <ul className={styles.legende}>
        {[...presents.values()].map((c) => (
          <li key={c.nom} className={styles.legendeEntree}>
            <span
              className={styles.pastille}
              {...(c.couleur !== '' ? { style: { background: c.couleur } } : {})}
              aria-hidden="true"
            />
            {c.nom}
          </li>
        ))}
        <li className={styles.legendeEntree}>
          <span className={`${styles.pastille} ${styles.pastilleConge}`} aria-hidden="true" />
          Congé
        </li>
        {/* Ici le pictogramme est MUET : son nom est écrit juste à côté, et
            `MarqueLieu` le répéterait hors écran — un lecteur d'écran
            entendrait « télétravail télétravail ». */}
        <li className={styles.legendeEntree}>
          <span className={styles.lieu} aria-hidden="true">⌂</span>télétravail
        </li>
        <li className={styles.legendeEntree}>
          <span className={styles.lieu} aria-hidden="true">▤</span>sur site
        </li>
      </ul>

      <p className={styles.total}>
        <span>Travaillé cette semaine</span>
        <strong>{formater(planning.totalRetenu)} j</strong>
      </p>

      {corrigee && (
        <button type="button" className={styles.revenir} onClick={onRevenirAuRythme}>
          Revenir au rythme sur cette semaine
        </button>
      )}
    </>
  );
}

/**
 * Une case : une moitié de journée.
 *
 * Elle reste un BOUTON même vide. C'est là qu'on déclare une demi-journée que
 * le rythme ne prévoyait pas — un rendu un samedi, une astreinte un férié — et
 * l'ancienne application le permettait déjà.
 */
function CaseDeCreneau(
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
  // Le congé ne se dessine que sur une moitié LIBRE : une demi-journée de congé
  // le matin laisse l'après-midi travaillé, et hachurer les deux dirait le
  // contraire de ce que le CRA compte.
  const enConge = !occupe && jour.conge > 0;
  const libre = !occupe && !enConge;

  const classes = [
    styles.creneau,
    occupe ? styles.travaille : '',
    occupe && premier.ajuste ? styles.ajuste : '',
    enConge ? styles.conge : '',
    jour.ferie ? styles.ferie : '',
    jour.weekEnd ? styles.weekEnd : ''
  ].filter((c) => c !== '').join(' ');

  // Le fond de la bande, pas seulement sa bordure. Depuis que la bande est
  // pleine largeur (correction d'ergonomie ci-dessous), c'est elle qui porte
  // « couleur = client » — `fondBande` répond `undefined` si personne n'a de
  // teinte choisie, et le vert par défaut de `.travaille` reprend la main.
  const fond = occupe ? fondBande(creneau.occupants) : undefined;

  return (
    <button
      type="button"
      className={classes}
      {...(fond !== undefined ? { style: { background: fond } } : {})}
      onClick={() => onBasculer(
        jour.date,
        premier?.missionId ?? '',
        premier?.entiteId ?? '',
        creneau.creneau
      )}
    >
      <span className={styles.invisible}>
        {dateCourte(jour.date)}, {creneau.creneau === 'matin' ? 'matin' : 'après-midi'},{' '}
        {etatDuCreneau(jour, creneau)}
      </span>

      <span className={styles.enteteCreneau} aria-hidden="true">
        <span className={styles.etiquetteCreneau}>{NOM_CRENEAU[creneau.creneau]}</span>
        {/* Le lieu vient du créneau SAISI. Sur un créneau réparti, il n'y en a
            pas : le sélecteur rend `null`, et rien ne se dessine. */}
        {premier?.sur === 'saisi' && premier.lieu !== null && <MarqueLieu lieu={premier.lieu} />}
      </span>

      {occupe && (
        <span aria-hidden="true">
          {creneau.occupants.map((o) => (
            <span key={o.entiteId} className={styles.occupant}>
              <span
                className={styles.nomClient}
                {...(o.couleur !== '' ? { style: { color: o.couleur } } : {})}
              >
                {o.nom}
              </span>
              {o.description !== '' && (
                <span className={styles.descriptionMission}>{o.description}</span>
              )}
            </span>
          ))}
        </span>
      )}

      {enConge && <span className={styles.motCase} aria-hidden="true">Congé</span>}
      {libre && <span className={styles.motLibre} aria-hidden="true">libre</span>}
    </button>
  );
}

/**
 * Le fond d'une bande : la teinte du ou des clients qui l'occupent.
 *
 * Une bande à DEUX occupants — deux rythmes qui prévoient tous deux le lundi
 * matin — n'a pas une seule couleur qui les représente. La version d'avant ne
 * peignait que celle du premier, en bordure : la bordure désignait un client,
 * le contenu en désignait deux. On partage la bande en autant de tranches que
 * d'occupants plutôt que d'en retenir un au hasard — c'est un choix parmi
 * d'autres (une bordure neutre en aurait été un autre), mais celui-ci garde le
 * repère de couleur que le reste de l'écran promet.
 */
function fondBande(occupants: readonly { readonly couleur: string }[]): string | undefined {
  const couleurs = occupants.map((o) => o.couleur).filter((c) => c !== '');
  if (couleurs.length === 0) return undefined;
  const part = 100 / couleurs.length;
  const tranches = couleurs
    .map((c, i) => `color-mix(in srgb, ${c} 22%, var(--panel)) ${i * part}% ${(i + 1) * part}%`)
    .join(', ');
  // À la verticale : les occupants s'empilent dans la bande dans le même
  // ordre, et chaque tranche de couleur tombe derrière celui qu'elle désigne.
  return `linear-gradient(180deg, ${tranches})`;
}

/** Le pictogramme du lieu, avec son nom pour qui ne le voit pas. */
function MarqueLieu({ lieu }: { readonly lieu: Lieu }) {
  return (
    <span className={styles.lieu} title={NOM_LIEU[lieu]}>
      <span aria-hidden="true">{lieu === 'teletravail' ? '⌂' : '▤'}</span>
      <span className={styles.invisible}>{NOM_LIEU[lieu]}</span>
    </span>
  );
}

/**
 * L'état d'un créneau, en toutes lettres, pour les lecteurs d'écran.
 *
 * Il nomme le client : un lecteur d'écran qui entendrait « travaillé » sur
 * quatorze cases n'aurait aucun moyen de reconstituer la semaine que l'œil lit
 * d'un coup.
 */
function etatDuCreneau(jour: JourDeLaSemaine, creneau: CreneauDuJour): string {
  const noms = creneau.occupants
    .map((o) => (o.description !== '' ? `${o.nom}, ${o.description}` : o.nom))
    .join(' et ');
  if (noms !== '') {
    const ajuste = creneau.occupants.some((o) => o.ajuste) ? ', ajusté' : '';
    return `${noms}${ajuste}`;
  }
  if (jour.ferie) return 'jour férié';
  if (jour.conge > 0) return 'congé';
  if (jour.weekEnd) return 'week-end';
  return 'libre';
}

/** Une quotité lisible : « 4,5 » plutôt que « 4.5 ». */
const formater = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);
