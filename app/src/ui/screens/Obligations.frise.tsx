import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import type { DateISO } from '../../domain/types';
import type { Obligation } from '../../domain/calculs/obligations';
import {
  LIGNES_FRISE, LIGNE_DE_NATURE, type LigneFrise, RANG_SIGNE, type Signe, dateDe, jourMois, moisLongDe,
  nomDeLigne, signeDe
} from './Obligations.lecture';
import styles from './Obligations.module.css';

/**
 * La frise de l'année : une ligne par nature, un signe par mois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE MONTRE QUE LA LISTE NE MONTRE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les INTERVALLES. Deux paiements à trois semaines l'un de l'autre en
 * octobre sont un problème de trésorerie ; les mêmes répartis sur six mois
 * n'en sont pas un, et une liste les présente identiquement. Elle montre
 * aussi le RYTHME : quatre ronds pleins sur la ligne URSSAF disent une
 * année tenue, sans lire une date.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN SIGNE PAR MOIS ET PAR LIGNE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La DES mensuelle et la CA3 du même mois partagent la ligne TVA ; douze
 * acomptes d'impôt, la ligne Impôt. Deux signes au même endroit se
 * recouvriraient en un pâté illisible : le mois prend le signe le plus
 * pressant (▲ avant ◇ avant ○ avant ●), et son infobulle les nomme tous.
 * Le détail est dans la liste, juste en dessous — la frise donne la forme
 * de l'année, pas l'inventaire.
 *
 * Le dessin est celui de la maquette, au pixel près de `calme.css` : un
 * gabarit large au bureau, un gabarit serré au téléphone (mois en une
 * lettre), choisi sur la largeur RÉELLE de la carte — au bureau étroit, la
 * carte fait moins de 600 px, et le gabarit large y écrirait en 7 px.
 */

interface Gabarit {
  readonly largeur: number;
  /** Le début et la fin de l'axe des mois. */
  readonly x0: number;
  readonly x1: number;
  readonly yMois: number;
  readonly y1: number;
  readonly pas: number;
  readonly bas: number;
  readonly margeBande: number;
  readonly rayonPlein: number;
  readonly rayonCreux: number;
  readonly losange: number;
  readonly mois: readonly string[];
  /** La pastille de couleur devant le nom de la ligne : au bureau seulement. */
  readonly pastille: boolean;
  readonly policeMois: number;
  readonly policeNom: number;
}

const LARGE: Gabarit = {
  largeur: 1076, x0: 132, x1: 1064, yMois: 26, y1: 55, pas: 42, bas: 33, margeBande: 8,
  rayonPlein: 6.5, rayonCreux: 6, losange: 12,
  mois: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  pastille: true, policeMois: 12, policeNom: 14
};

const SERRE: Gabarit = {
  largeur: 322, x0: 70, x1: 322, yMois: 16, y1: 42, pas: 34, bas: 18, margeBande: 4,
  rayonPlein: 5.5, rayonCreux: 5, losange: 10,
  mois: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
  pastille: false, policeMois: 10.5, policeNom: 12.5
};

/** En dessous, la carte est celle d'un téléphone ou d'un bureau étroit : le gabarit serré. */
const LARGEUR_SERREE = 640;

interface Marque {
  readonly mois: number;
  readonly signe: Signe;
  readonly obligations: readonly Obligation[];
}

const MOT: Readonly<Record<Signe, string>> = {
  fait: 'fait', a_faire: 'à faire', a_venir: 'à venir', en_retard: 'en retard', non_suivi: 'non suivi'
};

/** Les marques d'une ligne, un mois au plus une fois. */
export function marquesDeLaLigne(obligations: readonly Obligation[], ligne: LigneFrise): readonly Marque[] {
  const parMois = new Map<number, Obligation[]>();
  for (const o of obligations) {
    if (LIGNE_DE_NATURE[o.nature] !== ligne) continue;
    const m = Number(dateDe(o).slice(5, 7)) - 1;
    parMois.set(m, [...(parMois.get(m) ?? []), o]);
  }
  return [...parMois.entries()]
    .sort(([a], [b]) => a - b)
    .map(([mois, liste]) => ({
      mois,
      obligations: liste,
      signe: liste.map(signeDe).sort((a, b) => RANG_SIGNE[a] - RANG_SIGNE[b])[0] as Signe
    }));
}

/** « janvier, avril et juillet ». */
const enumerer = (mots: readonly string[]): string =>
  (mots.length <= 1 ? mots.join('') : `${mots.slice(0, -1).join(', ')} et ${mots.at(-1) ?? ''}`);

/**
 * La phrase qui dit la frise à qui ne la voit pas — et qui la résume à qui la
 * voit : « URSSAF : fait en janvier et avril, à venir en juillet et
 * octobre ; TVA : à faire en juillet ».
 */
export function resumeDeLaFrise(annee: number, lignes: readonly { ligne: LigneFrise; marques: readonly Marque[] }[]): string {
  if (lignes.length === 0) return `Aucune obligation en ${annee}.`;
  return `L’année ${annee}, ${lignes.map(({ ligne, marques }) => {
    const parSigne = (['en_retard', 'a_faire', 'a_venir', 'fait', 'non_suivi'] as const)
      .map((s) => ({ s, mois: marques.filter((m) => m.signe === s).map((m) => moisLongDe(`2000-${String(m.mois + 1).padStart(2, '0')}-01`)) }))
      .filter((x) => x.mois.length > 0)
      .map((x) => `${MOT[x.s]} en ${enumerer(x.mois)}`);
    return `${nomDeLigne(ligne)} : ${parSigne.join(', ')}`;
  }).join(' ; ')}.`;
}

export function FriseObligations(
  { obligations, annee, aujourdhui }: {
    /** Les obligations de l'année, déjà choisies par l'écran. */
    readonly obligations: readonly Obligation[];
    readonly annee: number;
    readonly aujourdhui: DateISO;
  }
) {
  const cadre = useRef<HTMLDivElement>(null);
  const largeur = useLargeur(cadre);
  const g = largeur !== null && largeur < LARGEUR_SERREE ? SERRE : LARGE;

  const lignes = LIGNES_FRISE
    .map((ligne) => ({ ligne, marques: marquesDeLaLigne(obligations, ligne) }))
    .filter((l) => l.marques.length > 0);
  const resume = resumeDeLaFrise(annee, lignes);

  /* Le dessin se fait à la largeur RÉELLE de la carte, sans mise à
     l'échelle : un gabarit étiré écrivait ses mois en 20 px sur un bureau
     étroit, un gabarit tassé en 7 px. Hors mesure (tests), celle de la
     maquette. */
  const large = largeur ?? g.largeur;
  const x1 = large - (g.largeur - g.x1);
  const colonne = (x1 - g.x0) / 12;
  const xDuMois = (m: number): number => g.x0 + colonne * (m + 0.5);
  const yDeLigne = (i: number): number => g.y1 + g.pas * i;
  const hauteur = g.y1 + g.pas * Math.max(lignes.length - 1, 0) + g.bas;
  const moisCourant = aujourdhui.startsWith(String(annee)) ? Number(aujourdhui.slice(5, 7)) - 1 : null;

  return (
    <div ref={cadre}>
      {lignes.length === 0
        ? <p className={styles.vide}>{resume}</p>
        : (
          <svg
            className={styles.frise}
            viewBox={`0 0 ${large} ${hauteur}`}
            width={large}
            height={hauteur}
            role="img"
            aria-label={resume}
          >
            {/* Le mois courant, en bande : sans lui, la frise se lirait pareil
                en février et en novembre. */}
            {moisCourant !== null && (
              <rect
                className={styles.bande}
                x={xDuMois(moisCourant) - colonne / 2}
                y={g.margeBande}
                width={colonne}
                height={hauteur - 2 * g.margeBande}
                rx={g === LARGE ? 12 : 8}
              />
            )}
            {g.mois.map((nom, m) => (
              <text
                key={m}
                className={m === moisCourant ? `${styles.mois} ${styles.moisCourant}` : styles.mois}
                x={xDuMois(m)}
                y={g.yMois}
                fontSize={g.policeMois}
              >
                {nom}
              </text>
            ))}
            {lignes.map(({ ligne, marques }, i) => {
              const y = yDeLigne(i);
              const faits = marques.filter((m) => m.obligations.some((o) => signeDe(o) === 'fait'));
              const dernierFait = faits.at(-1);
              return (
                <g key={ligne} className={styles[ligne]}>
                  {g.pastille && <circle className={styles.teinte} cx={5} cy={y} r={4.5} />}
                  <text className={styles.nomLigne} x={g.pastille ? 18 : 0} y={y + (g === LARGE ? 5 : 4)} fontSize={g.policeNom}>
                    {nomDeLigne(ligne)}
                  </text>
                  <line className={styles.axe} x1={g.x0} y1={y} x2={x1} y2={y} />
                  {/* Le trait plein jusqu'au dernier fait : ce qui est tenu. */}
                  {dernierFait !== undefined && (
                    <line className={styles.tenu} x1={g.x0} y1={y} x2={xDuMois(dernierFait.mois)} y2={y} />
                  )}
                  {marques.map((m) => (
                    <SigneDuMois key={m.mois} marque={m} x={xDuMois(m.mois)} y={y} g={g} />
                  ))}
                </g>
              );
            })}
          </svg>
        )}
      {lignes.length > 0 && <LegendeFrise classe={styles.legendeBas} />}
    </div>
  );
}

/**
 * Les quatre signes. Au bureau dans l'en-tête de la carte, au téléphone sous
 * la frise — comme les deux maquettes ; la feuille de style montre l'une ou
 * l'autre, jamais les deux.
 */
export function LegendeFrise({ classe }: { readonly classe: string | undefined }) {
  return (
    <p className={`${styles.legende} ${classe ?? ''}`}>
      <span>● fait</span><span>◇ à faire</span><span>○ à venir</span><span>▲ en retard</span>
    </p>
  );
}

/** Le signe d'un mois, et son infobulle : chaque obligation qu'il recouvre. */
function SigneDuMois({ marque, x, y, g }: { readonly marque: Marque; readonly x: number; readonly y: number; readonly g: Gabarit }) {
  const infobulle = marque.obligations
    .map((o) => `${o.libelle} — ${MOT[signeDe(o)]}, le ${jourMois(dateDe(o))}`)
    .join('\n');
  const c = g.losange / 2;
  const forme = (() => {
    switch (marque.signe) {
      case 'fait':
        return <circle className={styles.plein} cx={x} cy={y} r={g.rayonPlein} />;
      case 'a_faire':
        return (
          <rect className={styles.losange} x={x - c} y={y - c} width={g.losange} height={g.losange}
            rx={g === LARGE ? 2.5 : 2} transform={`rotate(45 ${x} ${y})`} />
        );
      case 'en_retard': {
        const s = g.losange * 0.62;
        return <path className={styles.triangle} d={`M${x} ${y - s}L${x + s} ${y + s * 0.8}L${x - s} ${y + s * 0.8}Z`} />;
      }
      case 'non_suivi':
        return <circle className={styles.inconnu} cx={x} cy={y} r={g.rayonCreux} />;
      default:
        return <circle className={styles.creux} cx={x} cy={y} r={g.rayonCreux} />;
    }
  })();
  return <g><title>{infobulle}</title>{forme}</g>;
}

/**
 * La largeur de la carte, suivie quand la fenêtre change ; `null` tant
 * qu'elle n'est pas mesurée — ou là où rien ne se mesure (tests).
 */
function useLargeur(ref: RefObject<HTMLDivElement | null>): number | null {
  const [largeur, setLargeur] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return undefined;
    const mesurer = () => setLargeur(el.clientWidth > 0 ? el.clientWidth : null);
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    return () => observateur.disconnect();
  }, [ref]);
  return largeur;
}
