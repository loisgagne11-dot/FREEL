import { useFaits } from '../../state/store';
import { moisCourant, sousAcreLe } from '../../state/selecteurs';
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
    ...(sousAcreLe(faits)(moisCourant()) ? ['ACRE'] : []),
    ...(entreprise.versementLiberatoire ? ['VL'] : [])
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
