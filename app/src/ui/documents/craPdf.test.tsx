/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { syntheseHebdomadaire, type JourTravaille } from '../../domain/calculs/cra';
import { dateISO, mois } from '../../domain/types';
import { entrepriseVide } from '../../state/schema';
import { relirePdf, titreDuPdf, type PdfRelu } from '../../test/lirePdf';
import { DocumentCra } from './DocumentCra';
import { FEUILLE_DOCUMENT } from './feuille';
import { modeleDuCra, type ModeleCra } from './modeleCra';
import { STYLE_CRA, pdfDuCra } from './craPdf';

afterEach(cleanup);

const CREATION = new Date(Date.UTC(2026, 10, 27, 9, 30));
const entreprise = {
  ...entrepriseVide(),
  nom: 'Atelier de démonstration', adresse: '1 rue de la Démonstration',
  codePostal: '75010', ville: 'Paris', siret: '000 000 000 00000'
};

/** Les jours ouvrés de juin 2026 pour chaque client, lieux mêlés. */
function juin(clients: readonly string[]): JourTravaille[] {
  const jours: JourTravaille[] = [];
  for (let d = 1; d <= 30; d += 1) {
    const date = dateISO(`2026-06-${String(d).padStart(2, '0')}`);
    const semaine = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (semaine === 0 || semaine === 6) continue;
    clients.forEach((client, i) => {
      if ((d + i) % 3 === 0) return;
      jours.push({
        date, client, quotite: d % 2 === 0 ? 1 : 0.5,
        lieu: d % 4 === 0 ? 'teletravail' : d % 5 === 0 ? 'sur_site' : null
      });
    });
  }
  return jours;
}

/** Ce qu'on lit, sans les espaces ni la casse que la feuille impose (`uppercase`). */
const normal = (t: string): string =>
  t.replace(/[\s  ]+/g, '').toLocaleUpperCase('fr-FR');

const estPied = (t: string): boolean => /^\d+ \/ \d+$/.test(t);

/** Les textes posés, page après page, sans le pied de chaque page. */
function textesDuPdf(relu: PdfRelu): string[][] {
  return relu.pages.map((p) => p.map((t) => t.texte).filter((t) => !estPied(t)));
}

function texteDeLApercu(modele: ModeleCra): string {
  const { container } = render(<DocumentCra modele={modele} />);
  return container.textContent ?? '';
}

/*
 * UNE SEULE SOURCE : LE FICHIER DIT CE QUE L'APERÇU MONTRE.
 *
 * Le défaut que ce test rend impossible : une phrase, une ligne ou une
 * colonne ajoutée à l'aperçu et oubliée dans le PDF (ou l'inverse). Le
 * client signerait un papier que l'utilisateur n'a pas relu.
 */
describe('le PDF du compte rendu', () => {
  it('porte les mêmes textes que l’aperçu, dans le même ordre', () => {
    // Un nom de client qui porte des parenthèses et une barre oblique
    // inverse : ce que l'écrivain échappe doit revenir intact.
    const synthese = syntheseHebdomadaire(mois('2026-06'), juin(['Dupont (SARL) \\ x', 'Zeta']));
    // Deux semaines : le document tient sur une page, sans en-tête redit.
    const deuxSemaines = { ...synthese, semaines: synthese.semaines.slice(0, 2) };
    const modele = modeleDuCra(deuxSemaines, entreprise, null, {
      '2026-06-01': 'Cadrage\net recette', '2026-06-08': 'Ateliers · rédaction'
    });
    const relu = relirePdf(pdfDuCra(modele, CREATION));
    expect(relu.pages).toHaveLength(1);

    expect(normal(textesDuPdf(relu).flat().join(''))).toBe(normal(texteDeLApercu(modele)));
  });

  // Le même contrôle quand il n'y a qu'un client et aucun lieu : les deux
  // colonnes disparaissent des deux côtés, pas d'un seul.
  it('retire les colonnes de lieu du PDF comme de l’aperçu', () => {
    const jours = juin(['Alpha']).map((j) => ({ ...j, lieu: null }));
    const modele = modeleDuCra(syntheseHebdomadaire(mois('2026-06'), jours), entreprise, 'Alpha', {});
    const relu = relirePdf(pdfDuCra(modele, CREATION));
    const textes = textesDuPdf(relu).flat();

    expect(textes).not.toContain('TÉLÉTRAV.');
    expect(normal(textes.join(''))).toBe(normal(texteDeLApercu(modele)));
  });

  /* Relu à côté de l'aperçu : le tableau des totaux n'a pas d'intitulés, sa
     première colonne vide ne prend aucune place, et les noms y partent du
     bord gauche. Le PDF les mettait en retrait, sous « Client ». */
  it('place les noms des totaux au bord gauche, comme l’aperçu', () => {
    const modele = modeleDuCra(
      syntheseHebdomadaire(mois('2026-06'), juin(['Alpha', 'Beta'])), entreprise, null, {}
    );
    const textes = relirePdf(pdfDuCra(modele, CREATION)).pages.flat();
    const bordGauche = textes.find((t) => t.texte === 'Semaine 1')?.x ?? NaN;
    const dansLesSemaines = textes.filter((t) => t.texte === 'Alpha' && t.polices[0] === 'F1');
    const dansLesTotaux = textes.filter((t) => t.texte === 'Alpha' && t.polices[0] === 'F2');

    expect(dansLesTotaux).toHaveLength(1);
    expect(dansLesTotaux[0]?.x).toBeCloseTo(bordGauche, 2);
    for (const t of dansLesSemaines) expect(t.x).toBeGreaterThan(bordGauche + 50);
  });

  it('se nomme comme le document', () => {
    const modele = modeleDuCra(
      syntheseHebdomadaire(mois('2026-06'), juin(['Client Alpha'])), entreprise, 'Client Alpha', {}
    );
    expect(titreDuPdf(relirePdf(pdfDuCra(modele, CREATION))))
      .toBe('Compte-rendu d’activité — juin 2026 — Client Alpha');
  });

  /*
   * UN MOIS DE CINQ SEMAINES, TROIS CLIENTS : DEUX PAGES.
   *
   * Juin 2026 commence un lundi et en compte cinq. Le document tous clients,
   * avec ses phrases de tâches, dépasse la page : la seconde doit redire les
   * colonnes, rien ne doit tomber dans le pied, et la numérotation doit dire
   * combien il y en a.
   */
  it('passe à la page suivante en redisant les colonnes, sans rien perdre', () => {
    const taches: Record<string, string> = {};
    for (const lundi of ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29']) {
      taches[lundi] = 'Ateliers de cadrage avec les équipes, rédaction de la note de synthèse, '
        + 'recette des écrans livrés et reprise des retours du comité';
    }
    const modele = modeleDuCra(
      syntheseHebdomadaire(mois('2026-06'), juin(['Alpha', 'Beta', 'Gamma'])), entreprise, null, taches
    );
    expect(modele.semaines).toHaveLength(5);
    const pdf = pdfDuCra(modele, CREATION);
    const relu = relirePdf(pdf);
    const pages = textesDuPdf(relu);

    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(relu.pages.map((p) => p[p.length - 1]?.texte))
      .toEqual(pages.map((_, i) => `${i + 1} / ${pages.length}`));

    const colonnes = ['SEMAINE', 'CLIENT', 'TÉLÉTRAV.', 'SUR SITE', 'TOTAL'];
    expect(pages[1]?.slice(0, 5)).toEqual(colonnes);

    // Rien sous la marge basse, hors le numéro de page.
    for (const page of relu.pages) {
      for (const t of page) if (!estPied(t.texte)) expect(t.y).toBeLessThanOrEqual(841.89 - 56);
    }

    // Une fois les en-têtes redits retirés, le texte est celui de l'aperçu :
    // le saut de page n'a rien perdu ni rien doublé.
    const sansRepetition = pages.map((p, i) => {
      if (i === 0) return p;
      const titreTotaux = 'TOTAUX DU MOIS PAR CLIENT';
      if (p.slice(0, 5).join('|') === colonnes.join('|')) return p.slice(5);
      return p[0] === titreTotaux ? p.slice(1) : p;
    });
    expect(normal(sansRepetition.flat().join(''))).toBe(normal(texteDeLApercu(modele)));
  });
});

/*
 * LES TOTAUX COUPÉS REDISENT LEUR TITRE.
 *
 * Vu sur la démonstration, tous clients, juin : la dernière ligne de totaux
 * passait seule en page 2, sans titre — un « 10,5 j » qu'on lirait comme une
 * semaine de plus. Vingt clients sur une semaine : le tableau des semaines
 * tient sur la première page, celui des totaux déborde.
 */
it('redit le titre des totaux quand leur tableau passe à la page suivante', () => {
  const clients = Array.from({ length: 20 }, (_, i) => `Client ${String(i + 1).padStart(2, '0')}`);
  const jours: JourTravaille[] = clients.map((client) => ({
    date: dateISO('2026-06-02'), client, quotite: 1, lieu: 'sur_site'
  }));
  const modele = modeleDuCra(syntheseHebdomadaire(mois('2026-06'), jours), entreprise, null, {});
  const pages = textesDuPdf(relirePdf(pdfDuCra(modele, CREATION)));

  expect(pages).toHaveLength(2);
  expect(pages[0]).toContain('TOTAUX DU MOIS PAR CLIENT');
  expect(pages[1]?.[0]).toBe('TOTAUX DU MOIS PAR CLIENT');
  expect(normal([...(pages[0] ?? []), ...(pages[1] ?? []).slice(1)].join('')))
    .toBe(normal(texteDeLApercu(modele)));
});

/** La valeur d'une propriété pour un sélecteur exact de la feuille. */
function declaration(selecteur: string, propriete: string): string | undefined {
  let valeur: string | undefined;
  for (const [, selecteurs, corps] of FEUILLE_DOCUMENT.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const noms = (selecteurs as string).replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((s) => s.trim());
    if (!noms.includes(selecteur)) continue;
    for (const d of (corps as string).split(';')) {
      const [p, ...v] = d.split(':');
      if (p?.trim() === propriete) valeur = v.join(':').trim();
    }
  }
  return valeur;
}

/*
 * LES MESURES DU PDF SONT CELLES DE LA FEUILLE.
 *
 * Le PDF ne peut pas lire une feuille CSS ; il en recopie les valeurs. Une
 * recopie diverge à la première retouche — un gris éclairci à l'écran, une
 * taille grossie, et le fichier envoyé ne ressemble plus à l'aperçu relu.
 * Chaque valeur de `STYLE_CRA` est donc relue ici dans `FEUILLE_DOCUMENT`.
 */
describe('les mesures du PDF', () => {
  const S = STYLE_CRA;
  const attendu: readonly (readonly [string, string, string])[] = [
    ['.doc', 'color', S.encre],
    ['.doc', 'line-height', String(S.interligne)],
    ['.doc-marque', 'font-size', `${S.marque.taille}px`],
    ['.doc-marque', 'letter-spacing', `${S.marque.espacement}em`],
    ['.doc-marque em', 'color', S.accent],
    ['.doc-emetteur', 'font-size', `${S.emetteur.taille}px`],
    ['.doc-emetteur', 'color', S.gris],
    ['.doc-emetteur', 'line-height', String(S.emetteur.interligne)],
    ['.doc-emetteur', 'margin-top', `${S.emetteur.margeHaut}px`],
    ['.doc-titre h1', 'font-size', `${S.titre.taille}px`],
    ['.doc-titre h1', 'letter-spacing', `${S.titre.espacement}em`],
    ['.doc-periode', 'font-size', `${S.periode.taille}px`],
    ['.doc-periode', 'color', S.accent],
    ['.doc-periode', 'margin-top', `${S.periode.margeHaut}px`],
    ['.doc-destinataire', 'font-size', `${S.destinataire.taille}px`],
    ['.doc-destinataire', 'color', S.gris],
    ['.doc-destinataire', 'line-height', String(S.destinataire.interligne)],
    ['.doc-destinataire', 'margin-top', `${S.destinataire.margeHaut}px`],
    ['.doc-entete', 'padding-bottom', `${S.entete.basDeBloc}px`],
    ['.doc-entete', 'border-bottom', `${S.entete.filet}px solid ${S.encre}`],
    ['.doc-table', 'margin-top', `${S.tableau.margeHaut}px`],
    ['.doc-table th', 'font-size', `${S.intitules.taille}px`],
    ['.doc-table th', 'letter-spacing', `${S.intitules.espacement}em`],
    ['.doc-table th', 'color', S.encre],
    ['.doc-table th', 'padding', `0 0 ${S.intitules.bas}px`],
    ['.doc-table th', 'border-bottom', `${S.intitules.filet}px solid ${S.encre}`],
    ['.doc-table td', 'font-size', `${S.cellule.taille}px`],
    ['.doc-table td', 'padding', `${S.cellule.vertical}px 0`],
    ['.doc-table td', 'border-bottom', `1px solid ${S.filetLigne}`],
    ['.doc-semaine td', 'background', S.fond],
    ['.doc-semaine td', 'color', S.encre],
    ['.doc-semaine td', 'padding', `${S.semaine.vertical}px ${S.semaine.horizontal}px`],
    ['.doc-semaine td', 'border-bottom', `1px solid ${S.filetSemaine}`],
    ['.doc-taches td', 'font-size', `${S.taches.taille}px`],
    ['.doc-taches td', 'color', S.gris],
    ['.doc-taches td', 'padding', `${S.taches.haut}px 0 ${S.taches.bas}px ${S.taches.retrait}px`],
    ['.doc-sansLieu', 'color', S.grisClair],
    ['.doc-sousTitre', 'font-size', `${S.sousTitre.taille}px`],
    ['.doc-sousTitre', 'letter-spacing', `${S.sousTitre.espacement}em`],
    ['.doc-sousTitre', 'color', S.grisClair],
    ['.doc-sousTitre', 'margin', `${S.sousTitre.margeHaut}px 0 2px`],
    ['.doc-total td', 'font-size', `${S.total.taille}px`],
    ['.doc-total td', 'padding-top', `${S.total.haut}px`],
    ['.doc-total td', 'border-top', `1.5px solid ${S.encre}`],
    ['.doc-note', 'margin-top', `${S.note.margeHaut}px`],
    ['.doc-note', 'padding', `${S.note.vertical}px ${S.note.horizontal}px`],
    ['.doc-note', 'border-radius', `${S.note.rayon}px`],
    ['.doc-note', 'background', S.fond],
    ['.doc-note', 'font-size', `${S.note.taille}px`],
    ['.doc-note', 'color', S.gris],
    ['.doc-note', 'line-height', String(S.note.interligne)],
    ['.doc-signatures', 'gap', `${S.signatures.ecart}px`],
    ['.doc-signatures', 'margin-top', `${S.signatures.margeHaut}px`],
    ['.doc-signature', 'font-size', `${S.signatures.taille}px`],
    ['.doc-signature', 'color', S.grisClair],
    ['.doc-signature span', 'height', `${S.signatures.cadre}px`],
    ['.doc-signature span', 'margin-top', `${S.signatures.espaceCadre}px`],
    ['.doc-signature span', 'border', `1px dashed ${S.pointille}`],
    ['.doc-signature span', 'border-radius', `${S.signatures.rayon}px`]
  ];

  it.each(attendu)('%s { %s } est celle du PDF', (selecteur, propriete, valeur) => {
    expect(declaration(selecteur, propriete)).toBe(valeur);
  });
});
