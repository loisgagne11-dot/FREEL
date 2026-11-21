import { useEffect, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { dateDuJour, moisCourant } from '../../state/selecteurs';
import { etatArgent, etatProjection, type EtatArgent } from '../../state/selecteurs.argent';
import {
  compositionDuMois, resultatProjete, type CompositionDuMois, type ResultatProjete
} from '../../state/selecteurs.performance';
import { allureObjectif } from '../../domain/calculs/objectif';
import type { Mois } from '../../domain/types';
import { euros } from '../../domain/types';
import { Chiffre } from '../components/Chiffre';
import { Info } from '../components/Info';
import { Montant } from '../components/Montant';
import { eur, formaterJours, moisLong } from '../format';
import { enKiloEuros } from '../format.kilo';
import styles from './Argent.performance.module.css';

/**
 * Ce qui était le pilier « Performance » de l'écran Argent — « combien je
 * gagne » — : tuiles, graphe et composition du chiffre d'affaires, une
 * analyse de l'activité qui vit sous Activité › Analyse (lot 51). « Tu peux te
 * verser » et la capacité de versement, qui découlent du solde, ont rejoint la
 * Trésorerie redessinée (lot 49) : la cascade et la vue Année.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL VIT DANS SON PROPRE MODULE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Argent était à 39,83 Ko sur un budget de 40 : le lot qui remplissait ce
 * pilier l'aurait fait dépasser à la première carte. La règle du projet est de
 * ne jamais relever un budget mais d'EXTRAIRE ce qui n'a rien à faire dans le
 * lot ; la coupure tient toujours — Activité comme Trésorerie l'ouvrent à la
 * demande.
 *
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
const HAUTEUR_BARRES = 200;
const BAS_DES_BARRES = 22;

/** Les mois de l'axe, dans la langue du dessin. */
const MOIS_COURTS = [
  'JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEP', 'OCT', 'NOV', 'DÉC'
];

/**
 * L'analyse du chiffre d'affaires d'une année, pour Activité › Analyse.
 *
 * Elle calcule son `EtatArgent` elle-même : l'écran Activité n'en a pas
 * d'autre usage, et le lui faire calculer pour le passer ici le tirerait dans
 * son paquet pour une carte qu'on n'ouvre pas tous les jours.
 */
export function AnalyseDeLAnnee({ annee }: { readonly annee: number }) {
  const faits = useFaits((e) => e.faits);
  const etat = useMemo(() => etatArgent(faits, faits.echeances, new Date(), annee), [faits, annee]);
  return <AnalyseDuCa etat={etat} />;
}

/** Tuiles, graphe et composition du chiffre d'affaires de `etat.annee`. */
export function AnalyseDuCa({ etat }: { readonly etat: EtatArgent }) {
  const faits = useFaits((e) => e.faits);
  const m0 = moisCourant();
  const indexCourant = Number(m0.slice(5, 7)) - 1;

  /**
   * `etat.annee` est un CHOIX ; l'année réelle ne l'est pas. Elles ne
   * coïncident QUE quand personne n'a touché au sélecteur — c'est le cas le
   * plus courant, mais deux calculs de cette carte doivent savoir le
   * distinguer : voir juste en dessous.
   */
  const anneeReelle = Number(m0.slice(0, 4));
  const estAnneeCourante = etat.annee === anneeReelle;

  const projection = useMemo(() => etatProjection(faits), [faits]);
  const resultat = useMemo(
    () => resultatProjete(faits, new Date(), projection), [faits, projection]
  );

  /**
   * Le mois dont on lit la composition. Le mois courant à l'ouverture.
   *
   * Le dessin écrit « clic sur un mois = composition » : c'est le graphe qui
   * commande le panneau, et non un second sélecteur qui aurait permis de
   * regarder mars pendant que le graphe met juin en évidence.
   */
  const [moisLu, setMoisLu] = useState<Mois>(m0);

  // La bascule d'année déplace le graphe hors du mois lu : sans ce recalage,
  // le panneau de composition continuerait d'afficher le mois réel courant
  // (ex. « août 2026 ») pendant qu'on regarde le graphe de 2024, un mois qui
  // n'y figure même pas. Une année passée n'a pas de « mois courant » : on
  // retombe sur son dernier mois, décembre.
  useEffect(() => {
    setMoisLu(estAnneeCourante ? m0 : `${etat.annee}-12` as Mois);
    // Volontaire : seule une bascule d'ANNÉE doit recaler la lecture, pas
    // chaque rendu. (La directive visait la ligne de commentaire et ne
    // désactivait rien ; le lint des hooks du lot 7 l'a relevé.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat.annee]);

  const composition = useMemo(() => compositionDuMois(faits, moisLu), [faits, moisLu]);

  /*
   * L'ALLURE NE SE LIT QUE SUR L'ANNÉE EN COURS.
   *
   * `allureObjectif` compare un réalisé À CE JOUR à un rythme attendu À CE
   * JOUR — une question qui n'a de sens que pour une année encore en train de
   * se dérouler. Sur 2024 consultée en 2026, « jours d'avance » comparerait
   * le total (définitif) d'une année finie à la part de 2026 déjà écoulée :
   * un nombre qui aurait l'air d'un calcul et qui n'en serait pas un.
   */
  const allure = useMemo(
    () => (estAnneeCourante
      ? allureObjectif(faits.objectifCaAnnuel, etat.caEncaisse, dateDuJour())
      : null),
    [estAnneeCourante, faits.objectifCaAnnuel, etat.caEncaisse]
  );

  return (
    <>
      <div className={styles.tuiles}>
        {/*
          * « FACTURÉ » ET NON « RÉALISÉ », ET C'EST UNE CORRECTION DE NOM.
          *
          * Le titre disait « CA réalisé » et la note « facturé, cumulé » : la
          * note disait juste, le titre non. Or « réalisé » désigne ailleurs
          * une TOUTE AUTRE mesure — ce que le travail du planning produit,
          * jours retenus multipliés par le tarif, que l'écran Activité nomme
          * « CA généré ».
          *
          * Les deux sont légitimes et ne coïncident jamais : on facture après
          * coup, et une journée travaillée le 30 du mois n'est facturée que le
          * mois suivant. Un utilisateur venu de l'ancienne application, qui
          * appelait « CA réalisé » la seconde, lisait donc deux nombres très
          * différents sous le même nom et concluait — à raison — qu'il ne
          * comprenait pas les données.
          *
          * Une source unique par notion suppose d'abord un nom par notion.
          */}
        <Chiffre
          libelle={`CA facturé · ${etat.annee}`}
          valeur={eur(etat.caRealise)}
          note="émis, encaissé ou non"
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
        <TuileResultat resultat={resultat} />
      </div>

      <div className={styles.deuxColonnes}>
        <GrapheCa
          etat={etat}
          indexCourant={indexCourant}
          estAnneeCourante={estAnneeCourante}
          moisLu={moisLu}
          onLire={setMoisLu}
          objectifMensuel={faits.objectifCaAnnuel === null ? null : faits.objectifCaAnnuel / 12}
          joursDEcart={allure?.joursDEcart ?? null}
        />
        <PanneauComposition composition={composition} />
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
 *
 * L'année de la tuile vient de `resultat.annee` — celle de `maintenant`,
 * TOUJOURS — et non de l'année choisie au sélecteur : ce résultat projette
 * douze mois à partir d'aujourd'hui, pas depuis la fin de l'année qu'on
 * regarde. Lui donner l'année du sélecteur écrirait « fin 2024 » sur un
 * chiffre qui reste, lui, une projection à douze mois de la date du jour.
 */
function TuileResultat({ resultat }: { readonly resultat: ResultatProjete | null }) {
  if (resultat === null) return null;
  const annee = resultat.annee;

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
                que toi seul connais et il se saisit depuis ton avis, il ne
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
 * CA FACTURÉ contre CA encaissé, **mois écoulés seulement**.
 *
 * « Facturé » et non « réalisé » : voir la tuile plus haut. « Réalisé »
 * désigne ailleurs ce que le travail du planning produit, une tout autre
 * mesure, et le même mot pour les deux faisait lire deux nombres très
 * différents comme s'ils devaient coïncider.
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
 * Cette troncature ne vaut que pour l'année RÉELLEMENT en cours — `mois
 * courant` n'a de sens que sur elle. En consultant une année passée par le
 * sélecteur, `estAnneeCourante` vaut `false` et les douze mois s'affichent :
 * une année révolue n'a pas de mois « pas encore atteint », et la tronquer à
 * l'index du mois réel ferait disparaître son second semestre.
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
  { etat, indexCourant, estAnneeCourante, moisLu, onLire, objectifMensuel, joursDEcart }: {
    readonly etat: EtatArgent;
    readonly indexCourant: number;
    /** `false` sur une année passée ou future choisie au sélecteur — voir la doc ci-dessus. */
    readonly estAnneeCourante: boolean;
    readonly moisLu: Mois;
    readonly onLire: (m: Mois) => void;
    readonly objectifMensuel: number | null;
    readonly joursDEcart: number | null;
  }
) {
  const ecoules = estAnneeCourante ? etat.parMois.slice(0, indexCourant + 1) : etat.parMois;
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
          CA facturé vs encaissé
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
          const estCourant = estAnneeCourante && i === indexCourant;
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
              aria-label={`${MOIS_COURTS[i] ?? m.mois} : ${eur(m.realise)} facturé, `
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
          <span className={styles.pastilleRealise} aria-hidden="true" />CA facturé
          <span className={styles.pastilleEncaisse} aria-hidden="true" />CA encaissé
        </span>
        <span className={styles.cumul}>
          Cumulé&nbsp;: <Montant>{eur(etat.caRealise)}</Montant> facturé ·{' '}
          <Montant>{eur(etat.caEncaisse)}</Montant> encaissé
        </span>
      </footer>

      {objectifMensuel !== null && (
        <p className={styles.aide}>
          Le repère mensuel est l’objectif annuel divisé par douze&nbsp;— une
          hypothèse d’étalement, pas une prévision.{' '}
          {joursDEcart === null ? null : joursDEcart >= 0
            ? <>Sur l’année écoulée, tu as <strong>{joursDEcart} jour
              {joursDEcart > 1 ? 's' : ''} d’avance</strong> sur l’objectif.</>
            : <>Sur l’année écoulée, tu as <strong>{-joursDEcart} jour
              {-joursDEcart > 1 ? 's' : ''} de retard</strong> sur l’objectif.</>}
        </p>
      )}
    </section>
  );
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
            une dette. Sans lui, le montant se range à côté du dû et
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
