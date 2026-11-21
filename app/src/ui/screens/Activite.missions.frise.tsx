import { useRef } from 'react';
import { useLargeur } from '../useLargeur';
import type { FinDeVisibilite } from '../../domain/calculs/carnetDeCommandes';
import type { DateISO, Mois } from '../../domain/types';
import type { LigneDuCarnet } from '../../state/selecteurs.carnet';
import { eur, formaterJours } from '../format';
import {
  MOIS_COURTS, MOIS_LETTRES, clientsFinaux, enLettres, jourEtMoisLong, moisLongSeul
} from './Activite.missions.lecture';
import styles from './Activite.missions.module.css';

/**
 * Les douze mois à venir : une ligne par mission signée ou prospect, et la
 * rangée des jours signés.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE MONTRE QUE LE TABLEAU NE MONTRE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le TROU. Trois missions qui s'arrêtent fin juin, fin juillet et fin août
 * se lisent dans le tableau comme trois dates ; sur la frise, comme un
 * automne vide — et c'est cette forme-là qui fait décrocher le téléphone.
 * Le prospect y est en pointillé, à sa place dans le temps, et la rangée
 * du bas dit qu'il ne compte pas : « 0 » sous lui, pas ses jours.
 *
 * Dessinée à la largeur RÉELLE de la carte, comme la frise d'Obligations :
 * au bureau, les noms à gauche ; au téléphone, au-dessus des barres, et les
 * mois en une lettre — la frise garde sa hauteur, elle réduit ses
 * graduations (direction, « Téléphone »).
 */

interface Gabarit {
  readonly largeur: number;
  readonly x0: number;
  readonly marge: number;
  readonly yMois: number;
  readonly yPremier: number;
  readonly pas: number;
  readonly mois: readonly string[];
  readonly policeMois: number;
  readonly policeNom: number;
  readonly policeSous: number;
  readonly epaisseur: number;
  /** Le nom au-dessus de la barre, quand la place manque à gauche. */
  readonly nomAuDessus: boolean;
}

/* Les mesures de la maquette `activite.html` : 1 076 de large, les barres à
   partir de 286, une ligne tous les 44, des barres de 14. */
const LARGE: Gabarit = {
  largeur: 1076, x0: 286, marge: 12, yMois: 26, yPremier: 56, pas: 44, mois: MOIS_COURTS,
  policeMois: 12, policeNom: 14.5, policeSous: 12.5, epaisseur: 14, nomAuDessus: false
};

const SERRE: Gabarit = {
  largeur: 322, x0: 0, marge: 0, yMois: 16, yPremier: 50, pas: 44, mois: MOIS_LETTRES,
  policeMois: 10.5, policeNom: 13, policeSous: 12, epaisseur: 12, nomAuDessus: true
};

/** En dessous, la colonne des noms mangerait la moitié des mois. */
const LARGEUR_SERREE = 640;

const joursDuMois = (m: string): number =>
  new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();

const ecartEnMois = (de: string, a: string): number =>
  (Number(a.slice(0, 4)) - Number(de.slice(0, 4))) * 12 + Number(a.slice(5, 7)) - Number(de.slice(5, 7));

/** Une rangée de la frise : une mission signée, ou un prospect. */
interface Rangee {
  readonly ligne: LigneDuCarnet;
  readonly debut: DateISO | null;
  readonly fin: DateISO | null;
  readonly teinte: number;
}

/** Les missions qui ont quelque chose dans les douze mois : signées ou prospects. */
export function rangeesDeLaFrise(
  lignes: readonly LigneDuCarnet[], mois: readonly Mois[], teintes: ReadonlyMap<string, number>
): readonly Rangee[] {
  const premier = `${mois[0] ?? ''}-01`;
  const dernier = `${mois[mois.length - 1] ?? ''}-31`;
  return lignes.flatMap((l): Rangee[] => {
    const m = l.mission;
    if (m.statut !== 'active' && m.statut !== 'prospect') return [];
    const fin = m.statut === 'active' ? l.echeance : m.fin;
    if (fin !== null && fin < premier) return [];
    if (m.debut !== null && m.debut > dernier) return [];
    return [{ ligne: l, debut: m.debut, fin, teinte: teintes.get(m.id) ?? 0 }];
  });
}

/**
 * La phrase qui dit la frise à qui ne la voit pas : ce qui est signé, jusqu'à
 * quand, le prospect, et les jours signés de chaque mois — les nombres de la
 * rangée du bas n'existent nulle part ailleurs en texte.
 */
export function resumeDeLaFrise(
  rangees: readonly Rangee[], mois: readonly Mois[], joursSignes: readonly (number | null)[],
  visibilite: FinDeVisibilite, aujourdhui: DateISO
): string {
  const premier = mois[0];
  const dernier = mois[mois.length - 1];
  if (premier === undefined || dernier === undefined) return '';
  const periode = `${moisLongSeul(premier)} ${premier.slice(0, 4)} à ${moisLongSeul(dernier)} ${dernier.slice(0, 4)}`;
  const signees = rangees.filter((r) => r.ligne.mission.statut === 'active').length;
  const prospects = rangees.filter((r) => r.ligne.mission.statut === 'prospect');
  const parties = [signees === 0
    ? 'aucune mission signée'
    : `${enLettres(signees)} mission${signees > 1 ? 's signées' : ' signée'}`
      + (visibilite.type === 'date'
        ? `, la dernière s’arrête le ${jourEtMoisLong(visibilite.date, aujourdhui)}`
        : visibilite.type === 'sans_fin' ? ', dont une sans fin fixée' : '')];
  for (const p of prospects) {
    const m = p.ligne.mission;
    parties.push(m.debut !== null && m.fin !== null
      ? `un prospect de ${moisLongSeul(m.debut)} à ${moisLongSeul(m.fin)}, non compté`
      : 'un prospect sans dates, non compté');
  }
  const jours = mois.flatMap((m, i) => {
    const j = joursSignes[i];
    return j === null || j === undefined ? [] : [`${moisLongSeul(m)} ${formaterJours(j)}`];
  });
  return `Carnet de ${periode} : ${parties.join(' ; ')}.`
    + (jours.length > 0 ? ` Jours signés : ${jours.join(', ')}.` : '');
}

/** Coupe un libellé que la colonne ne tient pas ; l'infobulle le rend entier. */
function couper(texte: string, max: number): string {
  return texte.length <= max ? texte : `${texte.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export function FriseDuCarnet(
  { rangees, mois, joursSignes, aujourdhui, resume }: {
    readonly rangees: readonly Rangee[];
    readonly mois: readonly Mois[];
    readonly joursSignes: readonly (number | null)[];
    readonly aujourdhui: DateISO;
    readonly resume: string;
  }
) {
  const cadre = useRef<HTMLDivElement>(null);
  const mesure = useLargeur(cadre);
  const g = mesure !== null && mesure < LARGEUR_SERREE ? SERRE : LARGE;
  const large = mesure ?? g.largeur;
  const x1 = large - g.marge;
  const colonne = (x1 - g.x0) / 12;
  const centre = (i: number): number => g.x0 + colonne * (i + 0.5);
  const premier = mois[0] as Mois;

  /** L'abscisse d'une date : le début du jour (`debut`) ou sa fin. */
  const xDe = (d: DateISO | null, bord: 'debut' | 'fin'): number => {
    if (d === null) return bord === 'debut' ? g.x0 : x1;
    const i = ecartEnMois(premier, d.slice(0, 7));
    if (i < 0) return g.x0;
    if (i > 11) return x1;
    const jour = Number(d.slice(8, 10)) - (bord === 'debut' ? 1 : 0);
    return g.x0 + colonne * (i + jour / joursDuMois(d));
  };

  const yRangee = (i: number): number => g.yPremier + g.pas * i;
  const yBas = yRangee(Math.max(rangees.length - 1, 0)) + (g.nomAuDessus ? 20 : 28);
  const yValeurs = yBas + (g.nomAuDessus ? 40 : 22);
  /* Sous 30 px de colonne, « 15,5 » touche son voisin : un mois sur deux
     descend d'une ligne, plutôt que de rogner la demi-journée. */
  const enQuinconce = g.nomAuDessus && (x1 - g.x0) / 12 < 30;
  const hauteur = yValeurs + (g.nomAuDessus ? 12 : 14) + (enQuinconce ? 12 : 0);
  const xAujourdhui = xDe(aujourdhui, 'debut') + colonne / joursDuMois(aujourdhui) / 2;
  const maxNom = Math.floor((g.x0 - 24) / (g.policeNom * 0.56));
  const maxSous = Math.floor((g.x0 - 24) / (g.policeSous * 0.55));

  return (
    <div ref={cadre} className={styles.cadreFrise}>
      <svg className={styles.frise} viewBox={`0 0 ${large} ${hauteur}`} width={large} height={hauteur}
        role="img" aria-label={resume}>
        {/* Le mois courant, en bande : la frise commence toujours par lui. */}
        <rect className={styles.bande} x={g.x0} y={8} width={colonne} height={hauteur - 14} rx={g === LARGE ? 12 : 8} />
        {g.mois.map((_, k) => {
          const i = k;
          const nom = g.mois[(Number(premier.slice(5, 7)) - 1 + i) % 12] ?? '';
          return (
            <g key={i}>
              <text className={i === 0 ? `${styles.mois} ${styles.moisCourant}` : styles.mois}
                x={centre(i)} y={g.yMois} fontSize={g.policeMois}>{nom}</text>
              {i > 0 && <line className={styles.colonne} x1={g.x0 + colonne * i} y1={34} x2={g.x0 + colonne * i} y2={yBas - 6} />}
            </g>
          );
        })}

        {rangees.map((r, i) => {
          const y = yRangee(i);
          const m = r.ligne.mission;
          const prospect = m.statut === 'prospect';
          const xa = Math.max(g.x0 + 5, xDe(r.debut, 'debut'));
          const xb = Math.min(x1 - 2, xDe(r.fin, 'fin'));
          const centreBarre = g.nomAuDessus ? y + 4 : y;
          const finaux = clientsFinaux(m);
          const qui = finaux.length > 0 ? `${finaux.join(', ')}, par ${m.clientNom}` : m.clientNom;
          const sous = `${qui}${prospect ? ` · prospect${m.probabilite != null ? ` ${m.probabilite} %` : ''}` : ''}`;
          const tarif = m.tjm > 0 ? eur(m.tjm) : null;
          return (
            <g key={m.id}>
              <title>{`${r.ligne.nom} — ${sous}`}</title>
              {g.nomAuDessus
                ? null
                : (
                  <>
                    <text className={styles.nomRangee} x={0} y={y - 2} fontSize={g.policeNom}>{couper(r.ligne.nom, maxNom)}</text>
                    <text className={styles.sousRangee} x={0} y={y + 15} fontSize={g.policeSous}>
                      {couper(sous, Math.max(8, maxSous - (tarif === null ? 0 : (i === 0 ? 17 : 8))))}
                      {tarif !== null && (
                        <>
                          {' · '}
                          {/* Le tarif est un montant : masqué en mode confidentiel comme les autres. */}
                          <tspan data-montant="">{tarif}</tspan>
                          {i === 0 ? ' par jour' : ''}
                        </>
                      )}
                    </text>
                  </>
                )}
              {xb > xa && (prospect
                ? (
                  <rect className={styles.barreProspect} x={xa} y={centreBarre - g.epaisseur / 2}
                    width={xb - xa} height={g.epaisseur} rx={g.epaisseur / 2} />
                )
                : (
                  <>
                    <rect className={`${styles.barre} ${styles[`k${r.teinte}`] ?? ''}`} x={xa} y={centreBarre - g.epaisseur / 2}
                      width={xb - xa} height={g.epaisseur} rx={g.epaisseur / 2} />
                    {/* Le rond au bout dit « ça s'arrête là » ; une mission sans fin n'en a pas. */}
                    {r.fin !== null && xDe(r.fin, 'fin') <= x1 && (
                      <circle className={styles.bout} cx={xb - g.epaisseur / 2} cy={centreBarre} r={g.epaisseur / 2 - 3} />
                    )}
                  </>
                ))}
            </g>
          );
        })}

        <line className={styles.aujourdhui} x1={xAujourdhui} y1={32} x2={xAujourdhui} y2={yBas - 6} />
        {/* Au téléphone, les noms passent au-dessus des barres — et des filets :
            posés après eux, avec un liseré de la couleur de la carte, ils se
            lisent sans qu'un trait les barre. */}
        {g.nomAuDessus && rangees.map((r, i) => (
          <text key={r.ligne.mission.id} className={`${styles.nomRangee} ${styles.lisere}`}
            x={0} y={yRangee(i) - 11} fontSize={g.policeNom}>
            {couper(r.ligne.nom, Math.floor(large / (g.policeNom * 0.56)))}
          </text>
        ))}
        <line className={styles.filetBas} x1={0} y1={yBas} x2={x1} y2={yBas} />
        <text className={styles.libelleSignes} x={0} y={g.nomAuDessus ? yBas + 18 : yValeurs}
          fontSize={g === LARGE ? 13.5 : 12}>Jours signés</text>
        {joursSignes.map((j, i) => (
          <text key={i} className={j !== null && j > 0 ? `${styles.valeur} ${styles.valeurForte}` : styles.valeur}
            x={centre(i)} y={yValeurs + (enQuinconce && i % 2 === 1 ? 12 : 0)} fontSize={g === LARGE ? 13 : 10.5}>
            {j === null ? '—' : formaterJours(j)}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** La légende de la frise : trois signes, posés en tête de la carte. */
export function LegendeDuCarnet() {
  return (
    <p className={styles.legende}>
      <span><svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><rect className={`${styles.barre} ${styles.k1}`} x="1" y="1" width="24" height="8" rx="4" /></svg>signé</span>
      <span><svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><rect className={styles.barreProspect} x="1" y="1" width="24" height="8" rx="4" /></svg>prospect, non compté</span>
      <span><svg width="8" height="14" viewBox="0 0 8 14" aria-hidden="true"><line className={styles.aujourdhui} x1="4" y1="0" x2="4" y2="14" /></svg>aujourd’hui</span>
    </p>
  );
}
