/**
 * Reconnaître le jeu de démonstration, sans qu'il se soit annoncé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE MODULE FERME
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le garde-fou de l'envoi vers le compte (`Compte.tsx`) ne se déclenchait que
 * si l'appareil était VIDE : « on installe l'application quelque part, elle n'a
 * rien, et enregistrer sur le compte effacerait tout ». Un appareil rempli du
 * jeu de DÉMONSTRATION n'est pas vide, et le scénario passait donc sans aucune
 * confirmation :
 *
 *   charger la démo pour regarder → aller sur Compte → « enregistrer sur le
 *   compte » → les vraies données du compte sont écrasées par des factures
 *   fictives.
 *
 * Le compteur de version ne protège de rien ici : la version distante est bien
 * celle qu'on a lue, l'écriture est parfaitement légitime pour le serveur.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUCUN DRAPEAU STOCKÉ — L'INVARIANT N°1 L'INTERDIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Marquer les faits d'un « ceci est une démonstration » en ferait une valeur
 * dérivée persistée, et il faudrait ensuite la maintenir juste : que vaut-elle
 * après qu'on a modifié une facture ? après un import partiel ? La question n'a
 * pas de bonne réponse, et un drapeau qui ment est pire que pas de drapeau.
 *
 * La reconnaissance se DÉRIVE donc de l'identité de l'entreprise, que le jeu de
 * démonstration porte en clair.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX MARQUEURS, ET LA CONJONCTION DES DEUX
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le SIRET du jeu est neutralisé par construction — que des zéros, donc une clé
 * de contrôle invalide : aucune entreprise réelle n'en porte un pareil. Mais un
 * dossier tout juste commencé peut parfaitement avoir un SIRET vide ou saisi à
 * la va-vite, et déclencher la confirmation sur ce seul motif la ferait voir à
 * des gens qui n'ont jamais touché à la démonstration.
 *
 * Le NOM seul ne suffit pas davantage : on peut le changer sans rien changer
 * d'autre.
 *
 * Les deux ensemble ne se rencontrent que sur le jeu tel qu'il est livré. Et
 * le rapport de coût entre les deux erreurs est très déséquilibré :
 *
 *   · faux positif  → une confirmation de trop, qu'on écarte d'un clic ;
 *   · faux négatif  → des données réelles écrasées, en silence.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA RECONNAISSANCE NE PRÉTEND PAS FAIRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Qui charge la démonstration puis renomme son entreprise sort de la
 * reconnaissance — et c'est le bon comportement : à ce moment-là, il a commencé
 * à s'en servir comme d'un dossier à lui. Ce module reconnaît le jeu LIVRÉ, pas
 * « des données qui ne vous appartiennent pas », question à laquelle rien ne
 * saurait répondre.
 */

/** Le nom que le jeu de démonstration porte, tel qu'il est livré. */
const NOM_DEMONSTRATION = 'Atelier de démonstration';

/** Son SIRET, neutralisé par construction : une clé de contrôle impossible. */
const SIRET_DEMONSTRATION = '000 000 000 00000';

/** Les espaces d'un SIRET sont de la mise en forme, pas de la donnée. */
const chiffres = (s: string): string => s.replace(/\s/g, '');

/**
 * Ces faits sont-ils le jeu de démonstration livré avec l'application ?
 *
 * Voir l'en-tête pour le choix des marqueurs et pour ce que la réponse ne
 * prétend pas couvrir.
 */
export function estLeJeuDeDemonstration(
  entreprise: { readonly nom: string; readonly siret: string }
): boolean {
  return entreprise.nom.trim() === NOM_DEMONSTRATION
    && chiffres(entreprise.siret) === chiffres(SIRET_DEMONSTRATION);
}
