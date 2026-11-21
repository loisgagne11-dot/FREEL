import { Suspense, useMemo } from 'react';
import { composantALaDemande } from '../composantALaDemande';
import { useFaits } from '../../state/store';
import { etatArgent, type EtatArgent } from '../../state/selecteurs.argent';
import { detailDeLaDette } from '../../state/selecteurs.dette';
import type { LigneDuDu } from '../../state/selecteurs.tresorerie';
import { enveloppesDeProvision } from '../../domain/calculs/enveloppes';
import { LIBELLE_NATURE } from '../../domain/calculs/provisions';
import { LIBELLE_IGNORE_IR } from '../../domain/calculs/provisionImpotRevenu.libelles';
import type { DateISO } from '../../domain/types';
import { PanneauDetailDette } from '../components/DetailDette';
import { Info } from '../components/Info';
import { Montant } from '../components/Montant';
import { eur, pct } from '../format';
import { jourEtMoisLong } from './Tresorerie.lecture';
import tr from './Tresorerie.module.css';

/**
 * La provision d'impôt, mois par mois — repliée sous la note d'impôt : une
 * question de fin de mois, pas celle qu'on pose en ouvrant l'écran.
 */
const ImpotMoisParMois = composantALaDemande(() => import('../components/ImpotMoisParMois')
  .then((m) => m.ImpotMoisParMois), false);

/**
 * Le détail d'une ligne de « Ce qui est dû », ouvert au clic — ce que les
 * enveloppes d'avant montraient, et que la ligne ne montre plus.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS RÉPONSES QU'UN TOTAL NE DONNE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  · les deux volets du dû — ce qui est appelé, ce qui naît d'encaissements
 *    pas encore déclarés : une fois la période déclarée, le second bascule
 *    dans le premier ;
 *  · ce que le solde COUVRE de cette charge, la plus proche servie d'abord —
 *    c'est ce qui se passera le jour du prélèvement : sur un compte
 *    insuffisant, on voit laquelle ne passera pas ;
 *  · d'où sort le montant, mois par mois, avec le geste qui le fait avancer
 *    (`PanneauDetailDette`) — le seul moyen de le vérifier contre l'avis reçu.
 */
export function DetailDeLaLigne({ ligne, aujourdhui }: { readonly ligne: LigneDuDu; readonly aujourdhui: DateISO }) {
  const faits = useFaits((e) => e.faits);
  const etat = useMemo(() => etatArgent(faits, faits.echeances, new Date()), [faits]);
  const enveloppes = enveloppesDeProvision(etat.tresorerie.solde, etat.provisionsParNature, faits.echeances)
    .filter((e) => ligne.natures.includes(e.nature));
  const du = enveloppes.reduce((t, e) => t + e.du, 0);
  const couvert = enveloppes.reduce((t, e) => t + e.couvert, 0);

  return (
    <>
      <dl className={tr.volets}>
        <div><dt>Échéances émises, à payer</dt><dd><Montant>{eur(etat.voletConstate)}</Montant></dd></div>
        <div><dt>Charges sur recettes encaissées non déclarées</dt><dd><Montant>{eur(etat.voletAProvisionner)}</Montant></dd></div>
        <div className={tr.totalVolets}><dt>Tout ce qui est dû</dt><dd><Montant>{eur(etat.tresorerie.provisions)}</Montant></dd></div>
      </dl>

      <p className={tr.indication}>
        Couvert par le solde&nbsp;: <Montant>{eur(couvert)}</Montant> sur <Montant>{eur(du)}</Montant>
        {ligne.prochaine !== null && !ligne.prochaine.startsWith('9999')
          && <> · prochaine sortie le {jourEtMoisLong(ligne.prochaine, aujourdhui)}</>}
        <Info libelle="Ce que « couvert » veut dire">
          Aucun euro du compte n’est <em>affecté</em> à une charge&nbsp;: l’argent est fongible. Le solde
          est réparti dans l’ordre des échéances, <strong>la plus proche servie d’abord</strong> — c’est
          ce qui se passera le jour du prélèvement. Sur un compte insuffisant, on voit laquelle ne passera
          pas.
        </Info>
      </p>

      {ligne.cle === 'impot' && <NoteImpotRevenu etat={etat} />}

      {enveloppes.filter((e) => e.du > 0).map((e) => (
        <div key={e.nature}>
          {enveloppes.length > 1 && <h3 className={tr.titreCarte}>{LIBELLE_NATURE[e.nature]}</h3>}
          <PanneauDetailDette detail={detailDeLaDette(faits, e.nature)} />
        </div>
      ))}
      {du <= 0 && <p className={tr.vide}>Rien n’est dû sur cette ligne aujourd’hui.</p>}
    </>
  );
}

/**
 * Ce que recouvre la ligne « impôt sur le revenu », et ce qu'elle ignore. Un
 * montant d'impôt repose sur des faits que l'utilisateur seul connaît — ses
 * parts, les revenus de son foyer — et sur un barème : présenté sans ses
 * réserves, il se lit « voilà ce que je dois », et on décide dessus. Refusé,
 * il laisse la ligne à zéro : la note dit pourquoi.
 */
function NoteImpotRevenu({ etat }: { readonly etat: EtatArgent }) {
  const provision = etat.provisionImpotRevenu;
  const solde = etat.soldeImpotPrecedent;
  if (provision === null) {
    return <p className={tr.vide}>Sous le versement libératoire, l’impôt est payé avec chaque déclaration URSSAF.</p>;
  }
  const ligneSolde = solde !== null && solde.statut !== 'refuse' && solde.valeur.resteAProvisionner > 0 && (
    <li>
      <strong>Solde de l’impôt {solde.valeur.annee}&nbsp;: <Montant>{eur(solde.valeur.resteAProvisionner)}</Montant></strong>{' '}
      estimés, prélevés à l’automne {solde.valeur.annee + 1}. Ils restent dans le dû jusqu’à ce que tu saisisses
      l’avis, en échéance «&nbsp;Solde de l’impôt {solde.valeur.annee}&nbsp;».
    </li>
  );
  if (provision.statut === 'refuse') {
    return <ul className={tr.hypotheses}><li><strong>{provision.motif}</strong></li>{ligneSolde}</ul>;
  }
  const p = provision.valeur;
  return (
    <>
      <ul className={tr.hypotheses}>
        <li>
          <strong>Impôt sur le revenu&nbsp;: <Montant>{eur(p.resteAProvisionner)}</Montant></strong> à mettre de
          côté aujourd’hui pour {p.annee} — le taux moyen de l’année projetée
          ({pct(p.impotAnneeProjetee / Math.max(1, p.caProjete))} du chiffre d’affaires) appliqué à ce qui est
          déjà entré. L’année est estimée à <Montant>{eur(p.impotAnneeProjetee)}</Montant> d’impôt sur{' '}
          <Montant>{eur(p.caProjete)}</Montant> de chiffre d’affaires projeté, moins{' '}
          <Montant>{eur(p.acomptesPasSaisis)}</Montant> d’acomptes déjà appelés.
          {p.resteSurEncaissementsAVenir > 0 && (
            <> Il restera <Montant>{eur(p.resteSurEncaissementsAVenir)}</Montant> à mettre de côté sur les
              encaissements à venir.</>
          )}
        </li>
        {ligneSolde}
        {p.ignore.map((r) => <li key={r}>{LIBELLE_IGNORE_IR[r]}</li>)}
      </ul>
      <details>
        <summary className={tr.plus}>L’impôt {p.annee}, mois par mois</summary>
        <Suspense fallback={<p className={tr.vide}>Chargement…</p>}>
          <ImpotMoisParMois />
        </Suspense>
      </details>
    </>
  );
}
