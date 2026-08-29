/**
 * Sortir un document de l'application : le fichier et l'imprimante.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PAS DE BIBLIOTHÈQUE PDF
 * ─────────────────────────────────────────────────────────────────────────
 *
 * L'ancienne application chargeait jsPDF et Chart.js — 627 Ko bloquants avant
 * la première ligne utile — pour produire des documents qu'un navigateur sait
 * déjà rendre. « Imprimer → Enregistrer en PDF » donne le même fichier, sans
 * le poids, et avec la mise en page que l'utilisateur vient de voir à l'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE FICHIER TÉLÉCHARGÉ EST AUTONOME, ET C'EST TOUT L'ENJEU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Il part chez un client, qui l'ouvrira depuis sa messagerie, hors de notre
 * domaine et sans notre feuille de style. Le HTML sérialisé emporte donc sa
 * CSS avec lui. Sans cela, le client reçoit un tableau sans bordures ni
 * alignement — un document qui ne se signe pas.
 *
 * Le nom de fichier finit en `.html` et jamais en `.pdf` : un fichier HTML
 * nommé `.pdf` ne s'ouvre nulle part, et promettre un PDF qu'on ne produit pas
 * est exactement le genre de petit mensonge d'interface que ce projet évite.
 * Le bouton dit « Télécharger », et « Imprimer » mène au PDF.
 */

/** Le document complet, prêt à vivre seul dans un fichier. */
export function documentAutonome(titre: string, feuille: string, corps: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapper(titre)}</title>
<style>
  html, body { margin: 0; padding: 0; background: #f2f2ee; }
  @media print { html, body { background: #ffffff; } }
${feuille}
</style>
</head>
<body>${corps}</body>
</html>`;
}

/** Échappe ce qui va dans le titre : il vient d'un nom de client saisi. */
function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Un nom de fichier acceptable partout.
 *
 * Les espaces, les accents et surtout la barre oblique d'un nom de client
 * (« Dupont / Martin ») produiraient un fichier introuvable, voire un chemin.
 */
export function nomDeFichier(...morceaux: readonly string[]): string {
  return morceaux
    .map((m) => m
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, ''))
    .filter((m) => m !== '')
    .join('_');
}

/** Enregistre le document sur le disque de l'utilisateur. */
export function telecharger(nom: string, contenu: string): void {
  const url = URL.createObjectURL(new Blob([contenu], { type: 'text/html;charset=utf-8' }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  // Le retrait est différé : révoquer l'URL dans la même tâche annule le
  // téléchargement sur certains navigateurs, qui n'ont pas encore lu le blob.
  setTimeout(() => { lien.remove(); URL.revokeObjectURL(url); }, 200);
}

/**
 * Imprime le document SEUL, sans l'interface autour.
 *
 * Un `window.print()` sur la page imprime la page : le rail de navigation, la
 * barre du haut, le panneau ouvert. Le document part dans un cadre isolé, ce
 * qui donne exactement le fichier que « Télécharger » produit — même source,
 * même rendu, aucune divergence possible entre les deux boutons.
 *
 * Rend `false` quand l'impression a été refusée par le navigateur, pour que
 * l'appelant puisse le dire plutôt que de laisser croire que ça a marché.
 */
export function imprimer(contenu: string): boolean {
  const cadre = document.createElement('iframe');
  cadre.setAttribute('aria-hidden', 'true');
  cadre.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(cadre);

  const doc = cadre.contentWindow?.document;
  if (doc === undefined) { cadre.remove(); return false; }

  doc.open();
  doc.write(contenu);
  doc.close();

  try {
    cadre.contentWindow?.focus();
    cadre.contentWindow?.print();
  } catch {
    cadre.remove();
    return false;
  }
  // Le retrait est différé : détruire le cadre pendant que la boîte
  // d'impression est ouverte l'annule.
  setTimeout(() => cadre.remove(), 2_000);
  return true;
}
