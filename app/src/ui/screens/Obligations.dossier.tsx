import { type ReactNode, useId, useMemo, useState } from 'react';
import { type DateISO, type Euros, type Mois, dateISO, euros } from '../../domain/types';
import type { Obligation } from '../../domain/calculs/obligations';
import type { NatureDeclaration } from '../../domain/calculs/declarations.declarees';
import { type Echeance, LIBELLE_NATURE, estPayee } from '../../domain/calculs/provisions';
import {
  type PeriodeUrssaf, idAppelDeDeclaration, moisDeLaPeriode, periodeDuMois
} from '../../domain/calculs/declarations';
import { useFaits } from '../../state/store';
import { recettesEncaissees, sousAcreLe } from '../../state/selecteurs';
import { ventilationDeclaration } from '../../state/selecteurs.obligations';
import { dossierTvaDuTrimestre } from '../../state/selecteurs.dossierTva';
import {
  annulerDeclaration, annulerDeclarationUrssaf, declarerPeriode, enregistrerPaiement
} from '../../state/ecritures.echeances';
import { ConfirmationSurPlace } from '../components/ConfirmationSurPlace';
import { DeclarationUrssaf } from '../components/DeclarationUrssaf';
import { FormulairePaiement } from '../components/FormulairePaiement';
import { Montant } from '../components/Montant';
import { Statut } from '../components/Statut';
import { useToast } from '../components/Toasts';
import { dateCourte, eur, pct } from '../format';
import {
  avanceLisible, etapeEnCours, jourMois, jourMoisCourt, moisLongDe, pastilleDe
} from './Obligations.lecture';
import type { ChampsEcheance } from './Obligations.saisie';
import { EditeurPiece } from './Obligations.piece';
import styles from './Obligations.module.css';
import g from './Obligations.gestes.module.css';

/**
 * Le dossier d'une obligation : ce qu'il faut déclarer ou payer, les chiffres
 * à reporter, un geste daté. Chargé au clic — ou, au bureau, avec la
 * première ligne qu'il montre par défaut.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TOUS SUR LE MODÈLE URSSAF
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Seuls deux dossiers sont dessinés (URSSAF, déclaration de revenus) ; les
 * autres suivent leur modèle (décision 25) : un titre et sa pastille, une
 * phrase qui dit la limite et ce qui fait foi, les chiffres, puis le geste.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES GESTES DES DEUX ANCIENNES CARTES VIVENT ICI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Échéances reçues » et « Périodes URSSAF » portaient : déclarer à une date
 * (et à zéro), corriger cette date — jamais future, vide pour « non
 * enregistrée » —, annuler la déclaration (et l'appel qu'elle a créé, la
 * conséquence dite), enregistrer le paiement (date et montant réellement
 * parti, écart conservé), repasser à payer (confirmé), corriger, supprimer.
 * Chacun est ici, au même endroit que les chiffres qui le justifient.
 */

export interface ProprietesDossier {
  readonly obligation: Obligation;
  readonly aujourdhui: DateISO;
  /** Ouvre la saisie : corriger une échéance, ou saisir celle qu'un dossier attend. */
  readonly onSaisir: (s: { readonly initiale: Echeance | null; readonly prerempli?: Partial<ChampsEcheance> }) => void;
  /** Ouvre un registre par-dessus l'écran. */
  readonly onRegistre: (r: 'livre' | 'tva' | 'des') => void;
  /** Dans le volet du téléphone, le titre du dialogue nomme déjà le dossier. */
  readonly enPanneau?: boolean;
}

export function Dossier(p: ProprietesDossier) {
  const o = p.obligation;
  const pastille = pastilleDe(o, p.aujourdhui);
  return (
    <div className={styles.dossier}>
      <div className={styles.entete}>
        {/* Dans le volet du téléphone, le titre du dialogue le nomme déjà
            pour qui l'écoute ; on l'écrit pour qui le lit, sans le répéter. */}
        {p.enPanneau === true
          ? <p className={styles.titrePanneau} aria-hidden="true">{o.libelle}</p>
          : <h2 className={styles.titreCarte}>{o.libelle}</h2>}
        <Statut libelle={pastille.libelle} ton={pastille.ton} />
      </div>
      <Corps {...p} />
    </div>
  );
}

function Corps(p: ProprietesDossier) {
  switch (p.obligation.dossier) {
    // Une période URSSAF a son dossier ; un appel saisi que rien ne porte
    // (une régularisation, la CFP), le sien.
    case 'urssaf': return /^urssaf-/u.test(p.obligation.id) ? <DossierUrssaf {...p} /> : <DossierSaisi {...p} />;
    case 'tva': return <DossierTva {...p} />;
    case 'des': return <DossierDes {...p} />;
    case 'cfe': return <DossierCfe {...p} />;
    case 'impot': return <DossierImpot {...p} />;
    case 'revenus': return <DossierRevenus {...p} />;
    case 'formalite': return <DossierFormalite {...p} />;
    case 'piece': return <EditeurPiece id={p.obligation.periode} aujourdhui={p.aujourdhui} />;
    default: return null;
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Les morceaux communs
   ───────────────────────────────────────────────────────────────────────── */

/** « Limite le 16 juillet — date calculée … » ; le motif quand le jour manque. */
function Limite({ o }: { readonly o: Obligation }) {
  const e = etapeEnCours(o) ?? o.declaration ?? o.paiement ?? o.formalite;
  if (e === undefined) return null;
  if (e.limite.statut === 'refuse') return <p className={g.aide}>{e.limite.motif}</p>;
  return (
    <p className={g.aide}>
      Limite le {jourMois(e.limite.valeur)} {e.limite.valeur.slice(0, 4)}
      {e.limite.statut === 'hypothese' && <> — date calculée&nbsp;: {e.limite.source}.</>}
    </p>
  );
}

/** Une ligne de chiffres : `.e-li`, le libellé et sa précision à gauche, le montant à droite. */
function Chiffre({ libelle, precision, montant }: { readonly libelle: string; readonly precision?: ReactNode; readonly montant: Euros }) {
  return (
    <div className={styles.chiffre}>
      <span className={styles.intitule}>{libelle}{precision !== undefined && <small>{precision}</small>}</span>
      <span className={styles.montant}><Montant>{eur(montant)}</Montant></span>
    </div>
  );
}

/**
 * Le geste daté d'une déclaration : « Je l'ai déclarée le… », puis la date
 * qui se lit ET se corrige au même endroit — vide, elle dit « date non
 * enregistrée » (le cas de toute déclaration notée avant le lot 28), jamais
 * future : on ne déclare pas demain.
 */
function DeclarerLe(
  { nature, periodes, faite, faiteLe, libelle, verbe, aujourdhui, apres }: {
    readonly nature: NatureDeclaration;
    readonly periodes: readonly string[];
    readonly faite: boolean;
    readonly faiteLe: DateISO | null;
    /** Le bouton qui ouvre le geste. */
    readonly libelle: string;
    /** « Déclarée », « Déposée ». */
    readonly verbe: string;
    readonly aujourdhui: DateISO;
    /** Ce que la déclaration change, dit dans le message. */
    readonly apres?: string;
  }
) {
  const id = useId();
  const signaler = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [date, setDate] = useState<string>(aujourdhui);
  const [erreur, setErreur] = useState<string | null>(null);

  if (faite) {
    return (
      <div className={g.actions}>
        <label className={g.champ}>
          <span className={g.libelle}>{verbe} le</span>
          <input
            type="date"
            className={g.saisie}
            value={faiteLe ?? ''}
            max={aujourdhui}
            onChange={(e) => {
              const saisie = e.target.value;
              if (saisie !== '' && saisie > aujourdhui) return;
              declarerPeriode(nature, periodes, saisie === '' ? null : dateISO(saisie));
            }}
          />
        </label>
        <button
          type="button"
          className={g.supprimer}
          onClick={() => { annulerDeclaration(nature, periodes); signaler(`${verbe} : marque retirée.`); }}
        >
          Annuler la déclaration
        </button>
      </div>
    );
  }
  if (!ouvert) {
    return (
      <div className={g.actions}>
        <button type="button" className={g.actionPrincipale} onClick={() => setOuvert(true)}>{libelle}</button>
      </div>
    );
  }
  const enregistrer = (): void => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setErreur('La date est obligatoire : c’est elle qui dit si c’était à l’heure.'); return; }
    if (date > aujourdhui) { setErreur('Cette date n’est pas encore arrivée : on note ce qui est fait, pas prévu.'); return; }
    declarerPeriode(nature, periodes, dateISO(date));
    signaler(`${verbe} le ${dateCourte(date)}.${apres === undefined ? '' : ` ${apres}`}`);
    setOuvert(false);
  };
  return (
    <div className={g.formulaire}>
      <p className={g.champ}>
        <label className={g.libelle} htmlFor={`${id}-date`}>{verbe} le</label>
        <input id={`${id}-date`} type="date" className={g.saisie} value={date} max={aujourdhui}
          onChange={(e) => setDate(e.target.value)} />
      </p>
      {erreur !== null && <p role="alert" className={g.refus}>{erreur}</p>}
      <div className={g.actions}>
        <button type="button" className={g.actionPrincipale} onClick={enregistrer}>Enregistrer</button>
        <button type="button" className={g.bouton} onClick={() => setOuvert(false)}>Fermer</button>
      </div>
    </div>
  );
}

/**
 * Les échéances saisies d'une obligation, et leur paiement.
 *
 * Payer se prouve par une DATE et un MONTANT : celui qui est réellement
 * parti diffère plus souvent qu'on ne croit (régularisation, changement de
 * taux, majoration), et l'écart n'est pas une erreur — c'est lui qui explique
 * un solde qui ne tombe pas juste. Repasser à payer efface les deux : confirmé.
 */
function Appels({ saisies, onSaisir, prelevement = false }: {
  readonly saisies: readonly Echeance[];
  readonly onSaisir: ProprietesDossier['onSaisir'];
  /** Un prélèvement que l'administration fait seule : on le « pointe ». */
  readonly prelevement?: boolean;
}) {
  if (saisies.length === 0) return null;
  return (
    <div className={styles.appels}>
      {saisies.map((e) => <Appel key={e.id} echeance={e} onSaisir={onSaisir} prelevement={prelevement} />)}
    </div>
  );
}

function Appel({ echeance: e, onSaisir, prelevement }: {
  readonly echeance: Echeance;
  readonly onSaisir: ProprietesDossier['onSaisir'];
  readonly prelevement: boolean;
}) {
  const signaler = useToast();
  const [payer, setPayer] = useState(false);
  const payee = e.payeeLe !== null;
  const ecart = e.montantPaye === null ? 0 : e.montantPaye - e.montant;
  const nom = LIBELLE_NATURE[e.nature];
  return (
    <div className={styles.appel}>
      <div className={styles.chiffre}>
        <span className={styles.intitule}>
          {payee ? `Payée le ${jourMois(e.payeeLe as string)}` : `Échéance du ${jourMois(e.echeanceLe)}`}
          <small>
            {nom}
            {/* L'écart se montre, signe compris : il explique un solde. */}
            {ecart !== 0 && (
              <span className={g.ecart}>
                {' · '}{ecart > 0 ? '+' : '−'}<Montant>{eur(euros(Math.abs(ecart)))}</Montant> sur l’appel de{' '}
                <Montant>{eur(e.montant)}</Montant>
              </span>
            )}
          </small>
        </span>
        <span className={styles.montant}><Montant>{eur(e.montantPaye ?? e.montant)}</Montant></span>
      </div>
      {payer
        ? (
          <FormulairePaiement
            avecAides
            focaliser
            montantAppele={e.montant}
            libelleValider={prelevement ? 'Pointer le prélèvement' : 'Enregistrer le paiement'}
            onAnnuler={() => setPayer(false)}
            onValider={(payeeLe, montantPaye) => {
              enregistrerPaiement(e.id, payeeLe, montantPaye);
              signaler(montantPaye === null
                ? 'Paiement enregistré. L’échéance sort du dû.'
                : 'Paiement enregistré, avec son écart au montant appelé.');
              setPayer(false);
            }}
          />
        )
        : (
          <div className={g.actions}>
            {payee
              ? (
                /* Repasser à payer efface la date du débit et le montant
                   réellement parti — l'écart compris. Rien ne les retrouve. */
                <ConfirmationSurPlace
                  libelle="Repasser à payer"
                  precision={`${nom}, échéance le ${dateCourte(e.echeanceLe)}`}
                  classeDeclencheur={g.bouton}
                  consequence={(
                    <>
                      Le paiement du {dateCourte(e.payeeLe)}
                      {' '}(<Montant>{eur(e.montantPaye ?? e.montant)}</Montant>)
                      {' '}sera oublié&nbsp;: l’échéance redevient due, et revient dans le dû.
                    </>
                  )}
                  libelleConfirmer="Repasser à payer"
                  libelleGarder="Garder le paiement"
                  onConfirmer={() => { enregistrerPaiement(e.id, null, null); signaler(`${nom} : repassée à payer.`); }}
                />
              )
              : (
                <button type="button" className={g.actionPrincipale} onClick={() => setPayer(true)}>
                  {prelevement ? 'Pointer le prélèvement' : 'Enregistrer le paiement'}
                </button>
              )}
            <button type="button" className={g.bouton} onClick={() => onSaisir({ initiale: e })}>Corriger</button>
          </div>
        )}
    </div>
  );
}

/** Le pied d'un dossier : ce qui part, et quand. */
function Pied({ libelle, montant, approx = false, lien }: {
  readonly libelle: string;
  readonly montant: Euros | null;
  readonly approx?: boolean;
  readonly lien?: ReactNode;
}) {
  return (
    <div className={styles.pied}>
      <div>
        <span className={g.aide}>{libelle}</span>
        <div className={styles.piedMontant}>
          {montant === null ? '—' : <Montant>{`${approx ? '≈ ' : ''}${eur(montant)}`}</Montant>}
        </div>
      </div>
      {lien}
    </div>
  );
}

/** « de janvier », « d’avril » : l'élision devant une voyelle. */
const deMois = (m: string): string => {
  const nom = moisLongDe(`${m.slice(0, 7)}-01`);
  return /^[aeiou]/u.test(nom) ? `d’${nom}` : `de ${nom}`;
};

const premierJour = (m: string): DateISO => dateISO(`${m.slice(0, 7)}-01`);
const finDuMois = (m: string): DateISO =>
  dateISO(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10));

/* ─────────────────────────────────────────────────────────────────────────
   URSSAF — le modèle des autres
   ───────────────────────────────────────────────────────────────────────── */

function DossierUrssaf({ obligation: o, aujourdhui, onSaisir }: ProprietesDossier) {
  const faits = useFaits((e) => e.faits);
  const periodicite = faits.entreprise.urssafPeriodicite;
  const mois = useMemo(() => moisDeLaPeriode(o.periode, periodicite), [o.periode, periodicite]);
  const periode: PeriodeUrssaf = periodeDuMois(mois[0] as Mois, periodicite, aujourdhui);
  const ventilation = useMemo(() => ventilationDeclaration(faits, mois), [faits, mois]);
  // Les recettes de la période, telles que la déclaration les compte : celles
  // que `recettesEncaissees` retient, avec leur numéro et leur client.
  const factures = useMemo(() => {
    const dans = new Set<string>(mois);
    const comptees = new Set(recettesEncaissees(faits).filter((r) => dans.has(r.encaisseeLe.slice(0, 7))).map((r) => r.id));
    return faits.recettes.filter((r) => comptees.has(r.id))
      .sort((a, b) => (a.encaisseeLe ?? '').localeCompare(b.encaisseeLe ?? ''));
  }, [faits, mois]);
  const [voirFactures, setVoirFactures] = useState(false);
  const acre = mois.some(sousAcreLe(faits));
  const declaration = o.declaration;
  const declaree = declaration?.etat === 'fait';
  const assiette = o.assiette ?? euros(0);
  const premier = mois[0] as string;
  const dernier = mois[mois.length - 1] as string;
  const lePremier = periode.close ? null : premierJour(periode.limite);
  const avance = declaration === undefined ? null : avanceLisible(declaration.avance);

  return (
    <>
      <p className={g.aide}>
        {declaree
          ? <>Déclarée {declaration?.faiteLe === null || declaration === undefined ? '(date non enregistrée)' : `le ${jourMois(declaration.faiteLe as string)}`}{avance === null ? '' : `, ${avance}`}. Les chiffres tels que tu les as saisis sur le site.</>
          : <>
            {o.detail === '' ? '' : `${o.detail} · `}
            {lePremier === null
              ? <>à déclarer avant le {jourMois(periode.limite)}.</>
              : <>déclarable du {lePremier.slice(0, 7) === periode.limite.slice(0, 7)
                ? jourMois(lePremier).split(' ')[0] : jourMois(lePremier)} au {jourMois(periode.limite)}.</>}
            {' '}Les chiffres à saisir sur le site de l’Urssaf.
          </>}
      </p>

      <div className={styles.etiquette}>Recettes à déclarer</div>
      <div className={styles.grandChiffre}><Montant>{eur(assiette)}</Montant></div>
      <p className={g.aide}>
        {factures.length === 0
          ? <>Rien encaissé {periodicite === 'mensuel' ? 'ce mois' : 'ce trimestre'}{!declaree && periode.close
            ? <>&nbsp;: à déclarer à zéro, c’est obligatoire.</> : '.'}</>
          : <>{factures.length} facture{factures.length > 1 ? 's' : ''} encaissée{factures.length > 1 ? 's' : ''}
            {mois.length > 1 ? ` ${deMois(premier)} à ${moisLongDe(`${dernier}-01`)}` : ` en ${moisLongDe(`${premier}-01`)}`}</>}
      </p>

      {ventilation.statut === 'refuse'
        ? <p className={g.refus}>À payer&nbsp;: à vérifier (taux manquant). {ventilation.motif}</p>
        : assiette > 0 && (
          <div className={styles.chiffres}>
            <Chiffre libelle="Cotisations" precision={`${pct(ventilation.valeur.cotisations / assiette)}${acre ? ' avec l’ACRE' : ''}`}
              montant={ventilation.valeur.cotisations} />
            {ventilation.valeur.impot > 0 && (
              <Chiffre libelle="Impôt" precision={`versement libératoire, ${pct(ventilation.valeur.impot / assiette)}`}
                montant={ventilation.valeur.impot} />
            )}
            {ventilation.valeur.cfp > 0 && (
              <Chiffre libelle="Formation professionnelle" precision={pct(ventilation.valeur.cfp / assiette)}
                montant={ventilation.valeur.cfp} />
            )}
          </div>
        )}

      <Pied
        libelle={o.paiement?.etat === 'fait' && o.paiement.faiteLe !== null
          ? `Prélevé le ${jourMois(o.paiement.faiteLe)}`
          : declaree ? `À payer le ${jourMois(periode.limite)}` : 'À payer avec la déclaration'}
        montant={o.montant === null || o.montant.statut === 'refuse' ? null : o.montant.valeur}
        approx={o.montant?.statut === 'hypothese'}
        lien={factures.length > 0 && (
          <button type="button" className={styles.lienVert} aria-expanded={voirFactures} onClick={() => setVoirFactures((v) => !v)}>
            {voirFactures ? 'Masquer les factures' : `Voir ${factures.length === 1 ? 'la facture' : `les ${factures.length} factures`}`}
          </button>
        )}
      />
      {voirFactures && (
        <ul className={styles.factures} aria-label="Factures encaissées sur la période">
          {factures.map((r) => (
            <li key={r.id}>
              <span>{r.numero ?? r.libelle}<small>{r.clientNom} · encaissée le {jourMoisCourt(r.encaisseeLe ?? '')}</small></span>
              <span className={styles.montant}><Montant>{eur(r.montant)}</Montant></span>
            </li>
          ))}
        </ul>
      )}

      {declaree
        ? <DeclareeUrssaf o={o} periode={periode} aujourdhui={aujourdhui} />
        : periode.close
          ? (
            <div className={g.actions}>
              {/* Le geste unique : la déclaration ET l'appel qu'elle crée, au
                  montant prérempli, corrigeable. */}
              <DeclarationUrssaf periode={periode} libelle="Je l’ai déclarée le…" classeDeclencheur={g.actionPrincipale}
                classeConteneur={styles.formulairePlein} />
            </div>
          )
          : (
            /* Une période en cours ne se déclare pas : l'URSSAF ouvre la
               déclaration après sa clôture, et la cocher d'avance sortirait du
               volet « à provisionner » ce qu'on va encore encaisser. */
            <p className={g.aide}>Période en cours, pas encore déclarable.</p>
          )}

      <Appels saisies={o.saisies} onSaisir={onSaisir} />
    </>
  );
}

/** Une période déclarée : sa date, corrigeable, et le geste qui la défait. */
function DeclareeUrssaf({ o, periode, aujourdhui }: { readonly o: Obligation; readonly periode: PeriodeUrssaf; readonly aujourdhui: DateISO }) {
  const signaler = useToast();
  const echeances = useFaits((e) => e.faits.echeances);
  const appel = echeances.find((e) => e.id === idAppelDeDeclaration(periode.id) && !estPayee(e));
  const annuler = (): void => {
    annulerDeclarationUrssaf(periode);
    signaler(appel === undefined
      ? `${periode.libelle} n’est plus marquée déclarée.`
      : `${periode.libelle} n’est plus marquée déclarée, et son appel quitte le dû.`);
  };
  return (
    <div className={g.actions}>
      <label className={g.champ}>
        <span className={g.libelle}>Déclarée le</span>
        <input
          type="date"
          className={g.saisie}
          aria-label={`Date de déclaration de ${periode.libelle}`}
          value={o.declaration?.faiteLe ?? ''}
          max={aujourdhui}
          onChange={(e) => {
            const saisie = e.target.value;
            if (saisie !== '' && saisie > aujourdhui) return;
            declarerPeriode('urssaf', periode.mois, saisie === '' ? null : dateISO(saisie));
          }}
        />
      </label>
      {/* « Annuler » seul, posé près d'un paiement, se lisait « annuler le
          paiement » : il défait la déclaration, et un paiement reste. */}
      {appel === undefined
        ? <button type="button" className={g.supprimer} onClick={annuler}>Annuler la déclaration</button>
        : (
          <ConfirmationSurPlace
            libelle="Annuler la déclaration"
            precision={periode.libelle}
            classeDeclencheur={g.supprimer}
            consequence={(
              <>
                L’appel de <Montant>{eur(appel.montant)}</Montant> créé par la déclaration,
                pas encore payé, quitte le dû&nbsp;; les cotisations de {periode.libelle} redeviennent
                estimées.
              </>
            )}
            libelleConfirmer="Annuler la déclaration"
            libelleGarder="Garder la déclaration"
            onConfirmer={annuler}
          />
        )}
    </div>
  );
}

/** Une échéance saisie que rien de prévu ne porte : un appel de régularisation, la CFP. */
function DossierSaisi({ obligation: o, onSaisir }: ProprietesDossier) {
  return (
    <>
      <p className={g.aide}>{o.detail}</p>
      <Appels saisies={o.saisies} onSaisir={onSaisir} prelevement={o.nature === 'impot'} />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TVA — CA3, CA12, acomptes, TVA autoliquidée
   ───────────────────────────────────────────────────────────────────────── */

function bornesTva(o: Obligation): { readonly du: DateISO; readonly au: DateISO; readonly nature: NatureDeclaration } | null {
  if (o.id.startsWith('ca12-')) return { du: dateISO(`${o.periode}-01-01`), au: dateISO(`${o.periode}-12-31`), nature: 'ca12' };
  if (!o.id.startsWith('ca3-')) return null;
  if (/-T\d$/u.test(o.periode)) {
    const mois = moisDeLaPeriode(o.periode, 'trimestriel');
    return { du: premierJour(mois[0] as string), au: finDuMois(mois[2] as string), nature: 'ca3' };
  }
  return { du: premierJour(o.periode), au: finDuMois(o.periode), nature: 'ca3' };
}

function DossierTva({ obligation: o, aujourdhui, onSaisir, onRegistre }: ProprietesDossier) {
  const faits = useFaits((e) => e.faits);
  const bornes = bornesTva(o);
  const du = bornes?.du ?? null;
  const au = bornes?.au ?? null;
  const dossier = useMemo(
    () => (du === null || au === null ? null : dossierTvaDuTrimestre(faits, du, au, new Date(`${aujourdhui}T12:00:00`))),
    [faits, du, au, aujourdhui]
  );
  const limite = o.paiement?.limite ?? o.declaration?.limite;
  return (
    <>
      <p className={g.aide}>{o.detail}</p>
      <Limite o={o} />
      {/* Le nom qui manque, demandé là où il manque : une date tirée de
          l'enseigne (« Atelier … ») serait fausse une fois sur deux. */}
      {o.declaration?.limite.statut === 'refuse' && faits.entreprise.nomExploitant.trim() === '' && <NomExploitant />}
      {dossier !== null && (
        <div className={styles.chiffres}>
          <Chiffre libelle="TVA collectée" precision="sur tes encaissements de la période" montant={dossier.collectee} />
          <Chiffre libelle="TVA déductible" precision="sur tes achats" montant={dossier.deductible} />
          {dossier.autoliquideeDue > 0 && (
            <Chiffre libelle="TVA autoliquidée" precision="services achetés hors de France" montant={dossier.autoliquideeDue} />
          )}
        </div>
      )}
      <Pied
        libelle={o.paiement?.etat === 'fait' ? 'Payée' : 'À payer'}
        montant={o.montant === null || o.montant.statut === 'refuse' ? null : o.montant.valeur}
        approx={o.montant?.statut === 'hypothese'}
        lien={bornes?.nature === 'ca3' || bornes?.nature === 'ca12'
          ? <button type="button" className={styles.lienVert} onClick={() => onRegistre('tva')}>Les lignes de la déclaration</button>
          : undefined}
      />
      {bornes !== null && o.declaration !== undefined && (
        <DeclarerLe
          nature={bornes.nature}
          periodes={[o.periode]}
          faite={o.declaration.etat === 'fait'}
          faiteLe={o.declaration.faiteLe}
          libelle="Marquer déposée"
          verbe="Déposée"
          aujourdhui={aujourdhui}
        />
      )}
      <Appels saisies={o.saisies} onSaisir={onSaisir} />
      {/* Le paiement se pointe sur une échéance : sans elle, rien ne le note. */}
      {o.saisies.length === 0 && o.paiement !== undefined && limite !== undefined && (
        <div className={g.actions}>
          <button
            type="button"
            className={g.bouton}
            onClick={() => onSaisir({
              initiale: null,
              prerempli: {
                nature: 'tva',
                ...(limite.statut === 'refuse' ? {} : { echeanceLe: limite.valeur }),
                ...(o.montant === null || o.montant.statut === 'refuse' ? {} : { montant: o.montant.valeur })
              }
            })}
          >
            Saisir le paiement
          </button>
        </div>
      )}
    </>
  );
}

function NomExploitant() {
  const id = useId();
  const signaler = useToast();
  const modifierEntreprise = useFaits((e) => e.modifierEntreprise);
  const [nom, setNom] = useState('');
  return (
    <div className={g.formulaire}>
      <p className={g.champ}>
        <label className={g.libelle} htmlFor={`${id}-nom`}>Ton nom de famille</label>
        <input id={`${id}-nom`} className={g.saisie} value={nom} autoComplete="family-name"
          onChange={(e) => setNom(e.target.value)} />
        <span className={g.aide}>Seule son initiale compte : de A à H, ou de I à Z.</span>
      </p>
      <div className={g.actions}>
        <button
          type="button"
          className={g.bouton}
          onClick={() => {
            if (nom.trim() === '') return;
            modifierEntreprise({ nomExploitant: nom.trim() });
            signaler('Nom enregistré : la date de la CA3 est calculée.');
          }}
        >
          Enregistrer le nom
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   DES, CFE, impôt, déclaration de revenus, formalité
   ───────────────────────────────────────────────────────────────────────── */

function DossierDes({ obligation: o, aujourdhui, onRegistre }: ProprietesDossier) {
  const d = o.declaration;
  return (
    <>
      <p className={g.aide}>
        Prestations de {moisLongDe(`${o.periode}-01`)} {o.periode.slice(0, 4)} à des clients de l’Union, à
        déclarer aux douanes. {o.detail}
      </p>
      <Limite o={o} />
      <div className={styles.etiquette}>Prestations à déclarer</div>
      <div className={styles.grandChiffre}><Montant>{eur(o.assiette ?? euros(0))}</Montant></div>
      <Pied
        libelle="Aucun paiement : une déclaration"
        montant={null}
        lien={<button type="button" className={styles.lienVert} onClick={() => onRegistre('des')}>Les lignes à reporter</button>}
      />
      {d !== undefined && (
        <DeclarerLe
          nature="des"
          periodes={[o.periode]}
          faite={d.etat === 'fait'}
          faiteLe={d.faiteLe}
          libelle="Marquer déposée"
          verbe="Déposée"
          aujourdhui={aujourdhui}
          apres="Elle sort du retard, et l’amende avec elle."
        />
      )}
    </>
  );
}

function DossierCfe({ obligation: o, aujourdhui, onSaisir }: ProprietesDossier) {
  const limite = o.paiement?.limite;
  return (
    <>
      <p className={g.aide}>{o.detail}</p>
      <Limite o={o} />
      {o.declaration !== undefined && (
        <DeclarerLe
          nature="cfe_1447c"
          periodes={[o.periode]}
          faite={o.declaration.etat === 'fait'}
          faiteLe={o.declaration.faiteLe}
          libelle="Je l’ai déclarée le…"
          verbe="Déclarée"
          aujourdhui={aujourdhui}
        />
      )}
      {o.paiement !== undefined && (
        <Pied
          libelle={o.saisies.length === 0 ? 'Montant de l’avis' : 'Avis saisi'}
          montant={o.montant === null || o.montant.statut === 'refuse' ? null : o.montant.valeur}
          lien={<a className={styles.lienVert} href="#/simulateurs">Estimer avec le simulateur</a>}
        />
      )}
      <Appels saisies={o.saisies} onSaisir={onSaisir} />
      {o.paiement !== undefined && o.saisies.length === 0 && (
        <div className={g.actions}>
          {/* Saisie, la CFE entre dans le dû ; tant qu'elle ne l'est pas, ton
              disponible est surestimé d'autant. */}
          <button
            type="button"
            className={g.actionPrincipale}
            onClick={() => onSaisir({
              initiale: null,
              prerempli: { nature: 'cfe', ...(limite === undefined || limite.statut === 'refuse' ? {} : { echeanceLe: limite.valeur }) }
            })}
          >
            Saisir l’avis
          </button>
        </div>
      )}
    </>
  );
}

function DossierImpot({ obligation: o, onSaisir }: ProprietesDossier) {
  return (
    <>
      <p className={g.aide}>
        {o.detail} Prélevé par l’administration&nbsp;: rien à faire que le pointer quand il passe au relevé.
      </p>
      <Limite o={o} />
      <Pied
        libelle={o.saisies.length === 0 ? 'Estimé' : o.paiement?.etat === 'fait' ? 'Prélevé' : 'Prélèvement prévu'}
        montant={o.montant === null || o.montant.statut === 'refuse' ? null : o.montant.valeur}
        approx={o.montant?.statut === 'hypothese'}
      />
      <Appels saisies={o.saisies} onSaisir={onSaisir} prelevement />
      {o.saisies.length === 0 && (
        <div className={g.actions}>
          <button
            type="button"
            className={g.actionPrincipale}
            onClick={() => onSaisir({ initiale: null, prerempli: { nature: 'impot', exercice: Number(o.periode) } })}
          >
            Saisir l’avis
          </button>
        </div>
      )}
    </>
  );
}

function DossierRevenus({ obligation: o, aujourdhui, onRegistre }: ProprietesDossier) {
  const tva = useFaits((e) => e.faits.entreprise.tvaDepuis !== null);
  const d = o.declaration;
  const annee = Number(o.periode) - 1;
  const cases = o.cases;
  const lignes = cases === undefined ? [] : (['5TE', '5HQ'] as const).filter((c) => cases[c] > 0 || (c === '5HQ' && cases['5TE'] === 0));
  return (
    <>
      <p className={g.aide}>
        {d?.limite.statut === 'refuse'
          ? d.limite.motif
          : d === undefined ? '' : `En ligne avant le ${jourMois(d.limite.valeur)} ${d.limite.valeur.slice(0, 4)} pour ton département.`}
        {' '}Formulaire complémentaire 2042-C-PRO. C’est le département de ton domicile au 1ᵉʳ janvier qui fait foi.
      </p>
      {lignes.map((c) => (
        <div key={c}>
          <div className={styles.chiffre}>
            <span className={styles.intitule}>
              Recettes encaissées en {annee}
              <small>{c === '5TE' ? 'versement libératoire déjà payé avec l’Urssaf' : 'activité professionnelle, sans versement libératoire'}</small>
            </span>
            <span className={styles.caseFiscale}>{c}</span>
          </div>
          <div className={styles.grandChiffre}><Montant>{eur(cases?.[c] ?? 0)}</Montant></div>
        </div>
      ))}
      <p className={g.aide}>
        Le montant brut{tva ? ', hors taxes' : ''}&nbsp;: l’administration retire elle-même l’abattement de 34&nbsp;%.
        Ne déduis rien.
      </p>
      {d !== undefined && (
        <DeclarerLe
          nature="revenus"
          periodes={[o.periode]}
          faite={d.etat === 'fait'}
          faiteLe={d.faiteLe}
          libelle="Je l’ai déclarée le…"
          verbe="Déclarée"
          aujourdhui={aujourdhui}
        />
      )}
      <div className={g.actions}>
        <button type="button" className={g.bouton} onClick={() => onRegistre('livre')}>Voir le livre des recettes</button>
      </div>
    </>
  );
}

function DossierFormalite({ obligation: o }: ProprietesDossier) {
  const plateforme = useFaits((e) => e.faits.entreprise.plateformeAgreee);
  return (
    <>
      <p className={g.aide}>{o.detail}</p>
      <Limite o={o} />
      {plateforme !== null && (
        <p className={g.aide}>
          Inscrite&nbsp;: {plateforme.nom}{plateforme.depuis === null ? '' : `, depuis le ${jourMois(plateforme.depuis)}`}.
        </p>
      )}
      <div className={g.actions}>
        <a className={g.actionPrincipale} href="#/reglages/facturation">
          {plateforme === null ? 'Renseigner ma plateforme' : 'Modifier ma plateforme'}
        </a>
      </div>
    </>
  );
}
