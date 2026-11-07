import { Info } from './Info';
import { dateCourte, eur, moisTexte } from '../format';
import { Montant } from './Montant';
import styles from './SanteCard.module.css';

export type EtatIndicateur = 'bon' | 'attention' | 'alerte';

/**
 * L'identité du constat, distincte de son libellé.
 *
 * La règle de priorité s'appuie dessus : trier sur le texte affiché ferait
 * dépendre l'ordre de gravité d'une reformulation.
 */
export type SujetDeSante = 'provisions' | 'declarations' | 'regime' | 'factures';

export interface Indicateur {
  readonly id: SujetDeSante;
  readonly libelle: string;
  /** Le détail chiffré, ou '' quand le libellé suffit (« Déclarations à jour »). */
  readonly valeur: string;
  readonly etat: EtatIndicateur;
}

/**
 * « Santé » — la barre de synthèse du Pilote.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL N'Y A PAS DE SCORE SUR 100
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La maquette affiche « 78/100 », décomposé en 28/30, 20/35 et 30/35. La spec
 * le relève elle-même : ces valeurs sont **écrites en dur dans le HTML**, et
 * aucune fonction ne les calcule nulle part. Il aurait fallu inventer la
 * formule : chaque pondération est défendable, aucune n'est vérifiable, et
 * une note se retient, se compare, puis commande des décisions.
 *
 * À sa place, une PHRASE qui nomme le plus grave des constats, selon un ordre
 * écrit (voir `GRAVITE`), puis les constats eux-mêmes et l'autonomie — la
 * disposition du handoff, sur une seule barre.
 */
export function SanteCard(
  { indicateurs, autonomie }: {
    readonly indicateurs: readonly Indicateur[];
    /** Mois d'autonomie, ou `null` quand le besoin mensuel n'est pas renseigné. */
    readonly autonomie: number | null;
  }
) {
  const synthese = syntheseDeSante(indicateurs);

  return (
    <section className={styles.barre} aria-labelledby="titre-sante">
      <h2 id="titre-sante" className={styles.titre}>
        Santé
        <Info libelle="Pourquoi aucune note globale">
          La maquette affichait un score sur 100. Il aurait fallu en inventer
          la formule&nbsp;: quel poids donner aux provisions, aux impayés, aux
          déclarations&nbsp;? Chaque réponse est défendable, aucune n’est
          vérifiable — et une note se retient, se compare, puis commande des
          décisions. La phrase, elle, ne pondère rien&nbsp;: elle nomme le plus
          grave des constats, dans un ordre écrit — une provision déjà
          dépensée, puis une déclaration en retard, puis un changement de
          régime, puis une facture en retard, puis une déclaration à faire.
        </Info>
      </h2>

      <p className={`${styles.synthese} ${styles[synthese.ton]}`} role="status">
        <Montant>{synthese.phrase}</Montant>
      </p>

      <ul className={styles.indicateurs}>
        {indicateurs.map((i) => (
          <li key={i.id} className={styles.indicateur}>
            <span className={`${styles.pastille} ${styles[i.etat]}`} aria-hidden="true" />
            {i.libelle}
            {i.valeur !== '' && <span className={styles.valeur}> · <Montant>{i.valeur}</Montant></span>}
          </li>
        ))}
      </ul>

      {/* L'assiette est NOMMÉE : « 4,2 mois » ne dit pas sur quoi l'on tient.
          Ici sur le versable, réserve exclue — un chiffre de confort, avec du
          matelas derrière lui, et non de survie. Inconnue sans besoin
          mensuel : « 0 mois » ferait croire à une trésorerie à sec. */}
      <p className={styles.autonomie}>
        {autonomie === null
          ? 'Autonomie inconnue'
          : <><strong>{moisTexte(autonomie)}</strong> d’autonomie, sans toucher à la réserve</>}
      </p>
    </section>
  );
}

/**
 * Les constats, tirés des mêmes sujets que les décisions du jour.
 *
 * Aucun seuil n'est inventé : « couvertes », c'est un disponible qui n'est pas
 * négatif ; « en retard », une échéance ou une date limite passée. Le constat
 * « Factures » compte les factures EN RETARD — il comptait les factures en
 * attente, et une facture à trente jours, normale, y passait pour un problème.
 * Le régime n'apparaît que lorsqu'il change : une ligne « régime : rien » en
 * permanence apprendrait à ne plus lire la barre.
 */
export function indicateursDeSante(
  { dispo, provisions, facturesEnRetard, montantEnRetard, declarationsEnRetard, declarationAvant, regime }: {
    readonly dispo: number;
    readonly provisions: number;
    readonly facturesEnRetard: number;
    readonly montantEnRetard: number;
    readonly declarationsEnRetard: number;
    /** La date limite d'une déclaration à faire, encore dans sa fenêtre. */
    readonly declarationAvant: string | null;
    /** Ce qui change le régime (TVA due, plafond dépassé), ou `null`. */
    readonly regime: string | null;
  }
): readonly Indicateur[] {
  const constats: Indicateur[] = [
    dispo >= 0
      ? {
        id: 'provisions', libelle: 'Provisions couvertes', etat: 'bon',
        valeur: provisions === 0 ? 'rien à provisionner' : `${eur(provisions)} de côté`
      }
      : { id: 'provisions', libelle: 'Provisions à découvert', etat: 'alerte', valeur: `il manque ${eur(-dispo)}` },
    facturesEnRetard === 0
      ? { id: 'factures', libelle: 'Factures à jour', etat: 'bon', valeur: '' }
      : {
        id: 'factures', libelle: 'Factures en retard', etat: 'attention',
        valeur: `${facturesEnRetard} facture${facturesEnRetard > 1 ? 's' : ''} · ${eur(montantEnRetard)}`
      },
    declarationsEnRetard > 0
      ? {
        id: 'declarations', libelle: 'Déclarations en retard', etat: 'alerte',
        valeur: `${declarationsEnRetard} période${declarationsEnRetard > 1 ? 's' : ''}`
      }
      : declarationAvant !== null
        ? {
          id: 'declarations', libelle: 'Déclaration à faire', etat: 'attention',
          valeur: `avant le ${dateCourte(declarationAvant)}`
        }
        : { id: 'declarations', libelle: 'Déclarations à jour', etat: 'bon', valeur: '' }
  ];
  if (regime !== null) {
    constats.push({ id: 'regime', libelle: 'Régime', etat: 'alerte', valeur: regime });
  }
  return constats;
}

/**
 * Le coup d'œil, sans inventer de note.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ORDRE EST UNE GRAVITÉ, PAS UNE PONDÉRATION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * On n'attribue aucun poids ; on classe des conséquences :
 *
 *  1. PROVISIONS à découvert — l'argent dû a déjà été dépensé. C'est le seul
 *     constat déjà consommé : il ne se rattrape qu'en trouvant la somme
 *     ailleurs, et les majorations courent pendant ce temps.
 *  2. DÉCLARATIONS en retard — la pénalité est automatique et croît seule,
 *     mais la somme est encore là.
 *  3. RÉGIME — TVA due sur des factures émises sans, plafond du micro
 *     dépassé : rien n'est encore perdu, mais chaque facture qui part sans
 *     correction aggrave la régularisation. La liste des décisions les classe
 *     « en retard » : la phrase ne peut pas dire « tout est en ordre » à côté.
 *  4. FACTURES en retard — un tiers doit. Désagréable, réversible.
 *  5. DÉCLARATION à faire dans sa fenêtre — rien n'est en retard, la date
 *     approche.
 *
 * L'ÉTAT gouverne d'abord (alerte, puis attention) ; le tableau ci-dessous ne
 * tranche qu'entre constats du même état. Les alertes sont les rangs 1 à 3
 * (provisions, déclaration en retard, régime) ; les attentions, les rangs 4 et
 * 5 (facture en retard, déclaration à faire). D'où cet ordre, qui respecte
 * les deux : une facture n'est jamais une alerte, une déclaration à faire
 * jamais qu'une attention.
 */
const GRAVITE: readonly SujetDeSante[] = ['provisions', 'factures', 'declarations', 'regime'];

export interface SyntheseDeSante {
  readonly ton: EtatIndicateur;
  readonly phrase: string;
}

export function syntheseDeSante(indicateurs: readonly Indicateur[]): SyntheseDeSante {
  const rang = (i: Indicateur) => GRAVITE.indexOf(i.id);
  const gravite = (e: EtatIndicateur) => (e === 'alerte' ? 0 : e === 'attention' ? 1 : 2);
  const pire = [...indicateurs]
    .sort((a, b) => gravite(a.etat) - gravite(b.etat) || rang(a) - rang(b))[0];

  if (pire === undefined || pire.etat === 'bon') return { ton: 'bon', phrase: 'Tout est en ordre.' };

  // Nommé ET chiffré : « attention » sans dire à quoi oblige à aller chercher,
  // ce que le coup d'œil doit éviter.
  return { ton: pire.etat, phrase: `${pire.libelle}${pire.valeur === '' ? '' : ` — ${pire.valeur}`}.` };
}
