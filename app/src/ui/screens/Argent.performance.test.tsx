/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros, ratio } from '../../domain/types';
import { type Faits, type Mission, type Recette, entiteVide, faitsVides } from '../../state/schema';
import { etatArgent } from '../../state/selecteurs.argent';
import { useFaits } from '../../state/store';
import { eur } from '../format';
import { Performance } from './Argent.performance';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Juin : six mois écoulés sur douze. Le mois courant est au milieu de
  // l'année, ce qui rend visible la troncature de l'axe — en décembre, un axe
  // tronqué et un axe complet seraient identiques et le test ne tiendrait rien.
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
});

let compteur = 0;
function recette(o: Partial<Recette> = {}): Recette {
  compteur += 1;
  return {
    id: `r${compteur}`,
    clientNom: 'Client d’essai',
    libelle: 'Prestation',
    montant: euros(10_000),
    emiseLe: dateISO('2026-06-15'),
    encaisseeLe: null,
    modeReglement: null,
    numero: `2026-${String(compteur).padStart(3, '0')}`,
    ...o
  };
}

/** Une mission qui travaille tous les jours ouvrés de la fenêtre indiquée. */
function missionPleine(du: string, au: string, tjm = 600): Mission {
  return {
    id: 'm1',
    clientId: null,
    clientNom: 'Client d’essai',
    description: 'Refonte',
    tjm: euros(tjm),
    debut: dateISO(du),
    fin: dateISO(au),
    statut: 'active',
    entites: [{
      ...entiteVide(),
      id: 'm1-co1',
      nom: 'Client d’essai',
      rythmes: [{
        du: dateISO(du), au: dateISO(au),
        parJour: { lun: 1, mar: 1, mer: 1, jeu: 1, ven: 1 },
        tjm: null
      }]
    }]
  };
}

/**
 * Le pilier reçoit l'état que l'écran calcule déjà pour ses deux piliers : le
 * recalculer ici afficherait deux chiffres d'affaires calculés deux fois.
 */
function poser(m: Partial<Faits> = {}): void {
  const faits = { ...faitsVides(), ...m } as Faits;
  useFaits.setState({ faits });
  render(<Performance etat={etatArgent(faits)} />);
}

/* ─────────────────────────────────────────────────────────────────────────
   A1 — les quatre tuiles
   ───────────────────────────────────────────────────────────────────────── */

describe('les tuiles de performance', () => {
  /**
   * DEUX DÉFINITIONS DU CHIFFRE D'AFFAIRES SUR LE MÊME RANG.
   *
   * « 10 000 € » et « 4 000 € » côte à côte ne disent pas lequel est facturé et
   * lequel est encaissé. Sans les notes, la tuile la plus flatteuse est celle
   * qu'on retient — et c'est le facturé, celui sur lequel rien ne se décide.
   */
  it('dit sous chaque montant de quel chiffre d’affaires il s’agit', () => {
    poser({ recettes: [recette({ montant: euros(10_000) })] });

    expect(screen.getByText('facturé, cumulé')).toBeTruthy();
    expect(screen.getByText('reçu sur le compte')).toBeTruthy();
  });

  /**
   * LE NOMBRE DE FACTURES SE COMPTE AVEC LEUR MONTANT, PAS À CÔTÉ.
   *
   * Un montant sur trois factures accompagné d'un compte de deux est le genre
   * d'incohérence qu'on ne remarque jamais et qui fait douter de tout l'écran.
   * `encoursDe` rend les deux, du même filtre.
   */
  it('accorde le compte des factures en attente à leur montant', () => {
    poser({
      recettes: [
        recette({ montant: euros(3_000), emiseLe: dateISO('2026-06-01') }),
        recette({ montant: euros(610), emiseLe: dateISO('2026-06-02') })
      ]
    });

    const tuile = screen.getByText('À encaisser').parentElement;
    expect(tuile?.textContent).toContain('2 factures en attente');
    expect(tuile?.textContent).toContain(eur(3_610));
  });

  it('met le singulier sur une seule facture', () => {
    poser({ recettes: [recette({ montant: euros(3_000) })] });
    expect(screen.getByText('1 facture en attente')).toBeTruthy();
  });

  /**
   * UNE TUILE QUI NE DIT PAS CE QU'ELLE IGNORE EST PIRE QU'UNE TUILE ABSENTE.
   *
   * Sous le barème, aucun impôt sur le revenu n'est déduit du résultat projeté
   * et rien ne le signalerait : `tauxImpotEtContributions` ne rend alors que la
   * CFP à 0,2 % et ne refuse jamais. Le libellé doit donc dire « avant impôt sur
   * le revenu », faute de quoi on lit « ce qu'il me restera » et on décide
   * dessus.
   */
  it('avoue sur la tuile que le résultat projeté est avant impôt sur le revenu', () => {
    poser({
      recettes: [recette({ montant: euros(10_000), encaisseeLe: dateISO('2026-03-10') })]
    });

    expect(screen.getByText(/avant impôt sur le revenu/)).toBeTruthy();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   A2 / A6 — le graphe
   ───────────────────────────────────────────────────────────────────────── */

describe('le graphe du chiffre d’affaires', () => {
  /**
   * L'AXE S'ARRÊTE AU MOIS COURANT.
   *
   * Six colonnes vides à droite se lisent comme un effondrement de l'activité,
   * alors qu'elles ne disent que « on n'y est pas encore ». Au 10 juin, l'axe
   * porte six mois et pas douze.
   */
  it('ne trace que les mois écoulés', () => {
    poser({ recettes: [recette()] });

    expect(screen.getByRole('button', { name: /^JUIN/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^JUIL/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^DÉC/ })).toBeNull();
  });

  /**
   * LE CUMUL EST EN PIED, ET IL EST CELUI DE L'ANNÉE ENTIÈRE.
   *
   * L'axe est tronqué au mois courant ; le cumul, lui, ne l'est pas — il n'a
   * simplement rien à ajouter au-delà, puisque rien n'y est encore arrivé.
   */
  it('donne le cumul réalisé et encaissé en pied de carte', () => {
    poser({
      recettes: [
        recette({ montant: euros(9_000), emiseLe: dateISO('2026-02-10') }),
        recette({
          montant: euros(4_000), emiseLe: dateISO('2026-03-10'),
          encaisseeLe: dateISO('2026-04-02')
        })
      ]
    });

    const pied = screen.getByText(/Cumulé/);
    expect(pied.textContent).toContain(eur(13_000));
    expect(pied.textContent).toContain(eur(4_000));
  });

  /**
   * AUCUNE LIGNE D'OBJECTIF SANS OBJECTIF.
   *
   * Le handoff n'a pas d'objectif de chiffre d'affaires : cette ligne est un
   * ajout, repris de l'ancienne application. Un repère tracé par défaut — à
   * zéro, ou à une valeur devinée — serait une cible qu'on n'a jamais fixée.
   */
  it('ne trace aucun repère d’objectif tant qu’aucun n’est fixé', () => {
    poser({ recettes: [recette()] });
    expect(screen.queryByText(/objectif/i)).toBeNull();
    expect(screen.queryByText(/de retard|d’avance/)).toBeNull();
  });

  it('trace le repère mensuel et dit l’avance en jours quand un objectif est fixé', () => {
    poser({
      objectifCaAnnuel: euros(120_000),
      recettes: [recette({ montant: euros(10_000), encaisseeLe: dateISO('2026-02-10') })]
    });

    // 120 000 € / 12 = 10 000 € par mois.
    expect(screen.getByText(/objectif .*\/mois/).textContent).toContain(eur(10_000));
    // Attendu à date au 10 juin : environ 44 % de 120 000 €, soit bien plus que
    // les 10 000 € encaissés. L'écran doit dire un RETARD, pas une avance.
    expect(screen.getByText(/de retard/)).toBeTruthy();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   A3 — la composition
   ───────────────────────────────────────────────────────────────────────── */

describe('la composition du mois', () => {
  it('s’ouvre sur le mois courant', () => {
    poser({ recettes: [recette()] });
    expect(screen.getByRole('heading', { name: /Composition · juin 2026/ })).toBeTruthy();
  });

  it('suit le mois qu’on clique dans le graphe', async () => {
    poser({ recettes: [recette({ emiseLe: dateISO('2026-02-10') })] });

    await userEvent.setup().click(screen.getByRole('button', { name: /^FÉV/ }));
    expect(screen.getByRole('heading', { name: /Composition · février 2026/ })).toBeTruthy();
  });

  /**
   * « 22 J × 600 € » SE CONTESTE ; « 13 200 € » NE SE CONTESTE PAS.
   *
   * C'est ainsi qu'on trouve la journée oubliée, et c'est ce que faisait
   * `showMonthCARealisations` dans l'ancienne application.
   */
  it('montre les journées et le tarif qui composent une ligne de réalisé', () => {
    poser({
      missions: [missionPleine('2026-06-01', '2026-06-30')],
      recettes: [recette({ montant: euros(9_000), emiseLe: dateISO('2026-06-30') })]
    });

    // Juin 2026 : 22 jours ouvrés, aucun férié en semaine.
    expect(screen.getByText(/22 j × 600 €/)).toBeTruthy();
  });

  /**
   * LE RESTE À ENCAISSER NE SE DÉDUIT PAS DE DEUX AGRÉGATS.
   *
   * Juin émet 8 000 € et encaisse 12 000 € venus d'avril. La soustraction
   * « réalisé du mois − encaissé du mois » rend −4 000 €, donc zéro une fois
   * bornée : les 8 000 € dus disparaîtraient de l'écran. Comptés facture par
   * facture, ils sont là.
   */
  it('compte le reste à encaisser facture par facture, même sur un mois qui encaisse plus qu’il n’émet', () => {
    poser({
      recettes: [
        recette({ montant: euros(8_000), emiseLe: dateISO('2026-06-20') }),
        recette({
          montant: euros(12_000), emiseLe: dateISO('2026-04-30'),
          encaisseeLe: dateISO('2026-06-05')
        })
      ]
    });

    const pied = screen.getByText(/Reste à encaisser sur les factures de ce mois/).parentElement;
    expect(pied?.textContent).toContain(eur(8_000));
    // Et l'écran explique d'où vient l'encaissé qui ne vient pas de ce mois.
    expect(screen.getByText(/règlent des factures émises plus tôt/)).toBeTruthy();
  });

  /** Un encaissement antérieur à toute émission est un acompte, et se dit. */
  it('nomme un encaissement reçu avant toute facture', () => {
    poser({
      recettes: [recette({
        montant: euros(2_000), emiseLe: null, encaisseeLe: dateISO('2026-06-03')
      })]
    });

    expect(screen.getByText(/encaissé d’avance, aucune facture émise/)).toBeTruthy();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   A4 — ce qu'on peut se verser
   ───────────────────────────────────────────────────────────────────────── */

describe('tu peux te verser', () => {
  /**
   * LA PART S'APPLIQUE AU VERSABLE, PAS AU DISPONIBLE.
   *
   * Le prototype l'applique au disponible : à 0 % il propose alors de verser le
   * seuil de sécurité avec, c'est-à-dire de vider précisément le matelas qu'on
   * s'était donné. Solde 10 000 €, seuil 4 000 €, aucune provision : le
   * versable est 6 000 € et c'est lui qu'on peut prendre en entier — pas 10 000.
   */
  it('propose le versable entier à 0 %, jamais le seuil de sécurité avec', () => {
    poser({ soldeInitial: euros(10_000), reserve: euros(4_000) });

    const grand = screen.getByText(/Montant que tu peux te verser/).parentElement;
    expect(grand?.textContent).toContain(eur(6_000));
    expect(grand?.textContent).not.toContain(eur(10_000));
  });

  it('retient la part gardée sur le versable', () => {
    poser({
      soldeInitial: euros(10_000), reserve: euros(4_000), partGardeeAuVersement: ratio(0.5)
    });

    const grand = screen.getByText(/Montant que tu peux te verser/).parentElement;
    expect(grand?.textContent).toContain(eur(3_000));
  });

  /**
   * UNE SEULE SOURCE POUR LA PART GARDÉE.
   *
   * Le même fait se règle ici et dans Config. Si le curseur gardait sa valeur
   * en local sans l'écrire, les deux écrans afficheraient deux parts
   * différentes — et la carte « Tu peux te verser » du Pilote, une troisième.
   */
  it('écrit la part dans le magasin, pas dans l’écran', () => {
    poser({ soldeInitial: euros(10_000), reserve: euros(4_000) });

    const curseur = screen.getByRole('slider', { name: /Part gardée/ });
    fireEvent.change(curseur, { target: { value: '25' } });

    expect(useFaits.getState().faits.partGardeeAuVersement).toBe(0.25);
  });

  /**
   * UN DISPONIBLE NÉGATIF NE SE RACONTE PAS COMME UNE SOUSTRACTION.
   *
   * « Sur −2 669 € de disponible, le seuil de sécurité en retient 2 470 € »
   * suggère un reste de −5 139 €, alors que le versable est zéro et que le
   * seuil n'est pas constitué. Sans cette phrase, la carte affiche « 0 € » sans
   * qu'on sache si c'est le réglage ou le compte qui l'impose.
   */
  it('dit qu’un disponible négatif est la cause, au lieu de laisser lire zéro', () => {
    // Une échéance appelée plus grosse que le solde rend le disponible négatif.
    poser({
      soldeInitial: euros(500),
      echeances: [{
        id: 'e1', nature: 'urssaf',
        montant: euros(3_000), montantPaye: euros(0),
        echeanceLe: dateISO('2026-07-05'), payeeLe: null
      }]
    });

    expect(screen.getByText(/disponible est/).textContent).toContain('négatif');
    expect(screen.queryByText(/de versable/)).toBeNull();
  });

  /**
   * LE BOUTON NE CRÉE PAS DE FAIT.
   *
   * Le virement figure déjà au relevé : le saisir une seconde fois le
   * compterait deux fois. Ce qui manque est un NOM, et il se pose au relevé.
   */
  it('renvoie au relevé au lieu d’enregistrer un versement', async () => {
    poser({ soldeInitial: euros(10_000) });

    await userEvent.setup().click(
      screen.getByRole('button', { name: /Pointer le versement au relevé/ })
    );
    expect(window.location.hash).toBe('#/achats/releve');
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   A5 — la capacité de versement
   ───────────────────────────────────────────────────────────────────────── */

describe('la capacité de versement par mois', () => {
  /**
   * LES DOUZE MOIS RESTENT, MÊME VIDES.
   *
   * Contrairement au graphe du chiffre d'affaires, celui-ci porte la projection :
   * les mois à venir ont une capacité, et c'est justement ce qu'on vient y lire.
   */
  it('porte les douze mois de l’année', () => {
    poser({ recettes: [recette({ encaisseeLe: dateISO('2026-03-10') })] });

    const carte = screen.getByRole('region', { name: /Capacité de versement/ });
    expect(within(carte).getByText('JAN')).toBeTruthy();
    expect(within(carte).getByText('DÉC')).toBeTruthy();
  });

  /**
   * UN MOIS À VENIR N'A AUCUN VERSÉ.
   *
   * `capaciteDuMois` rend `verse: null` sur un mois projeté — jamais zéro, qui
   * serait un constat. L'écran doit le dire au lieu d'annoncer « 0 € versés »,
   * qui se lirait comme une privation qu'on ne s'est pas imposée.
   */
  it('dit d’un mois à venir qu’il est à venir, sans lui prêter de versé', () => {
    poser({ recettes: [recette({ encaisseeLe: dateISO('2026-03-10') })] });

    const carte = screen.getByRole('region', { name: /Capacité de versement/ });
    expect(within(carte).getByText(/SEP/).textContent).toContain('mois à venir');
    expect(within(carte).getByText(/SEP/).textContent).not.toContain('versés');
  });

  /**
   * SANS RELEVÉ, LE VERSÉ EST INCONNU — PAS NUL.
   *
   * `remunerationDuMois` rend zéro tant qu'aucun mouvement bancaire n'est
   * importé. Des barres sans plein se liraient « je ne me suis rien versé de
   * l'année », ce qu'aucun fait ne soutient.
   */
  it('signale qu’aucun relevé n’est importé plutôt que de laisser lire zéro', () => {
    poser({ recettes: [recette({ encaisseeLe: dateISO('2026-03-10') })] });

    expect(screen.getByText(/le versé est/).textContent).toContain('inconnu');
  });
});
