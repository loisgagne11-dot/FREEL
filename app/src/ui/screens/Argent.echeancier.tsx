import { useId, useMemo } from 'react';
import { useFaits } from '../../state/store';
import { annulerDeclaration, declarerPeriode } from '../../state/ecritures.echeances';
import type { DateISO, Euros, Mois, Resolution } from '../../domain/types';
import { estPayee } from '../../domain/calculs/provisions';
import { dateDuJour, recettesEncaissees } from '../../state/selecteurs';
import { soldeImpotPrevuDe } from '../../state/selecteurs.impotCalendrier';
import { montantDeclaration } from '../../state/selecteurs.aTraiter';
import {
  type PeriodeADeclarer, appelsDeLaPeriode, dateDeDeclaration, moisDeclares, periodesADeclarer
} from '../../domain/calculs/declarations';
import { Echeances } from '../components/Echeances';
import { FriseEcheances } from '../components/FriseEcheances';
import { Info } from '../components/Info';
import { Montant } from '../components/Montant';
import { Statut } from '../components/Statut';
import { useToast } from '../components/Toasts';
import { dateCourte, eur } from '../format';
import styles from './Argent.module.css';

/**
 * L'échéancier : la frise de l'année, la liste des appels, les périodes URSSAF.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE BLOC EST DIFFÉRÉ, ET LUI SEUL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le pilier Trésorerie venait de dépasser son budget de cent quatre-vingts
 * octets en gagnant la frise. Un budget ne se relève pas : on sort ce qui n'a
 * rien à faire dans le lot.
 *
 * Ce bloc est le bon candidat pour deux raisons qui vont dans le même sens. Il
 * est en BAS de l'écran, sous la ligne de flottaison — son chargement se lit
 * comme un bas de page qui se remplit, pas comme un écran vide qu'on attend
 * (même arbitrage que la carte « À traiter » du Pilote). Et on l'ouvre pour
 * PAYER ou DÉCLARER, une fois par mois au plus, alors qu'on ouvre le pilier
 * pour vérifier son solde tous les matins.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS PIÈCES, ET POURQUOI AUCUNE NE REMPLACE LES AUTRES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La FRISE répond à « qu'est-ce qui vient cette année » : elle montre les
 * intervalles, qu'une liste ne peut pas montrer. La LISTE répond à « qu'est-ce
 * que j'en fais » : elle porte les boutons. Les PÉRIODES URSSAF répondent à
 * « qu'est-ce que je dois déclarer » — et leur case à cocher fait basculer une
 * dette d'un volet de provision à l'autre, ce qui ne se lit nulle part ailleurs.
 */
export function Echeancier({ annee }: { readonly annee: number }) {
  const faits = useFaits((e) => e.faits);
  const idGroupe = useId();
  const prevus = useMemo(() => soldeImpotPrevuDe(faits), [faits]);

  return (
    <>
    {/* La frise PRÉCÈDE la liste, elle ne la remplace pas. Elle répond à
        « qu'est-ce qui vient cette année » ; la liste, à « qu'est-ce que
        j'en fais » — et elle porte les seuls boutons de l'écran. */}
    <section className={styles.carte} aria-labelledby="echeancier">
      <h2 id="echeancier" className={styles.titreCarte}>
        Échéancier &amp; obligations {annee}
        <Info libelle="Ce que la frise montre de plus que la liste">
          Une liste ne montre pas les <em>intervalles</em>. Deux échéances à
          trois semaines l’une de l’autre en octobre sont un problème de
          trésorerie&nbsp;; les mêmes réparties sur six mois n’en sont pas un,
          et une liste les présente identiquement. La frise place chaque
          obligation à sa date&nbsp;: on voit les grappes, les trous, et où
          l’on en est.
        </Info>
      </h2>
      <FriseEcheances
        echeances={faits.echeances}
        prevus={prevus}
        annee={annee}
        aujourdhui={dateDuJour()}
        /* En euros pleins, et non abrégés : « 2 k€ » pour 1 980 € perd le
           seul chiffre qui compte sur une somme qu'on va se faire prélever
           à l'euro près. Un jalon a la place d'une ligne, contrairement aux
           douze colonnes du graphe. */
        formater={eur}
      />
    </section>

    <Echeances />

    <CarteDeclarations idGroupe={idGroupe} />
    </>
  );
}

/**
 * Les périodes URSSAF, et le geste qui les fait basculer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE SON ABSENCE COÛTAIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les provisions se tiennent en deux volets (D3) : ce que l'URSSAF a appelé,
 * et ce qui est dû sur des recettes encaissées mais pas encore déclaré. Le
 * second bascule dans le premier au moment de la déclaration.
 *
 * L'écriture existait dans le magasin. Aucun écran ne l'appelait.
 * Une période déclarée restait donc à jamais dans le volet « à provisionner » :
 * les provisions montaient sans jamais redescendre, et le versable baissait
 * d'autant. On mettait de côté deux fois la même dette.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DÉCLARÉ N'EST PAS PAYÉ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Cocher ici ne dit pas que la somme est réglée : elle passe de « à
 * provisionner » à « appelé, à payer ». Elle reste donc dans le total à garder
 * de côté — c'est justement pour la payer qu'on la garde.
 */
function CarteDeclarations({ idGroupe }: { idGroupe: string }) {
  const faits = useFaits((e) => e.faits);
  const signaler = useToast();

  // Le début d'activité fait apparaître les périodes closes SANS recette : la
  // déclaration à zéro est due, et le Pilote la réclame avec la même règle.
  const periodes = useMemo(() => periodesADeclarer(
    recettesEncaissees(faits),
    faits.entreprise.urssafPeriodicite,
    moisDeclares(faits.periodesDeclarees),
    dateDuJour(),
    faits.entreprise.debutActivite === null ? null : faits.entreprise.debutActivite.slice(0, 7) as Mois
  ), [faits]);

  if (periodes.length === 0) return null;

  return (
    <section className={styles.carte} aria-labelledby={`${idGroupe}-declarations`}>
      <h2 id={`${idGroupe}-declarations`} className={styles.titreCarte}>
        Périodes URSSAF
        <Info libelle="À quoi sert de cocher une période">
          Tant qu’une période n’est pas déclarée, les cotisations dues dessus
          restent dans le volet «&nbsp;à provisionner&nbsp;». La déclarer les
          fait basculer dans «&nbsp;échéances émises&nbsp;»&nbsp;: la somme
          reste à garder de côté, mais elle cesse d’être comptée deux fois.
          Cocher ne veut pas dire payé.
        </Info>
      </h2>

      <ul className={styles.listeDeclarations}>
        {periodes.map((p) => (
          <li key={p.id} className={styles.ligneDeclaration}>
            <span className={styles.declarationTitre}>
              <span>{p.libelle}</span>
              <span className={styles.declarationMontant}>
                {p.encaisse > 0
                  ? <><Montant>{eur(p.encaisse)}</Montant> encaissés</>
                  : p.declaree
                    ? 'Rien encaissé'
                    : 'Rien encaissé : à déclarer à zéro, c’est obligatoire'}
              </span>
              {/* Ce qu'il faut payer, et jusqu'à quand : les deux chiffres
                  qu'on vient chercher avant d'ouvrir le site de l'URSSAF. Le
                  Pilote annonce le même montant — une seule règle,
                  `montantDeclaration`. */}
              {p.close && !p.declaree && (
                <AFaire periode={p} montant={montantDeclaration(faits, p.mois)} />
              )}
            </span>

            {p.declaree
              ? (
                <span className={styles.declarationActions}>
                  <Statut libelle="Déclarée" ton="ok" />
                  {/* La date se lit ET se corrige au même endroit : un champ
                      vide dit « date non enregistrée » — le cas de toute
                      période cochée avant qu'elle existe — sans phrase de
                      plus, et le remplir est le geste qui la complète. Pas
                      de date future : on ne déclare pas demain. */}
                  <label className={styles.declarationDate}>
                    <span>le</span>
                    <input
                      type="date"
                      aria-label={`Date de déclaration de ${p.libelle}`}
                      value={dateDeDeclaration(p.mois, faits.periodesDeclarees) ?? ''}
                      max={dateDuJour()}
                      onChange={(e) => {
                        const saisie = e.target.value;
                        if (saisie !== '' && saisie > dateDuJour()) return;
                        declarerPeriode(p.mois, saisie === '' ? null : saisie as DateISO);
                      }}
                    />
                  </label>
                  <SuiteDuCycle periode={p} />
                  <button
                    type="button"
                    className={styles.actionLigne}
                    onClick={() => {
                      annulerDeclaration(p.mois);
                      signaler(`${p.libelle} n’est plus marquée déclarée.`);
                    }}
                  >
                    Annuler
                  </button>
                </span>
              )
              : p.close
                ? (
                  <button
                    type="button"
                    className={styles.actionLigne}
                    onClick={() => {
                      // Datée du jour : on la coche en sortant du site de
                      // l'URSSAF. Le champ qui apparaît la corrige.
                      declarerPeriode(p.mois, dateDuJour());
                      signaler(`${p.libelle} marquée déclarée aujourd’hui.`);
                    }}
                  >
                    Marquer déclarée
                  </button>
                )
                : (
                  /* Une période en cours ne se déclare pas : l'URSSAF ouvre la
                     déclaration après sa clôture, et la cocher d'avance
                     sortirait du volet « à provisionner » des recettes qu'on
                     va encore encaisser dessus. */
                  <span className={styles.declarationAttente}>
                    Période en cours, pas encore déclarable
                  </span>
                )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * La dernière étape du cycle « à déclarer → déclarée le … → payée le … ».
 *
 * Elle se lit sur l'appel de cotisations saisi pour la période, quand il y en
 * a un. Sans appel, rien n'est dit plutôt qu'un « non payée » : l'absence
 * d'échéance saisie ne prouve pas l'absence de paiement — une déclaration à
 * zéro n'en a pas, et une période reprise de l'ancienne application non plus.
 */
function SuiteDuCycle({ periode: p }: { periode: PeriodeADeclarer }) {
  const echeances = useFaits((e) => e.faits.echeances);
  const appels = appelsDeLaPeriode(p.limite, echeances);
  if (appels.length === 0) return null;

  const impayes = appels.filter((e) => !estPayee(e));
  if (impayes.length > 0) {
    const limite = impayes.map((e) => e.echeanceLe).sort()[0] as DateISO;
    const depassee = limite < dateDuJour();
    return (
      <span className={depassee ? styles.declarationSuiteRetard : styles.declarationSuiteAFaire}>
        {depassee ? `à payer depuis le ${dateCourte(limite)}` : `à payer avant le ${dateCourte(limite)}`}
      </span>
    );
  }
  const payeeLe = appels.map((e) => e.payeeLe as DateISO).sort().at(-1) as DateISO;
  return <span className={styles.declarationSuite}>payée le {dateCourte(payeeLe)}</span>;
}

/** « À payer 1 970 € · avant le 31 juillet » — ou « date limite dépassée ». */
function AFaire({ periode: p, montant }: { periode: PeriodeADeclarer; montant: Resolution<Euros> }) {
  const depassee = p.limite < dateDuJour();
  return (
    <span className={depassee ? styles.declarationRetard : styles.declarationLimite}>
      {montant.statut === 'refuse'
        ? 'À payer : à vérifier (taux manquant)'
        : <>À payer <Montant>{eur(montant.valeur)}</Montant></>}
      {' · '}
      {depassee ? `date limite dépassée (${dateCourte(p.limite)})` : `avant le ${dateCourte(p.limite)}`}
    </span>
  );
}

