import { describe, expect, it } from 'vitest';
import { formuler } from './aTraiter.libelles';
import { dateISO, euros, mois } from '../types';
import { PERIODES_URSSAF } from '../bareme/urssaf';
import {
  type EntreeATraiter, type PeriodeATraiter, type RecetteVue,
  compteursParEcran, sujetsATraiter, sujetsDeLEcran
} from './aTraiter';

const AUJOURDHUI = dateISO('2026-07-28');

function entree(modifications: Partial<EntreeATraiter> = {}): EntreeATraiter {
  return {
    aujourdhui: AUJOURDHUI,
    typeActivite: 'BNC',
    recettes: [],
    echeancesReglementaires: [],
    periodesUrssaf: PERIODES_URSSAF,
    ...modifications
  };
}

function recette(m: Partial<RecetteVue> = {}): RecetteVue {
  return {
    id: 'r', montant: euros(1000), emiseLe: dateISO('2026-07-01'),
    encaisseeLe: null, modeReglement: 'virement', clientNom: 'C',
    /* L'échéance est la date IMPRIMÉE sur la facture, plus une dérivée du
       délai du client : c'est elle que `sujetsATraiter` lit. */
    echeanceLe: dateISO('2026-07-31'),
    ...m
  };
}

const idsDe = (e: EntreeATraiter) => sujetsATraiter(e).map((s) => s.id);

describe('rien n\'est inventé', () => {
  // Le prototype affichait six sujets écrits en dur. Sur des faits vides, la
  // liste doit être vide : pas de compteur décoratif.
  it('sur des faits vides, aucun sujet', () => {
    expect(sujetsATraiter(entree())).toEqual([]);
  });

  it('une facture encaissée et complète ne produit aucun sujet', () => {
    const e = entree({
      recettes: [recette({ encaisseeLe: dateISO('2026-07-10'), modeReglement: 'virement' })]
    });
    expect(idsDe(e)).not.toContain('factures-en-retard');
    expect(idsDe(e)).not.toContain('livre-recettes-incomplet');
  });
});

describe('factures en retard', () => {
  it('signale une facture dont le délai de paiement est dépassé', () => {
    const e = entree({
      recettes: [recette({ emiseLe: dateISO('2026-05-01'), echeanceLe: dateISO('2026-05-31') })]
    });
    const s = sujetsATraiter(e).find((x) => x.id === 'factures-en-retard');
    expect(s).toBeDefined();
    expect(s?.gravite).toBe('retard');
    // Factures, l'écran de la liste où l'on relance (lot 51) — et non plus
    // Activité, qui l'accueillait en onglet : le compteur du rail s'allumerait
    // sur une entrée où la facture n'est plus.
    expect(s?.ecran).toBe('factures');
  });

  // La borne : une facture dont l'échéance est aujourd'hui n'est pas en retard.
  it('ne signale pas une facture encore dans son délai', () => {
    const e = entree({
      recettes: [recette({ emiseLe: dateISO('2026-07-20'), echeanceLe: dateISO('2026-08-31') })]
    });
    expect(idsDe(e)).not.toContain('factures-en-retard');
  });

  it('ne signale jamais une facture déjà encaissée', () => {
    const e = entree({
      recettes: [recette({
        emiseLe: dateISO('2026-01-01'), echeanceLe: dateISO('2026-07-31'),
        encaisseeLe: dateISO('2026-02-01')
      })]
    });
    expect(idsDe(e)).not.toContain('factures-en-retard');
  });

  it('compte les factures et cumule leur montant', () => {
    const e = entree({
      recettes: [
        recette({
          id: 'a', montant: euros(1000),
          emiseLe: dateISO('2026-05-01'), echeanceLe: dateISO('2026-05-31')
        }),
        recette({
          id: 'b', montant: euros(2000),
          emiseLe: dateISO('2026-05-01'), echeanceLe: dateISO('2026-05-31')
        })
      ]
    });
    const s = sujetsATraiter(e).find((x) => x.id === 'factures-en-retard');
    expect(s?.nombre).toBe(2);
    expect(s === undefined ? '' : formuler(s).contexte).toMatch(/3\s000 €/u);
  });
});

/**
 * Les périodes à déclarer arrivent des obligations (`selecteurs.obligations`),
 * qui en tiennent la règle — close, non déclarée, en retard passé la limite
 * reportée ; ces règles sont éprouvées dans `selecteurs.obligations.test`.
 * Ici, ce que la requête en fait : UN sujet sur le Pilote, qui pèse au
 * compteur autant que de périodes.
 */
describe('périodes à déclarer', () => {
  const periode = (m: Partial<PeriodeATraiter> = {}): PeriodeATraiter => ({
    id: '2026-06', libelle: 'juin 2026', premierMois: mois('2026-06'), limite: dateISO('2026-07-31'),
    encaisse: euros(1000), montant: null, enRetard: false, ...m
  });

  it('réunit les périodes en un sujet sous Obligations, qui pèse leur nombre au compteur', () => {
    const e = entree({
      periodesADeclarer: [periode({ id: '2026-05', libelle: 'mai 2026', premierMois: mois('2026-05') }), periode()]
    });
    const s = sujetsATraiter(e).find((x) => x.id === 'periodes-a-declarer');
    // Obligations : c'est là que vivent les périodes URSSAF (lot 51).
    expect(s?.ecran).toBe('obligations');
    expect(s?.nombre).toBe(2);
    // Deux périodes sont deux choses à faire : le rail et le titre
    // d'Obligations le disent, même quand le Pilote les dit en une ligne.
    expect(compteursParEcran(sujetsATraiter(e)).obligations).toBe(2);
    // La prose est destinée à l'utilisateur : « mai 2026 », pas « 2026-05 ».
    const f = s === undefined ? null : formuler(s);
    expect(`${f?.intitule} ${f?.contexte}`).toContain('mai 2026');
  });

  it('dit « à faire, avant le … » tant qu’aucune n’est en retard', () => {
    const s = sujetsATraiter(entree({ periodesADeclarer: [periode()] }))
      .find((x) => x.id === 'periodes-a-declarer');
    expect(s?.gravite).toBe('a_faire');
    expect(s === undefined ? '' : formuler(s).intitule).toMatch(/avant le 31 juillet/);
  });

  it('passe en retard dès qu’une période l’est', () => {
    const s = sujetsATraiter(entree({
      periodesADeclarer: [periode({ enRetard: true }), periode({ id: '2026-07' })]
    })).find((x) => x.id === 'periodes-a-declarer');
    expect(s?.gravite).toBe('retard');
    expect(s === undefined ? '' : formuler(s).intitule).toMatch(/périodes à déclarer/);
  });

  /* Le report produit souvent un premier du mois (une fin de mois tombée un
     dimanche) : « avant le 1 juin » se lisait comme une coquille. */
  it('écrit le premier du mois en ordinal', () => {
    const s = sujetsATraiter(entree({ periodesADeclarer: [periode({ limite: dateISO('2026-06-01') })] }))
      .find((x) => x.id === 'periodes-a-declarer');
    expect(s === undefined ? '' : formuler(s).intitule).toMatch(/avant le 1ᵉʳ juin/);
  });

  it('annonce la base encaissée et le montant à payer, ou « à vérifier »', () => {
    const avec = sujetsATraiter(entree({ periodesADeclarer: [periode({ montant: euros(412) })] }))
      .find((x) => x.id === 'periodes-a-declarer');
    const sans = sujetsATraiter(entree({ periodesADeclarer: [periode()] }))
      .find((x) => x.id === 'periodes-a-declarer');
    if (avec === undefined || sans === undefined) throw new Error('sujets attendus');
    expect(formuler(avec).contexte).toMatch(/à payer 412 €/);
    expect(formuler(sans).contexte).toMatch(/à payer à vérifier/);
  });

  it('ne dit rien quand aucune période n’est à déclarer', () => {
    expect(idsDe(entree({ periodesADeclarer: [] }))).not.toContain('periodes-a-declarer');
  });
});

describe('seuil majoré de TVA', () => {
  const gros = (montant: number) => entree({
    recettes: [recette({ encaisseeLe: dateISO('2026-03-01'), montant: euros(montant) })],
  });

  it('reste silencieux loin du seuil', () => {
    expect(idsDe(gros(10000))).not.toContain('seuil-tva');
  });

  // 80 % de 41 250 = 33 000 : on prévient assez tôt pour qu'il reste de la
  // marge d'action.
  it('prévient à l\'approche du seuil, avec le reste facturable', () => {
    const s = sujetsATraiter(gros(35000)).find((x) => x.id === 'seuil-tva');
    expect(s).toBeDefined();
    expect(s?.gravite).toBe('a_faire');
    expect(s === undefined ? '' : formuler(s).intitule).toMatch(/proche/i);
    expect(s === undefined ? '' : formuler(s).contexte).toMatch(/6\s250 €/u);
  });

  it('passe en retard une fois le seuil franchi, et explique le coût', () => {
    const s = sujetsATraiter(gros(45000)).find((x) => x.id === 'seuil-tva');
    expect(s?.gravite).toBe('retard');
    expect(s === undefined ? '' : formuler(s).intitule).toMatch(/franchi/i);
    expect(s === undefined ? '' : formuler(s).contexte).toMatch(/TTC/);
  });
});

describe('plafond du régime micro', () => {
  it('reste silencieux loin du plafond', () => {
    const e = entree({
      recettes: [recette({ encaisseeLe: dateISO('2026-03-01'), montant: euros(20000) })],
    });
    expect(idsDe(e)).not.toContain('plafond-micro');
  });

  it('prévient à l\'approche, et signale le dépassement', () => {
    const proche = entree({
      recettes: [recette({ encaisseeLe: dateISO('2026-03-01'), montant: euros(75000) })],
    });
    const depasse = entree({
      recettes: [recette({ encaisseeLe: dateISO('2026-03-01'), montant: euros(90000) })],
    });
    expect(sujetsATraiter(proche).find((x) => x.id === 'plafond-micro')?.gravite).toBe('a_faire');
    expect(sujetsATraiter(depasse).find((x) => x.id === 'plafond-micro')?.gravite).toBe('retard');
  });
});

describe('livre des recettes', () => {
  it('signale une recette encaissée sans mode de règlement', () => {
    const e = entree({
      recettes: [recette({ encaisseeLe: dateISO('2026-06-10'), modeReglement: null })],
    });
    const s = sujetsATraiter(e).find((x) => x.id === 'livre-recettes-incomplet');
    expect(s).toBeDefined();
    expect(s === undefined ? '' : formuler(s).contexte).toMatch(/obligatoire/);
  });

  it('ne signale rien pour une recette non encore encaissée', () => {
    const e = entree({ recettes: [recette({ encaisseeLe: null, modeReglement: null })] });
    expect(idsDe(e)).not.toContain('livre-recettes-incomplet');
  });
});

describe('échéances réglementaires', () => {
  const avecEcheance = (date: string) => entree({
    echeancesReglementaires: [{ id: 'fe', intitule: 'Facturation électronique', date: dateISO(date) }]
  });

  it('passe en « à faire » à moins de 30 jours', () => {
    const s = sujetsATraiter(avecEcheance('2026-08-15')).find((x) => x.id === 'echeance-fe');
    expect(s?.gravite).toBe('a_faire');
  });

  it('reste informatif au-delà de 30 jours', () => {
    const s = sujetsATraiter(avecEcheance('2026-12-01')).find((x) => x.id === 'echeance-fe');
    expect(s?.gravite).toBe('information');
  });

  // Une échéance qui se RÈGLE (la CFE : saisir l'échéance) : dépassée sans
  // l'être, elle est bien en retard.
  it('passe en retard une fois dépassée, sans disparaître', () => {
    const s = sujetsATraiter(avecEcheance('2026-06-01')).find((x) => x.id === 'echeance-fe');
    expect(s?.gravite).toBe('retard');
    expect(s === undefined ? '' : formuler(s).contexte).toMatch(/dépassée/);
  });

  /**
   * UNE OBLIGATION QUE RIEN NE PERMET DE COCHER N'EST PAS « EN RETARD ».
   *
   * La facturation électronique s'affichait en rouge sur le Pilote de tout le
   * monde depuis le 1er septembre 2026, prêt ou non, et rien ne l'effaçait.
   */
  it('dit « en vigueur », à faire, une obligation sans suivi dont la date est passée', () => {
    const s = sujetsATraiter(entree({
      echeancesReglementaires: [{
        id: 'fe', intitule: 'Facturation électronique', date: dateISO('2026-06-01'), sansSuivi: true
      }]
    })).find((x) => x.id === 'echeance-fe');
    expect(s?.gravite).toBe('a_faire');
    expect(s === undefined ? '' : formuler(s).contexte).toMatch(/En vigueur depuis/);
  });
});

describe('ordre, compteurs et filtrage', () => {
  const chargee = entree({
    recettes: [
      recette({ id: 'retard', emiseLe: dateISO('2026-05-01'), echeanceLe: dateISO('2026-05-31') }),
      recette({ id: 'ok', encaisseeLe: dateISO('2026-06-10'), modeReglement: null })
    ],
    echeancesReglementaires: [
      { id: 'fe', intitule: 'Facturation électronique', date: dateISO('2026-12-01') }
    ]
  });

  it('trie par gravité : les retards d\'abord, l\'information en dernier', () => {
    const gravites = sujetsATraiter(chargee).map((s) => s.gravite);
    const rang = { retard: 0, a_faire: 1, information: 2 } as const;
    const rangs = gravites.map((g) => rang[g]);
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
  });

  /*
   * Le badge porte le nombre de choses À FAIRE, pas la somme des quantités.
   * Il comptait aussi l'information (« la facturation électronique dans cent
   * jours ») : le titre d'Obligations, qui dit « N choses à faire », lit la
   * même fonction, et un titre qui annonce une chose à faire au-dessus d'une
   * liste où rien ne l'est se contredirait.
   */
  it('compte les choses à faire par écran — ni les quantités, ni l’information', () => {
    const sujets = sujetsATraiter(chargee);
    const compteurs = compteursParEcran(sujets);
    const total = Object.values(compteurs).reduce<number>((s, n) => s + (n ?? 0), 0);
    expect(sujets.some((s) => s.gravite === 'information')).toBe(true);
    expect(total).toBe(sujets.filter((s) => s.gravite !== 'information').length);
  });

  it('un écran ne voit que ses propres sujets', () => {
    const sujets = sujetsATraiter(chargee);
    const obligations = sujetsDeLEcran(sujets, 'obligations');
    expect(obligations.length).toBeGreaterThan(0);
    expect(obligations.every((s) => s.ecran === 'obligations')).toBe(true);
    expect(obligations.length).toBeLessThan(sujets.length);
  });

  // La règle du design : Pilote est le poste de pilotage, il montre tout.
  it('Pilote voit tous les sujets, quel que soit leur écran', () => {
    const sujets = sujetsATraiter(chargee);
    expect(sujetsDeLEcran(sujets, 'pilote')).toEqual(sujets);
  });

  it('chaque sujet porte un identifiant unique, un intitulé et une action', () => {
    const sujets = sujetsATraiter(chargee);
    expect(new Set(sujets.map((s) => s.id)).size).toBe(sujets.length);
    for (const s of sujets) {
      expect(formuler(s).intitule).toBeTruthy();
      expect(formuler(s).contexte).toBeTruthy();
      expect(formuler(s).action).toBeTruthy();
      expect(s.nombre).toBeGreaterThanOrEqual(1);
    }
  });
});

/**
 * L'OMISSION QUI VA DANS LE SENS DANGEREUX.
 *
 * Quelqu'un qui encaisse depuis des mois sans avoir jamais enregistré un appel
 * URSSAF n'a pas « zéro cotisation » : il a oublié de les saisir. Le disponible
 * et le versable sont alors surestimés — l'application invite à se verser de
 * l'argent déjà dû, ce qu'elle existe pour empêcher.
 *
 * Une omission ne se voit pas toute seule : elle produit un chiffre plausible,
 * juste trop élevé. Il faut donc aller la chercher.
 */
describe('aucune échéance jamais saisie', () => {
  const encaissee = (mois: string) => recette({
    id: `r-${mois}`, encaisseeLe: dateISO(`${mois}-10`)
  });

  it('alerte après plusieurs mois d’encaissements sans la moindre échéance', () => {
    const sujets = sujetsATraiter(entree({
      recettes: [encaissee('2026-04'), encaissee('2026-05'), encaissee('2026-06')],
      echeancesSaisies: 0
    }));
    expect(sujets.some((s) => s.id === 'aucune-echeance')).toBe(true);
  });

  // Le doute doit rester possible : deux mois peuvent être un début d'activité.
  it('se tait sur un ou deux mois seulement', () => {
    const sujets = sujetsATraiter(entree({
      recettes: [encaissee('2026-05'), encaissee('2026-06')],
      echeancesSaisies: 0
    }));
    expect(sujets.some((s) => s.id === 'aucune-echeance')).toBe(false);
  });

  /**
   * Une échéance PAYÉE compte : elle prouve que l'utilisateur connaît le
   * geste. Continuer à l'alerter serait le dresser à ignorer l'alerte.
   */
  it('se tait dès qu’une échéance existe, même payée', () => {
    const sujets = sujetsATraiter(entree({
      recettes: [encaissee('2026-04'), encaissee('2026-05'), encaissee('2026-06')],
      echeancesSaisies: 1
    }));
    expect(sujets.some((s) => s.id === 'aucune-echeance')).toBe(false);
  });

  it('se tait quand rien n’a été encaissé', () => {
    const sujets = sujetsATraiter(entree({ echeancesSaisies: 0 }));
    expect(sujets.some((s) => s.id === 'aucune-echeance')).toBe(false);
  });

  // Le sens de l'erreur doit être DIT : « surestimé » n'est pas la même chose
  // qu'« incomplet », et c'est ce mot qui fait agir.
  it('dit dans quel sens le chiffre est faux', () => {
    const sujets = sujetsATraiter(entree({
      recettes: [encaissee('2026-04'), encaissee('2026-05'), encaissee('2026-06')],
      echeancesSaisies: 0
    }));
    const sujet = sujets.find((s) => s.id === 'aucune-echeance');
    expect(sujet === undefined ? '' : formuler(sujet).contexte).toMatch(/SURESTIM/i);
  });
});
