import { describe, expect, it } from 'vitest';
import { periodesADeclarer } from '../domain/calculs/declarations';
import { ecritureDAnnulation } from '../domain/calculs/ecritureRecette';
import type { EcritureRecette } from '../domain/calculs/livreRecettes';
import { type DateISO, type Mois, dateISO, euros, mois } from '../domain/types';
import { VERSION_SCHEMA, type Faits, motifRefusFaits } from '../state/schema';
import {
  aTraiter, debutTvaEffectif, dateDuJour, etatPilote, fluxDuMois, moisCourant,
  provisionIrDe, recettesEncaissees, sousAcreLe, soldeImpotPrecedentDe, solde,
  caEncaisseAnnee, tvaDueDepuisDe
} from '../state/selecteurs';
import { finAcreDe } from '../state/selecteurs.reglages';
import { etatActivite, craDuMoisParMission, tauxCotisationsAu } from '../state/selecteurs.activite';
import { dossierTvaDuTrimestre, etatArgent } from '../state/selecteurs.argent';
import { journeesDuMois } from '../state/selecteurs.cra';
import { chargerJeu, chargerJeuBrut, faitsAu, le } from '../test/jeu-d-essai';
import { valeurPubliee } from '../test/resolution';

/**
 * Le jeu d'essai à forme réelle traverse les vrais sélecteurs.
 *
 * Ce qu'on attend d'ici n'est pas la justesse d'un calcul — les tests de
 * chaque module s'en chargent — mais ce que seule la FORME d'un compte réel
 * révèle : une valeur absurde (NaN, Infinity) née de l'enchaînement de règles
 * qui, chacune, ont leurs tests verts.
 *
 * Chronologie du jeu (voir `jeu-d-essai.json`) :
 *  - début d'activité au 1er avril 2025, ACRE jusqu'au 31 mars 2026 ;
 *  - seuil majoré de TVA franchi par l'encaissement du 26 juin 2026 ;
 *  - facture de formation avec TVA encaissée le 28 août, annulée le 12 novembre ;
 *  - rien de daté après le 15 décembre 2026, jour de référence du jeu.
 */

const jeu = chargerJeu();

/** Les dates où l'on regarde le compte, avec ce qui les rend intéressantes. */
const DATES: readonly { readonly nom: string; readonly date: Date }[] = [
  { nom: '2 janvier 2026 (lendemain du 31 décembre 2025)', date: le(2026, 1, 2) },
  { nom: '15 mars 2026 (sous ACRE)', date: le(2026, 3, 15) },
  { nom: '30 avril 2026 (un mois après la fin de l’ACRE)', date: le(2026, 4, 30) },
  { nom: '15 mai 2026 (avant le franchissement de la TVA)', date: le(2026, 5, 15) },
  { nom: '30 juin 2026 (mois du franchissement)', date: le(2026, 6, 30) },
  { nom: '15 décembre 2026 (jour de référence du jeu)', date: le(2026, 12, 15) },
  { nom: '2 janvier 2027 (lendemain du 31 décembre 2026)', date: le(2027, 1, 2) }
];

/**
 * Le compte au lendemain du 31 décembre 2026 : ce que le jeu ne peut pas porter
 * sans mentir sur sa date de référence, puisqu'il s'arrête au 15 décembre.
 * La facture de novembre est réglée le 26 décembre, celle du 10 décembre le 2
 * janvier, et la facture de décembre de la mission est émise le 31.
 */
function auPassageDeLAnnee(): Faits {
  const base = faitsAu(jeu, le(2027, 1, 2));
  const modele = base.recettes.find((r) => r.emiseLe === '2026-11-30');
  if (modele === undefined) throw new Error('Le jeu a changé : la facture de novembre est introuvable.');
  return {
    ...base,
    recettes: [
      ...base.recettes.map((r) => {
        if (r.id === modele.id) {
          return { ...r, encaisseeLe: dateISO('2026-12-26'), modeReglement: 'virement' as const };
        }
        if (r.id === 'rec-suivi-decembre') {
          return { ...r, encaisseeLe: dateISO('2027-01-02'), modeReglement: 'virement' as const };
        }
        return r;
      }),
      {
        ...modele, id: 'rec-2026-decembre', numero: '2026-099', libelle: 'Mission conseil — décembre 2026',
        montant: euros(6720), tvaCollectee: euros(1344), emiseLe: dateISO('2026-12-31'),
        envoyeeLe: dateISO('2026-12-31'), encaisseeLe: null, modeReglement: null,
        echeanceLe: dateISO('2027-01-31')
      }
    ]
  };
}

/** Tous les nombres non finis d'une valeur, avec leur chemin. */
function nonFinis(valeur: unknown, chemin = '$', vus = new Set<unknown>()): string[] {
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? [] : [`${chemin} = ${valeur}`];
  if (typeof valeur !== 'object' || valeur === null || vus.has(valeur)) return [];
  vus.add(valeur);
  if (valeur instanceof Map) {
    return [...valeur.entries()].flatMap(([k, v]) => nonFinis(v, `${chemin}[${String(k)}]`, vus));
  }
  return Object.entries(valeur).flatMap(([k, v]) => nonFinis(v, `${chemin}.${k}`, vus));
}

const moisDe = (d: Date): Mois => moisCourant(d);
const trimestreDe = (d: Date): { du: DateISO; au: DateISO } => {
  const t = Math.floor(d.getMonth() / 3);
  const fin = new Date(Date.UTC(d.getFullYear(), t * 3 + 3, 0)).getUTCDate();
  const m1 = String(t * 3 + 1).padStart(2, '0');
  const m3 = String(t * 3 + 3).padStart(2, '0');
  return {
    du: dateISO(`${d.getFullYear()}-${m1}-01`),
    au: dateISO(`${d.getFullYear()}-${m3}-${String(fin).padStart(2, '0')}`)
  };
};

describe('le jeu lui-même', () => {
  // Un jeu au schéma d'hier passerait par la migration au chargement : les
  // tests ne verraient plus le compte tel que l'application le lit au
  // quotidien, mais tel qu'une migration l'a reconstruit.
  it('est au schéma courant et accepté tel quel', () => {
    const brut = chargerJeuBrut() as { version: number };
    expect(brut.version).toBe(VERSION_SCHEMA);
    expect(motifRefusFaits(brut)).toBeNull();
  });

  // Un champ manquant au jeu serait comblé en silence par `completerFaits`, et
  // les tests rouleraient sur une valeur par défaut que personne n'a choisie.
  it('est complet : aucun champ n’est comblé au chargement', () => {
    expect(jeu).toEqual(chargerJeuBrut());
  });

  it('démarre en 2025 sous ACRE, que l’ACRE quitte en cours de jeu', () => {
    expect(jeu.entreprise.debutActivite).toBe('2025-04-01');
    expect(jeu.entreprise.acre).toBe(true);
    expect(jeu.entreprise.versementLiberatoire).toBe(false);
    expect(jeu.entreprise.urssafPeriodicite).toBe('trimestriel');
    const fin = finAcreDe(jeu);
    expect(valeurPubliee(fin)).toBe('2026-03');
    expect(sousAcreLe(jeu)(mois('2026-03'))).toBe(true);
    expect(sousAcreLe(jeu)(mois('2026-04'))).toBe(false);
  });

  // La mission est facturée à l'agence, mais le CRA se remet au client final :
  // les confondre ferait signer un compte rendu à quelqu'un qui ne l'a pas vécu.
  it('porte une mission via agence : celui qui paie n’est pas celui qui occupe les journées', () => {
    const mission = jeu.missions.find((m) => m.clientNom === 'Agence Démo Conseil');
    expect(mission).toBeDefined();
    expect(mission?.entites.map((e) => e.nom)).toEqual(['Client Final Démo']);
    expect(jeu.recettes.some((r) => r.clientNom === 'Client Final Démo')).toBe(false);
  });

  it('porte un foyer à deux parts avec le salaire du conjoint', () => {
    expect(jeu.partsFiscales).toBe(2);
    expect(jeu.autresRevenusFoyer).toBe(31000);
    expect(jeu.impositionCommune).toBe(true);
    expect(jeu.versementPerDeductible).toBe(0);
  });

  // Le jeu doit contenir l'avoir tel que l'application l'écrit, pas tel qu'on
  // imagine qu'elle l'écrit : sinon le test du dossier de TVA vérifierait une
  // forme que nul écran ne produit.
  it('porte un avoir identique à celui que construit ecritureDAnnulation', () => {
    const avoir = jeu.recettes.find((r) => r.id === 'rec-avoir-formation');
    const origine = jeu.recettes.find((r) => r.id === 'rec-formation');
    expect(avoir).toBeDefined();
    expect(origine).toBeDefined();
    const attendu = ecritureDAnnulation(
      origine as EcritureRecette, dateISO('2026-11-12'), 'rec-avoir-formation'
    );
    expect(avoir).toMatchObject({
      id: attendu.id, libelle: attendu.libelle, montant: attendu.montant,
      tvaCollectee: attendu.tvaCollectee, emiseLe: attendu.emiseLe,
      encaisseeLe: attendu.encaisseeLe, modeReglement: attendu.modeReglement,
      numero: attendu.numero, annuleEcriture: attendu.annuleEcriture
    });
  });

  it('n’a aucune échéance d’impôt portant l’exercice 2026 : l’avis n’est pas arrivé', () => {
    expect(jeu.echeances.some((e) => e.nature === 'impot' && e.exercice === 2026)).toBe(false);
  });

  it('ne date aucun fait après son jour de référence, le 15 décembre 2026', () => {
    const dates = [
      ...jeu.recettes.flatMap((r) => [r.emiseLe, r.encaisseeLe]),
      ...jeu.depenses.map((d) => d.payeeLe),
      ...jeu.echeances.flatMap((e) => [e.payeeLe]),
      ...jeu.mouvementsBancaires.map((m) => m.date)
    ].filter((d): d is DateISO => d !== null);
    expect(dates.filter((d) => d > '2026-12-15')).toEqual([]);
  });
});

describe('aucune valeur absurde, à aucune date', () => {
  // Un parcours qui ne verrait pas un NaN enfoui dans une liste, une Map ou un
  // objet imbriqué laisserait vert tout ce qui suit : on éprouve d'abord lui.
  it('le parcours voit un NaN ou un infini à n’importe quelle profondeur', () => {
    expect(nonFinis({ a: [{ b: Number.NaN }], c: new Map([['k', { d: Infinity }]]), e: 1 }))
      .toEqual(['$.a.0.b = NaN', '$.c[k].d = Infinity']);
  });

  // Un NaN dans un montant s'affiche « NaN € » à l'écran, ou pire, se propage
  // dans une somme et rend un versable que personne ne peut recouper.
  it.each(DATES)('$nom', ({ date }) => {
    const faits = date.getFullYear() === 2027 ? auPassageDeLAnnee() : faitsAu(jeu, date);
    const m = moisDe(date);
    const annee = date.getFullYear();
    const etat = etatPilote(faits, faits.echeances, date);

    const sorties: Record<string, unknown> = {
      etatPilote: etat,
      etatArgent: etatArgent(faits, faits.echeances, date),
      etatArgentAnneePrecedente: etatArgent(faits, faits.echeances, date, annee - 1),
      aTraiter: aTraiter(faits, date),
      fluxDuMois: fluxDuMois(faits, m, etat),
      dossierTva: dossierTvaDuTrimestre(faits, trimestreDe(date).du, trimestreDe(date).au, date),
      provisionIr: provisionIrDe(faits, date),
      soldeImpotPrecedent: soldeImpotPrecedentDe(faits, date),
      etatActivite: etatActivite(faits, m, date),
      cra: craDuMoisParMission(faits, m)
    };
    for (const [nom, valeur] of Object.entries(sorties)) {
      expect(nonFinis(valeur), nom).toEqual([]);
    }
  });
});

describe('la trésorerie', () => {
  // La formule est celle de `calculerTresorerie` : le versable est ce qui reste
  // du solde une fois les provisions et la réserve retirées, jamais négatif.
  // Si elle sautait, l'application inviterait à se verser de l'argent dû.
  it.each(DATES)('le versable est max(0, solde − provisions − réserve) : $nom', ({ date }) => {
    const faits = date.getFullYear() === 2027 ? auPassageDeLAnnee() : faitsAu(jeu, date);
    const { tresorerie } = etatPilote(faits, faits.echeances, date);

    expect(tresorerie.solde).toBeCloseTo(solde(faits), 2);
    expect(tresorerie.reserve).toBe(faits.reserve);
    expect(tresorerie.versable).toBeCloseTo(
      Math.max(0, solde(faits) - tresorerie.provisions - faits.reserve), 2
    );
  });

  // Sans une date où le versable est positif, la formule ci-dessus serait
  // vérifiée sur des zéros partout — max(0, négatif) = 0 la satisfait toujours.
  it('le jeu donne un versable positif à une date, et nul à une autre', () => {
    const versables = DATES.map(({ date }) => {
      const faits = date.getFullYear() === 2027 ? auPassageDeLAnnee() : faitsAu(jeu, date);
      return etatPilote(faits, faits.echeances, date).tresorerie.versable;
    });
    expect(versables.some((v) => v > 0)).toBe(true);
    expect(versables.some((v) => v === 0)).toBe(true);
  });

  it('les provisions sont la somme des deux volets, ventilée sans reste', () => {
    for (const { date } of DATES) {
      const faits = date.getFullYear() === 2027 ? auPassageDeLAnnee() : faitsAu(jeu, date);
      const e = etatPilote(faits, faits.echeances, date);
      expect(e.tresorerie.provisions).toBeCloseTo(e.voletConstate + e.voletAProvisionner, 2);
      const ventile = Object.values(e.provisionsParNature).reduce((s, v) => s + v, 0);
      expect(ventile).toBeCloseTo(e.tresorerie.provisions, 2);
    }
  });
});

describe('la TVA franchie en cours d’année', () => {
  // Le seuil majoré (41 250 €) est franchi par l'encaissement du 26 juin 2026 :
  // c'est le mois où les factures doivent commencer à porter la TVA.
  it('est due à partir de juin 2026', () => {
    expect(debutTvaEffectif(jeu)).toBe('2026-06');
    expect(tvaDueDepuisDe(jeu)).toBe('2026-06');
  });

  it('n’est pas encore due avant le franchissement, ni à la veille de l’encaissement', () => {
    expect(debutTvaEffectif(faitsAu(jeu, le(2026, 5, 15)))).toBeNull();
    expect(debutTvaEffectif(faitsAu(jeu, le(2026, 6, 25)))).toBeNull();
    expect(debutTvaEffectif(faitsAu(jeu, le(2026, 6, 30)))).toBe('2026-06');
  });

  // Une 2025 sous le prorata de la première année (28 253 €) : au-dessus, la
  // TVA serait due dès le 1er janvier 2026 et le jeu ne montrerait plus un
  // franchissement EN COURS d'année.
  it('ne doit rien à la franchise de la première année', () => {
    expect(caEncaisseAnnee(jeu, 2025)).toBe(27600);
  });

  it('fait porter la TVA aux factures émises depuis, sauf deux oublis', () => {
    const oublis = ['2026-07-31', '2026-09-30'];
    const emisesDepuis = jeu.recettes.filter((r) =>
      typeof r.annuleEcriture !== 'string' && r.emiseLe !== null && r.emiseLe >= '2026-06-01');
    expect(emisesDepuis.length).toBeGreaterThan(5);
    for (const r of emisesDepuis) {
      const attendue = oublis.includes(r.emiseLe as string) ? 0 : r.montant * 0.2;
      expect(r.tvaCollectee, r.numero).toBeCloseTo(attendue, 2);
    }
    // Avant le franchissement : en franchise, zéro, ce qui est juste.
    const avant = jeu.recettes.filter((r) => r.emiseLe !== null && r.emiseLe < '2026-06-01');
    expect(avant.every((r) => r.tvaCollectee === 0)).toBe(true);
  });

  it('signale les deux factures émises sans TVA après le franchissement', () => {
    const sujet = aTraiter(jeu, le(2026, 12, 15)).find((s) => s.id === 'tva-a-regulariser');
    expect(sujet?.nombre).toBe(2);
    expect(aTraiter(faitsAu(jeu, le(2026, 5, 15)), le(2026, 5, 15))
      .some((s) => s.id === 'tva-a-regulariser')).toBe(false);
  });
});

describe('le suivi des seuils de TVA', () => {
  const statut = (faits: Faits, date: Date, annee?: number) => {
    const r = etatArgent(faits, faits.echeances, date, annee).seuils.assujettissementTva;
    return valeurPubliee(r);
  };

  it('est en franchise avant le franchissement, redevable depuis juin ensuite', () => {
    expect(statut(faitsAu(jeu, le(2026, 5, 15)), le(2026, 5, 15)).cas).toBe('sous_franchise');
    expect(statut(jeu, le(2026, 12, 15))).toEqual({
      cas: 'redevable', depuis: '2026-06', motif: 'annee_en_cours'
    });
  });

  // Au 2 janvier, l'année de l'horloge n'a encore rien encaissé : seul le CA
  // de 2026 dit que la franchise n'existe plus. C'est le bug du lendemain de
  // la Saint-Sylvestre, où l'écran annonçait un retour en franchise.
  it('reste redevable le 2 janvier, par le chiffre d’affaires de l’année écoulée', () => {
    expect(statut(auPassageDeLAnnee(), le(2027, 1, 2))).toEqual({
      cas: 'redevable', depuis: '2027-01', motif: 'annee_precedente'
    });
  });
});

describe('l’avoir', () => {
  const t4 = { du: dateISO('2026-10-01'), au: dateISO('2026-12-31') };
  const t3 = { du: dateISO('2026-07-01'), au: dateISO('2026-09-30') };

  // 300 € de TVA reversés en août sur une facture annulée en novembre ne
  // reviennent que si l'avoir figure, au signe opposé, au trimestre de
  // l'avoir — pas à celui de la facture.
  it('figure au signe opposé dans le dossier du trimestre où il est encaissé', () => {
    const d = dossierTvaDuTrimestre(jeu, t4.du, t4.au, le(2026, 12, 15));
    const piece = d.encaissements.find((p) => p.id === 'rec-avoir-formation');
    const origine = jeu.recettes.find((r) => r.id === 'rec-formation');
    expect(piece).toMatchObject({ montantHt: -1500, tva: -300, avoir: true, numero: origine?.numero });
    expect(d.collectee).toBeCloseTo(1440 - 300, 2);
  });

  it('laisse la facture annulée dans le trimestre où elle a été déclarée', () => {
    const d = dossierTvaDuTrimestre(jeu, t3.du, t3.au, le(2026, 12, 15));
    expect(d.encaissements.find((p) => p.id === 'rec-formation')?.tva).toBe(300);
    expect(d.collectee).toBeCloseTo(1440 + 300 + 864, 2);
    expect(d.encaissements.some((p) => p.id === 'rec-avoir-formation')).toBe(false);
  });

  it('ne laisse aucune TVA nette sur la facture annulée une fois les deux trimestres cumulés', () => {
    const net = [t3, t4].flatMap((t) =>
      dossierTvaDuTrimestre(jeu, t.du, t.au, le(2026, 12, 15)).encaissements)
      .filter((p) => p.numero === jeu.recettes.find((r) => r.id === 'rec-formation')?.numero)
      .reduce((s, p) => s + (p.tva ?? 0), 0);
    expect(net).toBe(0);
  });

  it('annule aussi le hors-taxe au chiffre d’affaires encaissé de l’année', () => {
    const sans = jeu.recettes.filter((r) =>
      r.id !== 'rec-formation' && r.id !== 'rec-avoir-formation');
    const sansLaPaire = { ...jeu, recettes: sans };
    expect(caEncaisseAnnee(jeu, 2026)).toBe(caEncaisseAnnee(sansLaPaire, 2026));
  });
});

describe('la provision de TVA', () => {
  // DÉFAUT TROUVÉ PAR CE JEU, corrigé au lot 4 : `tvaAReverserDe` retranchait
  // les échéances de TVA de la TVA COLLECTÉE brute, sans la TVA déductible
  // que ces échéances avaient déjà nettée. L'échéance du T3 (2 444 €) vaut
  // 2 604 € collectés moins 160 € déductibles : les 160 € restaient en
  // provision indéfiniment — 1 300 € provisionnés quand le dossier du
  // trimestre en cours dit 1 140 €. Deux calculs de la même dette.
  it('égale ce que dit le dossier du trimestre en cours, au 15 décembre', () => {
    const d = dossierTvaDuTrimestre(jeu, dateISO('2026-10-01'), dateISO('2026-12-31'), le(2026, 12, 15));
    const e = etatPilote(jeu, jeu.echeances, le(2026, 12, 15));
    expect(e.provisionsParNature.tva).toBeCloseTo(d.aPayer, 2);
  });

  it('retient au moins la TVA collectée au dernier trimestre, nette de l’avoir', () => {
    const e = etatPilote(jeu, jeu.echeances, le(2026, 12, 15));
    expect(e.provisionsParNature.tva).toBeGreaterThanOrEqual(1440 - 300);
  });
});

describe('les périodes à déclarer', () => {
  // Le Pilote annonçait « 4 périodes à déclarer » quand l'échéancier n'en
  // montrait qu'une : l'alerte ne pouvait plus s'éteindre. Ici on lit les deux
  // chiffres sur un compte entier, pas sur trois recettes.
  it.each(DATES)('le Pilote et l’échéancier comptent pareil : $nom', ({ date }) => {
    const faits = date.getFullYear() === 2027 ? auPassageDeLAnnee() : faitsAu(jeu, date);
    const sujet = aTraiter(faits, date).find((s) => s.id === 'periodes-a-declarer');
    const debut = faits.entreprise.debutActivite;
    const echeancier = periodesADeclarer(
      recettesEncaissees(faits), faits.entreprise.urssafPeriodicite, faits.periodesDeclarees,
      dateDuJour(date), debut === null ? null : debut.slice(0, 7) as Mois
    ).filter((p) => p.close && !p.declaree);
    expect(sujet?.nombre ?? 0).toBe(echeancier.length);
  });

  it('le troisième trimestre 2026 reste à déclarer le 15 décembre, le quatrième s’y ajoute en janvier', () => {
    const decembre = aTraiter(jeu, le(2026, 12, 15)).find((s) => s.id === 'periodes-a-declarer');
    expect(decembre?.nombre).toBe(1);
    const janvier = aTraiter(auPassageDeLAnnee(), le(2027, 1, 2)).find((s) => s.id === 'periodes-a-declarer');
    expect(janvier?.nombre).toBe(2);
  });

  // Cocher ce que l'échéancier propose doit éteindre l'alerte : c'est le
  // cul-de-sac que la règle unique a supprimé.
  it('s’éteint quand on déclare le trimestre proposé', () => {
    const declare = {
      ...jeu,
      periodesDeclarees: [...jeu.periodesDeclarees, '2026-07', '2026-08', '2026-09'] as Mois[]
    };
    expect(aTraiter(declare, le(2026, 12, 15)).some((s) => s.id === 'periodes-a-declarer')).toBe(false);
  });
});

describe('le passage du 31 décembre', () => {
  // Au 2 janvier l'assiette de l'année de l'horloge repart de zéro. Sans le
  // solde estimé de 2026, l'impôt de l'année écoulée sortirait des provisions
  // et le versable monterait d'autant jusqu'à la saisie de l'avis.
  it('garde le solde estimé de l’impôt 2026 dans la provision', () => {
    const faits = auPassageDeLAnnee();
    const maintenant = le(2027, 1, 2);
    const precedent = soldeImpotPrecedentDe(faits, maintenant);
    expect(precedent).not.toBeNull();
    const v = valeurPubliee(precedent);
    expect(v.annee).toBe(2026);
    expect(v.assiette).toBe(caEncaisseAnnee(faits, 2026));
    expect(v.resteAProvisionner).toBeGreaterThan(0);

    const e = etatPilote(faits, faits.echeances, maintenant);
    expect(e.soldeImpotPrecedent).not.toBeNull();
    expect(e.provisionsParNature.impot).toBeGreaterThanOrEqual(v.resteAProvisionner);
  });

  it('compte l’année de l’horloge et celle des encaissements séparément', () => {
    const faits = auPassageDeLAnnee();
    // 2026 : tout ce qui a été encaissé jusqu'au 26 décembre ; 2027 : une facture.
    expect(caEncaisseAnnee(faits, 2027)).toBe(1800);
    expect(caEncaisseAnnee(faits, 2026)).toBeGreaterThan(75000);
    const a = etatArgent(faits, faits.echeances, le(2027, 1, 2));
    expect(a.annee).toBe(2027);
    expect(a.caEncaisse).toBe(1800);
    // L'année écoulée reste consultable : c'est le bug du pilier vide au 1er janvier.
    expect(etatArgent(faits, faits.echeances, le(2027, 1, 2), 2026).caEncaisse)
      .toBe(caEncaisseAnnee(faits, 2026));
  });

  // Le solde est celui du compte, pas celui de l'année affichée.
  it('ne change pas le solde quand on regarde l’année précédente', () => {
    const faits = auPassageDeLAnnee();
    const courant = etatArgent(faits, faits.echeances, le(2027, 1, 2));
    const passe = etatArgent(faits, faits.echeances, le(2027, 1, 2), 2026);
    expect(passe.tresorerie).toEqual(courant.tresorerie);
  });

  // L'avis saisi est un fait : le solde estimé ne doit plus se compter en plus.
  it('cesse d’estimer le solde 2026 dès que son avis est saisi', () => {
    const faits = auPassageDeLAnnee();
    const avecAvis: Faits = {
      ...faits,
      echeances: [...faits.echeances, {
        id: 'ech-impot-solde-2026', nature: 'impot', montant: euros(2000),
        echeanceLe: dateISO('2027-09-25'), payeeLe: null, montantPaye: null, exercice: 2026
      }]
    };
    expect(soldeImpotPrecedentDe(avecAvis, le(2027, 1, 2))).toBeNull();
  });

  // En mai 2026 le solde 2025 se paie à l'automne : son avis n'est pas saisi,
  // l'estimation tient. Il l'est en décembre : elle s'efface devant le fait.
  it('estime le solde 2025 tant que son avis manque, et plus après', () => {
    expect(soldeImpotPrecedentDe(faitsAu(jeu, le(2026, 5, 15)), le(2026, 5, 15))).not.toBeNull();
    expect(soldeImpotPrecedentDe(jeu, le(2026, 12, 15))).toBeNull();
  });

  // Le jeu a un foyer dont la décote efface l'impôt des seuls autres revenus :
  // l'impôt de l'activité est donc celui du foyer entier. Un surcroît calculé
  // au prorata du revenu en rendrait moins.
  it('compte tout l’impôt du foyer comme surcroît de l’activité, la décote effaçant celui du salaire', () => {
    const ir = valeurPubliee(provisionIrDe(jeu, le(2026, 12, 15)));
    expect(ir.impotFoyer).toBeGreaterThan(0);
    expect(ir.impotMicro).toBe(ir.impotFoyer);
  });
});

describe('l’ACRE qui s’éteint', () => {
  // Un mois d'ACRE de trop divise par deux les cotisations provisionnées de ce
  // mois : l'erreur va dans le sens dangereux, celle qui fait se verser de
  // l'argent dû.
  it('double le taux de cotisations le mois qui suit sa fin', () => {
    const mars = valeurPubliee(tauxCotisationsAu(jeu, mois('2026-03')));
    const avril = valeurPubliee(tauxCotisationsAu(jeu, mois('2026-04')));
    expect(mars).toBeCloseTo(0.128, 6);
    expect(avril).toBeCloseTo(0.256, 6);
  });

  it('applique la moitié du taux de 2025 dès le début d’activité', () => {
    expect(valeurPubliee(tauxCotisationsAu(jeu, mois('2025-04')))).toBeCloseTo(0.123, 6);
    expect(sousAcreLe(jeu)(mois('2025-03'))).toBe(false);
  });

  // Le taux ne se lit pas qu'au sélecteur : il doit peser sur ce qui est
  // provisionné. Un même encaissement de 1 000 € coûte moitié moins en mars
  // qu'en avril.
  it('pèse sur les cotisations provisionnées : mille euros encaissés coûtent deux fois plus en avril', () => {
    const vierge: Faits = {
      ...jeu, recettes: [], depenses: [], echeances: [], mouvementsBancaires: [],
      periodesDeclarees: [], soldeInitial: euros(0), soldeInitialAu: null
    };
    const avecEncaissement = (jour: string): Faits => ({
      ...vierge,
      recettes: [{
        id: 'rec-essai', clientNom: 'Agence Démo Conseil', libelle: 'Essai', montant: euros(1000),
        emiseLe: dateISO(jour), encaisseeLe: dateISO(jour), modeReglement: 'virement',
        numero: '2026-001', tvaCollectee: euros(0)
      }]
    });
    const urssaf = (jour: string, m: Date): number =>
      etatPilote(avecEncaissement(jour), [], m).provisionsParNature.urssaf;
    expect(urssaf('2026-04-10', le(2026, 4, 20))).toBeCloseTo(2 * urssaf('2026-03-10', le(2026, 3, 20)), 2);
    expect(urssaf('2026-03-10', le(2026, 3, 20))).toBeGreaterThan(0);
  });
});

describe('la mission via agence', () => {
  // Le CRA est remis au client final, qui le signe : celui de l'agence
  // exposerait à l'un ce qui appartient à l'autre.
  it('rend le CRA au nom du client final, pas à celui de l’agence', () => {
    const cras = craDuMoisParMission(jeu, mois('2026-12'));
    const final = cras.find((c) => c.clientNom === 'Client Final Démo');
    expect(final).toBeDefined();
    expect(cras.some((c) => c.clientNom === 'Agence Démo Conseil')).toBe(false);
    expect(final?.cra.totalJours).toBeGreaterThan(0);
  });

  it('ne travaille ni les jours de congé posés autour du 31 décembre, ni le 25', () => {
    const dates = journeesDuMois(jeu, mois('2026-12')).map((j) => j.date as string);
    for (const ferie of ['2026-12-25', '2026-12-28', '2026-12-29', '2026-12-31']) {
      expect(dates, ferie).not.toContain(ferie);
    }
    expect(dates).toContain('2026-12-30');
  });

  it('porte le lieu des journées qui en ont un, et null pour les autres', () => {
    const lieux = new Map(journeesDuMois(jeu, mois('2026-12')).map((j) => [j.date as string, j.lieu]));
    expect(lieux.get('2026-12-07')).toBe('teletravail');
    expect(lieux.get('2026-12-08')).toBe('sur_site');
    expect(lieux.get('2026-12-10')).toBeNull();
  });

  // Le TJM change au 1er janvier : une journée de décembre ne doit pas être
  // valorisée au tarif de janvier, ni l'inverse.
  it('valorise chaque journée au tarif de sa date, de part et d’autre du 31 décembre', () => {
    const final = (m: string) => craDuMoisParMission(jeu, mois(m)).find((c) => c.clientNom === 'Client Final Démo');
    const decembre = final('2026-12');
    const janvier = final('2027-01');
    expect(decembre?.cra.montant).toBeCloseTo((decembre?.cra.totalJours ?? 0) * 480, 2);
    expect(janvier?.cra.montant).toBeCloseTo((janvier?.cra.totalJours ?? 0) * 500, 2);
  });
});

describe('le flux du mois à la date de référence', () => {
  it('range l’avoir en moins dans l’encaissé de novembre', () => {
    const faits = faitsAu(jeu, le(2026, 11, 30));
    const e = etatPilote(faits, faits.echeances, le(2026, 11, 30));
    const flux = fluxDuMois(faits, mois('2026-11'), e);
    // Facture d'octobre (7 200) moins l'avoir (1 500).
    expect(flux.entrees.encaisse).toBe(5700);
    expect(flux.entrees.lignes.some((l) => l.montant === -1500)).toBe(true);
  });

  it('attend la CFE du 15 décembre, que rien n’a encore payée', () => {
    const e = etatPilote(jeu, jeu.echeances, le(2026, 12, 15));
    const flux = fluxDuMois(jeu, mois('2026-12'), e);
    const cfe = flux.sorties.lignes.find((l) => l.libelle === 'CFE');
    expect(cfe).toMatchObject({ montant: 214, regle: false });
  });
});
