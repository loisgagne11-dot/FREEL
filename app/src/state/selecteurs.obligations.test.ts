import { describe, expect, it } from 'vitest';
import { dateISO, euros, mois, ratio } from '../domain/types';
import type { Depense } from '../domain/calculs/depenses';
import { type Echeance, voletConstate } from '../domain/calculs/provisions';
import { type Obligation, duSaisi, obligationsATraiter } from '../domain/calculs/obligations';
import { type Faits, type Recette, faitsVides } from './schema';
import { obligationsEntre } from './selecteurs.obligations';
import { aTraiter } from './selecteurs.aTraiter';

const recette = (id: string, encaisseeLe: string, montant: number, m: Partial<Recette> = {}): Recette => ({
  id, clientNom: 'Client démo', libelle: 'Prestation', montant: euros(montant),
  emiseLe: dateISO(encaisseeLe), encaisseeLe: dateISO(encaisseeLe), modeReglement: 'virement', numero: id, ...m
});

const depenseUe = (id: string, payeeLe: string, montantTtc: number): Depense => ({
  id, libelle: 'Logiciel', fournisseur: 'Éditeur démo', provenance: 'ue', montantTtc: euros(montantTtc),
  tauxTva: ratio(0), payeeLe: dateISO(payeeLe), justificatifId: 'p', rapprochement: 'sans_banque'
});

const echeance = (id: string, m: Partial<Echeance>): Echeance => ({
  id, nature: 'urssaf', montant: euros(100), echeanceLe: dateISO('2026-07-31'), payeeLe: null, montantPaye: null, ...m
});

function faits(m: Partial<Faits> = {}, entreprise: Partial<Faits['entreprise']> = {}): Faits {
  return {
    ...faitsVides(),
    ...m,
    entreprise: { ...faitsVides().entreprise, debutActivite: dateISO('2025-01-01'), ...entreprise }
  };
}

const toutes = (f: Faits, jour: string, du = '2025-01-01', au = '2028-12-31') =>
  obligationsEntre(f, dateISO(du), dateISO(au), dateISO(jour));
const parId = (f: Faits, jour: string, id: string) => toutes(f, jour).find((o) => o.id === id);
const valeurDe = (o: Obligation | undefined, etape: 'declaration' | 'paiement' | 'formalite' = 'declaration') => {
  const l = o?.[etape]?.limite;
  return l === undefined ? undefined : l.statut === 'refuse' ? l.motif : l.valeur;
};
const a9h = (j: string) => new Date(`${j}T09:00:00`);

/**
 * LES PÉRIODES URSSAF, LUES SUR LES OBLIGATIONS.
 *
 * Ces règles vivaient dans la requête « à traiter » ; elle lit désormais les
 * obligations, comme l'écran : une période close et non déclarée est à
 * faire jusqu'à sa limite reportée, en retard le lendemain.
 */
describe('périodes URSSAF à déclarer', () => {
  const mensuel = faits({ recettes: [recette('r', '2026-06-15', 1000)] }, { debutActivite: dateISO('2026-06-01') });
  const sujet = (f: Faits, jour: string) => aTraiter(f, a9h(jour)).find((s) => s.id === 'periodes-a-declarer');

  it('réclame une période échue où des recettes ont été encaissées, « avant le … »', () => {
    expect(sujet(mensuel, '2026-07-28')?.gravite).toBe('a_faire');
    expect(parId(mensuel, '2026-07-28', 'urssaf-2026-06')?.declaration?.etat).toBe('a_faire');
  });

  it('passe en retard le lendemain de la date limite', () => {
    expect(sujet(mensuel, '2026-08-01')?.gravite).toBe('retard');
  });

  /* Le dimanche 31 mai 2026 se reporte au lundi 1er juin : ce jour-là, avril
     se déclare encore. Le dire en retard ferait déclarer dans l'urgence ce qui
     ne l'est pas. */
  it('ne dit pas en retard, le lundi du report, une période dont la limite tombait un dimanche', () => {
    const avril = faits({ recettes: [recette('r', '2026-04-15', 1000)] }, { debutActivite: dateISO('2026-04-01') });
    expect(sujet(avril, '2026-06-01')?.gravite).toBe('a_faire');
    expect(valeurDe(parId(avril, '2026-06-01', 'urssaf-2026-04'))).toBe('2026-06-01');
  });

  // Réclamer la déclaration du mois courant serait un faux positif quotidien.
  it('ne réclame pas la période en cours, à venir', () => {
    const juillet = faits({ recettes: [recette('r', '2026-07-10', 1000)] }, { debutActivite: dateISO('2026-07-01') });
    expect(sujet(juillet, '2026-07-28')).toBeUndefined();
    expect(parId(juillet, '2026-07-28', 'urssaf-2026-07')?.declaration?.etat).toBe('a_venir');
  });

  it('cesse de réclamer une période déclarée', () => {
    const declare = { ...mensuel, periodesDeclarees: [{ nature: 'urssaf' as const, periode: '2026-06', declareeLe: null }] };
    expect(sujet(declare, '2026-07-28')).toBeUndefined();
  });

  // La déclaration à zéro est due : son oubli est sanctionné mécaniquement.
  it('réclame les périodes sans recette depuis le début d’activité, une chose à faire chacune', () => {
    const vide = faits({}, { debutActivite: dateISO('2026-04-01') });
    expect(sujet(vide, '2026-07-28')?.nombre).toBe(3);
  });

  it('en trimestriel, ne réclame que les trimestres entièrement clos', () => {
    const trimestriel = faits(
      { recettes: [recette('a', '2026-02-15', 1000), recette('b', '2026-07-05', 1000)] },
      { debutActivite: dateISO('2026-01-01'), urssafPeriodicite: 'trimestriel' }
    );
    // T1 déclaré : seul le T2, clos, reste ; le T3 est en cours.
    const f = {
      ...trimestriel,
      periodesDeclarees: ['2026-01', '2026-02', '2026-03'].map((m) => ({ nature: 'urssaf' as const, periode: m, declareeLe: null }))
    };
    expect(sujet(f, '2026-07-28')?.nombre).toBe(1);
  });

  /*
   * JAMAIS « PAYÉE » PARCE QUE « DÉCLARÉE ».
   *
   * Le prélèvement est un fait distinct de la déclaration : une période
   * déclarée dont l'appel n'est pas payé reste à payer ; déclarée sans appel
   * — à zéro, ou reprise d'avant le geste unique —, rien ne dit un paiement,
   * ni dans un sens ni dans l'autre.
   */
  it('ne déduit jamais le paiement de la déclaration', () => {
    const declaree = {
      ...mensuel,
      periodesDeclarees: [{ nature: 'urssaf' as const, periode: '2026-06', declareeLe: dateISO('2026-07-20') }]
    };
    const avecAppel = { ...declaree, echeances: [echeance('appel', { periode: '2026-06', montant: euros(256) })] };
    const o = parId(avecAppel, '2026-07-28', 'urssaf-2026-06');
    expect(o?.declaration?.etat).toBe('fait');
    expect(o?.declaration?.avance).toBe(11);
    expect(o?.paiement?.etat).toBe('a_faire');
    expect(o?.montant?.statut === 'publie' ? o.montant.valeur : null).toBe(256);
    expect(parId(declaree, '2026-07-28', 'urssaf-2026-06')?.paiement).toBeUndefined();
  });

  // Décision du propriétaire du 17/11 : la date officielle, puis « tolérée ».
  it('dit la date officielle d’août 2026 à côté de la limite tolérée', () => {
    const aout = faits({ recettes: [recette('r', '2026-08-10', 1000)] }, { debutActivite: dateISO('2026-08-01') });
    const o = parId(aout, '2026-10-15', 'urssaf-2026-08');
    expect(valeurDe(o)).toBe('2026-10-31');
    expect(o?.declaration?.etat).toBe('a_faire');
    expect(o?.detail).toMatch(/Limite officielle le 30 septembre, tolérée jusqu’au 31 octobre/);
  });
});

/**
 * UNE OBLIGATION N'APPARAÎT QU'UNE FOIS — clé de fusion par nature.
 */
describe('fusion du prévu et du saisi', () => {
  const ancienne = faits({ recettes: [recette('r', '2024-05-01', 40000)] }, { debutActivite: dateISO('2020-01-01') });

  it('ne fait qu’une ligne de la CFE prévue et de l’avis saisi', () => {
    const f = { ...ancienne, echeances: [echeance('avis', { nature: 'cfe', montant: euros(296), echeanceLe: dateISO('2026-12-15') })] };
    const cfe = toutes(f, '2026-11-20', '2026-01-01', '2026-12-31').filter((o) => o.dossier === 'cfe');
    expect(cfe.map((o) => o.id)).toEqual(['cfe-paiement-2026']);
    expect(cfe[0]?.saisies.map((e) => e.id)).toEqual(['avis']);
    expect(cfe[0]?.montant?.statut).toBe('publie');
  });

  it('ne fait qu’une ligne de la TVA autoliquidée calculée et de son paiement saisi', () => {
    const f = faits({
      depenses: [depenseUe('logiciel', '2026-06-03', 145)],
      echeances: [echeance('tva-juillet', { nature: 'tva', montant: euros(29), echeanceLe: dateISO('2026-07-16') })]
    }, { nomExploitant: 'Durand', codePostal: '33000' });
    const tva = toutes(f, '2026-11-20', '2026-06-01', '2026-08-31').filter((o) => o.dossier === 'tva');
    expect(tva.map((o) => o.id)).toEqual(['ca3-2026-06']);
    expect(tva[0]?.saisies.map((e) => e.id)).toEqual(['tva-juillet']);
  });

  /* « Échéances reçues » montre ce qui est PARTI du compte quand il diffère
     de l'appel — une majoration, une régularisation : c'est l'écart qui
     explique un solde qui ne tombe pas juste. La ligne d'obligation aussi. */
  it('montre ce qui est parti du compte, écart compris, plutôt que l’appel', () => {
    const f = { ...ancienne, echeances: [echeance('avis', {
      nature: 'cfe', montant: euros(296), montantPaye: euros(311), payeeLe: dateISO('2026-12-14'), echeanceLe: dateISO('2026-12-15')
    })] };
    const cfe = parId(f, '2026-12-20', 'cfe-paiement-2026');
    expect(cfe?.montant?.statut === 'refuse' ? null : cfe?.montant?.valeur).toBe(311);
    expect(cfe?.paiement?.etat).toBe('fait');
  });

  it('rattache un appel URSSAF à sa période par son lien, et à aucune autre', () => {
    const f = faits(
      { recettes: [recette('a', '2026-04-10', 1000), recette('b', '2026-05-10', 1000)],
        echeances: [echeance('appel-avril', { periode: '2026-04', echeanceLe: dateISO('2026-06-01') })] },
      { debutActivite: dateISO('2026-04-01') }
    );
    const urssaf = toutes(f, '2026-06-10').filter((o) => o.dossier === 'urssaf');
    expect(urssaf.find((o) => o.id === 'urssaf-2026-04')?.saisies.map((e) => e.id)).toEqual(['appel-avril']);
    expect(urssaf.find((o) => o.id === 'urssaf-2026-05')?.saisies).toEqual([]);
    expect(urssaf.filter((o) => o.saisies.length > 0)).toHaveLength(1);
  });
});

/**
 * UNE OBLIGATION PRÉVUE N'ENTRE JAMAIS DANS LE DÛ.
 *
 * Sur un compte qui a des périodes à déclarer (estimées), une CFE prévue et
 * un solde d'impôt estimé, le dû que portent les obligations vaut le volet 1
 * des provisions — les échéances saisies non payées — au centime.
 */
describe('le dû des obligations', () => {
  it('vaut le volet 1, et rien des obligations prévues', () => {
    const f = faits(
      {
        recettes: [recette('r', '2024-05-01', 40000), recette('s', '2026-09-10', 5000)],
        echeances: [
          echeance('payee', { payeeLe: dateISO('2026-07-30'), montantPaye: euros(100), periode: '2026-06' }),
          echeance('impayee', { nature: 'cfp', montant: euros(12), echeanceLe: dateISO('2026-11-30') })
        ]
      },
      { debutActivite: dateISO('2020-01-01') }
    );
    const obligations = toutes(f, '2026-11-20');
    expect(obligations.some((o) => o.saisies.length === 0 && o.montant !== null)).toBe(true);
    expect(duSaisi(obligations)).toBe(voletConstate(f.echeances));
  });
});

/**
 * UN PRÉLÈVEMENT S'OUVRE LE LENDEMAIN DE SON JOUR.
 *
 * Ouvert au préavis, le solde d'impôt prélevé faisait dire au titre « rien à
 * faire avant le 1ᵉʳ septembre » alors qu'il ne se pointe qu'après le 15.
 */
describe('le solde d’impôt prélevé', () => {
  it('s’ouvre le lendemain de son prélèvement, le jour où il devient à pointer', () => {
    const f = faits(
      { recettes: [recette('r', '2025-05-01', 40000)], partsFiscales: 1 },
      { debutActivite: dateISO('2020-01-01'), versementLiberatoire: false }
    );
    const soldes = toutes(f, '2026-06-10').filter((o) => o.libelle.startsWith('Impôt sur le revenu, solde'));
    expect(soldes.length).toBeGreaterThan(0);
    for (const o of soldes) {
      const l = o.paiement?.limite;
      if (l === undefined || l.statut === 'refuse') throw new Error('limite attendue');
      const lendemain = new Date(`${l.valeur}T12:00:00Z`);
      lendemain.setUTCDate(lendemain.getUTCDate() + 1);
      expect(o.paiement?.ouverture).toBe(lendemain.toISOString().slice(0, 10));
    }
  });
});

/**
 * LA TVA D'UN REDEVABLE — CA12 ET ACOMPTES EN 2026, CA3 ENSUITE.
 */
describe('TVA d’un redevable', () => {
  const redevable = (m: Partial<Faits['entreprise']> = {}, recettes: readonly Recette[] = []) => faits(
    { recettes: [...recettes] },
    { tvaDepuis: mois('2025-01'), nomExploitant: 'Durand', codePostal: '33000', ...m }
  );
  const avecTva = (id: string, le: string, ht: number) => recette(id, le, ht, { tvaCollectee: euros(ht * 0.2) });

  it('dépose sa dernière CA12 au 4 mai 2027 au régime simplifié', () => {
    const o = parId(redevable({}, [avecTva('a', '2026-03-10', 1000)]), '2026-11-20', 'ca12-2026');
    expect(valeurDe(o)).toBe('2027-05-04');
    expect(o?.declaration?.etat).toBe('a_venir');
    expect(o?.paiement).toBeDefined();
  });

  /* Acomptes de juillet et de décembre quand la TVA de l'année précédente
     dépasse 1 000 € — aucun en dessous : l'annoncer ferait provisionner deux
     fois la même TVA. */
  it('appelle les acomptes de 2026 quand la TVA de 2025 dépassait 1 000 €, pas en dessous', () => {
    const ids = (f: Faits) => toutes(f, '2026-11-20').filter((o) => o.id.startsWith('tva-acompte')).map((o) => o.id);
    expect(ids(redevable({}, [avecTva('a', '2025-03-10', 6000)]))).toEqual(['tva-acompte-2026-07', 'tva-acompte-2026-12']);
    expect(ids(redevable({}, [avecTva('a', '2025-03-10', 4000)]))).toEqual([]);
    // Aucun en 2027 : le régime n'existe plus.
    expect(ids(redevable({}, [avecTva('a', '2026-03-10', 9000)])).some((id) => id.includes('2027'))).toBe(false);
  });

  it('dépose une CA3 mensuelle au réel normal en 2026', () => {
    const o = parId(redevable({ regimeTva: 'reel_normal' }, [avecTva('a', '2026-06-10', 1000)]), '2026-11-20', 'ca3-2026-06');
    expect(valeurDe(o)).toBe('2026-07-16');
  });

  it('dépose une CA3 trimestrielle à partir de 2027, mensuelle sur option', () => {
    const f = redevable({}, [avecTva('a', '2027-02-10', 1000)]);
    expect(valeurDe(parId(f, '2027-03-01', 'ca3-2027-T1'))).toBe('2027-04-16');
    const mensuelle = redevable({ ca3Mensuelle: true }, [avecTva('a', '2027-02-10', 1000)]);
    expect(valeurDe(parId(mensuelle, '2027-03-01', 'ca3-2027-02'))).toBe('2027-03-16');
    expect(parId(mensuelle, '2027-03-01', 'ca3-2027-T1')).toBeUndefined();
  });

  // On demande le nom ; on ne devine pas l'initiale depuis l'enseigne.
  it('refuse la date de la CA3 tant que le nom de l’exploitant manque', () => {
    const o = parId(redevable({ regimeTva: 'reel_normal', nomExploitant: '' }, [avecTva('a', '2026-06-10', 1000)]),
      '2026-11-20', 'ca3-2026-06');
    expect(o?.declaration?.limite.statut).toBe('refuse');
    expect(valeurDe(o)).toMatch(/Indique ton nom/);
  });
});

/**
 * LA TVA AUTOLIQUIDÉE D'UN FRANCHISÉ : SUR LA CA3 DU MOIS SUIVANT.
 *
 * Les deux maquettes la dataient du 31 juillet. Elle est exigible à la
 * réalisation de la prestation et se déclare sur la CA3 de ce seul mois,
 * déposée le mois suivant au jour de A161-29 — entre le 15 et le 20, jamais
 * le 31.
 */
describe('TVA autoliquidée d’un franchisé', () => {
  const franchise = faits({ depenses: [depenseUe('logiciel', '2026-06-03', 145)] }, { nomExploitant: 'Durand', codePostal: '33000' });

  it('se déclare et se paie sur la CA3 de juin, déposée le 16 juillet, en date calculée', () => {
    const o = parId(franchise, '2026-11-20', 'ca3-2026-06');
    expect(valeurDe(o)).toBe('2026-07-16');
    expect(o?.declaration?.limite.statut).toBe('hypothese');
    expect(o?.montant).toMatchObject({ statut: 'hypothese', valeur: 29 });
    expect(o?.detail).toMatch(/date calculée/);
  });

  // Sans nom, pas de jour : la ligne ne dit pas « date calculée » d'une date
  // qu'elle ne montre pas.
  it('ne dit « date calculée » que s’il y a une date', () => {
    const sansNom = faits({ depenses: [depenseUe('logiciel', '2026-06-03', 145)] }, { nomExploitant: '', codePostal: '33000' });
    const o = parId(sansNom, '2026-06-10', 'ca3-2026-06');
    expect(o?.declaration?.limite.statut).toBe('refuse');
    expect(o?.detail).not.toMatch(/date calculée/);
  });

  it('n’appelle aucune CA3 les mois sans achat hors de France', () => {
    expect(toutes(franchise, '2026-11-20').filter((o) => o.dossier === 'tva').map((o) => o.id)).toEqual(['ca3-2026-06']);
  });
});

/**
 * LA DÉCLARATION DE REVENUS : CASES 5TE / 5HQ, HORS TAXES.
 */
describe('déclaration de revenus', () => {
  it('porte les recettes hors taxes d’un redevable en 5HQ, et rien de déduit', () => {
    const f = faits(
      { recettes: [recette('a', '2026-03-10', 10000, { tvaCollectee: euros(2000) })] },
      { tvaDepuis: mois('2026-01'), codePostal: '33000' }
    );
    expect(parId(f, '2027-04-20', 'revenus-2027')?.cases).toEqual({ '5TE': 0, '5HQ': 10000 });
  });

  it('les porte en 5TE sous versement libératoire', () => {
    const f = faits({ recettes: [recette('a', '2026-03-10', 10000)] }, { versementLiberatoire: true });
    expect(parId(f, '2027-04-20', 'revenus-2027')?.cases).toEqual({ '5TE': 10000, '5HQ': 0 });
  });
});

/**
 * CFE : « ≈ » SEULEMENT SUR UNE SAISIE ; L'ACOMPTE AU-DELÀ DE 3 000 €.
 */
describe('CFE', () => {
  const ancienne = (echeances: readonly Echeance[] = []) => faits(
    { recettes: [recette('r', '2024-05-01', 40000)], echeances: [...echeances] },
    { debutActivite: dateISO('2020-01-01') }
  );

  /* Le simulateur de CFE ne garde rien : base et taux vivent le temps de la
     carte. Sans avis saisi, aucun montant n'a de source — « — », pas un
     chiffre. */
  it('n’avance aucun montant sans avis saisi', () => {
    expect(parId(ancienne(), '2026-11-20', 'cfe-paiement-2026')?.montant).toBeNull();
  });

  it('appelle l’acompte de juin quand la CFE de l’an passé atteignait 3 000 €, pas en dessous', () => {
    const cfe2025 = (montant: number) => echeance('cfe-2025', { nature: 'cfe', montant: euros(montant), echeanceLe: dateISO('2025-12-15') });
    expect(parId(ancienne([cfe2025(3000)]), '2026-05-20', 'cfe-acompte-2026')).toBeDefined();
    expect(valeurDe(parId(ancienne([cfe2025(3000)]), '2026-05-20', 'cfe-acompte-2026'), 'paiement')).toBe('2026-06-15');
    expect(parId(ancienne([cfe2025(2999)]), '2026-05-20', 'cfe-acompte-2026')).toBeUndefined();
  });
});

/**
 * CE QUE L'APPLICATION NE SAVAIT PAS NOTER N'EST PAS EN RETARD.
 */
describe('suivi des déclarations nouvelles', () => {
  it('ne dit pas en retard une CA12 dont la limite précède le schéma 25', () => {
    const f = faits({ recettes: [recette('a', '2025-03-10', 6000, { tvaCollectee: euros(1200) })] },
      { tvaDepuis: mois('2025-01'), nomExploitant: 'Durand', codePostal: '33000' });
    expect(parId(f, '2026-11-20', 'ca12-2025')?.declaration?.etat).toBe('non_suivi');
    expect(obligationsATraiter(toutes(f, '2026-11-20'), dateISO('2026-11-20')).some((o) => o.id === 'ca12-2025')).toBe(false);
  });
});

/**
 * LES PIÈCES ET LA PLATEFORME.
 */
describe('pièces à fournir', () => {
  it('ne réclame rien d’une attestation qu’une plus récente remplace', () => {
    const f = faits({
      pieces: [
        { id: 'provisoire', sorte: 'vigilance', libelle: 'Provisoire', obtenueLe: dateISO('2025-01-10'), valableJusquau: null, provisoire: true },
        { id: 'actuelle', sorte: 'vigilance', libelle: 'Vigilance', obtenueLe: dateISO('2026-08-03'), valableJusquau: null, provisoire: false }
      ]
    });
    const pieces = toutes(f, '2026-11-20').filter((o) => o.dossier === 'piece');
    expect(pieces.map((o) => o.id)).toEqual(['piece-actuelle-2027-02-03']);
    expect(pieces[0]?.formalite?.etat).toBe('a_venir');
  });

  it('lit la plateforme agréée sur l’entreprise, et la dit faite', () => {
    const avec = faits({}, { plateformeAgreee: { nom: 'Plateforme démo', depuis: dateISO('2026-08-20') } });
    const o = parId(avec, '2026-11-20', 'facturation-electronique-reception');
    expect(o?.formalite?.etat).toBe('fait');
    expect(o?.formalite?.avance).toBe(12);
    expect(parId(faits(), '2026-11-20', 'facturation-electronique-reception')?.formalite?.etat).toBe('a_faire');
  });
});
