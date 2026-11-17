import { Suspense, lazy, useEffect, useId, useMemo, useState } from 'react';
import { composantALaDemande } from '../composantALaDemande';
import { useFaits } from '../../state/store';
import { dateDuJour, moisCourant } from '../../state/selecteurs';
import { delaisParClient } from '../../domain/calculs/activite';
import type { Mois } from '../../domain/types';
import { Greet } from '../components/Greet';
import { Onglets, PanneauOnglet } from '../components/Onglets';
import { Sheet } from '../components/Sheet';
import { useRoute } from '../useRoute';
import { sousRouteDuBrouillonEnregistre } from '../adresseBrouillon';
import styles from './Activite.module.css';

/**
 * Le facturier arrive avec l'écran, mais dans son propre fichier : il pèse plus
 * lourd que tout le reste, et la liste des clients n'a pas à l'attendre.
 */
const Facturier = composantALaDemande(() => import('../components/Facturier')
  .then((m) => m.Facturier), true);

/** Le carnet des clients, à l'ouverture de son onglet. */
const OngletClients = composantALaDemande(() => import('./Activite.clients')
  .then((m) => m.OngletClients), true);

/** Le formulaire d'un client : un geste explicite, il arrive à l'ouverture. */
const FormulaireClient = lazy(() => import('./Activite.formulaires')
  .then((m) => ({ default: m.FormulaireClient })));

type Section = 'factures' | 'clients';

export interface ProprietesFactures {
  /**
   * Le mois partagé par les écrans, tenu par `App` : il ancre la période du
   * facturier. `undefined` retombe sur un mois local — le cas des tests qui
   * montent cet écran seul.
   */
  readonly mois?: Mois;
  readonly onMois?: (m: Mois) => void;
}

/**
 * Écran Factures — le facturier et les clients (lot 51, décision 1).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE ENTRÉE DU RAIL, ET PLUS UN ONGLET D'ACTIVITÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les factures étaient le troisième onglet d'Activité (formule A du 6/11) :
 * on y arrivait par le planning, qu'on traversait sans le regarder. C'est
 * pourtant le geste du mois le plus lié à l'argent — émettre, relancer — et
 * la maquette lui rend son entrée, juste avant la Trésorerie où il se lit.
 *
 * Les clients suivent la facture et non la mission : leur fiche porte le
 * délai de paiement, l'adresse et le numéro de TVA qu'une facture imprime, et
 * leur onglet montre le délai réel de chacun — une question de facturation.
 *
 * Le contenu n'est pas redessiné ici : c'est le même facturier et le même
 * carnet qu'avant, déménagés. La mise en page fine viendra avec leur lot.
 */
export function Factures({ mois: moisChoisi, onMois }: ProprietesFactures = {}) {
  const faits = useFaits((e) => e.faits);
  const { ecran, sousRoute, naviguerVers } = useRoute();
  // Monté seul (les tests), l'écran ne lit pas l'adresse d'un autre écran.
  const routeIci = ecran.id === 'factures' ? sousRoute : '';
  const depuisAdresse = (r: string): Section => (r === 'clients' ? 'clients' : 'factures');
  /* L'état local suit l'adresse, et non l'inverse : `hashchange` arrive après
     le clic, et l'onglet ne doit pas attendre l'événement pour s'afficher. */
  const [section, setSection] = useState<Section>(() => depuisAdresse(routeIci));
  useEffect(() => { setSection(depuisAdresse(routeIci)); }, [routeIci]);
  const [client, setClient] = useState<{ readonly id: string | null } | null>(null);
  const idGroupe = useId();

  const [moisLocal, setMoisLocal] = useState<Mois>(() => moisCourant());
  const mois = moisChoisi ?? moisLocal;
  const setMois = onMois ?? setMoisLocal;
  const annee = Number(mois.slice(0, 4));

  // Le délai réel de chaque client : ce que ses factures ont mis à être
  // réglées, pas ce que sa fiche promet.
  const delais = useMemo(() => delaisParClient(faits.recettes, dateDuJour()), [faits.recettes]);

  function changerDeSection(cible: Section): void {
    setSection(cible);
    naviguerVers('factures', cible === 'factures' ? '' : cible);
  }

  return (
    <>
      <Greet
        titre="Tes factures"
        sousTitre="Ce qui est parti, ce qui reste à encaisser, et qui relancer."
        {...(section === 'clients' && faits.clients.length > 0 ? {
          actions: (
            <button type="button" className={styles.actionPrincipale}
              onClick={() => setClient({ id: null })}>
              Ajouter un client
            </button>
          )
        } : {})}
      />

      <div className={styles.sections}>
        <Onglets
          idGroupe={idGroupe}
          onglets={[
            /* Sans compte : le facturier dit lui-même ce qui reste à
               encaisser, et un total de factures émises dénombrerait surtout
               le passé. */
            { id: 'factures' as Section, libelle: 'Factures' },
            { id: 'clients' as Section, libelle: 'Clients', compte: faits.clients.length }
          ]}
          actif={section}
          onChange={changerDeSection}
          libelle="Sections de l’écran Factures"
        />

        <PanneauOnglet idGroupe={idGroupe} id="factures" actif={section === 'factures'}>
          <Suspense fallback={<EnAttente />}>
            <Facturier
              onNouvelle={() => naviguerVers('facture', 'nouvelle')}
              onRevoir={(numero) => naviguerVers('facture', encodeURIComponent(numero))}
              onReprendre={(id) => naviguerVers('facture', sousRouteDuBrouillonEnregistre(id))}
              annee={annee}
              mois={mois}
              onMois={setMois}
            />
          </Suspense>
        </PanneauOnglet>

        <PanneauOnglet idGroupe={idGroupe} id="clients" actif={section === 'clients'}>
          <Suspense fallback={<EnAttente />}>
            <OngletClients idGroupe={idGroupe} onOuvrirClient={(id) => setClient({ id })} delais={delais} />
          </Suspense>
        </PanneauOnglet>
      </div>

      <Sheet
        ouvert={client !== null}
        titre={client !== null && client.id !== null ? 'Modifier le client' : 'Nouveau client'}
        onFermer={() => setClient(null)}
      >
        {client !== null && (
          <Suspense fallback={<EnAttente />}>
            <FormulaireClient id={client.id} onFini={() => setClient(null)} />
          </Suspense>
        )}
      </Sheet>
    </>
  );
}

/** L'attente d'un onglet ou d'un formulaire. Sobre : elle dure un instant. */
function EnAttente() {
  return (
    <p role="status" style={{ color: 'var(--muted-2)', fontSize: '13px' }}>
      Chargement…
    </p>
  );
}
