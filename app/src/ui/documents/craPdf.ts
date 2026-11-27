import {
  DocumentPdf, FilPdf, couperEnLignes, couperParagraphe, largeurTexte,
  type Fragment, type Police
} from '../../infra/pdf';
import type { LigneVolumeCra, ModeleCra } from './modeleCra';

/**
 * Le compte rendu d'activité en PDF, dessiné d'après l'aperçu.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE MÊME PAPIER QUE L'APERÇU, PAS UN SECOND DOCUMENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'utilisateur relit l'aperçu, puis envoie le fichier. Si le fichier
 * disait autre chose — une ligne en moins, un total arrondi autrement —, le
 * client signerait un papier que personne n'a relu. Ce module ne décide donc
 * d'AUCUN texte : il place celui de `modeleDuCra`, que l'aperçu affiche, et
 * dans le même ordre (un test compare les deux, texte à texte).
 *
 * Les mesures sont celles de la feuille (`documents/feuille.ts`), en px CSS,
 * converties comme le fait l'impression du navigateur : 96 px pour 72 pt.
 * `STYLE_CRA` les nomme une à une, et un test les relit dans la feuille : un
 * gris ou une taille retouchés d'un seul côté le font échouer.
 *
 * Chargé au clic sur « Télécharger le PDF » : ni ce module ni l'écrivain
 * n'ont leur place dans le paquet de l'écran, qu'on ouvre pour relire.
 */

const PX = 0.75;
const px = (n: number): number => n * PX;

/** Les marges de la page, en points : environ 15 mm sur les côtés. */
const MARGE = { gauche: 42, droite: 42, haut: 40, bas: 56 } as const;

/**
 * Ce que le PDF reprend de la feuille du document, en px CSS.
 *
 * Exporté pour le test qui relit `FEUILLE_DOCUMENT` : chaque valeur ici a
 * son sélecteur là-bas.
 */
export const STYLE_CRA = {
  encre: '#1d1d1b',
  gris: '#6a6a66',
  grisClair: '#8a8a85',
  accent: '#1f8b58',
  fond: '#f6f6f2',
  filetSemaine: '#e2e2dc',
  filetLigne: '#ececec',
  pointille: '#c8c8c0',
  interligne: 1.5,
  marque: { taille: 19, espacement: -0.02 },
  emetteur: { taille: 10.5, interligne: 1.55, margeHaut: 5 },
  titre: { taille: 14, espacement: 0.06 },
  periode: { taille: 12.5, margeHaut: 3 },
  destinataire: { taille: 10.5, interligne: 1.55, margeHaut: 5 },
  entete: { basDeBloc: 18, filet: 1.5 },
  tableau: { margeHaut: 16 },
  intitules: { taille: 10, espacement: 0.05, bas: 7, filet: 1.5 },
  cellule: { taille: 11.5, vertical: 6 },
  semaine: { vertical: 7, horizontal: 6 },
  taches: { taille: 10.5, haut: 3, bas: 9, retrait: 14 },
  sousTitre: { taille: 10, espacement: 0.06, margeHaut: 20 },
  total: { taille: 12.5, haut: 10 },
  note: { taille: 10.5, interligne: 1.6, margeHaut: 16, vertical: 9, horizontal: 11, rayon: 6 },
  signatures: { margeHaut: 32, ecart: 30, taille: 10.5, cadre: 52, espaceCadre: 6, rayon: 6 }
} as const;

const S = STYLE_CRA;

/*
 * Les colonnes, en fraction de la largeur utile. Le navigateur les répartit
 * selon le contenu ; le PDF a besoin d'un gabarit fixe — celui que l'aperçu
 * donne à un mois ordinaire (relevé sur la capture du jeu de démonstration).
 */
const DEBUT_CLIENT = 0.17;
const BORDS_NOMBRES_AVEC_LIEU = [0.59, 0.72, 1] as const;
/** Jusqu'où un nom de client peut s'étendre avant de passer à la ligne. */
const FIN_CLIENT = { avecLieu: 0.46, sansLieu: 0.78 } as const;

/**
 * La ligne de base d'un texte dans sa boîte de ligne CSS : la moitié de la
 * boîte, plus ce que la police place sous l'axe. 0,35 em est la position
 * qu'Arial et ses voisines prennent dans un navigateur ; Helvetica s'y pose
 * au même endroit à l'œil.
 */
const base = (haut: number, hauteurLigne: number, taille: number): number =>
  haut + hauteurLigne / 2 + 0.35 * taille;

const majuscules = (t: string): string => t.toLocaleUpperCase('fr-FR');

interface Contexte {
  readonly pdf: DocumentPdf;
  readonly fil: FilPdf;
  /** Le bord gauche et la largeur utile, en points. */
  readonly x: number;
  readonly l: number;
  readonly modele: ModeleCra;
}

/** Une ligne de fragments, chacun dans sa police et sa couleur, l'un après l'autre. */
function ligneMelee(
  c: Contexte, x: number, y: number, fragments: readonly Fragment[], taille: number,
  couleur: (p: Police) => string, espacement = 0
): void {
  let curseur = x;
  for (const f of fragments) {
    c.pdf.texte(curseur, y, f.texte, { police: f.police, taille, couleur: couleur(f.police), espacement });
    curseur += largeurTexte(f.texte, f.police, taille, espacement);
  }
}

function enTete(c: Contexte): void {
  const { pdf, fil, x, l, modele } = c;
  const haut = fil.y;
  const ecart = px(24);
  const largeurGauche = l * 0.56 - ecart / 2;
  const largeurDroite = l * 0.44 - ecart / 2;
  const droite = x + l;

  // À gauche : la marque, puis l'émetteur. Un paragraphe porte une marge
  // d'un em au-dessus et au-dessous (la feuille ne la retire pas) ; entre
  // deux paragraphes, la plus grande des deux l'emporte.
  const tailleMarque = px(S.marque.taille);
  const ligneMarque = tailleMarque * S.interligne;
  let y = haut + tailleMarque;
  const fragmentsMarque: Fragment[] = [
    { texte: modele.marque.debut, police: 'gras' },
    ...(modele.marque.fin === null ? [] : [
      { texte: ' ', police: 'gras' as const },
      { texte: modele.marque.fin, police: 'italique' as const }
    ])
  ];
  const lignesMarque = couperParagraphe(fragmentsMarque, tailleMarque, largeurGauche);
  lignesMarque.forEach((ligne, i) => {
    ligneMelee(
      c, x, base(y + i * ligneMarque, ligneMarque, tailleMarque), ligne, tailleMarque,
      (p) => (p === 'italique' ? S.accent : S.encre), S.marque.espacement
    );
  });
  y += Math.max(1, lignesMarque.length) * ligneMarque;
  y += Math.max(tailleMarque, px(S.emetteur.margeHaut));

  const tailleEmetteur = px(S.emetteur.taille);
  const ligneEmetteur = tailleEmetteur * S.emetteur.interligne;
  for (const texte of modele.emetteur) {
    const lignes = couperEnLignes(texte, 'normal', tailleEmetteur, largeurGauche);
    // Une ligne vide garde sa hauteur : l'aperçu la rend, le papier aussi.
    for (const ligne of lignes.length === 0 ? [''] : lignes) {
      pdf.texte(x, base(y, ligneEmetteur, tailleEmetteur), ligne, { taille: tailleEmetteur, couleur: S.gris });
      y += ligneEmetteur;
    }
  }
  const basGauche = y + tailleEmetteur;

  // À droite : l'intitulé, la période, la synthèse et le destinataire.
  const tailleTitre = px(S.titre.taille);
  let yd = haut;
  pdf.texte(droite, base(yd, tailleTitre * S.interligne, tailleTitre), majuscules(modele.intitule), {
    police: 'gras', taille: tailleTitre, couleur: S.encre, espacement: S.titre.espacement
  }, 'droite');
  yd += tailleTitre * S.interligne + px(S.periode.margeHaut);

  const taillePeriode = px(S.periode.taille);
  pdf.texte(droite, base(yd, taillePeriode * S.interligne, taillePeriode), modele.periode, {
    police: 'gras', taille: taillePeriode, couleur: S.accent
  }, 'droite');
  yd += taillePeriode * S.interligne + Math.max(taillePeriode, px(S.destinataire.margeHaut));

  const tailleDest = px(S.destinataire.taille);
  const ligneDest = tailleDest * S.destinataire.interligne;
  const lignesDest = [
    ...couperEnLignes(modele.sousTitre, 'normal', tailleDest, largeurDroite),
    ...couperEnLignes(modele.destinataire, 'normal', tailleDest, largeurDroite)
  ];
  for (const ligne of lignesDest) {
    pdf.texte(droite, base(yd, ligneDest, tailleDest), ligne, { taille: tailleDest, couleur: S.gris }, 'droite');
    yd += ligneDest;
  }
  const basDroite = yd + tailleDest;

  fil.y = Math.max(basGauche, basDroite) + px(S.entete.basDeBloc);
  const filet = px(S.entete.filet);
  pdf.filet(x, fil.y + filet / 2, droite, fil.y + filet / 2, { epaisseur: filet, couleur: S.encre });
  fil.y += filet;
}

/** Le bord de chaque colonne : à gauche pour un texte, à droite pour un nombre. */
function bords(c: Contexte): number[] {
  const nombres = c.modele.lieuConnu ? BORDS_NOMBRES_AVEC_LIEU : [1];
  return [0, DEBUT_CLIENT, ...nombres].map((f) => c.x + f * c.l);
}

function intitules(c: Contexte): void {
  const { pdf, fil, x, l, modele } = c;
  const taille = px(S.intitules.taille);
  const ligne = taille * S.interligne;
  const b = bords(c);
  modele.colonnes.forEach((col, i) => {
    pdf.texte(b[i] as number, base(fil.y, ligne, taille), majuscules(col.intitule), {
      police: 'gras', taille, couleur: S.encre, espacement: S.intitules.espacement
    }, col.nombre ? 'droite' : 'gauche');
  });
  const filet = px(S.intitules.filet);
  const y = fil.y + ligne + px(S.intitules.bas);
  pdf.filet(x, y + filet / 2, x + l, y + filet / 2, { epaisseur: filet, couleur: S.encre });
  fil.y = y + filet;
}

const tailleCellule = px(S.cellule.taille);
const ligneCellule = tailleCellule * S.interligne;

/**
 * Une ligne de volume : sa hauteur d'abord (pour réserver la place), puis son
 * dessin.
 *
 * Dans les totaux par client (`decale` faux), le nom part du bord gauche :
 * c'est ce que montre l'aperçu, où ce tableau-là n'a pas d'intitulés et où
 * sa première colonne, vide, ne prend aucune place. Les chiffres, eux,
 * restent sur la grille du tableau des semaines — voir la liste de sortie.
 */
function ligneVolume(c: Contexte, v: LigneVolumeCra, decale: boolean): { hauteur: number; dessiner: () => void } {
  const { pdf, fil, x, l, modele } = c;
  const b = bords(c);
  const policeClient: Police = decale ? 'normal' : 'gras';
  const xClient = decale ? (b[1] as number) : x;
  const finClient = x + (modele.lieuConnu ? FIN_CLIENT.avecLieu : FIN_CLIENT.sansLieu) * l;
  const lignesClient = couperEnLignes(v.client, policeClient, tailleCellule, finClient - xClient);
  const n = Math.max(lignesClient.length, v.sansLieu === null ? 1 : 2);
  const hauteur = 2 * px(S.cellule.vertical) + n * ligneCellule + px(1);

  return {
    hauteur,
    dessiner: () => {
      const haut = fil.y + px(S.cellule.vertical);
      const y0 = base(haut, ligneCellule, tailleCellule);
      lignesClient.forEach((t, i) => {
        pdf.texte(xClient, y0 + i * ligneCellule, t, { police: policeClient, taille: tailleCellule, couleur: S.encre });
      });
      if (v.teletravail !== null) {
        pdf.texte(b[2] as number, y0, v.teletravail, { taille: tailleCellule, couleur: S.encre }, 'droite');
      }
      if (v.surSite !== null) {
        pdf.texte(b[3] as number, y0, v.surSite, { taille: tailleCellule, couleur: S.encre }, 'droite');
      }
      pdf.texte(x + l, y0, v.total, { police: 'gras', taille: tailleCellule, couleur: S.encre }, 'droite');
      if (v.sansLieu !== null) {
        pdf.texte(x + l, y0 + ligneCellule, v.sansLieu, {
          police: 'grasItalique', taille: tailleCellule, couleur: S.grisClair
        }, 'droite');
      }
      const bas = fil.y + hauteur - px(1) / 2;
      pdf.filet(x, bas, x + l, bas, { epaisseur: px(1), couleur: S.filetLigne });
      fil.y += hauteur;
    }
  };
}

function tableau(c: Contexte): void {
  const { pdf, fil, x, l, modele } = c;
  fil.y += px(S.tableau.margeHaut);
  intitules(c);
  // Une page qui s'ouvre au milieu du tableau en redit les colonnes.
  fil.enTete = () => intitules(c);

  const hauteurSemaine = 2 * px(S.semaine.vertical) + ligneCellule + px(1);
  const b = bords(c);

  for (const s of modele.semaines) {
    const volumes = s.volumes.map((v) => ligneVolume(c, v, true));
    // Une ligne de semaine ne reste pas seule en bas de page : elle part
    // avec son premier client.
    fil.reserver(hauteurSemaine + (volumes[0]?.hauteur ?? 0));
    const haut = fil.y;
    pdf.aplat(x, haut, l, hauteurSemaine - px(1), S.fond);
    const y = base(haut + px(S.semaine.vertical), ligneCellule, tailleCellule);
    const style = { police: 'gras' as const, taille: tailleCellule, couleur: S.encre };
    pdf.texte(x, y, s.libelle, style);
    pdf.texte((b[1] as number) + px(S.semaine.horizontal), y, s.plage, style);
    pdf.texte(x + l, y, s.total, style, 'droite');
    const bas = haut + hauteurSemaine - px(1) / 2;
    pdf.filet(x, bas, x + l, bas, { epaisseur: px(1), couleur: S.filetSemaine });
    fil.y = haut + hauteurSemaine;

    for (const v of volumes) {
      fil.reserver(v.hauteur);
      v.dessiner();
    }

    if (s.taches !== null) {
      const taille = px(S.taches.taille);
      const ligne = taille * S.interligne;
      const retrait = px(S.taches.retrait);
      const lignes = couperEnLignes(s.taches, 'italique', taille, l - retrait);
      const hauteur = px(S.taches.haut) + lignes.length * ligne + px(S.taches.bas) + px(1);
      fil.reserver(hauteur);
      lignes.forEach((t, i) => {
        pdf.texte(x + retrait, base(fil.y + px(S.taches.haut) + i * ligne, ligne, taille), t, {
          police: 'italique', taille, couleur: S.gris
        });
      });
      const basTaches = fil.y + hauteur - px(1) / 2;
      pdf.filet(x, basTaches, x + l, basTaches, { epaisseur: px(1), couleur: S.filetLigne });
      fil.y += hauteur;
    }
  }
  fil.enTete = null;
}

function totauxParClient(c: Contexte): void {
  const { pdf, fil, x, modele } = c;
  if (modele.totaux === null) return;
  const taille = px(S.sousTitre.taille);
  const ligne = taille * S.interligne;
  const lignes = modele.totaux.lignes.map((v) => ligneVolume(c, v, false));

  const titre = (): void => {
    pdf.texte(x, base(fil.y, ligne, taille), majuscules(modele.totaux?.titre ?? ''), {
      police: 'gras', taille, couleur: S.grisClair, espacement: S.sousTitre.espacement
    });
    fil.y += ligne + px(S.tableau.margeHaut);
  };

  fil.y += px(S.sousTitre.margeHaut);
  // Le titre ne reste pas seul en bas de page.
  fil.reserver(ligne + px(S.tableau.margeHaut) + (lignes[0]?.hauteur ?? 0));
  titre();
  // Ce tableau-là n'a pas de colonnes nommées : c'est son titre qui se
  // redit, sans quoi la page suivante s'ouvrirait sur un « 10,5 j » orphelin
  // qu'on lirait comme une semaine de plus. Vu sur la démonstration, tous
  // clients, juin : la dernière ligne de totaux passait seule en page 2.
  fil.enTete = titre;
  for (const v of lignes) {
    fil.reserver(v.hauteur);
    v.dessiner();
  }
  fil.enTete = null;
}

function grandTotal(c: Contexte): void {
  const { pdf, fil, x, l, modele } = c;
  const taille = px(S.total.taille);
  const ligne = taille * S.interligne;
  const filet = px(1.5);
  const hauteur = filet + px(S.total.haut) + ligne + px(S.cellule.vertical);

  fil.y += px(S.tableau.margeHaut);
  fil.reserver(hauteur);
  pdf.filet(x, fil.y + filet / 2, x + l, fil.y + filet / 2, { epaisseur: filet, couleur: S.encre });
  const y = base(fil.y + filet + px(S.total.haut), ligne, taille);
  const style = { police: 'gras' as const, taille, couleur: S.encre };
  pdf.texte(x, y, modele.grandTotal.libelle, style);
  pdf.texte(x + l, y, modele.grandTotal.valeur, style, 'droite');
  fil.y += hauteur;
}

function note(c: Contexte): void {
  const { pdf, fil, x, l, modele } = c;
  const taille = px(S.note.taille);
  const ligne = taille * S.note.interligne;
  const lignes = couperParagraphe(
    modele.note.map((s) => ({ texte: s.texte, police: s.fort ? 'gras' as const : 'normal' as const })),
    taille, l - 2 * px(S.note.horizontal)
  );
  const hauteur = 2 * px(S.note.vertical) + lignes.length * ligne;

  fil.y += px(S.note.margeHaut);
  fil.reserver(hauteur);
  pdf.aplat(x, fil.y, l, hauteur, S.fond, px(S.note.rayon));
  lignes.forEach((frs, i) => {
    ligneMelee(
      c, x + px(S.note.horizontal), base(fil.y + px(S.note.vertical) + i * ligne, ligne, taille),
      frs, taille, () => S.gris
    );
  });
  fil.y += hauteur;
}

function signatures(c: Contexte): void {
  const { pdf, fil, x, l, modele } = c;
  const taille = px(S.signatures.taille);
  const ligne = taille * S.interligne;
  const largeur = (l - px(S.signatures.ecart)) / 2;
  const libelles = modele.signatures.map((t) => couperEnLignes(t, 'normal', taille, largeur));
  const n = Math.max(1, ...libelles.map((x2) => x2.length));
  // Un paragraphe garde sa marge d'un em dans la rangée de signatures.
  const hauteur = taille + n * ligne + px(S.signatures.espaceCadre) + px(S.signatures.cadre) + taille;

  // La marge du bloc l'emporte sur celle, plus petite, de la note.
  fil.y += px(S.signatures.margeHaut);
  fil.reserver(hauteur);
  libelles.forEach((lignes, k) => {
    const gauche = x + k * (largeur + px(S.signatures.ecart));
    lignes.forEach((t, i) => {
      pdf.texte(gauche, base(fil.y + taille + i * ligne, ligne, taille), t, { taille, couleur: S.grisClair });
    });
    const trait = px(1);
    pdf.cadre(
      gauche + trait / 2, fil.y + taille + n * ligne + px(S.signatures.espaceCadre) + trait / 2,
      largeur - trait, px(S.signatures.cadre) - trait,
      { epaisseur: trait, couleur: S.pointille, pointilles: [px(3), px(3)] },
      px(S.signatures.rayon)
    );
  });
  fil.y += hauteur;
}

/** Le CRA en octets PDF. `creation` est la date que le fichier déclare. */
export function pdfDuCra(modele: ModeleCra, creation: Date): Uint8Array<ArrayBuffer> {
  const pdf = new DocumentPdf({
    titre: modele.titre,
    creation,
    pied: { taille: px(10), couleur: S.grisClair, depuisLeBas: 28 }
  });
  const fil = new FilPdf(pdf, { haut: MARGE.haut, bas: MARGE.bas });
  const c: Contexte = {
    pdf, fil, modele, x: MARGE.gauche, l: pdf.largeur - MARGE.gauche - MARGE.droite
  };

  enTete(c);
  tableau(c);
  totauxParClient(c);
  grandTotal(c);
  note(c);
  signatures(c);
  return pdf.terminer();
}
