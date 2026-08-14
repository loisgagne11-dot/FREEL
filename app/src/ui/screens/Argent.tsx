import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import {
  etatArgent, moisCourant, recettesEncaissees
} from '../../state/selecteurs';
import { etatDes, etatLivre } from '../../state/selecteurs.livre';
import type { EtatSeuils } from '../../state/selecteurs';
import type { Mois } from '../../domain/types';
import { euros } from '../../domain/types';
import { estAnnulation } from '../../domain/calculs/livreRecettes';
import { periodesADeclarer } from '../../domain/calculs/declarations';
import { LIBELLE_NATURE, NATURES_DETTE } from '../../domain/calculs/provisions';
import { GrapheBarres, type SerieBarres } from '../components/GrapheBarres';
import { Greet } from '../components/Greet';
import { Info } from '../components/Info';
import { Jauge } from '../components/Jauge';
import { Repartition } from '../components/Repartition';
import { Statut, statutRecette } from '../components/Statut';
import { Vide } from '../components/Vide';
import { useToast } from '../components/Toasts';
import { Echeances } from '../components/Echeances';
import { CartePliable } from '../components/CartePliable';
import { Onglets, PanneauOnglet } from '../components/Onglets';
import { dateCourte, eur } from '../format';
import styles from './Argent.module.css';
import { Montant } from '../components/Montant';

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

type Section = 'tresorerie' | 'performance' | 'livre' | 'des';

const SECTIONS = [
  { id: 'tresorerie' as Section, libelle: 'Trésorerie' },
  { id: 'performance' as Section, libelle: 'Performance' },
  { id: 'livre' as Section, libelle: 'Livre des recettes' },
  { id: 'des' as Section, libelle: 'DES' }
];

/** Abréviations de mois, pour l'axe du graphe. */
const MOIS_COURTS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export function Argent() {
  const faits = useFaits((e) => e.faits);
  const [section, setSection] = useState<Section>('tresorerie');
  const idGroupe = useId();

  const etat = useMemo(() => etatArgent(faits), [faits]);

  return (
    <>
      <Greet
        titre="Argent"
        sousTitre="Ce qui est rentré, ce qui reste à rentrer, et ce que la période doit."
        repere={`Année ${etat.annee}`}
      />

      <div className={styles.sections}>
        <Onglets
          idGroupe={idGroupe}
          onglets={SECTIONS}
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
            titre={(
              <>
                Votre solde n’est pas tout à vous
                <Info libelle="Pourquoi le solde trompe">
                  Le solde bancaire contient les cotisations d’un trimestre que
                  vous n’avez pas encore déclaré. Le regarder et se sentir riche,
                  c’est le mécanisme exact du rappel qu’on ne peut plus payer. La
                  barre montre d’abord ce qui n’est <em>pas</em> à vous.
                </Info>
              </>
            )}
            resume={(
              <>
                <Montant>{eur(etat.tresorerie.versable)}</Montant> à vous
                {' · '}<Montant>{eur(etat.tresorerie.provisions)}</Montant> de côté
                {' · '}<Montant>{eur(etat.tresorerie.reserve)}</Montant> en réserve
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
                  // La réserve n'est constituée qu'à hauteur de ce qui reste
                  // après provisions : l'afficher pleine sur un disponible
                  // insuffisant ferait croire à un matelas qui n'existe pas.
                  libelle: 'Réserve de sécurité',
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
            id="enveloppes"
            ecran="argent"
            titre={(
              <>
                Enveloppes de provision
                <Info libelle="Explication des deux volets de provision">
                  Les échéances émises sont ce que l’URSSAF ou le fisc ont déjà
                  appelé. Les charges sur recettes encaissées sont dues mais pas
                  encore appelées&nbsp;: la dette naît à l’encaissement, pas à
                  l’émission de l’échéance. Une fois la période déclarée, la
                  seconde ligne bascule dans la première.
                </Info>
              </>
            )}
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
          </CartePliable>

          <Echeances />

          <CarteDeclarations idGroupe={idGroupe} />
        </PanneauOnglet>

        <PanneauOnglet idGroupe={idGroupe} id="performance" actif={section === 'performance'}>
          <div className={styles.grille}>
            <Chiffre libelle="Facturé sur l’année" valeur={eur(etat.caRealise)} />
            <Chiffre libelle="Encaissé sur l’année" valeur={eur(etat.caEncaisse)} ton="accent" />
            <Chiffre
              libelle="Reste à rentrer"
              valeur={eur(etat.resteARentrer)}
              ton={etat.resteARentrer > 0 ? 'attention' : 'neutre'}
            />
          </div>

          <section className={styles.carte} aria-labelledby={`${idGroupe}-graphe`}>
            <h2 id={`${idGroupe}-graphe`} className={styles.titreCarte}>
              Chiffre d’affaires mois par mois
              <Info libelle="Explication de l’écart entre facturé et encaissé">
                Le facturé dit ce qui a été émis, l’encaissé ce qui est arrivé
                sur le compte. L’écart entre les deux est ce qui se transforme
                en trou de trésorerie — et c’est pourquoi les seuils fiscaux se
                calculent sur l’encaissé, jamais sur le facturé.
              </Info>
            </h2>
            <GrapheBarres
              titre={`Facturé et encaissé, ${etat.annee}`}
              categories={etat.parMois.map((m, i) => MOIS_COURTS[i] ?? m.mois)}
              series={seriesDe(etat.parMois)}
              formater={enKiloEuros}
            />
          </section>
        </PanneauOnglet>

        <PanneauOnglet idGroupe={idGroupe} id="livre" actif={section === 'livre'}>
          <LivreDesRecettes idGroupe={idGroupe} />
        </PanneauOnglet>

        <PanneauOnglet idGroupe={idGroupe} id="des" actif={section === 'des'}>
          <DeclarationServices idGroupe={idGroupe} />
        </PanneauOnglet>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Livre des recettes
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Le registre obligatoire.
 *
 * L'ancienne application ne portait ni date d'encaissement ni mode de
 * règlement : son registre n'était pas conforme, et rien ne le disait. Ici,
 * les écarts sont constatés et nommés — « registre non conforme » sans plus de
 * précision n'aide personne à le rendre conforme.
 *
 * Le livre ne contient QUE des encaissements. Une facture émise et non réglée
 * n'y figure pas : l'y faire figurer serait déclarer une recette qui n'a pas
 * eu lieu.
 */
function LivreDesRecettes({ idGroupe }: { idGroupe: string }) {
  const faits = useFaits((e) => e.faits);
  const annulerRecette = useFaits((e) => e.annulerRecette);
  const etat = useMemo(() => etatLivre(faits), [faits]);

  return (
    <>
      <div className={styles.grille}>
        <Chiffre libelle="Écritures au livre" valeur={String(etat.total.ecritures)} />
        <Chiffre libelle="Total encaissé" valeur={eur(etat.total.total)} ton="accent" />
        <Chiffre
          libelle="Écarts de conformité"
          valeur={String(etat.ecarts.length)}
          ton={etat.ecarts.length > 0 ? 'danger' : 'neutre'}
        />
      </div>

      {etat.ecarts.length > 0 && (
        <section className={styles.carte} aria-labelledby={`${idGroupe}-ecarts`}>
          <h2 id={`${idGroupe}-ecarts`} className={styles.titreCarte}>
            À corriger
            <Info libelle="Ce qui rend un registre opposable">
              Le livre des recettes doit présenter, pour chaque encaissement, sa
              date, son montant, l’identité du client, le mode de règlement et
              la référence de la pièce. Une numérotation trouée se lit, en
              contrôle, comme une facture retirée du registre.
            </Info>
          </h2>
          <ul className={styles.ecarts}>
            {etat.ecarts.map((ecart, i) => (
              <li key={`${ecart.nature}-${ecart.ecritureId ?? i}`} className={styles.ecart}>
                {ecart.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.carte} aria-labelledby={`${idGroupe}-ecritures`}>
        <h2 id={`${idGroupe}-ecritures`} className={styles.titreCarte}>
          Écritures
          <Info libelle="Pourquoi rien ne s’efface ici">
            Le registre se tient en ajout seul&nbsp;: une recette encaissée
            s’annule par une écriture inverse, datée du jour de la correction,
            et les deux restent visibles. Un registre qu’on peut réécrire ne
            prouve rien — c’est précisément ce qu’un contrôle vérifie.
          </Info>
        </h2>

        {etat.ecritures.length === 0
          ? (
            <Vide
              message="Aucun encaissement enregistré. Le livre des recettes se remplit quand une facture émise est marquée encaissée."
              action={<a className={styles.actionPrincipale} href="#/facture">Émettre une facture</a>}
            />
          )
          : (
            <ul className={styles.liste}>
              {etat.ecritures.map((e) => (
                <li key={e.id} className={styles.ligneEcriture}>
                  <span className={styles.ligneTitre}>
                    <span className={styles.ligneLibelle}>{e.libelle}</span>
                    <span className={styles.ligneMontant}><Montant>{eur(e.montant)}</Montant></span>
                  </span>
                  <span className={styles.ligneMeta}>
                    <span>{dateCourte(e.encaisseeLe)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{e.clientNom || 'Client non renseigné'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{e.numero || 'Sans numéro'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{libelleMode(e.modeReglement)}</span>
                  </span>
                  {etat.ecartsParEcriture.get(e.id)?.map((ecart) => (
                    <span key={ecart.nature} className={styles.alerteLigne}>{ecart.message}</span>
                  ))}
                  {!estAnnulation(e) && (
                    <button
                      type="button"
                      className={styles.actionLigne}
                      onClick={() => annulerRecette(e.id)}
                    >
                      Annuler par écriture inverse
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
      </section>

      {etat.enAttente.length > 0 && (
        <section className={styles.carte} aria-labelledby={`${idGroupe}-attente`}>
          <h2 id={`${idGroupe}-attente`} className={styles.titreCarte}>
            Émises, pas encore encaissées
            <Info libelle="Pourquoi elles ne sont pas au livre">
              Le livre des recettes enregistre des encaissements. Une facture
              émise et non réglée n’y a pas sa place&nbsp;: l’y inscrire
              reviendrait à déclarer une recette qui n’a pas eu lieu, et à payer
              des cotisations dessus.
            </Info>
          </h2>
          <ul className={styles.liste}>
            {etat.enAttente.map((r) => (
              <li key={r.id} className={styles.ligneEcriture}>
                <span className={styles.ligneTitre}>
                  <span className={styles.ligneLibelle}>{r.libelle}</span>
                  <span className={styles.ligneMontant}><Montant>{eur(r.montant)}</Montant></span>
                </span>
                <span className={styles.ligneMeta}>
                  <Statut {...statutRecette({ encaissee: false, echeanceDepassee: r.enRetard })} />
                  <span>Émise le {dateCourte(r.emiseLe)}</span>
                  {r.echeanceLe !== null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>échéance {dateCourte(r.echeanceLe)}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>{r.numero || 'Sans numéro'}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
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
      titre={(
        <>
          Seuils — où j’en suis
          <Info libelle="Ce que ces deux seuils déclenchent">
            Le <strong>plafond micro</strong> conditionne le régime lui-même&nbsp;:
            le dépasser deux années de suite fait basculer en réel. La
            <strong> franchise de TVA</strong> est plus immédiate&nbsp;: passé le
            seuil majoré, la TVA devient exigible <em>dès le mois du
            dépassement</em>, y compris sur les factures déjà émises sans TVA.
            Les deux se mesurent sur le chiffre d’affaires <em>encaissé</em>.
          </Info>
        </>
      )}
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
              />
              <Jauge
                libelle="Seuil majoré de TVA"
                atteint={seuils.caEncaisse}
                seuil={tva.valeur.majore}
                unite="€"
              />
            </>
          )}
      </div>
    </CartePliable>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Déclaration européenne de services
   ───────────────────────────────────────────────────────────────────────── */

/**
 * La DES.
 *
 * Elle est due par le PRESTATAIRE qui rend un service à un assujetti d'un
 * autre État membre — pas par celui qui en achète. C'est la confusion la plus
 * fréquente, et elle a commandé toute la conception : l'écran Achats détecte
 * l'autoliquidation à l'achat, celui-ci regarde les recettes.
 *
 * Trois faits qui surprennent, et que l'écran énonce plutôt que de les
 * supposer connus : la franchise en base n'en dispense pas, il n'y a aucun
 * seuil, et l'amende est de 750 € par déclaration manquante.
 */
function DeclarationServices({ idGroupe }: { idGroupe: string }) {
  const faits = useFaits((e) => e.faits);
  const [moisAffiche, setMoisAffiche] = useState<Mois>(() => moisPrecedentDe(moisCourant()));
  const etat = useMemo(() => etatDes(faits, moisAffiche), [faits, moisAffiche]);
  const { declaration } = etat;

  return (
    <>
      {etat.retards.length > 0 && (
        <p className={`${styles.bandeau} ${styles.bandeauDanger}`} role="status">
          <strong>{etat.retards.length}</strong> déclaration
          {etat.retards.length > 1 ? 's' : ''} en retard, soit{' '}
          <strong><Montant>{eur(etat.amendeEncourue)}</Montant></strong> d’amende encourue.
          <Info libelle="Pourquoi l’amende ne dépend pas des montants">
            Elle est forfaitaire&nbsp;: 750 € par déclaration manquante ou
            inexacte, qu’on ait facturé 50 € ou 50 000 €. Une omission répétée
            sur une année coûte donc davantage que la plupart des
            redressements que cette application cherche par ailleurs à éviter.
          </Info>
        </p>
      )}

      {etat.sansNumeroIntracom && !declaration.sansObjet && (
        <p className={`${styles.bandeau} ${styles.bandeauAttention}`} role="status">
          Vous n’avez pas de numéro de TVA intracommunautaire. Il en faut un
          pour déposer une DES, <em>y compris en franchise en base</em>&nbsp;:
          il se demande au service des impôts des entreprises.
        </p>
      )}

      <section className={styles.carte} aria-labelledby={`${idGroupe}-des`}>
        <h2 id={`${idGroupe}-des`} className={styles.titreCarte}>
          Prestations à déclarer
          <Info libelle="Qui doit déposer une DES, et quand">
            Elle est due par celui qui <strong>vend</strong> un service à un
            professionnel établi dans un autre État membre — pas par celui qui
            en achète. Aucun seuil&nbsp;: une prestation de{' '}
            <Montant>50&nbsp;€</Montant> suffit. Dépôt
            au plus tard le 10 du mois suivant, sur le portail de la douane.
          </Info>
        </h2>

        <div className={styles.navigationMois}>
          <button type="button" className={styles.pas}
            onClick={() => setMoisAffiche(moisPrecedentDe(moisAffiche))}
            aria-label="Mois précédent">
            <span aria-hidden="true">‹</span>
          </button>
          <span className={styles.moisCourant} role="status">{moisLisible(moisAffiche)}</span>
          <button type="button" className={styles.pas}
            onClick={() => setMoisAffiche(moisSuivantDe(moisAffiche))}
            aria-label="Mois suivant">
            <span aria-hidden="true">›</span>
          </button>
        </div>

        {declaration.sansObjet
          ? (
            <p className={styles.vide}>
              Aucune prestation intracommunautaire ce mois-là&nbsp;: aucune
              déclaration n’est due. Un mois sans prestation ne se déclare pas.
            </p>
          )
          : (
            <>
              <dl className={styles.detail}>
                <div className={styles.ligne}>
                  <dt>À déposer avant le</dt>
                  <dd>{dateCourte(declaration.limiteLe)}</dd>
                </div>
                <div className={`${styles.ligne} ${styles.total}`}>
                  <dt>Total à déclarer</dt>
                  <dd><Montant>{eur(declaration.total)}</Montant></dd>
                </div>
              </dl>

              {declaration.lignes.length > 0 && (
                <ul className={styles.liste}>
                  {declaration.lignes.map((l) => (
                    <li key={l.recetteId} className={styles.ligneEcriture}>
                      <span className={styles.ligneTitre}>
                        <span className={styles.ligneLibelle}>{l.clientNom}</span>
                        <span className={styles.ligneMontant}><Montant>{eur(l.montant)}</Montant></span>
                      </span>
                      <span className={styles.ligneMeta}>
                        <span>{l.tvaIntracom}</span>
                        <span aria-hidden="true">·</span>
                        <span>{dateCourte(l.emiseLe)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {declaration.anomalies.length > 0 && (
                <ul className={styles.ecarts}>
                  {declaration.anomalies.map((a) => (
                    <li key={a.recetteId} className={styles.ecart}>{a.message}</li>
                  ))}
                </ul>
              )}
            </>
          )}

        <p className={styles.noteBasse}>
          Le mois retenu est celui de l’<strong>émission</strong> de la facture,
          non celui de l’encaissement&nbsp;: la taxe devient exigible chez le
          preneur à l’achèvement de la prestation. Le livre des recettes, lui,
          s’écrit à l’encaissement — les deux registres ne coïncident donc pas,
          et c’est normal.
        </p>
      </section>
    </>
  );
}

function moisPrecedentDe(m: Mois): Mois {
  const total = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) - 1;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}` as Mois;
}

function moisSuivantDe(m: Mois): Mois {
  const total = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) + 1;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}` as Mois;
}

function moisLisible(m: Mois): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
    .format(new Date(`${m}-01T00:00:00`));
}

function libelleMode(mode: string | null): string {
  switch (mode) {
    case 'virement': return 'Virement';
    case 'cheque': return 'Chèque';
    case 'especes': return 'Espèces';
    case 'carte': return 'Carte';
    case 'autre': return 'Autre';
    default: return 'Mode non renseigné';
  }
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

function seriesDe(
  parMois: ReturnType<typeof etatArgent>['parMois']
): readonly SerieBarres[] {
  return [
    { id: 'realise', libelle: 'Facturé', valeurs: parMois.map((m) => m.realise), token: 'sable' },
    { id: 'encaisse', libelle: 'Encaissé', valeurs: parMois.map((m) => m.encaisse), token: 'green' }
  ];
}

function Chiffre(
  { libelle, valeur, ton = 'neutre' }: {
    libelle: string;
    valeur: string;
    ton?: 'neutre' | 'accent' | 'attention' | 'danger';
  }
) {
  const classe = ton === 'danger' ? styles.danger
    : ton === 'attention' ? styles.attention
    : ton === 'accent' ? styles.accent : '';
  return (
    <div className={styles.chiffre}>
      <span className={styles.libelle}>{libelle}</span>
      <span className={`${styles.montant} ${classe}`}><Montant>{valeur}</Montant></span>
    </div>
  );
}
