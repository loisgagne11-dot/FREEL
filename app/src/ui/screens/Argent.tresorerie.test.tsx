/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { dateISO, euros } from '../../domain/types';
import { type Faits, faitsVides } from '../../state/schema';
import { etatArgent } from '../../state/selecteurs.argent';
import { useFaits } from '../../state/store';
import { eur } from '../format';
import { Tresorerie } from './Argent.tresorerie';

afterEach(() => { cleanup(); vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-10T09:00:00Z'));
  useFaits.setState({ faits: faitsVides() });
});

/**
 * La phrase de répartition, prise sur son paragraphe entier.
 *
 * Elle porte des montants en `<strong>` : `getByText` sur une expression
 * régulière ne la trouve pas, parce que le texte est coupé entre plusieurs
 * éléments. C'est le paragraphe qu'on veut, pas un de ses morceaux.
 */
function phraseDeRepartition(): HTMLElement {
  return screen.getByText(
    (_, element) => element?.tagName === 'P'
      && (element.textContent ?? '').startsWith('Sur les')
  );
}

function poser(m: Partial<Faits> = {}): void {
  const faits = { ...faitsVides(), ...m } as Faits;
  useFaits.setState({ faits });
  render(<Tresorerie etat={etatArgent(faits)} />);
}

/** Une échéance appelée, non payée : elle crée de la provision. */
const echeance = (montant: number) => ({
  id: 'e1', nature: 'urssaf' as const,
  montant: euros(montant), montantPaye: euros(0),
  echeanceLe: dateISO('2026-07-05'), payeeLe: null
});

/* ─────────────────────────────────────────────────────────────────────────
   B1 — les quatre tuiles
   ───────────────────────────────────────────────────────────────────────── */

describe('les quatre tuiles de trésorerie', () => {
  /**
   * CHAQUE TUILE DIT SON ASSIETTE.
   *
   * « 8 120 € » ne dit pas à quelle date, « 4 940 € » ne dit pas ce qui en a
   * été retiré. Sans ces lignes, quatre nombres alignés se comparent entre eux
   * alors qu'ils ne mesurent pas la même chose.
   */
  it('met sous chaque montant ce qu’il recouvre', () => {
    poser({ soldeInitial: euros(10_000), besoinMensuel: euros(2_000) });

    // Deux fois à l'écran, et c'est ce que fait le dessin : sous la tuile
    // Disponible, et au centre de l'anneau. La même phrase pour le même nombre.
    expect(screen.getAllByText('à toi, hors provisions').length).toBeGreaterThan(0);
    expect(screen.getByText('ton versable, à ton train de vie')).toBeTruthy();
  });

  /**
   * LE SOLDE DIT S'IL EST SUIVI OU SEULEMENT SAISI.
   *
   * Sans relevé importé, le solde est un chiffre qu'on a tapé une fois et qui
   * ne bouge plus. Le dater « au 10 juin » laisserait croire à un rapprochement
   * bancaire qui n'a pas eu lieu.
   */
  it('avoue qu’aucun relevé n’est importé au lieu de dater le solde', () => {
    poser({ soldeInitial: euros(10_000) });

    const tuile = screen.getByText('Solde du compte').parentElement;
    expect(tuile?.textContent).toContain('saisi, aucun relevé importé');
  });

  /**
   * L'AUTONOMIE S'ABSTIENT PLUTÔT QUE D'AFFICHER ZÉRO.
   *
   * Sans besoin mensuel saisi, la division n'a pas de sens. L'ancienne
   * application affichait dans ce cas une autonomie qui bondissait sans cause :
   * au 1ᵉʳ janvier, les dépenses de l'année tombant à zéro, elle passait de 5,3
   * à 9,3 mois.
   */
  it('refuse de chiffrer l’autonomie sans besoin mensuel', () => {
    poser({ soldeInitial: euros(10_000) });

    const tuile = screen.getByText('Autonomie').parentElement;
    expect(tuile?.textContent).toContain('besoin mensuel non renseigné');
    expect(tuile?.textContent).not.toContain('0 mois');
  });

  it('chiffre l’autonomie dès que le besoin mensuel est saisi', () => {
    poser({ soldeInitial: euros(10_000), besoinMensuel: euros(2_000) });

    const tuile = screen.getByText('Autonomie').parentElement;
    expect(tuile?.textContent).toContain('5 mois');
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   B3 — la répartition du solde
   ───────────────────────────────────────────────────────────────────────── */

describe('la répartition du solde', () => {
  it('nomme les trois parts du dessin', () => {
    poser({ soldeInitial: euros(10_000), reserve: euros(3_000) });

    expect(screen.getByText('Provisions dues')).toBeTruthy();
    expect(screen.getByText('Seuil de sécurité')).toBeTruthy();
    expect(screen.getByText('À te verser')).toBeTruthy();
  });

  /**
   * LE SEUIL N'EST CONSTITUÉ QU'À HAUTEUR DE CE QUI RESTE.
   *
   * Solde 5 000 €, provisions 4 000 €, seuil voulu 3 000 € : il ne reste que
   * 1 000 € de disponible, donc 1 000 € de seuil réellement constitué.
   * L'afficher plein ferait croire à un matelas qui n'existe pas — et c'est
   * précisément sur ce matelas qu'on se croit couvert.
   */
  it('borne le seuil de sécurité à ce que le disponible permet', () => {
    poser({
      soldeInitial: euros(5_000), reserve: euros(3_000), echeances: [echeance(4_000)]
    });

    const ligne = screen.getByText('Seuil de sécurité').parentElement;
    expect(ligne?.textContent).toContain(eur(1_000));
    expect(ligne?.textContent).not.toContain(eur(3_000));
  });

  /**
   * DEUX MONTANTS POUR LA MÊME NOTION SUR LE MÊME ÉCRAN.
   *
   * L'anneau découpe le solde : la part de provisions y est plafonnée à ce que
   * le compte contient. Sur un compte qui doit 4 000 € et n'en porte que 3 000,
   * la légende annonçait « Provisions dues : 3 000 € » — au-dessus d'une carte
   * qui en compte 4 000. Le montant reste borné, c'est le NOM qui dit ce qu'on
   * regarde.
   */
  it('dit que les provisions affichées sont celles que le solde couvre', () => {
    poser({ soldeInitial: euros(3_000), echeances: [echeance(4_000)] });

    expect(screen.getByText('Provisions couvertes par le solde')).toBeTruthy();
    expect(screen.queryByText('Provisions dues')).toBeNull();
  });

  /**
   * LE CENTRE DE L'ANNEAU ET LA PHRASE DISENT LE MÊME NOMBRE.
   *
   * Le centre porte le disponible tel qu'il est, négatif compris. La phrase
   * bornait de son côté à zéro et écrivait « 0 € sont à toi » : sur la même
   * carte, à trois centimètres l'une de l'autre, deux réponses à la même
   * question.
   */
  it('explique un disponible négatif au lieu de le borner à zéro', () => {
    poser({ soldeInitial: euros(3_000), echeances: [echeance(4_000)] });

    const phrase = phraseDeRepartition();
    expect(phrase.textContent).toContain('rien n’est à toi');
    expect(phrase.textContent).toContain(eur(1_000));
    expect(phrase.textContent).not.toContain('0 € sont à toi');
  });

  /**
   * LE MANQUE N'EST PAS UNE PART.
   *
   * L'anneau n'exprime que des parts d'un tout ; ce qui dépasse le tout ne s'y
   * dessine pas. Il est donc dit — et ce n'est pas une nuance d'affichage :
   * l'argent des cotisations a déjà été dépensé.
   */
  it('dit ce qui manque quand les provisions dépassent le solde', () => {
    poser({ soldeInitial: euros(3_000), echeances: [echeance(4_000)] });

    expect(screen.getByText(/Il manque/).textContent).toContain(eur(1_000));
  });

  it('détaille les deux composantes du disponible quand il est positif', () => {
    poser({ soldeInitial: euros(10_000), reserve: euros(3_000) });

    const phrase = phraseDeRepartition();
    expect(phrase.textContent).toContain('de seuil gardé');
    expect(phrase.textContent).toContain('que tu peux te verser');
  });

  /**
   * L'ANNEAU EST UNE IMAGE, LA LÉGENDE EST LA DONNÉE.
   *
   * Sous quelques pourcents, un segment fait deux pixels sur un téléphone. Le
   * tracé est masqué aux technologies d'assistance ; chaque part porte son
   * montant en toutes lettres.
   */
  it('garde le tracé hors de la lecture d’écran', () => {
    poser({ soldeInitial: euros(10_000), reserve: euros(3_000) });

    const ligne = screen.getByText('À te verser').parentElement;
    expect(ligne?.textContent).toContain(eur(7_000));
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   B2 — l'évolution du compte
   ───────────────────────────────────────────────────────────────────────── */

describe('l’évolution du compte', () => {
  /**
   * LA COURBE EST LE DISPONIBLE, ET LE TITRE DOIT LE DIRE.
   *
   * Le dessin trace un solde. Projeter le solde obligerait à deviner quand
   * chaque dette sortira du compte, et la moitié n'a pas de date. Un titre qui
   * dirait « solde » sur une courbe de disponible serait conforme au dessin et
   * faux — le pire des deux mondes.
   */
  it('annonce une courbe de disponible, pas de solde', () => {
    poser({ soldeInitial: euros(10_000) });

    // Le titre VISIBLE, et non son info : celle-ci explique justement pourquoi
    // ce n'est pas le solde, donc elle contient le mot.
    expect(screen.getByText(/Évolution du compte — entrées, sorties/).textContent)
      .toContain('disponible');
  });

  /**
   * DOUZE MOIS GLISSANTS, PAS « JUSQU'À DÉCEMBRE ».
   *
   * La référence s'arrête à décembre parce qu'elle est dessinée en juin. La
   * même règle en novembre laisserait deux colonnes.
   */
  it('projette douze mois à partir du mois courant', () => {
    poser({ soldeInitial: euros(10_000) });

    const carte = screen.getByText(/Évolution du compte/).closest('section');
    const dans = within(carte as HTMLElement);
    // Juin 2026 → mai 2027 : le mois courant en tête, et le même douze mois plus tard.
    expect(dans.getAllByText('JUIN').length).toBeGreaterThan(0);
    expect(dans.getAllByText('MAI').length).toBeGreaterThan(0);
    expect(dans.getByText(/projeté dans douze mois/)).toBeTruthy();
  });

  /**
   * LE SEUIL NE SE TRACE QUE S'IL EXISTE.
   *
   * Une ligne de plancher à zéro serait un repère qu'on n'a jamais posé, et
   * elle se confondrait avec l'axe.
   */
  it('ne trace aucun seuil tant qu’aucun n’est réglé', () => {
    poser({ soldeInitial: euros(10_000) });

    const carte = screen.getByText(/Évolution du compte/).closest('section');
    expect(within(carte as HTMLElement).queryByText(/^seuil/)).toBeNull();
  });

  it('trace le seuil de sécurité dès qu’il est réglé', () => {
    poser({ soldeInitial: euros(10_000), reserve: euros(4_000) });

    const carte = screen.getByText(/Évolution du compte/).closest('section');
    const dans = within(carte as HTMLElement);
    expect(dans.getByText(/^seuil/).textContent).toContain(eur(4_000));
  });

  /**
   * LE NET SOUS CHAQUE MOIS.
   *
   * C'est lui qui explique la pente du segment au-dessus. Sans lui, deux barres
   * imposent la soustraction de tête, douze fois de suite.
   */
  it('écrit le net de chaque mois sous son libellé', () => {
    poser({ soldeInitial: euros(10_000), besoinMensuel: euros(1_000) });

    const carte = screen.getByText(/Évolution du compte/).closest('section');
    // Le signe est porté par le net, jamais par les barres seules.
    expect(within(carte as HTMLElement).getAllByText(/^[+−]/).length).toBeGreaterThan(0);
  });
});
