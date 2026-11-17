import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { type DateISO, type Mois, dateISO } from '../domain/types';
import { appelsDeLaPeriode, dateDeDeclaration, periodesADeclarer } from '../domain/calculs/declarations';
import { moisDeclares } from '../domain/calculs/declarations.declarees';
import { type Etape, type Obligation, obligationsATraiter } from '../domain/calculs/obligations';
import type { Faits } from '../state/schema';
import { completerFaits } from '../state/schema.migrations';
import { recettesEncaissees } from '../state/selecteurs';
import { aTraiter, nombreAFaire } from '../state/selecteurs.aTraiter';
import { montantDeclaration, obligationsEntre } from '../state/selecteurs.obligations';
import { ANCRE_DEMONSTRATION, recalerDemonstration } from '../state/demonstration.recalage';
import { statutDe } from '../ui/components/Echeances';
import { chargerJeu, faitsAu, isoDe, le } from '../test/jeu-d-essai';

/**
 * L'ACCORD ENTRE LES DEUX CARTES D'AUJOURD'HUI ET LA SOURCE DE DEMAIN.
 *
 * L'écran Obligations va remplacer « Échéances reçues » et « Périodes
 * URSSAF » par une liste unique, lue sur `obligationsEntre`. Avant d'y
 * toucher, ce que les deux cartes montrent doit s'y retrouver LIGNE POUR
 * LIGNE — dates, montants, états — sur des comptes entiers et non sur trois
 * recettes : la démonstration à sa date d'ancrage et recalée, le jeu d'essai
 * à ses dates de référence. Une ligne perdue ici serait une fonction perdue
 * à l'écran.
 *
 * Une seule différence est voulue, et elle est écrite : un prélèvement
 * d'impôt passé sans paiement noté était « En retard » ; c'est
 * l'administration qui le fait, il est « à pointer » (avis du 17/11, Q1).
 */

const demo = completerFaits(JSON.parse(
  readFileSync(new URL('../../public/jeu-de-demonstration.json', import.meta.url), 'utf8')
));
const jeu = chargerJeu();

const COMPTES: readonly { readonly nom: string; readonly faits: Faits; readonly jour: DateISO }[] = [
  { nom: 'la démonstration à son ancre', faits: demo, jour: dateISO(ANCRE_DEMONSTRATION) },
  { nom: 'la démonstration recalée au 17 novembre 2026', faits: recalerDemonstration(demo, dateISO('2026-11-17')), jour: dateISO('2026-11-17') },
  { nom: 'la démonstration recalée au 4 janvier 2027', faits: recalerDemonstration(demo, dateISO('2027-01-04')), jour: dateISO('2027-01-04') },
  ...[le(2026, 1, 2), le(2026, 4, 30), le(2026, 6, 30), le(2026, 12, 15), le(2027, 1, 2)]
    .map((d) => ({ nom: `le jeu d’essai au ${isoDe(d)}`, faits: faitsAu(jeu, d), jour: isoDe(d) }))
];

const obligationsDe = (f: Faits, jour: DateISO) =>
  obligationsEntre(f, dateISO('1970-01-01'), dateISO('2028-12-31'), jour);
const limiteDe = (e: Etape | undefined) =>
  (e === undefined ? undefined : e.limite.statut === 'refuse' ? null : e.limite.valeur);

describe.each(COMPTES)('accord avec « Échéances reçues » : $nom', ({ faits, jour }) => {
  const obligations = obligationsDe(faits, jour);

  it.each(faits.echeances.map((e) => [e.id, e] as const))('retrouve l’échéance %s, sa date, son montant, son état', (_, e) => {
    const porteuses = obligations.filter((o) => o.saisies.some((s) => s.id === e.id));
    expect(porteuses).toHaveLength(1);
    const o = porteuses[0] as Obligation;
    const etat = statutDe(e, jour).libelle;
    if (o.saisies.length === 1) {
      expect(limiteDe(o.paiement)).toBe(e.echeanceLe);
      expect(o.montant?.statut === 'refuse' ? null : o.montant?.valeur).toBe(e.montantPaye ?? e.montant);
      const attendu = etat === 'Payée' ? ['fait']
        : etat === 'En retard' ? [e.nature === 'impot' ? 'a_pointer' : 'en_retard']
          : ['a_faire', 'a_venir'];
      expect(attendu).toContain(o.paiement?.etat);
      if (etat === 'Payée') expect(o.paiement?.faiteLe).toBe(e.payeeLe);
    } else {
      // Plusieurs appels pour une période : payée seulement quand tous le sont.
      expect(o.paiement?.etat === 'fait').toBe(o.saisies.every((s) => s.payeeLe !== null));
    }
  });
});

describe.each(COMPTES)('accord avec « Périodes URSSAF » : $nom', ({ faits, jour }) => {
  const obligations = obligationsDe(faits, jour);
  const debut = faits.entreprise.debutActivite;
  const periodes = periodesADeclarer(
    recettesEncaissees(faits), faits.entreprise.urssafPeriodicite, moisDeclares(faits.periodesDeclarees),
    jour, debut === null ? null : debut.slice(0, 7) as Mois
  );

  it('a au moins une période à comparer', () => {
    expect(periodes.length).toBeGreaterThan(0);
  });

  it.each(periodes.map((p) => [p.id, p] as const))('retrouve la période %s, sa limite, son montant, son état', (_, p) => {
    const o = obligations.find((x) => x.id === `urssaf-${p.id}`);
    expect(o).toBeDefined();
    expect(limiteDe(o?.declaration)).toBe(p.limite);
    expect(o?.assiette).toBe(p.encaisse);
    if (p.declaree) {
      // « Déclarée » et la date qui se corrige à côté.
      expect(o?.declaration?.etat).toBe('fait');
      expect(o?.declaration?.faiteLe).toBe(dateDeDeclaration(p.mois, faits.periodesDeclarees));
    } else if (p.close) {
      // « À payer … · avant le … » ou « date limite dépassée ».
      expect(o?.declaration?.etat).toBe(p.limite < jour ? 'en_retard' : 'a_faire');
      const m = montantDeclaration(faits, p.mois);
      expect(o?.montant?.statut === 'refuse' ? null : o?.montant?.valeur).toBe(m.statut === 'refuse' ? null : m.valeur);
    } else {
      // « Période en cours, pas encore déclarable ».
      expect(o?.declaration?.etat).toBe('a_venir');
    }
    // La suite du cycle : « à payer avant / depuis le … » ou « payée le … ».
    const appels = appelsDeLaPeriode(p.id, faits.echeances);
    if (appels.length > 0) {
      const impayes = appels.filter((e) => e.payeeLe === null);
      if (impayes.length > 0) {
        const limite = impayes.map((e) => e.echeanceLe).sort()[0] as DateISO;
        expect(limiteDe(o?.paiement)).toBe(limite);
        expect(o?.paiement?.etat).toBe(limite < jour ? 'en_retard' : expect.stringMatching(/a_faire|a_venir/));
      } else {
        expect(o?.paiement?.faiteLe).toBe(appels.map((e) => e.payeeLe as DateISO).sort().at(-1));
      }
    }
  });
});

/**
 * LE RAIL ET LE TITRE D'OBLIGATIONS COMPTENT LA MÊME CHOSE.
 *
 * La pastille compte chaque obligation à traiter une fois — quatre périodes
 * à déclarer en une ligne du Pilote en font quatre —, plus les sujets de
 * l'écran qui ne sont pas des obligations (un livre des recettes incomplet,
 * aucune échéance saisie).
 */
describe.each(COMPTES)('le compteur d’Obligations : $nom', ({ faits, jour }) => {
  it('compte une chose par obligation à traiter, et les autres sujets de l’écran', () => {
    const maintenant = new Date(`${jour}T09:00:00`);
    const aFaire = obligationsATraiter(obligationsDe(faits, jour), jour);
    const autres = aTraiter(faits, maintenant).filter((s) => s.ecran === 'obligations' && s.gravite !== 'information'
      && ['aucune-echeance', 'livre-recettes-incomplet'].includes(s.id));
    expect(nombreAFaire(faits, 'obligations', maintenant)).toBe(aFaire.length + autres.length);
  });
});
