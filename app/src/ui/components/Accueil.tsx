import { useEffect, useId, useState } from 'react';
import { useFaits } from '../../state/store';
import type { Faits } from '../../state/schema';
import { type Mois, type TypeActivite, dateISO, mois as versMois } from '../../domain/types';
import { estLeJeuDeDemonstration } from '../../domain/calculs/demonstration';
import { dateDuJour } from '../../state/selecteurs';
import { Sheet } from './Sheet';
import { useToast } from './Toasts';
import styles from './Accueil.module.css';

/**
 * L'accueil à la première ouverture.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE VOYAIT QUELQU'UN QUI OUVRAIT L'APPLICATION POUR LA PREMIÈRE FOIS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un Pilote à zéro : « 0 € encaissés », « rien à traiter », et aucune piste
 * pour en sortir. Les trois façons d'y mettre ses données existaient — la
 * reprise depuis le compte, la restauration d'une sauvegarde, la saisie du
 * profil — mais rangées au fond de Config, là où personne ne va avant d'avoir
 * compris l'outil.
 *
 * L'accueil les met devant, une fois, sans en imposer aucune.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUAND IL S'OUVRE — UNE DÉRIVATION, PAS UN DRAPEAU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Quand le dossier est vide, une fois le chargement fini. Rien n'est stocké
 * dans les faits (invariant n°1) : « vide » se constate. La reprise depuis ce
 * navigateur, elle, est automatique — un dossier qui en vient n'est pas vide,
 * et ne voit donc jamais l'accueil.
 *
 * Seule l'envie de ne plus le voir se retient, dans le stockage du
 * navigateur, comme le thème : une préférence d'affichage, pas un fait. Elle
 * s'oublie dès que le dossier se remplit — si on repart de zéro plus tard,
 * l'accueil revient, et c'est précisément le moment où il sert.
 */

const CLE_ECARTE = 'freel.accueil.ecarte.v1';

function lireEcarte(): boolean {
  try { return window.localStorage.getItem(CLE_ECARTE) === 'oui'; } catch { return false; }
}

function ecrireEcarte(oui: boolean): void {
  try {
    if (oui) window.localStorage.setItem(CLE_ECARTE, 'oui');
    else window.localStorage.removeItem(CLE_ECARTE);
  } catch { /* stockage indisponible : l'accueil reviendra, sans dommage */ }
}

/**
 * Le dossier n'a encore rien reçu : ni profil, ni client, ni écriture.
 *
 * Exporté pour être éprouvé : c'est la condition qui décide de l'accueil, et
 * un champ oublié ici le ferait apparaître sur un dossier en cours.
 */
export function dossierVide(f: Faits): boolean {
  const e = f.entreprise;
  return e.nom.trim() === '' && e.prenom.trim() === '' && e.debutActivite === null
    && f.clients.length === 0 && f.missions.length === 0 && f.recettes.length === 0
    && f.depenses.length === 0 && f.echeances.length === 0 && f.mouvementsBancaires.length === 0;
}

export function Accueil() {
  const faits = useFaits((e) => e.faits);
  const pret = useFaits((e) => e.chargement.phase === 'pret');
  const vide = dossierVide(faits);
  const [ecarte, setEcarte] = useState(lireEcarte);

  // Le dossier s'est rempli : l'envie de ne plus voir l'accueil s'oublie,
  // pour qu'il revienne si l'on repart un jour de zéro.
  useEffect(() => {
    if (!vide && ecarte) { ecrireEcarte(false); setEcarte(false); }
  }, [vide, ecarte]);

  if (!pret || !vide || ecarte) return null;

  function ecarter(): void {
    ecrireEcarte(true);
    setEcarte(true);
  }

  return (
    <Sheet
      ouvert
      variante="atelier"
      titre="Bienvenue dans Freel"
      sousTitre="par où commencer ?"
      onFermer={ecarter}
    >
      <ContenuAccueil onFini={ecarter} />
    </Sheet>
  );
}

function ContenuAccueil({ onFini }: { readonly onFini: () => void }) {
  const [demarrer, setDemarrer] = useState(false);
  const [refusDemo, setRefusDemo] = useState<string | null>(null);
  const adopter = useFaits((e) => e.adopterFaitsDistants);

  function aller(route: string): void {
    onFini();
    window.location.hash = route;
  }

  async function voirLaDemonstration(): Promise<void> {
    setRefusDemo(null);
    try {
      const reponse = await fetch(`${import.meta.env.BASE_URL}jeu-de-demonstration.json`);
      if (!reponse.ok) throw new Error('indisponible');
      const brut: unknown = await reponse.json();
      // Recalé sur la date du jour, comme depuis Données : un jeu figé au
      // 10 juin montrerait en novembre quatre périodes « en retard ».
      const { recalerJeuBrut } = await import('../../state/demonstration.recalage');
      const refus = await adopter(recalerJeuBrut(brut, dateDuJour()));
      if (refus !== null) { setRefusDemo(refus); return; }
      onFini();
    } catch {
      setRefusDemo('Le jeu de démonstration n’a pas pu être chargé. Vérifie ta connexion, puis réessaie.');
    }
  }

  if (demarrer) return <ProfilMinimal onFini={onFini} onRetour={() => setDemarrer(false)} />;

  return (
    <div className={styles.accueil}>
      <p className={styles.chapeau}>
        Freel suit ce que tu encaisses, ce que tu dois à l’URSSAF et aux impôts,
        et ce que tu peux te verser. Tout reste dans ce navigateur, sauf si tu
        relies un compte.
      </p>

      <ul className={styles.chemins}>
        <li className={styles.chemin}>
          <h3 className={styles.titreChemin}>Commencer avec mes données</h3>
          <p className={styles.texte}>
            Six questions sur ton activité, le reste se règle au fil de l’eau.
          </p>
          <button type="button" className={styles.principal} onClick={() => setDemarrer(true)}>
            Commencer
          </button>
        </li>
        <li className={styles.chemin}>
          <h3 className={styles.titreChemin}>Reprendre l’ancienne application</h3>
          <p className={styles.texte}>
            Tes données sont sur ton compte&nbsp;? Connecte-toi, puis
            «&nbsp;Reprendre les données de l’ancienne application&nbsp;». Si elles
            étaient dans ce navigateur, elles auraient déjà été reprises.
          </p>
          <button type="button" className={styles.secondaire} onClick={() => aller('#/config/compte')}>
            Aller au compte
          </button>
        </li>
        <li className={styles.chemin}>
          <h3 className={styles.titreChemin}>Restaurer une sauvegarde</h3>
          <p className={styles.texte}>
            Un fichier JSON ou une archive ZIP exportés de Freel, sur un autre
            appareil ou avant une réinstallation.
          </p>
          <button type="button" className={styles.secondaire} onClick={() => aller('#/config/donnees')}>
            Aller aux données
          </button>
        </li>
      </ul>

      <div className={styles.demo}>
        <p className={styles.texte}>
          Juste regarder&nbsp;? Le jeu de démonstration montre un dossier fictif,
          déjà rempli. Il se retire d’un geste, dans Données.
        </p>
        <button type="button" className={styles.lien} onClick={() => void voirLaDemonstration()}>
          Voir la démonstration
        </button>
        {refusDemo !== null && <p role="alert" className={styles.refus}>{refusDemo}</p>}
      </div>
    </div>
  );
}

const ACTIVITES: readonly { readonly id: TypeActivite; readonly libelle: string }[] = [
  { id: 'BNC', libelle: 'Prestations libérales (BNC)' },
  { id: 'BIC_service', libelle: 'Prestations de services commerciales (BIC)' },
  { id: 'BIC_vente', libelle: 'Vente de marchandises (BIC)' }
];

/**
 * Le profil minimal : ce sans quoi aucun chiffre de l'application n'est juste.
 *
 * Le type d'activité choisit le taux de cotisations ; le début d'activité, les
 * périodes à déclarer et l'ACRE ; le versement libératoire et la TVA changent
 * ce qui est provisionné. Le reste — SIRET, adresse, IBAN — ne change aucun
 * calcul et attend Config : six questions de plus ici feraient renoncer.
 */
function ProfilMinimal({ onFini, onRetour }: { readonly onFini: () => void; readonly onRetour: () => void }) {
  const modifier = useFaits((e) => e.modifierEntreprise);
  const signaler = useToast();
  const id = useId();
  const [prenom, setPrenom] = useState('');
  const [activite, setActivite] = useState<TypeActivite>('BNC');
  const [debut, setDebut] = useState('');
  const [acre, setAcre] = useState(false);
  const [vl, setVl] = useState(false);
  const [tva, setTva] = useState<'franchise' | 'redevable'>('franchise');
  const [tvaDepuis, setTvaDepuis] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  function valider(evenement: React.FormEvent): void {
    evenement.preventDefault();
    if (debut !== '' && debut > dateDuJour()) {
      setErreur('Le début d’activité ne peut pas être dans le futur : c’est lui qui ouvre les périodes à déclarer.');
      return;
    }
    if (tva === 'redevable' && !/^\d{4}-\d{2}$/.test(tvaDepuis)) {
      setErreur('Indique le mois depuis lequel tu factures la TVA : c’est lui qui sépare les factures avec et sans TVA.');
      return;
    }
    const depuis: Mois | null = tva === 'redevable' ? versMois(tvaDepuis) : null;
    modifier({
      prenom: prenom.trim(),
      typeActivite: activite,
      debutActivite: debut === '' ? null : dateISO(debut),
      acre,
      versementLiberatoire: vl,
      tvaDepuis: depuis
    });
    signaler('Profil enregistré. Le SIRET, l’adresse et l’IBAN se règlent dans Config.');
    onFini();
  }

  return (
    <form className={styles.formulaire} onSubmit={valider}>
      <p className={styles.chapeau}>
        Ce sont les réponses dont dépendent tes cotisations, tes impôts et ta
        TVA. Tout se corrige ensuite dans Config.
      </p>

      <p className={styles.champ}>
        <label htmlFor={`${id}-prenom`}>Prénom</label>
        <input id={`${id}-prenom`} className={styles.saisie} value={prenom}
          autoComplete="given-name" onChange={(e) => setPrenom(e.target.value)} />
      </p>

      <p className={styles.champ}>
        <label htmlFor={`${id}-activite`}>Ton activité</label>
        <select id={`${id}-activite`} className={styles.saisie} value={activite}
          onChange={(e) => setActivite(e.target.value as TypeActivite)}>
          {ACTIVITES.map((a) => <option key={a.id} value={a.id}>{a.libelle}</option>)}
        </select>
      </p>

      <p className={styles.champ}>
        <label htmlFor={`${id}-debut`}>Début d’activité</label>
        <input id={`${id}-debut`} type="date" className={styles.saisie} value={debut}
          max={dateDuJour()} onChange={(e) => setDebut(e.target.value)} />
      </p>

      <p className={styles.case}>
        <input id={`${id}-acre`} type="checkbox" checked={acre} onChange={(e) => setAcre(e.target.checked)} />
        <label htmlFor={`${id}-acre`}>Je bénéficie de l’ACRE</label>
      </p>

      <p className={styles.case}>
        <input id={`${id}-vl`} type="checkbox" checked={vl} onChange={(e) => setVl(e.target.checked)} />
        <label htmlFor={`${id}-vl`}>J’ai opté pour le versement libératoire de l’impôt</label>
      </p>

      <fieldset className={styles.groupe}>
        <legend>TVA</legend>
        <p className={styles.case}>
          <input id={`${id}-franchise`} type="radio" name={`${id}-tva`} checked={tva === 'franchise'}
            onChange={() => setTva('franchise')} />
          <label htmlFor={`${id}-franchise`}>Franchise en base : je ne facture pas de TVA</label>
        </p>
        <p className={styles.case}>
          <input id={`${id}-redevable`} type="radio" name={`${id}-tva`} checked={tva === 'redevable'}
            onChange={() => setTva('redevable')} />
          <label htmlFor={`${id}-redevable`}>Je facture la TVA</label>
        </p>
        {tva === 'redevable' && (
          <p className={styles.champ}>
            <label htmlFor={`${id}-tva-depuis`}>Depuis le mois de</label>
            <input id={`${id}-tva-depuis`} type="month" className={styles.saisie} value={tvaDepuis}
              onChange={(e) => setTvaDepuis(e.target.value)} />
          </p>
        )}
      </fieldset>

      {erreur !== null && <p role="alert" className={styles.refus}>{erreur}</p>}

      <span className={styles.actions}>
        <button type="submit" className={styles.principal}>Enregistrer mon profil</button>
        <button type="button" className={styles.secondaire} onClick={onRetour}>Retour</button>
      </span>
    </form>
  );
}

/**
 * « Démonstration », tant qu'elle est là.
 *
 * Sans ce rappel, un dossier fictif passe pour le sien au bout de dix
 * minutes — et c'est par là qu'on finit par envoyer des factures fictives
 * sur son compte. La reconnaissance est celle du garde-fou de l'envoi
 * (`estLeJeuDeDemonstration`) : une seule règle, pas deux.
 */
export function BandeauDemonstration() {
  const demo = useFaits((e) => estLeJeuDeDemonstration(e.faits.entreprise));
  if (!demo) return null;
  return (
    <p className={styles.bandeau} role="note">
      <span>Démonstration&nbsp;: ces données sont fictives.</span>
      <a className={styles.bandeauLien} href="#/config/donnees">Commencer avec mes données</a>
    </p>
  );
}

/**
 * Les deux, sous un seul chargement différé : chaque `lazy` de plus coûte au
 * paquet d'entrée sa table de dépendances, et ces deux-là arrivent ensemble.
 */
export function AccueilEtDemonstration() {
  return (
    <>
      <BandeauDemonstration />
      <Accueil />
    </>
  );
}
