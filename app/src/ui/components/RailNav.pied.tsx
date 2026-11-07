import { useFaits } from '../../state/store';
import { moisCourant, sousAcreLe } from '../../state/selecteurs';
import styles from './RailNav.module.css';

/** Icône du livre des recettes : un livre ouvert. */
const ICONE_LIVRE = 'M4 5 C7 4 10 4.5 12 6 C14 4.5 17 4 20 5 V19 C17 18 14 18.5 12 20 C10 18.5 7 18 4 19 Z M12 6 V20';

/**
 * Le pied du rail, en grand écran seulement : dans le dock du téléphone, il
 * n'y a pas de pied — le livre se trouve dans Argent, la carte dans Réglages.
 *
 * Le livre des recettes y est en accès direct : c'est le registre qu'on
 * présente à un contrôle, et le chercher derrière un bouton d'Argent le
 * cachait. La carte dit qui, et sous quel régime — « Micro-BNC · ACRE » se
 * relit d'un coup d'œil avant de se fier à un taux.
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
    <div className={styles.pied}>
      <a className={styles.lien} href="#/argent/livre">
        <span className={styles.icone} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d={ICONE_LIVRE} />
          </svg>
        </span>
        <span className={styles.libelle}>Livre des recettes</span>
      </a>
      <a className={styles.qui} href="#/config" aria-label={`${nom === '' ? 'Ton profil' : nom} — ${regime}`}>
        <span className={styles.avatar} aria-hidden="true">{initiales === '' ? '·' : initiales}</span>
        <span className={styles.quiTexte} aria-hidden="true">
          <span className={styles.quiNom}>{nom === '' ? 'Ton profil' : nom}</span>
          <span className={styles.quiRegime}>{regime}</span>
        </span>
      </a>
    </div>
  );
}
