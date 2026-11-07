import { useEffect, useRef } from 'react';
import { useFaits } from '../../state/store';
import { useToast } from './Toasts';
import { Bandeau } from '../screens/Pilote.bandeaux';

/**
 * Ce qui menace la conservation des saisies, sur TOUS les écrans.
 *
 * L'alerte vivait sur le Pilote seul. Elle ne servait qu'au démarrage : un
 * stockage qui sature en cours de session se découvre en pleine saisie d'une
 * facture, et c'est là qu'il faut le lire. Une saisie écartée parce qu'un
 * autre onglet avait écrit entre-temps se dit aussi — sinon elle aurait l'air
 * d'avoir été enregistrée.
 *
 * Chargée à la demande depuis `App` : le paquet d'entrée a franchi son budget
 * au lot 6 en accueillant le navigateur de mois, et l'invariant n°7 dit
 * d'extraire. Elle ne parle que d'un état RARE (stockage indisponible, saisie
 * écartée par un autre onglet) ; arriver quelques millisecondes après l'écran
 * ne lui fait rien perdre.
 */
export function AlerteConservation() {
  const chargement = useFaits((e) => e.chargement);
  const ecartees = useFaits((e) => e.saisiesEcartees);
  const toast = useToast();
  const dejaSignalees = useRef(ecartees);
  useEffect(() => {
    if (ecartees > dejaSignalees.current) {
      toast('Une autre fenêtre de l’application venait d’enregistrer : ta dernière '
        + 'saisie n’a pas été appliquée. Les données ont été rechargées, refais-la.');
    }
    dejaSignalees.current = ecartees;
  }, [ecartees, toast]);

  return chargement.phase === 'sans-persistance' ? (
    <Bandeau ton="alerte" titre="Tes saisies ne sont pas conservées">{chargement.motif}</Bandeau>
  ) : null;
}
