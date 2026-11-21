import { useId } from 'react';
import { useFaits } from '../../state/store';
import { soldeEstSuivi } from '../../state/selecteurs';
import { dateISO, euros } from '../../domain/types';
import { Info } from '../components/Info';
import { Champ } from '../components/Champ';
import styles from './Config.module.css';

/* ─────────────────────────────────────────────────────────────────────────
   Trésorerie
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Le point de départ du solde, sa date, et le besoin mensuel.
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
 * UN SOLDE N'EST UN POINT DE DÉPART QUE S'IL EST DATÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ce champ s'appelait « Solde du compte aujourd'hui », et c'était le bug : ce
 * montant contient DÉJÀ tous les encaissements et paiements passés, exactement
 * comme n'importe quel solde bancaire. L'application dérivait pourtant le
 * solde affiché en y rajoutant les recettes encaissées et les dépenses payées
 * — une seconde fois le même euro, dans le sens le plus dangereux : un solde
 * plus haut qu'il ne l'est, qui invite à se verser de l'argent déjà sorti.
 *
 * Le champ demande maintenant deux choses : le montant, ET la date à laquelle
 * il était vrai. Sans elle, l'application ne peut pas savoir ce qu'il contient
 * déjà et S'ABSTIENT de rien y ajouter (voir `domain/calculs/solde.ts`,
 * `ProvenanceSolde['sansDate']`) — le comportement d'avant que le solde ne se
 * dérive des faits. Avec elle, seuls les faits STRICTEMENT postérieurs
 * s'ajoutent : une recette encaissée hier, saisie après coup, ne s'y rajoute
 * pas ; une recette encaissée demain, si.
 */
export function Reserve() {
  const faits = useFaits((e) => e.faits);
  const definirSoldeInitial = useFaits((e) => e.definirSoldeInitial);
  const definirSoldeInitialAu = useFaits((e) => e.definirSoldeInitialAu);
  const definirBesoinMensuel = useFaits((e) => e.definirBesoinMensuel);
  const idChamp = useId();
  const suivi = soldeEstSuivi(faits);

  return (
    <div className={styles.carte}>
      <h3 id={`${idChamp}-titre`} className={styles.titreCarte}>
        Trésorerie
        <Info libelle="D’où vient le solde">
          Le solde de cette application vient de ta <strong>banque</strong>,
          pas d’un calcul. Tu indiques ici le point de départ&nbsp;; les
          mouvements d’un relevé importé, et les faits enregistrés APRÈS la
          date que tu poses, s’y ajoutent ensuite. L’ancienne version, elle,
          simulait le solde à partir des encaissements et des charges cochées
          payées — un chiffre qui dérive dès qu’une case est mal cochée.
        </Info>
      </h3>

      <div className={styles.formulaire}>
        <Champ
          id={`${idChamp}-solde`}
          libelle={suivi ? 'Solde avant le premier mouvement importé' : 'Solde de ton compte'}
          aide={suivi
            ? 'Un relevé est importé : ce montant est le point de départ auquel '
              + 'ses mouvements s’ajoutent. Le modifier décale tout le solde.'
            : 'Le montant que tu relèves sur ton compte, à la date que tu '
              + 'indiques juste en dessous.'}
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
          id={`${idChamp}-solde-date`}
          libelle="Ce solde était vrai le"
          aide={faits.soldeInitialAu === null
            ? 'Sans cette date, l’application ne peut pas savoir si une recette '
              + 'ou une dépense que tu enregistres ensuite est déjà comptée '
              + 'dans ce montant — elle s’abstient donc de l’ajouter, et le '
              + 'solde affiché reste exactement celui du dessus.'
            : 'Tout ce que tu encaisses ou paies APRÈS cette date s’ajoute '
              + 'désormais au solde affiché ; ce qui est daté d’avant, ou de '
              + 'ce jour-là, est déjà compté dans le montant ci-dessus.'}
        >
          <input
            id={`${idChamp}-solde-date`}
            type="date"
            value={faits.soldeInitialAu ?? ''}
            onChange={(e) => definirSoldeInitialAu(
              /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? dateISO(e.target.value) : null
            )}
          />
        </Champ>

        <Champ
          id={`${idChamp}-besoin`}
          libelle="Besoin mensuel"
          aide="Ce qu’il te faut pour vivre chaque mois. Sert à calculer ton
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
      </div>

      <ReservesEtVersements />
      <Objectif />
    </div>
  );
}

/**
 * L'objectif de chiffre d'affaires, rangé avec la réserve : c'est le handoff
 * qui l'y met, et il se règle au même moment que la réserve — quand on décide
 * de ce que l'année doit rapporter et de ce qu'on en garde.
 */
function Objectif() {
  const definirObjectif = useFaits((e) => e.definirObjectifCaAnnuel);
  const objectifCaAnnuel = useFaits((e) => e.faits.objectifCaAnnuel);
  const idChamp = useId();
  return (
    <div className={styles.formulaire}>
        {/* Le champ est vide quand aucun objectif n'est fixé, et non à « 0 ».
            Un zéro affiché se lirait comme un objectif de zéro euro, alors que
            l'état réel est « je ne m'en suis pas fixé » — et c'est cet état-là
            qui fait que le graphe n'affiche aucune ligne d'objectif. */}
        <Champ
          id={`${idChamp}-objectif`}
          libelle="Objectif de chiffre d’affaires sur l’année"
          aide="Facultatif. Sur l’encaissé, comme les plafonds et l’impôt — un
                objectif sur le facturé serait atteint sans que le compte l’ait
                vu passer. Laisse vide pour ne pas en fixer."
        >
          <input
            id={`${idChamp}-objectif`}
            type="number"
            inputMode="decimal"
            step="1000"
            min="0"
            placeholder="Aucun objectif"
            value={objectifCaAnnuel ?? ''}
            onChange={(e) => definirObjectif(
              e.target.value === '' ? null : euros(Number(e.target.value) || 0)
            )}
          />
        </Champ>
    </div>
  );
}

/**
 * La réserve — le seul réglage de prudence depuis le schéma 28 (décision 24).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN PLANCHER EN EUROS, ET PLUS DE PART EN POURCENTAGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La RÉSERVE est un montant absolu : la ligne sous laquelle le compte ne
 * descend pas (D4, fait `reserve`). Une « part gardée à chaque versement » se
 * réglait à côté, au curseur, et faisait un second « à te verser » sous le
 * même nom, égal au premier seulement à 0 %. Elle s'est fondue dans la
 * réserve : qui veut garder plus relève le plancher, et l'écran ne porte plus
 * qu'un montant à se verser.
 *
 * Elle reste un plancher, jamais un pourcentage du disponible : un plancher
 * qui descend à mesure qu'on vide le compte laisserait le versement tenable
 * tout autoriser.
 */
function ReservesEtVersements() {
  const reserve = useFaits((e) => e.faits.reserve);
  const definirReserve = useFaits((e) => e.definirReserve);
  const idChamp = useId();

  return (
    <div className={styles.formulaire}>
      {/* Un CHAMP et non un curseur : une plage a besoin d'une borne haute, et
          la seule disponible ici est le solde — quelqu'un qui a 8 000 € en
          banque mais n'a pas encore saisi son solde de départ ne pourrait pas
          se fixer un plancher à 5 000 €. */}
      <Champ
        id={`${idChamp}-seuil`}
        libelle="Réserve"
        aide="Le montant que tu gardes sur le compte quoi qu’il arrive. Il est
              retiré du disponible pour obtenir ce que tu peux te verser, et
              c’est le plancher tracé sur tes courbes. Pour garder plus à chaque
              versement, relève-le."
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
    </div>
  );
}
