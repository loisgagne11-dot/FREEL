/**
 * Le contrôle d'intégrité de l'ensemble du barème.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL VIT À PART DE `bareme/index.ts`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Il n'a AUCUN appelant applicatif : il s'exécute en test, et il est utile au
 * moment d'ajouter une période — une table trouée ou qui se chevauche produit
 * des résolutions silencieusement fausses.
 *
 * Tant qu'il vivait dans `bareme/index.ts`, ses `import` y traînaient tout ce
 * qu'il contrôle : `calculs/facture` et `calculs/des` entraient dans le
 * paquet de PREMIER RENDU parce qu'un contrôle de test les nommait. Le budget
 * d'entrée l'a signalé en dépassant. Relever le seuil aurait masqué la
 * cause — la règle est d'extraire le module qui n'a rien à faire là, et c'est
 * celui-ci.
 *
 * Les `verifierIntegrite*` de chaque table restent exportés par `index.ts` :
 * ils vivent dans `bareme/`, que l'application charge de toute façon, et les
 * déplacer ne libérerait rien.
 */

import { verifierIntegriteAbattement } from './abattement';
import { verifierIntegriteAcre } from './acre';
import { verifierIntegriteImpot } from './impot';
import { verifierIntegritePlafonds } from './plafonds';
import { verifierIntegriteTva } from './tva';
import { verifierIntegrite as verifierIntegriteUrssaf } from './urssaf';
import { verifierIntegriteRecettes } from './recettes';
import { verifierIntegriteDes } from '../calculs/des';
import { verifierIntegriteFacture } from '../calculs/facture';

/**
 * Contrôle d'intégrité de l'ensemble du barème, préfixé par table.
 * Renvoie la liste des anomalies ; vide si tout est sain.
 */
export function verifierIntegriteBareme(): readonly string[] {
  return [
    ...verifierIntegriteUrssaf().map((a) => `[cotisations] ${a}`),
    ...verifierIntegriteAbattement().map((a) => `[abattement] ${a}`),
    ...verifierIntegriteAcre().map((a) => `[acre] ${a}`),
    ...verifierIntegritePlafonds().map((a) => `[plafonds] ${a}`),
    ...verifierIntegriteTva().map((a) => `[tva] ${a}`),
    ...verifierIntegriteImpot().map((a) => `[impôt] ${a}`),
    ...verifierIntegriteRecettes().map((a) => `[recettes] ${a}`),
    ...verifierIntegriteDes().map((a) => `[des] ${a}`),
    ...verifierIntegriteFacture().map((a) => `[facture] ${a}`)
  ];
}
