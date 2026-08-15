import { Info } from './Info';
import { eur, moisTexte } from '../format';
import { Montant } from './Montant';
import styles from './SanteCard.module.css';

export type EtatIndicateur = 'bon' | 'attention' | 'alerte';

/**
 * L'identité du constat, distincte de son libellé.
 *
 * La règle de priorité s'appuie dessus : trier sur le texte affiché ferait
 * dépendre l'ordre de gravité d'une reformulation.
 */
export type SujetDeSante = 'provisions' | 'factures' | 'declarations';

export interface Indicateur {
  readonly id: SujetDeSante;
  readonly libelle: string;
  readonly valeur: string;
  readonly etat: EtatIndicateur;
}

/**
 * « Santé société » — la carte de synthèse du Pilote dans la spec de design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL N'Y A PAS DE SCORE SUR 100
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La maquette affiche « 78/100 », décomposé en 28/30, 20/35 et 30/35. La spec
 * le relève elle-même : ces valeurs sont **écrites en dur dans le HTML**, et
 * aucune fonction ne les calcule nulle part.
 *
 * Il aurait fallu inventer la formule : quel poids pour les provisions, pour
 * les impayés, pour les déclarations ? Chaque réponse est défendable, aucune
 * n'est vérifiable, et le résultat serait un chiffre d'apparence officielle
 * que personne n'a validé. Un « 78/100 » se retient et se compare d'un mois
 * sur l'autre — c'est-à-dire qu'il commande des décisions.
 *
 * Les trois indicateurs, eux, sont vrais et se lisent directement : les
 * provisions sont couvertes ou non, il y a des impayés ou non, des périodes
 * en retard ou non. On perd la satisfaction d'une note ; on gagne de ne rien
 * affirmer qu'on ne puisse démontrer.
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
    <section className={styles.carte} aria-labelledby="titre-sante">
      <header className={styles.entete}>
        <h2 id="titre-sante" className={styles.titreCarte}>
          Santé
          <Info libelle="Pourquoi aucune note globale">
            La maquette affichait un score sur 100. Il aurait fallu en inventer
            la formule&nbsp;: quel poids donner aux provisions, aux impayés, aux
            déclarations&nbsp;? Chaque réponse est défendable, aucune n’est
            vérifiable — et une note se retient, se compare, puis commande des
            décisions. La phrase de synthèse, elle, ne pondère rien&nbsp;: elle
            nomme le plus grave des trois constats, selon un ordre de gravité
            écrit — une provision déjà dépensée passe avant une déclaration en
            retard, qui passe avant un impayé.
          </Info>
        </h2>
        <p className={styles.autonomie}>
          {/* L'assiette est NOMMÉE. « 4,2 mois d'autonomie » ne dit pas sur
              quoi l'on tient : ici sur le versable, réserve exclue — donc le
              chiffre est volontairement prudent, et il y a du matelas derrière
              lui. Le taire ferait lire un chiffre de survie là où c'est un
              chiffre de confort. */}
          {autonomie === null
            ? 'Autonomie inconnue'
            : `${moisTexte(autonomie)} d’autonomie, sans toucher à la réserve`}
        </p>
      </header>

      {/* Le coup d'œil, que trois pastilles ne donnaient pas : elles sont
          vraies mais elles font trois informations, quand la question — « est-ce
          que ça va ? » — en attend une. La phrase nomme le plus grave, sans
          pondérer quoi que ce soit. */}
      <p className={`${styles.synthese} ${styles[synthese.ton]}`} role="status">
        {synthese.phrase}
      </p>

      <ul className={styles.indicateurs}>
        {indicateurs.map((i) => (
          <li key={i.libelle} className={styles.indicateur}>
            <span className={`${styles.pastille} ${styles[i.etat]}`} aria-hidden="true" />
            <span className={styles.libelle}>{i.libelle}</span>
            <span className={styles.valeur}><Montant>{i.valeur}</Montant></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Les trois constats, tirés des faits.
 *
 * Aucun seuil n'est inventé ici : « couvertes » signifie que le disponible
 * n'est pas négatif, « à jour » qu'aucune période déclarable ne traîne. Ce
 * sont des états binaires observables, pas des appréciations.
 */
export function indicateursDeSante(
  { dispo, provisions, impayes, montantImpaye, periodesEnRetard }: {
    readonly dispo: number;
    readonly provisions: number;
    readonly impayes: number;
    readonly montantImpaye: number;
    readonly periodesEnRetard: number;
  }
): readonly Indicateur[] {
  return [
    {
      id: 'provisions',
      libelle: 'Provisions couvertes',
      valeur: provisions === 0
        ? 'rien à provisionner'
        : dispo >= 0 ? `${eur(provisions)} de côté` : `il manque ${eur(-dispo)}`,
      etat: provisions === 0 ? 'bon' : dispo >= 0 ? 'bon' : 'alerte'
    },
    {
      id: 'factures',
      libelle: 'Factures',
      valeur: impayes === 0
        ? 'aucun impayé'
        : `${impayes} en attente · ${eur(montantImpaye)}`,
      etat: impayes === 0 ? 'bon' : 'attention'
    },
    {
      id: 'declarations',
      libelle: 'Déclarations',
      valeur: periodesEnRetard === 0
        ? 'à jour'
        : `${periodesEnRetard} période${periodesEnRetard > 1 ? 's' : ''} en retard`,
      etat: periodesEnRetard === 0 ? 'bon' : 'alerte'
    }
  ];
}

/**
 * Le coup d'œil, sans inventer de note.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LE SCORE FAISAIT BIEN, ET QU'ON AVAIT PERDU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Refuser le « 78/100 » était juste : sa formule aurait été inventée. Mais le
 * score répondait à une vraie question — « est-ce que ça va ? » — en UNE
 * information, et trois pastilles en font trois. On avait raison sur le fond
 * et on avait perdu l'usage.
 *
 * Une phrase répond à la même question sans rien pondérer. Elle ne mélange
 * pas les constats : elle nomme LE PLUS GRAVE, et le nomme en toutes lettres.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ORDRE EST UNE GRAVITÉ, PAS UNE PONDÉRATION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * C'est ce qui distingue cette phrase d'un score. On n'attribue aucun poids ;
 * on classe des conséquences, et le classement se justifie :
 *
 *  1. PROVISIONS non couvertes — l'argent dû a déjà été dépensé. C'est le seul
 *     des trois qui soit déjà consommé : il ne se rattrape qu'en trouvant la
 *     somme ailleurs, et les majorations courent pendant ce temps.
 *  2. DÉCLARATIONS en retard — la pénalité est automatique et croît seule,
 *     mais la somme, elle, est encore là.
 *  3. IMPAYÉS — c'est un tiers qui doit. Désagréable, réversible, et la
 *     trésorerie n'est pas encore atteinte.
 *
 * Le pire des trois gouverne le ton. À égalité de gravité, l'ordre ci-dessus
 * tranche — parce qu'un ordre arbitraire mais ÉCRIT vaut mieux qu'un ordre
 * d'exécution qu'on découvrirait à l'usage.
 */
const GRAVITE: readonly SujetDeSante[] = ['provisions', 'declarations', 'factures'];

export interface SyntheseDeSante {
  readonly ton: EtatIndicateur;
  readonly phrase: string;
}

export function syntheseDeSante(
  indicateurs: readonly Indicateur[]
): SyntheseDeSante {
  const rang = (i: Indicateur) => GRAVITE.indexOf(i.id);
  const gravite = (e: EtatIndicateur) => (e === 'alerte' ? 0 : e === 'attention' ? 1 : 2);

  const pire = [...indicateurs]
    .sort((a, b) => gravite(a.etat) - gravite(b.etat) || rang(a) - rang(b))[0];

  if (pire === undefined || pire.etat === 'bon') {
    return { ton: 'bon', phrase: 'Rien ne réclame votre attention.' };
  }

  // Le sujet est nommé ET chiffré : « attention » sans dire à quoi oblige à
  // aller chercher, ce qui est exactement ce que le coup d'œil doit éviter.
  return {
    ton: pire.etat,
    phrase: `${pire.libelle} — ${pire.valeur}.`
  };
}
