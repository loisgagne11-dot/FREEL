import { CartePliable } from '../components/CartePliable';
import { Info } from '../components/Info';
import { Montant } from '../components/Montant';
import { ecartDePrevision, totaliserPrevisions } from '../../domain/calculs/prevision';
import type {
  PrevisionDeMission, RapportDeMission, TarifDeLaJournee
} from '../../state/selecteurs.activite';
import { type Mois, euros } from '../../domain/types';
import { eur, formaterJours } from '../format';
import styles from './Activite.module.css';

/**
 * Les trois cartes d'ANALYSE de l'écran Activité.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLES VIVENT À PART, ET PLUS BAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elles répondent toutes trois à « combien ça rapporte » : ce que les missions
 * devaient produire face à ce qu'elles produisent, ce que chacune vaut par
 * journée passée dessus, ce qu'une journée laisse une fois les charges déduites.
 * C'est une question COMMERCIALE, qu'on se pose en fin de mois ou avant une
 * renégociation.
 *
 * L'écran, lui, s'ouvre sur « qu'est-ce que j'ai travaillé ». Ces cartes étaient
 * AU-DESSUS du plan de charge : il fallait les dépasser pour arriver à la grille
 * qu'on venait consulter, et le budget de l'écran différé les payait à chaque
 * ouverture. Le dessin met le plan de charge en tête ; elles passent dessous, et
 * arrivent à la demande.
 *
 * Aucun chiffre n'est calculé ici : tout vient des sélecteurs.
 */

/**
 * Ce que les missions devaient rapporter ce mois-ci, et ce qu'elles rapportent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE PREMIER MAILLON DE LA CHAÎNE QUI PART DE LA MISSION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une mission doit se décliner en prévision de revenu, planning, facture du
 * mois et CRA. Le planning et le CRA existaient ; la prévision non — le tarif
 * journalier et le rythme étaient là, et rien n'en tirait ce qu'ils annoncent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX COLONNES, PARCE QUE L'ÉCART EST L'INFORMATION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le prévu vient du rythme, le retenu de ce qui a été ajusté journée par
 * journée. N'afficher que l'un des deux ferait disparaître la question qui
 * compte : « est-ce que je tiens ce que j'avais prévu ? ». Un mois travaillé
 * trois jours de moins que le rythme doit se voir, et il ne se voit qu'en
 * gardant les deux nombres côte à côte.
 *
 * Les missions sans aucune journée retenue restent affichées — contrairement au
 * CRA, qui ne liste que ce qui se facture. Une mission qui devait rapporter et
 * n'a rien rapporté est précisément ce qu'on cherche à voir.
 */
export function CartePrevision(
  { previsions, mois: m }: {
    readonly previsions: readonly PrevisionDeMission[];
    readonly mois: Mois;
  }
) {
  if (previsions.length === 0) return null;

  const total = totaliserPrevisions(previsions.map((p) => p.prevision), m);
  const ecart = ecartDePrevision(total);

  return (
    <CartePliable
      id="prevision"
      ecran="activite"
      titre="Ce que le mois devrait rapporter"
            aide={<Info libelle="D’où vient cette prévision">
            Du <strong>rythme</strong> de chaque mission et de son tarif
            journalier, congés et jours fériés déduits. Chaque journée est
            valorisée au tarif <em>en vigueur à sa date</em>&nbsp;: appliquer
            celui d’aujourd’hui réécrirait le passé à chaque renégociation.
            Le « retenu » est ce que tes ajustements journaliers ont retenu —
            c’est lui qui se facturera.
          </Info>}
      resume={(
        <>
          <Montant>{eur(total.montantPrevu)}</Montant> prévus
          {' · '}<Montant>{eur(total.montantRetenu)}</Montant> retenus
          {ecart !== 0 && (
            <>{' · écart '}<Montant>{eur(euros(ecart))}</Montant></>
          )}
        </>
      )}
    >
      <ul className={styles.liste}>
        {previsions.map((p) => (
          <li key={`${p.missionId}-${p.entiteId}`} className={styles.lignePrevision}>
            <span className={styles.lignePrevisionNom}>{p.libelle}</span>
            <span className={styles.lignePrevisionChiffres}>
              <span className={styles.lignePrevisionJours}>
                {formaterJours(p.prevision.joursRetenus)} / {formaterJours(p.prevision.joursPrevus)} j
              </span>
              <span className={styles.lignePrevisionMontant}>
                <Montant>{eur(p.prevision.montantRetenu)}</Montant>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </CartePliable>
  );
}

/**
 * Ce que chaque mission rapporte, face à ce qu'elle prend de temps.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN TABLEAU, ET PAS UN GRAPHE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Quelle mission me rapporte quoi et me prend combien de charge de temps » :
 * la question était posée telle quelle, et personne ne l'avait jamais mise en
 * face d'elle-même. L'ancienne application avait le rapport et la charge dans
 * deux écrans différents, jamais croisés.
 *
 * Ce qui se compare ici, ce sont des RATIOS — des euros par jour — et non des
 * proportions. Un camembert répond à « quelle part du gâteau », ce qui n'est
 * pas la question : une mission qui pèse 15 % du chiffre d'affaires en
 * consommant 40 % du temps est un problème que sa part ne montre pas. Un
 * tableau trié par euro-jour met la réponse en première ligne.
 *
 * Un vrai `<table>` plutôt qu'une liste de `<div>` : trois colonnes qui se
 * comparent d'une ligne à l'autre sont un tableau, et un lecteur d'écran doit
 * pouvoir annoncer « Studio Lumen, 620 euros par jour » plutôt que quatre
 * fragments sans en-tête.
 */
export function CarteRapportParMission(
  { rapports, annee }: {
    readonly rapports: readonly RapportDeMission[];
    readonly annee: number;
  }
) {
  if (rapports.length === 0) return null;

  const meilleur = rapports[0] as RapportDeMission;

  return (
    <CartePliable
      id="rapport-mission"
      ecran="activite"
      titre="Ce que chaque mission rapporte, et ce qu’elle coûte en temps"
            aide={<Info libelle="Pourquoi l’euro-jour, et d’où vient le montant">
            La colonne qui décide est l’<strong>euro par jour</strong>&nbsp;:
            une mission qui pèse peu dans le chiffre d’affaires en consommant
            beaucoup de temps est un problème que sa part ne montre pas.
            Le montant est celui du travail <em>produit</em>, tiré du planning
            et valorisé au tarif en vigueur à chaque date — et non de
            l’encaissé, qui ne se rattache qu’au client et que deux missions
            simultanées ne pourraient pas se partager.
          </Info>}
      resume={(
        <>
          {meilleur.libelle} rapporte{' '}
          <Montant>{eur(meilleur.parJour ?? euros(0))}</Montant> par jour
          {rapports.length > 1 && ` · ${rapports.length} missions sur ${annee}`}
        </>
      )}
    >
      <table className={styles.tableau}>
        <caption className={styles.tableauLegende}>
          Missions de {annee}, de la mieux à la moins bien rémunérée par journée
        </caption>
        <thead>
          <tr>
            <th scope="col">Mission</th>
            <th scope="col">Jours</th>
            <th scope="col">Produit</th>
            <th scope="col">€ / jour</th>
            <th scope="col">Part du temps</th>
          </tr>
        </thead>
        <tbody>
          {rapports.map((r) => (
            <tr key={`${r.missionId}-${r.entiteId}`}>
              <th scope="row" className={styles.tableauNom}>{r.libelle}</th>
              <td>{formaterJours(r.jours)}</td>
              <td><Montant>{eur(r.produit)}</Montant></td>
              <td className={styles.tableauFort}>
                {r.parJour === null ? '—' : <Montant>{eur(r.parJour)}</Montant>}
              </td>
              <td>{Math.round(r.partDuTemps * 100)}&nbsp;%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CartePliable>
  );
}

/**
 * Ce qu'une journée rapporte vraiment, et ce qu'il en reste.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES DEUX ERREURS QU'ON FAIT SUR SON PROPRE TARIF
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un indépendant connaît son tarif journalier par cœur et se trompe deux fois
 * dessus. D'abord parce que tous les jours travaillés ne se facturent pas —
 * une remise, un forfait qui déborde, une demi-journée offerte. Ensuite parce
 * que ce qui rentre n'est pas ce qui reste : cotisations et impôt prélèvent
 * près d'un quart avant qu'on ait rien décidé.
 *
 * Les deux indicateurs existaient dans l'ancienne application et avaient
 * disparu sans motif — l'inventaire fonctionnel les donnait même pour
 * « présents » alors qu'ils n'étaient nulle part.
 *
 * Le net s'ABSTIENT quand le barème ne couvre pas la période, et dit pourquoi.
 * C'est le chiffre sur lequel on décide d'accepter une mission : le poser sur
 * un taux supposé serait la pire des approximations.
 */
export function CarteTarifJournalier(
  { tarif, annee }: { readonly tarif: TarifDeLaJournee; readonly annee: number }
) {
  const { effectif, net } = tarif;
  if (effectif.effectif === null || effectif.affiche === null) return null;

  const ecart = effectif.ecart ?? euros(0);

  return (
    <CartePliable
      id="tarif-journalier"
      ecran="activite"
      titre="Ce qu’une journée te rapporte"
            aide={<Info libelle="Pourquoi trois tarifs et non un seul">
            Le <strong>tarif des contrats</strong> vient du planning valorisé au
            tarif de chaque mission. Le <strong>tarif effectif</strong> divise
            ce qui a réellement été facturé par les mêmes journées&nbsp;: leur
            écart mesure ce qui se perd en remises, forfaits et jours non
            facturés. Le <strong>net</strong> retire cotisations et impôt — près
            d’un quart du chiffre d’affaires en micro-BNC, et l’écart que l’on
            sous-estime le plus au moment de dire oui à une mission.
          </Info>}
      resume={(
        <>
          <Montant>{eur(effectif.effectif)}</Montant> facturés par jour
          {net.statut !== 'refuse' && (
            <>{' · '}<Montant>{eur(net.valeur)}</Montant> nets</>
          )}
        </>
      )}
    >
      <dl className={styles.detail}>
        <div className={styles.ligne}>
          <dt>Tarif des contrats, sur {formaterJours(effectif.jours)} jours</dt>
          <dd><Montant>{eur(effectif.affiche)}</Montant></dd>
        </div>
        <div className={styles.ligne}>
          <dt>Tarif effectif, facturé</dt>
          <dd><Montant>{eur(effectif.effectif)}</Montant></dd>
        </div>
        {ecart !== 0 && (
          <div className={styles.ligne}>
            <dt className={ecart < 0 ? styles.attention : undefined}>
              {ecart < 0 ? 'Perdu par journée' : 'Gagné par journée'}
            </dt>
            <dd className={ecart < 0 ? styles.attention : styles.accent}>
              <Montant>{eur(euros(Math.abs(ecart)))}</Montant>
            </dd>
          </div>
        )}
        <div className={`${styles.ligne} ${styles.total}`}>
          <dt>Ce qu’il te reste, charges déduites</dt>
          <dd>
            {net.statut === 'refuse'
              ? <span className={styles.vide}>{net.motif}</span>
              : <Montant>{eur(net.valeur)}</Montant>}
          </dd>
        </div>
      </dl>

      {net.statut === 'hypothese' && (
        <p className={styles.approximation}>
          Taux de {annee} non encore publié&nbsp;: le net est calculé sur la
          dernière période connue, et n’engage pas.
        </p>
      )}
    </CartePliable>
  );
}
