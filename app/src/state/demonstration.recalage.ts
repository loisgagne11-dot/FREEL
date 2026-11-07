import { type DateISO, type Mois, dateISO, euros, mois } from '../domain/types';
import { tauxImpotEtContributions } from '../domain/bareme/impot';
import { periodesADeclarer } from '../domain/calculs/declarations';
import { type Echeance, voletAProvisionner } from '../domain/calculs/provisions';
import { type Faits, type Recette, motifRefusFaits } from './schema';
import { completerFaits } from './schema.migrations';
import { periodesUrssafEffectives, recettesEncaissees, regimeDe, sousAcreLe } from './selecteurs';

/**
 * Recale le jeu de démonstration sur la date du jour.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE DÉMONSTRATION FIGÉE VIEILLIT EN RETARDS QU'ELLE N'A PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le jeu est écrit au 10 juin 2026, la date du handoff : c'est là que les
 * captures le photographient, horloge figée. Chargé depuis Réglages en
 * novembre, il montrait deux déclarations « en retard », trois factures
 * impayées depuis des mois et un compte qui ne bougeait plus depuis juin —
 * l'inverse de l'activité sereine qu'il est censé montrer à quelqu'un qui
 * découvre l'application.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PAR SEMAINES ENTIÈRES, ET CE QUI NE SE DÉCALE PAS SE RECALCULE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Toutes les dates avancent du même nombre de SEMAINES : un rythme de mission
 * est écrit par jour de la semaine, une note de CRA porte un lundi — décaler
 * de cinq jours ferait tomber les jours travaillés un samedi. Le jeu arrive
 * donc entre zéro et six jours avant aujourd'hui.
 *
 * Trois choses ne se décalent pas, parce qu'elles dépendent du calendrier
 * et non de l'écart entre deux dates :
 *   · la numérotation, annuelle — une facture de 2025 décalée en 2026 ne peut
 *     pas garder un numéro 2025 ;
 *   · les périodes déclarées, qui sont des trimestres civils : toute période
 *     close est déclarée, comme au 10 juin ;
 *   · les paiements URSSAF, recalculés pour chaque période déclarée à partir
 *     de SES encaissements, au taux que l'application applique — sans quoi
 *     l'échéancier afficherait un montant sans rapport avec sa base.
 */

/** L'« aujourd'hui » du jeu tel qu'il est livré : celui du handoff. */
export const ANCRE_DEMONSTRATION = '2026-06-10';

const JOUR = 86_400_000;
const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORME_MOIS = /^\d{4}-\d{2}$/;

const instant = (d: string): number =>
  Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

function decalerDate(d: string, jours: number): string {
  return new Date(instant(d) + jours * JOUR).toISOString().slice(0, 10);
}

/**
 * Décale toute date et tout mois rencontrés, valeurs ET clés — les
 * ajustements d'un planning sont indexés par jour. Les autres chaînes ne
 * ressemblent à aucune des deux formes : un numéro de facture a trois
 * chiffres après le tiret, un SIRET des espaces.
 */
function decaler(v: unknown, jours: number): unknown {
  if (typeof v === 'string') {
    if (FORME_DATE.test(v)) return decalerDate(v, jours);
    if (FORME_MOIS.test(v)) return decalerDate(`${v}-01`, jours).slice(0, 7);
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => decaler(x, jours));
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([cle, x]) => [
      FORME_DATE.test(cle) ? decalerDate(cle, jours) : cle,
      decaler(x, jours)
    ]));
  }
  return v;
}

/** Une suite continue par année d'émission ; un brouillon prend la suivante. */
function renumeroter(recettes: readonly Recette[], anneeCourante: string): readonly Recette[] {
  const emises = recettes
    .filter((r) => r.emiseLe !== null && typeof r.annuleEcriture !== 'string')
    .sort((a, b) => (a.emiseLe as string).localeCompare(b.emiseLe as string)
      || a.numero.localeCompare(b.numero));
  const numeros = new Map<string, string>();
  const compteurs = new Map<string, number>();
  const suivant = (annee: string): string => {
    const n = (compteurs.get(annee) ?? 0) + 1;
    compteurs.set(annee, n);
    return `${annee}-${String(n).padStart(3, '0')}`;
  };
  for (const r of emises) numeros.set(r.id, suivant((r.emiseLe as string).slice(0, 4)));
  for (const r of recettes) {
    if (r.emiseLe === null) numeros.set(r.id, suivant(anneeCourante));
  }
  return recettes.map((r) => {
    // Une annulation porte le numéro de la facture qu'elle annule.
    const numero = typeof r.annuleEcriture === 'string'
      ? numeros.get(r.annuleEcriture)
      : numeros.get(r.id);
    return numero === undefined ? r : { ...r, numero };
  });
}

/** Le dernier jour du mois qui suit `m` : la date limite d'une déclaration. */
function dateLimite(m: Mois): DateISO {
  const annee = Number(m.slice(0, 4));
  const suivant = Number(m.slice(5, 7)) + 1; // mois d'après, 1-indexé
  return dateISO(new Date(Date.UTC(annee, suivant, 0)).toISOString().slice(0, 10));
}

export function recalerDemonstration(faits: Faits, aujourdhui: DateISO): Faits {
  const semaines = Math.floor((instant(aujourdhui) - instant(ANCRE_DEMONSTRATION)) / (7 * JOUR));
  if (semaines <= 0) return faits;

  const decaleTout = decaler(faits, semaines * 7) as Faits;
  // Le début d'activité, lui, reste : décalé dans l'année de la plupart des
  // encaissements, il en faisait l'année de création, dont le seuil de TVA est
  // proratisé (CGI art. 293 B) — 28 000 € sur huit mois le franchissaient, et
  // la démonstration réclamait la TVA de factures émises sans. Laissé en
  // 2025, il ouvre seulement des périodes vides, déclarées à zéro plus bas.
  const decale: Faits = {
    ...decaleTout,
    entreprise: { ...decaleTout.entreprise, debutActivite: faits.entreprise.debutActivite }
  };
  const recettes = renumeroter(decale.recettes, aujourdhui.slice(0, 4));
  const avecRecettes: Faits = { ...decale, recettes };

  const debut = decale.entreprise.debutActivite;
  const closes = periodesADeclarer(
    recettesEncaissees(avecRecettes), decale.entreprise.urssafPeriodicite, [],
    aujourdhui, debut === null ? null : mois(debut.slice(0, 7))
  ).filter((p) => p.close);

  const ctx = {
    typeActivite: decale.entreprise.typeActivite,
    sousAcreLe: sousAcreLe(avecRecettes),
    periodesUrssaf: periodesUrssafEffectives(avecRecettes)
  };
  const veille = decalerDate(aujourdhui, -1);
  const paiements: Echeance[] = closes.flatMap((p) => {
    const dans = new Set<string>(p.mois);
    const encaissees = recettesEncaissees(avecRecettes).filter((r) => dans.has(r.encaisseeLe.slice(0, 7)));
    const dernier = p.mois[p.mois.length - 1] as Mois;
    const taux = tauxImpotEtContributions(regimeDe(avecRecettes), dernier, ctx.typeActivite);
    const montant = voletAProvisionner(encaissees, { mois: [] }, {
      ...ctx, tauxImpotEtContributions: taux.statut === 'refuse' ? 0 : taux.valeur
    }).montant;
    if (montant <= 0) return [];
    const limite = dateLimite(dernier);
    // Payée deux jours avant la limite, ou hier si la limite n'est pas
    // encore passée : une période close se déclare et se paie d'un geste.
    const payee = dateISO(limite < aujourdhui ? decalerDate(limite, -2) : veille);
    return [{
      id: `ech-urssaf-${p.id}`, nature: 'urssaf', montant: euros(montant),
      echeanceLe: limite, payeeLe: payee, montantPaye: euros(montant)
    }];
  });

  // La CFE : son avis paraît en novembre, et l'activité sereine que montre le
  // jeu le saisit à réception. Sans elle, passé le 15 décembre, le Pilote
  // annonçait à juste titre une CFE en retard. Montants fictifs : base réduite
  // de moitié la première année d'imposition, entière ensuite.
  const cfe: Echeance[] = [];
  const creation = Number((debut ?? aujourdhui).slice(0, 4));
  for (let annee = creation + 1; `${annee}-11-15` <= aujourdhui; annee += 1) {
    const dejaSaisie = decale.echeances.some(
      (e) => e.nature === 'cfe' && e.echeanceLe.startsWith(String(annee))
    );
    if (dejaSaisie) continue;
    const montant = euros(annee === creation + 1 ? 148 : 296);
    const limite = dateISO(`${annee}-12-15`);
    const payee = limite < aujourdhui ? dateISO(`${annee}-12-12`) : null;
    cfe.push({
      id: `ech-cfe-${annee}`, nature: 'cfe', montant, echeanceLe: limite,
      payeeLe: payee, montantPaye: payee === null ? null : montant
    });
  }

  return {
    ...avecRecettes,
    periodesDeclarees: closes.flatMap((p) => p.mois).sort(),
    echeances: [...decale.echeances.filter((e) => e.nature !== 'urssaf'), ...paiements, ...cfe]
  };
}

/**
 * Le recalage depuis le fichier tel qu'il est servi. Un bloc que le schéma
 * refuse passe tel quel : c'est l'adoption qui dira pourquoi, avec le motif,
 * plutôt qu'un recalage qui échouerait sur une forme qu'il ne connaît pas.
 */
export function recalerJeuBrut(brut: unknown, aujourdhui: DateISO): unknown {
  if (motifRefusFaits(brut) !== null) return brut;
  try {
    return recalerDemonstration(completerFaits(brut), aujourdhui);
  } catch {
    // Une démonstration datée vaut mieux que pas de démonstration du tout :
    // le recalage est un confort, pas une condition pour la charger.
    return brut;
  }
}
