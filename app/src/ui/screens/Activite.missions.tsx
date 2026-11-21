import { useMemo, useState } from 'react';
import type { DateISO } from '../../domain/types';
import { useFaits } from '../../state/store';
import { type EtatDuCarnet, type LigneDuCarnet, etatDuCarnet } from '../../state/selecteurs.carnet';
import { Info } from '../components/Info';
import { Montant } from '../components/Montant';
import { Tuile } from '../components/Tuile';
import { Vide } from '../components/Vide';
import { eur, formaterJours, initiales } from '../format';
import { enumeration } from './Activite.clientsMission.lecture';
import { FriseDuCarnet, LegendeDuCarnet, rangeesDeLaFrise, resumeDeLaFrise } from './Activite.missions.frise';
import {
  clientsFinaux, dansNJours, jourEtMoisCourt, jourEtMoisLong, moisCourt, moisLongSeul, pastilleDeLEtat,
  phraseDeFin, sousTitreDeMission
} from './Activite.missions.lecture';
import styles from './Activite.missions.module.css';

/**
 * L'onglet Missions : le carnet de commandes (lot 48), d'après la maquette
 * `docs/design/direction/activite.html`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS QUESTIONS, DANS L'ORDRE OÙ ON SE LES POSE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Combien est signé, jusqu'à quand, et comment se remplit le mois — les trois
 * tuiles. Puis la forme des douze mois, où se voit le trou qu'une liste de
 * dates cache. Puis chaque mission, avec ce qu'elle a produit et ce qu'elle
 * attend. L'ancienne liste répondait à la troisième seulement : on y lisait
 * le facturé d'une mission, jamais ce qui restait à produire ni quand tout
 * s'arrêtait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUCUN GESTE PERDU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le nom de chaque mission ouvre son formulaire, comme la ligne entière le
 * faisait : modifier, changer de statut (l'arrêter), la supprimer, arrêter ou
 * retirer un client opérationnel (lot 31), choisir comment elle se facture.
 * « + Ajouter une mission » reste en tête de l'écran. Ce qui se lisait sur
 * l'ancienne ligne se lit encore : la suite des clients d'une mission qui en a
 * changé, le montant partagé entre deux missions d'un même client, le reste à
 * rentrer, un tarif absent.
 *
 * Chargé à la demande, comme avant lui la liste : le plan de charge, qu'on
 * ouvre tous les matins, n'a pas à payer la frise ni le tableau.
 */
export function OngletMissions(
  { idGroupe, onOuvrirMission }: {
    readonly idGroupe: string;
    readonly onOuvrirMission: (id: string | null) => void;
  }
) {
  const faits = useFaits((e) => e.faits);
  const etat = useMemo(() => etatDuCarnet(faits), [faits]);
  const [filtre, setFiltre] = useState<Filtre>('toutes');

  if (faits.missions.length === 0) {
    return (
      <section className={styles.carte} aria-labelledby={`${idGroupe}-missions`}>
        <h2 id={`${idGroupe}-missions`} className={styles.titreCarte}>Toutes les missions</h2>
        <Vide
          message="Aucune mission enregistrée. Une mission porte le tarif journalier, les dates et le volume commandé qui remplissent le carnet."
          action={(
            <button type="button" className={styles.bouton} onClick={() => onOuvrirMission(null)}>
              Ajouter une mission
            </button>
          )}
        />
      </section>
    );
  }

  const lignes = ordonner(etat.lignes);
  const teintes = teintesDesMissions(lignes);
  const rangees = rangeesDeLaFrise(lignes, etat.mois, teintes);
  const annonces = lignes
    .filter((l) => l.finAnnoncee !== null)
    .sort((a, b) => (a.finAnnoncee?.jours ?? 0) - (b.finAnnoncee?.jours ?? 0));
  const visibles = lignes.filter((l) => FILTRES[filtre].garde(l));

  return (
    <div className={styles.onglet}>
      <Tuiles etat={etat} />

      <section className={styles.carte} aria-labelledby={`${idGroupe}-carnet`}>
        <div className={styles.entete}>
          <h2 id={`${idGroupe}-carnet`} className={styles.titreCarte}>Les douze mois à venir</h2>
          <LegendeDuCarnet />
        </div>
        {rangees.length === 0
          ? <p className={styles.vide}>Ni mission signée ni prospect sur les douze mois à venir.</p>
          : (
            <FriseDuCarnet
              rangees={rangees}
              mois={etat.mois}
              joursSignes={etat.joursSignes}
              aujourdhui={etat.aujourdhui}
              resume={resumeDeLaFrise(rangees, etat.mois, etat.joursSignes, etat.visibilite, etat.aujourdhui)}
            />
          )}
        {annonces.map((l) => {
          const p = phraseDeFin(l.nom, l.finAnnoncee as NonNullable<LigneDuCarnet['finAnnoncee']>, etat.aujourdhui);
          return <p key={l.mission.id} className={styles.alerte}><strong>{p.fort}</strong> <span>{p.suite}</span></p>;
        })}
      </section>

      <section className={`${styles.carte} ${styles.carteTable}`} aria-labelledby={`${idGroupe}-missions`}>
        <div className={styles.entete}>
          <h2 id={`${idGroupe}-missions`} className={styles.titreCarte}>
            Toutes les missions
            <Info libelle="Comment les montants sont rattachés">
              Une facture ne porte pas le nom de la mission qui l’a
              produite&nbsp;: le modèle ne relie que le <em>client</em>. Le
              rattachement se fait donc par client <em>et</em> par fenêtre de
              dates, ce qui sépare correctement deux missions successives.
              Restent les missions d’un même client menées en même temps,
              qu’aucune date ne peut départager&nbsp;: la ligne annonce alors
              que le montant est celui du client. Les jours faits viennent du
              planning, jusqu’à aujourd’hui inclus — les mêmes que le compte
              rendu.
            </Info>
          </h2>
          <div className={styles.filtres} role="group" aria-label="Filtrer les missions">
            {(Object.keys(FILTRES) as Filtre[]).map((f) => (
              <button key={f} type="button" aria-pressed={filtre === f}
                className={filtre === f ? `${styles.filtre} ${styles.filtreActif}` : styles.filtre}
                onClick={() => setFiltre(f)}>
                {FILTRES[f].libelle} <b>{lignes.filter((l) => FILTRES[f].garde(l)).length}</b>
              </button>
            ))}
          </div>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Mission</th>
              <th scope="col">Facturée à</th>
              <th scope="col" className={styles.d}>Tarif</th>
              <th scope="col" className={styles.decale}>Jours faits</th>
              <th scope="col" className={styles.d}>Facturé</th>
              <th scope="col" className={styles.d}>Encaissé</th>
              <th scope="col" className={styles.decale}>Fin</th>
              <th scope="col">État</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((l) => (
              <LigneDeMission key={l.mission.id} ligne={l} teinte={teintes.get(l.mission.id) ?? 0}
                aujourdhui={etat.aujourdhui} onOuvrir={() => onOuvrirMission(l.mission.id)} />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

type Filtre = 'toutes' | 'en_cours' | 'prospects' | 'terminees';

/* Une perdue se range avec les terminées : elle est close, et sa pastille dit
   « Perdue ». Un filtre à elle seule montrerait presque toujours zéro. */
const FILTRES: Readonly<Record<Filtre, { readonly libelle: string; readonly garde: (l: LigneDuCarnet) => boolean }>> = {
  toutes: { libelle: 'Toutes', garde: () => true },
  en_cours: { libelle: 'En cours', garde: (l) => l.mission.statut === 'active' },
  prospects: { libelle: 'Prospects', garde: (l) => l.mission.statut === 'prospect' },
  terminees: { libelle: 'Terminées', garde: (l) => l.mission.statut === 'terminee' || l.mission.statut === 'perdue' }
};

const RANG: Readonly<Record<LigneDuCarnet['mission']['statut'], number>> = { active: 0, prospect: 1, terminee: 2, perdue: 3 };

/** Les signées d'abord, puis les prospects, puis ce qui est clos ; l'ordre de saisie ensuite. */
export function ordonner(lignes: readonly LigneDuCarnet[]): readonly LigneDuCarnet[] {
  return lignes.map((l, i) => ({ l, i }))
    .sort((a, b) => RANG[a.l.mission.statut] - RANG[b.l.mission.statut] || a.i - b.i)
    .map(({ l }) => l);
}

/**
 * La teinte de chaque mission : les trois couleurs de clients de la planche
 * (`--k1` à `--k3`) pour les missions signées, dans l'ordre ; le gris hachuré
 * (`k0`) pour le reste. La même sur la frise et dans le tableau : c'est elle
 * qui relie une barre à sa ligne.
 */
export function teintesDesMissions(lignes: readonly LigneDuCarnet[]): ReadonlyMap<string, number> {
  let rang = 0;
  return new Map(lignes.map((l) => [l.mission.id, l.mission.statut === 'active' ? (rang++ % 3) + 1 : 0]));
}

/** « Occupation de juin », « d'août ». */
const deMois = (nom: string): string => (/^[aeiouyéèh]/iu.test(nom) ? `d’${nom}` : `de ${nom}`);

function Tuiles({ etat }: { readonly etat: EtatDuCarnet }) {
  const { carnet, visibilite, occupation } = etat;
  const c = occupation.chiffres;
  const libelleJours = c.source === 'planning' ? 'jours' : 'équivalent-jours';
  const toutSansFin = carnet.signees > 0 && carnet.jours === 0 && carnet.sansFinFixee.length === carnet.signees;
  return (
    <div className={styles.tuiles}>
      <Tuile
        etiquette="Carnet signé"
        valeur={carnet.signees === 0 ? '—' : toutSansFin ? 'Sans fin' : `${formaterJours(carnet.jours)} ${carnet.jours > 1 ? 'jours' : 'jour'}`}
        explication={carnet.signees === 0
          ? 'Aucune mission signée.'
          : toutSansFin
            ? 'Aucune mission signée n’a de fin ni de volume : rien ne se compte.'
            : (
              <>
                <Montant>{eur(carnet.euros)}</Montant> qu’il te reste à produire
                {carnet.sansFinFixee.length > 0 && <>, hors {enumeration(carnet.sansFinFixee)} (sans fin fixée)</>}
                {carnet.sansTarif.length > 0 && <>, {enumeration(carnet.sansTarif)} sans tarif</>}
              </>
            )}
        {...(carnet.signees > 0 ? { tendance: etat.joursSignes.map((j) => j ?? 0), teinte: 'urssaf' as const } : {})}
      />
      <Tuile
        etiquette="Fin de visibilité"
        valeur={visibilite.type === 'date'
          ? jourEtMoisLong(visibilite.date, etat.aujourdhui)
          : visibilite.type === 'sans_fin' ? 'Sans fin' : '—'}
        explication={visibilite.type === 'date'
          ? `${majuscule(dansNJours(visibilite.jours))}, ${visibilite.reconduite ? 'sauf reconduction' : 'plus rien n’est signé'}`
          : visibilite.type === 'sans_fin'
            ? 'Une mission signée n’a pas de fin fixée.'
            : 'Aucune mission signée ne court encore.'}
        {...(visibilite.type === 'date' && visibilite.aPreparer
          ? { pastille: <span className={`${styles.pastille} ${styles.attention}`}>◇ À préparer</span> }
          : {})}
      />
      <Tuile
        etiquette={`Occupation ${deMois(moisLongSeul(occupation.mois))}`}
        valeur={c.occupation === null ? '—' : `${Math.round(c.occupation * 100)} %`}
        explication={c.occupation === null
          ? 'Aucun jour ouvré ce mois-ci.'
          : `${formaterJours(c.joursTravailles)} ${libelleJours} sur ${formaterJours(c.joursOuvrables)} ouvrés`
            + (c.joursDeConge > 0
              ? `, ${formaterJours(c.joursDeConge)} ${c.joursDeConge > 1 ? 'jours de congé retirés' : 'jour de congé retiré'}`
              : '')}
        tendance={occupation.tendance}
        teinte="vert"
      />
    </div>
  );
}

const majuscule = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

function LigneDeMission(
  { ligne: l, teinte, aujourdhui, onOuvrir }: {
    readonly ligne: LigneDuCarnet;
    readonly teinte: number;
    readonly aujourdhui: DateISO;
    readonly onOuvrir: () => void;
  }
) {
  const m = l.mission;
  const sous = sousTitreDeMission(m, aujourdhui);
  const intermediaire = clientsFinaux(m).length > 0;
  const p = pastilleDeLEtat(l.etat, aujourdhui);
  return (
    <tr>
      <td className={styles.cMission}>
        <div className={styles.qui}>
          <span className={`${styles.avatar} ${styles[`k${teinte}`] ?? ''}`} aria-hidden="true">
            {initiales(m.clientNom || l.nom)}
          </span>
          <div className={styles.nom}>
            <button type="button" className={styles.ouvrir} onClick={onOuvrir}>{l.nom}</button>
            {sous !== null && <small>{sous}</small>}
          </div>
        </div>
      </td>
      <td className={styles.cClient}>
        {m.clientNom || 'Client non renseigné'}
        {intermediaire && <small>intermédiaire</small>}
      </td>
      <td className={`${styles.d} ${styles.mono} ${styles.cTarif}`} data-libelle="Tarif">
        {/* Un tarif absent se dit : en supposer un fabriquerait des jours et des euros. */}
        {m.tjm > 0 ? <Montant>{eur(m.tjm)}</Montant> : <span className={styles.discret}>TJM non renseigné</span>}
      </td>
      <td className={`${styles.decale} ${styles.cJours}`} data-libelle="Jours faits"><Avancement ligne={l} /></td>
      <td className={`${styles.d} ${styles.mono} ${styles.cFacture}`} data-libelle="Facturé">
        {l.facture !== 0 ? <Montant>{eur(l.facture)}</Montant> : '—'}
        {/* Deux missions d'un même client en même temps : le montant est celui
            du client, et le taire l'attribuerait à l'une d'elles sans le dire. */}
        {l.missionsQuiPartagent > 1 && (
          <small className={styles.note}>
            partagé avec {l.missionsQuiPartagent - 1} autre{l.missionsQuiPartagent > 2 ? 's' : ''}
          </small>
        )}
      </td>
      <td className={`${styles.d} ${styles.mono} ${styles.cEncaisse}`} data-libelle="Encaissé">
        {l.encaisse !== 0 ? <Montant>{eur(l.encaisse)}</Montant> : '—'}
        {l.resteARentrer > 0 && m.statut !== 'terminee' && (
          <small className={styles.reste}>reste <Montant>{eur(l.resteARentrer)}</Montant></small>
        )}
      </td>
      <td className={`${styles.decale} ${styles.cFin}`} data-libelle="Fin"><Fin ligne={l} aujourdhui={aujourdhui} /></td>
      <td className={styles.cEtat}>
        <span className={`${styles.pastille} ${p.ton === 'ok' ? styles.ok : p.ton === 'attention' ? styles.attention : ''}`}>
          {p.texte}
          {p.montant !== undefined && <> <Montant>{eur(p.montant)}</Montant> {p.suite}</>}
        </span>
      </td>
    </tr>
  );
}

/** « 15,5 / 32 » et sa barre ; le volume seul pour un prospect ; le nombre seul sans volume. */
function Avancement({ ligne: l }: { readonly ligne: LigneDuCarnet }) {
  const commandes = l.joursCommandes;
  if (l.joursFaits === null) {
    return commandes === null
      ? <span className={styles.mono}>—</span>
      : (
        <div className={styles.avancement}>
          <span>— / {formaterJours(commandes)}</span>
          <i className={styles.piste}><b style={{ width: '0%' }} /></i>
        </div>
      );
  }
  if (commandes === null || commandes <= 0) return <span className={styles.mono}>{formaterJours(l.joursFaits)}</span>;
  const part = Math.min(1, l.joursFaits / commandes);
  return (
    <div className={styles.avancement}>
      <span>{formaterJours(l.joursFaits)} / {formaterJours(commandes)}</span>
      {/* Au-delà du volume, la barre reste pleine et passe à l'ambre : le
          dépassement se dit, il ne s'allonge pas hors de la colonne. */}
      <i className={styles.piste} aria-hidden="true">
        <b className={l.joursFaits > commandes ? styles.depasse : undefined} style={{ width: `${Math.round(part * 100)}%` }} />
      </i>
    </div>
  );
}

function Fin({ ligne: l, aujourdhui }: { readonly ligne: LigneDuCarnet; readonly aujourdhui: DateISO }) {
  const m = l.mission;
  if (m.statut === 'prospect') {
    if (m.debut !== null && m.fin !== null) {
      return <>{moisCourt(m.debut) === moisCourt(m.fin) && m.debut.slice(0, 7) === m.fin.slice(0, 7)
        ? moisCourt(m.debut) : `${moisCourt(m.debut)} à ${moisCourt(m.fin)}`}</>;
    }
    return <>{m.fin === null ? '—' : jourEtMoisCourt(m.fin, aujourdhui)}</>;
  }
  if (m.statut === 'active') {
    if (l.echeance === null) return <span className={styles.discret}>sans fin fixée</span>;
    return (
      <>
        {jourEtMoisCourt(l.echeance, aujourdhui)}
        {(m.reconduction?.dureeMois ?? 0) >= 1 && <small>reconduction tacite</small>}
      </>
    );
  }
  return <>{m.fin === null ? '—' : jourEtMoisCourt(m.fin, aujourdhui)}</>;
}
