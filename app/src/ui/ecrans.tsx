import type { Mois } from '../domain/types';
import type { IdEcran } from './navigation';
import { composantALaDemande } from './composantALaDemande';

/**
 * Les écrans autres que le Pilote, et ce que chacun reçoit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE TABLE N'EST PAS DANS LE PAQUET D'ENTRÉE (lot 51)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle y vivait, dans `App`. Chaque `import()` d'écran y emportait la liste de
 * ce qu'il faut précharger avec lui — ses fichiers, ceux de ses composants,
 * leurs feuilles de style —, et cette liste était écrite dans l'entrée, nom de
 * fichier par nom de fichier : près de deux kilo-octets pour six écrans. Le
 * lot 51 en compte huit, et l'entrée a franchi son budget (80,3 / 80 Ko) avant
 * même que le rail n'ait changé. Le budget ne se relève pas : on extrait ce
 * qui n'a rien à faire au premier affichage, et la carte des écrans qu'on
 * n'affiche pas encore en est.
 *
 * Le prix : une adresse ouverte directement sur un écran différé attend ce
 * module avant le sien — un aller-retour de plus, sur un fichier de quelques
 * centaines d'octets. Ensuite, rien : il est téléchargé au repos avec les
 * écrans eux-mêmes (`auRepos`), et un changement d'écran n'attend plus rien.
 */
const Activite = composantALaDemande(() => import('./screens/Activite').then((m) => m.Activite), true);
const Factures = composantALaDemande(() => import('./screens/Factures').then((m) => m.Factures), true);
const Tresorerie = composantALaDemande(() => import('./screens/Tresorerie').then((m) => m.Tresorerie), true);
const Obligations = composantALaDemande(() => import('./screens/Obligations').then((m) => m.Obligations), true);
const Achats = composantALaDemande(() => import('./screens/Achats').then((m) => m.Achats), true);
/* Simulateurs et Réglages gardent leurs fichiers d'avant le lot 51 — `Outils`,
   `Config` —, avec les modules de leurs sections qui portent ce préfixe. */
const Simulateurs = composantALaDemande(() => import('./screens/Outils').then((m) => m.Outils), true);
const Reglages = composantALaDemande(() => import('./screens/Config').then((m) => m.Config), true);
const Facture = composantALaDemande(() => import('./screens/Facture').then((m) => m.Facture), true);

export interface ProprietesEcranDiffere {
  readonly id: Exclude<IdEcran, 'pilote'>;
  /** Le mois partagé par les écrans, tenu par `App` — voir son en-tête. */
  readonly mois: Mois;
  readonly onMois: (m: Mois) => void;
}

/**
 * L'écran désigné, avec sa période.
 *
 * L'exhaustivité est vérifiée par le compilateur : `jamais` est de type
 * `never`, donc ajouter un écran à la navigation sans le router ici ne
 * compile pas. Un `return null` final aurait laissé passer un écran blanc.
 *
 * Le MOIS va à Activité (sa grille), à Factures (le facturier) et à Achats
 * (l'ancre de sa barre de période) ; son ANNÉE aux écrans qui raisonnent à
 * l'année — Trésorerie, Obligations, Simulateurs. Chacun reçoit AVEC
 * la valeur de quoi la changer, et porte la commande dans son en-tête — une
 * seule par écran (lot 51) : la barre du haut n'en a plus. La rédaction d'une
 * facture n'a pas de période, les Réglages non plus.
 */
export function EcranDiffere({ id, mois, onMois }: ProprietesEcranDiffere) {
  const annee = Number(mois.slice(0, 4));
  /* Changer d'année garde le mois et n'en change que le millésime : de mars
     2026, choisir 2025 donne mars 2025, et non décembre — c'est le mois qu'on
     regardait, dans l'année qu'on vient de demander. */
  const changerAnnee = (a: number): void => onMois(`${a}${mois.slice(4)}` as Mois);
  switch (id) {
    case 'activite': return <Activite mois={mois} onMois={onMois} />;
    case 'factures': return <Factures mois={mois} onMois={onMois} />;
    case 'tresorerie': return <Tresorerie annee={annee} onAnnee={changerAnnee} />;
    case 'obligations': return <Obligations annee={annee} onAnnee={changerAnnee} />;
    case 'facture': return <Facture />;
    case 'achats': return <Achats mois={mois} onMois={onMois} />;
    case 'simulateurs': return <Simulateurs annee={annee} onAnnee={changerAnnee} />;
    case 'reglages': return <Reglages />;
    default: {
      const jamais: never = id;
      return jamais;
    }
  }
}
