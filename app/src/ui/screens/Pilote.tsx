import { useMemo, useState } from 'react';
import { euros } from '../../domain/types';
import { useFaits } from '../../state/store';
import {
  aTraiter, etatPilote, fluxDuMois, moisCourant, soldeEstSuivi
} from '../../state/selecteurs';
import type { SujetATraiter } from '../../domain/calculs/aTraiter';
import { Greet } from '../components/Greet';
import { FluxCard } from '../components/FluxCard';
import { SanteCard, indicateursDeSante } from '../components/SanteCard';
import { eur, moisLong, moisTexte } from '../format';
import styles from './Pilote.module.css';
import { Montant } from '../components/Montant';

/**
 * Écran Pilote — « combien je peux me verser, et qu'est-ce qui coince ».
 *
 * INVARIANT : aucun nombre n'est écrit dans ce fichier. Tout vient des faits et
 * du domaine, via `etatPilote`. C'est ce qui empêche la dérive qui produisait
 * cinq valeurs concurrentes du taux de cotisations dans l'ancienne version.
 *
 * Le curseur de réserve est le SEUL endroit de l'application qui écrit la
 * réserve (décision D4).
 */
export function Pilote() {
  const faits = useFaits((e) => e.faits);
  const chargement = useFaits((e) => e.chargement);
  const definirReserve = useFaits((e) => e.definirReserve);

  const mois = moisCourant();
  // Recalculé à chaque changement de faits, jamais stocké.
  const etat = useMemo(() => etatPilote(faits), [faits]);
  const sujets = useMemo(() => aTraiter(faits), [faits]);
  const flux = useMemo(() => fluxDuMois(faits, [], mois, etat), [faits, mois, etat]);

  /**
   * Les constats de santé viennent des MÊMES sources que le reste de l'écran.
   *
   * Les recompter séparément les ferait diverger du flux et du panneau
   * « à traiter » — l'écran dirait alors deux choses différentes sur la même
   * réalité, ce qui est exactement le défaut relevé sur l'ancienne version.
   */
  const sante = useMemo(() => {
    const impayees = flux.entrees.lignes.filter((l) => !l.regle);
    const periodes = sujets.find((x) => x.id === 'periodes-a-declarer');
    return indicateursDeSante({
      dispo: etat.tresorerie.dispo,
      provisions: etat.tresorerie.provisions,
      impayes: impayees.length,
      montantImpaye: flux.entrees.enAttente,
      periodesEnRetard: periodes?.nombre ?? 0
    });
  }, [flux, etat, sujets]);

  return (
    <>
      <Greet
        titre={salutation(faits.entreprise.nom)}
        sousTitre={phraseDAccueil(sujets.length, moisLong(mois))}
        repere={<>Solde compte · <Montant>{eur(etat.tresorerie.solde)}</Montant></>}
      />

      {chargement.phase === 'sans-persistance' && (
        <Bandeau ton="alerte" titre="Vos saisies ne sont pas conservées">
          {chargement.motif}
        </Bandeau>
      )}

      {chargement.phase === 'pret' && chargement.migrationEffectuee && (
        <Bandeau ton="info" titre="Données reprises de la version précédente">
          Une sauvegarde de l’état d’origine a été archivée avant toute écriture.
        </Bandeau>
      )}

      {/* Un calcul incomplet n'est jamais présenté comme un résultat : un
          versable trop élevé conduirait à se verser de l'argent déjà dû. */}
      {etat.tresorerie.incomplet && (
        <Bandeau ton="alerte" titre="Montants sous-évalués">
          Certaines recettes ne peuvent pas être provisionnées faute de barème
          pour leur période. Les montants ci-dessous sont donc <strong>plus élevés
          que la réalité</strong>.
          <ul className={styles.motifs}>
            {etat.tresorerie.motifsIncomplets.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </Bandeau>
      )}

      {etat.tauxImpotIndisponible && etat.motifTauxImpot !== null && (
        <Bandeau ton="alerte" titre="Barème d’imposition manquant">
          {etat.motifTauxImpot}
        </Bandeau>
      )}

      <section className={styles.versable} aria-labelledby="titre-versable">
        <h2 id="titre-versable" className={styles.libelle}>Je peux me verser</h2>
        <p className={styles.montantPrincipal}><Montant>{eur(etat.tresorerie.versable)}</Montant></p>
        <p className={styles.sousLigne}>
          Autonomie&nbsp;: {moisTexte(etat.autonomie)}
          {faits.besoinMensuel <= 0 && (
            <span className={styles.note}> — renseignez votre besoin mensuel pour la calculer</span>
          )}
        </p>
      </section>

      <FluxCard
        flux={flux}
        periode={moisLong(mois)}
        versementPossible={etat.tresorerie.versable > 0}
      />

      <SanteCard indicateurs={sante} autonomie={etat.autonomie} />

      <div className={styles.grille}>
        <Chiffre
          libelle="Solde"
          valeur={eur(etat.tresorerie.solde)}
          {...(soldeEstSuivi(faits)
            ? {}
            : { precision: 'saisi, aucun relevé importé' })}
        />
        <Chiffre
          libelle="À garder de côté"
          valeur={eur(etat.tresorerie.provisions)}
          ton={etat.tresorerie.provisions > 0 ? 'attention' : 'neutre'}
        />
        <Chiffre
          libelle="Disponible"
          valeur={eur(etat.tresorerie.dispo)}
          ton={etat.tresorerie.dispo < 0 ? 'danger' : 'neutre'}
        />
        <Chiffre libelle="Réserve" valeur={eur(etat.tresorerie.reserve)} />
      </div>

      <section className={styles.carte} aria-labelledby="titre-provisions">
        <h2 id="titre-provisions" className={styles.titreCarte}>Ce que je dois</h2>
        <dl className={styles.detail}>
          <div className={styles.ligne}>
            <dt>Échéances à payer</dt>
            <dd><Montant>{eur(etat.voletConstate)}</Montant></dd>
          </div>
          <div className={styles.ligne}>
            <dt>
              Charges sur recettes encaissées
              <span className={styles.aide}>
                non encore déclarées — la dette naît à l’encaissement
              </span>
            </dt>
            <dd><Montant>{eur(etat.voletAProvisionner)}</Montant></dd>
          </div>
          <div className={`${styles.ligne} ${styles.total}`}>
            <dt>Total</dt>
            <dd><Montant>{eur(etat.tresorerie.provisions)}</Montant></dd>
          </div>
        </dl>
      </section>

      <ATraiter sujets={sujets} />

      <CurseurReserve
        reserve={etat.tresorerie.reserve}
        maximum={Math.max(etat.tresorerie.solde, etat.tresorerie.reserve)}
        onChange={(v) => definirReserve(euros(v))}
      />
    </>
  );
}

/**
 * Les décisions du jour.
 *
 * Sur Pilote, poste de pilotage, la liste n'est pas filtrée : elle montre tous
 * les sujets, quel que soit l'écran qui les règle. C'est la règle du design, et
 * c'est ce qui fait de cet écran la décision du jour plutôt qu'un écran parmi
 * six.
 *
 * Une liste vide n'est pas un vide à masquer : c'est une information, et la
 * meilleure qu'on puisse donner.
 */
function ATraiter({ sujets }: { sujets: readonly SujetATraiter[] }) {
  return (
    <section className={styles.carte} aria-labelledby="titre-a-traiter">
      <h2 id="titre-a-traiter" className={styles.titreCarte}>
        À traiter
        {sujets.length > 0 && <span className={styles.compteur}>{sujets.length}</span>}
      </h2>

      {sujets.length === 0 ? (
        <p className={styles.aideCarte}>Rien ne réclame votre attention aujourd’hui.</p>
      ) : (
        <ul className={styles.sujets}>
          {sujets.map((s) => (
            <li key={s.id} className={styles.sujet}>
              <span
                className={`${styles.puce} ${
                  s.gravite === 'retard' ? styles.puceRetard
                  : s.gravite === 'a_faire' ? styles.puceAFaire
                  : styles.puceInfo
                }`}
                aria-hidden="true"
              />
              <div className={styles.sujetCorps}>
                <span className={styles.sujetIntitule}>
                  {s.intitule}
                  {/* Le libellé porte déjà la quantité quand elle compte ; on
                      n'affiche pas « 1 » qui n'apprendrait rien. */}
                  <span className={styles.sujetGravite}>
                    {s.gravite === 'retard' ? 'En retard'
                      : s.gravite === 'a_faire' ? 'À faire' : 'Information'}
                  </span>
                </span>
                {/* Le contexte d'un sujet porte des montants dans sa phrase
                    (« 5 250 € impayés, dont 43 jours de retard »). La phrase
                    entière est donc masquée : y découper le montant
                    demanderait au domaine de séparer prose et chiffres, ce
                    qui n'est pas son rôle. Le survol la révèle. */}
                <span className={styles.sujetContexte}>
                  <Montant>{s.contexte}</Montant>
                </span>
              </div>
              <a className={styles.sujetAction} href={`#/${s.ecran}`}>{s.action}</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- éléments locaux ---------- */

function Bandeau(
  { ton, titre, children }: {
    ton: 'info' | 'alerte';
    titre: string;
    children: React.ReactNode;
  }
) {
  return (
    // `role="status"` plutôt que `alert` : ces bandeaux sont présents au
    // rendu, ils n'interrompent pas l'utilisateur en cours de tâche.
    <section className={`${styles.bandeau} ${ton === 'alerte' ? styles.bandeauAlerte : styles.bandeauInfo}`} role="status">
      <strong className={styles.bandeauTitre}>{titre}</strong>
      <div className={styles.bandeauCorps}>{children}</div>
    </section>
  );
}

function Chiffre(
  { libelle, valeur, ton = 'neutre', precision }: {
    libelle: string;
    valeur: string;
    ton?: 'neutre' | 'attention' | 'danger';
    /**
     * D'où sort le chiffre, quand ce n'est pas évident.
     *
     * Un solde sans relevé importé n'est pas suivi : c'est le montant saisi,
     * figé. L'afficher comme les autres le ferait lire comme une position
     * bancaire à jour — et une position bancaire fausse commande de mauvaises
     * décisions de trésorerie.
     */
    precision?: string;
  }
) {
  const classeTon = ton === 'danger' ? styles.danger : ton === 'attention' ? styles.attention : '';
  return (
    <div className={styles.chiffre}>
      <span className={styles.libelle}>{libelle}</span>
      <span className={`${styles.montant} ${classeTon}`}><Montant>{valeur}</Montant></span>
      {precision !== undefined && <span className={styles.precision}>{precision}</span>}
    </div>
  );
}

/**
 * Curseur de réserve — source unique du matelas de sécurité (D4).
 *
 * L'état local ne sert qu'à la fluidité du glissement ; la valeur est écrite
 * dans le magasin à chaque changement, de sorte qu'il n'existe jamais deux
 * vérités sur la réserve.
 */
function CurseurReserve(
  { reserve, maximum, onChange }: {
    reserve: number;
    maximum: number;
    onChange: (valeur: number) => void;
  }
) {
  const [saisie, setSaisie] = useState<number | null>(null);
  const affiche = saisie ?? reserve;
  // Un maximum nul rendrait le curseur inutilisable : on garde une plage
  // minimale plutôt qu'un contrôle mort.
  const borne = Math.max(maximum, 1000);
  const pas = 50;

  return (
    <section className={styles.carte} aria-labelledby="titre-reserve">
      <h2 id="titre-reserve" className={styles.titreCarte}>Réserve de sécurité</h2>
      <p className={styles.aideCarte}>
        Montant que vous gardez sur le compte quoi qu’il arrive. Il est retiré du
        disponible pour obtenir ce que vous pouvez vous verser.
      </p>
      <div className={styles.curseurRangee}>
        <input
          type="range"
          className={styles.curseur}
          min={0}
          max={borne}
          step={pas}
          value={affiche}
          aria-label="Réserve de sécurité en euros"
          aria-valuetext={eur(affiche)}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSaisie(v);
            onChange(v);
          }}
          onBlur={() => setSaisie(null)}
        />
        <output className={styles.curseurValeur}><Montant>{eur(affiche)}</Montant></output>
      </div>
    </section>
  );
}

/**
 * « Bonjour » suivi du nom, quand on le connaît.
 *
 * Le nom vient de la configuration de l'utilisateur, jamais du code : rien
 * d'identifiant n'est écrit dans le dépôt. Tant qu'il n'est pas renseigné,
 * on salue sans nommer plutôt que d'afficher un « Bonjour  » amputé.
 */
function salutation(nom: string): string {
  const propre = nom.trim();
  return propre === '' ? 'Bonjour' : `Bonjour ${propre}`;
}

/**
 * Ce qui attend, en une phrase.
 *
 * La spec ouvre le Pilote sur « quatre décisions t'attendent » — un état
 * qu'on lit en une seconde, là où quatre tuiles demandent d'être comparées.
 * Le cas « rien à traiter » n'est pas un vide à masquer : c'est la bonne
 * nouvelle de la journée, et elle mérite d'être dite.
 */
function phraseDAccueil(nbSujets: number, mois: string): string {
  if (nbSujets === 0) return `Rien ne demande votre attention en ${mois.toLowerCase()}.`;
  return nbSujets === 1
    ? `Une décision vous attend en ${mois.toLowerCase()}.`
    : `${nbSujets} décisions vous attendent en ${mois.toLowerCase()}.`;
}
