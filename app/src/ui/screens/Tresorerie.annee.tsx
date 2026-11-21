import { useMemo, useRef } from 'react';
import { useFaits } from '../../state/store';
import { dateDuJour, moisCourant, soldeEstSuivi } from '../../state/selecteurs';
import { anneesDisponibles, etatProjection } from '../../state/selecteurs.argent';
import { capaciteParMois } from '../../state/selecteurs.performance';
import { aujourdhuiDeTresorerie, tresorerieDeLAnnee } from '../../state/selecteurs.tresorerie';
import type { CapaciteDuMois } from '../../domain/calculs/capaciteVersement';
import type { Mois, Resolution } from '../../domain/types';
import { Montant } from '../components/Montant';
import { eur } from '../format';
import { enKiloEuros } from '../format.kilo';
import { useConfidentialite } from '../useConfidentialite';
import { useLargeur } from '../useLargeur';
import { MOIS_COURTS, MOIS_LETTRES, rangDuMois } from './Activite.missions.titre';
import { CourbeDuDisponible } from './Tresorerie.graphe';
import { GrapheFlux } from './Tresorerie.flux';
import { capitale, moisSeul } from './Tresorerie.lecture';
import tr from './Tresorerie.module.css';

/**
 * La vue « Année <N> » : on y relit le passé — le disponible de chaque fin de
 * mois, ce qui est entré et sorti, et ce que chaque mois autorisait à se
 * verser. Une maquette ne la dessine pas : elle reprend les graphes de la vue
 * douze mois, sur l'année civile, et la capacité de versement restylée planche.
 *
 * Les mois clos sont constatés ; les mois à venir sont ceux de la projection
 * — la même —, et au-delà de ses douze mois rien n'est prévu.
 */
export function VueAnnee({ annee, onAnnee }: { readonly annee: number; readonly onAnnee?: (a: number) => void }) {
  const faits = useFaits((e) => e.faits);
  const [confidentiel] = useConfidentialite();
  const cadre = useRef<HTMLDivElement>(null);
  const largeur = useLargeur(cadre) ?? 1076;
  const maintenant = useMemo(() => new Date(), []);
  const m0 = moisCourant(maintenant);
  const mois = useMemo(() => tresorerieDeLAnnee(faits, annee, maintenant), [faits, annee, maintenant]);
  const aujourdhui = useMemo(() => aujourdhuiDeTresorerie(faits, maintenant), [faits, maintenant]);
  const capacites = useMemo(
    () => capaciteParMois(faits, maintenant, etatProjection(faits, maintenant), annee), [faits, maintenant, annee]
  );
  const annees = useMemo(() => anneesDisponibles(faits, maintenant), [faits, maintenant]);
  const courante = annee === maintenant.getFullYear();
  const precedente = annees.includes(annee - 1) ? annee - 1 : null;
  const suivante = annees.includes(annee + 1) ? annee + 1 : null;
  const indexCourant = mois.findIndex((m) => m.mois === m0);

  return (
    <>
      <section className={tr.carte} aria-labelledby="t-annee">
        <div className={tr.entete}>
          <h2 id="t-annee" className={tr.titreCarte}>Ton disponible en {annee}</h2>
          {onAnnee !== undefined && (precedente !== null || suivante !== null) && (
            <nav className={tr.filtres} aria-label="Autre année">
              {precedente !== null && <button type="button" className={tr.filtre} onClick={() => onAnnee(precedente)}>‹ {precedente}</button>}
              {suivante !== null && <button type="button" className={tr.filtre} onClick={() => onAnnee(suivante)}>{suivante} ›</button>}
            </nav>
          )}
        </div>
        <p className={tr.sousTitre}>
          Le disponible de chaque fin de mois — le solde moins ce qui est dû —, recalculé depuis les faits de
          ce soir-là. {courante ? 'Les mois à venir sont prévus, ton versement tenable pris chaque mois.' : ''}
        </p>
        <div className={tr.cadre} ref={cadre}>
          <CourbeDuDisponible
            mois={mois}
            aujourdhui={courante ? { date: dateDuJour(maintenant), mois: m0, ...aujourdhui } : null}
            reserve={faits.reserve}
            pointBas={null}
            si={null}
            largeur={largeur}
            confidentiel={confidentiel}
            libelleSi={null}
          />
        </div>
      </section>

      <GrapheFlux
        mois={mois.filter((m) => m.disponible !== null || m.entrees > 0 || m.sorties > 0)}
        titre={`Ce qui est entré et sorti en ${annee}`}
        entrees="entrées"
        initial={Math.max(0, indexCourant >= 0 ? indexCourant - 1 : 11)}
        aujourdhui={dateDuJour(maintenant)}
      />

      <CarteCapacite capacites={capacites} indexCourant={indexCourant} verseConnu={soldeEstSuivi(faits)} />
    </>
  );
}

/**
 * Ce que chaque mois autorisait à se verser, et ce qu'on s'est versé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE VERSÉ SE LIT À L'INTÉRIEUR DE LA BARRE DE CAPACITÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * C'est la leçon du handoff (`CLAUDE.md`) : deux barres côte à côte laissent
 * l'œil faire la comparaison ; imbriquées, elles répondent d'un coup à « me
 * suis-je versé plus que ce mois-là ne rapportait ». Le versé est un enfant de
 * la capacité, en pourcentage d'elle : au-delà de 100 %, il déborde — et c'est
 * exactement ce qu'il faut voir.
 *
 * Un mois à venir n'a aucun versé (`null`, jamais zéro) et sa barre est
 * hachurée ; un mois dont le taux se dérobe garde sa colonne, vide, avec son
 * motif — la retirer décalerait les onze autres.
 */
function CarteCapacite(
  { capacites, indexCourant, verseConnu }: {
    readonly capacites: readonly Resolution<CapaciteDuMois>[];
    readonly indexCourant: number;
    readonly verseConnu: boolean;
  }
) {
  const cadre = useRef<HTMLDivElement>(null);
  const etroit = (useLargeur(cadre) ?? 1076) < 600;
  const valeurs = capacites.flatMap((c) => (c.statut === 'refuse' ? [] : [c.valeur]));
  const maximum = Math.max(1, ...valeurs.map((v) => Math.max(v.capacite, v.verse ?? 0)));
  const hauteur = (v: number): string => `${Math.max(0, (v / maximum) * 100)}%`;
  const libelle = (m: Mois): string => (etroit ? MOIS_LETTRES : MOIS_COURTS)[rangDuMois(m)] ?? m;

  return (
    <section className={tr.carte} aria-labelledby="t-capacite">
      <div className={tr.entete}>
        <h2 id="t-capacite" className={tr.titreCarte}>Ce que chaque mois te permettait de te verser</h2>
        <p className={tr.legende}>
          <span><i className={tr.point} style={{ background: 'var(--bar-soft)' }} aria-hidden="true" />capacité du mois</span>
          <span><i className={tr.point} style={{ background: 'var(--green)' }} aria-hidden="true" />versé, à l’intérieur</span>
        </p>
      </div>
      <div className={tr.capacite} ref={cadre}>
        {capacites.map((c, i) => {
          if (c.statut === 'refuse') {
            return (
              <div key={i} className={tr.colonne}>
                <span className={tr.valeurCapacite}>—</span>
                <span className={tr.barres} aria-hidden="true" />
                <span className={tr.moisCapacite}>
                  {(etroit ? MOIS_LETTRES : MOIS_COURTS)[i]}
                  {/* Le motif d'un mois qui s'abstient, pour qui ne voit pas
                      la colonne vide : un tiret seul ne dit rien. */}
                  <span className={tr.horsEcran}> : {c.motif}</span>
                </span>
              </div>
            );
          }
          const v = c.valeur;
          const futur = v.nature === 'projete';
          return (
            <div key={v.mois} className={tr.colonne}>
              <span className={tr.valeurCapacite}><Montant>{etroit ? '' : enKiloEuros(v.capacite)}</Montant></span>
              <span className={tr.barres} aria-hidden="true">
                <span
                  className={`${tr.barreCapacite} ${futur ? tr.barreCapaciteFuture : ''}`}
                  style={{ height: hauteur(v.capacite) }}
                >
                  {v.verse !== null && v.verse > 0 && (
                    <span className={tr.barreVerse}
                      style={{ height: `${Math.min(200, (v.verse / Math.max(1, v.capacite)) * 100)}%` }} />
                  )}
                </span>
              </span>
              <span className={i === indexCourant ? `${tr.moisCapacite} ${tr.moisCapaciteCourant}` : tr.moisCapacite}>
                {libelle(v.mois)}
                {/* Les nombres pour qui ne voit pas les barres : masqués en mode
                    discret comme le reste de l'écran. */}
                <span className={tr.horsEcran}>
                  {' '}{capitale(moisSeul(v.mois))} : <Montant>{eur(v.capacite)}</Montant> de capacité
                  {v.verse === null ? ', mois à venir' : <>, <Montant>{eur(v.verse)}</Montant> versés</>}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <p className={tr.notePied}>
        La capacité d’un mois&nbsp;: son encaissé, moins les cotisations au taux de ce mois-là, moins ses
        dépenses. Au barème, l’impôt sur le revenu n’y est pas retiré&nbsp;: il se met de côté à part, et compte
        dans le dû. Les mois à venir sont hachurés, sans versé.
        {!verseConnu && <> Aucun relevé n’est importé&nbsp;: le versé est <strong>inconnu</strong>, et non nul.</>}
      </p>
    </section>
  );
}
