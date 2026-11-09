import { useEffect, useMemo, useState } from 'react';
import type { SujetATraiter } from '../domain/calculs/aTraiter';
import type { Faits } from '../state/schema';
import type { IdEcran } from './navigation';

/**
 * Les sujets « à traiter », calculés par un module chargé à la demande.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `null` N'EST PAS UNE LISTE VIDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Tant que le module n'est pas là, on ne sait pas s'il y a quelque chose à
 * traiter. Rendre `[]` ferait dire « rien ne réclame ton attention » à un
 * dossier qui a des factures en retard, le temps du chargement : un faux
 * « tout va bien » est pire qu'un écran qui se remplit. Les lecteurs doivent
 * donc traiter `null` comme « inconnu » — ni pastille, ni message d'état vide.
 *
 * Le module (CFE, déclarations, DES, échéances réglementaires) ne sert qu'à ces
 * affichages secondaires : le charger à part le sort du paquet d'entrée. La
 * promesse est mémorisée ici, une fois pour toute l'application.
 */
let chargement: Promise<typeof import('../state/selecteurs.aTraiter')> | null = null;

function charger() {
  chargement ??= import('../state/selecteurs.aTraiter');
  return chargement;
}

type Module = typeof import('../state/selecteurs.aTraiter');

function useModule(): Module | null {
  const [module, setModule] = useState<Module | null>(null);
  useEffect(() => {
    let vivant = true;
    void charger().then((m) => { if (vivant) setModule(m); });
    return () => { vivant = false; };
  }, []);
  return module;
}

export function useATraiter(faits: Faits): readonly SujetATraiter[] | null {
  const module = useModule();
  return useMemo(() => (module === null ? null : module.aTraiter(faits)), [module, faits]);
}

/**
 * Les pastilles du rail : `undefined` tant que le calcul n'est pas là, pour que
 * le rail n'en dessine aucune plutôt qu'un « 0 ».
 */
export function useCompteursATraiter(faits: Faits): Partial<Record<IdEcran, number>> | undefined {
  const module = useModule();
  return useMemo(
    () => (module === null ? undefined : module.compteursParEcran(module.aTraiter(faits))),
    [module, faits]
  );
}
