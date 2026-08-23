/**
 * Conversion des blocs de faits d'un schéma ANTÉRIEUR vers `VERSION_SCHEMA`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EST SÉPARÉ DE `schema.ts`
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chaque fonction ici ne sert qu'UNE FOIS dans la vie d'un compte — au
 * premier chargement qui suit une mise à jour du schéma — et jamais à qui a
 * déjà le schéma courant, c'est-à-dire la majorité des ouvertures. Elles
 * embarquaient pourtant dans le paquet de PREMIER RENDU, aux côtés des types
 * et des valeurs par défaut que `schema.ts` garde et que tout le monde lit à
 * chaque démarrage.
 *
 * Le motif est le même que pour `infra/migration.legacy.ts`, dont l'en-tête
 * l'explique pour la reprise de l'ancienne application : ce module-ci est
 * chargé À LA DEMANDE. `infra/migration.ts` (`migrer`) ne fait que CONSTATER
 * qu'une conversion est nécessaire — il rend `migration-requise` sans jamais
 * l'importer — et c'est `state/store.ts` (`initialiser`, `adopterFaitsDistants`)
 * qui le charge alors, sur le même modèle que la reprise de l'ancienne
 * application : l'écran reste en phase « initial » le temps du chargement,
 * plutôt que d'afficher un état vide qu'on remplacerait une seconde plus tard.
 *
 * Un compte DÉJÀ au schéma courant passe par `completerFaitsCourants`, dans
 * `schema.ts` : une fusion de surface synchrone qui ne descend dans aucune
 * liste, parce qu'un compte courant n'a par construction plus de congé écrit
 * en chaîne nue ni d'ajustement en nombre — ces formes n'existent qu'à des
 * schémas que `VERSION_SCHEMA` a dépassés depuis longtemps.
 */

import type { DateISO, Euros } from '../domain/types';
import type { MotifSansContrepartie, MouvementBancaire } from '../domain/calculs/banque';
import type { AjustementJour, Ajustements, Rythme } from '../domain/calculs/planning';
import type { Echeance } from '../domain/calculs/provisions';
import {
  FORMULE_PAR_DEFAUT, echeanceDe, formuleDepuisJours, formuleOuNull
} from '../domain/calculs/delaiPaiement';
import {
  type Client, type ClientOperationnel, type Conge, type Entreprise, type Faits,
  type FoyerFiscal, type Mission, type Recette, VERSION_SCHEMA,
  entiteVide, entrepriseVide, faitsVides, foyerFiscalDepuisConfigImpot, nombreOuNull
} from './schema';

/**
 * Convertit les congés du schéma 1 vers le schéma 2.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CAS QUI CASSE TOUT SI ON L'OUBLIE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le schéma 1 portait `conges: ['2026-08-10', …]` — de simples chaînes. Le
 * schéma 2 porte `{ date, quotite }`, pour tenir la demi-journée que
 * l'ancienne application gère depuis toujours.
 *
 * Tout bloc déjà enregistré — sur le poste comme sur le compte distant — est
 * au format 1. Le laisser passer tel quel donnerait des congés dont `date`
 * vaut `undefined` : le calendrier n'afficherait plus rien, le décompte
 * tomberait à zéro, et rien ne le signalerait. Une migration de schéma qu'on
 * oublie ne lève pas d'erreur, elle vide les données en silence.
 */
function congesDuSchema1(brut: unknown): readonly Conge[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((c): Conge[] => {
    if (typeof c === 'string') return [{ date: c as DateISO, quotite: 1 }];
    if (typeof c === 'object' && c !== null) {
      const o = c as Record<string, unknown>;
      if (typeof o['date'] !== 'string') return [];
      const q = typeof o['quotite'] === 'number' && Number.isFinite(o['quotite'])
        ? o['quotite'] : 1;
      return [{ date: o['date'] as DateISO, quotite: q }];
    }
    return [];
  });
}

/**
 * Complète les missions du schéma 1.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COMBLER LA RACINE NE SUFFIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `completerFaits` fusionnait les défauts au premier niveau seulement : une
 * liste `missions` présente écrasait le défaut en bloc, y compris pour les
 * champs ajoutés au schéma 2 À L'INTÉRIEUR de chaque mission.
 *
 * Résultat constaté dans un vrai navigateur : `rythmes` valait `undefined`,
 * le planning lisait sa longueur, et l'écran Activité tombait entièrement —
 * pour tout compte enregistré avant le schéma 2, c'est-à-dire tous.
 *
 * La leçon est la même que pour les congés, un niveau plus bas : une
 * migration de schéma doit descendre jusqu'où les champs ont bougé.
 */
function missionsDuSchema1(brut: unknown): readonly Mission[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((m): Mission[] => {
    if (typeof m !== 'object' || m === null) return [];
    const o = m as Record<string, unknown>;
    const { rythmes: _r, ajustements: _a, ...reste } = o;
    return [{
      ...(reste as unknown as Mission),
      entites: entitesDuSchema3(o)
    }];
  });
}

/**
 * Le rythme quitte la mission pour son client opérationnel (schéma 3 → 4).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CAS À UNE ENTRÉE N'EST PAS UNE EXCEPTION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Jusqu'au schéma 3, `rythmes` et `ajustements` étaient portés par la mission
 * elle-même. Une mission d'alors devient donc une mission à UN client
 * opérationnel, qui reprend son nom de client et son rythme tel quel. Rien
 * n'est perdu, rien n'est inventé, et le planning d'hier redonne exactement
 * les mêmes journées.
 *
 * Sans cette conversion, `entites` serait absent, le planning n'aurait plus
 * aucun rythme à lire et les calendriers se videraient — en silence, comme
 * les congés du schéma 1 avant eux.
 */
function entitesDuSchema3(o: Record<string, unknown>): readonly ClientOperationnel[] {
  const dejaConverti = Array.isArray(o['entites']) && o['entites'].length > 0;
  if (dejaConverti) {
    return (o['entites'] as unknown[]).flatMap((e): ClientOperationnel[] => {
      if (typeof e !== 'object' || e === null) return [];
      const c = e as Record<string, unknown>;
      return [{
        ...entiteVide(),
        ...(c as unknown as ClientOperationnel),
        /* APRÈS l'étalement, et jamais avant.
           `...c` recopie `ajustements` tel quel : sur un bloc d'avant le
           schéma 14, ce sont des NOMBRES. La fusion de surface ne les
           convertit pas — c'est exactement le piège de l'invariant n°5, déjà
           rencontré sur `partsFiscales` : le champ existe, donc il passe, et
           il passe faux. */
        ajustements: ajustementsDuSchema13(c['ajustements'])
      }];
    });
  }

  return [{
    ...entiteVide(),
    id: `${typeof o['id'] === 'string' ? o['id'] : 'mission'}-co1`,
    nom: typeof o['clientNom'] === 'string' ? o['clientNom'] : '',
    rythmes: Array.isArray(o['rythmes']) ? o['rythmes'] as readonly Rythme[] : [],
    ajustements: ajustementsDuSchema13(o['ajustements'])
  }];
}

/**
 * L'ajustement passe du nombre nu au fait de journée (schéma 13 → 14).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI SE PERDRAIT SANS ELLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `ajustements` valait `Record<date, number>`. Il vaut désormais
 * `Record<date, { quotite, creneaux?, lieu? }>`. Sans conversion, `planifier`
 * lirait `pose.quotite` sur un nombre — `undefined` — et TOUTES les journées
 * ajustées retomberaient sur le prévu du rythme. Le CRA d'un mois entier
 * changerait sans que rien ne le signale : ni erreur, ni écran vide, juste des
 * journées qui redeviennent celles du rythme théorique.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NI CRÉNEAU NI LIEU : ON NE LES INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Une journée d'avant ce schéma ne dit pas si elle a été travaillée le matin,
 * et rien ne permet de le déduire — pas même une quotité de 0,5. Les deux
 * champs restent donc absents, et l'écran affiche « 0,5 j » sans position.
 * Poser « matin » par défaut remplirait le plan de charge de demi-journées que
 * personne n'a saisies, et elles seraient indiscernables des vraies.
 */
function ajustementsDuSchema13(brut: unknown): Ajustements {
  if (typeof brut !== 'object' || brut === null) return {};
  const converti: Record<string, AjustementJour> = {};

  for (const [date, valeur] of Object.entries(brut as Record<string, unknown>)) {
    if (typeof valeur === 'number' && Number.isFinite(valeur)) {
      converti[date] = { quotite: valeur };
      continue;
    }
    // Déjà au schéma 14 : on garde, en vérifiant tout de même la quotité. Un
    // bloc distant mal formé ne doit pas faire tomber le planning.
    if (typeof valeur === 'object' && valeur !== null) {
      const o = valeur as Record<string, unknown>;
      const q = o['quotite'];
      if (typeof q === 'number' && Number.isFinite(q)) {
        converti[date] = valeur as AjustementJour;
      }
    }
  }
  return converti;
}

/**
 * `sansContrepartie` passe du booléen au motif (schéma 4 → 5).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE PIÈGE DU FAUX QUI DEVIENT VRAI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le champ valait `true` ou `false` ; il vaut désormais `'remuneration'`,
 * `'autre'` ou `null`. Sans conversion, un `false` enregistré hier serait lu
 * comme « différent de null », donc comme un mouvement DÉJÀ classé : tous les
 * mouvements à traiter disparaîtraient de la file, sans que rien ne le
 * signale.
 *
 * C'est le troisième champ imbriqué à migrer, après les congés et les rythmes.
 * La règle est acquise : une migration descend jusqu'où les champs ont bougé.
 */
function mouvementsDuSchema4(brut: unknown): readonly MouvementBancaire[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((mv): MouvementBancaire[] => {
    if (typeof mv !== 'object' || mv === null) return [];
    const o = mv as Record<string, unknown>;
    const ancien = o['sansContrepartie'];
    const motif: MotifSansContrepartie | null =
      ancien === 'remuneration' || ancien === 'autre' ? ancien
        // Un `true` d'hier ne disait pas pourquoi : il devient « autre ».
        // Le requalifier en rémunération inventerait une information.
        : ancien === true ? 'autre'
          : null;
    return [{ ...(o as unknown as MouvementBancaire), sansContrepartie: motif }];
  });
}

/**
 * `payee` devient une DATE de paiement (schéma 5 → 6).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CONVERTIR SANS INVENTER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un `payee: true` d'hier dit qu'une échéance a été réglée, sans dire quand.
 * On retient sa date d'échéance : ce n'est pas une invention pour les seules
 * données qui existent aujourd'hui. Elles viennent toutes de la reprise des
 * mouvements « Charge » du legacy, où la date d'échéance A ÉTÉ POSÉE À PARTIR
 * de la date du mouvement — c'est-à-dire du paiement. La conversion redonne
 * donc exactement la bonne date.
 *
 * `payee: false` devient `null` : pas de paiement, pas de date.
 *
 * Quatrième champ imbriqué à migrer, après les congés, les rythmes et le motif
 * des mouvements. La règle est acquise et se vérifie à chaque fois : une
 * migration descend jusqu'où les champs ont bougé.
 */
function echeancesDuSchema5(brut: unknown): readonly Echeance[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((e): Echeance[] => {
    if (typeof e !== 'object' || e === null) return [];
    const o = e as Record<string, unknown>;
    const dejaConverti = 'payeeLe' in o;
    const echeanceLe = typeof o['echeanceLe'] === 'string' ? o['echeanceLe'] as DateISO : null;

    const payeeLe = dejaConverti
      ? (typeof o['payeeLe'] === 'string' ? o['payeeLe'] as DateISO : null)
      : (o['payee'] === true ? echeanceLe : null);

    return [{
      ...(o as unknown as Echeance),
      payeeLe,
      montantPaye: typeof o['montantPaye'] === 'number' && Number.isFinite(o['montantPaye'])
        ? o['montantPaye'] as Euros
        : null
    }];
  });
}

/**
 * v11 → v12 : le foyer fiscal sort de `configImpotBrute`, au moment de la
 * migration de schéma.
 *
 * La règle d'extraction elle-même vit dans `foyerFiscalDepuisConfigImpot`
 * (`schema.ts`), partagée avec la reprise de l'ancienne application : deux
 * lectures de la même structure finiraient par diverger, et l'application
 * dirait alors deux nombres de parts selon l'origine du compte. Cette
 * fonction-ci ne fait que l'appliquer ici, en laissant la priorité à ce qui
 * est déjà saisi dans le nouveau schéma — la reprise ne sert qu'à combler une
 * absence, jamais à écraser une valeur corrigée depuis l'écran Config.
 */
function foyerFiscalDuSchema11(o: Record<string, unknown>): FoyerFiscal {
  const repris = foyerFiscalDepuisConfigImpot(o['configImpotBrute']);
  return {
    partsFiscales: nombreOuNull(o['partsFiscales']) ?? repris.partsFiscales,
    autresRevenusFoyer:
      (nombreOuNull(o['autresRevenusFoyer']) as Euros | null) ?? repris.autresRevenusFoyer,
    versementPerDeductible:
      (nombreOuNull(o['versementPerDeductible']) as Euros | null) ?? repris.versementPerDeductible
  };
}

/**
 * v6 → v7 : les recettes portent leurs dates de relance.
 * v7 → v8 : elles portent aussi leur date d'envoi.
 * v8 → v9 : et la TVA que le document porte.
 *
 * Le champ est nouveau et facultatif ; une recette d'avant le schéma 7 n'a
 * simplement jamais été relancée dans l'application. On pose donc une liste
 * vide plutôt que de laisser `undefined` circuler : le reste du code compte des
 * relances, et `undefined.length` n'est pas une absence, c'est une panne.
 *
 * La règle du projet s'applique une fois de plus : une migration descend
 * jusqu'où les champs ont bougé. Ici ils n'ont pas bougé, ils sont apparus —
 * mais le comblement doit quand même descendre au niveau de chaque recette,
 * ce que la fusion de surface de `completerFaits` ne fait pas.
 */
function recettesDuSchema6(brut: unknown): readonly Recette[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((r): Recette[] => {
    if (typeof r !== 'object' || r === null) return [];
    const o = r as Record<string, unknown>;
    const relances = Array.isArray(o['relancesLe'])
      ? o['relancesLe'].filter((d): d is DateISO => typeof d === 'string')
      : [];
    // v8 : la date d'envoi. `undefined` deviendrait « pas encore envoyée »
    // par accident ; on pose `null` explicitement, qui dit la même chose mais
    // le dit — et une facture d'avant le schéma 8 n'a effectivement aucune
    // date d'envoi enregistrée, quoi qu'il se soit passé dans la vraie vie.
    const envoyeeLe = typeof o['envoyeeLe'] === 'string' ? o['envoyeeLe'] as DateISO : null;
    // v9 : `null` reste `null` et ne devient PAS zéro. Une facture d'avant le
    // schéma 9 portait peut-être de la TVA ; la compter pour zéro sous-évaluerait
    // une déclaration, ce qui est le sens dangereux de l'erreur.
    const tvaCollectee = typeof o['tvaCollectee'] === 'number' && Number.isFinite(o['tvaCollectee'])
      ? o['tvaCollectee'] as Euros
      : null;
    return [{ ...(o as unknown as Recette), relancesLe: relances, envoyeeLe, tvaCollectee }];
  });
}


/* ─────────────────────────────────────────────────────────────────────────
   v12 → v13 : les conditions de paiement, et l'échéance qui devient un fait
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Le client porte une FORMULE, plus un nombre de jours.
 *
 * L'ancien `delaiPaiementJours` se traduit vers une formule « nets », jamais
 * vers « fin de mois ». C'est exactement ce que le code calculait — `emiseLe +
 * N jours` —, et traduire un ancien `30` par « 30 jours fin de mois » aurait
 * décalé de plusieurs semaines l'échéance de factures déjà émises, sous
 * couvert de les corriger.
 */
function clientsDuSchema12(brut: unknown): readonly Client[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((c): Client[] => {
    if (typeof c !== 'object' || c === null) return [];
    const o = c as Record<string, unknown>;
    const deja = formuleOuNull(o['delaiPaiement']);
    const jours = typeof o['delaiPaiementJours'] === 'number' ? o['delaiPaiementJours'] : null;
    return [{
      ...(o as unknown as Client),
      delaiPaiement: deja ?? (jours === null ? FORMULE_PAR_DEFAUT : formuleDepuisJours(jours))
    }];
  });
}

/**
 * L'échéance se fige sur chaque facture déjà émise.
 *
 * Elle se calcule UNE FOIS depuis les conditions du client telles qu'elles
 * sont aujourd'hui — c'est la seule information disponible — puis ne bouge
 * plus. C'est moins juste qu'une échéance relevée sur le document d'origine,
 * et strictement plus juste que le comportement précédent, où elle changeait à
 * chaque modification des conditions du client.
 *
 * Une recette sans date d'émission n'a pas d'échéance : `null`, et non une
 * date inventée. Rien n'est encore dû sur un brouillon.
 */
function recettesDuSchema12(
  recettes: readonly Recette[], clientsBruts: unknown
): readonly Recette[] {
  const parClient = new Map(
    clientsDuSchema12(clientsBruts).map((c) => [c.nom, c.delaiPaiement])
  );
  return recettes.map((r) => {
    if (r.echeanceLe != null) return r;
    /* La FORME de la date est vérifiée avant de calculer. Un bloc venu d'un
       compte distant peut porter n'importe quoi : `new Date('n importe
       quoi')` donne une date invalide, dont `toISOString()` LÈVE. La migration
       s'exécute au chargement, donc l'exception ne tombait pas dans un coin —
       elle emportait l'écran entier, et la seule trace était un « Invalid time
       value » sans rapport apparent avec une facture. */
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.emiseLe ?? ''))) {
      return { ...r, echeanceLe: null };
    }
    const formule = parClient.get(r.clientNom) ?? FORMULE_PAR_DEFAUT;
    return { ...r, echeanceLe: echeanceDe(r.emiseLe as DateISO, formule) };
  });
}

/**
 * v15 → v16 : la recette porte l'identifiant de sa pièce jointe.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `undefined` N'EST PAS `null`, ET C'EST TOUT L'ENJEU ICI
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le champ est nouveau, donc absent de toute recette enregistrée avant ce
 * schéma. Mais contrairement à `relancesLe` ou `envoyeeLe`, il se lit par
 * comparaison STRICTE à `null` — exactement comme `Depense.justificatifId` —
 * pour décider si une pièce est conservée. Laisser `undefined` circuler
 * romprait ce test : `undefined === null` vaut `false`, et l'écran
 * afficherait « pièce conservée » pour un document qui n'en a strictement
 * aucune. La règle du projet s'applique une fois de plus : une migration
 * descend jusqu'où les champs ont bougé, ce que la fusion de surface de
 * `completerFaits` ne fait pas pour un champ apparu dans un élément de liste.
 */
function recettesDuSchema15(recettes: readonly Recette[]): readonly Recette[] {
  return recettes.map((r) => (
    r.justificatifId === undefined ? { ...r, justificatifId: null } : r
  ));
}

/**
 * Complète un bloc validé avec les valeurs par défaut des champs absents, et
 * CONVERTIT les formats des schémas antérieurs.
 *
 * Un schéma ANTÉRIEUR est légitime : il lui manque les champs ajoutés depuis.
 * Les combler ici évite que chaque écran ait à se demander si la liste qu'il
 * lit existe — question à laquelle un jour l'un d'eux répondrait mal.
 *
 * À n'appeler qu'après `motifRefusFaits`, qui seul autorise l'entrée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUAND CETTE FONCTION S'EXÉCUTE, ET QUAND ELLE NE S'EXÉCUTE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un compte déjà au schéma courant passe par `completerFaitsCourants`
 * (`schema.ts`), synchrone, qui ne charge pas ce module. Celle-ci ne
 * s'exécute que pour un compte dont la version stockée est ANTÉRIEURE à
 * `VERSION_SCHEMA` — voir `infra/migration.ts` (`migrer`) et
 * `state/store.ts` (`initialiser`, `adopterFaitsDistants`).
 *
 * v9 → v10 : l'objectif de chiffre d'affaires annuel.
 *
 * Aucune fonction de migration dédiée, et c'est vérifié plutôt que supposé :
 * le champ est de PREMIER NIVEAU, donc la fusion de surface ci-dessous le
 * comble depuis `faitsVides()`. La règle du projet — « une migration descend
 * jusqu'où les champs ont bougé » — est respectée précisément parce qu'ici
 * rien n'a bougé sous la surface. Les quatre migrations imbriquées existantes
 * sont là parce que leurs champs, eux, vivaient dans des éléments de liste.
 *
 * La valeur comblée est `null` et non zéro : voir `objectifCaAnnuel`.
 *
 * v10 → v11 : la part gardée au versement.
 *
 * Même conclusion, et vérifiée de la même façon plutôt que supposée : le champ
 * est de PREMIER NIVEAU, donc `{ ...defauts, ...o }` le comble depuis
 * `faitsVides()` dès lors qu'un bloc de schéma 10 ne porte pas la clé. La
 * vérification n'est pas une lecture du code mais un test nommé —
 * « un compte de schéma 10 reçoit une part gardée nulle, et non `undefined` » —
 * qui échoue si la fusion cesse de suffire. C'est ce qui distingue ce cas des
 * cinq migrations imbriquées ci-dessus : leurs champs, eux, vivaient dans des
 * éléments de liste, que la fusion de surface n'atteint pas.
 *
 * La valeur comblée est zéro, et jamais 0,5 : voir `partGardeeAuVersement`.
 *
 * v11 → v12 : les trois faits du foyer fiscal. Ceux-là, la fusion de surface
 * ne suffit PAS à combler — non parce qu'ils vivent dans une liste, mais parce
 * que leur valeur dort ailleurs, dans `configImpotBrute`. Voir
 * `foyerFiscalDuSchema11`.
 *
 * v14 → v15 : la date du solde de départ, `soldeInitialAu`. Champ de PREMIER
 * NIVEAU comme les deux premiers ci-dessus : la fusion de surface le comble
 * depuis `faitsVides()`. La valeur comblée est `null`, JAMAIS une date
 * devinée — ni celle du jour de la migration, ni `debutActivite`, aucune des
 * deux ne serait la date à laquelle `soldeInitial` était vrai. C'est
 * exactement le cas que ce champ existe pour distinguer : un compte migré
 * reste dans l'état d'ABSTENTION (`ProvenanceSolde['sansDate']`) jusqu'à ce
 * que quelqu'un date son solde depuis Config.
 *
 * v15 → v16 : `Recette.justificatifId`. Champ apparu dans un élément de
 * liste comme les cinq migrations imbriquées ci-dessus, et lu par égalité
 * STRICTE à `null` — la fusion de surface ne suffit donc pas. Voir
 * `recettesDuSchema15`.
 */
export function completerFaits(brut: unknown): Faits {
  const o = brut as Record<string, unknown>;
  const defauts = faitsVides();
  const entreprise = (typeof o['entreprise'] === 'object' && o['entreprise'] !== null)
    ? o['entreprise'] as Partial<Entreprise>
    : {};

  return {
    ...defauts,
    ...o,
    ...foyerFiscalDuSchema11(o),
    // Le numéro de schéma devient celui de CE code : les champs manquants
    // viennent d'être comblés, le bloc n'est plus à l'ancien format.
    version: VERSION_SCHEMA,
    entreprise: { ...entrepriseVide(), ...entreprise },
    conges: congesDuSchema1(o['conges']),
    clients: clientsDuSchema12(o['clients']),
    /* Pas de normalisation du délai de mission ici : le champ est FACULTATIF,
       une mission d'avant le schéma 13 n'en porte pas, et le seul lecteur —
       la projection — le lit déjà par `formuleOuNull`. Le faire aussi au
       chargement aurait coûté un parcours de la liste à tous les utilisateurs
       pour une valeur qu'aucun d'eux n'a encore saisie. */
    missions: missionsDuSchema1(o['missions']),
    mouvementsBancaires: mouvementsDuSchema4(o['mouvementsBancaires']),
    echeances: echeancesDuSchema5(o['echeances']),
    recettes: recettesDuSchema15(
      recettesDuSchema12(recettesDuSchema6(o['recettes']), o['clients'])
    )
  } as Faits;
}
