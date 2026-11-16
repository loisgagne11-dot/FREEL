import type { Ecran, IdEcran } from '../navigation';
import { ECRANS, ECRANS_DU_RAIL, entreeDuRail } from '../navigation';
import { Suspense, lazy, useState } from 'react';
import styles from './RailNav.module.css';

/**
 * La carte de l'utilisateur, en pied du rail, arrive à la demande : elle
 * n'existe qu'en grand écran, tout en bas, et le paquet d'entrée a franchi son
 * budget au lot 6. Elle apparaît quelques millisecondes après les entrées, là
 * où personne ne regarde en premier.
 */
const PiedDuRail = lazy(() => import('./RailNav.pied').then((m) => ({ default: m.PiedDuRail })));

/** Le volet « Plus » du téléphone : il ne sert qu'à l'ouverture, il arrive alors. */
const VoletPlus = lazy(() => import('./RailNav.plus').then((m) => ({ default: m.VoletPlus })));

export interface ProprietesRailNav {
  readonly ecranActif: IdEcran;
  readonly compteurs?: Partial<Record<IdEcran, number>>;
}

/**
 * Le compteur d'une entrée : le sien, et ceux des écrans qu'elle accueille —
 * une facture qu'on rédige est un sujet de « Factures ».
 */
export function compteurDe(id: IdEcran, compteurs?: Partial<Record<IdEcran, number>>): number {
  return ECRANS
    .filter((e) => e.id === id || e.rattacheA === id)
    .reduce((n, e) => n + (compteurs?.[e.id] ?? 0), 0);
}

/** Les entrées que la barre du téléphone n'a pas la place de montrer : le volet « Plus ». */
export const ECRANS_DU_VOLET: readonly Ecran[] = ECRANS_DU_RAIL.filter((e) => e.barre !== true);

/**
 * Une seule structure, deux formes pilotées par la feuille de style — jamais
 * de disposition recalculée en JavaScript (invariant n°7).
 *
 * AU BUREAU (décision 1 du 16/11) : six entrées pour ce qu'on vient faire,
 * Simulateurs et Réglages sous un filet, la carte de l'utilisateur en pied —
 * elle mène aux Réglages. Le livre des recettes a quitté ce pied : il vit dans
 * Obligations, avec les autres registres qu'on présente à un contrôle.
 *
 * AU TÉLÉPHONE (décision 3) : une barre basse de cinq entrées, TOUTES nommées
 * — Pilote, Activité, Factures, Trésorerie, Plus. Le dock montrait six icônes
 * dont seule l'active portait son nom : il fallait apprendre six dessins.
 * « Plus » ouvre un volet avec le reste, et l'interrupteur « Masquer les
 * montants », qui quitte alors la barre du haut.
 *
 * Les compteurs « à traiter » sont sur les entrées, et ce sont eux qui ont
 * remplacé la pastille de la barre du haut. Au téléphone, « Plus » porte la
 * somme de ceux qu'il cache : sans cela, deux déclarations en retard sous
 * Obligations ne se verraient d'aucun écran sauf le Pilote.
 */
export function RailNav({ ecranActif, compteurs }: ProprietesRailNav) {
  const allumee = entreeDuRail(ecranActif);
  const [plusOuvert, setPlusOuvert] = useState(false);
  const dansLeVolet = ECRANS_DU_VOLET.some((e) => e.id === allumee);
  const cachesParPlus = ECRANS_DU_VOLET.reduce((n, e) => n + compteurDe(e.id, compteurs), 0);

  const entree = (ecran: Ecran) => {
    const actif = ecran.id === allumee;
    const compteur = compteurDe(ecran.id, compteurs);
    const classes = [
      styles.lien,
      actif ? styles.actif : '',
      ecran.barre === true ? '' : styles.horsBarre,
      ecran.pied === true ? styles.pied : ''
    ].join(' ');
    return (
      <a
        key={ecran.id}
        href={ecran.chemin}
        // Les entrées, distinguées de la carte du pied : c'est sur elles que
        // se mesurent le nombre d'entrées et les cibles tactiles.
        data-role="entree"
        aria-label={ecran.libelle}
        aria-current={actif ? 'page' : undefined}
        className={classes}
      >
        <Icone trace={ecran.icone} />
        {/* `data-role` nomme le libellé pour le vérificateur responsive : la
            règle « toutes nommées » se mesure sur CET élément, pas sur le
            texte du lien — qui contient aussi le chiffre du compteur. */}
        <span className={styles.libelle} data-role="libelle" aria-hidden="true">
          {ecran.libelle}
        </span>
        {compteur > 0 && <span className={styles.badge} aria-hidden="true">{compteur}</span>}
      </a>
    );
  };

  return (
    <>
      <nav className={styles.rail} aria-label="Navigation principale">
        {ECRANS_DU_RAIL.filter((e) => e.pied !== true).map(entree)}
        <div className={styles.filet} role="separator" />
        {ECRANS_DU_RAIL.filter((e) => e.pied === true).map(entree)}
        <button
          type="button"
          data-role="entree"
          className={`${styles.lien} ${styles.plus} ${dansLeVolet ? styles.actif : ''}`}
          aria-haspopup="dialog"
          aria-expanded={plusOuvert}
          onClick={() => setPlusOuvert(true)}
        >
          {/* Trois points tracés comme trois segments nuls : le bout rond du
              trait les dessine, sans trois cercles de plus dans l'entrée. */}
          <Icone trace="M5 12h0M12 12h0M19 12h0" epaisseur={4.4} />
          <span className={styles.libelle} data-role="libelle">Plus</span>
          {cachesParPlus > 0 && <span className={styles.badge} aria-hidden="true">{cachesParPlus}</span>}
        </button>
        <Suspense fallback={null}><PiedDuRail /></Suspense>
      </nav>
      {plusOuvert && (
        <Suspense fallback={null}>
          <VoletPlus
            ecrans={ECRANS_DU_VOLET}
            allumee={allumee}
            {...(compteurs ? { compteurs } : {})}
            onFermer={() => setPlusOuvert(false)}
          />
        </Suspense>
      )}
    </>
  );
}

/** Une icône au trait, sur la grille 24 de la maquette. */
export function Icone({ trace, epaisseur = 1.7 }: { readonly trace: string; readonly epaisseur?: number }) {
  return (
    <span className={styles.icone} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={epaisseur} strokeLinecap="round" strokeLinejoin="round">
        <path d={trace} />
      </svg>
    </span>
  );
}
