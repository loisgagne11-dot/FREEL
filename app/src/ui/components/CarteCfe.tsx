import { useId, useMemo, useState } from 'react';
import { euros } from '../../domain/types';
import {
  CA_SANS_COTISATION_MINIMUM, type RegimeCfe,
  cfeDue, cotisationCfe, regimeCfe
} from '../../domain/bareme/cfe';
import { useFaits } from '../../state/store';
import { caEncaisseAnnee } from '../../state/selecteurs';
import { Info } from './Info';
import { Montant } from './Montant';
import { eur } from '../format';
import styles from './CarteCfe.module.css';

/**
 * La cotisation foncière des entreprises.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CETTE CARTE NE DEVINE PAS LE MONTANT, ET C'EST LE POINT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La CFE d'un micro-entrepreneur, c'est une base minimum fixée par sa commune
 * multipliée par un taux voté par elle. Deux valeurs que seule sa commune
 * connaît, et que seul son avis porte.
 *
 * L'ancienne application affichait quand même un montant, tiré d'une grille en
 * dur que l'audit comptable a jugée non conforme à la structure réelle — et un
 * montant plat de 410 € dans l'échéancier, sans rapport avec ce que ce même
 * simulateur calculait. Deux vérités pour la même dette, dans la même
 * application.
 *
 * Ici, la carte dit trois choses et n'en invente aucune :
 *
 *  1. **Quel régime s'applique cette année** — exonération de création,
 *     base réduite de moitié, dispense sous 5 000 €, ou droit commun. Ce sont
 *     des règles, elles se calculent.
 *  2. **Combien**, si et seulement si l'utilisateur a recopié la base et le
 *     taux de son avis. Sans eux, la carte demande l'avis plutôt que d'estimer.
 *  3. **Quand** — l'avis paraît en novembre, le paiement est au 15 décembre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La CFE est annuelle, invisible jusqu'en novembre, et payable au 15 décembre.
 * Quelqu'un qui se verse tout son disponible en octobre se verse la CFE de
 * décembre. C'est l'erreur qui va dans le sens dangereux.
 */
export function CarteCfe({ maintenant = new Date() }: { readonly maintenant?: Date }) {
  const faits = useFaits((e) => e.faits);
  const idChamp = useId();
  const [baseSaisie, setBaseSaisie] = useState('');
  const [tauxSaisi, setTauxSaisi] = useState('');

  const annee = maintenant.getFullYear();
  const debut = faits.entreprise.debutActivite;

  const regime = useMemo(() => {
    const reference = annee - 2;
    // Une entreprise trop jeune n'a pas « 0 € en N−2 » : elle n'a pas de N−2.
    const ca = debut === null || Number(debut.slice(0, 4)) > reference
      ? null
      : caEncaisseAnnee(faits, reference);
    return regimeCfe(debut, annee, ca);
  }, [faits, debut, annee]);

  const base = nombreOuNull(baseSaisie);
  const taux = nombreOuNull(tauxSaisi);
  const montant = base === null || taux === null
    ? null
    : cotisationCfe(euros(base), taux / 100, regime);

  const dejaSaisie = faits.echeances.some(
    (e) => e.nature === 'cfe' && e.echeanceLe.startsWith(String(annee))
  );

  return (
    <section className={styles.carte} aria-labelledby="titre-cfe">
      <h2 id="titre-cfe" className={styles.titreCarte}>
        Cotisation foncière des entreprises {annee}
        <Info libelle="Pourquoi aucun montant n’est proposé">
          La CFE est une <strong>base minimum fixée par votre commune</strong>,
          multipliée par un <strong>taux voté par elle</strong>. Aucune règle
          nationale ne permet de la calculer&nbsp;: les deux valeurs se lisent
          sur votre avis, disponible en novembre sur votre espace professionnel.
          Une estimation tirée d’une grille moyenne serait un chiffre qui
          engage sans rien mesurer.
        </Info>
      </h2>

      <p
        className={styles.regime}
        data-du={cfeDue(regime)}
        /*
         * LE CAS « SOUS LE SEUIL » PORTE LA MARQUE DES MONTANTS, ET CE N'EST
         * PAS UN ABUS.
         *
         * « Vos recettes de 2024 ne dépassent pas 5 000 € » est une information
         * financière SUR L'UTILISATEUR, pas une règle générale. Flouter le seul
         * nombre ne suffirait pas : « vos recettes ne dépassent pas ▓▓▓ » dit
         * encore qu'elles sont sous le seuil de dispense. C'est la phrase
         * entière qui doit disparaître, et `data-montant` est la marque que la
         * feuille globale sait atteindre.
         *
         * Les trois autres régimes ne révèlent rien de tel : l'année de
         * création n'est pas un montant, et le droit commun est la situation de
         * tout le monde.
         */
        {...(regime.type === 'sous-le-seuil-de-cotisation-minimum'
          ? { 'data-montant': '' }
          : {})}
      >
        {phrase(regime, annee)}
      </p>

      {cfeDue(regime) && (
        <>
          <div className={styles.champs}>
            <label className={styles.champ} htmlFor={`${idChamp}-base`}>
              <span className={styles.libelleChamp}>Base minimum de votre avis</span>
              <input
                id={`${idChamp}-base`}
                type="text"
                inputMode="decimal"
                className={styles.saisie}
                value={baseSaisie}
                onChange={(e) => setBaseSaisie(e.target.value)}
                placeholder="0"
              />
            </label>

            <label className={styles.champ} htmlFor={`${idChamp}-taux`}>
              <span className={styles.libelleChamp}>Taux communal (%)</span>
              <input
                id={`${idChamp}-taux`}
                type="text"
                inputMode="decimal"
                className={styles.saisie}
                value={tauxSaisi}
                onChange={(e) => setTauxSaisi(e.target.value)}
                placeholder="0"
              />
            </label>
          </div>

          {montant === null
            ? (
              <p className={styles.attente}>
                Recopiez les deux valeurs de votre avis pour obtenir le montant.
                Tant qu’il n’est pas connu, il n’est pas provisionné.
              </p>
            )
            : (
              <p className={styles.resultat}>
                Cotisation&nbsp;: <Montant>{eur(montant)}</Montant>
                {regime.type === 'base-reduite-moitie' && (
                  <span className={styles.precision}>
                    {' '}— base réduite de moitié, première année d’imposition.
                  </span>
                )}
              </p>
            )}

          {/* Le calcul ne sert à rien s'il ne devient pas une provision : la
              CFE ne pèse sur le disponible que portée en échéance. */}
          <p className={styles.suite}>
            {dejaSaisie
              ? 'Une échéance de CFE est enregistrée pour cette année : elle est déjà comptée dans vos provisions.'
              : (
                <>
                  Rien n’est enregistré tant que vous ne portez pas ce montant en
                  échéance. <a className={styles.lien} href="#/argent">Saisir l’échéance</a>
                </>
              )}
          </p>
        </>
      )}

      {/* Le seuil de l'acompte est un nombre PUBLIC, et il porte quand même la
          marque des montants. Le mode confidentialité promet qu'aucun montant
          ne reste lisible ; ouvrir une exception pour « celui-là ne vous
          concerne pas » rendrait la promesse négociable, et la prochaine
          exception serait plus difficile à refuser. Le survol le révèle, comme
          tous les autres. */}
      <p className={styles.calendrier}>
        Avis en novembre sur l’espace professionnel · paiement au 15&nbsp;décembre ·
        acompte de 50&nbsp;% au 15&nbsp;juin si la CFE de l’an passé atteignait{' '}
        <Montant>3&nbsp;000&nbsp;€</Montant>.
      </p>
    </section>
  );
}

/** Ce que le régime veut dire, en une phrase qu'on peut lire sans le code. */
function phrase(regime: RegimeCfe, annee: number): string {
  switch (regime.type) {
    case 'exonere-creation':
      return `Année de création : vous êtes exonéré de CFE pour ${annee}. Pensez en revanche `
        + 'à déposer la déclaration initiale 1447-C avant le 31 décembre — c’est elle qui '
        + 'établit votre base, et l’omettre fait perdre l’exonération de première année.';
    case 'base-reduite-moitie':
      return 'Première année d’imposition : votre base est réduite de moitié. La CFE est '
        + 'due, pour un montant deux fois moindre.';
    case 'sous-le-seuil-de-cotisation-minimum':
      return `Vos recettes de ${annee - 2} ne dépassent pas ${eur(CA_SANS_COTISATION_MINIMUM)} : `
        + 'la cotisation minimum n’est pas due. C’est un seuil, pas un abattement — un euro '
        + 'au-dessus et elle le redevient en entier.';
    case 'droit-commun':
      return 'Régime de droit commun : base minimum fixée par votre commune, multipliée par '
        + 'son taux.';
  }
}

/** Une saisie vide n'est pas zéro : elle veut dire « je n'ai rien dit ». */
function nombreOuNull(saisie: string): number | null {
  if (saisie.trim() === '') return null;
  const n = Number(saisie.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
