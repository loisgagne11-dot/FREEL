import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { etatArgent, etatLivre } from '../../state/selecteurs';
import { estAnnulation } from '../../domain/calculs/livreRecettes';
import { GrapheBarres, type SerieBarres } from '../components/GrapheBarres';
import { Info } from '../components/Info';
import { Onglets, PanneauOnglet } from '../components/Onglets';
import { dateCourte, eur } from '../format';
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

type Section = 'tresorerie' | 'performance' | 'livre';

const SECTIONS = [
  { id: 'tresorerie' as Section, libelle: 'Trésorerie' },
  { id: 'performance' as Section, libelle: 'Performance' },
  { id: 'livre' as Section, libelle: 'Livre des recettes' }
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

        <PanneauOnglet idGroupe={idGroupe} id="livre" actif={section === 'livre'}>
          <LivreDesRecettes idGroupe={idGroupe} />
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
          ? <p className={styles.vide}>Aucun encaissement enregistré.</p>
          : (
            <ul className={styles.liste}>
              {etat.ecritures.map((e) => (
                <li key={e.id} className={styles.ligneEcriture}>
                  <span className={styles.ligneTitre}>
                    <span className={styles.ligneLibelle}>{e.libelle}</span>
                    <span className={styles.ligneMontant}>{eur(e.montant)}</span>
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
                  <span className={styles.ligneMontant}>{eur(r.montant)}</span>
                </span>
                <span className={styles.ligneMeta}>
                  <span>Émise le {dateCourte(r.emiseLe)}</span>
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
      <span className={`${styles.montant} ${classe}`}>{valeur}</span>
    </div>
  );
}
