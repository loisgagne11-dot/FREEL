import { Suspense, useEffect, useId, useState } from 'react';
import { adresseCourante, sousRouteSiEcran, composantALaDemande } from '../composantALaDemande';
import { useFaits } from '../../state/store';
import { finAcreDe } from '../../state/selecteurs.reglages';
import { finDuMois } from '../../domain/calculs/periode';
import { dateISO, type Mois, type TypeActivite } from '../../domain/types';
import { exonerationAcre, tauxVersementLiberatoire } from '../../domain/bareme';
import {
  type DepuisQuand, changerOptionVl, prochainChangementVl
} from '../../domain/calculs/optionVl.changement';
import { moisCourant } from '../../state/selecteurs';
import { moisLong, pct } from '../format';
import { BlocConfirmation } from '../components/ConfirmationSurPlace';
import { Greet } from '../components/Greet';
import { Info } from '../components/Info';
import { controlerSiret } from '../../domain/calculs/identifiants';
import { useRoute } from '../useRoute';
import { Champ } from '../components/Champ';
import styles from './Config.module.css';

/**
 * Écran Réglages — en sept sections. Le fichier garde son nom d'avant le
 * lot 51, comme ses sections (`Config.fiscal`, `Config.reserve`…) : renommer
 * vingt fichiers n'apprendrait rien à personne.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LA PLUPART DES SECTIONS SONT DANS D'AUTRES FICHIERS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Config était à 39,05 / 40 Ko avant que la liste des sections n'arrive. Le
 * plafond ne se relève pas : chaque section hors Profil part dans son module,
 * chargé quand on l'ouvre. Profil reste ici parce que c'est celle qu'on voit
 * à l'ouverture — la charger à la demande ferait attendre l'écran sur son
 * propre contenu par défaut.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉCRAN QUI REND LE BARÈME MAINTENABLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les taux officiels changent, et l'application ne peut pas être redéployée à
 * chaque publication. Sans porte d'entrée, deux issues, toutes deux mauvaises :
 * un taux périmé appliqué indéfiniment, ou une alerte de fraîcheur qui bloque
 * les déclarations sans que personne puisse la lever. La section « Paramètres
 * fiscaux » ouvre cette porte : une période s'AJOUTE, elle ne réécrit pas le
 * passé, et la table affichée est celle réellement appliquée par les calculs.
 *
 * La section « Propositions Claude Code » de l'ancienne version a été retirée
 * (décision D5) : elle proposait des actions que rien ne rattachait aux faits.
 */

type Section = 'profil' | 'fiscal' | 'reserve' | 'facturation' | 'compte' | 'donnees' | 'affichage';

const Fiscal = composantALaDemande(() => import('./Config.fiscal')
  .then((m) => m.Fiscal), false);
const Reserve = composantALaDemande(() => import('./Config.reserve')
  .then((m) => m.Reserve), false);
const Facturation = composantALaDemande(() => import('./Config.facturation')
  .then((m) => m.Facturation), false);
const Donnees = composantALaDemande(() => import('./Config.donnees')
  .then((m) => m.Donnees), false);
// Le compte en ligne aussi : c'est l'écran le plus lourd après le barème, on
// ne l'ouvre que pour synchroniser (invariant n°7 : on extrait).
const Compte = composantALaDemande(() => import('./Compte')
  .then((m) => m.Compte), false);
// Le thème et le masquage des montants (lot 51, décision 4) : réglés une fois,
// ils n'ont rien à faire dans ce que télécharge chaque ouverture des Réglages.
const Affichage = composantALaDemande(() => import('./Config.affichage')
  .then((m) => m.Affichage), false);

const TYPES_ACTIVITE: readonly { readonly id: TypeActivite; readonly libelle: string }[] = [
  { id: 'BNC', libelle: 'BNC — prestations libérales' },
  { id: 'BIC_service', libelle: 'BIC — prestations de services' },
  { id: 'BIC_vente', libelle: 'BIC — vente de marchandises' }
];

/** Tracés d'icônes simples, sur une grille de 16 : aucune bibliothèque d'icônes. */
const ICONES: Record<Section, string> = {
  profil: 'M4 2h8v12H4zM6 5h4M6 8h4M6 11h2',
  fiscal: 'M3 13L13 3M5 5.5a1 1 0 100-.01M11 11.5a1 1 0 100-.01',
  reserve: 'M2.5 4h11v9h-11zM2.5 7h11M10 10h2',
  facturation: 'M4 2h6l3 3v9H4zM10 2v3h3',
  compte: 'M4.5 12a3 3 0 01.3-6A4 4 0 0112 7a2.5 2.5 0 01-.5 5z',
  donnees: 'M8 2v8M5 7l3 3 3-3M3 13h10',
  affichage: 'M8 2.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM8 2.5v11'
};

export function Config() {
  const faits = useFaits((e) => e.faits);
  const entreprise = faits.entreprise;
  /**
   * La section ouverte vit dans l'adresse : `#/reglages/compte` ouvre le compte,
   * c'est la destination de la pastille Cloud de la barre du haut, qui annonce
   * une session expirée — l'y envoyer sur « Profil » lui ferait chercher où se
   * reconnecter. Et un rechargement doit retomber sur la même section.
   *
   * L'état local suit l'adresse, et non l'inverse : `hashchange` arrive après
   * le clic, et la section ne doit pas attendre l'événement pour s'afficher.
   * Monté seul (les tests), l'écran ne lit pas l'adresse d'un autre écran.
   */
  const { ecran, sousRoute, naviguerVers } = useRoute();
  const routeIci = ecran.id === 'reglages' ? sousRoute : '';
  const depuisAdresse = (r: string): Section =>
    (SECTIONS.some((x) => x.id === r) ? r : 'profil') as Section;
  const [section, setSection] = useState<Section>(() => depuisAdresse(routeIci));
  useEffect(() => { setSection(depuisAdresse(routeIci)); }, [routeIci]);
  const idTitre = useId();

  function ouvrir(cible: Section): void {
    setSection(cible);
    naviguerVers('reglages', cible);
  }

  // Dérivé des faits, jamais stocké : le sous-titre ne peut pas mentir sur le
  // régime puisqu'il est recalculé à chaque rendu.
  const sousTitreProfil = [
    entreprise.typeActivite === 'BNC' ? 'Micro-BNC' : 'Micro-BIC',
    entreprise.typeActivite === 'BNC' && entreprise.caisseRetraite === 'cipav' ? 'Cipav' : null,
    entreprise.acre ? 'ACRE' : null,
    entreprise.siret.trim() === '' ? 'SIRET à saisir' : 'SIRET'
  ].filter((x) => x !== null).join(' · ');

  const entrees: readonly { id: Section; titre: string; sousTitre: string }[] = [
    { id: 'profil', titre: 'Profil & statut', sousTitre: sousTitreProfil },
    { id: 'fiscal', titre: 'Paramètres fiscaux', sousTitre: 'Abattement, cotisations, TVA' },
    { id: 'reserve', titre: 'Réserve & versements', sousTitre: 'Solde, réserve, part gardée' },
    { id: 'facturation', titre: 'Facturation', sousTitre: 'RIB, mentions, plateforme agréée' },
    { id: 'compte', titre: 'Compte & synchronisation', sousTitre: 'Multi-appareils · pièces' },
    { id: 'donnees', titre: 'Données & export', sousTitre: 'Livre CSV, sauvegarde, restauration' },
    { id: 'affichage', titre: 'Affichage', sousTitre: 'Thème, montants masqués' }
  ];
  const courante = entrees.find((x) => x.id === section) ?? entrees[0]!;
  const attente = <p role="status" className={styles.aide}>Chargement…</p>;

  return (
    <>
      <Greet
        titre="Réglages"
        sousTitre="Ton régime, tes barèmes, tes données. Chaque champ s’enregistre à la frappe."
      />

      {/* Liste au-dessus du panneau sur téléphone, plutôt qu'une liste seule
          qui ouvrirait le panneau à part : `#/reglages` doit ouvrir Profil, et
          une page de navigation sans contenu ferait un clic de plus pour le
          réglage le plus courant. Le coût — sept entrées avant le formulaire —
          est celui de la lisibilité ; en grand écran la liste passe à gauche. */}
      <div className={styles.mise}>
        <nav aria-label="Sections des réglages" className={styles.liste}>
          {entrees.map((x) => (
            <button
              key={x.id}
              type="button"
              className={styles.entree}
              aria-current={x.id === section ? 'page' : undefined}
              onClick={() => ouvrir(x.id)}
            >
              <span className={styles.icone} aria-hidden="true">
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none"
                  stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d={ICONES[x.id]} />
                </svg>
              </span>
              <span className={styles.entreeTexte}>
                <span className={styles.entreeTitre}>{x.titre}</span>
                <span className={styles.entreeSousTitre}>{x.sousTitre}</span>
              </span>
              <svg className={styles.chevron} viewBox="0 0 16 16" width="14" height="14" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M6 3l5 5-5 5" />
              </svg>
            </button>
          ))}
        </nav>

        <section className={styles.panneau} aria-labelledby={idTitre}>
          <h2 id={idTitre} className={styles.titrePanneau}>{courante.titre}</h2>
          {/* Une section n'est montée qu'à son ouverture : reprendre une
              session ou lire un barème n'a pas à se produire chaque fois
              qu'on vient régler son profil. */}
          <Suspense fallback={attente}>
            {section === 'profil' && <Profil />}
            {section === 'fiscal' && <Fiscal />}
            {section === 'reserve' && <Reserve />}
            {section === 'facturation' && <Facturation />}
            {section === 'compte' && <Compte />}
            {section === 'donnees' && <Donnees />}
            {section === 'affichage' && <Affichage />}
          </Suspense>
        </section>
      </div>
    </>
  );
}

const SECTIONS: readonly { id: Section }[] = [
  { id: 'profil' }, { id: 'fiscal' }, { id: 'reserve' }, { id: 'facturation' },
  { id: 'compte' }, { id: 'donnees' }, { id: 'affichage' }
];

/* ─────────────────────────────────────────────────────────────────────────
   Profil
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Le profil.
 *
 * Chaque champ écrit directement dans les faits, sans bouton « Enregistrer ».
 * L'ancienne version avait un formulaire à valider, et la moitié des champs
 * n'étaient jamais persistés faute de clic — l'utilisateur croyait avoir
 * renseigné son régime alors que les calculs tournaient encore sur le défaut.
 *
 * L'IBAN, le BIC, la périodicité URSSAF et l'option TVA ont suivi leur
 * section (Facturation, Paramètres fiscaux) : ici ne reste que l'identité et
 * le régime, comme dans le handoff.
 */
function Profil() {
  const entreprise = useFaits((e) => e.faits.entreprise);
  const modifier = useFaits((e) => e.modifierEntreprise);
  const idChamp = useId();
  return (
    <div className={styles.carte}>
      <div className={styles.formulaire}>
        <Champ id={`${idChamp}-nom`} libelle="Nom">
          <input id={`${idChamp}-nom`} value={entreprise.nom}
            onChange={(e) => modifier({ nom: e.target.value })} />
        </Champ>

        <Champ
          id={`${idChamp}-prenom`}
          libelle="Ton prénom"
          aide="Pour te saluer sur le Pilote. Il ne figure sur aucun document."
        >
          <input id={`${idChamp}-prenom`} value={entreprise.prenom} autoComplete="given-name"
            onChange={(e) => modifier({ prenom: e.target.value })} />
        </Champ>

        {/*
          * LE SIRET EST CONTRÔLÉ, PAS SEULEMENT DEMANDÉ.
          *
          * C'est une mention obligatoire de la facture : un numéro erroné vaut
          * mention absente, à 15 € par mention et par facture. Il porte une clé
          * de Luhn — la faute de frappe se voit hors ligne, à la saisie.
          *
          * L'avertissement ne bloque rien : une clé qui ne tombe pas juste dit
          * « improbable », jamais « faux ».
          */}
        <Champ id={`${idChamp}-siret`} libelle="SIRET" controle={controlerSiret(entreprise.siret)}>
          <input id={`${idChamp}-siret`} inputMode="numeric" value={entreprise.siret}
            onChange={(e) => modifier({ siret: e.target.value })} />
        </Champ>

        {/*
          * L'ADRESSE, QUI N'ÉTAIT SAISISSABLE NULLE PART.
          *
          * Elle est une mention obligatoire, `etatFacture` bloque l'émission
          * sans elle, et le message de blocage renvoyait « à renseigner dans
          * Config → Profil » — où le champ n'existait pas. Une entreprise créée
          * dans la nouvelle version ne pouvait donc émettre aucune facture ;
          * seules celles reprises de l'ancienne avaient une adresse.
          */}
        <Champ id={`${idChamp}-adresse`} libelle="Adresse">
          <input id={`${idChamp}-adresse`} autoComplete="street-address"
            value={entreprise.adresse}
            onChange={(e) => modifier({ adresse: e.target.value })} />
        </Champ>

        <Champ id={`${idChamp}-cp`} libelle="Code postal">
          <input id={`${idChamp}-cp`} inputMode="numeric" autoComplete="postal-code"
            value={entreprise.codePostal}
            onChange={(e) => modifier({ codePostal: e.target.value })} />
        </Champ>

        <Champ id={`${idChamp}-ville`} libelle="Ville">
          <input id={`${idChamp}-ville`} autoComplete="address-level2"
            value={entreprise.ville}
            onChange={(e) => modifier({ ville: e.target.value })} />
        </Champ>

        <Champ id={`${idChamp}-debut`} libelle="Début d’activité">
          <input id={`${idChamp}-debut`} type="date" value={entreprise.debutActivite ?? ''}
            onChange={(e) => modifier({
              debutActivite: /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)
                ? dateISO(e.target.value)
                : null
            })} />
        </Champ>

        <Champ
          id={`${idChamp}-type`}
          libelle="Type d’activité"
          aide="Détermine le taux de cotisations, l’abattement et le plafond."
        >
          <select id={`${idChamp}-type`} value={entreprise.typeActivite}
            onChange={(e) => modifier({ typeActivite: e.target.value as TypeActivite })}>
            {TYPES_ACTIVITE.map((t) => (
              <option key={t.id} value={t.id}>{t.libelle}</option>
            ))}
          </select>
        </Champ>

        {/* En BNC seulement : la Cipav n'affilie que des libéraux, et une
            activité BIC relève de la SSI quoi qu'on choisisse ici — un choix
            montré sans effet se croirait appliqué. Aucune liste de
            professions : c'est l'attestation qui le dit. Le sigle « (SSI) »
            est parti du libellé : il le faisait couper dans la colonne de
            267 px du bureau (« … indépendants (S »). */}
        {entreprise.typeActivite === 'BNC' && (
          <Champ
            id={`${idChamp}-caisse`}
            libelle="Ta caisse de retraite"
            aide="Indiquée sur ton attestation d’affiliation. La Cipav ne concerne que certaines professions libérales réglementées."
          >
            <select id={`${idChamp}-caisse`} value={entreprise.caisseRetraite}
              onChange={(e) => modifier({ caisseRetraite: e.target.value === 'cipav' ? 'cipav' : 'ssi' })}>
              <option value="ssi">Sécurité sociale des indépendants</option>
              <option value="cipav">Cipav</option>
            </select>
          </Champ>
        )}

        <Champ
          id={`${idChamp}-intracom`}
          libelle="Numéro de TVA intracommunautaire"
          aide="Nécessaire pour déposer une déclaration européenne de services, y compris en franchise en base."
        >
          <input id={`${idChamp}-intracom`} value={entreprise.tvaIntracom}
            onChange={(e) => modifier({ tvaIntracom: e.target.value })} />
        </Champ>
      </div>

      <div className={styles.interrupteurs}>
        <Interrupteur
          id={`${idChamp}-acre`}
          libelle="ACRE — exonération partielle"
          resume={<ResumeAcre />}
          coche={entreprise.acre}
          onChange={(v) => modifier({ acre: v })}
          aide={<FenetreAcre />}
        />
        <OptionVl id={`${idChamp}-vl`} />
      </div>
    </div>
  );
}

/**
 * Ce que l'ACRE change, en une ligne sous l'interrupteur — comme le handoff.
 *
 * L'explication vivait dans une bulle : on activait l'ACRE sans voir ni son
 * taux ni sa date de fin, alors que les deux dépendent de la date de création
 * (50 % avant le 1er juillet 2026, 25 % après). Rien n'est écrit quand la
 * règle s'abstient : un taux inventé serait cru.
 */
function ResumeAcre() {
  const faits = useFaits((e) => e.faits);
  const taux = exonerationAcre(faits.entreprise.debutActivite);
  const fin = finAcreDe(faits);
  if (!faits.entreprise.acre) return <>Exonération partielle des cotisations les premiers trimestres, sur demande à l’URSSAF.</>;
  if (taux.statut === 'refuse') return <>Renseigne le début d’activité pour connaître le taux et la fin.</>;
  return (
    <>
      Exonération de {Math.round(taux.valeur * 100)}&nbsp;% des cotisations
      {fin !== null && fin.statut !== 'refuse'
        && <> jusqu’au {jourNumerique(finDuMois(fin.valeur))}</>}.
    </>
  );
}

/**
 * L'option pour le versement libératoire, et DEPUIS QUAND.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE CASE NE DISAIT PAS SI L'ON CORRIGE OU SI L'ON CHANGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Décocher la case en 2026 réécrivait 2025 : la déclaration des revenus
 * passait en 5HQ, et un solde d'impôt 2025 apparaissait, que le versement
 * libératoire avait déjà payé. Or décocher veut dire deux choses : « je n'ai
 * jamais opté » — corriger, tout se recalcule — ou « je renonce » — ce qui ne
 * vaut qu'au 1er janvier suivant. La question se pose sur place, à la bascule ;
 * rien n'est écrit avant la réponse.
 *
 * Le geste qui ne réécrit rien passe devant ; la correction, qui réécrit les
 * années passées, reste possible en second. L'année de création, seule la
 * correction a un sens : l'option demandée dans les trois mois vaut dès le
 * début.
 *
 * La case montre la dernière option choisie ; tant qu'elle ne vaut pas
 * encore, le résumé dit à partir de quand.
 */
function OptionVl({ id }: { readonly id: string }) {
  const entreprise = useFaits((e) => e.faits.entreprise);
  const modifier = useFaits((e) => e.modifierEntreprise);
  const [demande, setDemande] = useState<boolean | null>(null);
  const courant = moisCourant();
  const annee = Number(courant.slice(0, 4));
  const actuelle = { versementLiberatoire: entreprise.versementLiberatoire, historiqueVl: entreprise.historiqueVl };
  const creation = entreprise.debutActivite?.startsWith(String(annee)) === true;
  // Passé le 30 septembre, un changement demandé maintenant ne vaut qu'au
  // 1ᵉʳ janvier de l'année d'après : proposer « 1ᵉʳ janvier prochain » en
  // novembre faisait noter une option que l'administration n'appliquera pas.
  // Celui qui enregistre une option demandée à temps garde ce choix-là.
  const tardif = courant >= `${annee}-10`;
  const anneeDeFin = tardif ? annee + 1 : annee;

  /** `fin` : la dernière année qui garde l'ancienne option. */
  function choisir(depuis: DepuisQuand, fin: number = annee): void {
    if (demande !== null) modifier(changerOptionVl(actuelle, demande, depuis, fin));
    setDemande(null);
  }

  return (
    <>
      <Interrupteur
        id={id}
        libelle="Versement libératoire de l’impôt"
        resume={<ResumeVl type={entreprise.typeActivite} prochain={prochainChangementVl(actuelle, courant)} />}
        coche={demande ?? entreprise.versementLiberatoire}
        onChange={(v) => setDemande(v === entreprise.versementLiberatoire ? null : v)}
        aide={
          <>
            Discriminant exclusif&nbsp;: avec le versement libératoire, l’impôt
            est payé à chaque déclaration et rien n’est dû au barème
            progressif. L’ancienne version cumulait les deux, et
            surestimait l’impôt dû.
          </>
        }
      />
      {demande !== null && (
        <BlocConfirmation
          ton="prudence"
          consequence={<>Depuis quand&nbsp;?</>}
          complement={creation
            ? <>L’année de création, l’option demandée dans les trois mois qui suivent vaut dès le début de l’activité.</>
            : tardif
              ? (
                <>
                  Tu optes ou tu renonces au plus tard le 30&nbsp;septembre&nbsp;: demandé
                  maintenant, le changement prend effet au 1<sup>er</sup>&nbsp;janvier {annee + 2}.{' '}
                  <button type="button" className={styles.lienBouton} onClick={() => choisir('janvier', annee)}>
                    Demandé avant le 30&nbsp;septembre&nbsp;: à partir du 1<sup>er</sup>&nbsp;janvier {annee + 1}
                  </button>
                </>
              )
              : <>Tu optes ou tu renonces au plus tard le 30&nbsp;septembre&nbsp;; le changement prend effet au 1<sup>er</sup>&nbsp;janvier suivant.</>}
          {...(creation ? {} : {
            aLaPlace: {
              libelle: `À partir du 1ᵉʳ janvier ${anneeDeFin + 1} (je change d’option)`,
              onChoisir: () => choisir('janvier', anneeDeFin)
            }
          })}
          libelleConfirmer="Depuis le début de mon activité (je corrige une erreur)"
          libelleGarder="Annuler"
          onConfirmer={() => choisir('debut')}
          onGarder={() => setDemande(null)}
        />
      )}
    </>
  );
}

/** Ce que le versement libératoire change, avec le taux du barème — et à partir de quand. */
function ResumeVl(
  { type, prochain }: {
    readonly type: TypeActivite;
    readonly prochain: { readonly le: Mois; readonly actif: boolean } | null;
  }
) {
  const taux = tauxVersementLiberatoire(moisCourant(), type);
  const part = taux.statut !== 'refuse' && <> ({pct(taux.valeur)} du chiffre d’affaires)</>;
  if (prochain === null) {
    return <>Impôt payé à chaque déclaration{part}, plutôt qu’au barème.</>;
  }
  const le = `1ᵉʳ ${moisLong(prochain.le)}`;
  return prochain.actif
    ? <>À partir du {le}, impôt payé à chaque déclaration{part}&nbsp;; d’ici là, au barème.</>
    : <>À partir du {le}, impôt au barème&nbsp;; d’ici là, payé à chaque déclaration{part}.</>;
}

/**
 * La fenêtre d'ACRE, écrite en clair.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE DATE SE RECOUPE, UN BOOLÉEN NE SE RECOUPE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La durée d'exonération était calculée sans jamais être montrée : personne
 * ne pouvait voir qu'elle courait un trimestre de trop, et un mois d'ACRE en
 * trop, c'est la moitié des cotisations de ce mois-là qui n'est pas
 * provisionnée. Affichée, elle se compare à l'attestation URSSAF en un coup
 * d'œil.
 *
 * Rien n'est écrit quand la règle refuse : une date inventée serait recoupée
 * puis crue.
 */
function FenetreAcre() {
  const faits = useFaits((e) => e.faits);
  const fin = finAcreDe(faits);
  if (fin === null || fin.statut === 'refuse') return null;

  return (
    <>
      Exonération jusqu’au <strong>{jourNumerique(finDuMois(fin.valeur))}</strong>{' '}
      inclus, puis taux plein — jusqu’à la fin du 3<sup>e</sup> trimestre civil suivant
      celui de l’affiliation. À recouper avec ton attestation URSSAF.
      {fin.statut === 'hypothese' && ' Règle extrapolée, non publiée pour cette période.'}
    </>
  );
}

/**
 * « 30/09/2026 » : la forme de l'attestation URSSAF, avec laquelle la date se
 * recoupe — « 30 sept. 2026 » obligerait à traduire avant de comparer.
 */
function jourNumerique(d: string): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

/* ─────────────────────────────────────────────────────────────────────────
   Petits composants
   ───────────────────────────────────────────────────────────────────────── */

function Interrupteur(
  { id, libelle, coche, onChange, aide, resume }: {
    id: string;
    libelle: string;
    coche: boolean;
    onChange: (v: boolean) => void;
    aide?: React.ReactNode;
    /** Ce que l'option change, lisible sans ouvrir la bulle. */
    resume?: React.ReactNode;
  }
) {
  return (
    <div className={styles.interrupteur}>
      <span className={styles.interrupteurTexte}>
        <label htmlFor={id} className={styles.interrupteurLibelle}>
          {libelle}
          {aide !== undefined && <Info libelle={`Explication : ${libelle}`}>{aide}</Info>}
        </label>
        {resume !== undefined && <span className={styles.interrupteurResume}>{resume}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={coche}
        onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

/*
 * Les sections se chargent à la demande, mais celle que l'adresse désigne part
 * dès l'évaluation du module, en même temps que l'écran s'affiche : sans cela,
 * `#/reglages/fiscal` ouvert d'emblée montrait l'écran, PUIS « Chargement… »
 * pendant le téléchargement de la section, et les deux replis s'additionnent
 * (React retient chacun 300 ms). Pas les sept : un lien vers Profil n'a pas à
 * télécharger le barème. Profil n'est pas à la demande, il part avec l'écran.
 */
const routeConfig = sousRouteSiEcran('reglages', adresseCourante());
if (routeConfig !== null) {
  switch (routeConfig) {
    case 'fiscal': Fiscal.lancer(); break;
    case 'reserve': Reserve.lancer(); break;
    case 'facturation': Facturation.lancer(); break;
    case 'compte': Compte.lancer(); break;
    case 'donnees': Donnees.lancer(); break;
    case 'affichage': Affichage.lancer(); break;
    default: break;
  }
}
