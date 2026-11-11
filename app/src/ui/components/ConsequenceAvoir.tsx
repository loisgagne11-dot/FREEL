import type { DateISO, Euros } from '../../domain/types';
import { montantsDeLaFacture } from '../../domain/calculs/facturier';
import { dateCourte, eur } from '../format';
import { Montant } from './Montant';

/**
 * Ce qu'écrit un avoir, dit avant qu'il s'écrive.
 *
 * Le facturier et le livre des recettes émettent le même avoir
 * (`annulerRecette`) : une seule phrase, pour qu'ils n'en disent pas deux.
 *
 * Deux cas que rien ne distinguait à l'écran. Sur une facture ENCAISSÉE,
 * l'avoir inscrit au livre une recette négative à la date du jour — un
 * remboursement : le chiffre d'affaires à déclarer baisse d'autant, et les
 * cotisations avec. Annuler une facture payée « pour la refaire » sans rendre
 * l'argent déclarerait donc moins que ce qui a été reçu. Sur une facture qui
 * attend son règlement, il neutralise seulement ce qui était dû.
 */
export function ConsequenceAvoir(
  { recette: r, aujourdhui }: {
    readonly recette: {
      readonly montant: Euros;
      readonly tvaCollectee?: Euros | null;
      readonly clientNom: string;
      readonly numero: string;
      readonly encaisseeLe: DateISO | null;
    };
    readonly aujourdhui: DateISO;
  }
) {
  const m = montantsDeLaFacture(r);
  const client = r.clientNom !== '' ? r.clientNom : 'ce client';
  // Le montant tel qu'il a circulé : TTC quand il y a une TVA, avec le
  // hors-taxe qui, lui, se déclare.
  const montant = m.tva !== null && m.tva > 0 && m.ttc !== null
    ? <><Montant>{eur(m.ttc)}</Montant> TTC (<Montant>{eur(m.ht)}</Montant> HT)</>
    : <Montant>{eur(m.ht)}</Montant>;

  if (r.encaisseeLe !== null) {
    return (
      <>
        Le livre des recettes portera un remboursement de {montant} au
        {' '}{dateCourte(aujourdhui)}&nbsp;: le chiffre d’affaires à déclarer
        baisse d’autant, et les cotisations avec. À ne faire que si tu
        rembourses {client}. Un avoir ne se défait pas.
      </>
    );
  }
  return (
    <>
      Les {montant} attendus de {client} ne seront plus dus&nbsp;: la facture
      {' '}{r.numero || 'sans numéro'} sort du reste à rentrer. Un avoir ne se
      défait pas — pour refacturer, il faudra une nouvelle facture.
    </>
  );
}
