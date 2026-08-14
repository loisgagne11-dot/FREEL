import type { LigneMission } from '../../state/selecteurs.activite';
import type { Mission } from '../../state/schema';
import { Info } from '../components/Info';
import { Montant } from '../components/Montant';
import { Vide } from '../components/Vide';
import { eur } from '../format';
import styles from './Activite.module.css';

/**
 * L'onglet Missions, chargé à la demande.
 *
 * Même motif que le carnet : c'est une liste qu'on ouvre pour créer ou
 * modifier, et le plan de charge — ce qu'on consulte dix fois par semaine —
 * n'a aucune raison d'en payer le téléchargement. Le budget de l'écran
 * différé le plus lourd l'a demandé, et la règle du projet est d'extraire
 * plutôt que de relever un plafond.
 */
export function OngletMissions(
  { idGroupe, missions, onOuvrirMission }: {
    readonly idGroupe: string;
    readonly missions: readonly LigneMission[];
    readonly onOuvrirMission: (id: string | null) => void;
  }
) {
  return (
          <section className={styles.carte} aria-labelledby={`${idGroupe}-missions`}>
            <h2 id={`${idGroupe}-missions`} className={styles.titreCarte}>
              Missions
              <Info libelle="Comment les montants sont rattachés">
                Une facture ne porte pas le nom de la mission qui l’a
                produite&nbsp;: le modèle ne relie que le <em>client</em>. Le
                rattachement se fait donc par client <em>et</em> par fenêtre de
                dates, ce qui sépare correctement deux missions successives.
                Restent les missions d’un même client menées en même temps,
                qu’aucune date ne peut départager&nbsp;: la ligne annonce alors
                que le montant est celui du client.
              </Info>
            </h2>
            {missions.length === 0
              ? (
                <Vide
                  message="Aucune mission enregistrée. Une mission porte le tarif journalier et les dates qui alimentent le plan de charge."
                  action={(
                    <button type="button" className={styles.actionPrincipale}
                      onClick={() => onOuvrirMission(null)}>
                      Ajouter une mission
                    </button>
                  )}
                />
              )
              : (
                <ul className={styles.liste}>
                  {missions.map((ligne) => (
                    <LigneMissionAffichee key={ligne.mission.id} ligne={ligne}
                      onOuvrir={() => onOuvrirMission(ligne.mission.id)} />
                  ))}
                </ul>
              )}
          </section>
  );
}

function LigneMissionAffichee(
  { ligne, onOuvrir }: { ligne: LigneMission; onOuvrir: () => void }
) {
  const { mission } = ligne;
  return (
    <li className={styles.ligneListe}>
      <button type="button" className={styles.ouvrir} onClick={onOuvrir}>
      <span className={styles.ligneTitre}>
        <span className={styles.ligneLibelle}>
          {/* Le nom du client vaut mieux qu'un « sans description » : dans
              l'ancienne application, c'est lui qui identifiait la mission, et
              une mission désignée par son absence de nom est illisible dans
              une liste. */}
          {mission.description || mission.clientNom || 'Mission sans description'}
        </span>
        <span className={styles.ligneMontant}><Montant>{eur(ligne.facture)}</Montant></span>
      </span>
      <span className={styles.ligneMeta}>
        <span>{mission.clientNom || 'Client non renseigné'}</span>
        <span aria-hidden="true">·</span>
        {/* Le tarif journalier est un montant comme un autre : il en dit
            autant sur les revenus que le chiffre d'affaires, et il restait
            lisible écran partagé. Trouvé par le vérificateur une fois qu'il a
            su parcourir les onglets. */}
        <span>
          {mission.tjm > 0
            ? <><Montant>{eur(mission.tjm)}</Montant> / jour</>
            : 'TJM non renseigné'}
        </span>
        <span aria-hidden="true">·</span>
        <span>{libelleStatut(mission.statut)}</span>
      </span>
      {/* Une facture ne porte pas le nom de la mission qui l'a produite. Quand
          deux missions d'un même client courent en même temps, aucune date ne
          peut les départager : le montant est celui du client, et le taire
          reviendrait à l'attribuer à l'une d'elles sans le dire. */}
      {ligne.missionsQuiPartagent > 1 && (
        <span className={styles.ligneMeta}>
          <span className={styles.approximation}>
            Chiffre du client, partagé avec {ligne.missionsQuiPartagent - 1} autre
            {ligne.missionsQuiPartagent > 2 ? 's missions' : ' mission'}
          </span>
        </span>
      )}
      <span className={styles.ligneMeta}>
        <span>Encaissé <Montant>{eur(ligne.encaisse)}</Montant></span>
        {ligne.resteARentrer > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span className={styles.attention}>Reste <Montant>{eur(ligne.resteARentrer)}</Montant></span>
          </>
        )}
      </span>
      </button>
    </li>
  );
}
function libelleStatut(statut: Mission['statut']): string {
  switch (statut) {
    case 'active': return 'En cours';
    case 'terminee': return 'Terminée';
    case 'prospect': return 'Prospect';
    case 'perdue': return 'Perdue';
  }
}
