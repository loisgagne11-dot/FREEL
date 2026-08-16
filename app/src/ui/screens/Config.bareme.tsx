import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { periodesUrssafEffectives } from '../../state/selecteurs';
import { PERIODES_URSSAF, type PeriodeBareme } from '../../domain/bareme/urssaf';
import { dateISO, mois, ratio } from '../../domain/types';
import { Info } from '../components/Info';
import { Champ } from '../components/Champ';
import { dateCourte } from '../format';
import styles from './Config.module.css';

/**
 * La section Barème de l'écran Config, chargée à la demande.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE VIT DANS SON PROPRE FICHIER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Config a franchi son plafond de 40 Ko en recevant les deux réglages de
 * prudence, partis du Pilote qui franchissait le sien. La règle du projet est
 * d'EXTRAIRE ce qui n'a pas à voyager avec le reste, jamais de relever le
 * plafond — et le barème est le bon candidat : c'est la plus grosse section de
 * l'écran, elle est autonome, et on l'ouvre quand un taux officiel change,
 * c'est-à-dire une fois ou deux par an.
 *
 * Ce qu'elle garantit ne change pas :
 *   · une période s'AJOUTE, elle ne réécrit pas le passé ;
 *   · elle porte sa source et sa date de vérification, comme celles livrées
 *     avec le code ;
 *   · la table affichée est celle **réellement appliquée** par les calculs, et
 *     non une copie qui pourrait en diverger.
 */

/** Lit un pourcentage saisi, virgule comprise. `null` si ce n'en est pas un. */
function enRatio(saisie: string): number | null {
  const n = Number.parseFloat(saisie.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n / 100 : null;
}

/** Rend un ratio en pourcentage lisible : 0,212 → « 21,2 % ». */
function pourcent(r: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(r * 100)} %`;
}

/* ─────────────────────────────────────────────────────────────────────────
   Barème
   ───────────────────────────────────────────────────────────────────────── */

export function Bareme() {
  const faits = useFaits((e) => e.faits);
  const ajouter = useFaits((e) => e.ajouterPeriodeUrssaf);
  const retirer = useFaits((e) => e.retirerPeriodeUrssaf);
  const idChamp = useId();

  const effectives = useMemo(() => periodesUrssafEffectives(faits), [faits]);
  const ajouteesParDebut = useMemo(
    () => new Set(faits.periodesUrssafAjoutees.map((p) => p.du)),
    [faits.periodesUrssafAjoutees]
  );

  return (
    <>
      <section className={styles.carte} aria-labelledby={`${idChamp}-table`}>
        <h2 id={`${idChamp}-table`} className={styles.titreCarte}>
          Cotisations sociales, par période
          <Info libelle="Pourquoi par période et non par année">
            Le taux applicable aux BNC a augmenté au 1<sup>er</sup> juillet
            2024, puis de nouveau au 1<sup>er</sup> juillet 2026. Une table par
            année civile appliquerait un taux unique à des mois relevant de deux
            barèmes&nbsp;: c’est le défaut qui faisait calculer juillet 2026 à
            25,6 % au lieu de 26,1 %.
          </Info>
        </h2>

        <p className={styles.explication}>
          Cette table est celle que les calculs appliquent réellement. Un taux
          d’un mois écoulé est un fait&nbsp;: il ne s’extrapole pas, et une
          période close ne se réécrit pas.
        </p>

        <div className={styles.tableDefilante}>
          <table className={styles.table}>
            <caption className={styles.legende}>
              Taux de cotisations en vigueur, par période et par type d’activité
            </caption>
            <thead>
              <tr>
                <th scope="col">Période</th>
                <th scope="col">BNC</th>
                <th scope="col">BIC service</th>
                <th scope="col">BIC vente</th>
                <th scope="col">Source</th>
                <th scope="col">Vérifié le</th>
                <th scope="col"><span className={styles.invisible}>Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {effectives.map((p) => (
                <tr key={p.du}>
                  <th scope="row">
                    {p.du} → {p.au ?? 'en cours'}
                    {ajouteesParDebut.has(p.du) && (
                      <span className={styles.marque}>saisie</span>
                    )}
                  </th>
                  <td>{pourcent(p.taux.BNC)}</td>
                  <td>{pourcent(p.taux.BIC_service)}</td>
                  <td>{pourcent(p.taux.BIC_vente)}</td>
                  <td className={styles.source}>{p.source}</td>
                  <td>{dateCourte(p.verifieLe)}</td>
                  <td>
                    {ajouteesParDebut.has(p.du) && (
                      <button
                        type="button"
                        className={styles.action}
                        onClick={() => retirer(p.du)}
                      >
                        Retirer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {faits.periodesUrssafAjoutees.length > 0 && (
          <p className={styles.explication}>
            Retirer une période saisie rend la main au barème livré avec
            l’application pour les mois qu’elle couvrait.
          </p>
        )}
      </section>

      <FormulairePeriode
        onAjouter={ajouter}
        derniere={effectives[effectives.length - 1] ?? PERIODES_URSSAF[0]}
      />
    </>
  );
}

/**
 * Saisie d'une nouvelle période.
 *
 * Le formulaire ne décide de rien : il assemble une période et la soumet au
 * magasin, qui la fait valider par le domaine. Le motif du refus est affiché
 * tel quel — il dit ce qui ne va pas, ce qu'un « saisie invalide » ne fait pas.
 */
function FormulairePeriode(
  { onAjouter, derniere }: {
    onAjouter: (p: PeriodeBareme) => string | null;
    derniere: PeriodeBareme | undefined;
  }
) {
  const idChamp = useId();
  const [du, setDu] = useState('');
  const [bnc, setBnc] = useState('');
  const [bicService, setBicService] = useState('');
  const [bicVente, setBicVente] = useState('');
  const [source, setSource] = useState('');
  const [retour, setRetour] = useState<{ ton: 'succes' | 'echec'; texte: string } | null>(null);

  function soumettre(evenement: React.FormEvent): void {
    evenement.preventDefault();

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(du)) {
      setRetour({ ton: 'echec', texte: 'Indiquez le mois où la période commence.' });
      return;
    }
    const taux = [bnc, bicService, bicVente].map(enRatio);
    if (taux.some((t) => t === null)) {
      setRetour({
        ton: 'echec',
        texte: 'Les trois taux sont attendus en pourcentage, par exemple 27,2.'
      });
      return;
    }

    const refus = onAjouter({
      du: mois(du),
      // La période nouvelle reste ouverte ; la fusion ferme la précédente.
      au: null,
      taux: {
        BNC: ratio(taux[0] as number),
        BIC_service: ratio(taux[1] as number),
        BIC_vente: ratio(taux[2] as number)
      },
      source: source.trim(),
      // La date de vérification est celle de la saisie : c'est le jour où un
      // humain a lu la valeur à sa source.
      verifieLe: dateISO(new Date().toISOString().slice(0, 10))
    });

    if (refus !== null) {
      setRetour({ ton: 'echec', texte: refus });
      return;
    }
    setRetour({ ton: 'succes', texte: `Période ajoutée à partir de ${du}.` });
    setDu(''); setBnc(''); setBicService(''); setBicVente(''); setSource('');
  }

  return (
    <section className={styles.carte} aria-labelledby={`${idChamp}-ajout`}>
      <h2 id={`${idChamp}-ajout`} className={styles.titreCarte}>
        Ajouter une période
        <Info libelle="Quand ajouter une période">
          Quand un nouvel avis d’appel ou une publication officielle annonce un
          taux différent. La période ajoutée prend effet au mois indiqué et
          ferme la précédente&nbsp;; rien avant ce mois n’est modifié, pour que
          le recalcul d’un trimestre passé redonne le montant réellement déclaré
          à l’époque.
        </Info>
      </h2>

      {derniere !== undefined && (
        <p className={styles.explication}>
          Dernière période connue&nbsp;: à partir de {derniere.du},{' '}
          {pourcent(derniere.taux.BNC)} en BNC, d’après {derniere.source},
          vérifié le {dateCourte(derniere.verifieLe)}.
        </p>
      )}

      <form className={styles.formulaire} onSubmit={soumettre}>
        <Champ id={`${idChamp}-du`} libelle="À partir du mois">
          <input id={`${idChamp}-du`} type="month" value={du}
            onChange={(e) => setDu(e.target.value)} required />
        </Champ>

        <Champ id={`${idChamp}-bnc`} libelle="Taux BNC (%)">
          <input id={`${idChamp}-bnc`} inputMode="decimal" value={bnc}
            onChange={(e) => setBnc(e.target.value)} required />
        </Champ>

        <Champ id={`${idChamp}-bic-service`} libelle="Taux BIC service (%)">
          <input id={`${idChamp}-bic-service`} inputMode="decimal" value={bicService}
            onChange={(e) => setBicService(e.target.value)} required />
        </Champ>

        <Champ id={`${idChamp}-bic-vente`} libelle="Taux BIC vente (%)">
          <input id={`${idChamp}-bic-vente`} inputMode="decimal" value={bicVente}
            onChange={(e) => setBicVente(e.target.value)} required />
        </Champ>

        <Champ
          id={`${idChamp}-source`}
          libelle="Source"
          aide="D’où vient ce taux ? Par exemple : avis d’appel du 12/01/2027."
        >
          <input id={`${idChamp}-source`} value={source}
            onChange={(e) => setSource(e.target.value)} required />
        </Champ>

        {retour !== null && (
          <p
            role={retour.ton === 'echec' ? 'alert' : 'status'}
            className={retour.ton === 'echec' ? styles.echec : styles.succes}
          >
            {retour.texte}
          </p>
        )}

        <button type="submit" className={styles.actionPrincipale}>
          Ajouter la période
        </button>
      </form>
    </section>
  );
}

