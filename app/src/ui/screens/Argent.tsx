import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { etatArgent } from '../../state/selecteurs';
import { GrapheBarres, type SerieBarres } from '../components/GrapheBarres';
import { Info } from '../components/Info';
import { Onglets, PanneauOnglet } from '../components/Onglets';
import { eur } from '../format';
import styles from './Argent.module.css';

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

type Section = 'tresorerie' | 'performance';

const SECTIONS = [
  { id: 'tresorerie' as Section, libelle: 'Trésorerie' },
  { id: 'performance' as Section, libelle: 'Performance' }
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
      <header className={styles.entete}>
        <h1 className={styles.titre}>Argent</h1>
        <p className={styles.periode}>Année {etat.annee}</p>
      </header>

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

          <section className={styles.carte} aria-labelledby={`${idGroupe}-enveloppes`}>
            <h2 id={`${idGroupe}-enveloppes`} className={styles.titreCarte}>
              Enveloppes de provision
              <Info libelle="Explication des deux volets de provision">
                Les échéances émises sont ce que l’URSSAF ou le fisc ont déjà
                appelé. Les charges sur recettes encaissées sont dues mais pas
                encore appelées : la dette naît à l’encaissement, pas à
                l’émission de l’échéance. Une fois la période déclarée, la
                seconde ligne bascule dans la première.
              </Info>
            </h2>
            <dl className={styles.detail}>
              <div className={styles.ligne}>
                <dt>Échéances émises, à payer</dt>
                <dd>{eur(etat.voletConstate)}</dd>
              </div>
              <div className={styles.ligne}>
                <dt>Charges sur recettes encaissées non déclarées</dt>
                <dd>{eur(etat.voletAProvisionner)}</dd>
              </div>
              <div className={`${styles.ligne} ${styles.total}`}>
                <dt>Total à garder de côté</dt>
                <dd>{eur(etat.tresorerie.provisions)}</dd>
              </div>
            </dl>
          </section>
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
      </div>
    </>
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
      <span className={`${styles.montant} ${classe}`}>{valeur}</span>
    </div>
  );
}
