import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { dateDuJour, moisCourant, soldeEstSuivi } from '../../state/selecteurs';
import { etatProjection, type EtatArgent } from '../../state/selecteurs.argent';
import {
  capaciteParMois, compositionDuMois, resultatProjete,
  type CompositionDuMois, type ResultatProjete
} from '../../state/selecteurs.performance';
import type { CapaciteDuMois } from '../../domain/calculs/capaciteVersement';
import { allureObjectif } from '../../domain/calculs/objectif';
import { PART_GARDEE_MAX } from '../../state/schema';
import type { Mois, Resolution } from '../../domain/types';
import { euros, ratio } from '../../domain/types';
import { useRoute } from '../useRoute';
import { Chiffre } from '../components/Chiffre';
import { Info } from '../components/Info';
import { Montant } from '../components/Montant';
import { eur, formaterJours, moisLong } from '../format';
import styles from './Argent.performance.module.css';

/**
 * Le pilier « Performance » de l'écran Argent — « combien je gagne, je me verse ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL VIT DANS SON PROPRE MODULE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Argent était à 39,83 Ko sur un budget de 40 : le lot qui remplit ce pilier
 * l'aurait fait dépasser à la première carte. La règle du projet est de ne
 * jamais relever un budget mais d'EXTRAIRE ce qui n'a rien à faire dans le lot,
 * et la coupure était ici toute trouvée : on ouvre Argent pour regarder son
 * solde — la trésorerie — bien plus souvent que pour lire l'année.
 *
 * `PanneauOnglet` ne rend rien quand son pilier est inactif : le module n'est
 * donc demandé qu'au moment où l'on bascule dessus.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI EST CALCULÉ ICI, ET CE QUI ARRIVE DÉJÀ FAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `EtatArgent` arrive en paramètre : l'écran le calcule pour ses deux piliers,
 * et le refaire ici afficherait deux fois le même chiffre d'affaires calculé
 * deux fois — la meilleure façon qu'ils finissent par différer.
 *
 * La projection, elle, est calculée ici et **une seule fois**, puis passée à
 * `capaciteParMois` et à `resultatProjete`. Douze passages de planning par
 * appelant, sur un écran qui en compte deux, se verraient à l'ouverture.
 */

/**
 * La hauteur de la bande des barres, et ce qui la sépare du bas du tracé.
 *
 * Ces deux nombres sont dans le JavaScript parce que la ligne d'objectif doit
 * se poser sur LA MÊME échelle que les barres. Elle est en position absolue par
 * rapport au tracé entier — dont le bas est sous l'axe des mois — tandis que
 * les barres partent du bas de leur propre bande. Sans le décalage, la ligne
 * flottait vingt-deux pixels trop bas et traversait les étiquettes : un repère
 * faux, ce qui est pire qu'une absence de repère.
 *
 * Ils doivent rester d'accord avec `.barres { height }` et le bas de `.colonne`
 * dans la feuille de style, qui portent le commentaire réciproque.
 */
const HAUTEUR_BARRES = 175;
const BAS_DES_BARRES = 22;

/** Les mois de l'axe, dans la langue du dessin. */
const MOIS_COURTS = [
  'JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEP', 'OCT', 'NOV', 'DÉC'
];

export function Performance({ etat }: { readonly etat: EtatArgent }) {
  const faits = useFaits((e) => e.faits);
  const m0 = moisCourant();
  const indexCourant = Number(m0.slice(5, 7)) - 1;

  const projection = useMemo(() => etatProjection(faits), [faits]);
  const resultat = useMemo(
    () => resultatProjete(faits, new Date(), projection), [faits, projection]
  );
  const capacites = useMemo(
    () => capaciteParMois(faits, new Date(), projection), [faits, projection]
  );

  /**
   * Le mois dont on lit la composition. Le mois courant à l'ouverture.
   *
   * Le dessin écrit « clic sur un mois = composition » : c'est le graphe qui
   * commande le panneau, et non un second sélecteur qui aurait permis de
   * regarder mars pendant que le graphe met juin en évidence.
   */
  const [moisLu, setMoisLu] = useState<Mois>(m0);
  const composition = useMemo(() => compositionDuMois(faits, moisLu), [faits, moisLu]);

  // L'objectif se compare à l'ENCAISSÉ : c'est lui qui fait les seuils, les
  // cotisations et le compte en banque. Le comparer au facturé récompenserait
  // d'avoir émis une facture que personne n'a réglée.
  const allure = useMemo(
    () => allureObjectif(faits.objectifCaAnnuel, etat.caEncaisse, dateDuJour()),
    [faits.objectifCaAnnuel, etat.caEncaisse]
  );

  return (
    <>
      <div className={styles.tuiles}>
        <Chiffre
          libelle={`CA réalisé · ${etat.annee}`}
          valeur={eur(etat.caRealise)}
          note="facturé, cumulé"
        />
        <Chiffre
          libelle="CA encaissé"
          valeur={eur(etat.caEncaisse)}
          ton="accent"
          note="reçu sur le compte"
        />
        <Chiffre
          libelle="À encaisser"
          valeur={eur(etat.resteARentrer)}
          ton={etat.resteARentrer > 0 ? 'attention' : 'neutre'}
          note={etat.resteARentrerNombre === 0
            ? 'rien en attente'
            : `${etat.resteARentrerNombre} facture${etat.resteARentrerNombre > 1 ? 's' : ''} en attente`}
        />
        <TuileResultat resultat={resultat} annee={etat.annee} />
      </div>

      <div className={styles.deuxColonnes}>
        <GrapheCa
          etat={etat}
          indexCourant={indexCourant}
          moisLu={moisLu}
          onLire={setMoisLu}
          objectifMensuel={faits.objectifCaAnnuel === null ? null : faits.objectifCaAnnuel / 12}
          joursDEcart={allure?.joursDEcart ?? null}
        />
        <PanneauComposition composition={composition} />
      </div>

      <div className={styles.deuxColonnes}>
        <CarteVersement versable={etat.tresorerie.versable} dispo={etat.tresorerie.dispo} />
        <CarteCapacite
          capacites={capacites}
          indexCourant={indexCourant}
          verseConnu={soldeEstSuivi(faits)}
        />
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   A1 — la quatrième tuile
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Ce que le résultat projeté ignore, dit sur la tuile elle-même.
 *
 * Le motif est écrit dans `ReserveDuResultat` : sous le barème, aucun impôt sur
 * le revenu n'est déduit et rien ne le signalerait — `tauxImpotEtContributions`
 * ne rend alors que la CFP à 0,2 % et ne refuse jamais. Une tuile « Résultat
 * projeté » qu'on lit comme « ce qu'il me restera » se décide dessus.
 *
 * `null` rend **trois** tuiles et non quatre : le plan l'a tranché — mieux vaut
 * une tuile manquante, qui se voit, qu'une quatrième qui engage à faux.
 */
function TuileResultat(
  { resultat, annee }: { readonly resultat: ResultatProjete | null; readonly annee: number }
) {
  if (resultat === null) return null;

  const avantIr = resultat.reserves.includes('avant_impot_sur_le_revenu');

  /*
   * « ~21 900 € » et non « 21 877 € ».
   *
   * Le dessin écrit « ~46 k€ », et le tilde n'est pas un ornement : ce chiffre
   * repose sur un pipeline de factures qui ne sont pas encore parties et sur
   * des dépenses futures inconnues. Trois chiffres significatifs affichés à
   * l'euro près donnent à une projection l'apparence d'un relevé, et c'est ce
   * qui fait qu'on la reporte sur un formulaire.
   *
   * Arrondi à la centaine plutôt qu'au millier : le registre en euros pleins
   * des trois autres tuiles est conservé — deux unités sur la même rangée
   * demanderaient de comparer 18 970 € à 21,9 k€ de tête.
   */
  const arrondi = euros(Math.round(resultat.resultat / 100) * 100);

  return (
    <Chiffre
      libelle="Résultat projeté"
      valeur={`~${eur(arrondi)}`}
      note={
        <>
          {avantIr ? 'avant impôt sur le revenu' : 'après cotisations'}
          {` · fin ${annee}`}
          <Info libelle="Ce que ce résultat retient et ce qu’il laisse de côté">
            L’assiette est le <strong>pipeline</strong> — factures émises non
            réglées et revenu prévu au planning — jamais le rythme du passé
            prolongé. Les cotisations sont sommées <strong>mois par mois</strong>,
            parce que l’ACRE peut s’éteindre en cours d’année.
            <br />
            {avantIr && (
              <>
                Aucun impôt sur le revenu n’est déduit&nbsp;: il dépend de faits
                que vous seul connaissez et il se saisit depuis votre avis, il ne
                se reconstitue pas depuis un taux.{' '}
              </>
            )}
            {resultat.reserves.includes('depenses_a_venir_inconnues') && (
              <>
                Les dépenses des mois restants sont inconnues&nbsp;: le chiffre
                est trop élevé, d’un montant qu’on ne sait pas.{' '}
              </>
            )}
            {resultat.statut === 'hypothese'
              && 'Au moins un mois s’appuie sur un barème extrapolé.'}
          </Info>
        </>
      }
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   A2 / A6 — le graphe des mois écoulés
   ───────────────────────────────────────────────────────────────────────── */

/**
 * CA réalisé contre CA encaissé, **mois écoulés seulement**.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI L'AXE S'ARRÊTE AU MOIS COURANT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La référence s'arrête à juin en juin, et c'est juste pour deux raisons. Douze
 * groupes de deux barres dans cette largeur rendent les vingt-quatre étiquettes
 * illisibles — c'est le compromis que `GrapheBarres` avait dû faire ailleurs.
 * Et surtout, six colonnes vides à droite se lisent comme un effondrement de
 * l'activité, alors qu'elles ne disent que « on n'y est pas encore ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DES BOUTONS, PAS UN SVG CLIQUABLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le dessin veut qu'un clic sur un mois ouvre sa composition. Un `<rect>` SVG
 * cliquable n'est ni tabulable ni annoncé ; ici chaque mois EST un bouton, et
 * ses deux valeurs sont du texte dans le document — pas des pixels. Le graphe
 * n'a donc pas besoin d'un tableau de rechange : il est déjà lisible.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'OBJECTIF, ET SON ÉCART AVEC LA RÉFÉRENCE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le handoff n'a pas d'objectif de chiffre d'affaires : cette ligne n'est donc
 * PAS au dessin, et c'est un ajout assumé — l'ancienne application l'avait, et
 * la perdre aurait été une régression. Elle ne se trace que si un objectif est
 * saisi ; aucune ligne n'apparaît par défaut.
 *
 * Le repère mensuel est l'objectif annuel divisé par douze, ce qui est une
 * hypothèse — un indépendant ne facture pas douze mois égaux. Elle est écrite
 * en toutes lettres sous le graphe, et l'avance ou le retard réel est donné en
 * JOURS par `allureObjectif`, qui lui tient compte du calendrier écoulé.
 */
function GrapheCa(
  { etat, indexCourant, moisLu, onLire, objectifMensuel, joursDEcart }: {
    readonly etat: EtatArgent;
    readonly indexCourant: number;
    readonly moisLu: Mois;
    readonly onLire: (m: Mois) => void;
    readonly objectifMensuel: number | null;
    readonly joursDEcart: number | null;
  }
) {
  const ecoules = etat.parMois.slice(0, indexCourant + 1);
  const maximum = Math.max(
    1,
    ...ecoules.flatMap((m) => [m.realise, m.encaisse]),
    objectifMensuel ?? 0
  );
  const hauteur = (v: number): string => `${Math.max(0, (v / maximum) * 100)}%`;

  return (
    <section className={styles.carte} aria-labelledby="graphe-ca">
      <header className={styles.enteteCarte}>
        <h2 id="graphe-ca" className={styles.titreCarte}>
          CA réalisé vs encaissé
          <Info libelle="Explication de l’écart entre facturé et encaissé">
            Le facturé dit ce qui a été émis, l’encaissé ce qui est arrivé sur le
            compte. L’écart entre les deux est ce qui se transforme en trou de
            trésorerie — et c’est pourquoi les seuils fiscaux se calculent sur
            l’encaissé, jamais sur le facturé.
          </Info>
        </h2>
        <span className={styles.noteCarte}>clic sur un mois = composition</span>
      </header>

      <div className={styles.trace}>
        {objectifMensuel !== null && (
          /* Posée dans le flux du tracé et non en superposition absolue : une
             ligne « décorative » qu'aucun texte n'accompagne serait invisible
             pour qui n'y voit rien. Son libellé est donc du texte. */
          <div
            className={styles.ligneObjectif}
            style={{
              bottom: BAS_DES_BARRES
                + Math.min(1, objectifMensuel / maximum) * HAUTEUR_BARRES
            }}
          >
            <span className={styles.libelleObjectif}>
              objectif <Montant>{eur(objectifMensuel)}</Montant>/mois
            </span>
          </div>
        )}

        {ecoules.map((m, i) => {
          const estCourant = i === indexCourant;
          const estLu = m.mois === moisLu;
          return (
            <button
              key={m.mois}
              type="button"
              aria-pressed={estLu}
              className={`${styles.colonne} ${estCourant ? styles.colonneCourante : ''} `
                + `${estLu ? styles.colonneLue : ''}`}
              /* Nommé explicitement : sans cela, le bouton s'annonce par son
                 contenu, qui commence par « 9,4 k€ 8,0 » — deux nombres
                 abrégés sans unité ni mois. On ne saurait ni sur quoi on
                 clique, ni ce que ça vaut. */
              aria-label={`${MOIS_COURTS[i] ?? m.mois} : ${eur(m.realise)} réalisé, `
                + `${eur(m.encaisse)} encaissé`}
              onClick={() => onLire(m.mois)}
            >
              <span className={styles.valeurs}>
                <span className={styles.valeurRealise}>
                  <Montant>{enKiloEuros(m.realise)}</Montant>
                </span>
                <span className={styles.valeurEncaisse}>
                  <Montant>{enKiloEuros(m.encaisse)}</Montant>
                </span>
              </span>
              <span className={styles.barres} aria-hidden="true">
                <span className={styles.barreRealise} style={{ height: hauteur(m.realise) }} />
                <span className={styles.barreEncaisse} style={{ height: hauteur(m.encaisse) }} />
              </span>
              <span className={styles.moisAxe} aria-hidden="true">
                {MOIS_COURTS[i] ?? m.mois}
              </span>
            </button>
          );
        })}
      </div>

      <footer className={styles.piedCarte}>
        <span className={styles.legende}>
          <span className={styles.pastilleRealise} aria-hidden="true" />CA réalisé (facturé)
          <span className={styles.pastilleEncaisse} aria-hidden="true" />CA encaissé
        </span>
        <span className={styles.cumul}>
          Cumulé&nbsp;: <Montant>{eur(etat.caRealise)}</Montant> réalisé ·{' '}
          <Montant>{eur(etat.caEncaisse)}</Montant> encaissé
        </span>
      </footer>

      {objectifMensuel !== null && (
        <p className={styles.aide}>
          Le repère mensuel est l’objectif annuel divisé par douze&nbsp;— une
          hypothèse d’étalement, pas une prévision.{' '}
          {joursDEcart === null ? null : joursDEcart >= 0
            ? <>Sur l’année écoulée, vous avez <strong>{joursDEcart} jour
              {joursDEcart > 1 ? 's' : ''} d’avance</strong> sur l’objectif.</>
            : <>Sur l’année écoulée, vous avez <strong>{-joursDEcart} jour
              {-joursDEcart > 1 ? 's' : ''} de retard</strong> sur l’objectif.</>}
        </p>
      )}
    </section>
  );
}

/**
 * Le design veut les montants du graphe libellés en k€ : au-dessus des barres,
 * un montant complet en euros serait trop long et se chevaucherait d'une barre
 * à l'autre.
 */
function enKiloEuros(valeur: number): string {
  if (valeur === 0) return '0';
  const k = valeur / 1000;
  const arrondi = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(arrondi)} k€`;
}

/* ─────────────────────────────────────────────────────────────────────────
   A3 — la composition du mois
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Ce qui compose le mois : le réalisé par mission, l'encaissé par facture.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN MONTANT SEUL NE SE CONTESTE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « 8 j × 650 € », si. C'est ainsi qu'on trouve la journée oubliée, et c'est ce
 * que faisait `showMonthCARealisations` dans l'ancienne application. Chaque
 * ligne de réalisé porte donc ses journées et son tarif.
 *
 * Le reste à encaisser vient de `resteAEncaisserDuMois`, compté FACTURE PAR
 * FACTURE. Le prototype le calculait « réalisé du mois − encaissé du mois » :
 * sur un juin qui émet 8 000 € et encaisse 12 000 € venus d'avril, cette
 * soustraction rend zéro alors que les 8 000 € de juin sont intégralement dus.
 */
function PanneauComposition({ composition }: { readonly composition: CompositionDuMois }) {
  const c = composition;
  const a = c.aEncaisser;

  return (
    <aside className={styles.carte} aria-labelledby="composition">
      <header className={styles.enteteCarte}>
        <h2 id="composition" className={styles.titreCarte}>
          Composition · <span className={styles.moisTitre}>{moisLong(c.mois)}</span>
        </h2>
      </header>

      <div className={styles.bloc}>
        <p className={styles.enteteBloc}>
          <span className={styles.libelleBloc}>Réalisé · facturé</span>
          <span className={styles.totalBloc}><Montant>{eur(c.realiseFacture)}</Montant></span>
        </p>
        {c.realiseParMission.length === 0
          ? <p className={styles.vide}>Aucune facture émise, aucune journée au planning.</p>
          : (
            <ul className={styles.lignes}>
              {c.realiseParMission.map((l) => (
                <li key={`${l.clientNom}-${l.missionIds.join('|')}`} className={styles.ligne}>
                  <span className={styles.ligneTexte}>
                    <span className={styles.ligneLibelle}>{l.libelle}</span>
                    <span className={styles.ligneMeta}>
                      {l.clientNom}
                      {l.jours > 0 && ` · ${formaterJours(l.jours)} j`}
                      {l.jours > 0 && (l.tjm === null
                        ? ' · tarif non renseigné'
                        : ` × ${eur(l.tjm)}`)}
                      {/* Deux missions simultanées d'un même client : aucune
                          date ne départage leurs factures. Le dire coûte une
                          ligne ; le taire donnerait « 0 € » en face d'une
                          mission qui facture. */}
                      {l.indetermine && ' · deux missions simultanées, non départageables'}
                    </span>
                  </span>
                  <span className={styles.ligneMontant}>
                    <Montant>{eur(l.facture)}</Montant>
                  </span>
                </li>
              ))}
            </ul>
          )}
        {c.travailAuPlanning > 0 && (
          <p className={styles.noteBloc}>
            Travail au planning ce mois-ci&nbsp;:{' '}
            <Montant>{eur(c.travailAuPlanning)}</Montant>
            <Info libelle="Pourquoi ce montant est à côté et non dedans">
              Tant qu’aucune facture n’est partie, rien n’est dû, rien n’entre au
              livre des recettes et l’URSSAF ne réclame rien. L’ajouter au
              réalisé mélangerait du chiffre d’affaires et une intention.
            </Info>
          </p>
        )}
      </div>

      <div className={styles.bloc}>
        <p className={styles.enteteBloc}>
          <span className={`${styles.libelleBloc} ${styles.encaisse}`}>Encaissé · reçu</span>
          <span className={`${styles.totalBloc} ${styles.totalEncaisse}`}>
            <Montant>{eur(c.encaisse)}</Montant>
          </span>
        </p>
        {c.encaisseParFacture.length === 0
          ? <p className={styles.vide}>Rien n’est entré sur le compte ce mois-ci.</p>
          : (
            <ul className={styles.lignes}>
              {c.encaisseParFacture.map((l) => (
                <li key={l.recetteId} className={styles.ligne}>
                  <span className={styles.ligneTexte}>
                    <span className={styles.ligneLibelle}>
                      {l.numero === '' ? l.libelle : l.numero}
                    </span>
                    <span className={styles.ligneMeta}>
                      {l.clientNom}
                      {l.emiseAu === null
                        ? ' · encaissé d’avance, aucune facture émise'
                        : l.emiseAu !== c.mois && ` · émise en ${moisLong(l.emiseAu)}`}
                    </span>
                  </span>
                  <span className={styles.ligneMontant}>
                    <Montant>{eur(l.montant)}</Montant>
                  </span>
                </li>
              ))}
            </ul>
          )}
      </div>

      <p className={styles.piedBloc}>
        <span>Reste à encaisser sur les factures de ce mois</span>
        {/* Le signe « + » dit le SENS : c'est de l'argent qui va rentrer, pas
            une dette. Sans lui, le montant se range à côté des provisions et
            des échéances, qui sortent du compte. */}
        <span className={a.resteAEncaisser > 0 ? styles.attente : ''}>
          {a.resteAEncaisser > 0 && '+'}<Montant>{eur(a.resteAEncaisser)}</Montant>
        </span>
      </p>
      {a.enRetard > 0 && (
        <p className={styles.alerte}>
          Dont <Montant>{eur(a.enRetard)}</Montant> dont l’échéance est passée.
        </p>
      )}
      {a.encaisseDeMoisAnterieurs > 0 && (
        <p className={styles.noteBloc}>
          <Montant>{eur(a.encaisseDeMoisAnterieurs)}</Montant> de l’encaissé du mois
          règlent des factures émises plus tôt&nbsp;: c’est pourquoi le reste à
          encaisser ne se déduit pas de la différence entre les deux totaux.
        </p>
      )}
    </aside>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   A4 — ce qu'on peut se verser
   ───────────────────────────────────────────────────────────────────────── */

/**
 * « Tu peux te verser », et le curseur qui en décide.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `versable × (1 − part)`, ET NON `disponible × (1 − part)`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le prototype applique la part au DISPONIBLE. À 0 %, il propose alors de
 * verser le seuil de sécurité avec — c'est-à-dire de vider précisément le
 * matelas qu'on s'était donné. Le versable est le disponible une fois ce seuil
 * retiré : c'est sur lui que la part s'applique.
 *
 * Le défaut est **0 %**, et non les 50 % du prototype : un défaut à 50 %
 * couperait en deux, sans un geste, le versable de tout compte existant.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE BOUTON NE CRÉE PAS DE FAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Se verser de l'argent n'est pas une opération comptable en micro&nbsp;: la
 * personne et l'entreprise sont la même, et le virement figure déjà au relevé.
 * Le saisir une seconde fois le compterait deux fois. Ce qui manque n'est pas
 * un fait mais un NOM — savoir lequel des mouvements sortants est une
 * rémunération — et ce nom se pose au relevé.
 *
 * Le libellé s'écarte donc du dessin, qui dit « Enregistrer le versement ». Un
 * bouton qui promet d'enregistrer et qui emmène ailleurs est un petit
 * mensonge&nbsp;; celui-ci dit où il va.
 */
function CarteVersement(
  { versable, dispo }: { readonly versable: number; readonly dispo: number }
) {
  const partGardee = useFaits((e) => e.faits.partGardeeAuVersement);
  const reserve = useFaits((e) => e.faits.reserve);
  const definirPartGardee = useFaits((e) => e.definirPartGardee);
  const { naviguerVers } = useRoute();
  const idPart = useId();

  const [saisie, setSaisie] = useState<number | null>(null);
  const part = saisie ?? partGardee;
  const pourcent = Math.round(part * 100);
  const base = Math.max(0, versable);
  const gardee = euros(Math.round(base * part));
  const aVerser = euros(base - gardee);

  return (
    <section className={styles.carte} aria-labelledby="versement">
      <header className={styles.enteteCarte}>
        <h2 id="versement" className={styles.titreCarte}>Tu peux te verser</h2>
        <span className={styles.badge}>versable − part gardée</span>
      </header>

      {/* Le grand nombre porte son libellé, lisible par les technologies
          d'assistance : annoncé seul, « 2 470 € » ne dit pas de quoi il s'agit,
          et c'est le chiffre le plus engageant de l'écran. */}
      <p className={styles.grandChiffre}>
        <span className={styles.horsEcran}>Montant que vous pouvez vous verser&nbsp;: </span>
        <Montant>{eur(aVerser)}</Montant>
      </p>

      <p className={styles.curseurRangee}>
        <label htmlFor={idPart} className={styles.curseurLibelle}>
          Part gardée à chaque versement
        </label>
        <output className={styles.curseurValeur} htmlFor={idPart}>
          {pourcent}&nbsp;%
        </output>
      </p>
      <input
        id={idPart}
        type="range"
        className={styles.curseur}
        min={0}
        max={PART_GARDEE_MAX * 100}
        step={5}
        value={pourcent}
        aria-valuetext={`${pourcent} %`}
        onChange={(e) => {
          const v = Number(e.target.value) / 100;
          setSaisie(v);
          // Écrit dans le magasin à chaque changement : le réglage de Config et
          // ce curseur sont le MÊME fait, et deux vérités qui se rejoindraient
          // « au relâchement » n'en font pas une.
          definirPartGardee(ratio(v));
        }}
        onBlur={() => setSaisie(null)}
      />

      {/* Un disponible négatif ne se raconte pas comme une soustraction : à
          −2 669 €, « le seuil de sécurité en retient 2 470 € » suggérerait un
          reste de −5 139 €, alors que le versable est zéro et que le seuil
          n'est pas constitué du tout. Ce n'est pas le même fait, et c'est
          celui-là qu'il faut dire — sinon la carte affiche « 0 € » sans qu'on
          sache si c'est le réglage ou le compte qui l'impose. */}
      {dispo < 0 ? (
        <p className={styles.explication}>
          Votre disponible est <strong>négatif</strong> (<Montant>{eur(dispo)}</Montant>)&nbsp;:
          les provisions dépassent ce qu’il y a sur le compte. Il n’y a rien à
          vous verser, et le seuil de sécurité n’est pas constitué non plus.
        </p>
      ) : (
        <p className={styles.explication}>
          Sur <Montant>{eur(dispo)}</Montant> de disponible, le seuil de sécurité
          en retient <Montant>{eur(euros(Math.min(reserve, dispo)))}</Montant>&nbsp;: reste{' '}
          <Montant>{eur(base)}</Montant> de versable. Vous en gardez{' '}
          <strong>{pourcent}&nbsp;%</strong> (<Montant>{eur(gardee)}</Montant>) et
          vous versez le reste.
        </p>
      )}

      <button
        type="button"
        className={styles.action}
        onClick={() => naviguerVers('achats', 'releve')}
      >
        Pointer le versement au relevé
      </button>
      <p className={styles.aide}>
        Le virement figure déjà sur votre relevé&nbsp;: il n’y a rien à saisir, il
        n’y a qu’à le nommer. Le saisir ici le compterait deux fois.
      </p>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   A5 — la capacité de versement, mois par mois
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Ce que chaque mois autorisait, et ce qu'on s'est effectivement versé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE VERSÉ EST À L'INTÉRIEUR DE LA BARRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * C'est ce que montre la référence, et ce n'est pas cosmétique&nbsp;: deux
 * barres côte à côte laissent l'œil faire la comparaison, imbriquées elles
 * répondent d'un coup à « me suis-je versé plus que ce mois-là ne rapportait ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN MOIS À VENIR N'A AUCUN VERSÉ, ET LE HACHURÉ NE REMPLIT RIEN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `capaciteDuMois` rend `verse: null` sur un mois projeté — jamais zéro, qui
 * serait un constat. Dessiner un plein sur une barre hachurée ferait lire « je
 * me suis versé » alors que rien n'est sorti du compte.
 *
 * Un mois dont le taux de charges se dérobe rend `refuse` : sa colonne reste en
 * place, vide, avec son motif. La retirer décalerait les onze autres d'une case
 * et personne ne verrait le trou.
 */
function CarteCapacite(
  { capacites, indexCourant, verseConnu }: {
    readonly capacites: readonly Resolution<CapaciteDuMois>[];
    readonly indexCourant: number;
    readonly verseConnu: boolean;
  }
) {
  const valeurs = capacites.flatMap((c) => (c.statut === 'refuse' ? [] : [c.valeur]));
  const maximum = Math.max(1, ...valeurs.map((v) => Math.max(v.capacite, v.verse ?? 0)));
  const hauteur = (v: number): string => `${Math.max(0, (v / maximum) * 100)}%`;

  return (
    <section className={styles.carte} aria-labelledby="capacite">
      <header className={styles.enteteCarte}>
        <h2 id="capacite" className={styles.titreCarte}>
          Capacité de versement par mois
          <Info libelle="Comment lire ces barres">
            La barre dit ce que le mois <em>autorisait</em>&nbsp;: encaissé, moins
            les charges au taux de <em>ce</em> mois-là, moins les dépenses. Le
            plein dit ce que vous avez pris. Les mois à venir sont hachurés et
            n’ont aucun plein&nbsp;— rien n’en est encore sorti.
          </Info>
        </h2>
        <span className={styles.noteCarte}>barre = capacité · plein = versé</span>
      </header>

      <div className={styles.trace}>
        {capacites.map((c, i) => {
          const mois = MOIS_COURTS[i] ?? String(i + 1);
          if (c.statut === 'refuse') {
            return (
              <div key={mois} className={styles.colonneStatique} title={c.motif}>
                <span className={styles.valeurs}><span className={styles.valeurRefus}>—</span></span>
                <span className={styles.barres} aria-hidden="true" />
                <span className={styles.moisAxe}>{mois}</span>
              </div>
            );
          }

          const v = c.valeur;
          const futur = v.nature === 'projete';
          return (
            <div key={mois} className={styles.colonneStatique}>
              <span className={styles.valeurs}>
                <span className={v.capacite < 0 ? styles.valeurNegative : styles.valeurCapacite}>
                  <Montant>{enKiloEuros(v.capacite)}</Montant>
                </span>
              </span>
              <span className={styles.barres}>
                <span
                  className={`${styles.barreCapacite} ${futur ? styles.hachure : ''}`}
                  style={{ height: hauteur(v.capacite) }}
                >
                  {/* Le versé est un enfant de la capacité : sa hauteur est un
                      pourcentage de la barre qui le contient, ce qui le garde
                      dedans même quand l'échelle change. Au-delà de 100 % il
                      déborde, et c'est exactement ce qu'il faut voir. */}
                  {v.verse !== null && v.verse > 0 && (
                    <span
                      className={styles.barreVerse}
                      style={{ height: `${Math.min(200, (v.verse / Math.max(1, v.capacite)) * 100)}%` }}
                    />
                  )}
                </span>
              </span>
              <span
                className={`${styles.moisAxe} ${i === indexCourant ? styles.moisCourantAxe : ''}`}
              >
                {mois}
                <span className={styles.horsEcran}>
                  {' '}: {eur(v.capacite)} de capacité
                  {v.verse === null ? ', mois à venir' : `, ${eur(v.verse)} versés`}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {!verseConnu && (
        <p className={styles.aide}>
          Aucun relevé bancaire n’est importé&nbsp;: le versé est <strong>inconnu</strong>,
          et non nul. Les barres n’ont donc pas encore de plein à montrer.
        </p>
      )}
    </section>
  );
}
