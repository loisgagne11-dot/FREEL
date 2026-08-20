import { Suspense, lazy, useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { dateDuJour, recettesEncaissees } from '../../state/selecteurs';
import { type EtatArgent, type EtatSeuils, etatArgent } from '../../state/selecteurs.argent';
import type { DateISO, Mois } from '../../domain/types';
import { euros } from '../../domain/types';
import { periodesADeclarer } from '../../domain/calculs/declarations';
import { franchissementPrevu, partDeLAnneeEcoulee } from '../../domain/calculs/allure';
import { LIBELLE_NATURE, NATURES_DETTE } from '../../domain/calculs/provisions';
import { LIBELLE_IGNORE_IR } from '../../domain/calculs/provisionImpotRevenu.libelles';
import { Greet } from '../components/Greet';
import { Info } from '../components/Info';
import { Jauge } from '../components/Jauge';
import { Repartition } from '../components/Repartition';
import { Statut } from '../components/Statut';
import { useToast } from '../components/Toasts';
import { Echeances } from '../components/Echeances';
import { CartePliable } from '../components/CartePliable';
import { Chiffre } from '../components/Chiffre';
import { PanneauOnglet } from '../components/Onglets';
import { Etiquette, Piliers } from '../components/Piliers';
import { Sheet } from '../components/Sheet';
import { eur } from '../format';
import styles from './Argent.module.css';
import { Montant } from '../components/Montant';

/**
 * L'onglet DES arrive à l'ouverture de son onglet.
 *
 * `PanneauOnglet` ne rend rien quand son onglet est inactif : le module n'est
 * donc demandé qu'au moment où l'on va vraiment le lire. La déclaration
 * européenne de services se consulte une fois par mois au plus, et le reste de
 * l'écran n'en dépend pas — consulter sa trésorerie n'a aucune raison d'en
 * payer le téléchargement.
 */
const DeclarationServices = lazy(() => import('./Argent.des')
  .then((m) => ({ default: m.DeclarationServices })));

/**
 * Le dossier de déclaration de TVA, ouvert depuis son jalon.
 *
 * On déclare quatre fois par an. Une carte permanente ferait porter à chaque
 * consultation de la trésorerie le poids d'un écran qu'on ouvre un jour par
 * trimestre — et c'est aussi ce que demande l'énoncé : le dossier s'atteint
 * DEPUIS son échéance, pas en permanence.
 */
const DossierTvaPanneau = lazy(() => import('./Argent.tva')
  .then((m) => ({ default: m.DossierTvaPanneau })));

/**
 * La projection du disponible et les versements.
 *
 * Deux graphes qui ne servent qu'à une question de pilotage — « combien puis-je
 * me verser ? » — et qu'on ne consulte pas en vérifiant son solde. Ils vivent
 * donc dans leur propre module, chargé à l'ouverture de leur carte.
 */
const ProjectionPanneau = lazy(() => import('./Argent.projection')
  .then((m) => ({ default: m.ProjectionPanneau })));

/** Le registre : on l'ouvre pour vérifier ou justifier, pas tous les jours. */
const LivreDesRecettes = lazy(() => import('./Argent.livre')
  .then((m) => ({ default: m.LivreDesRecettes })));

/**
 * Le pilier Performance, avec tout ce qu'il porte.
 *
 * Il est différé pour deux raisons qui vont dans le même sens : l'écran était
 * à 39,83 Ko sur un budget de 40, et on ouvre Argent pour regarder son solde
 * bien plus souvent que pour lire son année. Voir l'en-tête du module.
 */
const Performance = lazy(() => import('./Argent.performance')
  .then((m) => ({ default: m.Performance })));

/**
 * Écran Argent — trésorerie et performance.
 *
 * L'écran le plus dense de l'application. Deux sections en onglets, comme le
 * veut le design : l'ancienne version montrait deux cartes indistinctes, si
 * bien qu'on ne voyait pas qu'il y avait un choix à faire.
 *
 * Les neuf graphiques Chart.js de l'ancienne version sont remplacés par du SVG
 * (voir `GrapheBarres`) : 627 Ko de bibliothèques bloquantes en moins.
 */

/**
 * Les deux piliers du dessin, et ce qu'on a fait des deux autres onglets.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE SORT DU LIVRE DES RECETTES ET DE LA DES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'écran portait quatre onglets de même rang. La référence n'en a que deux —
 * « Trésorerie » et « Performance » — et range le livre des recettes ailleurs,
 * dans le rail ; la DES n'y figure pas du tout.
 *
 * Les supprimer était exclu : ce sont deux obligations, et la DES est passible
 * de 750 € par déclaration manquante. Les laisser en onglets l'était aussi —
 * quatre onglets de même rang font croire à quatre questions équivalentes,
 * alors que deux se posent tous les jours et deux une fois par mois au plus.
 *
 * Ils deviennent donc deux registres, atteints depuis une rangée discrète sous
 * les piliers et ouverts en panneau plein — comme le dossier de TVA, et pour la
 * même raison : on ne les consulte qu'au moment de justifier ou de déclarer, et
 * ils tiennent alors tout l'écran.
 */
type Section = 'tresorerie' | 'performance';

/** Le registre ouvert par-dessus l'écran, ou aucun. */
type Registre = 'livre' | 'des' | 'tva' | null;

export function Argent() {
  const faits = useFaits((e) => e.faits);
  const [section, setSection] = useState<Section>('tresorerie');
  const [registre, setRegistre] = useState<Registre>(null);
  const idGroupe = useId();

  const etat = useMemo(() => etatArgent(faits), [faits]);
  const couverture = Math.round(etat.couvertureProvisions * 100);

  return (
    <>
      <Greet
        titre="Ton argent"
        sousTitre="Ce qui est rentré, ce qui reste à rentrer, et ce que la période doit."
        repere={(
          /* La couverture des provisions, et non le solde : le solde est déjà
             sur le pilier Trésorerie juste dessous, et le répéter n'apprend
             rien. Ce que l'en-tête ajoute, c'est la réponse à « si tout tombait
             demain, le compte suivrait-il ? ». */
          <Etiquette ton={couverture >= 100 ? 'ok' : 'attention'}>
            Provisions · {couverture}&nbsp;% couvertes
          </Etiquette>
        )}
      />

      <div className={styles.sections}>
        <Piliers
          idGroupe={idGroupe}
          piliers={[
            {
              id: 'tresorerie' as Section,
              libelle: 'Trésorerie',
              question: 'combien j’ai là, pour de vrai ?',
              chiffre: eur(etat.tresorerie.dispo),
              precision: 'disponible',
              icone: 'M3 7 H18 V18 H3 Z M3 7 L6 4 H15 L18 7 M14 12 H17'
            },
            {
              id: 'performance' as Section,
              libelle: 'Performance',
              question: 'combien je gagne, je me verse ?',
              chiffre: eur(etat.caRealise),
              precision: `CA réalisé ${etat.annee}`,
              icone: 'M3 17 L9 11 L13 15 L21 7'
            }
          ]}
          actif={section}
          onChange={setSection}
          libelle="Sections de l’écran Argent"
        />

        <PanneauOnglet idGroupe={idGroupe} id="tresorerie" actif={section === 'tresorerie'}>
          <div className={styles.grille}>
            <Chiffre libelle="Solde" valeur={eur(etat.tresorerie.solde)} />
            <Chiffre
              libelle="À garder de côté"
              valeur={eur(etat.tresorerie.provisions)}
              ton={etat.tresorerie.provisions > 0 ? 'attention' : 'neutre'}
            />
            <Chiffre
              libelle="Disponible"
              valeur={eur(etat.tresorerie.dispo)}
              ton={etat.tresorerie.dispo < 0 ? 'danger' : 'neutre'}
            />
            <Chiffre libelle="Versable" valeur={eur(etat.tresorerie.versable)} ton="accent" />
          </div>

          <CartePliable
            id="repartition"
            ecran="argent"
            titre="Votre solde n’est pas tout à vous"
            aide={<Info libelle="Pourquoi le solde trompe">
                  Le solde bancaire contient les cotisations d’un trimestre que
                  vous n’avez pas encore déclaré. Le regarder et se sentir riche,
                  c’est le mécanisme exact du rappel qu’on ne peut plus payer. La
                  barre montre d’abord ce qui n’est <em>pas</em> à vous.
                </Info>}
            resume={(
              <>
                <Montant>{eur(etat.tresorerie.versable)}</Montant> à vous
                {' · '}<Montant>{eur(etat.tresorerie.provisions)}</Montant> de côté
                {' · '}<Montant>{eur(etat.tresorerie.reserve)}</Montant> de seuil de sécurité
              </>
            )}
          >
            <Repartition
              total={etat.tresorerie.solde}
              deficit={Math.max(0, -etat.tresorerie.dispo)}
              parts={[
                {
                  libelle: 'Provisions — dû, pas encore payé',
                  montant: Math.min(etat.tresorerie.provisions, Math.max(0, etat.tresorerie.solde)),
                  ton: 'provisions'
                },
                {
                  // Le seuil n'est constitué qu'à hauteur de ce qui reste après
                  // provisions : l'afficher plein sur un disponible insuffisant
                  // ferait croire à un matelas qui n'existe pas.
                  //
                  // « Seuil de sécurité » et non « réserve » : le mot vient du
                  // dessin, et il libère « réserve » pour l'autre notion — la
                  // part gardée au versement, qui est un pourcentage. Un seul
                  // mot couvrait deux idées, et c'est ainsi qu'un plancher fixe
                  // finit par être exprimé en pourcentage du disponible.
                  libelle: 'Seuil de sécurité',
                  montant: Math.min(etat.tresorerie.reserve, Math.max(0, etat.tresorerie.dispo)),
                  ton: 'reserve'
                },
                {
                  libelle: 'Versable — à vous',
                  montant: etat.tresorerie.versable,
                  ton: 'versable'
                }
              ]}
            />
          </CartePliable>

          <CarteSeuils seuils={etat.seuils} />

          <CartePliable
            id="projection"
            ecran="argent"
            titre="Où va votre disponible, et combien vous pouvez vous verser"
            aide={<Info libelle="Ce que cette projection montre">
                  Douze mois à venir, dans deux scénarios&nbsp;: sans rien vous
                  verser, et en vous versant chaque mois le maximum qui ne fasse
                  jamais passer le disponible sous votre réserve. Les
                  encaissements attendus viennent des factures émises non
                  réglées et du revenu prévu au planning — aucune tendance n’est
                  devinée.
                </Info>}
            resume="Projection sur douze mois, et versement mensuel soutenable"
          >
            <Suspense fallback={<p role="status" className={styles.vide}>Chargement…</p>}>
              <ProjectionPanneau />
            </Suspense>
          </CartePliable>

          <CartePliable
            id="enveloppes"
            ecran="argent"
            titre="Enveloppes de provision"
            aide={<Info libelle="Explication des deux volets de provision">
                  Les échéances émises sont ce que l’URSSAF ou le fisc ont déjà
                  appelé. Les charges sur recettes encaissées sont dues mais pas
                  encore appelées&nbsp;: la dette naît à l’encaissement, pas à
                  l’émission de l’échéance. Une fois la période déclarée, la
                  seconde ligne bascule dans la première.
                </Info>}
            resume={(
              <>
                <Montant>{eur(etat.tresorerie.provisions)}</Montant> à garder de côté
                {' · dont '}<Montant>{eur(etat.voletConstate)}</Montant> déjà appelés
              </>
            )}
          >
            <dl className={styles.detail}>
              <div className={styles.ligne}>
                <dt>Échéances émises, à payer</dt>
                <dd><Montant>{eur(etat.voletConstate)}</Montant></dd>
              </div>
              <div className={styles.ligne}>
                <dt>Charges sur recettes encaissées non déclarées</dt>
                <dd><Montant>{eur(etat.voletAProvisionner)}</Montant></dd>
              </div>
              <div className={`${styles.ligne} ${styles.total}`}>
                <dt>Total à garder de côté</dt>
                <dd><Montant>{eur(etat.tresorerie.provisions)}</Montant></dd>
              </div>
            </dl>

            {/* « Sur cette somme totale, combien j'ai de provision et sur
                quelle catégorie ». Un total ne dit pas ce qu'il faut en
                faire : il ne permet ni de rapprocher une provision de l'avis
                reçu, ni de savoir ce qui se libère après une déclaration. */}
            <h3 className={styles.sousTitre}>
              Sur quelle catégorie
              <Info libelle="D’où vient la ventilation">
                Les échéances déjà émises portent chacune leur nature. Les
                charges sur recettes encaissées n’ont pas encore d’échéance à
                qui la demander&nbsp;: elles se répartissent selon la règle qui
                les calcule — cotisations d’un côté, impôt et contributions de
                l’autre. La TVA n’y figure pas tant qu’aucun appel n’est émis,
                parce qu’elle se relève sur les factures et ne se déduit
                d’aucun taux.
              </Info>
            </h3>
            <Repartition
              total={etat.tresorerie.provisions}
              deficit={0}
              parts={NATURES_DETTE.map((n) => ({
                libelle: LIBELLE_NATURE[n],
                montant: etat.provisionsParNature[n],
                ton: n
              }))}
            />
            <NoteImpotRevenu provision={etat.provisionImpotRevenu} />
          </CartePliable>

          <Echeances />

          <CarteDeclarations idGroupe={idGroupe} />
        </PanneauOnglet>

        <PanneauOnglet idGroupe={idGroupe} id="performance" actif={section === 'performance'}>
          <Suspense fallback={<p role="status" className={styles.vide}>Chargement…</p>}>
            <Performance etat={etat} />
          </Suspense>
        </PanneauOnglet>
      </div>

      {/* Les registres et le dossier de déclaration : atteints d'ici, ouverts
          par-dessus. Voir l'en-tête de `Section` pour le motif. */}
      <div className={styles.registres}>
        <button type="button" className={styles.lienRegistre} onClick={() => setRegistre('tva')}>
          Préparer ma déclaration de TVA
        </button>
        <button type="button" className={styles.lienRegistre} onClick={() => setRegistre('livre')}>
          Livre des recettes
        </button>
        <button type="button" className={styles.lienRegistre} onClick={() => setRegistre('des')}>
          Déclaration européenne de services
        </button>
      </div>

      {/* « Au clic, j'ai toutes les informations pour remplir ma
          déclaration. » Un panneau plutôt qu'une carte : le dossier ne se
          consulte qu'au moment de déclarer, et il tient alors tout l'écran —
          ce qu'une carte au milieu d'une pile ne peut pas faire. */}
      <Sheet
        ouvert={registre !== null}
        titre={registre === 'livre' ? 'Livre des recettes'
          : registre === 'des' ? 'Déclaration européenne de services'
            : 'Déclaration de TVA'}
        onFermer={() => setRegistre(null)}
      >
        {registre !== null && (
          <Suspense fallback={<p role="status" className={styles.vide}>Chargement…</p>}>
            {registre === 'livre' && <LivreDesRecettes idGroupe={idGroupe} />}
            {registre === 'des' && <DeclarationServices idGroupe={idGroupe} />}
            {registre === 'tva' && <DossierTvaPanneau />}
          </Suspense>
        )}
      </Sheet>
    </>
  );
}


/**
 * « Seuils — où j'en suis », la carte prévue par la spec de design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE JAUGE SUR UN SEUIL INCONNU EST UN MENSONGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les deux seuils viennent de tables datées, qui peuvent ne pas couvrir la
 * période demandée. Dessiner une barre à « 62 % » d'un plafond qu'on ne
 * connaît pas produirait un pourcentage inventé — et c'est précisément sur ce
 * pourcentage qu'on décide de facturer ou non avant la fin de l'année.
 *
 * Chaque jauge n'est donc rendue que si sa résolution est utilisable ; sinon,
 * l'écran dit pourquoi il ne peut pas répondre.
 */
/**
 * Les périodes URSSAF, et le geste qui les fait basculer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE SON ABSENCE COÛTAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les provisions se tiennent en deux volets (D3) : ce que l'URSSAF a appelé,
 * et ce qui est dû sur des recettes encaissées mais pas encore déclaré. Le
 * second bascule dans le premier au moment de la déclaration.
 *
 * `marquerPeriodeDeclaree` existait dans le magasin. Aucun écran ne l'appelait.
 * Une période déclarée restait donc à jamais dans le volet « à provisionner » :
 * les provisions montaient sans jamais redescendre, et le versable baissait
 * d'autant. On mettait de côté deux fois la même dette.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DÉCLARÉ N'EST PAS PAYÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Cocher ici ne dit pas que la somme est réglée : elle passe de « à
 * provisionner » à « appelé, à payer ». Elle reste donc dans le total à garder
 * de côté — c'est justement pour la payer qu'on la garde.
 */
function CarteDeclarations({ idGroupe }: { idGroupe: string }) {
  const faits = useFaits((e) => e.faits);
  const marquer = useFaits((e) => e.marquerPeriodeDeclaree);
  const annuler = useFaits((e) => e.annulerPeriodeDeclaree);
  const signaler = useToast();

  const periodes = useMemo(() => periodesADeclarer(
    recettesEncaissees(faits),
    faits.entreprise.urssafPeriodicite,
    faits.periodesDeclarees,
    new Date().toISOString().slice(0, 10)
  ), [faits]);

  if (periodes.length === 0) return null;

  return (
    <section className={styles.carte} aria-labelledby={`${idGroupe}-declarations`}>
      <h2 id={`${idGroupe}-declarations`} className={styles.titreCarte}>
        Périodes URSSAF
        <Info libelle="À quoi sert de cocher une période">
          Tant qu’une période n’est pas déclarée, les cotisations dues dessus
          restent dans le volet «&nbsp;à provisionner&nbsp;». La déclarer les
          fait basculer dans «&nbsp;échéances émises&nbsp;»&nbsp;: la somme
          reste à garder de côté, mais elle cesse d’être comptée deux fois.
          Cocher ne veut pas dire payé.
        </Info>
      </h2>

      <ul className={styles.listeDeclarations}>
        {periodes.map((p) => (
          <li key={p.id} className={styles.ligneDeclaration}>
            <span className={styles.declarationTitre}>
              <span>{p.libelle}</span>
              <span className={styles.declarationMontant}>
                <Montant>{eur(p.encaisse)}</Montant> encaissés
              </span>
            </span>

            {p.declaree
              ? (
                <span className={styles.declarationActions}>
                  <Statut libelle="Déclarée" ton="ok" />
                  <button
                    type="button"
                    className={styles.actionLigne}
                    onClick={() => {
                      for (const m of p.mois) annuler(m);
                      signaler(`${p.libelle} n’est plus marquée déclarée.`);
                    }}
                  >
                    Annuler
                  </button>
                </span>
              )
              : p.close
                ? (
                  <button
                    type="button"
                    className={styles.actionLigne}
                    onClick={() => {
                      for (const m of p.mois) marquer(m);
                      signaler(`${p.libelle} marquée déclarée.`);
                    }}
                  >
                    Marquer déclarée
                  </button>
                )
                : (
                  /* Une période en cours ne se déclare pas : l'URSSAF ouvre la
                     déclaration après sa clôture, et la cocher d'avance
                     sortirait du volet « à provisionner » des recettes qu'on
                     va encore encaisser dessus. */
                  <span className={styles.declarationAttente}>
                    Période en cours, pas encore déclarable
                  </span>
                )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CarteSeuils({ seuils }: { seuils: EtatSeuils }) {
  const plafond = seuils.plafondMicro;
  const tva = seuils.franchiseTva;

  /**
   * Le repère de date, posé sur chaque jauge.
   *
   * C'est un fait de calendrier, pas une extrapolation : au 15 novembre, 87 %
   * de l'année est passée quoi qu'on fasse. Sans lui, « 69 % du plafond » se
   * lit pareil en mars et en novembre, alors que c'est une bonne nouvelle dans
   * un cas et un problème dans l'autre.
   */
  const aujourdhui = dateDuJour();
  const repere = {
    part: partDeLAnneeEcoulee(aujourdhui),
    libelle: `${Math.round(partDeLAnneeEcoulee(aujourdhui) * 100)} % de l’année écoulée`
  };

  /**
   * Ce que la carte dit une fois repliée.
   *
   * La spec de design notait que le résumé plié de cette carte était **écrit en
   * dur** dans le prototype (« voir Écarts »). Il est ici dérivé des seuils
   * réels, et il refuse de se prononcer quand le barème refuse : un résumé qui
   * annoncerait une marge sur un plafond inconnu serait précisément le genre de
   * chiffre rassurant et faux que le projet s'interdit.
   *
   * C'est le seuil MAJORÉ qui est mis en avant, et non la franchise : c'est lui
   * qui assujettit dès le mois du dépassement, sur des factures déjà émises
   * sans TVA.
   */
  const resume = tva.statut === 'refuse'
    ? 'Seuils de TVA indisponibles pour cette période.'
    : (
      <>
        <Montant>{eur(euros(Math.max(0, tva.valeur.majore - seuils.caEncaisse)))}</Montant>
        {' avant le seuil majoré de TVA'}
        {plafond.statut !== 'refuse' && (
          <>
            {' · '}
            <Montant>{eur(euros(Math.max(0, plafond.valeur - seuils.caEncaisse)))}</Montant>
            {' avant le plafond micro'}
          </>
        )}
      </>
    );

  return (
    <CartePliable
      id="seuils"
      ecran="argent"
      titre="Seuils — où j’en suis"
            aide={<Info libelle="Ce que ces deux seuils déclenchent">
            Le <strong>plafond micro</strong> conditionne le régime lui-même&nbsp;:
            le dépasser deux années de suite fait basculer en réel. La
            <strong> franchise de TVA</strong> est plus immédiate&nbsp;: passé le
            seuil majoré, la TVA devient exigible <em>dès le mois du
            dépassement</em>, y compris sur les factures déjà émises sans TVA.
            Les deux se mesurent sur le chiffre d’affaires <em>encaissé</em>.
          </Info>}
      resume={resume}
    >
      <div className={styles.jauges}>
        {plafond.statut === 'refuse'
          ? <p className={styles.vide}>Plafond micro&nbsp;: {plafond.motif}</p>
          : (
            <Jauge
              libelle="Plafond micro-entreprise"
              atteint={seuils.caEncaisse}
              seuil={plafond.valeur}
              unite="€"
              repere={repere}
              note={<NoteDeFranchissement
                encaisse={seuils.caEncaisse}
                seuil={plafond.valeur}
                aujourdhui={aujourdhui}
              />}
            />
          )}

        {tva.statut === 'refuse'
          ? <p className={styles.vide}>Franchise de TVA&nbsp;: {tva.motif}</p>
          : (
            <>
              <Jauge
                libelle="Franchise de TVA"
                atteint={seuils.caEncaisse}
                seuil={tva.valeur.franchise}
                unite="€"
                repere={repere}
                note={<NoteDeFranchissement
                  encaisse={seuils.caEncaisse}
                  seuil={tva.valeur.franchise}
                  aujourdhui={aujourdhui}
                />}
              />
              {/* Le seuil MAJORÉ est celui où prévenir tard coûte le plus
                  cher : le franchir rend la TVA exigible dès le 1er du mois,
                  sur des factures déjà émises sans TVA. */}
              <Jauge
                libelle="Seuil majoré de TVA"
                atteint={seuils.caEncaisse}
                seuil={tva.valeur.majore}
                unite="€"
                repere={repere}
                note={<NoteDeFranchissement
                  encaisse={seuils.caEncaisse}
                  seuil={tva.valeur.majore}
                  aujourdhui={aujourdhui}
                />}
              />
            </>
          )}
      </div>
    </CartePliable>
  );
}

/**
 * Ce que le rythme constaté annonce, avec son hypothèse visible.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE EXTRAPOLATION QUI DIT QU'ELLE EN EST UNE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Prolonger le rythme est légitime pour annoncer l'avenir — c'est même la
 * seule façon de prévenir avant le franchissement. Mais le chiffre ne vaut que
 * son hypothèse, qui est écrite : « au rythme de l'encaissé depuis janvier ».
 *
 * Et l'abstention est dite, jamais déguisée : sous un trimestre d'activité, un
 * seul règlement important suffit à tripler le rythme apparent. La phrase dit
 * alors pourquoi elle ne dit rien, au lieu d'afficher une date qui sauterait
 * d'un mois à l'autre chaque semaine.
 */
function NoteDeFranchissement(
  { encaisse, seuil, aujourdhui }: {
    readonly encaisse: number;
    readonly seuil: number;
    readonly aujourdhui: DateISO;
  }
) {
  const f = franchissementPrevu(euros(encaisse), euros(seuil), aujourdhui);

  // Un seuil déjà franchi n'a plus de date à prévoir, et la jauge le dit déjà
  // en clair au-dessus. Le répéter n'ajouterait rien.
  if (f.statut === 'depasse') return null;

  if (f.statut === 'indeterminable') {
    return <>Pas de projection&nbsp;: {f.motif}.</>;
  }

  if (f.statut === 'hors_annee') {
    return <>Au rythme de l’encaissé depuis janvier, seuil non atteint d’ici le 31 décembre.</>;
  }

  return (
    <>
      Au rythme de l’encaissé depuis janvier, seuil atteint vers{' '}
      <strong>{moisLong(f.mois)}</strong>.
    </>
  );
}

/**
 * Ce que recouvre la ligne « impôt sur le revenu », et ce qu'elle ignore.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN MONTANT D'IMPÔT NE S'AFFICHE PAS SEUL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Il repose sur des faits que l'utilisateur seul connaît — ses parts, les
 * autres revenus de son foyer — et sur un barème qui n'est pas toujours
 * publié. Présenté sans ses réserves, il se lit comme « voilà ce que je
 * dois », et on décide dessus. Refusé, il laisse la ligne à zéro : il faut
 * alors dire POURQUOI, sans quoi l'écran affiche un versable trop élevé sans
 * rien signaler.
 *
 * `null` sous le versement libératoire : l'impôt y est déjà payé avec les
 * cotisations, il n'y a pas de seconde ligne à expliquer.
 */
function NoteImpotRevenu(
  { provision }: { readonly provision: EtatArgent['provisionImpotRevenu'] }
) {
  if (provision === null) return null;

  if (provision.statut === 'refuse') {
    return (
      /* Le motif se suffit à lui-même : il commence par nommer la ligne
         concernée, parce qu'il sert aussi de bandeau sur le Pilote. Le
         préfixer ici répéterait « impôt sur le revenu » deux fois de suite. */
      <ul className={styles.hypotheses}>
        <li><strong>{provision.motif}</strong></li>
      </ul>
    );
  }

  const p = provision.valeur;
  return (
    <ul className={styles.hypotheses}>
      <li>
        <strong>Impôt sur le revenu&nbsp;: {eur(p.resteAProvisionner)}</strong> restant à
        mettre de côté pour {p.annee} — {eur(p.impotMicro)} estimés sur la part micro,
        moins {eur(p.acomptesPasSaisis)} d’acomptes déjà appelés.
        {p.parMoisRestant !== null
          && ` Soit ${eur(p.parMoisRestant)} par mois sur ${p.moisRestants} mois.`}
      </li>
      {p.ignore.map((r) => <li key={r}>{LIBELLE_IGNORE_IR[r]}</li>)}
    </ul>
  );
}

/** « 2026-09 » → « septembre 2026 ». */
function moisLong(m: Mois): string {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric', timeZone: 'UTC'
  });
}








