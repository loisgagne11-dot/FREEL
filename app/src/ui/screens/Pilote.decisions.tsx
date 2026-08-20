import type { SujetATraiter } from '../../domain/calculs/aTraiter';
import { formuler } from '../../domain/calculs/aTraiter.libelles';
import { Montant } from '../components/Montant';
import styles from './Pilote.module.css';

/**
 * Les décisions du jour, chargées juste après le premier rendu.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE CARTE VOYAGE À PART
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle tire la mise en mots des sujets « à traiter » — dix kilo-octets de
 * phrases françaises. Le Pilote étant le seul écran du paquet d'entrée, ces
 * phrases partaient chez tout le monde à chaque ouverture, avant même que
 * quoi que ce soit ne s'affiche.
 *
 * Elle est SOUS la ligne de flottaison : le flux du mois et la santé passent
 * avant elle. Son chargement différé ne se voit donc pas comme un écran vide
 * qu'on attend, mais comme un bas de page qui se remplit — ce qui est le seul
 * cas où différer est légitime.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SUR PILOTE, LA LISTE N'EST PAS FILTRÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle montre tous les sujets, quel que soit l'écran qui les règle. C'est la
 * règle du design, et c'est ce qui fait de cet écran la décision du jour
 * plutôt qu'un écran parmi six.
 *
 * Une liste vide n'est pas un vide à masquer : c'est une information, et la
 * meilleure qu'on puisse donner.
 */
export function ATraiter({ sujets }: { sujets: readonly SujetATraiter[] }) {
  return (
    <section className={styles.carte} aria-labelledby="titre-a-traiter">
      <h2 id="titre-a-traiter" className={styles.titreCarte}>
        À traiter
        {sujets.length > 0 && <span className={styles.compteur}>{sujets.length}</span>}
      </h2>

      {sujets.length === 0 ? (
        <p className={styles.aideCarte}>Rien ne réclame votre attention aujourd’hui.</p>
      ) : (
        <ul className={styles.sujets}>
          {sujets.map((s) => <Sujet key={s.id} sujet={s} />)}
        </ul>
      )}
    </section>
  );
}

/** Une décision : sa gravité, son intitulé, son contexte, son action. */
function Sujet({ sujet: s }: { readonly sujet: SujetATraiter }) {
  const { intitule, contexte, action } = formuler(s);
  return (
    <li className={styles.sujet}>
      <span
        className={`${styles.puce} ${
          s.gravite === 'retard' ? styles.puceRetard
          : s.gravite === 'a_faire' ? styles.puceAFaire
          : styles.puceInfo
        }`}
        aria-hidden="true"
      />
      <div className={styles.sujetCorps}>
        <span className={styles.sujetIntitule}>
          {intitule}
          {/* Le libellé porte déjà la quantité quand elle compte ; on
              n'affiche pas « 1 » qui n'apprendrait rien. */}
          <span className={styles.sujetGravite}>
            {s.gravite === 'retard' ? 'En retard'
              : s.gravite === 'a_faire' ? 'À faire' : 'Information'}
          </span>
        </span>
        {/* Le contexte d'un sujet porte des montants dans sa phrase
            (« 5 250 € impayés, dont 43 jours de retard »). La phrase
            entière est donc masquée : y découper le montant
            demanderait au domaine de séparer prose et chiffres, ce
            qui n'est pas son rôle. Le survol la révèle. */}
        <span className={styles.sujetContexte}>
          <Montant>{contexte}</Montant>
        </span>
      </div>
      <a className={styles.sujetAction} href={`#/${s.ecran}`}>{action}</a>
    </li>
  );
}
