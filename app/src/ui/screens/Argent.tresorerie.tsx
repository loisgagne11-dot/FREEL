import { Suspense, lazy, useId, useMemo } from 'react';
import { useFaits } from '../../state/store';
import { dateDuJour, recettesEncaissees, soldeEstSuivi } from '../../state/selecteurs';
import type { EtatArgent, EtatSeuils } from '../../state/selecteurs.argent';
import type { DateISO, Mois } from '../../domain/types';
import { euros } from '../../domain/types';
import { autonomieMois } from '../../domain/calculs/tresorerie';
import { periodesADeclarer } from '../../domain/calculs/declarations';
import { franchissementPrevu, partDeLAnneeEcoulee } from '../../domain/calculs/allure';
import { enveloppesDeProvision } from '../../domain/calculs/enveloppes';
import { LIBELLE_NATURE } from '../../domain/calculs/provisions';
import { LIBELLE_IGNORE_IR } from '../../domain/calculs/provisionImpotRevenu.libelles';
import { CartePliable } from '../components/CartePliable';
import { Chiffre } from '../components/Chiffre';
import { Echeances } from '../components/Echeances';
import { Info } from '../components/Info';
import { Jauge } from '../components/Jauge';
import { Montant } from '../components/Montant';
import { Donut, PhraseRepartition } from '../components/Donut';
import { Statut } from '../components/Statut';
import { useToast } from '../components/Toasts';
import { dateCourte, eur, moisTexte } from '../format';
import styles from './Argent.module.css';

/**
 * Le pilier « Trésorerie » de l'écran Argent — « combien j'ai là, pour de vrai ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LUI AUSSI EST DIFFÉRÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * C'est le pilier ouvert par défaut : le différer coûte une frame au premier
 * affichage d'Argent, ce qui est un vrai prix et non un détail. Il est payé
 * pour une raison mesurée : à lui seul, ce pilier occupait 39,36 des 40 Ko du
 * budget de l'écran, et le lot qui le refait — donut, graphe combiné, frise —
 * l'aurait fait dépasser à la première carte.
 *
 * Les deux piliers étant désormais différés, `Argent.tsx` n'est plus qu'une
 * coquille : en-tête, piliers, registres. Chacun des deux a la place de
 * grandir sans que l'autre en paie le poids — ce qui est le vrai gain, plus
 * encore que les kilo-octets d'aujourd'hui.
 */

/**
 * La projection du disponible et les versements.
 *
 * Deux graphes qui ne servent qu'à une question de pilotage — « combien
 * puis-je me verser ? » — et qu'on ne consulte pas en vérifiant son solde. Ils
 * vivent donc dans leur propre module, chargé à l'ouverture de leur carte.
 */
const ProjectionPanneau = lazy(() => import('./Argent.projection')
  .then((m) => ({ default: m.ProjectionPanneau })));

export function Tresorerie({ etat }: { readonly etat: EtatArgent }) {
  const idGroupe = useId();

  return (
    <>
      <TuilesTresorerie etat={etat} />

      <CartePliable
        id="repartition"
        ecran="argent"
        titre="Ton solde n’est pas tout à toi"
        aide={<Info libelle="Pourquoi le solde trompe">
              Le solde bancaire contient les cotisations d’un trimestre que
              tu n’as pas encore déclaré. Le regarder et se sentir riche,
              c’est le mécanisme exact du rappel qu’on ne peut plus payer. La
              barre montre d’abord ce qui n’est <em>pas</em> à toi.
            </Info>}
        resume={(
          <>
            <Montant>{eur(etat.tresorerie.versable)}</Montant> à toi
            {' · '}<Montant>{eur(etat.tresorerie.provisions)}</Montant> de côté
            {' · '}<Montant>{eur(etat.tresorerie.reserve)}</Montant> de seuil de sécurité
          </>
        )}
      >
        <RepartitionDuSolde etat={etat} />
      </CartePliable>

      <CarteSeuils seuils={etat.seuils} />

      <CartePliable
        id="projection"
        ecran="argent"
        titre="Où va ton disponible, et combien tu peux te verser"
        aide={<Info libelle="Ce que cette projection montre">
              Douze mois à venir, dans deux scénarios&nbsp;: sans rien te
              verser, et en te versant chaque mois le maximum qui ne fasse
              jamais passer le disponible sous ta réserve. Les
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
          Combien est mis de côté, enveloppe par enveloppe
          <Info libelle="D’où vient la ventilation, et ce que « mis de côté » veut dire">
            Les échéances déjà émises portent chacune leur nature. Les
            charges sur recettes encaissées n’ont pas encore d’échéance à
            qui la demander&nbsp;: elles se répartissent selon la règle qui
            les calcule — cotisations d’un côté, impôt et contributions de
            l’autre. La TVA n’y figure pas tant qu’aucun appel n’est émis,
            parce qu’elle se relève sur les factures et ne se déduit
            d’aucun taux.
            <br /><br />
            Aucun euro du compte n’est <em>affecté</em> à une enveloppe&nbsp;:
            l’argent est fongible. Le solde est donc réparti dans l’ordre des
            échéances, <strong>la plus proche servie d’abord</strong> — c’est ce
            qui se passera réellement le jour du prélèvement. Sur un compte
            insuffisant, les premières enveloppes sont pleines et les dernières
            vides&nbsp;: on voit <em>laquelle</em> ne passera pas.
          </Info>
        </h3>
        <Enveloppes etat={etat} />
        <NoteImpotRevenu provision={etat.provisionImpotRevenu} />
      </CartePliable>

      <Echeances />

      <CarteDeclarations idGroupe={idGroupe} />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   B4 — les enveloppes de provision
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Une vignette par nature de dette : mis de côté, dû, et la date qui vient.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI DES VIGNETTES PLUTÔT QU'UNE BARRE SEGMENTÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La barre disait la PROPORTION de chaque nature dans le total. C'est la
 * mauvaise question : personne ne se demande quel pourcentage de ses
 * provisions est de l'URSSAF. On se demande « est-ce que le 5 juillet va
 * passer ». Une barre ne peut pas répondre — elle n'a ni date ni jauge de
 * remplissage par poste.
 *
 * Chaque vignette porte donc les trois choses que la barre ne pouvait pas
 * porter : la couverture, le dû, et l'échéance. La règle d'affectation du solde
 * est dans `enveloppes.ts`, et elle est écrite sous le titre de la carte.
 *
 * Les natures à zéro sont MASQUÉES ici, alors que le calcul les rend toutes.
 * Ce n'est pas une contradiction : le calcul ne doit pas décaler ses lignes,
 * l'écran ne doit pas afficher quatre vignettes vides sur un compte neuf. La
 * décision est à l'écran parce que c'est une question de place, pas de vérité.
 */
function Enveloppes({ etat }: { readonly etat: EtatArgent }) {
  const echeances = useFaits((e) => e.faits.echeances);
  const enveloppes = enveloppesDeProvision(
    etat.tresorerie.solde, etat.provisionsParNature, echeances
  ).filter((e) => e.du > 0);

  if (enveloppes.length === 0) {
    return <p className={styles.vide}>Rien n’est dû pour l’instant.</p>;
  }

  return (
    <ul className={styles.enveloppes}>
      {enveloppes.map((e) => {
        const part = e.du <= 0 ? 1 : Math.min(1, e.couvert / e.du);
        const complet = e.couvert >= e.du;
        return (
          <li key={e.nature} className={styles.enveloppe}>
            <span className={styles.enveloppeTitre}>
              <span className={`${styles.puce} ${styles[e.nature]}`} aria-hidden="true" />
              {LIBELLE_NATURE[e.nature]}
            </span>

            <span className={complet ? styles.enveloppeCouvert : styles.enveloppeManque}>
              <Montant>{eur(e.couvert)}</Montant>
            </span>
            <span className={styles.enveloppeDu}>
              {'sur '}<Montant>{eur(e.du)}</Montant>
            </span>

            {/* La jauge est une image ; les deux montants au-dessus sont la
                donnée. Sous quelques pourcents, un remplissage fait deux
                pixels sur un téléphone. */}
            <span className={styles.jaugeEnveloppe} aria-hidden="true">
              <span
                className={`${styles.jaugeRemplie} ${styles[e.nature]}`}
                style={{ width: `${part * 100}%` }}
              />
            </span>

            <span className={styles.enveloppeEcheance}>
              {e.prochaineEcheance === null
                /* Pas d'échéance : la dette existe, mais rien ne l'a encore
                   appelée. Le dire évite de lire « rien à payer ». */
                ? 'pas encore appelée'
                : `éch. ${dateCourte(e.prochaineEcheance)}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   B1 — les quatre tuiles
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Les quatre chiffres du haut, tels que le handoff les choisit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI CHANGE, ET POURQUOI CE N'EST PAS UNE PERTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La rangée portait Solde / À garder de côté / Disponible / Versable — deux
 * découpes du même solde sur quatre cases. La référence met Solde / Disponible
 * / À encaisser / Autonomie : deux constats, puis deux réponses à des questions
 * différentes — « qu'est-ce qui va rentrer » et « combien de temps je tiens ».
 *
 * Ni « à garder de côté » ni « versable » ne disparaissent : le premier est le
 * total des enveloppes de provision, juste dessous, et le second est au centre
 * de l'anneau et sur l'autre pilier. Les répéter dans la rangée du haut
 * coûtait les deux seules cases où l'écran pouvait dire autre chose.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CHAQUE TUILE DIT SON ASSIETTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « 8 120 € » ne dit pas à quelle date, « 4 940 € » ne dit pas ce qui en a été
 * retiré. Le dessin met une ligne sous chacun, et c'est elle qui rend le
 * chiffre opposable.
 *
 * L'autonomie s'abstient plutôt que d'afficher zéro : sans besoin mensuel
 * saisi, la division n'a pas de sens. L'ancienne application affichait dans ce
 * cas une autonomie qui bondissait sans cause — au 1ᵉʳ janvier, les dépenses de
 * l'année tombant à zéro, elle passait de 5,3 à 9,3 mois.
 */
function TuilesTresorerie({ etat }: { readonly etat: EtatArgent }) {
  const besoinMensuel = useFaits((e) => e.faits.besoinMensuel);
  const soldeSuivi = useFaits((e) => soldeEstSuivi(e.faits));
  const autonomie = autonomieMois(etat.tresorerie.versable, besoinMensuel);

  return (
    <div className={styles.grille}>
      <Chiffre
        libelle="Solde du compte"
        valeur={eur(etat.tresorerie.solde)}
        note={soldeSuivi
          ? `au ${dateCourte(dateDuJour())}`
          : 'saisi, aucun relevé importé'}
      />
      <Chiffre
        libelle="Disponible"
        valeur={eur(etat.tresorerie.dispo)}
        ton={etat.tresorerie.dispo < 0 ? 'danger' : 'accent'}
        note="à toi, hors provisions"
      />
      <Chiffre
        libelle="À encaisser"
        valeur={eur(etat.resteARentrer)}
        ton={etat.resteARentrer > 0 ? 'attention' : 'neutre'}
        note={etat.resteARentrerNombre === 0
          ? 'rien en attente'
          : `${etat.resteARentrerNombre} facture${etat.resteARentrerNombre > 1 ? 's' : ''} en attente`}
      />
      <Chiffre
        libelle="Autonomie"
        valeur={moisTexte(autonomie)}
        note={autonomie === null
          ? 'besoin mensuel non renseigné'
          : 'ton versable, à ton train de vie'}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   B3 — la répartition du solde
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Les trois parts du solde, en anneau, avec la phrase qui les explique.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES PARTS SONT BORNÉES, ET C'EST TOUT LE SUJET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le seuil de sécurité n'est constitué qu'à hauteur de ce qui reste APRÈS les
 * provisions : l'afficher plein sur un disponible insuffisant ferait croire à
 * un matelas qui n'existe pas. Même chose pour les provisions elles-mêmes,
 * bornées au solde — au-delà, ce n'est plus une part, c'est un manque, et il se
 * dit en toutes lettres sous la légende.
 *
 * « Seuil de sécurité » et non « réserve » : le mot vient du dessin, et il
 * libère « réserve » pour l'autre notion — la part gardée au versement, qui est
 * un pourcentage. Un seul mot couvrait deux idées, et c'est ainsi qu'un
 * plancher fixe finit par être exprimé en pourcentage du disponible.
 */
function RepartitionDuSolde({ etat }: { readonly etat: EtatArgent }) {
  const t = etat.tresorerie;
  const provisionsCouvertes = Math.min(t.provisions, Math.max(0, t.solde));
  const seuilConstitue = Math.min(t.reserve, Math.max(0, t.dispo));
  const manque = Math.max(0, -t.dispo);

  return (
    <>
      <Donut
        total={t.solde}
        deficit={manque}
        centre={eur(t.dispo)}
        legendeCentre="à toi, hors provisions"
        parts={[
          {
            /*
             * Le libellé change quand le montant est BORNÉ.
             *
             * L'anneau découpe le solde : la part de provisions y est plafonnée
             * à ce que le compte contient. Sur un compte qui doit 7 607 € et
             * n'en porte que 4 938, la légende affichait « Provisions dues :
             * 4 938 € » — trois lignes au-dessus d'une carte qui en annonce
             * 7 607. Deux montants pour la même notion sur le même écran, sans
             * que rien ne dise lequel fait foi.
             *
             * Le montant reste borné, parce que c'est ce que l'anneau
             * représente ; c'est le NOM qui dit ce qu'on regarde. Le reste dû
             * est sur la ligne de manque, juste dessous.
             */
            libelle: manque > 0 ? 'Provisions couvertes par le solde' : 'Provisions dues',
            montant: provisionsCouvertes,
            ton: 'provisions'
          },
          { libelle: 'Seuil de sécurité', montant: seuilConstitue, ton: 'reserve' },
          { libelle: 'À te verser', montant: t.versable, ton: 'versable' }
        ]}
      />

      {/* La phrase du dessin, dérivée et non écrite en dur. C'est elle qui
          fait le lien entre l'anneau et les enveloppes juste dessous : sans
          elle, on voit trois parts sans savoir laquelle il faut aller
          regarder. */}
      {/*
        * La phrase et le centre de l'anneau doivent dire LE MÊME nombre.
        *
        * Le centre porte le disponible tel qu'il est, négatif compris — c'est
        * le signal le plus fort de l'écran et il ne se borne pas. La phrase
        * écrivait de son côté « 0 € sont à toi », parce qu'elle bornait. Sur la
        * même carte, à trois centimètres l'une de l'autre, deux réponses à la
        * même question.
        *
        * Le cas négatif a donc sa phrase, qui dit ce qui se passe réellement :
        * ce n'est pas que rien n'est à toi, c'est que l'argent des cotisations
        * a déjà été dépensé.
        */}
      {t.dispo < 0 ? (
        <PhraseRepartition>
          Sur les <strong><Montant>{eur(t.solde)}</Montant></strong> du compte,{' '}
          <strong>rien n’est à toi</strong>&nbsp;: les{' '}
          <strong><Montant>{eur(t.provisions)}</Montant></strong> dus (URSSAF, impôt, TVA)
          dépassent le solde de <strong><Montant>{eur(euros(manque))}</Montant></strong>.
          Une partie de l’argent des cotisations a déjà été dépensée — le détail
          est dans les enveloppes ci-dessous.
        </PhraseRepartition>
      ) : (
        <PhraseRepartition>
          Sur les <strong><Montant>{eur(t.solde)}</Montant></strong> du compte,{' '}
          <strong><Montant>{eur(t.dispo)}</Montant></strong> sont à toi —{' '}
          <Montant>{eur(euros(seuilConstitue))}</Montant> de seuil gardé
          {' + '}<Montant>{eur(t.versable)}</Montant> que tu peux te verser. Les{' '}
          <strong><Montant>{eur(euros(provisionsCouvertes))}</Montant></strong> restants
          sont <strong>dus</strong> (URSSAF, impôt, TVA) — détaillés dans les
          enveloppes ci-dessous.
        </PhraseRepartition>
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
  /*
   * Le plafond porte le nom du régime RÉELLEMENT configuré.
   *
   * Le handoff écrit « Plafond micro-BNC », et il a raison de nommer le régime
   * exact : « micro-entreprise » recouvre deux plafonds qui vont du simple au
   * quadruple — 77 700 € en BNC, 188 700 € en vente. Mais l'écrire en dur
   * afficherait « BNC » à un artisan dont le plafond n'est pas celui-là, et le
   * chiffre à côté serait alors juste tandis que son nom serait faux. Le nom
   * suit donc le fait, comme le seuil qu'il désigne.
   */
  const typeActivite = useFaits((e) => e.faits.entreprise.typeActivite);

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
      <div className={styles.seuils}>
        {plafond.statut === 'refuse'
          ? <p className={styles.vide}>Plafond micro&nbsp;: {plafond.motif}</p>
          : (
            <Jauge
              libelle={`Plafond micro-${typeActivite === 'BNC' ? 'BNC' : 'BIC'}`}
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
