import { useMemo } from 'react';
import { useFaits } from '../../state/store';
import { dateDuJour } from '../../state/selecteurs';
import { type SeuilDeLAnnee, seuilsDeLAnnee } from '../../state/selecteurs.tresorerie';
import { partDeLAnneeEcoulee, projectionAnnuelle } from '../../domain/calculs/allure';
import { euros } from '../../domain/types';
import type { DateISO, Mois } from '../../domain/types';
import { AnneauSeuil } from '../components/AnneauSeuil';
import { Montant } from '../components/Montant';
import { eur } from '../format';
import { moisEtAnnee } from './Tresorerie.lecture';
import tr from './Tresorerie.module.css';

/**
 * « Tes seuils de l'année » — une carte que la maquette ne dessine pas, faite
 * dans le style de la planche (la jauge de seuil, l. 168) : trois anneaux, le
 * reste avant chaque seuil, ses deux dates de franchissement et les jours
 * facturables qui restent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX DATES, PARCE QU'ELLES NE RÉPONDENT PAS À LA MÊME QUESTION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Par ce qui est émis et signé » dit quand les factures parties et le
 * planning signé feront franchir le seuil — un fait, à son échéance. « Au
 * rythme de l'encaissé » prolonge le passé, et dit ce qui arrivera si l'année
 * continue comme elle a commencé. La première ne voit pas la mission qu'on
 * signera en septembre ; la seconde ne voit pas celle qu'on a déjà signée. Les
 * deux côte à côte, chacune avec son hypothèse écrite.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN SEUIL INCONNU NE SE DESSINE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les seuils viennent de tables datées qui peuvent ne pas couvrir l'année :
 * un anneau à « 62 % » d'un plafond inconnu serait un pourcentage inventé. La
 * carte dit alors pourquoi elle ne répond pas.
 */
export function CarteSeuils() {
  const faits = useFaits((e) => e.faits);
  const s = useMemo(() => seuilsDeLAnnee(faits, new Date()), [faits]);
  const aujourdhui = dateDuJour();
  const ecoulee = Math.round(partDeLAnneeEcoulee(aujourdhui) * 100);
  const type = faits.entreprise.typeActivite;
  const { plafondMicro, franchiseTva, assujettissementTva } = s.seuils;
  const nom: Readonly<Record<SeuilDeLAnnee['nom'], string>> = {
    // Le nom du régime réellement configuré : « micro-BNC » à un artisan
    // nommerait un plafond qui n'est pas le sien.
    plafond: `Plafond micro-${type === 'BNC' ? 'BNC' : 'BIC'}`,
    franchise: 'Franchise de TVA',
    majore: 'Seuil majoré de TVA'
  };

  return (
    <section className={tr.carte} aria-labelledby="t-seuils">
      <div className={tr.entete}>
        <h2 id="t-seuils" className={tr.titreCarte}>Tes seuils de l’année</h2>
        {/* Ils courent sur l'année civile, sur l'encaissé : ce ne sont pas des
            échéances qui reviennent chaque mois. */}
        <p className={tr.indication}>{s.annee}, sur l’encaissé · {ecoulee}&nbsp;% de l’année écoulée</p>
      </div>
      <div className={tr.seuils}>
        {plafondMicro.statut === 'refuse' && <p className={tr.vide}>Plafond micro&nbsp;: {plafondMicro.motif}</p>}
        {franchiseTva.statut === 'refuse' && <p className={tr.vide}>Franchise de TVA&nbsp;: {franchiseTva.motif}</p>}
        {s.lignes.map((l) => (
          <Seuil key={l.nom} l={l} nom={nom[l.nom]} aujourdhui={aujourdhui} />
        ))}
      </div>
      <Redevabilite a={assujettissementTva} />
    </section>
  );
}

function Seuil(
  { l, nom, aujourdhui }: { readonly l: SeuilDeLAnnee; readonly nom: string; readonly aujourdhui: DateISO }
) {
  const part = l.seuil > 0 ? l.encaisse / l.seuil : 0;
  const franchi = l.encaisse >= l.seuil;
  const teinte = franchi ? 'rouge' : l.parLePipeline.statut === 'prevu' ? 'ambre' : l.nom === 'plafond' ? 'vert' : 'tva';
  const projection = l.auRythme.statut === 'hors_annee' ? projectionAnnuelle(euros(l.encaisse), aujourdhui) : null;
  const j = l.joursFacturables;
  return (
    <div className={tr.seuil}>
      <AnneauSeuil part={part} teinte={teinte} libelle={`${Math.round(part * 100)} pour cent du seuil : ${nom}`} />
      <div className={tr.seuilTexte}>
        <b>{nom}</b>
        <span className={tr.mono}><Montant>{eur(l.encaisse)}</Montant></span> sur{' '}
        <span className={tr.mono}><Montant>{eur(l.seuil)}</Montant></span>
        <p>
          {franchi
            ? <span className={tr.alerte}>▲ Seuil franchi</span>
            : <>Il reste <Montant>{eur(l.seuil - l.encaisse)}</Montant> avant le seuil.</>}
        </p>
        {!franchi && (
          <>
            <p>
              Par ce qui est émis et signé&nbsp;:{' '}
              {l.parLePipeline.statut === 'prevu'
                ? <strong className={tr.attention}>franchi en {moisEtAnnee(l.parLePipeline.mois)}</strong>
                : 'pas franchi d’ici le 31 décembre'}.
            </p>
            <p>
              Au rythme de l’encaissé depuis janvier&nbsp;:{' '}
              {l.auRythme.statut === 'prevu' ? <>vers {moisEtAnnee(l.auRythme.mois as Mois)}</>
                : l.auRythme.statut === 'hors_annee' ? <>pas cette année{projection !== null && <> (l’année finirait à <Montant>{eur(projection)}</Montant>)</>}</>
                  : l.auRythme.statut === 'indeterminable' ? <>pas de projection, {l.auRythme.motif}</>
                    : 'déjà franchi'}.
            </p>
            {j.statut === 'refuse'
              ? <p>Jours facturables&nbsp;: pas de calcul, {j.motif}.</p>
              : <span className={`${tr.pastille} ${j.valeur > 0 ? tr.pastilleAttention : tr.pastilleRetard}`} title={j.source}>
                {j.valeur > 0 ? `◇ encore ${j.valeur} jour${j.valeur > 1 ? 's' : ''} facturable${j.valeur > 1 ? 's' : ''}` : '▲ plus un jour avant le seuil'}
              </span>}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Depuis quand collecter : le CA de l'an passé compris. Les anneaux ne
 * regardent que l'année en cours — un encaissement de décembre dernier qui a
 * fait perdre la franchise ne s'y voit pas ; seule cette phrase le dit.
 */
function Redevabilite({ a }: { readonly a: ReturnType<typeof seuilsDeLAnnee>['seuils']['assujettissementTva'] }) {
  if (a.statut === 'refuse' || a.valeur.cas === 'sous_franchise') return null;
  const etat = a.valeur;
  const mois = moisEtAnnee(etat.depuis);
  if (etat.cas === 'perte_franchise') {
    return (
      <p className={tr.sousTitre}>
        <span className={tr.attention}>◇ Franchise perdue à compter du 1ᵉʳ {mois}</span> — l’encaissé de
        l’année a dépassé la franchise simple, sans atteindre le seuil majoré.
      </p>
    );
  }
  return (
    <p className={tr.sousTitre}>
      <span className={tr.alerte}>▲ Redevable de la TVA depuis le 1ᵉʳ {mois}</span> —{' '}
      {etat.motif === 'annee_precedente'
        ? 'l’encaissé de l’an dernier avait déjà dépassé la franchise : cette année n’en a jamais eu.'
        : 'le seuil majoré a été franchi ce mois-là.'}
    </p>
  );
}
