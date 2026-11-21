import { type ReactNode, useId, useRef, useState } from 'react';
import type { MoisDeTresorerie, TresorerieDouzeMois } from '../../state/selecteurs.tresorerie';
import type { SortieDeCharge } from '../../domain/calculs/sortiesDeCharges';
import type { DateISO, Mois } from '../../domain/types';
import { Montant } from '../components/Montant';
import { eur } from '../format';
import { enKiloEuros } from '../format.kilo';
import { useConfidentialite } from '../useConfidentialite';
import { useLargeur } from '../useLargeur';
import { MOIS_COURTS, MOIS_LETTRES, rangDuMois } from './Activite.missions.titre';
import { capitale, leJour, moisEtAnnee, moisSeul } from './Tresorerie.lecture';
import { enMilliers, graduations, useMoisLu } from './Tresorerie.survol';
import tr from './Tresorerie.module.css';

/**
 * « Ce qui entre et ce qui sort, mois par mois » — la vue douze mois : les
 * mois prévus de la projection.
 */
export function CarteFlux({ t }: { readonly t: TresorerieDouzeMois }) {
  const prevus = t.mois.filter((m) => m.nature === 'prevu');
  return (
    <GrapheFlux
      mois={prevus}
      titre="Ce qui entre et ce qui sort, mois par mois"
      entrees="entrées attendues"
      // Le premier mois entier à venir, comme la maquette : celui du mois
      // courant n'en porte que la fin.
      initial={Math.min(1, prevus.length - 1)}
      aujourdhui={t.aujourdhui}
    />
  );
}

/**
 * Les entrées vers le haut, les sorties vers le bas — le jour où elles
 * quittent le compte —, le mois choisi en relief avec ses deux valeurs, et
 * sous le graphe la phrase de ce mois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES SORTIES À LEUR DATE, PAS À LEUR NAISSANCE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les cotisations d'un trimestre sortent le 31 juillet, en une fois : c'est
 * la barre de juillet qui les porte, pas les trois mois d'encaissements qui
 * les ont fait naître. C'est ce que le relevé montrera, et c'est ce qui rend
 * un mois « lourd » lisible avant qu'il arrive. Le disponible, lui, les a
 * retirées à l'encaissement : la courbe du dessus ne fait pas cette marche.
 *
 * Commun aux deux vues : douze mois à venir, ou l'année — ses mois clos y
 * sont constatés (ce qui est entré et sorti du compte), les autres prévus.
 */
export function GrapheFlux(
  { mois, titre, entrees, initial, aujourdhui }: {
    readonly mois: readonly MoisDeTresorerie[];
    readonly titre: string;
    readonly entrees: string;
    readonly initial: number;
    readonly aujourdhui: DateISO;
  }
) {
  const [confidentiel] = useConfidentialite();
  const cadre = useRef<HTMLDivElement>(null);
  const largeur = useLargeur(cadre) ?? 1076;
  const id = useId();
  const lu = useMoisLu(mois.length, initial);
  const [detail, setDetail] = useState(false);
  const choisi = mois[lu.actif ?? initial] ?? mois[0];

  const etroit = largeur < 600;
  const hauteur = 300;
  const gauche = etroit ? 30 : 48;
  const droite = etroit ? 4 : 12;
  const pas = (largeur - gauche - droite) / Math.max(1, mois.length);
  const xDe = (i: number): number => gauche + pas * (i + 0.5);
  const hautEntrees = Math.max(1, ...mois.map((m) => m.entrees));
  const basSorties = Math.max(1, ...mois.map((m) => m.sorties));
  const zero = 30 + ((hauteur - 70) * hautEntrees) / (hautEntrees + basSorties);
  const echelle = (hauteur - 70) / (hautEntrees + basSorties);
  const tickHaut = graduations(hautEntrees)[0];
  const tickBas = graduations(basSorties)[0];
  const indexChoisi = choisi === undefined ? -1 : mois.indexOf(choisi);

  const phrase = `${titre}, de ${moisEtAnnee(mois[0]?.mois ?? ('' as Mois))} à ${moisEtAnnee(mois[mois.length - 1]?.mois ?? ('' as Mois))}`
    + (choisi === undefined || confidentiel ? '' : `. ${capitale(moisSeul(choisi.mois))} : ${eur(choisi.entrees)} d’entrées, ${eur(choisi.sorties)} de sorties`)
    + '. Les flèches choisissent le mois.';

  return (
    <section className={tr.carte} aria-labelledby={`${id}-titre`}>
      <div className={tr.entete}>
        <h2 id={`${id}-titre`} className={tr.titreCarte}>{titre}</h2>
        <p className={tr.legende}>
          <span><i className={tr.point} style={{ background: 'var(--green-lite)' }} aria-hidden="true" />{entrees}</span>
          <span><i className={tr.point} style={{ background: 'var(--bar-soft)' }} aria-hidden="true" />sorties, le jour où elles quittent le compte</span>
        </p>
      </div>

      <div className={tr.cadre} ref={cadre}>
        <svg
          className={tr.graphe}
          viewBox={`0 0 ${largeur} ${hauteur}`}
          width={largeur}
          height={hauteur}
          role="img"
          aria-label={phrase}
          tabIndex={0}
          onPointerDown={(e) => lu.auPointeur(e, xDe, largeur)}
          onKeyDown={lu.auClavier}
        >
          {indexChoisi >= 0 && (
            <rect className={tr.bande} x={xDe(indexChoisi) - Math.min(36, pas / 2)} y={8}
              width={Math.min(72, pas)} height={hauteur - 42} rx={14} />
          )}
          {tickHaut !== undefined && (
            <g>
              <line className={tr.graduation} x1={gauche} x2={largeur - droite} y1={zero - tickHaut * echelle} y2={zero - tickHaut * echelle} />
              <text className={tr.texteAxe} x={gauche - 8} y={zero - tickHaut * echelle + 4} textAnchor="end" data-montant="">+{enMilliers(tickHaut)}</text>
            </g>
          )}
          {tickBas !== undefined && (
            <g>
              <line className={tr.graduation} x1={gauche} x2={largeur - droite} y1={zero + tickBas * echelle} y2={zero + tickBas * echelle} />
              <text className={tr.texteAxe} x={gauche - 8} y={zero + tickBas * echelle + 4} textAnchor="end" data-montant="">{enMilliers(-tickBas)}</text>
            </g>
          )}
          <line className={tr.axe} x1={gauche} x2={largeur - droite} y1={zero} y2={zero} />

          {mois.map((m, i) => {
            const fort = i === indexChoisi;
            const x = xDe(i) - 7;
            const he = m.entrees * echelle;
            const hs = m.sorties * echelle;
            return (
              <g key={m.mois}>
                {he > 0 && <rect className={fort ? tr.barreEntreeForte : tr.barreEntree} x={x} y={zero - 3 - Math.max(he, 4)} width={14} height={Math.max(he, 4)} rx={7} />}
                {hs > 0 && <rect className={fort ? tr.barreSortieForte : tr.barreSortie} x={x} y={zero + 3} width={14} height={Math.max(hs, 4)} rx={7} />}
                {fort && (
                  <>
                    <text className={tr.valeurBarre} x={x + 7} y={zero - 10 - Math.max(he, 4)} textAnchor="middle" data-montant="">
                      +{enKiloEuros(m.entrees)}
                    </text>
                    <text className={tr.valeurBarre} x={x + 7} y={zero + 20 + Math.max(hs, 4)} textAnchor="middle" data-montant="">
                      −{enKiloEuros(m.sorties)}
                    </text>
                  </>
                )}
                <text className={fort ? `${tr.texteAxe} ${tr.texteAxeCourant}` : tr.texteAxe}
                  x={x + 7} y={hauteur - 8} textAnchor="middle">
                  {(etroit ? MOIS_LETTRES : MOIS_COURTS)[rangDuMois(m.mois)]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {choisi !== undefined && (
        <>
          <div className={tr.pied}>
            <p className={tr.indication} aria-live="polite">
              <PhraseDuMois m={choisi} />
            </p>
            <button type="button" className={tr.plus} aria-expanded={detail} onClick={() => setDetail((v) => !v)}>
              {detail ? 'Masquer le détail' : `Le détail ${deMois(choisi.mois)}`}
            </button>
          </div>
          {detail && <DetailDuMois m={choisi} aujourdhui={aujourdhui} />}
        </>
      )}
    </section>
  );
}

/** « de juillet », « d’août » : l'élision devant une voyelle. */
const deMois = (m: Mois): string => (/^[aeiou]/u.test(moisSeul(m)) ? `d’${moisSeul(m)}` : `de ${moisSeul(m)}`);

/** Les sorties de charges d'un mois, réunies par organisme et par jour : « 1 970 € d'URSSAF le 31 ». */
export function sortiesParOrganisme(charges: readonly SortieDeCharge[]): readonly { nom: string; le: DateISO; montant: number }[] {
  const joursUrssaf = new Set(charges.filter((c) => c.nature === 'urssaf' || c.nature === 'cfp').map((c) => c.le));
  const nom = (c: SortieDeCharge): string => {
    // Le versement libératoire part avec l'URSSAF, le même jour.
    if (c.nature === 'urssaf' || c.nature === 'cfp' || (c.nature === 'impot' && joursUrssaf.has(c.le))) return 'URSSAF';
    return c.nature === 'impot' ? 'impôt' : c.nature === 'tva' ? 'TVA' : 'CFE';
  };
  const groupes = new Map<string, { nom: string; le: DateISO; montant: number }>();
  for (const c of charges) {
    const cle = `${nom(c)} ${c.le}`;
    const g = groupes.get(cle);
    if (g === undefined) groupes.set(cle, { nom: nom(c), le: c.le, montant: c.montant });
    else g.montant += c.montant;
  }
  return [...groupes.values()].sort((a, b) => a.le.localeCompare(b.le));
}

/** « d'URSSAF », « de TVA », « d'impôt ». */
const de = (nom: string): string => (/^[AEIOUÉaeiouéi]/u.test(nom) ? `d’${nom}` : `de ${nom}`);

/**
 * La phrase du mois choisi : ce qui entre, et ce qui sort — pour toi, pour le
 * dû à sa date, pour les dépenses. Un mois constaté dit ce qui est arrivé.
 */
function PhraseDuMois({ m }: { readonly m: MoisDeTresorerie }) {
  const prevu = m.nature === 'prevu';
  const sorties = [
    ...(m.pourToi > 0 ? [<><Montant>{eur(m.pourToi)}</Montant> pour toi</>] : []),
    ...sortiesParOrganisme(m.charges).map((g) => (
      <><Montant>{eur(g.montant)}</Montant> {de(g.nom)} {g.le.startsWith(m.mois) ? leJour(g.le) : 'en retard'}</>
    )),
    ...(m.depenses > 0 ? [<><Montant>{eur(m.depenses)}</Montant> de dépenses{prevu ? ' (moyenne des six derniers mois)' : ''}</>] : []),
    ...(m.autres > 0 ? [<><Montant>{eur(m.autres)}</Montant> d’autres virements</>] : [])
  ];
  const entrees = prevu
    ? [
      ...(m.entreesFactures > 0 ? [<><Montant>{eur(m.entreesFactures)}</Montant> de factures à échéance</>] : []),
      ...(m.entreesPlanning > 0 ? [<><Montant>{eur(m.entreesPlanning)}</Montant> du planning signé</>] : [])
    ]
    : (m.entrees > 0 ? [<><Montant>{eur(m.entrees)}</Montant> encaissés</>] : []);
  const liste = (xs: readonly ReactNode[]) => xs.map((x, i) => (
    <span key={i}>{i === 0 ? '' : i === xs.length - 1 ? ' et ' : ', '}{x}</span>
  ));
  return (
    <>
      <b style={{ color: 'var(--text)' }}>{capitale(moisSeul(m.mois))}</b> —{' '}
      {entrees.length === 0 ? (prevu ? 'rien n’est attendu' : 'rien n’est entré') : liste(entrees)}.{' '}
      {sorties.length === 0 ? 'Rien ne sort.' : <>Il {prevu ? 'sort' : 'est sorti'} {liste(sorties)}.</>}
    </>
  );
}

/** Le détail d'un mois, en tableau dans la carte : les mêmes nombres, ligne par ligne. */
function DetailDuMois({ m, aujourdhui }: { readonly m: MoisDeTresorerie; readonly aujourdhui: DateISO }) {
  const lignes: [string, number][] = [
    ...(m.nature === 'prevu'
      ? [['Factures émises, à leur échéance', m.entreesFactures], ['Planning signé, au délai du client', m.entreesPlanning]] as [string, number][]
      : [['Encaissé', m.entrees]] as [string, number][]),
    [m.nature === 'prevu' ? 'Pour toi (versement tenable)' : 'Versé pour toi', -m.pourToi],
    ...sortiesParOrganisme(m.charges).map((g): [string, number] =>
      [`${g.nom}, ${g.le < aujourdhui && m.nature === 'prevu' ? 'en retard' : leJour(g.le)}`, -g.montant]),
    [m.nature === 'prevu' ? 'Dépenses (moyenne des six derniers mois)' : 'Dépenses payées', -m.depenses],
    ...(m.autres > 0 ? [['Autres virements', -m.autres] as [string, number]] : [])
  ];
  return (
    <div className={tr.defile}>
      <table className={tr.tableau}>
        <caption className={tr.horsEcran}>Le détail {deMois(m.mois)} {m.mois.slice(0, 4)}</caption>
        <tbody>
          {lignes.filter(([, v]) => v !== 0).map(([libelle, v]) => (
            <tr key={libelle}><td>{libelle}</td><td><Montant>{v > 0 ? `+${eur(v)}` : eur(v)}</Montant></td></tr>
          ))}
          <tr><td><strong>Net du mois</strong></td><td><Montant>{eur(m.entrees - m.sorties)}</Montant></td></tr>
        </tbody>
      </table>
    </div>
  );
}
