import type { DateISO, Euros, Mois } from '../types';
import { euros } from '../types';
import { type JourPlanifie, type Quotite, type Rythme, rythmePour } from './planning';

/**
 * La prévision de revenu d'une mission.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE PREMIER MAILLON DE LA CHAÎNE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une mission n'est pas une fiche : c'est la source d'où descendent quatre
 * choses — la prévision de revenu, le planning, la facture du mois et le CRA.
 * Le planning et le CRA existaient ; la prévision non. Le tarif journalier et
 * le rythme étaient là, et rien n'en tirait ce qu'ils annoncent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PRÉVU N'EST PAS RETENU, ET L'ÉCART EST L'INFORMATION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le CRA valorise `retenu` : ce qui a effectivement été travaillé, ajustements
 * compris. La prévision valorise `prevu` : ce que le rythme annonce, avant
 * qu'on y touche.
 *
 * Les confondre ferait disparaître la question qui compte — « est-ce que je
 * tiens ce que j'avais prévu ? ». Un mois où l'on a travaillé trois jours de
 * moins que le rythme doit se voir, et il ne se voit qu'en gardant les deux
 * nombres côte à côte.
 *
 * Les congés et les fériés sont déjà retirés de `prevu` par `planifier()` :
 * une prévision qui les compterait annoncerait un revenu de vacances.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CHAQUE JOUR EST VALORISÉ AU TARIF DE SA DATE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Comme pour le CRA, et pour la même raison : appliquer le tarif du jour de
 * l'édition réécrirait le passé à chaque renégociation. Une mission dont le TJM
 * passe de 400 à 450 en juin doit valoir 400 en mai.
 */

/** Ce qu'un mois devrait rapporter, et ce qu'il rapporte en réalité. */
export interface PrevisionDuMois {
  readonly mois: Mois;
  /** Jours annoncés par le rythme, congés et fériés déduits. */
  readonly joursPrevus: Quotite;
  /** Jours réellement retenus, ajustements compris. */
  readonly joursRetenus: Quotite;
  /** Valorisation des jours prévus, au tarif en vigueur à chaque date. */
  readonly montantPrevu: Euros;
  /** Valorisation des jours retenus. C'est ce qui sera facturé. */
  readonly montantRetenu: Euros;
}

/**
 * Valorise une suite de journées à leur tarif de date.
 *
 * `tjmDefaut` sert quand aucun rythme ne couvre la date : c'est le tarif de la
 * mission. Sans lui, une journée hors rythme vaudrait zéro sans qu'on sache
 * pourquoi.
 */
function valoriser(
  jours: readonly { readonly date: DateISO; readonly quotite: Quotite }[],
  rythmes: readonly Rythme[],
  tjmDefaut: Euros
): Euros {
  return euros(jours.reduce((somme, j) => {
    const r = rythmePour(j.date, rythmes);
    return somme + j.quotite * (r?.tjm ?? tjmDefaut);
  }, 0));
}

/**
 * La prévision d'un mois, pour un client opérationnel.
 *
 * Prend le planning déjà calculé plutôt que de le recalculer : le planning est
 * la seule source des journées, et en produire une seconde ici garantirait
 * qu'elles finissent par diverger.
 */
export function previsionDuMois(
  mois: Mois,
  planning: readonly JourPlanifie[],
  rythmes: readonly Rythme[],
  tjmMission: Euros
): PrevisionDuMois {
  const duMois = planning.filter((j) => j.date.startsWith(mois));

  const prevus = duMois
    .filter((j) => j.prevu > 0)
    .map((j) => ({ date: j.date, quotite: j.prevu }));
  const retenus = duMois
    .filter((j) => j.retenu > 0)
    .map((j) => ({ date: j.date, quotite: j.retenu }));

  return {
    mois,
    joursPrevus: prevus.reduce((s, j) => s + j.quotite, 0),
    joursRetenus: retenus.reduce((s, j) => s + j.quotite, 0),
    montantPrevu: valoriser(prevus, rythmes, tjmMission),
    montantRetenu: valoriser(retenus, rythmes, tjmMission)
  };
}

/**
 * L'écart entre ce qui était prévu et ce qui a été retenu.
 *
 * Positif quand on a fait plus que prévu. Rendu séparément plutôt que calculé
 * à l'écran : c'est une soustraction que deux écrans feraient tôt ou tard
 * différemment.
 */
export function ecartDePrevision(p: PrevisionDuMois): Euros {
  return euros(p.montantRetenu - p.montantPrevu);
}

/**
 * Somme plusieurs prévisions mensuelles — plusieurs missions sur un même mois,
 * ou plusieurs mois d'une même mission.
 *
 * Le mois du total est celui de la première prévision. Sommer des mois
 * différents est légitime — c'est ce que fait une prévision annuelle — mais le
 * résultat ne doit alors pas être lu comme « le mois de ».
 */
export function totaliserPrevisions(
  previsions: readonly PrevisionDuMois[],
  mois: Mois
): PrevisionDuMois {
  return previsions.reduce<PrevisionDuMois>((t, p) => ({
    mois,
    joursPrevus: t.joursPrevus + p.joursPrevus,
    joursRetenus: t.joursRetenus + p.joursRetenus,
    montantPrevu: euros(t.montantPrevu + p.montantPrevu),
    montantRetenu: euros(t.montantRetenu + p.montantRetenu)
  }), {
    mois,
    joursPrevus: 0, joursRetenus: 0,
    montantPrevu: euros(0), montantRetenu: euros(0)
  });
}
