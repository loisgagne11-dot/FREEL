import { useId, type ReactNode } from 'react';
import { useFaits } from '../../state/store';
import {
  moisCourant, periodesUrssafEffectives, tvaDueDepuisDe
} from '../../state/selecteurs';
import { euros, estUtilisable, mois, moisDe, type Resolution } from '../../domain/types';
import {
  MINIMUM_ABATTEMENT, moisSousAcre, plafondMicro, seuilsTvaPourAnnee,
  tauxAbattement, tauxCfp, tauxCotisations, tauxVersementLiberatoire
} from '../../domain/bareme';
import { dateCourte, eur, moisLong, pct } from '../format';
import { Champ } from '../components/Champ';
import { Bareme } from './Config.bareme';
import styles from './Config.module.css';
import fiscal from './Config.fiscal.module.css';

/**
 * Le foyer fiscal : parts, autres revenus, versement PER.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS FAITS QUI DORMAIENT SANS PORTE D'ENTRÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ils étaient repris de l'ancienne application dans `configImpotBrute` —
 * conservés bruts, jamais interprétés, jamais saisissables. Sans eux, la
 * provision d'impôt sur le revenu ne peut pas se calculer : sous le régime du
 * barème, la ligne « impôt » du volet 2 ne valait donc que la CFP, 0,2 %, et
 * le versable était surévalué de tout l'impôt de l'année.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES CHAMPS RESTENT VIDES, ET C'EST LE POINT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ni « 1 » de parts, ni « 0 » d'autres revenus par défaut : « je n'ai pas
 * renseigné » et « je suis seul » sont deux états différents, et le second se
 * déclare. Un défaut affiché ferait passer pour un résultat un impôt calculé
 * sur un foyer inventé — et l'écart entre une et trois parts va du simple au
 * double.
 *
 * Ils sont rangés avec les paramètres fiscaux et non dans le profil : c'est la
 * seule chose que ces trois faits servent à calculer, et le handoff les y met.
 */
function FoyerFiscal() {
  const faits = useFaits((e) => e.faits);
  const definir = useFaits((e) => e.definirFoyerFiscal);
  const idChamp = useId();

  const nombreOuNull = (valeur: string): number | null =>
    valeur === '' ? null : (Number(valeur) || 0);

  return (
    <div className={styles.carte}>
    <div className={styles.formulaire}>
      <Champ
        id={`${idChamp}-parts`}
        libelle="Parts fiscales du foyer"
        aide="Le quotient familial de ton avis d’imposition. Tant qu’il est vide,
              l’impôt sur le revenu n’est pas provisionné — et l’application le dit
              plutôt que d’en supposer une."
      >
        <input
          id={`${idChamp}-parts`}
          type="number"
          inputMode="decimal"
          step="0.25"
          min="0.5"
          placeholder="Non renseigné"
          value={faits.partsFiscales ?? ''}
          onChange={(e) => definir({ partsFiscales: nombreOuNull(e.target.value) })}
        />
      </Champ>

      <Champ
        id={`${idChamp}-commune`}
        libelle="Situation du foyer"
        aide="Elle fixe le plafond de la décote, qui allège l’impôt des foyers
              modestes. Les parts ne la disent pas : un parent isolé en a deux,
              comme un couple."
      >
        <select
          id={`${idChamp}-commune`}
          value={faits.impositionCommune === null ? '' : faits.impositionCommune ? 'commune' : 'seul'}
          onChange={(e) => definir({
            impositionCommune: e.target.value === '' ? null : e.target.value === 'commune'
          })}
        >
          <option value="">Non renseignée</option>
          <option value="seul">Seul·e — célibataire, divorcé·e, veuf·ve</option>
          <option value="commune">Marié·e ou pacsé·e</option>
        </select>
      </Champ>

      <Champ
        id={`${idChamp}-autres`}
        libelle="Autres revenus imposables du foyer, sur l’année"
        aide="Salaires du conjoint, revenus fonciers… hors micro-entreprise. Ils
              déterminent la tranche où ton résultat vient s’empiler : les ignorer
              sous-estime l’impôt."
      >
        <input
          id={`${idChamp}-autres`}
          type="number"
          inputMode="decimal"
          step="100"
          min="0"
          placeholder="Non renseignés"
          value={faits.autresRevenusFoyer ?? ''}
          onChange={(e) => {
            const v = nombreOuNull(e.target.value);
            definir({ autresRevenusFoyer: v === null ? null : euros(v) });
          }}
        />
      </Champ>

      <Champ
        id={`${idChamp}-per`}
        libelle="Versement PER déductible, sur l’année"
        aide="Ce que tu verses sur un plan d’épargne retraite, déductible du revenu
              global. Non renseigné, il n’est pas déduit : l’impôt estimé est alors au
              plus haut."
      >
        <input
          id={`${idChamp}-per`}
          type="number"
          inputMode="decimal"
          step="100"
          min="0"
          placeholder="Non renseigné"
          value={faits.versementPerDeductible ?? ''}
          onChange={(e) => {
            const v = nombreOuNull(e.target.value);
            definir({ versementPerDeductible: v === null ? null : euros(v) });
          }}
        />
      </Champ>
    </div>
    </div>
  );
}

/**
 * Le contenu de la section « Paramètres fiscaux » : le régime déclaratif, le
 * foyer, puis la table du barème.
 *
 * Le barème arrive en dernier : c'est la plus longue pièce, et on n'y touche
 * que quand un taux officiel change, alors que la périodicité et le foyer se
 * règlent à l'ouverture du compte.
 */
export function Fiscal() {
  return (
    <>
      <BaremesEnVigueur />
      <Declaration />
      <FoyerFiscal />
      <Bareme />
    </>
  );
}

function Declaration() {
  const entreprise = useFaits((e) => e.faits.entreprise);
  const faits = useFaits((e) => e.faits);
  const modifier = useFaits((e) => e.modifierEntreprise);
  const tvaDue = tvaDueDepuisDe(faits);
  const idChamp = useId();

  return (
    <div className={styles.carte}>
      <div className={styles.formulaire}>
        <div className={fiscal.periodicite}>
          <div>
            <p id={`${idChamp}-periodicite`} className={fiscal.periodiciteTitre}>
              Périodicité des cotisations
            </p>
            <p className={fiscal.aide}>
              Rythme de déclaration URSSAF — elle règle l’échéancier et ce que le
              Pilote te demande de déclarer.
            </p>
          </div>
          <div role="radiogroup" aria-labelledby={`${idChamp}-periodicite`}
            className={fiscal.interrupteur}>
            {([['mensuel', 'Mensuelle'], ['trimestriel', 'Trimestrielle']] as const).map(([valeur, libelle]) => (
              <button key={valeur} type="button" role="radio"
                aria-checked={entreprise.urssafPeriodicite === valeur}
                // Une seule position est dans l'ordre de tabulation, comme un
                // groupe radio natif : les flèches choisissent l'autre.
                tabIndex={entreprise.urssafPeriodicite === valeur ? 0 : -1}
                className={fiscal.position}
                onClick={() => modifier({ urssafPeriodicite: valeur })}
                onKeyDown={(e) => {
                  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                    e.preventDefault();
                    modifier({
                      urssafPeriodicite: valeur === 'mensuel' ? 'trimestriel' : 'mensuel'
                    });
                    const autre = e.currentTarget.parentElement?.querySelector<HTMLElement>(
                      `button:not([aria-checked="true"])`
                    );
                    autre?.focus();
                  }
                }}>
                {libelle}
              </button>
            ))}
          </div>
        </div>

        {/* Le franchissement des seuils se déduit des encaissements : ce champ
            ne sert plus qu'à l'OPTION — choisir la TVA avant d'y être tenu. Il
            décidait seul, et sans lui les factures partaient en franchise
            alors que la TVA était due. */}
        <Champ
          id={`${idChamp}-tva`}
          libelle="Option pour la TVA depuis (facultatif)"
          aide={tvaDue === null
            ? 'Le franchissement des seuils est détecté d’après tes encaissements. Ne renseigne ce mois que si tu as choisi la TVA avant d’y être tenu.'
            : `D’après tes encaissements, la TVA est due depuis ${moisLong(tvaDue)} : tes factures la portent depuis. Ne renseigne ce mois que pour une option antérieure.`}
        >
          <input id={`${idChamp}-tva`} type="month" value={entreprise.tvaDepuis ?? ''}
            onChange={(e) => modifier({
              tvaDepuis: /^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)
                ? mois(e.target.value)
                : null
            })} />
        </Champ>
      </div>
    </div>
  );
}

/** Une valeur du barème, en lecture seule : un fait publié, pas un réglage. */
function ValeurBareme(
  { libelle, resolution, formater, aide }: {
    libelle: string;
    resolution: Resolution<number>;
    formater: (v: number) => string;
    aide: ReactNode;
  }
) {
  return (
    <div className={fiscal.valeur}>
      <dt>{libelle}</dt>
      {/* Un refus se dit : « — » et le motif, jamais un zéro qui passerait
          pour un taux nul. */}
      <dd className={fiscal.chiffre}>
        {estUtilisable(resolution) ? formater(resolution.valeur) : '—'}
      </dd>
      <dd className={fiscal.aide}>
        {resolution.statut === 'refuse' ? resolution.motif : aide}
        {resolution.statut === 'hypothese' ? ' (hypothèse)' : ''}
      </dd>
    </div>
  );
}

/**
 * Les valeurs du barème en vigueur ce mois-ci.
 *
 * Aucun bouton « Mettre à jour » : les barèmes sont dans le code, et un bouton
 * sans effet ferait croire qu'on les rafraîchit depuis une source en ligne.
 * La carte relit les mêmes fonctions que les calculs — une seconde lecture
 * du barème finirait par afficher un taux que l'application n'applique pas.
 */
function BaremesEnVigueur() {
  const faits = useFaits((e) => e.faits);
  const { typeActivite, debutActivite, acre, versementLiberatoire } = faits.entreprise;
  const courant = moisCourant();
  const periodes = periodesUrssafEffectives(faits);

  const sousAcre = acre && debutActivite !== null
    && moisSousAcre(moisDe(debutActivite), courant);
  const tauxPlein = tauxCotisations(courant, typeActivite, false, periodes, debutActivite);
  const tauxEffectif = sousAcre
    ? tauxCotisations(courant, typeActivite, true, periodes, debutActivite)
    : tauxPlein;

  const abattement = tauxAbattement(courant, typeActivite);
  const plafond = plafondMicro(courant, typeActivite, debutActivite);
  const plafondPlein = plafondMicro(courant, typeActivite, null);
  const proratise = estUtilisable(plafond) && estUtilisable(plafondPlein)
    && plafond.valeur !== plafondPlein.valeur;
  const seuils = seuilsTvaPourAnnee(Number(courant.slice(0, 4)), typeActivite, debutActivite);
  const franchise: Resolution<number> = estUtilisable(seuils)
    ? { ...seuils, valeur: seuils.valeur.franchise }
    : seuils;

  const verifieLe = estUtilisable(tauxPlein) ? tauxPlein.verifieLe : null;

  return (
    <section className={fiscal.baremes} aria-labelledby="baremes-vigueur">
      <header className={fiscal.bandeau}>
        <h3 id="baremes-vigueur" className={fiscal.bandeauTitre}>
          Barèmes {courant.slice(0, 4)} en vigueur
        </h3>
        <p className={fiscal.aide}>
          Abattement, cotisations, plafonds, seuil TVA — tirés des textes publiés,
          sources dans la table des cotisations ci-dessous.
          {verifieLe !== null && ` Vérifiés le ${dateCourte(verifieLe)}.`}
        </p>
      </header>
      <dl className={fiscal.grille}>
        <ValeurBareme libelle="Abattement forfaitaire" resolution={abattement}
          formater={pct}
          aide={`${estUtilisable(abattement) ? pct(abattement.valeur) : ''} du chiffre d’affaires, minimum ${eur(MINIMUM_ABATTEMENT)}. Le reste est ta base imposable.`} />
        <ValeurBareme libelle="Taux de cotisations" resolution={tauxEffectif}
          formater={pct}
          aide={sousAcre && estUtilisable(tauxPlein) && estUtilisable(tauxEffectif)
            ? `Taux plein ${pct(tauxPlein.valeur)} → ${pct(tauxEffectif.valeur)} avec l’ACRE`
            : 'Taux plein, hors ACRE'} />
        <ValeurBareme libelle="Versement libératoire"
          resolution={tauxVersementLiberatoire(courant, typeActivite)} formater={pct}
          aide={versementLiberatoire
            ? 'Tu as opté : prélevé à chaque déclaration'
            : 'Seulement si tu as opté (Profil & statut)'} />
        <ValeurBareme libelle="Formation professionnelle (CFP)"
          resolution={tauxCfp(courant, typeActivite)} formater={pct}
          aide="Contribution due avec les cotisations." />
        <ValeurBareme libelle="Plafond micro" resolution={plafond} formater={eur}
          aide={proratise
            ? 'Proratisé sur ta première année d’activité'
            : 'Chiffre d’affaires annuel à ne pas dépasser.'} />
        <ValeurBareme libelle="Seuil de franchise de TVA" resolution={franchise}
          formater={eur}
          aide="Au-delà, la TVA s’applique ; l’application te prévient en approchant." />
      </dl>
    </section>
  );
}
