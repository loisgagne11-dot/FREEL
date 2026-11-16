import type { ClientOperationnel } from './schema';

/**
 * Le client opérationnel vierge, d'où partent la saisie et la migration.
 *
 * Il vivait dans `schema.ts`, donc dans le paquet d'entrée, alors que ses deux
 * seuls appelants — le formulaire de mission et la conversion des schémas
 * antérieurs — sont chargés à la demande. Le lot 31 devait ajouter à l'entrée
 * de quoi lire un schéma de plus ; elle était à 79,59 / 80 Ko. On extrait ce
 * qui n'a rien à y faire plutôt que de relever le plafond.
 */
export function entiteVide(): ClientOperationnel {
  return {
    id: '', nom: '', couleur: '', adresse: '', contact: '', email: '',
    telephone: '', rythmes: [], ajustements: {}
  };
}
