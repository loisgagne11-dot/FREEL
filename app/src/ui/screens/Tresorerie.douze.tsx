import { Suspense, lazy, useMemo, useState } from 'react';
import { composantALaDemande } from '../composantALaDemande';
import { useFaits } from '../../state/store';
import { dateDuJour, soldeEstSuivi } from '../../state/selecteurs';
import { provenanceSoldeDe } from '../../state/selecteurs.reglages';
import {
  type LigneDuDu, type ScenarioTresorerie, type TresorerieDouzeMois, SANS_SCENARIO, projectionDuScenario,
  tresorerieDouzeMois
} from '../../state/selecteurs.tresorerie';
import type { CleComposition } from '../../domain/calculs/composition';
import { autonomieMois } from '../../domain/calculs/tresorerie';
import type { DateISO } from '../../domain/types';
import { BarreRepartition } from '../components/BarreRepartition';
import { Montant } from '../components/Montant';
import { Sheet } from '../components/Sheet';
import { eur, moisTexte } from '../format';
import { useRoute } from '../useRoute';
import { NOM_LIGNE_DU, detailDeLaLigne, moisSeul, provenanceDuSolde } from './Tresorerie.lecture';
import tr from './Tresorerie.module.css';

/**
 * La vue « douze mois à venir » de la Trésorerie, d'après
 * `direction/tresorerie.html` : la cascade du solde et ce qui est dû en tête,
 * puis la courbe du versement tenable, ce qui entre et ce qui sort, les seuils.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN SEUL CALCUL POUR TOUTE LA VUE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `tresorerieDouzeMois` est calculé ici, une fois, et passé aux cartes : la
 * courbe, les barres et le tableau lisent les mêmes douze mois. Chaque carte
 * qui le refaisait refaisait aussi le planning de douze mois — et deux cartes
 * finissaient par ne pas dire le même versement tenable.
 *
 * Les graphes vivent dans leurs modules (`Tresorerie.graphe`,
 * `Tresorerie.flux`), les seuils, le tableau et le détail d'une ligne du dû
 * dans les leurs : l'écran pesait 37,48 Ko sur 40 avant d'être redessiné, et un
 * budget ne se relève pas.
 */

const CarteVersementTenable = composantALaDemande(() => import('./Tresorerie.graphe')
  .then((m) => m.CarteVersementTenable), true);
const CarteFlux = composantALaDemande(() => import('./Tresorerie.flux').then((m) => m.CarteFlux), true);
const CarteSeuils = composantALaDemande(() => import('./Tresorerie.seuils').then((m) => m.CarteSeuils), true);
const DetailDeLaLigne = composantALaDemande(() => import('./Tresorerie.du.detail')
  .then((m) => m.DetailDeLaLigne), false);
/** La formule d'un chiffre, au clic sur son libellé — comme sur le Pilote. */
const Composition = lazy(() => import('../components/Composition').then((m) => ({ default: m.Composition })));

export function DouzeMois() {
  const faits = useFaits((e) => e.faits);
  const t = useMemo(() => tresorerieDouzeMois(faits, new Date()), [faits]);
  /* Les « et si » sont un ÉTAT D'ÉCRAN : jamais un fait, jamais enregistrés,
     remis à zéro en quittant l'écran — le composant qui les porte disparaît. */
  const [scenario, setScenario] = useState<ScenarioTresorerie>(SANS_SCENARIO);
  const projectionSi = useMemo(() => projectionDuScenario(faits, scenario, new Date()), [faits, scenario]);
  const attente = <p role="status" className={tr.vide}>Chargement…</p>;

  return (
    <>
      <div className={tr.rangee}>
        <CarteCascade t={t} />
        <CarteDu t={t} />
      </div>
      <Suspense fallback={attente}>
        <CarteVersementTenable t={t} scenario={scenario} projectionSi={projectionSi} onScenario={setScenario} />
      </Suspense>
      <Suspense fallback={attente}>
        <CarteFlux t={t} />
      </Suspense>
      <Suspense fallback={attente}>
        <CarteSeuils />
      </Suspense>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Du solde à ce que tu peux te verser
   ───────────────────────────────────────────────────────────────────────── */

/**
 * La cascade : solde, moins le dû, égale le disponible, moins la réserve,
 * égale ce que tu peux te verser. Elle remplace l'anneau et les quatre tuiles :
 * les mêmes nombres, ENCHAÎNÉS — on lit d'où vient le dernier sans additionner
 * de tête.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES BARRES SONT POSÉES SUR LE SOLDE, ET BORNÉES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chaque barre est un segment du solde : le dû en occupe la fin, le
 * disponible le début, la réserve la fin du disponible. Un dû plus grand que
 * le solde ne se dessine pas au-delà — c'est un manque, dit en toutes lettres
 * sous la cascade, avec le disponible négatif en rouge, jamais borné à zéro :
 * c'est le signal le plus fort de l'écran.
 *
 * Une réserve que le disponible ne couvre pas s'affiche à ce qu'elle est
 * vraiment constituée : la montrer pleine ferait croire à un plancher qui
 * n'existe pas.
 */
function CarteCascade({ t }: { readonly t: TresorerieDouzeMois }) {
  const faits = useFaits((e) => e.faits);
  const besoin = faits.besoinMensuel;
  const provenance = useMemo(() => provenanceSoldeDe(faits), [faits]);
  const { naviguerVers } = useRoute();
  const [compose, setCompose] = useState<CleComposition | null>(null);
  const [verser, setVerser] = useState(false);

  const { solde, provisions: du, dispo, reserve, versable } = t.tresorerie;
  const constituee = Math.min(reserve, Math.max(0, dispo));
  const echelle = Math.max(Math.abs(solde), du, 1);
  const pc = (v: number): string => `${(Math.max(0, Math.min(v, echelle)) / echelle) * 100}%`;
  const segment = (debut: number, fin: number) => ({ left: pc(debut), width: pc(Math.max(0, fin - debut)) });
  const autonomie = autonomieMois(versable, besoin);
  const dernierReleve = faits.mouvementsBancaires.reduce<DateISO | null>(
    (d, m) => (d === null || m.date > d ? m.date : d), null
  );
  const ouvrable = (cle: CleComposition, texte: string) => (
    <button type="button" className={tr.libelleOuvrable} onClick={() => setCompose(cle)}
      aria-label={`${texte} : d’où vient ce chiffre`}>
      {texte}
    </button>
  );

  return (
    <section className={`${tr.carte} ${tr.carteColonne}`} aria-labelledby="t-cascade">
      <div className={tr.entete}>
        <h2 id="t-cascade" className={tr.titreCarte}>Du solde à ce que tu peux te verser</h2>
        <p className={tr.indication}>
          {provenanceDuSolde(provenance, faits.soldeInitialAu, dernierReleve, t.aujourdhui)}
        </p>
      </div>

      {/* Une liste de définitions et non une image : chaque montant est du
          texte, lu dans l'ordre de l'équation. Les barres en sont le dessin. */}
      <dl className={tr.cascade}>
        <div>
          <dt className={tr.fort}>{ouvrable('solde', 'Solde du compte')}</dt>
          <dd><Montant>{eur(solde)}</Montant></dd>
          <div className={tr.piste} aria-hidden="true"><i className={tr.pisteSolde} style={segment(0, solde)} /></div>
        </div>
        <div>
          <dt>− Dû, à garder de côté</dt>
          <dd><Montant>{eur(du)}</Montant></dd>
          <div className={tr.piste} aria-hidden="true">
            <i className={tr.pisteDu} style={segment(Math.max(0, solde - du), Math.max(0, solde))} />
          </div>
        </div>
        <div>
          <dt className={tr.fort}>= {ouvrable('disponible', 'Disponible')}</dt>
          <dd className={dispo < 0 ? tr.negatif : undefined}><Montant>{eur(dispo)}</Montant></dd>
          <div className={tr.piste} aria-hidden="true"><i className={tr.pisteDispo} style={segment(0, dispo)} /></div>
        </div>
        <div>
          <dt>
            − Réserve de sécurité
            {constituee < reserve && (
              <> <span className={tr.indication}>(constituée sur <Montant>{eur(reserve)}</Montant>)</span></>
            )}
          </dt>
          <dd><Montant>{eur(constituee)}</Montant></dd>
          <div className={tr.piste} aria-hidden="true">
            <i className={tr.pisteReserve} style={segment(Math.max(0, dispo) - constituee, Math.max(0, dispo))} />
          </div>
        </div>
        <div>
          <dt className={tr.fort}>= {ouvrable('versable', 'À te verser')}</dt>
          <dd className={tr.fin}><Montant>{eur(versable)}</Montant></dd>
          <div className={tr.piste} aria-hidden="true"><i className={tr.pisteVerser} style={segment(0, versable)} /></div>
        </div>
      </dl>

      <div className={tr.pied} style={{ marginTop: 'auto' }}>
        <p className={tr.indication}>
          {dispo < 0 ? (
            <>
              Ton disponible est <strong>négatif</strong>&nbsp;: le dû dépasse le solde de{' '}
              <Montant>{eur(-dispo)}</Montant>. Il n’y a rien à te verser, et la réserve n’est pas constituée.
            </>
          ) : (
            <>
              {/* Le versé se lit au relevé : sans relevé, il est INCONNU, pas nul. */}
              Déjà versé en {moisSeul(t.moisCourant)}&nbsp;:{' '}
              {soldeEstSuivi(faits) ? <Montant>{eur(t.verseCeMois)}</Montant> : 'à lire sur ton relevé'}.
              {/* Un besoin à zéro ne divise rien : ni besoin, ni autonomie — pas d'« Infinity ». */}
              {besoin > 0 && (
                <>
                  {' '}Ton besoin est de <Montant>{eur(besoin)}</Montant> par mois
                  {autonomie !== null && <> — de quoi tenir {moisTexte(autonomie)}</>}.
                </>
              )}
            </>
          )}
        </p>
        <button type="button" className={`${tr.bouton} ${tr.boutonVert}`} onClick={() => setVerser(true)}>
          Verser sur mon compte
        </button>
      </div>

      {/* LE BOUTON NE CRÉE PAS DE FAIT. Se verser n'est pas une écriture en
          micro : le virement figure déjà au relevé, le saisir ici le
          compterait deux fois. Le dialogue dit où le geste se fait — le
          libellé de la maquette promet « verser », l'aide dit comment. */}
      <Sheet ouvert={verser} titre="Verser sur mon compte" onFermer={() => setVerser(false)}>
        {verser && (
          <>
            <p className={tr.vide}>
              Fais le virement depuis ta banque&nbsp;: <Montant>{eur(versable)}</Montant> au plus aujourd’hui.
              Le virement figurera ensuite sur ton relevé&nbsp;: il n’y a rien à saisir, il n’y a qu’à le
              nommer. Le saisir ici le compterait deux fois.
            </p>
            <div className={tr.pied}>
              <button type="button" className={`${tr.bouton} ${tr.boutonVert}`}
                onClick={() => { setVerser(false); naviguerVers('tresorerie', 'releve'); }}>
                Pointer le versement au relevé
              </button>
            </div>
          </>
        )}
      </Sheet>

      {compose !== null && (
        <Suspense fallback={null}>
          <Composition cle={compose} onFermer={() => setCompose(null)} />
        </Suspense>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Ce qui est dû
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Le dû, par charge telle qu'on la paie : URSSAF et formation ensemble,
 * l'impôt, la TVA, la CFE — chacune avec sa base et sa date.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉTAIL RESTE À UN CLIC
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les enveloppes d'avant disaient, pour chaque nature, ce que le solde couvre
 * et le détail mois par mois. Une ligne ne les affiche plus ; elle les OUVRE.
 * Un total ne se vérifie pas contre l'avis reçu — c'est le détail qui le
 * permet, et le perdre aurait été conforme à la maquette et faux.
 *
 * Les quatre lignes restent, même à zéro : la CFE n'a pas d'avis avant
 * novembre, et une ligne qui disparaît fait croire que la dette n'existe pas.
 */
function CarteDu({ t }: { readonly t: TresorerieDouzeMois }) {
  const [ouverte, setOuverte] = useState<LigneDuDu | null>(null);
  const { solde, provisions: du } = t.tresorerie;
  const manque = Math.max(0, du - Math.max(0, solde));
  const montant = (cle: LigneDuDu['cle']): number => t.du.find((l) => l.cle === cle)?.montant ?? 0;
  /* La phrase de la barre nomme l'ordre des parts, pas leurs montants : ils
     sont écrits juste dessous, masquables, et un nom accessible ne se masque
     pas en mode discret. */
  const phrase = `Ce qui est dû, de la plus grosse part à la plus petite : ${[...t.du]
    .filter((l) => l.montant > 0).sort((a, b) => b.montant - a.montant)
    .map((l) => NOM_LIGNE_DU[l.cle]).join(', ')}`;

  return (
    <section className={tr.carte} aria-labelledby="t-du">
      <div className={tr.entete}>
        <h2 id="t-du" className={tr.titreCarte}>Ce qui est dû</h2>
        {manque > 0
          ? <span className={`${tr.pastille} ${tr.pastilleRetard}`}>▲ <Montant>{eur(manque)}</Montant> non couverts</span>
          : <span className={`${tr.pastille} ${tr.pastilleOk}`}>● Tout est couvert</span>}
      </div>
      <p className={tr.total}><Montant>{eur(du)}</Montant></p>
      {/* L'ordre d'empilement validé pour un lecteur daltonien : impôt,
          URSSAF, TVA, CFE (`DIRECTION-VISUELLE.md`). */}
      <BarreRepartition
        libelle={phrase}
        parts={[
          { cle: 'impot', montant: montant('impot'), teinte: 'impot' },
          { cle: 'urssaf', montant: montant('urssaf'), teinte: 'urssaf' },
          { cle: 'tva', montant: montant('tva'), teinte: 'tva' },
          { cle: 'cfe', montant: montant('cfe'), teinte: 'cfe' }
        ]}
      />
      <ul className={tr.lignesDu}>
        {t.du.map((l) => (
          <li key={l.cle}>
            <button type="button" className={tr.ligneDu} onClick={() => setOuverte(l)}>
              <i className={`${tr.point} ${tr[l.cle]}`} aria-hidden="true" />
              <span className={tr.nomDu}>
                {NOM_LIGNE_DU[l.cle]}
                <small>{detailDeLaLigne(l, t.aujourdhui)}</small>
              </span>
              <span className={tr.valeurDu}><Montant>{eur(l.montant)}</Montant></span>
              <span className={tr.chevron} aria-hidden="true">›</span>
              <span className={tr.horsEcran}> — le détail</span>
            </button>
          </li>
        ))}
      </ul>

      <Sheet
        ouvert={ouverte !== null}
        titre={ouverte === null ? '' : `${NOM_LIGNE_DU[ouverte.cle]} — le détail`}
        onFermer={() => setOuverte(null)}
      >
        {ouverte !== null && (
          <Suspense fallback={<p role="status" className={tr.vide}>Chargement…</p>}>
            <DetailDeLaLigne ligne={ouverte} aujourdhui={dateDuJour()} />
          </Suspense>
        )}
      </Sheet>
    </section>
  );
}
