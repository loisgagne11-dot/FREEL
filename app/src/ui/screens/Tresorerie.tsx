import { Suspense, useEffect, useState } from 'react';
import { adresseCourante, composantALaDemande, sousRouteSiEcran } from '../composantALaDemande';
import { useFaits } from '../../state/store';
import { estATraiter } from '../../domain/calculs/banque.etat';
import type { DateISO } from '../../domain/types';
import { Greet } from '../components/Greet';
import { Sheet } from '../components/Sheet';
import { dateDuJour } from '../../state/selecteurs';
import { jourEtMoisLong } from './Activite.missions.titre';
import { useRoute } from '../useRoute';
import tr from './Tresorerie.module.css';

/**
 * La vue « douze mois à venir » : la cascade du solde, ce qui est dû, le
 * versement tenable et sa courbe, ce qui entre et ce qui sort, les seuils.
 * Différée : c'est elle qui porte le calcul et les graphes, et l'écran le plus
 * lourd du projet tenait à 37,48 Ko sur 40 avant d'être redessiné (lot 49).
 */
const DouzeMois = composantALaDemande(() => import('./Tresorerie.douze').then((m) => m.DouzeMois), true);

/** La vue « Année » : on y relit le passé, capacité de versement comprise. */
const VueAnnee = composantALaDemande(() => import('./Tresorerie.annee').then((m) => m.VueAnnee), false);

/**
 * Le relevé bancaire et son rapprochement : on importe un relevé une fois par
 * mois, consulter sa trésorerie n'a pas à en payer le téléchargement.
 */
const Releve = composantALaDemande(() => import('./Releve').then((m) => m.Releve), false);

export interface ProprietesTresorerie {
  /**
   * L'année de la vue Année — celle du mois partagé par les écrans, tenu par
   * `App`. `undefined` retombe sur l'année de l'horloge : le cas des tests qui
   * montent cet écran seul.
   */
  readonly annee?: number;
  /** De quoi la changer, depuis la vue Année. */
  readonly onAnnee?: (annee: number) => void;
}

/**
 * Écran Trésorerie — « combien j'ai là, pour de vrai, et combien je peux me
 * verser » (lot 51, décision 1), redessiné d'après `direction/tresorerie.html`
 * (lot 49).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DOUZE MOIS GLISSANTS PAR DÉFAUT, L'ANNÉE POUR RELIRE LE PASSÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La question de l'écran porte sur ce qui VIENT : de quoi tiendra le compte
 * en mai prochain. Une année civile coupait la projection au 31 décembre —
 * en novembre, elle ne voyait plus qu'un mois. La vue Année reste, pour relire
 * ce que le compte a fait ; le choix vit dans l'adresse (`#/tresorerie/annee`),
 * pas dans les faits : ce n'est pas une préférence à synchroniser, c'est où
 * l'on regarde.
 */
export function Tresorerie({ annee, onAnnee }: ProprietesTresorerie = {}) {
  const faits = useFaits((e) => e.faits);
  const { ecran, sousRoute, naviguerVers } = useRoute();
  const routeIci = ecran.id === 'tresorerie' ? sousRoute : '';
  const [releveOuvert, setReleveOuvert] = useState(() => routeIci === 'releve');
  /* `#/tresorerie/releve` est un GESTE — l'action rapide « Importer un
     relevé », le pointage d'un versement : il ouvre le relevé, puis l'adresse
     redevient celle de l'écran. Fermer puis recharger ne doit pas le rouvrir. */
  useEffect(() => {
    if (routeIci !== 'releve') return;
    setReleveOuvert(true);
    window.location.replace('#/tresorerie');
  }, [routeIci]);

  const vueAnnee = routeIci === 'annee';
  const anneeVue = annee ?? new Date().getFullYear();
  const operations = faits.mouvementsBancaires.length;
  const aRapprocher = faits.mouvementsBancaires.filter(estATraiter).length;
  const dernierReleve = faits.mouvementsBancaires.reduce<DateISO | null>(
    (d, m) => (d === null || m.date > d ? m.date : d), null
  );

  return (
    <>
      <Greet
        titre="Ton solde n’est pas tout à toi."
        sousTitre="Ce que tu as, ce que tu dois, ce que tu peux te verser — aujourd’hui et sur douze mois."
        actions={(
          /* La seule commande de période de l'écran, comme la maquette. Des
             liens et non des onglets : chaque vue a son adresse, et « retour »
             doit y ramener. */
          <nav className={tr.segment} aria-label="Période">
            <a
              href="#/tresorerie"
              className={vueAnnee ? tr.option : `${tr.option} ${tr.choisie}`}
              aria-current={vueAnnee ? undefined : 'page'}
              onClick={(e) => { e.preventDefault(); naviguerVers('tresorerie'); }}
            >
              12 mois à venir
            </a>
            <a
              href="#/tresorerie/annee"
              className={vueAnnee ? `${tr.option} ${tr.choisie}` : tr.option}
              aria-current={vueAnnee ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); naviguerVers('tresorerie', 'annee'); }}
            >
              Année {anneeVue}
            </a>
          </nav>
        )}
      />

      <div className={tr.page}>
        <PartGardeeRetiree />
        <Suspense fallback={<p role="status" className={tr.vide}>Chargement…</p>}>
          {vueAnnee
            ? <VueAnnee annee={anneeVue} {...(onAnnee === undefined ? {} : { onAnnee })} />
            : <DouzeMois />}
        </Suspense>

        {/* La banque, en bas, comme la maquette : où en est le relevé, et la
            porte pour l'ouvrir. Le nombre d'opérations à rapprocher se lit sans
            démasquer : ce n'est pas un montant. */}
        <section className={`${tr.carte} ${tr.banque}`} aria-labelledby="titre-banque">
          <div className={tr.qui}>
            <span className={tr.avatar} aria-hidden="true">B</span>
            <div>
              <h2 id="titre-banque" className={tr.titreCarte}>Banque</h2>
              <small>
                {operations === 0 || dernierReleve === null
                  ? 'Aucun relevé importé : ton solde reste celui que tu as saisi.'
                  : `Relevé du ${jourEtMoisLong(dernierReleve, dateDuJour())} · ${operations} opération${operations > 1 ? 's' : ''}`
                    + (aRapprocher === 0 ? ', toutes traitées.' : ` · ${aRapprocher} à rapprocher`)}
              </small>
            </div>
          </div>
          <button type="button" className={tr.bouton} onClick={() => setReleveOuvert(true)}>
            {operations === 0 ? 'Importer un relevé' : 'Ouvrir le relevé'}
          </button>
        </section>
      </div>

      {/* Un plan de travail et non un tiroir : on y tranche opération par
          opération, et la liste des candidats a besoin de la largeur. */}
      <Sheet
        ouvert={releveOuvert}
        titre="Relevé bancaire"
        variante="atelier"
        onFermer={() => setReleveOuvert(false)}
      >
        {releveOuvert && (
          <Suspense fallback={<p role="status" className={tr.vide}>Chargement…</p>}>
            <Releve />
          </Suspense>
        )}
      </Sheet>
    </>
  );
}

/**
 * Le bandeau de la décision 24, dit UNE fois : la part gardée à chaque
 * versement s'est fondue dans la réserve.
 *
 * Sans lui, chez qui gardait 10 %, « à te verser » monte de 10 % au premier
 * chargement de la nouvelle version, sans un mot — et il croit garder encore
 * une marge qu'aucun calcul ne retient plus. La migration ne convertit pas le
 * pourcentage en euros (aucune conversion n'est exacte) : c'est à lui de
 * relever sa réserve s'il veut garder plus. « Compris » pose `null` par la
 * seule écriture du profil, et le bandeau ne revient pas.
 */
function PartGardeeRetiree() {
  const part = useFaits((e) => e.faits.entreprise.partGardeeRetiree);
  const modifierEntreprise = useFaits((e) => e.modifierEntreprise);
  if (part === null) return null;
  return (
    <section className={tr.bandeau} role="status" aria-label="Part gardée retirée">
      <p>
        ◇ Tu gardais {part}&nbsp;% de chaque versement.{' '}
        <span>
          Ce réglage disparaît&nbsp;: un seul «&nbsp;à te verser&nbsp;» désormais. Si tu
          veux garder plus, relève ta réserve.
        </span>
      </p>
      <div className={tr.bandeauGestes}>
        <a className={tr.lien} href="#/reglages/reserve">Relever ma réserve</a>
        <button
          type="button"
          className={tr.compris}
          onClick={() => modifierEntreprise({ partGardeeRetiree: null })}
        >
          Compris
        </button>
      </div>
    </section>
  );
}

// `#/tresorerie/releve` ouvert d'emblée : le relevé part avec l'écran, au lieu
// d'un « Chargement… » de plus une fois l'écran affiché.
if (sousRouteSiEcran('tresorerie', adresseCourante()) === 'releve') Releve.lancer();
