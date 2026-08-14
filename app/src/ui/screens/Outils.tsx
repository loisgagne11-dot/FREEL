import { useMemo, useState } from 'react';
import { euros, mois as moisDe } from '../../domain/types';
import {
  irParTranches, revenuApresAbattement, tauxAbattement, tranchesIR
} from '../../domain/bareme';
import { useFaits } from '../../state/store';
import { moisCourant } from '../../state/selecteurs';
import { Greet } from '../components/Greet';
import { Info } from '../components/Info';
import { Sheet } from '../components/Sheet';
import { eur, eurExact, moisLong, pct } from '../format';
import styles from './Outils.module.css';
import { Montant } from '../components/Montant';
import { ComparateurVl } from '../components/ComparateurVl';
import { CarteCfe } from '../components/CarteCfe';

/**
 * Écran Outils — simulateurs.
 *
 * Cet écran est volontairement le deuxième construit : c'est le moins coûteux,
 * et il met le noyau fiscal à l'épreuve de bout en bout — abattement, tranches,
 * calcul progressif — sur une saisie libre plutôt que sur les seuls faits
 * enregistrés.
 *
 * Comme partout, aucun nombre n'est écrit ici. Et surtout, aucun résultat n'est
 * affiché quand le barème ne couvre pas la période : le type `Resolution` du
 * domaine oblige à traiter ce cas, et l'écran le dit plutôt que d'avancer un
 * chiffre.
 */
export function Outils() {
  const faits = useFaits((e) => e.faits);
  const [caSaisi, setCaSaisi] = useState('');
  const [detailOuvert, setDetailOuvert] = useState(false);

  const m = moisCourant();
  const type = faits.entreprise.typeActivite;

  // Une saisie vide n'est pas zéro : elle veut dire « je n'ai rien dit ».
  const ca = caSaisi.trim() === '' ? null : Number(caSaisi.replace(',', '.'));
  const caValide = ca !== null && Number.isFinite(ca) && ca >= 0;

  const simulation = useMemo(() => {
    if (!caValide) return null;
    const montant = euros(ca);
    const abattement = tauxAbattement(moisDe(m), type);
    const revenu = revenuApresAbattement(montant, moisDe(m), type);
    const tranches = tranchesIR(moisDe(m));

    if (abattement.statut === 'refuse') return { refus: abattement.motif };
    if (revenu.statut === 'refuse') return { refus: revenu.motif };
    if (tranches.statut === 'refuse') return { refus: tranches.motif };

    return {
      abattement,
      revenu: revenu.valeur,
      tranches,
      impot: irParTranches(revenu.valeur, tranches.valeur)
    };
  }, [ca, caValide, m, type]);

  return (
    <>
      <Greet
        titre="Outils"
        sousTitre="Des simulations, jamais des déclarations : rien de ce qui est calculé ici n’est enregistré."
        repere={`Barème de ${moisLong(m)}`}
      />

      {/* Le comparateur AVANT le simulateur : il porte une date limite, le
          simulateur non. Ce qui périme se met devant. Et la CFE juste après :
          elle aussi porte une date — le 15 décembre — mais chaque année. */}
      <ComparateurVl />

      <CarteCfe />

      <section className={styles.carte} aria-labelledby="titre-ir">
        <h2 id="titre-ir" className={styles.titreCarte}>
          Impôt sur le revenu
          <Info libelle="Explication du calcul de l’impôt">
            Le calcul part du chiffre d’affaires encaissé, applique l’abattement
            forfaitaire du régime micro, puis le barème progressif tranche par
            tranche. Il ne tient pas compte de vos autres revenus ni de votre
            nombre de parts : c’est un ordre de grandeur, pas une déclaration.
          </Info>
        </h2>

        <label className={styles.champ}>
          <span className={styles.libelleChamp}>Chiffre d’affaires encaissé sur l’année</span>
          <input
            type="text"
            inputMode="decimal"
            className={styles.saisie}
            value={caSaisi}
            onChange={(e) => setCaSaisi(e.target.value)}
            placeholder="0"
            aria-describedby="aide-ca"
          />
          <span id="aide-ca" className={styles.aideChamp}>
            En euros. Le montant réellement encaissé, pas le montant facturé.
          </span>
        </label>

        {simulation === null && (
          <p className={styles.attente}>
            Saisissez un montant pour voir l’estimation.
          </p>
        )}

        {simulation !== null && 'refus' in simulation && (
          <p className={styles.refus} role="status">
            <strong>Barème indisponible.</strong> {simulation.refus}
          </p>
        )}

        {simulation !== null && !('refus' in simulation) && (
          <>
            <dl className={styles.resultats}>
              <div className={styles.ligne}>
                <dt>Abattement forfaitaire</dt>
                <dd>{pct(simulation.abattement.valeur)}</dd>
              </div>
              <div className={styles.ligne}>
                <dt>Revenu imposable</dt>
                <dd><Montant>{eur(simulation.revenu)}</Montant></dd>
              </div>
              <div className={`${styles.ligne} ${styles.total}`}>
                <dt>Impôt estimé</dt>
                <dd><Montant>{eur(simulation.impot)}</Montant></dd>
              </div>
            </dl>

            {/* Une hypothèse n'est jamais tacite : si les tranches de cette
                période ne sont pas publiées, on le dit ici, à côté du chiffre. */}
            {simulation.tranches.statut === 'hypothese' && (
              <p className={styles.hypothese} role="status">
                Tranches non publiées pour cette période — estimation faite sur
                le dernier barème connu, en vigueur depuis {simulation.tranches.depuis}.
              </p>
            )}

            <button
              type="button"
              className={styles.actionDetail}
              onClick={() => setDetailOuvert(true)}
            >
              Voir le détail par tranche
            </button>
          </>
        )}
      </section>

      <Sheet
        ouvert={detailOuvert}
        titre="Détail par tranche"
        onFermer={() => setDetailOuvert(false)}
      >
        {simulation !== null && !('refus' in simulation) ? (
          <>
            <p className={styles.aideChamp}>
              Chaque tranche ne s’applique qu’à la part du revenu qui la
              dépasse. C’est pourquoi le taux réellement payé reste inférieur au
              taux de la tranche la plus haute atteinte.
            </p>
            {/* Le tableau défile DANS SON CONTENEUR plutôt que d'élargir la
                feuille : quatre colonnes de chiffres ne tiennent pas dans 390 px,
                et les écraser casse les libellés caractère par caractère — le
                défaut que la V1.11 corrigeait précisément sur cet écran. */}
            <div className={styles.tableDefilante}>
            <table className={styles.table}>
              <caption className={styles.legende}>
                Revenu imposable de <Montant>{eur(simulation.revenu)}</Montant>
              </caption>
              <thead>
                <tr>
                  <th scope="col">À partir de</th>
                  <th scope="col">Taux</th>
                  <th scope="col">Part imposée</th>
                  <th scope="col">Impôt</th>
                </tr>
              </thead>
              <tbody>
                {simulation.tranches.valeur.map((tranche, i) => {
                  // `tranches` est déjà restreint à une résolution utilisable
                  // par la garde `!('refus' in simulation)` ci-dessus.
                  const suivante = simulation.tranches.valeur[i + 1];
                  const plafond = suivante?.seuil ?? Infinity;
                  const part = Math.max(0, Math.min(simulation.revenu, plafond) - tranche.seuil);
                  return (
                    <tr key={tranche.seuil} className={part === 0 ? styles.ligneInactive : ''}>
                      <td><Montant>{eur(tranche.seuil)}</Montant></td>
                      <td>{pct(tranche.taux)}</td>
                      <td><Montant>{eur(part)}</Montant></td>
                      <td><Montant>{eurExact(part * tranche.taux)}</Montant></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <p className={styles.source}>
              Source du barème&nbsp;: {simulation.tranches.source}, vérifié le{' '}
              {simulation.tranches.verifieLe}.
            </p>
          </>
        ) : (
          <p className={styles.aideChamp}>Aucune simulation à détailler.</p>
        )}
      </Sheet>
    </>
  );
}
