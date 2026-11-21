import { useFaits } from '../../state/store';
import { moisCourant, sousAcreLe, vlAu } from '../../state/selecteurs';
import styles from './RailNav.module.css';

/**
 * La carte de l'utilisateur, en pied du rail — en grand écran seulement : au
 * téléphone, les Réglages sont dans le volet « Plus ».
 *
 * Elle dit qui, et sous quel régime : « Micro-BNC · ACRE » se relit d'un coup
 * d'œil avant de se fier à un taux. Elle mène aux Réglages (décision 1 du
 * 16/11), où ce profil se corrige.
 *
 * Le livre des recettes l'accompagnait ici jusqu'au lot 51. Il vit désormais
 * dans Obligations, avec la TVA et la DES : les registres qu'on présente à un
 * contrôle se cherchent au même endroit, et un lien isolé en pied de rail
 * était le seul à ne mener nulle part ailleurs qu'à un panneau.
 */
export function PiedDuRail() {
  const faits = useFaits((e) => e.faits);
  const { entreprise } = faits;
  const nom = entreprise.prenom.trim() !== '' ? entreprise.prenom.trim() : entreprise.nom.trim();
  const initiales = nom.split(/\s+/).filter((m) => m !== '').slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? '').join('');
  const regime = [
    `Micro-${entreprise.typeActivite === 'BNC' ? 'BNC' : 'BIC'}`,
    // La caisse change le taux (23,2 % contre 25,6 % en 2026) : elle se lit
    // avec le régime, sinon un taux Cipav passait pour une erreur de barème.
    ...(entreprise.typeActivite === 'BNC' && entreprise.caisseRetraite === 'cipav' ? ['Cipav'] : []),
    ...(sousAcreLe(faits)(moisCourant()) ? ['ACRE'] : []),
    // L'option de ce mois : prise en novembre pour janvier, elle ne se dit pas avant.
    ...(vlAu(faits, moisCourant()) ? ['VL'] : [])
  ].join(' · ');

  return (
    <a className={styles.carte} href="#/reglages" aria-label={`${nom === '' ? 'Ton profil' : nom} — ${regime}`}>
      <span className={styles.avatar} aria-hidden="true">{initiales === '' ? '·' : initiales}</span>
      <span className={styles.quiTexte} aria-hidden="true">
        <span className={styles.quiNom}>{nom === '' ? 'Ton profil' : nom}</span>
        <span className={styles.quiRegime}>{regime}</span>
      </span>
    </a>
  );
}
