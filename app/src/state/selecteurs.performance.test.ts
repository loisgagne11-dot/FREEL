import { describe, expect, it } from 'vitest';
import { type DateISO, type Mois, dateISO, euros, mois } from '../domain/types';
import { type Faits, type Mission, type Recette, entiteVide, faitsVides } from './schema';
import {
  capaciteParMois, compositionDuMois, resteAEncaisserDuMois, resultatProjete
} from './selecteurs.performance';

function faits(modifications: Partial<Faits> = {}): Faits {
  return { ...faitsVides(), ...modifications };
}

/**
 * Une entreprise dont l'ACRE s'éteint au 1er juillet 2026.
 *
 * Début d'activité en juillet 2025, ACRE de quatre trimestres : les mois de
 * janvier à juin 2026 sont à demi-taux (12,8 % en BNC), ceux de juillet à
 * décembre au taux plein (25,6 %).
 */
function entrepriseSousAcre(): Faits['entreprise'] {
  return {
    ...faitsVides().entreprise,
    typeActivite: 'BNC',
    acre: true,
    debutActivite: dateISO('2025-07-01')
  };
}

let compteur = 0;
function recette(o: Partial<Recette> = {}): Recette {
  compteur += 1;
  return {
    id: `r${compteur}`,
    clientNom: 'Client d’essai',
    libelle: 'Prestation',
    montant: euros(10_000),
    emiseLe: dateISO('2026-03-31'),
    encaisseeLe: null,
    modeReglement: null,
    numero: `2026-${String(compteur).padStart(3, '0')}`,
    ...o
  };
}

function mission(o: Partial<Mission> = {}): Mission {
  return {
    id: 'm1',
    clientId: null,
    clientNom: 'Client d’essai',
    description: 'Mission d’essai',
    tjm: euros(600),
    debut: null,
    fin: null,
    statut: 'active',
    entites: [{ ...entiteVide(), id: 'm1-co1', nom: 'Client d’essai' }],
    ...o
  };
}

/** Une mission qui travaille tous les jours ouvrés du mois indiqué. */
function missionAuRythmePlein(
  id: string, du: DateISO, au: DateISO, o: Partial<Mission> = {}
): Mission {
  return mission({
    id,
    entites: [{
      ...entiteVide(),
      id: `${id}-co1`,
      nom: 'Client d’essai',
      rythmes: [{
        du, au,
        parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 1 },
        tjm: null
      }]
    }],
    ...o
  });
}

const LE_15_DECEMBRE = new Date('2026-12-15T10:00:00Z');

/* ─────────────────────────────────────────────────────────────────────────
   Résultat projeté
   ───────────────────────────────────────────────────────────────────────── */

/**
 * LES COTISATIONS SE SOMMENT MOIS PAR MOIS, AU TAUX DE CHAQUE MOIS.
 *
 * Si cette règle sautait au profit d'un taux annuel unique, une année où
 * l'ACRE s'éteint en juillet serait calculée soit entièrement à 12,8 %, soit
 * entièrement à 25,6 % : 1 280 € d'écart sur 20 000 € de recettes, c'est-à-dire
 * un résultat projeté faux de 8 %, et faux dans le sens qui rassure si le
 * demi-taux l'emporte.
 */
describe('résultat projeté : cotisations mois par mois', () => {
  const deuxEncaissements = faits({
    entreprise: entrepriseSousAcre(),
    recettes: [
      recette({ encaisseeLe: dateISO('2026-03-20'), emiseLe: dateISO('2026-02-28') }),
      recette({ encaisseeLe: dateISO('2026-10-20'), emiseLe: dateISO('2026-09-30') })
    ]
  });

  it('applique le demi-taux ACRE au premier semestre et le taux plein au second', () => {
    const r = resultatProjete(deuxEncaissements, LE_15_DECEMBRE);
    expect(r).not.toBeNull();
    // 10 000 × 12,8 % + 10 000 × 25,6 %. Un taux unique aurait donné 2 560 €
    // (tout sous ACRE) ou 5 120 € (tout hors ACRE) : jamais 3 840 €.
    expect(r?.cotisations).toBe(3840);
    expect(r?.caProjete).toBe(20_000);
  });

  /**
   * SOUS BARÈME, AUCUN IMPÔT SUR LE REVENU N'EST DÉDUIT.
   *
   * `tauxImpotEtContributions` ne rend alors que la CFP à 0,2 % et ne refuse
   * jamais : la tuile pourrait afficher « après cotisations et impôt » sans
   * qu'aucun garde-fou ne se déclenche. Si cette réserve disparaissait, le
   * chiffre serait lu comme un net d'impôt alors qu'il ignore l'IR entier.
   */
  it('ne retient que la CFP sous barème, et le dit', () => {
    const r = resultatProjete(deuxEncaissements, LE_15_DECEMBRE);
    expect(r?.impotEtContributions).toBe(40); // 20 000 × 0,2 %
    expect(r?.reserves).toContain('avant_impot_sur_le_revenu');
    expect(r?.resultat).toBe(20_000 - 3840 - 40);
  });

  it('ajoute le versement libératoire quand l’option est prise, sans réserve d’IR', () => {
    const vl = faits({
      entreprise: { ...entrepriseSousAcre(), versementLiberatoire: true },
      recettes: deuxEncaissements.recettes
    });
    const r = resultatProjete(vl, LE_15_DECEMBRE);
    // CFP 0,2 % + versement libératoire 2,2 % = 2,4 % de 20 000 €.
    expect(r?.impotEtContributions).toBe(480);
    expect(r?.reserves).not.toContain('avant_impot_sur_le_revenu');
  });

  /**
   * L'ABATTEMENT DE 34 % N'INTERVIENT PAS, ET LA TUILE DOIT POUVOIR LE DIRE.
   *
   * Il ne rend aucun euro au compte : il ne sert qu'à calculer un revenu
   * imposable. Appliqué ici, il gonflerait le résultat de 6 800 € sur 20 000 €
   * de recettes — de l'argent qui n'existe pas.
   */
  it('porte la réserve sur l’abattement, toujours', () => {
    expect(resultatProjete(deuxEncaissements, LE_15_DECEMBRE)?.reserves)
      .toContain('abattement_non_applique');
  });
});

/**
 * L'ASSIETTE EST LE PIPELINE, PAS UNE RÈGLE DE TROIS SUR LE RYTHME ÉCOULÉ.
 *
 * `projectionAnnuelle` de `allure.ts` diviserait l'encaissé par la part de
 * l'année écoulée : au 15 février, 10 000 € encaissés deviendraient 78 000 € de
 * chiffre d'affaires annuel. Si cette règle sautait, la tuile afficherait un
 * résultat huit fois trop élevé au premier trimestre de chaque année.
 */
describe('résultat projeté : l’assiette', () => {
  it('n’extrapole pas le rythme écoulé', () => {
    const f = faits({
      entreprise: entrepriseSousAcre(),
      recettes: [recette({
        emiseLe: dateISO('2026-01-05'), encaisseeLe: dateISO('2026-01-20')
      })]
    });
    const r = resultatProjete(f, new Date('2026-02-15T10:00:00Z'));
    expect(r?.caDejaEncaisse).toBe(10_000);
    expect(r?.caAttendu).toBe(0);
    expect(r?.caProjete).toBe(10_000);
  });

  it('compte les factures émises non réglées, une seule fois', () => {
    const f = faits({
      entreprise: entrepriseSousAcre(),
      recettes: [
        recette({ emiseLe: dateISO('2026-01-05'), encaisseeLe: dateISO('2026-01-20') }),
        // Émise le 30 juin, échéance à trente jours : attendue en juillet.
        recette({ montant: euros(4000), emiseLe: dateISO('2026-06-30'), encaisseeLe: null })
      ]
    });
    const r = resultatProjete(f, new Date('2026-06-15T10:00:00Z'));
    expect(r?.caDejaEncaisse).toBe(10_000);
    expect(r?.caAttendu).toBe(4000);
    expect(r?.caProjete).toBe(14_000);
  });

  /**
   * QUAND LE BARÈME SE DÉROBE, LA TUILE DISPARAÎT.
   *
   * Trois chiffres justes valent mieux que quatre dont un engage à faux : sans
   * barème, les cotisations vaudraient zéro et le résultat serait surestimé
   * d'un quart — exactement le chiffre sur lequel on décide d'un virement.
   */
  it('rend null quand un taux du barème ne couvre pas la période', () => {
    const f = faits({
      recettes: [recette({
        emiseLe: dateISO('2023-05-02'), encaisseeLe: dateISO('2023-05-20')
      })]
    });
    expect(resultatProjete(f, new Date('2023-06-15T10:00:00Z'))).toBeNull();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Capacité de versement
   ───────────────────────────────────────────────────────────────────────── */

describe('capacité de versement par mois', () => {
  const f = faits({
    entreprise: entrepriseSousAcre(),
    recettes: [
      recette({ encaisseeLe: dateISO('2026-03-20'), emiseLe: dateISO('2026-02-28') }),
      recette({ encaisseeLe: dateISO('2026-10-20'), emiseLe: dateISO('2026-09-30') })
    ],
    mouvementsBancaires: [{
      id: 'mv1', date: dateISO('2026-03-25'), libelle: 'Virement perso',
      montant: euros(-2500), sansContrepartie: 'remuneration', rapprocheAvec: null
    }]
  });
  const parMois = capaciteParMois(f, LE_15_DECEMBRE);
  const capacite = (n: number) => parMois[n - 1];

  /**
   * L'ACRE S'ÉTEINT EN COURS D'ANNÉE, ET LA BARRE DE MARS N'EST PAS CELLE
   * D'OCTOBRE.
   *
   * Un taux unique aurait donné deux barres identiques pour deux mois qui ne
   * coûtent pas la même chose — et si c'est le demi-taux qui l'emporte, la
   * barre d'octobre inviterait à se verser 1 280 € de trop.
   */
  it('applique à chaque mois le taux de ce mois-là', () => {
    const mars = capacite(3);
    const octobre = capacite(10);
    expect(mars?.statut).toBe('publie');
    expect(octobre?.statut).toBe('publie');
    if (mars?.statut === 'refuse' || octobre?.statut === 'refuse') return;
    // CFP comprise : 12,8 % + 0,2 % contre 25,6 % + 0,2 %.
    expect(mars?.valeur.charges).toBe(1300);
    expect(octobre?.valeur.charges).toBe(2580);
  });

  it('porte le versé constaté d’un mois passé', () => {
    const mars = capacite(3);
    if (mars === undefined || mars.statut === 'refuse') return;
    expect(mars.valeur.nature).toBe('constate');
    expect(mars.valeur.verse).toBe(2500);
  });

  /**
   * UN MOIS À VENIR N'A AUCUN VERSÉ.
   *
   * Le hachuré ne dit rien d'autre. Si cette règle sautait, l'écran
   * dessinerait un plein dans une barre projetée.
   */
  it('ne fabrique aucun versé sur un mois à venir', () => {
    const parMoisEnJuin = capaciteParMois(f, new Date('2026-06-15T10:00:00Z'));
    const octobre = parMoisEnJuin[9];
    if (octobre === undefined || octobre.statut === 'refuse') return;
    expect(octobre.valeur.nature).toBe('projete');
    expect(octobre.valeur.verse).toBeNull();
  });

  it('s’abstient sur un mois dont le barème ne couvre pas la période', () => {
    const ancien = faits({ recettes: [recette({ encaisseeLe: dateISO('2023-05-20') })] });
    const parMois2023 = capaciteParMois(ancien, new Date('2023-06-15T10:00:00Z'));
    expect(parMois2023[4]?.statut).toBe('refuse');
    // Le mois reste dans la liste : le retirer décalerait les onze autres.
    expect(parMois2023).toHaveLength(12);
  });

  it('rend une capacité nulle sur un mois sans encaissement ni dépense', () => {
    const fevrier = capacite(2);
    if (fevrier === undefined || fevrier.statut === 'refuse') return;
    expect(fevrier.valeur.encaisse).toBe(0);
    expect(fevrier.valeur.capacite).toBe(0);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Le reste à encaisser d'un mois
   ───────────────────────────────────────────────────────────────────────── */

/**
 * LE RESTE À ENCAISSER D'UN MOIS SE COMPTE FACTURE PAR FACTURE.
 *
 * Le prototype fait « réalisé du mois − encaissé du mois ». Sur un juin qui
 * émet 8 000 € et encaisse 12 000 € venus d'avril, cette soustraction rend
 * −4 000 €, donc zéro une fois bornée : l'écran affiche « tout est rentré »
 * alors que 8 000 € sont dus. C'est exactement le montant qu'il faut relancer.
 */
describe('reste à encaisser d’un mois', () => {
  const juin = faits({
    recettes: [
      recette({ montant: euros(8000), emiseLe: dateISO('2026-06-10'), encaisseeLe: null }),
      recette({
        montant: euros(12_000),
        emiseLe: dateISO('2026-04-05'),
        encaisseeLe: dateISO('2026-06-20')
      })
    ]
  });

  it('ne soustrait pas deux agrégats mensuels', () => {
    const r = resteAEncaisserDuMois(juin, mois('2026-06'), LE_15_DECEMBRE);
    expect(r.resteAEncaisser).toBe(8000);
    expect(r.encaisse).toBe(12_000);
    // La soustraction du prototype aurait rendu 0.
    expect(r.resteAEncaisser).not.toBe(0);
  });

  it('range l’encaissé selon le mois qui l’a émis', () => {
    const r = resteAEncaisserDuMois(juin, mois('2026-06'), LE_15_DECEMBRE);
    expect(r.encaisseDuMois).toBe(0);
    expect(r.encaisseDeMoisAnterieurs).toBe(12_000);
    expect(r.encaisseDAvance).toBe(0);
  });

  /**
   * « ENCAISSÉ D'AVANCE » SE LIT SUR LA PIÈCE, PAS SUR UN SIGNE NÉGATIF.
   *
   * Une facture établie après son règlement est un acompte. La reconnaître par
   * une soustraction négative confondrait ce cas avec le précédent — un mois
   * qui encaisse des factures anciennes — qui n'a rien d'une avance.
   */
  it('reconnaît un acompte encaissé avant toute émission', () => {
    const f = faits({
      recettes: [
        recette({ montant: euros(3000), emiseLe: null, encaisseeLe: dateISO('2026-06-02') }),
        recette({
          montant: euros(5000),
          emiseLe: dateISO('2026-06-28'),
          encaisseeLe: dateISO('2026-06-12')
        })
      ]
    });
    const r = resteAEncaisserDuMois(f, mois('2026-06'), LE_15_DECEMBRE);
    expect(r.encaisseDAvance).toBe(8000);
    expect(r.encaisseDuMois).toBe(0);
  });

  it('les trois origines somment exactement à l’encaissé du mois', () => {
    const r = resteAEncaisserDuMois(juin, mois('2026-06'), LE_15_DECEMBRE);
    expect(r.encaisseDuMois + r.encaisseDeMoisAnterieurs + r.encaisseDAvance)
      .toBe(r.encaisse);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   La composition d'un mois
   ───────────────────────────────────────────────────────────────────────── */

describe('composition d’un mois', () => {
  /**
   * UN MONTANT SEUL NE SE CONTESTE PAS ; « 22 j × 600 € » SE CONTESTE.
   *
   * C'est ce qui permet de trouver la journée oubliée. Si les jours et le tarif
   * disparaissaient de la ligne, le panneau redeviendrait un total qu'on ne
   * peut que croire.
   */
  it('ventile le réalisé par mission, avec les jours et le tarif', () => {
    const f = faits({
      missions: [missionAuRythmePlein('m1', dateISO('2026-06-01'), dateISO('2026-06-30'))],
      recettes: [recette({ montant: euros(9000), emiseLe: dateISO('2026-06-30') })]
    });
    const c = compositionDuMois(f, mois('2026-06'), LE_15_DECEMBRE);
    const ligne = c.realiseParMission[0];

    expect(c.realiseFacture).toBe(9000);
    expect(ligne?.missionIds).toEqual(['m1']);
    expect(ligne?.tjm).toBe(600);
    // Juin 2026 : 22 jours ouvrés, aucun férié en semaine.
    expect(ligne?.jours).toBe(22);
    expect(ligne?.produitAuPlanning).toBe(13_200);
    expect(ligne?.indetermine).toBe(false);
  });

  /**
   * L'EN-COURS NON FACTURÉ NE SE FOND JAMAIS DANS LE RÉALISÉ.
   *
   * Le dessin range des missions « En cours » sous un titre « Réalisé ·
   * facturé ». Les additionner mélangerait du chiffre d'affaires et une
   * intention : tant qu'aucune facture n'est partie, rien n'entre au livre des
   * recettes et l'URSSAF ne réclame rien. Ici le travail vaut 13 200 € et la
   * facture 9 000 € — le réalisé reste 9 000 €.
   */
  it('garde le travail au planning sur sa propre ligne', () => {
    const f = faits({
      missions: [missionAuRythmePlein('m1', dateISO('2026-06-01'), dateISO('2026-06-30'))],
      recettes: [recette({ montant: euros(9000), emiseLe: dateISO('2026-06-30') })]
    });
    const c = compositionDuMois(f, mois('2026-06'), LE_15_DECEMBRE);
    expect(c.realiseFacture).toBe(9000);
    expect(c.travailAuPlanning).toBe(13_200);
  });

  it('montre une mission qui a travaillé sans rien facturer', () => {
    const f = faits({
      missions: [missionAuRythmePlein('m1', dateISO('2026-06-01'), dateISO('2026-06-30'))]
    });
    const c = compositionDuMois(f, mois('2026-06'), LE_15_DECEMBRE);
    expect(c.realiseFacture).toBe(0);
    expect(c.realiseParMission).toHaveLength(1);
    expect(c.realiseParMission[0]?.facture).toBe(0);
    expect(c.realiseParMission[0]?.jours).toBe(22);
  });

  /**
   * DEUX MISSIONS SIMULTANÉES D'UN MÊME CLIENT NE SE DÉPARTAGENT PAS.
   *
   * `Recette` ne porte pas de `missionId` : rien ne dit laquelle des deux a
   * produit la facture. Attribuer au hasard afficherait « 0 € » en face d'une
   * mission qui facture ; donner le montant aux deux ferait un total supérieur
   * au réalisé du mois. La ligne les nomme toutes les deux et le dit.
   */
  it('dit ce qu’elle ne peut pas départager', () => {
    const f = faits({
      missions: [
        mission({
          id: 'm1', description: 'Refonte',
          debut: dateISO('2026-01-01'), fin: dateISO('2026-12-31')
        }),
        mission({
          id: 'm2', description: 'Astreinte',
          debut: dateISO('2026-01-01'), fin: dateISO('2026-12-31')
        })
      ],
      recettes: [recette({ montant: euros(9000), emiseLe: dateISO('2026-06-30') })]
    });
    const c = compositionDuMois(f, mois('2026-06'), LE_15_DECEMBRE);

    expect(c.realiseParMission).toHaveLength(1);
    expect(c.realiseParMission[0]?.missionIds).toEqual(['m1', 'm2']);
    expect(c.realiseParMission[0]?.indetermine).toBe(true);
    // La somme des lignes reste exactement le réalisé du mois.
    expect(c.realiseParMission.reduce((s, l) => s + l.facture, 0)).toBe(c.realiseFacture);
  });

  // Deux missions SUCCESSIVES du même client, elles, se séparent par les dates.
  it('sépare deux missions successives d’un même client', () => {
    const f = faits({
      missions: [
        mission({
          id: 'm1', description: 'Phase 1',
          debut: dateISO('2026-01-01'), fin: dateISO('2026-05-31')
        }),
        mission({
          id: 'm2', description: 'Phase 2',
          debut: dateISO('2026-06-01'), fin: dateISO('2026-12-31')
        })
      ],
      recettes: [recette({ montant: euros(9000), emiseLe: dateISO('2026-06-30') })]
    });
    const c = compositionDuMois(f, mois('2026-06'), LE_15_DECEMBRE);
    expect(c.realiseParMission[0]?.missionIds).toEqual(['m2']);
    expect(c.realiseParMission[0]?.indetermine).toBe(false);
  });

  it('ventile l’encaissé par facture, avec son numéro et son client', () => {
    const f = faits({
      recettes: [recette({
        montant: euros(12_000),
        clientNom: 'Client d’essai',
        emiseLe: dateISO('2026-04-05'),
        encaisseeLe: dateISO('2026-06-20')
      })]
    });
    const c = compositionDuMois(f, mois('2026-06'), LE_15_DECEMBRE);
    const ligne = c.encaisseParFacture[0];

    expect(c.encaisse).toBe(12_000);
    expect(ligne?.numero).toMatch(/^2026-/);
    expect(ligne?.clientNom).toBe('Client d’essai');
    expect(ligne?.encaisseeLe).toBe('2026-06-20');
    // Le mois d'émission permet de dire « venu d'avril » sans refaire le
    // rattachement dans l'écran.
    expect(ligne?.emiseAu).toBe('2026-04' as Mois);
  });

  it('rattache le reste à encaisser du mois', () => {
    const f = faits({
      recettes: [recette({ montant: euros(8000), emiseLe: dateISO('2026-06-10') })]
    });
    const c = compositionDuMois(f, mois('2026-06'), LE_15_DECEMBRE);
    expect(c.aEncaisser.resteAEncaisser).toBe(8000);
  });
});
