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

/**
 * Le nom du fichier de sauvegarde : lisible, daté, sans nom de société vide.
 *
 * Une seule règle pour les deux boutons qui en produisent une (Config et le
 * menu « Exporter ») : deux sauvegardes du même jour portent le même nom, quel
 * que soit l'endroit d'où elles sont parties.
 */
export function nomSauvegarde(nomEntreprise: string, jour: string): string {
  const nom = nomEntreprise.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `freel-${nom === '' ? 'donnees' : nom.toLowerCase()}-${jour}.json`;
}

/**
 * Enregistre le document sur le disque de l'utilisateur.
 *
 * Le type par défaut reste HTML : c'est ce que produisent tous les appelants
 * d'origine. Un CSV ou un JSON déclaré `text/html` s'enregistrerait avec la
 * mauvaise extension sur certains navigateurs, d'où le paramètre.
 */
export function telecharger(
  nom: string, contenu: string | Blob, type: string = 'text/html;charset=utf-8'
): void {
  // Un Blob passe tel quel : l'archive des justificatifs en est un, fait de
  // morceaux qui référencent les pièces au lieu de les copier — la convertir
  // en chaîne chargerait toutes les pièces en mémoire d'un coup.
  const url = URL.createObjectURL(contenu instanceof Blob ? contenu : new Blob([contenu], { type }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  // Le lien est retiré à la tâche suivante, mais l'URL du blob survit bien
  // plus longtemps : Safari et Firefox lisent le blob APRÈS le retour de
  // `click()`, parfois après une boîte « Enregistrer sous » que l'utilisateur
  // met plusieurs secondes à valider. Révoquer à 200 ms donnait un fichier vide
  // ou un échec silencieux sur un gros export. Le blob ne coûte que de la
  // mémoire jusqu'à la révocation, d'où un délai long mais borné.
  setTimeout(() => lien.remove(), 0);
  setTimeout(() => URL.revokeObjectURL(url), DELAI_REVOCATION_MS);
}

/** Durée de vie de l'URL d'un fichier téléchargé. */
export const DELAI_REVOCATION_MS = 30_000;

/** Repli si le navigateur n'émet jamais `afterprint` (Safari mobile, notamment). */
export const DELAI_RETRAIT_CADRE_MS = 60_000;

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
  // Le jeu de droits est le minimum que ce code exige :
  //  · `allow-same-origin` — on écrit dans le cadre par `contentWindow.document`
  //    et on y appelle `print()` ; sans l'origine commune, l'accès est refusé ;
  //  · `allow-modals` — Chrome ignore `print()` dans un cadre sandboxé qui ne
  //    l'a pas, sans erreur : le bouton « Imprimer » ne ferait rien.
  // `allow-scripts` est volontairement ABSENT : le document imprimé ne contient
  // aucun script, et en ajouter à côté de `allow-same-origin` permettrait au
  // cadre de retirer son propre sandbox. Un nom de client contenant du HTML
  // qui échapperait à l'échappement n'exécuterait donc rien.
  // L'attribut doit être posé AVANT l'insertion : après, il ne s'applique qu'à
  // la prochaine navigation, pas au document vide déjà chargé.
  cadre.setAttribute('sandbox', 'allow-same-origin allow-modals');
  cadre.setAttribute('aria-hidden', 'true');
  cadre.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(cadre);

  const doc = cadre.contentWindow?.document;
  if (doc === undefined) { cadre.remove(); return false; }

  doc.open();
  doc.write(contenu);
  doc.close();

  // Le retrait attend `afterprint` : détruire le cadre pendant que la boîte
  // d'impression est ouverte l'annule l'impression, et le retirer au bout de
  // 2 s fixes l'annulait si l'utilisateur mettait plus longtemps à choisir.
  // Sans retrait du tout, chaque impression laissait un cadre dans la page.
  const retirer = (): void => { cadre.remove(); };
  cadre.contentWindow?.addEventListener('afterprint', retirer);
  setTimeout(retirer, DELAI_RETRAIT_CADRE_MS);

  try {
    cadre.contentWindow?.focus();
    cadre.contentWindow?.print();
  } catch {
    cadre.remove();
    return false;
  }
  return true;
}
