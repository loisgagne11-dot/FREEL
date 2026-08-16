import { lazy, Suspense, useEffect, useId, useState } from 'react';
import { useToast } from '../components/Toasts';
import { useFaits } from '../../state/store';
import { soldeEstSuivi } from '../../state/selecteurs';
import { dateISO, euros, mois, ratio, type TypeActivite } from '../../domain/types';
import type { Entreprise } from '../../state/schema';
import { CLE_STOCKAGE, PART_GARDEE_MAX } from '../../state/schema';
import { Montant } from '../components/Montant';
import { eur } from '../format';
import { Compte } from './Compte';
import { Greet } from '../components/Greet';
import { Info } from '../components/Info';
import { Onglets, PanneauOnglet } from '../components/Onglets';
import { controlerIban, controlerSiret } from '../../domain/calculs/identifiants';
import { useRoute } from '../useRoute';
import { Champ } from '../components/Champ';
import styles from './Config.module.css';

/**
 * Écran Config — profil, barème et données.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉCRAN QUI REND LE BARÈME MAINTENABLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les taux officiels changent, et l'application ne peut pas être redéployée à
 * chaque publication. Sans porte d'entrée, deux issues, toutes deux mauvaises :
 * un taux périmé appliqué indéfiniment, ou une alerte de fraîcheur qui bloque
 * les déclarations sans que personne puisse la lever.
 *
 * La section Barème ouvre donc cette porte, sans renoncer aux garanties :
 *   · une période s'AJOUTE, elle ne réécrit pas le passé ;
 *   · elle porte sa source et sa date de vérification, comme celles livrées
 *     avec le code ;
 *   · la table affichée est celle **réellement appliquée** par les calculs, et
 *     non une copie qui pourrait en diverger.
 *
 * La section « Propositions Claude Code » de l'ancienne version a été retirée
 * (décision D5) : elle proposait des actions que rien ne rattachait aux faits.
 */

type Section = 'profil' | 'bareme' | 'donnees' | 'compte';

const SECTIONS = [
  { id: 'profil' as Section, libelle: 'Profil' },
  { id: 'bareme' as Section, libelle: 'Barème' },
  { id: 'donnees' as Section, libelle: 'Données' },
  { id: 'compte' as Section, libelle: 'Compte' }
];

const Bareme = lazy(() => import('./Config.bareme').then((m) => ({ default: m.Bareme })));

const TYPES_ACTIVITE: readonly { readonly id: TypeActivite; readonly libelle: string }[] = [
  { id: 'BNC', libelle: 'BNC — prestations libérales' },
  { id: 'BIC_service', libelle: 'BIC — prestations de services' },
  { id: 'BIC_vente', libelle: 'BIC — vente de marchandises' }
];

export function Config() {
  const faits = useFaits((e) => e.faits);
  /**
   * L'URL peut désigner une section.
   *
   * `#/config/compte` ouvre le compte : c'est la destination de la pastille
   * Cloud de la barre du haut, qui annonce une session expirée. L'y envoyer
   * sur l'onglet « Profil » lui ferait chercher où se reconnecter.
   *
   * La sous-route AMORCE l'état, elle ne le contraint pas : sans quoi cliquer
   * sur un autre onglet serait aussitôt annulé par l'adresse.
   */
  const { sousRoute } = useRoute();
  const [section, setSection] = useState<Section>(
    (SECTIONS.some((x) => x.id === sousRoute) ? sousRoute : 'profil') as Section
  );
  useEffect(() => {
    if (SECTIONS.some((x) => x.id === sousRoute)) setSection(sousRoute as Section);
  }, [sousRoute]);
  const idGroupe = useId();

  return (
    <>
      <Greet
        titre="Config"
        sousTitre="Votre régime, vos barèmes, vos données. Chaque champ s’enregistre à la frappe."
      />

      <div className={styles.sections}>
        <Onglets
          idGroupe={idGroupe}
          onglets={SECTIONS}
          actif={section}
          onChange={setSection}
          libelle="Sections de l’écran Config"
        />

        <PanneauOnglet idGroupe={idGroupe} id="profil" actif={section === 'profil'}>
          <Profil />
          <Tresorerie />
        </PanneauOnglet>

        <PanneauOnglet idGroupe={idGroupe} id="bareme" actif={section === 'bareme'}>
          {/* Chargé à la demande : c'est la plus grosse section de l'écran, et
              on ne l'ouvre que quand un taux officiel change — une fois ou
              deux par an. */}
          <Suspense fallback={<p role="status" className={styles.aide}>Chargement…</p>}>
            {section === 'bareme' && <Bareme />}
          </Suspense>
        </PanneauOnglet>

        <PanneauOnglet idGroupe={idGroupe} id="donnees" actif={section === 'donnees'}>
          <Donnees nomFichier={nomExport(faits.entreprise)} />
        </PanneauOnglet>

        <PanneauOnglet idGroupe={idGroupe} id="compte" actif={section === 'compte'}>
          {/* Monté seulement à l'ouverture : reprendre une session et
              interroger le serveur n'a pas à se produire chaque fois qu'on
              vient régler son profil. */}
          {section === 'compte' && <Compte />}
        </PanneauOnglet>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Trésorerie
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Le point de départ du solde, et le besoin mensuel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX FAITS QUI N'AVAIENT AUCUNE PORTE D'ENTRÉE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `soldeInitial` et `besoinMensuel` existaient dans le schéma et dans le
 * magasin, mais aucun écran ne les écrivait. Un utilisateur venu de
 * l'ancienne application héritait donc d'un solde qu'il ne pouvait pas
 * corriger, et d'une autonomie bloquée à zéro mois faute de besoin déclaré.
 * Un fait qu'on ne peut pas saisir est un fait qui restera faux.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE « SOLDE DU COMPTE » VEUT DIRE ICI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application SIMULAIT un solde : solde initial, plus les
 * encaissements, moins les charges cochées payées. Un chiffre calculé, qui
 * dérive de la réalité dès qu'une case est mal cochée.
 *
 * Ici, le solde vient de la banque : ce montant est le point de départ, et
 * les mouvements d'un relevé importé s'y ajoutent. Tant qu'aucun relevé n'est
 * importé, le solde affiché est exactement ce montant — l'écran Pilote le dit
 * plutôt que de le présenter comme suivi.
 */
function Tresorerie() {
  const faits = useFaits((e) => e.faits);
  const definirSoldeInitial = useFaits((e) => e.definirSoldeInitial);
  const definirBesoinMensuel = useFaits((e) => e.definirBesoinMensuel);
  const definirObjectif = useFaits((e) => e.definirObjectifCaAnnuel);
  const idChamp = useId();
  const suivi = soldeEstSuivi(faits);

  return (
    <section className={styles.carte} aria-labelledby={`${idChamp}-titre`}>
      <h2 id={`${idChamp}-titre`} className={styles.titreCarte}>
        Trésorerie
        <Info libelle="D’où vient le solde">
          Le solde de cette application vient de votre <strong>banque</strong>,
          pas d’un calcul. Vous indiquez ici le point de départ&nbsp;; les
          mouvements d’un relevé importé s’y ajoutent ensuite. L’ancienne
          version, elle, simulait le solde à partir des encaissements et des
          charges cochées payées — un chiffre qui dérive dès qu’une case est
          mal cochée.
        </Info>
      </h2>

      <div className={styles.formulaire}>
        <Champ
          id={`${idChamp}-solde`}
          libelle={suivi ? 'Solde avant le premier mouvement importé' : 'Solde du compte aujourd’hui'}
          aide={suivi
            ? 'Un relevé est importé : ce montant est le point de départ auquel '
              + 'ses mouvements s’ajoutent. Le modifier décale tout le solde.'
            : 'Aucun relevé n’est importé : c’est ce montant qui s’affiche comme '
              + 'solde. Reportez celui de votre compte bancaire.'}
        >
          <input
            id={`${idChamp}-solde`}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={faits.soldeInitial}
            onChange={(e) => definirSoldeInitial(euros(Number(e.target.value) || 0))}
          />
        </Champ>

        <Champ
          id={`${idChamp}-besoin`}
          libelle="Besoin mensuel"
          aide="Ce qu’il vous faut pour vivre chaque mois. Sert à calculer votre
                autonomie ; à zéro, l’autonomie affichée reste à zéro mois."
        >
          <input
            id={`${idChamp}-besoin`}
            type="number"
            inputMode="decimal"
            step="1"
            value={faits.besoinMensuel}
            onChange={(e) => definirBesoinMensuel(euros(Number(e.target.value) || 0))}
          />
        </Champ>

        {/* Le champ est vide quand aucun objectif n'est fixé, et non à « 0 ».
            Un zéro affiché se lirait comme un objectif de zéro euro, alors que
            l'état réel est « je ne m'en suis pas fixé » — et c'est cet état-là
            qui fait que le graphe n'affiche aucune ligne d'objectif. */}
        <Champ
          id={`${idChamp}-objectif`}
          libelle="Objectif de chiffre d’affaires sur l’année"
          aide="Facultatif. Sur l’encaissé, comme les plafonds et l’impôt — un
                objectif sur le facturé serait atteint sans que le compte l’ait
                vu passer. Laissez vide pour ne pas en fixer."
        >
          <input
            id={`${idChamp}-objectif`}
            type="number"
            inputMode="decimal"
            step="1000"
            min="0"
            placeholder="Aucun objectif"
            value={faits.objectifCaAnnuel ?? ''}
            onChange={(e) => definirObjectif(
              e.target.value === '' ? null : euros(Number(e.target.value) || 0)
            )}
          />
        </Champ>
      </div>

      <ReservesEtVersements />
    </section>
  );
}

/**
 * Les deux réglages de prudence — sources uniques, et deux notions distinctes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN PLANCHER EN EUROS N'EST PAS UNE PART EN POURCENTAGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le SEUIL DE SÉCURITÉ est un montant absolu : la ligne sous laquelle le compte
 * ne descend pas (D4, fait `reserve`). La PART GARDÉE est une fraction du
 * versable qu'on choisit de ne pas prendre ce mois-ci.
 *
 * Les confondre — c'est-à-dire exprimer le plancher en pourcentage du
 * disponible, comme le fait le prototype du handoff — fabrique une boucle : le
 * plancher descend à mesure qu'on vide le compte, et le versement soutenable
 * finit par tout autoriser. Ce n'est pas une préférence de conception, c'est
 * une rétroaction.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ILS SONT ICI ET PLUS SUR LE PILOTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le handoff les range dans « Réserve & versements », et le Pilote n'y montre
 * que le montant qui en résulte. Le second motif a tranché : le Pilote est le
 * seul écran du paquet d'entrée, et le second curseur lui a fait franchir son
 * plafond. La règle du projet est d'extraire ce qui n'a rien à faire là.
 *
 * L'état local ne sert qu'à la fluidité du glissement ; la valeur part dans le
 * magasin à chaque changement, de sorte qu'il n'existe jamais deux vérités.
 */
function ReservesEtVersements() {
  const reserve = useFaits((e) => e.faits.reserve);
  const partGardee = useFaits((e) => e.faits.partGardeeAuVersement);
  const soldeInitial = useFaits((e) => e.faits.soldeInitial);
  const definirReserve = useFaits((e) => e.definirReserve);
  const definirPartGardee = useFaits((e) => e.definirPartGardee);
  const idChamp = useId();

  const [saisiePart, setSaisiePart] = useState<number | null>(null);
  const pourcent = Math.round((saisiePart ?? partGardee) * 100);
  // Le versable qui résulte des deux réglages, pour que la phrase dise le
  // calcul plutôt que de le laisser deviner. Dérivé, jamais stocké.
  const versable = Math.max(0, soldeInitial - reserve);

  return (
    <div className={styles.formulaire}>
      {/* Un CHAMP et non un curseur, contrairement à la part : c'est ce que
          montre la capture, et c'est juste. Une plage a besoin d'une borne
          haute, et la seule disponible ici est le solde — quelqu'un qui a
          8 000 € en banque mais n'a pas encore saisi son solde de départ ne
          pourrait pas se fixer un plancher à 5 000 €. */}
      <Champ
        id={`${idChamp}-seuil`}
        libelle="Seuil de sécurité"
        aide="Le montant que vous gardez sur le compte quoi qu’il arrive. Il est
              retiré du disponible pour obtenir ce que vous pouvez vous verser,
              et c’est le plancher tracé sur vos courbes."
      >
        <input
          id={`${idChamp}-seuil`}
          type="number"
          inputMode="decimal"
          step="50"
          min="0"
          value={reserve}
          onChange={(e) => definirReserve(euros(Math.max(0, Number(e.target.value) || 0)))}
        />
      </Champ>

      <p className={styles.champ}>
        <label htmlFor={`${idChamp}-part`}>Part gardée à chaque versement</label>
        <span className={styles.curseurRangee}>
          <input
            id={`${idChamp}-part`}
            type="range"
            className={styles.curseur}
            min={0}
            max={PART_GARDEE_MAX * 100}
            step={5}
            value={pourcent}
            aria-valuetext={`${pourcent} %`}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              setSaisiePart(v);
              definirPartGardee(ratio(v));
            }}
            onBlur={() => setSaisiePart(null)}
          />
          <output className={styles.curseurValeur}>{pourcent}&nbsp;%</output>
        </span>
        <span className={styles.aide}>
          Ce que vous laissez sur le compte <strong>au-dessus du seuil</strong>,
          à chaque versement. À 0&nbsp;% rien ne change&nbsp;: c’est le réglage
          par défaut, et il ne décide rien à votre place.
        </span>
      </p>

      {/* La phrase dit le calcul, seuil compris. Le prototype du handoff écrit
          « sur ta part disponible, tu gardes N % » — sans le seuil, ce qui à
          0 % proposerait de verser le matelas avec. */}
      <p className={styles.explication}>
        Sur un solde de <Montant>{eur(soldeInitial)}</Montant>, le seuil en garde{' '}
        <Montant>{eur(reserve)}</Montant>&nbsp;; des{' '}
        <Montant>{eur(versable)}</Montant> restants vous en laissez{' '}
        {pourcent}&nbsp;%, soit{' '}
        <Montant>{eur(Math.round(versable * (1 - pourcent / 100)))}</Montant> à
        vous verser.
      </p>
    </div>
  );
}

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
 */
function Profil() {
  const entreprise = useFaits((e) => e.faits.entreprise);
  const modifier = useFaits((e) => e.modifierEntreprise);
  const idChamp = useId();

  return (
    <section className={styles.carte} aria-labelledby={`${idChamp}-titre`}>
      <h2 id={`${idChamp}-titre`} className={styles.titreCarte}>Entreprise et régime</h2>

      <div className={styles.formulaire}>
        <Champ id={`${idChamp}-nom`} libelle="Nom">
          <input id={`${idChamp}-nom`} value={entreprise.nom}
            onChange={(e) => modifier({ nom: e.target.value })} />
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

        <Champ id={`${idChamp}-periodicite`} libelle="Périodicité de déclaration URSSAF">
          <select id={`${idChamp}-periodicite`} value={entreprise.urssafPeriodicite}
            onChange={(e) => modifier({
              urssafPeriodicite: e.target.value === 'trimestriel' ? 'trimestriel' : 'mensuel'
            })}>
            <option value="mensuel">Mensuelle</option>
            <option value="trimestriel">Trimestrielle</option>
          </select>
        </Champ>

        <Champ
          id={`${idChamp}-intracom`}
          libelle="Numéro de TVA intracommunautaire"
          aide="Nécessaire pour déposer une déclaration européenne de services, y compris en franchise en base."
        >
          <input id={`${idChamp}-intracom`} value={entreprise.tvaIntracom}
            onChange={(e) => modifier({ tvaIntracom: e.target.value })} />
        </Champ>

        {/*
          * OÙ VOUS PAYER.
          *
          * `iban` existait au schéma et était même repris de l'ancienne
          * application à la migration — mais aucun écran ne le montrait et le
          * document imprimé ne le portait pas. Le client recevait une facture
          * régulière sur laquelle rien n'indiquait où envoyer l'argent.
          *
          * L'IBAN porte une clé mod-97 : une inversion de caractères se voit
          * ici, et non trois semaines plus tard en relançant un virement qui
          * n'est jamais parti.
          */}
        <Champ
          id={`${idChamp}-iban`}
          libelle="IBAN"
          aide="Figure sur vos factures, pour que le client sache où virer. Rien n’est envoyé nulle part."
          controle={controlerIban(entreprise.iban)}
        >
          <input id={`${idChamp}-iban`} autoComplete="off" spellCheck={false}
            value={entreprise.iban}
            onChange={(e) => modifier({ iban: e.target.value })} />
        </Champ>

        <Champ id={`${idChamp}-bic`} libelle="BIC" aide="Facultatif pour un virement SEPA.">
          <input id={`${idChamp}-bic`} autoComplete="off" spellCheck={false}
            value={entreprise.bic}
            onChange={(e) => modifier({ bic: e.target.value })} />
        </Champ>

        <Champ
          id={`${idChamp}-tva`}
          libelle="Assujetti à la TVA depuis"
          aide="Laisser vide en franchise en base. Le régime est résolu à la date de chaque opération."
        >
          <input id={`${idChamp}-tva`} type="month" value={entreprise.tvaDepuis ?? ''}
            onChange={(e) => modifier({
              tvaDepuis: /^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)
                ? mois(e.target.value)
                : null
            })} />
        </Champ>
      </div>

      <div className={styles.interrupteurs}>
        <Interrupteur
          id={`${idChamp}-acre`}
          libelle="Bénéficiaire de l’ACRE"
          coche={entreprise.acre}
          onChange={(v) => modifier({ acre: v })}
        />
        <Interrupteur
          id={`${idChamp}-vl`}
          libelle="Versement libératoire de l’impôt sur le revenu"
          coche={entreprise.versementLiberatoire}
          onChange={(v) => modifier({ versementLiberatoire: v })}
          aide={
            <>
              Discriminant exclusif&nbsp;: avec le versement libératoire, l’impôt
              est payé à chaque déclaration et rien n’est dû au barème
              progressif. L’ancienne version cumulait les deux, et
              surestimait l’impôt à provisionner.
            </>
          }
        />
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Données
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Export des faits.
 *
 * Un export brut et complet, pas un rapport : ce qui compte ici est de pouvoir
 * récupérer ses données sans l'application. Les pièces justificatives ne sont
 * pas incluses — elles vivent dans IndexedDB et pèsent trop pour un fichier
 * texte —, et le dire vaut mieux que de laisser croire à une sauvegarde
 * complète.
 */
function Donnees({ nomFichier }: { nomFichier: string }) {
  const faits = useFaits((e) => e.faits);
  const chargement = useFaits((e) => e.chargement);
  const adopter = useFaits((e) => e.adopterFaitsDistants);
  const signaler = useToast();
  const idChamp = useId();
  /**
   * Ce qu'une sauvegarde contient, AVANT de l'appliquer.
   *
   * Restaurer écrase tout. Le faire au clic sur « parcourir » ferait perdre
   * une saisie du jour sans que personne l'ait vue passer — c'est la même
   * précaution que sur l'écran Compte, et pour la même raison.
   */
  const [aRestaurer, setARestaurer] = useState<Restauration | null>(null);

  function exporter(): void {
    const contenu = JSON.stringify(faits, null, 2);
    const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomFichier;
    lien.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={styles.carte} aria-labelledby={`${idChamp}-donnees`}>
      <h2 id={`${idChamp}-donnees`} className={styles.titreCarte}>Vos données</h2>

      {chargement.phase === 'sans-persistance' && (
        <p className={styles.echec} role="alert">{chargement.motif}</p>
      )}

      <dl className={styles.detail}>
        <div className={styles.ligne}>
          <dt>Recettes</dt>
          <dd>{faits.recettes.length}</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Dépenses</dt>
          <dd>{faits.depenses.length}</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Missions</dt>
          <dd>{faits.missions.length}</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Clients</dt>
          <dd>{faits.clients.length}</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Périodes déclarées</dt>
          <dd>{faits.periodesDeclarees.length}</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Emplacement</dt>
          <dd className={styles.source}>{CLE_STOCKAGE}</dd>
        </div>
      </dl>

      <button type="button" className={styles.actionPrincipale} onClick={exporter}>
        Exporter mes données
      </button>

      <p className={styles.champ}>
        <label htmlFor={`${idChamp}-restaurer`}>Restaurer une sauvegarde</label>
        <input
          id={`${idChamp}-restaurer`}
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const fichier = e.target.files?.[0];
            // Le champ est vidé pour que rechoisir le MÊME fichier déclenche à
            // nouveau l'événement : sans cela, annuler puis recommencer avec le
            // même fichier ne ferait rien, et l'écran paraîtrait cassé.
            e.target.value = '';
            if (fichier === undefined) return;
            void lireSauvegarde(fichier).then(setARestaurer);
          }}
        />
        <span className={styles.aide}>
          Un fichier produit par «&nbsp;Exporter mes données&nbsp;». Son contenu
          vous sera montré avant d’écraser quoi que ce soit.
        </span>
      </p>

      {/* Une application vide ne montre rien de ce qu'elle sait faire : les
          graphes sont plats, les indicateurs à zéro, et on ne peut pas juger.
          Le jeu de démonstration passe par la MÊME confirmation qu'une
          restauration — il écrase autant qu'elle, et l'appeler « démonstration »
          ne le rend pas moins destructeur. */}
      <button
        type="button"
        className={styles.action}
        onClick={() => { void lireJeuDeDemonstration().then(setARestaurer); }}
      >
        Charger un jeu de démonstration
      </button>
      <p className={styles.explication}>
        Des clients, des missions, des factures et des échéances manifestement
        fictifs, pour voir l’application remplie. Ils remplacent vos données&nbsp;:
        exportez-les d’abord si elles comptent.
      </p>

      {aRestaurer !== null && (
        <div className={styles.confirmation} role="alert">
          {aRestaurer.statut === 'illisible'
            ? <p className={styles.echec}>{aRestaurer.motif}</p>
            : (
              <>
                <p>
                  Cette sauvegarde contient <strong>{aRestaurer.resume.recettes}</strong> recette(s),
                  {' '}<strong>{aRestaurer.resume.depenses}</strong> dépense(s),
                  {' '}<strong>{aRestaurer.resume.missions}</strong> mission(s) et
                  {' '}<strong>{aRestaurer.resume.clients}</strong> client(s).
                </p>
                <p className={styles.explication}>
                  La restaurer <strong>remplace</strong> tout ce qui est actuellement
                  dans l’application. Les justificatifs déposés ne sont pas concernés&nbsp;:
                  ils vivent à part, et une sauvegarde JSON ne les contient pas.
                </p>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.actionPrincipale}
                    onClick={() => {
                      const refus = adopter(aRestaurer.brut);
                      signaler(refus ?? 'Sauvegarde restaurée.');
                      setARestaurer(null);
                    }}
                  >
                    Remplacer mes données par cette sauvegarde
                  </button>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => setARestaurer(null)}
                  >
                    Annuler
                  </button>
                </div>
              </>
            )}
        </div>
      )}

      <p className={styles.explication}>
        L’export contient tous les faits saisis, au format JSON. Les
        justificatifs n’y sont pas&nbsp;: ce sont des fichiers, conservés à part
        dans le navigateur. Les données de l’ancienne version restent en place
        et ne sont jamais effacées.
      </p>
    </section>
  );
}

/** Nom de fichier de l'export : lisible, daté, et sans nom de société vide. */
function nomExport(entreprise: Entreprise): string {
  const jour = new Date().toISOString().slice(0, 10);
  const nom = entreprise.nom.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `freel-${nom === '' ? 'donnees' : nom.toLowerCase()}-${jour}.json`;
}

/* ─────────────────────────────────────────────────────────────────────────
   Petits composants
   ───────────────────────────────────────────────────────────────────────── */

function Interrupteur(
  { id, libelle, coche, onChange, aide }: {
    id: string;
    libelle: string;
    coche: boolean;
    onChange: (v: boolean) => void;
    aide?: React.ReactNode;
  }
) {
  return (
    <p className={styles.interrupteur}>
      <input id={id} type="checkbox" checked={coche}
        onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>
        {libelle}
        {aide !== undefined && <Info libelle={`Explication : ${libelle}`}>{aide}</Info>}
      </label>
    </p>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Restauration d'une sauvegarde
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Une sauvegarde lue, et ce qu'on peut en dire sans l'appliquer.
 *
 * L'export existait depuis le début, la restauration non. Une sauvegarde qu'on
 * ne sait pas relire n'est pas une sauvegarde : c'est un fichier qui rassure.
 */
type Restauration =
  | { readonly statut: 'illisible'; readonly motif: string }
  | {
    readonly statut: 'lisible';
    readonly brut: unknown;
    readonly resume: {
      readonly recettes: number; readonly depenses: number;
      readonly missions: number; readonly clients: number;
    };
  };

/**
 * Lit un fichier de sauvegarde sans rien écrire.
 *
 * La validation de fond — schéma trop récent, listes mal formées — appartient
 * à `adopterFaitsDistants`, qui la fait au moment d'adopter. Ici on ne vérifie
 * que ce qu'il faut pour ANNONCER le contenu : un fichier illisible doit se
 * dire tout de suite, pas après une confirmation.
 */
/**
 * Le jeu de démonstration, servi comme fichier statique.
 *
 * Il n'est PAS importé dans le paquet : ce sont douze kilo-octets que quelqu'un
 * qui saisit ses vraies données ne téléchargera jamais. Il est aussi la source
 * dont `scripts/capturer-app.mjs` se sert pour rendre nos écrans dans les mêmes
 * conditions que le handoff — un seul fichier, pas une copie qui dérive.
 */
async function lireJeuDeDemonstration(): Promise<Restauration> {
  try {
    const reponse = await fetch(`${import.meta.env.BASE_URL}jeu-de-demonstration.json`);
    if (!reponse.ok) {
      return { statut: 'illisible', motif: 'Le jeu de démonstration n’a pas pu être chargé.' };
    }
    return resumerBloc(await reponse.json());
  } catch {
    return { statut: 'illisible', motif: 'Le jeu de démonstration n’a pas pu être chargé.' };
  }
}

async function lireSauvegarde(fichier: File): Promise<Restauration> {
  let texte: string;
  try {
    texte = await fichier.text();
  } catch {
    return { statut: 'illisible', motif: 'Le fichier n’a pas pu être lu.' };
  }

  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return {
      statut: 'illisible',
      motif: 'Ce fichier n’est pas du JSON. Choisissez un export produit par l’application.'
    };
  }

  return resumerBloc(brut);
}

/** Annonce ce qu'un bloc contient, sans rien adopter. */
function resumerBloc(brut: unknown): Restauration {
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) {
    return {
      statut: 'illisible',
      motif: 'Ce fichier ne contient pas un bloc de faits exploitable.'
    };
  }

  const o = brut as Record<string, unknown>;
  const compter = (cle: string) => (Array.isArray(o[cle]) ? (o[cle] as unknown[]).length : 0);

  return {
    statut: 'lisible',
    brut,
    resume: {
      recettes: compter('recettes'),
      depenses: compter('depenses'),
      missions: compter('missions'),
      clients: compter('clients')
    }
  };
}
