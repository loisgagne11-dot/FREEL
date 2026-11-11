import { Suspense, lazy, useId, useState } from 'react';
import type { Euros } from '../../domain/types';
import type { FluxDuMois, LigneFlux } from '../../state/selecteurs';
import { Info } from './Info';
import { eur } from '../format';
import styles from './FluxCard.module.css';
import { Montant } from './Montant';

/**
 * Le flux du mois : ce qui entre, ce qui sort, ce qui reste pour soi.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS COLONNES, ET LEURS LIGNES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le handoff met sous chaque total les lignes qui le font, chacune avec sa
 * pastille — encaissé, en attente, en retard ; payé, à venir. Un total seul
 * ne dit pas QUI n'a pas payé : il fallait déplier un détail pour le savoir.
 * « Clique un statut » : la pastille d'une facture qui attend son argent ouvre
 * le panneau qui la pointe, ICI — l'aller-retour au facturier pour un virement
 * reçu était le geste le plus long de l'outil pour le plus fréquent. Celle
 * d'une échéance ouvre de même le panneau qui pointe son paiement.
 *
 * Sur téléphone, une colonne fait une centaine de pixels : une liste n'y tient
 * pas. Les colonnes n'y gardent que leurs totaux, et « Voir le détail » rend
 * toutes les lignes sur la largeur.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE VERSABLE VIT ICI, ET NULLE PART AILLEURS SUR LE PILOTE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Il avait sa propre carte au-dessus, et la colonne « Rémunération » le
 * répétait : deux fois le même chiffre, et une demi-largeur vide à côté de la
 * carte. Il s'ouvre sur sa composition, comme la carte le faisait.
 */

/**
 * Le détail déplié arrive au clic sur « Voir le détail » : il n'est pas vu à
 * l'ouverture du Pilote, et le paquet d'entrée a franchi son budget au lot 6.
 * Le conteneur, lui, existe toujours — `aria-controls` doit désigner quelque
 * chose ; c'est son contenu qui arrive.
 */
const DetailDuFlux = lazy(() => import('./FluxCard.detail').then((m) => ({ default: m.DetailDuFlux })));

/** Combien de lignes tiennent dans une colonne avant « Voir le détail ». */
const LIGNES_PAR_COLONNE = 4;

/** Là où le statut d'un encaissement se met à jour : la liste des factures. */
export const VERS_FACTURES = '#/activite/factures';
/** Là où le statut d'une sortie se met à jour : l'échéancier. */
const VERS_ECHEANCIER = '#/argent';

export function FluxCard(
  { flux, periode, onVersable, onPointer, onPayer, dejaVerse, besoinMensuel }: {
    readonly flux: FluxDuMois;
    readonly periode: string;
    /** Ouvre la composition du versable. */
    readonly onVersable: () => void;
    /**
     * Ouvre le panneau d'encaissement sur une facture. Absent, les pastilles
     * des entrées restent des liens vers le facturier — le cas d'un montage
     * sans Pilote.
     */
    readonly onPointer?: (idRecette: string) => void;
    /** Ouvre le panneau des sorties sur une échéance. Même règle que `onPointer`. */
    readonly onPayer?: (idEcheance: string) => void;
    /** Ce qui est déjà sorti vers soi ce mois-ci, ou `null` sans relevé. */
    readonly dejaVerse: Euros | null;
    readonly besoinMensuel: Euros;
  }
) {
  const [ouvert, setOuvert] = useState(false);
  const idDetail = useId();
  const versementPossible = flux.remuneration.versable > 0;

  const sorties: readonly LigneFlux[] = [
    ...flux.sorties.lignes,
    // La dette des encaissements non déclarés n'a pas encore d'échéance : elle
    // a quand même sa ligne, c'est la plus grosse sortie à venir du mois.
    ...(flux.sorties.aProvisionner > 0
      ? [{
        id: 'a-provisionner', libelle: 'Charges sur encaissements', montant: flux.sorties.aProvisionner,
        date: null, regle: false
      }]
      : [])
  ];
  const payees = sorties.filter((l) => l.regle).reduce((s, l) => s + l.montant, 0);

  const detaillables = [
    { cle: 'entrees', titre: 'Encaissements', lignes: flux.entrees.lignes, vers: VERS_FACTURES, onPointer },
    { cle: 'sorties', titre: 'Sorties', lignes: sorties, vers: VERS_ECHEANCIER, onPointer: onPayer }
  ].filter((d) => d.lignes.length > 0);

  return (
    <section className={styles.carte} aria-labelledby="titre-flux">
      <header className={styles.entete}>
        <h2 id="titre-flux" className={styles.titreCarte}>
          Le flux du mois · {periode}
          <Info libelle="Ce que montrent les trois colonnes">
            Ce qui est <strong>entré</strong> sur le mois, ce qui doit en
            <strong> sortir</strong>, et ce qu’il reste pour toi. L’argent en
            attente n’est pas borné au mois&nbsp;: une facture impayée
            n’appartient à aucun mois, et la masquer ferait disparaître de
            l’écran celle qu’il faut relancer.
          </Info>
        </h2>
        <p className={styles.indice}>clique un statut pour le mettre à jour</p>
      </header>

      <div className={styles.colonnes}>
        <div className={styles.colonne}>
          <span className={`${styles.libelle} ${styles.entree}`}>Entrées</span>
          <span className={`${styles.montant} ${styles.entree}`}>
            <Montant>{eur(flux.entrees.encaisse)}</Montant>
          </span>
          <p className={styles.note}>
            {flux.entrees.enAttente > 0
              ? <>encaissé · <Montant>{eur(flux.entrees.enAttente)}</Montant> en attente</>
              : 'encaissé · rien en attente'}
          </p>
          <Lignes lignes={flux.entrees.lignes} vers={VERS_FACTURES} onPointer={onPointer} />
        </div>

        <div className={styles.colonne}>
          <span className={`${styles.libelle} ${styles.sortie}`}>Sorties</span>
          <span className={`${styles.montant} ${styles.sortie}`}>
            <Montant>{eur(flux.sorties.total)}</Montant>
          </span>
          <p className={styles.note}>
            {sorties.length > 0
              ? <><Montant>{eur(payees as Euros)}</Montant> payé · <Montant>{eur(flux.sorties.total)}</Montant> à venir</>
              : 'Rien à mettre de côté'}
          </p>
          <Lignes lignes={sorties} vers={VERS_ECHEANCIER} onPointer={onPayer} />
        </div>

        <div className={styles.colonne}>
          <span className={`${styles.libelle} ${styles.entree}`}>Rémunération</span>
          <button type="button" className={`${styles.montant} ${styles.versable}`} onClick={onVersable}>
            <Montant>{eur(flux.remuneration.versable)}</Montant>
            {' '}<span className={styles.horsEcran}>— d’où vient ce chiffre</span>
            <span className={styles.chevron} aria-hidden="true">›</span>
          </button>
          <p className={styles.note}>
            {versementPossible
              ? <>Ce que tu peux te verser, <strong>hors provisions</strong>.</>
              : 'Rien n’est versable ce mois-ci.'}
          </p>
          {/* Ce qui est DÉJÀ sorti ce mois-ci : sans cette ligne, « 3 000 »
              se lit « en plus », alors qu'on s'est peut-être versé 2 500 le 5. */}
          {dejaVerse !== null && (
            <p className={styles.note}>
              Déjà versé&nbsp;: <Montant>{eur(dejaVerse)}</Montant>
              {besoinMensuel > 0 && dejaVerse < besoinMensuel && (
                <> — il manque <Montant>{eur((besoinMensuel - dejaVerse) as Euros)}</Montant> pour ton besoin</>
              )}
            </p>
          )}
          {versementPossible && (
            <a className={`${styles.action} ${styles.principale} ${styles.dansLaColonne}`} href="#/argent">
              Verser sur mon compte
            </a>
          )}
        </div>
      </div>

      <div className={styles.pied}>
        {versementPossible && (
          <a className={`${styles.action} ${styles.principale} ${styles.sousLesColonnes}`} href="#/argent">
            Verser sur mon compte
          </a>
        )}
        {detaillables.length > 0 && (
          <button
            type="button"
            className={styles.action}
            aria-expanded={ouvert}
            aria-controls={idDetail}
            onClick={() => setOuvert((o) => !o)}
          >
            {ouvert ? 'Masquer le détail' : 'Voir le détail'}
          </button>
        )}
      </div>

      {/* Le conteneur existe toujours pour que `aria-controls` désigne quelque
          chose ; c'est son contenu qui apparaît. */}
      <div id={idDetail} className={styles.details} hidden={!ouvert}>
        {ouvert && (
          <Suspense fallback={null}>
            <DetailDuFlux blocs={detaillables} />
          </Suspense>
        )}
      </div>
    </section>
  );
}

/** La pastille d'une ligne : ce qui est fait, ce qui attend, ce qui est en retard. */
export function Pastille({ ligne, vers }: { ligne: LigneFlux; vers: string }) {
  const [classe, texte] = ligne.regle
    ? [styles.fait, vers === VERS_FACTURES ? 'encaissé' : 'payé']
    : ligne.enRetard === true
      ? [styles.retard, 'en retard']
      : ligne.id === 'a-provisionner'
        ? [styles.attente, 'à provisionner']
        : [styles.attente, vers === VERS_FACTURES ? 'en attente' : 'à venir'];
  return <span className={`${styles.pastille} ${classe}`}>{texte}</span>;
}

/**
 * Une ligne se pointe d'ici quand quelque chose reste à régler ET qu'il y a un
 * fait à régler. « Charges sur encaissements » n'en a pas : c'est une
 * estimation, qui devient une échéance quand la période est déclarée — elle
 * garde son lien vers l'écran qui l'explique.
 */
export function pointable(l: LigneFlux): boolean {
  return !l.regle && l.id !== 'a-provisionner';
}

/** Ce que fait le bouton, pour qui ne voit pas la colonne. */
export function gesteDe(vers: string): string {
  return vers === VERS_FACTURES ? 'pointer l’encaissement' : 'pointer le paiement';
}

/** Les premières lignes d'une colonne, en grand écran seulement. */
function Lignes(
  { lignes, vers, onPointer }: {
    lignes: readonly LigneFlux[];
    vers: string;
    onPointer?: ((id: string) => void) | undefined;
  }
) {
  if (lignes.length === 0) return null;
  return (
    <ul className={styles.items}>
      {lignes.slice(0, LIGNES_PAR_COLONNE).map((l) => (
        <li key={l.id}>
          {onPointer !== undefined && pointable(l)
            ? (
              <button type="button" className={styles.item} onClick={() => onPointer(l.id)}>
                <span className={styles.itemNom}>{l.libelle}</span>
                <Pastille ligne={l} vers={vers} />
                {' '}<span className={styles.horsEcran}>— {gesteDe(vers)}</span>
              </button>
            )
            : (
              <a className={styles.item} href={vers}>
                <span className={styles.itemNom}>{l.libelle}</span>
                <Pastille ligne={l} vers={vers} />
              </a>
            )}
        </li>
      ))}
    </ul>
  );
}
