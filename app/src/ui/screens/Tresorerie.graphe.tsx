import { Suspense, useId, useMemo, useRef, useState } from 'react';
import { composantALaDemande } from '../composantALaDemande';
import { useFaits } from '../../state/store';
import {
  type MoisDeTresorerie, type ResumeDeProjection, type ScenarioTresorerie, type TresorerieDouzeMois,
  missionsArretables
} from '../../state/selecteurs.tresorerie';
import { type DateISO, type Mois, dateISO } from '../../domain/types';
import { cheminMonotone } from '../components/courbe';
import { Montant } from '../components/Montant';
import { eur } from '../format';
import { useConfidentialite } from '../useConfidentialite';
import { useLargeur } from '../useLargeur';
import { MOIS_COURTS, MOIS_LETTRES, rangDuMois } from './Activite.missions.titre';
import { jourEtMoisLong, moisEtAnnee, moisSeul } from './Tresorerie.lecture';
import { enMilliers, graduations, useMoisLu } from './Tresorerie.survol';
import tr from './Tresorerie.module.css';

/** Le tableau des mêmes nombres, chargé quand on le demande. */
const TableauDouzeMois = composantALaDemande(() => import('./Tresorerie.tableau')
  .then((m) => m.TableauDouzeMois), false);

/**
 * « Tu peux te verser X € par mois jusqu'en <mois> » — le versement tenable en
 * titre, et la courbe de ce que devient le disponible si tu te le verses.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DISPONIBLE, PAS LE SOLDE — ET VERSEMENT DÉDUIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La courbe répond à la question du titre : « si je me verse cette somme
 * chaque mois, est-ce que ça tient ? ». Elle trace donc le disponible
 * (solde − dû), versement tenable pris chaque mois : il touche la réserve au
 * mois qui limite, et le point bas le nomme. Le solde, lui, fait des marches
 * aux échéances ; il est dans le tableau et dans l'infobulle, à côté.
 *
 * Les trois mois d'avant sont CONSTATÉS — le disponible de leurs fins de mois,
 * recalculé depuis les faits de ce soir-là — en trait plein ; la suite est
 * prévue, en pointillé : les factures émises à leur échéance et le planning
 * signé, rien de deviné. « Aujourd'hui » se place à son jour dans le mois,
 * entre la fin du mois dernier et celle du mois courant.
 */
export function CarteVersementTenable(
  { t, scenario, projectionSi, onScenario }: {
    readonly t: TresorerieDouzeMois;
    readonly scenario: ScenarioTresorerie;
    readonly projectionSi: ResumeDeProjection | null;
    readonly onScenario: (s: ScenarioTresorerie) => void;
  }
) {
  const faits = useFaits((e) => e.faits);
  const [confidentiel] = useConfidentialite();
  const cadre = useRef<HTMLDivElement>(null);
  const largeur = useLargeur(cadre) ?? 1076;
  const id = useId();
  const [arretOuvert, setArretOuvert] = useState(false);
  const [tableau, setTableau] = useState(false);

  const prospects = faits.missions.filter((m) => m.statut === 'prospect').length;
  const arretables = useMemo(() => missionsArretables(faits, t.aujourdhui), [faits, t.aujourdhui]);
  const nomArret = scenario.arret === null ? null
    : faits.missions.find((m) => m.id === scenario.arret?.missionId)?.description ?? null;
  const conditions = [
    ...(scenario.prospects ? [prospects > 1 ? 'les prospects sont signés' : 'le prospect est signé'] : []),
    ...(scenario.arret !== null ? [`${nomArret ?? 'la mission'} s’arrête le ${jourEtMoisLong(scenario.arret.le, t.aujourdhui)}`] : [])
  ];
  const principal = projectionSi ?? t;

  return (
    <section className={tr.carte} aria-labelledby={`${id}-titre`}>
      <div className={`${tr.entete} ${tr.enteteHaut}`}>
        <div>
          <h2 id={`${id}-titre`} className={tr.titreCarte}>
            {conditions.length > 0 && <>Si {conditions.join(' et ')}, </>}
            <TitreTenable r={principal} conditionnel={conditions.length > 0} />
          </h2>
          <p className={tr.sousTitre}>
            {principal.versementTenable > 0
              ? <>Ton disponible, mois par mois, si tu te verses cette somme.{principal.moisContraignant !== null
                && <> C’est {moisSeul(principal.moisContraignant)} qui limite&nbsp;: au-delà, tu passerais sous ta réserve.</>}</>
              : <>Ton disponible ne dépasse pas ta réserve sur les douze mois&nbsp;: rien n’est tenable chaque mois pour l’instant.</>}
            {projectionSi !== null && (
              <> Sans «&nbsp;et si&nbsp;»&nbsp;: <Montant>{eur(t.versementTenable)}</Montant> par mois.</>
            )}
          </p>
        </div>
        {(prospects > 0 || arretables.length > 0) && (
          <div className={tr.filtres}>
            {prospects > 0 && (
              <button
                type="button"
                className={tr.filtre}
                aria-pressed={scenario.prospects}
                onClick={() => onScenario({ ...scenario, prospects: !scenario.prospects })}
              >
                + Compter {prospects > 1 ? 'les prospects' : 'le prospect'}
              </button>
            )}
            {arretables.length > 0 && (
              <button
                type="button"
                className={tr.filtre}
                aria-pressed={scenario.arret !== null}
                aria-expanded={arretOuvert}
                onClick={() => (scenario.arret !== null
                  ? onScenario({ ...scenario, arret: null })
                  : setArretOuvert((o) => !o))}
              >
                {scenario.arret !== null ? 'Ne plus arrêter la mission' : 'Et si une mission s’arrête…'}
              </button>
            )}
          </div>
        )}
      </div>

      {arretOuvert && scenario.arret === null && (
        <FormulaireArret
          missions={arretables}
          aujourdhui={t.aujourdhui}
          onArreter={(arret) => { onScenario({ ...scenario, arret }); setArretOuvert(false); }}
          onAnnuler={() => setArretOuvert(false)}
        />
      )}

      <div className={tr.cadre} ref={cadre}>
        <CourbeDuDisponible
          mois={t.mois}
          aujourdhui={{ date: t.aujourdhui, mois: t.moisCourant, disponible: t.disponible, solde: t.solde }}
          reserve={t.reserve}
          pointBas={t.pointBas}
          si={projectionSi?.disponibles ?? null}
          largeur={largeur}
          confidentiel={confidentiel}
          libelleSi={conditions.length > 0 ? `si ${conditions.join(' et ')}` : null}
        />
      </div>

      <div className={tr.pied}>
        <p className={tr.legende}>
          <span>
            <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true"><line x1="2" y1="4" x2="24" y2="4" className={tr.constate} /></svg>
            constaté
          </span>
          <span>
            <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true"><line x1="2" y1="4" x2="24" y2="4" className={tr.prevu} /></svg>
            prévu&nbsp;: les factures émises à leur échéance et le planning signé — rien de deviné
          </span>
          {conditions.length > 0 && (
            <span>
              <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true"><line x1="2" y1="4" x2="24" y2="4" className={tr.scenario} /></svg>
              si {conditions.join(' et ')}
            </span>
          )}
        </p>
        <button type="button" className={tr.plus} aria-expanded={tableau} onClick={() => setTableau((v) => !v)}>
          {tableau ? 'Masquer le tableau' : 'Voir en tableau'}
        </button>
      </div>

      {tableau && (
        <Suspense fallback={<p role="status" className={tr.vide}>Chargement…</p>}>
          <TableauDouzeMois t={t} />
        </Suspense>
      )}
    </section>
  );
}

/** Le titre : le versement tenable, le mois qui limite — ou rien de tenable. */
function TitreTenable({ r, conditionnel }: { readonly r: ResumeDeProjection; readonly conditionnel: boolean }) {
  const verbe = conditionnel ? 'tu pourrais te verser' : 'Tu peux te verser';
  if (r.versementTenable <= 0) return <>{conditionnel ? 'rien' : 'Rien'} à te verser chaque mois pour l’instant</>;
  return (
    <>
      {verbe} <Montant>{eur(r.versementTenable)}</Montant> par mois{' '}
      {r.moisContraignant === null ? 'pendant douze mois' : <>jusqu’en {moisEtAnnee(r.moisContraignant)}</>}
    </>
  );
}

/** Choisir la mission et le jour où elle s'arrête — un état d'écran, jamais un fait. */
function FormulaireArret(
  { missions, aujourdhui, onArreter, onAnnuler }: {
    readonly missions: readonly { readonly id: string; readonly description: string; readonly clientNom: string }[];
    readonly aujourdhui: DateISO;
    readonly onArreter: (arret: { readonly missionId: string; readonly le: DateISO }) => void;
    readonly onAnnuler: () => void;
  }
) {
  const id = useId();
  const finDuMois = (m: Mois): string => {
    const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0));
    return d.toISOString().slice(0, 10);
  };
  const [missionId, setMissionId] = useState(missions[0]?.id ?? '');
  const [le, setLe] = useState(finDuMois(aujourdhui.slice(0, 7) as Mois));
  const valide = missionId !== '' && /^\d{4}-\d{2}-\d{2}$/u.test(le) && le >= aujourdhui;
  return (
    <form
      className={tr.arret}
      aria-label="Et si une mission s’arrête"
      onSubmit={(e) => { e.preventDefault(); if (valide) onArreter({ missionId, le: dateISO(le) }); }}
    >
      <label htmlFor={`${id}-mission`}>
        La mission
        <select id={`${id}-mission`} value={missionId} onChange={(e) => setMissionId(e.target.value)}>
          {missions.map((m) => (
            <option key={m.id} value={m.id}>{m.description !== '' ? m.description : m.clientNom}</option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-le`}>
        s’arrête le
        <input id={`${id}-le`} type="date" min={aujourdhui} value={le} onChange={(e) => setLe(e.target.value)} />
      </label>
      <button type="submit" className={tr.bouton} disabled={!valide}>Voir</button>
      <button type="button" className={tr.plus} onClick={onAnnuler}>Annuler</button>
    </form>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   La courbe
   ───────────────────────────────────────────────────────────────────────── */

interface Point {
  readonly x: number;
  readonly valeur: number;
  readonly nature: 'constate' | 'aujourdhui' | 'prevu';
  readonly mois: Mois;
  readonly solde: number | null;
  readonly si: number | null;
}

const HAUT = 40;
const BAS = 34;

/**
 * La courbe du disponible — commune aux deux vues : douze mois à venir (trois
 * mois constatés, puis prévus) ou l'année civile. Les mois sans valeur — avant
 * le solde de départ, au-delà des douze mois prévus — ne se tracent pas.
 */
export function CourbeDuDisponible(
  { mois, aujourdhui, reserve, pointBas, si, largeur, confidentiel, libelleSi }: {
    readonly mois: readonly MoisDeTresorerie[];
    readonly aujourdhui: {
      readonly date: DateISO; readonly mois: Mois; readonly disponible: number; readonly solde: number
    } | null;
    readonly reserve: number;
    readonly pointBas: { readonly mois: Mois; readonly montant: number } | null;
    /** Le disponible des mois prévus selon un « et si », dans leur ordre. */
    readonly si: readonly number[] | null;
    readonly largeur: number;
    readonly confidentiel: boolean;
    readonly libelleSi: string | null;
  }
) {
  const etroit = largeur < 600;
  const hauteur = etroit ? 280 : 330;
  const gauche = etroit ? 30 : 48;
  const droite = etroit ? 8 : 20;
  const n = mois.length;
  const xDe = (i: number): number => gauche + (i * (largeur - gauche - droite)) / Math.max(1, n - 1);
  const k = mois.findIndex((m) => m.nature === 'prevu');

  /* « Aujourd'hui » à son jour : entre la fin du mois dernier et celle du mois
     courant — le premier mois prévu. */
  const xAujourdhui = aujourdhui === null || k < 0 ? null : (() => {
    const jour = Number(aujourdhui.date.slice(8, 10));
    const joursDuMois = new Date(Number(aujourdhui.date.slice(0, 4)), Number(aujourdhui.date.slice(5, 7)), 0).getDate();
    const avant = k === 0 ? xDe(0) - (xDe(1) - xDe(0)) : xDe(k - 1);
    return Math.max(gauche, avant + ((xDe(k) - avant) * jour) / joursDuMois);
  })();

  let rangPrevu = -1;
  const points: Point[] = [];
  mois.forEach((m, i) => {
    if (m.nature === 'prevu') rangPrevu += 1;
    if (m.nature === 'prevu' && i === k && aujourdhui !== null && xAujourdhui !== null) {
      points.push({
        x: xAujourdhui, valeur: aujourdhui.disponible, nature: 'aujourdhui', mois: aujourdhui.mois,
        solde: aujourdhui.solde, si: null
      });
    }
    if (m.disponible === null) return;
    points.push({
      x: xDe(i), valeur: m.disponible, nature: m.nature, mois: m.mois, solde: m.solde,
      si: m.nature === 'prevu' ? si?.[rangPrevu] ?? null : null
    });
  });
  const lu = useMoisLu(points.length);

  const valeurs = [...points.map((p) => p.valeur), ...points.flatMap((p) => (p.si === null ? [] : [p.si])), reserve];
  const ticks = graduations(Math.max(...valeurs));
  const haut = Math.max(ticks[2] ?? 0, ...valeurs, 1);
  const bas = Math.min(0, ...valeurs);
  const y = (v: number): number => HAUT + ((haut - v) / (haut - bas)) * (hauteur - HAUT - BAS);
  const yBase = y(Math.max(bas, 0));

  const passe = points.filter((p) => p.nature !== 'prevu');
  const avenir = points.filter((p) => p.nature !== 'constate');
  const trace = (ps: readonly Point[], v: (p: Point) => number) => cheminMonotone(ps.map((p) => ({ x: p.x, y: y(v(p)) })));
  const aire = (ps: readonly Point[]) => (ps.length < 2 ? ''
    : `${trace(ps, (p) => p.valeur)} L${ps[ps.length - 1]?.x ?? 0},${yBase} L${ps[0]?.x ?? 0},${yBase} Z`);
  const siPoints = si === null ? [] : avenir.filter((p) => p.nature === 'aujourdhui' || p.si !== null);

  /* Deux points nommés au plus : le pic et le creux (`DIRECTION-VISUELLE.md`). */
  const bas_ = pointBas === null ? undefined : points.find((p) => p.nature === 'prevu' && p.mois === pointBas.mois);
  const prevusPoints = points.filter((p) => p.nature === 'prevu');
  const pic = prevusPoints.reduce<Point | undefined>((m, p) => (m === undefined || p.valeur > m.valeur ? p : m), undefined);
  const montrerPic = pic !== undefined && aujourdhui !== null && pic.valeur > aujourdhui.disponible && pic !== bas_;

  const indexCourant = k;
  const etiquette = (i: number, m: Mois): string => (etroit ? MOIS_LETTRES : MOIS_COURTS)[rangDuMois(m)] ?? String(i);
  const tousLesMois = mois.map((m) => m.mois);
  const actif = lu.actif === null ? null : points[lu.actif] ?? null;

  const phrase = `Ton disponible de ${moisEtAnnee(tousLesMois[0] as Mois)} à ${moisEtAnnee(tousLesMois[n - 1] as Mois)}`
    + (k < 0 ? ', constaté' : k === 0 ? ', prévu' : ' : constaté jusqu’à aujourd’hui, prévu ensuite')
    + (confidentiel || aujourdhui === null ? '' : `, ${eur(aujourdhui.disponible)} aujourd’hui`)
    + (pointBas === null ? '' : `, point bas en ${moisEtAnnee(pointBas.mois)}${confidentiel ? '' : ` à ${eur(pointBas.montant)}`}`)
    + `. Les flèches lisent chaque mois.`;

  return (
    <>
      <svg
        className={tr.graphe}
        viewBox={`0 0 ${largeur} ${hauteur}`}
        width={largeur}
        height={hauteur}
        role="img"
        aria-label={phrase}
        tabIndex={0}
        onPointerMove={(e) => lu.auPointeur(e, (i) => points[i]?.x ?? 0, largeur)}
        onPointerDown={(e) => lu.auPointeur(e, (i) => points[i]?.x ?? 0, largeur)}
        onPointerLeave={() => lu.choisir(null)}
        onKeyDown={lu.auClavier}
        onBlur={() => lu.choisir(null)}
      >
        <defs>
          <linearGradient id="tr-aire" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--green)', stopOpacity: 0.3 }} />
            <stop offset="1" style={{ stopColor: 'var(--green)', stopOpacity: 0 }} />
          </linearGradient>
          <linearGradient id="tr-aire-prevue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--green)', stopOpacity: 0.13 }} />
            <stop offset="1" style={{ stopColor: 'var(--green)', stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        {ticks.map((v) => (
          <g key={v}>
            <line className={tr.graduation} x1={gauche} x2={largeur - droite} y1={y(v)} y2={y(v)} />
            <text className={tr.texteAxe} x={gauche - 8} y={y(v) + 4} textAnchor="end" data-montant="">{enMilliers(v)}</text>
          </g>
        ))}
        <line className={tr.axe} x1={gauche} x2={largeur - droite} y1={yBase} y2={yBase} />

        {passe.length > 1 && <path d={aire(passe)} fill="url(#tr-aire)" />}
        <path d={aire(avenir)} fill="url(#tr-aire-prevue)" />

        {reserve > 0 && (
          <>
            <line className={tr.reserve} x1={gauche} x2={largeur - droite} y1={y(reserve)} y2={y(reserve)} />
            <text className={tr.texteReserve} x={gauche + 4} y={y(reserve) + 18} data-montant="">
              réserve {eur(reserve)}
            </text>
          </>
        )}

        {passe.length > 1 && <path className={tr.constate} d={trace(passe, (p) => p.valeur)} />}
        <path className={tr.prevu} d={trace(avenir, (p) => p.valeur)} />
        {siPoints.length > 1 && (
          <path className={tr.scenario} d={trace(siPoints, (p) => (p.nature === 'aujourdhui' ? p.valeur : p.si ?? 0))} />
        )}

        {aujourdhui !== null && xAujourdhui !== null && (
          <>
            <line className={tr.filetAujourdhui} x1={xAujourdhui} x2={xAujourdhui} y1={HAUT - 2} y2={yBase} />
            {/* La pastille reste dans le cadre : au téléphone, « aujourd'hui »
                tombe près du bord gauche, et une pastille coupée ne se lit plus. */}
            <rect className={tr.pastilleAujourdhui} x={Math.min(Math.max(xAujourdhui - 41.5, 0), largeur - 83)}
              y={12} width={83} height={24} rx={12} />
            <text className={tr.texteAujourdhui} x={Math.min(Math.max(xAujourdhui, 41.5), largeur - 41.5)} y={28.5}
              textAnchor="middle">aujourd’hui</text>
            <circle className={tr.pointAujourdhui} cx={xAujourdhui} cy={y(aujourdhui.disponible)} r={6.5} />
          </>
        )}

        {montrerPic && pic !== undefined && (
          <Annotation x={pic.x} y={y(pic.valeur)} largeur={largeur}
            haut={`fin ${moisSeul(pic.mois)}, prévu`} bas={eur(pic.valeur)}
            eviter={xAujourdhui === null ? null : Math.min(Math.max(xAujourdhui - 41.5, 0), largeur - 83)} />
        )}

        {bas_ !== undefined && pointBas !== null && (
          <>
            <circle className={tr.pointBas} cx={bas_.x} cy={y(bas_.valeur)} r={5} />
            <text
              className={tr.texteBas}
              x={bas_.x > largeur / 2 ? bas_.x - 6 : bas_.x + 6}
              y={Math.min(y(bas_.valeur) + 20, hauteur - BAS - 2)}
              textAnchor={bas_.x > largeur / 2 ? 'end' : 'start'}
              data-montant=""
            >
              point bas · {eur(pointBas.montant)} en {moisSeul(pointBas.mois)}
            </text>
          </>
        )}

        {actif !== null && (
          <circle className={tr.pointRepere} cx={actif.x} cy={y(actif.valeur)} r={5} />
        )}

        {tousLesMois.map((m, i) => (
          <text
            key={m}
            className={i === indexCourant ? `${tr.texteAxe} ${tr.texteAxeCourant}` : tr.texteAxe}
            x={xDe(i)}
            y={hauteur - 12}
            textAnchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}
          >
            {etiquette(i, m)}
          </text>
        ))}
      </svg>

      {/* L'infobulle : au survol, au doigt et au clavier — annoncée. */}
      <div aria-live="polite" className={actif === null ? tr.horsEcran : undefined}>
        {actif !== null && (
          <div className={tr.bulle} style={{ left: `${(actif.x / largeur) * 100}%`, top: 44 }}>
            <strong>
              {actif.nature === 'aujourdhui' ? 'Aujourd’hui'
                : `Fin ${moisSeul(actif.mois)} ${actif.mois.slice(0, 4)}, ${actif.nature === 'constate' ? 'constaté' : 'prévu'}`}
            </strong>
            <span>disponible <Montant>{eur(actif.valeur)}</Montant></span>
            {actif.solde !== null && <span>solde <Montant>{eur(actif.solde)}</Montant></span>}
            {actif.si !== null && libelleSi !== null && <span>{libelleSi} : <Montant>{eur(actif.si)}</Montant></span>}
          </div>
        )}
      </div>
    </>
  );
}

/** Une petite carte posée près d'un point : le pic. */
function Annotation(
  { x, y, largeur, haut, bas, eviter }: {
    readonly x: number; readonly y: number; readonly largeur: number; readonly haut: string; readonly bas: string;
    /** Le bord gauche de la pastille « aujourd'hui » (83 × 24, en haut) : la carte ne la recouvre pas. */
    readonly eviter: number | null;
  }
) {
  const l = 136;
  const gauche = Math.min(Math.max(x + 16, 4), largeur - l - 4);
  const auDessus = Math.max(4, y - 54);
  /* Un pic tout près d'aujourd'hui posait sa carte sur la pastille — le jeu
     d'essai, en décembre, n'avait plus de « aujourd'hui » lisible : la carte
     passe alors sous le point. */
  const recouvre = eviter !== null && auDessus < 36 && gauche < eviter + 83 && gauche + l > eviter;
  const sommet = recouvre ? y + 14 : auDessus;
  return (
    <>
      <circle className={tr.pointRepere} cx={x} cy={y} r={5} />
      <rect className={tr.etiquetteFond} x={gauche} y={sommet} width={l} height={50} rx={13} />
      <text className={tr.etiquetteMuet} x={gauche + 13} y={sommet + 20}>{haut}</text>
      <text className={tr.etiquetteFort} x={gauche + 13} y={sommet + 39} data-montant="">{bas}</text>
    </>
  );
}
