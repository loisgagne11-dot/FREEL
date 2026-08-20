import { Suspense, lazy, useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { etatArgent } from '../../state/selecteurs.argent';
import { Greet } from '../components/Greet';
import { PanneauOnglet } from '../components/Onglets';
import { Etiquette, Piliers } from '../components/Piliers';
import { Sheet } from '../components/Sheet';
import { eur } from '../format';
import styles from './Argent.module.css';

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
 * Le pilier Trésorerie, différé lui aussi.
 *
 * C'est le pilier ouvert par défaut : le différer coûte une frame au premier
 * affichage d'Argent, et c'est un vrai prix. Il est payé pour une raison
 * mesurée — à lui seul, ce pilier occupait 39,36 des 40 Ko du budget de
 * l'écran. Les deux piliers étant maintenant différés, cet écran n'est plus
 * qu'une coquille, et chacun a la place de grandir sans que l'autre en paie
 * le poids.
 */
const Tresorerie = lazy(() => import('./Argent.tresorerie')
  .then((m) => ({ default: m.Tresorerie })));

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
          <Suspense fallback={<p role="status" className={styles.vide}>Chargement…</p>}>
            <Tresorerie etat={etat} />
          </Suspense>
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
