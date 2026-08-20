import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { caEncaisseAnnee, moisCourant } from '../../state/selecteurs';
import { comparerRegimes } from '../../domain/calculs/comparateurVl';
import { euros, mois as moisDe } from '../../domain/types';
import { Info } from './Info';
import { Montant } from './Montant';
import { eur, pct } from '../format';
import styles from './ComparateurVl.module.css';

/**
 * Versement libératoire ou barème progressif ?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE SEUL ÉCRAN DU PROJET QUI A UNE DATE LIMITE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'option s'exerce avant le **30 septembre** de l'année N pour s'appliquer à
 * l'année N+1. Passée cette date, le choix est fait pour douze mois, quoi
 * qu'on découvre ensuite. C'est la raison d'être de cet écran : mettre les
 * deux montants côte à côte pendant qu'il est encore temps.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LE RÉSULTAT SURPREND
 * ─────────────────────────────────────────────────────────────────────────
 *
 * On croit volontiers que le versement libératoire est « pour les gros
 * revenus ». C'est l'inverse en bas de l'échelle : il se paie dès le premier
 * euro, quand le barème ne réclame encore rien. Puis il devient vite gagnant,
 * parce que 2,2 % du chiffre d'affaires reste très inférieur à la première
 * tranche imposable.
 *
 * D'où l'importance des DEUX champs du foyer. Comparer sans eux reviendrait à
 * calculer l'impôt comme si l'activité était le seul revenu du ménage — et à
 * conclure presque toujours en faveur du barème.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE DIT PAS, ET QUI EST ÉCRIT À L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'éligibilité — l'option n'est ouverte que sous un plafond de revenu fiscal
 * de référence — n'est pas vérifiée : ce plafond est un nombre officiel daté
 * que l'application ne porte pas, et l'invariant n°1 interdit de l'écrire au
 * jugé. L'écran rend l'arithmétique, jamais le droit d'opter.
 *
 * Trois simplifications sont dites, avec le SENS de chaque écart : sans elles,
 * un résultat serré se lirait comme un verdict.
 */
export function ComparateurVl() {
  const faits = useFaits((e) => e.faits);
  const id = useId();

  const m = moisCourant();
  const annee = Number(m.slice(0, 4));
  const caReel = caEncaisseAnnee(faits, annee);

  // Prérempli avec le CA encaissé de l'année, mais modifiable : la décision
  // porte sur l'année PROCHAINE, et personne ne fera exactement le même
  // chiffre. Le vrai chiffre sert de point de départ, pas de contrainte.
  const [caSaisi, setCaSaisi] = useState(() => (caReel > 0 ? String(Math.round(caReel)) : ''));
  const [parts, setParts] = useState('1');
  const [autres, setAutres] = useState('0');

  const ca = Number(caSaisi.replace(',', '.'));
  const caValide = caSaisi.trim() !== '' && Number.isFinite(ca) && ca >= 0;

  const resultat = useMemo(() => {
    if (!caValide) return null;
    const p = Number(parts.replace(',', '.'));
    const a = Number(autres.replace(',', '.'));
    return comparerRegimes(euros(ca), moisDe(m), faits.entreprise.typeActivite, {
      parts: Number.isFinite(p) && p > 0 ? p : 1,
      autresRevenus: euros(Number.isFinite(a) && a > 0 ? a : 0)
    });
  }, [ca, caValide, parts, autres, m, faits.entreprise.typeActivite]);

  return (
    <section className={styles.carte} aria-labelledby={`${id}-titre`}>
      <h2 id={`${id}-titre`} className={styles.titreCarte}>
        Versement libératoire ou barème&nbsp;?
        <Info libelle="Ce que compare cet outil">
          Le versement libératoire est un pourcentage du chiffre
          d’affaires&nbsp;: il se paie même sans bénéfice, et ignore ton
          foyer. Le barème s’applique au revenu après abattement, dans un foyer
          qui a ses propres revenus et ses propres parts. On ne peut donc pas
          les comparer directement — on mesure ce que l’activité AJOUTE à
          l’impôt du foyer, et c’est ce surcroît qui se compare aux 2,2&nbsp;%.
        </Info>
      </h2>

      <p className={styles.echeance} role="note">
        L’option s’exerce <strong>avant le 30 septembre</strong> de cette année
        pour s’appliquer à l’année prochaine. Passée cette date, le choix vaut
        douze mois.
      </p>

      <div className={styles.champs}>
        <p className={styles.champ}>
          <label className={styles.libelle} htmlFor={`${id}-ca`}>
            Chiffre d’affaires annuel attendu (€)
          </label>
          <input
            id={`${id}-ca`}
            inputMode="decimal"
            className={styles.saisie}
            value={caSaisi}
            onChange={(e) => setCaSaisi(e.target.value)}
            aria-describedby={`${id}-ca-aide`}
          />
          <span id={`${id}-ca-aide`} className={styles.aide}>
            {caReel > 0
              ? <>Prérempli avec tes <Montant>{eur(caReel)}</Montant> encaissés
                  en {annee}. La décision porte sur l’année prochaine&nbsp;:
                  ajuste si tu l’attends différente.</>
              : <>Le montant encaissé, pas facturé.</>}
          </span>
        </p>

        <p className={styles.champ}>
          <label className={styles.libelle} htmlFor={`${id}-parts`}>
            Parts du foyer
          </label>
          <input
            id={`${id}-parts`}
            inputMode="decimal"
            className={styles.saisie}
            value={parts}
            onChange={(e) => setParts(e.target.value)}
            aria-describedby={`${id}-parts-aide`}
          />
          <span id={`${id}-parts-aide`} className={styles.aide}>
            1 seul·e, 2 en couple, +0,5 par enfant les deux premiers.
          </span>
        </p>

        <p className={styles.champ}>
          <label className={styles.libelle} htmlFor={`${id}-autres`}>
            Autres revenus imposables du foyer (€)
          </label>
          <input
            id={`${id}-autres`}
            inputMode="decimal"
            className={styles.saisie}
            value={autres}
            onChange={(e) => setAutres(e.target.value)}
            aria-describedby={`${id}-autres-aide`}
          />
          <span id={`${id}-autres-aide`} className={styles.aide}>
            Salaires, revenus fonciers… <strong>C’est le champ qui change
            tout</strong>&nbsp;: il décide de la tranche où le revenu de
            l’activité vient s’empiler. Le laisser à zéro conclut presque
            toujours en faveur du barème.
          </span>
        </p>
      </div>

      {resultat === null && (
        <p className={styles.attente}>Saisissez un chiffre d’affaires pour comparer.</p>
      )}

      {resultat !== null && resultat.statut === 'refuse' && (
        <p className={styles.refus} role="alert">{resultat.motif}</p>
      )}

      {resultat !== null && resultat.statut !== 'refuse' && (
        <>
          <div className={styles.deux}>
            <div
              className={`${styles.option} ${resultat.valeur.avantage === 'versement_liberatoire' ? styles.gagnante : ''}`}
            >
              <span className={styles.optionLibelle}>Versement libératoire</span>
              <strong className={styles.optionMontant}>
                <Montant>{eur(resultat.valeur.versementLiberatoire)}</Montant>
              </strong>
              <span className={styles.optionDetail}>
                {pct(resultat.valeur.tauxVl)} du chiffre d’affaires
              </span>
            </div>

            <div
              className={`${styles.option} ${resultat.valeur.avantage === 'bareme' ? styles.gagnante : ''}`}
            >
              <span className={styles.optionLibelle}>Barème progressif</span>
              <strong className={styles.optionMontant}>
                <Montant>{eur(resultat.valeur.bareme)}</Montant>
              </strong>
              <span className={styles.optionDetail}>
                sur <Montant>{eur(resultat.valeur.revenuApresAbattement)}</Montant> après
                abattement
              </span>
            </div>
          </div>

          <p className={styles.verdict}>
            {resultat.valeur.avantage === null
              ? 'Les deux régimes coûtent la même chose.'
              : (
                <>
                  {resultat.valeur.avantage === 'versement_liberatoire'
                    ? 'Le versement libératoire'
                    : 'Le barème'}
                  {' '}te coûterait{' '}
                  <strong>
                    <Montant>{eur(euros(Math.abs(resultat.valeur.ecart)))}</Montant>
                  </strong>
                  {' '}de moins sur l’année.
                </>
              )}
          </p>

          {resultat.statut === 'hypothese' && (
            <p className={styles.hypothese} role="note">
              Barème non encore publié pour cette période&nbsp;: le calcul
              reconduit le dernier connu ({resultat.source}).
            </p>
          )}
        </>
      )}

      <details className={styles.limites}>
        <summary>Ce que ce calcul ne dit pas</summary>
        <ul>
          <li>
            <strong>L’éligibilité n’est pas vérifiée.</strong> L’option n’est
            ouverte que si le revenu fiscal de référence du foyer, deux ans plus
            tôt, ne dépasse pas un plafond. Ce plafond est un nombre officiel
            que l’application ne porte pas&nbsp;: à vérifier avant de décider.
          </li>
          <li>
            <strong>Pas de décote</strong>, qui allège l’impôt des revenus
            modestes. Le barème est donc <em>surestimé</em> en bas de l’échelle,
            à son désavantage.
          </li>
          <li>
            <strong>Pas de plafonnement du quotient familial</strong>, qui le
            renchérit pour les foyers aisés à plusieurs parts. Le barème est
            donc <em>sous-estimé</em> en haut.
          </li>
          <li>
            Aucune réduction ni crédit d’impôt.
          </li>
        </ul>
        <p>
          Les deux premiers écarts jouent en sens contraire&nbsp;: un résultat
          serré ne se tranche pas sur ces chiffres seuls. Le simulateur officiel
          de l’administration fiscale reste l’arbitre.
        </p>
      </details>
    </section>
  );
}
