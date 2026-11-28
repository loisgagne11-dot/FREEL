/**
 * Capture NOS écrans, sous les mêmes noms que ceux du handoff.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX DOSSIERS DE CAPTURES ET PAS UN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `docs/design/captures/` dit ce que le design VEUT.
 * `docs/design/captures-app/` dit ce que l'application FAIT.
 *
 * Deux images côte à côte se comparent ; deux descriptions, non. Trois
 * décisions de conception ont été prises « d'après le handoff » en le lisant au
 * lieu de le regarder, et les trois étaient fausses — un donut pris pour une
 * barre, un graphe combiné pris pour deux, un découpage mensuel pris pour des
 * plages libres. Les tests étaient verts à chaque fois.
 *
 * Depuis le lot 51, une capture porte le nom de l'ÉCRAN de l'application —
 * `tresorerie`, `factures-clients` — et non plus celui du handoff, dont la
 * navigation a été refaite : `argent-performance` désignait un pilier qui
 * n'existe plus. La paire n'est pas perdue pour autant : la vue dit son
 * homonyme du handoff (`handoff`), et `INDEX.md` l'écrit en regard. C'est ce
 * qui permet à `controleur-visuel` d'ouvrir la paire sans deviner.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE MÊME JEU DE DONNÉES DES DEUX CÔTÉS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `docs/design/jeu-de-demonstration.json` reprend les clients, missions,
 * factures et échéances du handoff. Sans lui, notre capture montrerait des
 * écrans vides et la comparaison ne dirait rien : un écran vide est conforme à
 * tout.
 *
 * L'horloge est figée au 10 juin 2026, date du handoff. Un « aujourd'hui » qui
 * bouge ferait bouger la moitié des chiffres d'une capture à l'autre, et on ne
 * saurait plus distinguer une régression d'un jour qui passe.
 *
 * Usage : node scripts/capturer-app.mjs [--theme=calme|nuit|clair|sombre] [--ecran=tresorerie]
 *                                        [--jeu=essai] [--largeur=390] [--port=4174]
 *
 * Sans `--theme`, Calme et Nuit : la direction retenue le 13/11, et le thème
 * par défaut d'un nouvel utilisateur depuis le lot 51. Les deux autres se
 * demandent un par un.
 *
 * `--largeur` photographie à une autre largeur (téléphone : 390). Le contrôle
 * responsive charge les écrans VIDES : un tableau qui ne s'affiche qu'avec des
 * données (le registre d'Achats) ne s'y voit jamais. Le fichier porte alors la
 * largeur dans son nom, pour ne pas écraser la capture de référence.
 *
 * `--jeu=essai` charge `src/test/jeu-d-essai.json` (horloge au 15 décembre
 * 2026) et écrit dans `docs/design/captures-app/essai/`. Sans l'option, rien
 * ne change.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RACINE = resolve(import.meta.dirname, '../..');

const argument = (nom) =>
  (process.argv.find((a) => a.startsWith(`--${nom}=`)) ?? '').split('=')[1];

/* Deux jeux, deux horloges, deux dossiers.
   Le jeu de démonstration est celui du handoff : il se compare aux captures de
   design, d'où son horloge au 10 juin. Le jeu d'essai (`--jeu=essai`) est un
   compte de FORME RÉELLE — ACRE éteinte, TVA franchie, avoir, foyer à deux
   parts — qui ne se compare à aucune capture : il sert à regarder les écrans
   sur des données qui ont l'épaisseur d'un vrai compte, là où le jeu de
   démonstration est trop propre pour révéler un champ vide, un libellé qui
   déborde ou un graphe aplati. Il a son propre dossier : le mélanger aux
   captures appariées au handoff ferait comparer, sans que rien l'avertisse,
   deux écrans qui ne montrent pas le même compte. */
const jeuDemande = argument('jeu');
if (jeuDemande !== undefined && jeuDemande !== '' && jeuDemande !== 'essai') {
  console.error(`Jeu inconnu : « ${jeuDemande} » (attendu : essai, ou rien pour la démonstration).`);
  process.exit(1);
}
const JEU_ESSAI = jeuDemande === 'essai';

const SORTIE = join(RACINE, 'docs/design/captures-app', JEU_ESSAI ? 'essai' : '');
/* Le jeu de démonstration vient de `app/public/`, d'où l'application elle-même
   le charge — et non d'une copie dans `docs/`. Le script pointait vers
   `docs/design/`, où rien ne se trouve : il levait avant d'ouvrir un
   navigateur, et personne ne l'a vu parce qu'aucune capture manquante ne fait
   échouer `npm run verifier`. Une seconde copie du jeu aurait de toute façon
   fini par diverger de celle que l'application sert. */
const JEU = JSON.parse(readFileSync(
  JEU_ESSAI
    ? join(RACINE, 'app/src/test/jeu-d-essai.json')
    : join(RACINE, 'app/public/jeu-de-demonstration.json'),
  'utf8'
));
const PORT = Number(argument('port') ?? 4174) || 4174;

/** Le 10 juin 2026, comme le handoff. Voir l'en-tête. Le jeu d'essai, lui, est
    daté du 15 décembre 2026 : rien n'y est postérieur, et le CFE, le troisième
    trimestre à déclarer et les factures de novembre y sont tous visibles. */
const AUJOURDHUI = JEU_ESSAI ? '2026-12-15T09:00:00Z' : '2026-06-10T09:00:00Z';

/**
 * Les vues, nommées comme celles du handoff.
 *
 * `ouvrir` est une suite de libellés à cliquer. Un nom qui n'existe pas encore
 * dans notre application est normal tant que le lot correspondant n'est pas
 * fait : le script le signale au lieu d'échouer, et la capture manquante est
 * elle-même l'information.
 *
 * `attendre` est un sélecteur qui DOIT être là avant la photo. À réserver aux
 * vues qui ouvrent un module différé : sans lui, le script capture l'écran
 * pendant que le fragment arrive encore, et rend une image qui a l'air normale.
 */
const VUES = [
  { hash: '#/pilote', nom: 'pilote', handoff: 'pilote' },
  /* Rien à ouvrir : l'écran s'ouvre sur la vue SEMAINE, comme le handoff.
     Il a porté `ouvrir: ['Semaine']` le temps que le mois reste la vue par
     défaut — et ce clic est devenu nuisible le jour où il ne l'a plus été :
     voir la note sur l'ancrage exact des libellés, plus bas. */
  { hash: '#/activite', nom: 'activite-planning', handoff: 'activite-plan-de-charge' },
  { hash: '#/activite', nom: 'activite-mois', handoff: 'activite-mois', ouvrir: ['Mois'] },
  /* Les jours fériés (22/11) : juin, le mois de l'horloge, n'en a aucun. Mai
     en a quatre — le 1ᵉʳ, le 8, l'Ascension le jeudi 14 et Pentecôte le 25 —,
     et la semaine du 11 porte l'Ascension en son milieu. Sans ces vues, aucune
     capture ne montrerait la teinte ni le nom. */
  /* `recharger` : le mois est celui de l'application, et il survit à un
     changement d'adresse. Sans rechargement, la vue du mois partait du mai
     laissé par la vue de la semaine, et « Mois précédent » photographiait
     avril. */
  /* Le pinceau (22/11) : en semaine, un geste POSÉ — « Toute la semaine »
     au pinceau de Studio Lumen, l'Ascension sautée et dite dans le message ;
     au mois, la barre en main, portée et lieu ouverts, avant tout geste. La
     barre arrive à la demande : on l'attend avant de cliquer. */
  { hash: '#/activite', nom: 'activite-planning-ferie', recharger: true,
    avantDOuvrir: '[role="group"][aria-label="Pinceau"]',
    ouvrir: ['Semaine précédente', 'Semaine précédente', 'Semaine précédente', 'Semaine précédente',
      'Pinceau Studio Lumen', 'Toute la semaine'] },
  { hash: '#/activite', nom: 'activite-mois-ferie', recharger: true,
    avantDOuvrir: '[role="group"][aria-label="Pinceau"]',
    ouvrir: ['Mois', 'Mois précédent', 'Pinceau Atelier Novak'] },
  /* Le carnet de commandes (lot 48) arrive avec son onglet, à la demande :
     sans l'attendre, la photo pouvait montrer « Chargement… ». */
  { hash: '#/activite', nom: 'activite-missions', handoff: 'activite-missions', ouvrir: ['Missions'],
    attendre: 'h2:has-text("Toutes les missions")' },
  /* Le compte rendu a quitté les Outils pour Activité (lot 51). La carte, puis
     l'atelier : un panneau qui ne s'ouvre qu'au clic n'apparaît sur aucune
     capture d'écran, et c'est justement là que les défauts se logent. */
  { hash: '#/activite', nom: 'activite-compte-rendu', handoff: 'outils-cra', ouvrir: ['Compte rendu'] },
  /* L'Analyse porte ce qui était le pilier Performance d'Argent. */
  { hash: '#/activite/analyse', nom: 'activite-analyse', handoff: 'argent-performance', attendre: 'text=CA facturé' },
  /* APRÈS l'Analyse, et pas juste après l'onglet Compte rendu : cliquer
     l'onglet écrit déjà `#/activite/compte-rendu`, et une adresse identique
     ne change rien — l'atelier ne s'ouvrait pas. Il s'ouvre quand on vient
     d'ailleurs, ce que fait l'action rapide du Pilote. */
  { hash: '#/activite/compte-rendu', nom: 'activite-compte-rendu-atelier', handoff: 'pilote-cra', attendre: '[role="dialog"]' },
  { hash: '#/factures', nom: 'factures', handoff: 'activite-factures', attendre: 'button:has-text("Nouvelle facture")' },
  /* Les factures émises dans un autre logiciel (22/11) : le même compte, le
     mode changé au profil. Sans ces vues, aucune capture ne montrerait les
     mois en attente ni le formulaire — qui ne s'ouvre qu'au clic. */
  { hash: '#/factures', nom: 'factures-externe', externe: true, attendre: 'h2:has-text("Les mois en attente")' },
  { hash: '#/factures', nom: 'factures-externe-enregistrer', externe: true,
    avantDOuvrir: 'h2:has-text("Les mois en attente")', ouvrir: ['Enregistrer la facture de mars 2026 pour Atelier Novak'],
    attendre: '[role="dialog"] label:has-text("Numéro de la facture")', cadre: true, hauteur: 1500 },
  { hash: '#/reglages/facturation', nom: 'reglages-facturation-externe', externe: true,
    attendre: 'text=relèvent alors de ce logiciel' },
  { hash: '#/factures/clients', nom: 'factures-clients', handoff: 'activite-clients', attendre: 'h2:has-text("Carnet")' },
  /* La rédaction, avec son aperçu vivant : elle s'apparie à
     `pilote-nouvelle-facture` du handoff. L'écran n'est pas une modale chez
     nous, mais c'est le même atelier : saisie à gauche, document à droite. */
  { hash: '#/facture/nouvelle', nom: 'facture-nouvelle', handoff: 'pilote-nouvelle-facture' },
  /* La composition d'un chiffre, panneau ouvert.
     Une vue à part, et non un détail de l'écran Pilote : le panneau ne s'ouvre
     qu'au clic, donc la capture de l'écran ne le montre jamais. C'est
     exactement le cas où « les tests sont verts et personne n'a regardé » — et
     le premier passage a produit un chevron collé au montant comme une
     virgule, que rien d'autre qu'un œil ne pouvait voir. Le libellé est un
     motif — le nom du bouton commence par le montant. */
  { hash: '#/pilote', nom: 'pilote-composition', handoff: 'pilote-composition', ouvrir: ['.*d’où vient ce chiffre'] },
  /* Le panneau s'ouvre par son adresse, comme l'action rapide et « + Nouveau »
     l'ouvrent : c'est le chemin que prend l'utilisateur, et il ne dépend pas de
     la présence d'une facture en retard dans la démo. */
  { hash: '#/pilote/encaissements', nom: 'pilote-encaissements', handoff: 'pilote-encaissements', attendre: 'text=Reste à encaisser' },
  /* La Trésorerie se compare à `direction/tresorerie.html` (lot 49). Ses
     cartes arrivent à la demande : on attend la dernière, les seuils. */
  { hash: '#/tresorerie', nom: 'tresorerie', handoff: 'argent-tresorerie', attendre: 'h2:has-text("Tes seuils de l’année")' },
  /* La vue Année, par son adresse : sans elle, aucune capture ne montrerait la
     capacité de versement, qui n'y vit plus que là. */
  { hash: '#/tresorerie/annee', nom: 'tresorerie-annee', attendre: 'h2:has-text("Ce que chaque mois te permettait de te verser")' },
  /* Le relevé n'avait pas de capture : un écran que rien ne photographie ne
     se compare à rien, et c'est sur lui que le lot 28 a posé « ignorée ». Il
     vit sous la Trésorerie depuis le lot 51, en plan de travail. */
  { hash: '#/tresorerie/releve', nom: 'tresorerie-releve', attendre: '[role="dialog"] h2:has-text("Importer un relevé")' },
  /* Obligations n'a pas d'homonyme au handoff : sa référence est la maquette
     `docs/design/direction/obligations.html`. */
  { hash: '#/obligations', nom: 'obligations', attendre: 'text=À faire et à venir' },
  /* Un dossier ouvert par son adresse, comme le flux du Pilote l'ouvre : au
     bureau, à droite de la liste ; au téléphone (`--largeur=390`), en volet
     — un panneau que la capture de l'écran ne montre jamais. */
  { hash: '#/obligations/urssaf-2026-T2', nom: 'obligations-dossier', attendre: 'text=Recettes à déclarer', cadreAuTelephone: true },
  { hash: '#/achats', nom: 'achats', handoff: 'achats' },
  { hash: '#/simulateurs', nom: 'simulateurs', handoff: 'outils-impot' },
  { hash: '#/reglages', nom: 'reglages-profil', handoff: 'config-profil' },
  /* Les autres sections des Réglages (lot 9), chacune appariée à sa capture
     du handoff. Chacune arrive à la demande : sans `attendre`, la photo
     montrait « Chargement… » et le contrôle visuel ne pouvait rien juger. */
  { hash: '#/reglages/fiscal', nom: 'reglages-fiscal', handoff: 'config-fiscal', attendre: 'text=Périodicité des cotisations' },
  { hash: '#/reglages/reserve', nom: 'reglages-reserve', handoff: 'config-reserve', attendre: 'text=Besoin mensuel' },
  { hash: '#/reglages/facturation', nom: 'reglages-facturation', handoff: 'config-facturation', attendre: 'label:has-text("IBAN")' },
  { hash: '#/reglages/donnees', nom: 'reglages-donnees', handoff: 'config-donnees', attendre: 'text=Archive complète (ZIP)' },
  /* Compte & synchronisation (22/11) : la maquette `direction/compte.html` en
     est la référence, état par état. Rien n'est relié ; le fil des étapes ;
     « Vérifier » qui dit où ça coince ; ton compte ; fermer les inscriptions ;
     relié. Chaque état part d'un appareil préparé (`compte`, voir
     `preparerCompte`) et d'un faux projet qui répond comme Supabase
     (`repondreCommeLeProjet`) : aucune requête ne sort. */
  { hash: '#/reglages/compte', nom: 'reglages-compte', handoff: 'config-cloud', attendre: 'text=Tes données sont sur cet appareil' },
  { hash: '#/reglages/compte', nom: 'reglages-compte-guide', compte: { guide: 2 }, attendre: 'text=Relier FREEL en cinq étapes' },
  { hash: '#/reglages/compte', nom: 'reglages-compte-verifier', compte: { guide: 3, projet: 'base-absente' },
    remplir: [['Adresse du projet', 'https://projet-demo.supabase.co/rest/v1/'], ['Clé publique (anon)', 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.factice']],
    ouvrir: ['Vérifier'], attendre: 'text=Base pas encore préparée' },
  { hash: '#/reglages/compte', nom: 'reglages-compte-ton-compte', compte: { guide: 4, relie: true }, attendre: 'text=4. Ton compte' },
  { hash: '#/reglages/compte', nom: 'reglages-compte-deconnecte', compte: { relie: true }, attendre: 'text=Un inconnu ne lit rien' },
  { hash: '#/reglages/compte', nom: 'reglages-compte-inscriptions', compte: { guide: 5, relie: true, connecte: true, projet: 'inscriptions-ouvertes' },
    attendre: 'text=Inscriptions encore ouvertes' },
  { hash: '#/reglages/compte', nom: 'reglages-compte-relie', compte: { relie: true, connecte: true, aJour: true }, attendre: 'text=Un inconnu ne lit rien' },
  /* La synchronisation automatique (lot 42) : la pastille du haut dans ses
     états, et « À choisir ». Rien n'est simulé dans la page : c'est le VRAI
     moteur, face au faux projet, qui produit chaque état — l'appareil a déjà
     synchronisé (`base`), et le projet répond selon `projet`. */
  { hash: '#/pilote', nom: 'synchro-a-jour', compte: { relie: true, connecte: true, aJour: true, base: true },
    attendre: '[data-etat="a-jour"]' },
  { hash: '#/pilote', nom: 'synchro-envoi', compte: { relie: true, connecte: true, aJour: true, base: true, projet: 'envoi-lent' },
    attendre: '[data-etat="envoi"]', reseauEnSuspens: true },
  { hash: '#/pilote', nom: 'synchro-hors-ligne', compte: { relie: true, connecte: true, aJour: true, base: true, projet: 'coupe' },
    attendre: '[data-etat="hors-ligne"]' },
  { hash: '#/pilote', nom: 'synchro-a-choisir', compte: { relie: true, connecte: true, aJour: true, base: true, projet: 'conflit' },
    attendre: '[data-etat="a-choisir"]' },
  { hash: '#/pilote', nom: 'synchro-reconnecte-toi',
    compte: { relie: true, connecte: true, expiree: true, aJour: true, base: true, projet: 'refus-session' },
    attendre: '[data-etat="reconnecter"]' },
  { hash: '#/reglages/compte', nom: 'reglages-compte-a-choisir',
    compte: { relie: true, connecte: true, aJour: true, base: true, projet: 'conflit' }, attendre: 'h3:has-text("À choisir")' },
  /* La question posée : avant de trancher, télécharger ce qu'on écarte. */
  { hash: '#/reglages/compte', nom: 'reglages-compte-a-choisir-garder',
    compte: { relie: true, connecte: true, aJour: true, base: true, projet: 'conflit' },
    avantDOuvrir: 'h3:has-text("À choisir")', ouvrir: ['Garder ce que j’ai ici'],
    attendre: 'text=Télécharger la version que tu écartes' },
  /* Affichage (lot 51) : la maquette `navigation.html` en est la référence. */
  { hash: '#/reglages/affichage', nom: 'reglages-affichage', attendre: 'text=Le thème choisi reste mémorisé' }
];

/* ── Le Compte : un appareil préparé, un projet factice ─────────────────── */

/** Un projet qui n'existe pas : le navigateur n'en sort jamais, `route` répond. */
const PROJET_FACTICE = 'https://projet-demo.supabase.co';
let projetCourant = 'pret';

/**
 * Pose, dans la page, ce qu'un appareil porte à cet état du parcours : l'étape
 * du guide (stockage de l'onglet), le projet relié, une session valable, et
 * des faits qui ne sont PAS la démonstration — reconnue, elle ne compte pas
 * comme des données, et l'écran relié dirait « rien à sauvegarder ».
 */
function preparerCompte({ guide, relie, connecte, expiree, aJour, base, jeu, projet }) {
  if (guide !== undefined) sessionStorage.setItem('freel.compte.guide', String(guide));
  if (relie) localStorage.setItem('freel.config.supabase.v1', JSON.stringify({ url: projet, cleAnon: 'eyJ.factice.anon' }));
  if (connecte) {
    localStorage.setItem('freel.session.supabase.v1', JSON.stringify({
      jeton: 'jeton-factice', jetonRafraichissement: 'renouv-factice',
      expireLe: expiree ? Date.now() - 1000 : Date.now() + 3_600_000,
      utilisateurId: '00000000-0000-0000-0000-000000000001', email: 'camille@exemple.test'
    }));
  }
  if (aJour) {
    sessionStorage.setItem('capture.faits', '1');
    localStorage.setItem('freel.faits.v1', JSON.stringify({ ...jeu, entreprise: { ...jeu.entreprise, nom: 'Atelier Exemple' } }));
  }
  /* Déjà synchronisé à la version 3, à 9 h 41. L'empreinte ne correspond à
     rien : le dossier compte comme « modifié depuis », ce qui fait envoyer,
     choisir ou attendre le réseau selon le projet — et, face à un compte
     identique, aligner sans rien écrire (« Synchronisé »). */
  if (base) {
    localStorage.setItem('freel.synchro.appareil.v1', JSON.stringify({
      compte: '00000000-0000-0000-0000-000000000001', version: 3, le: '2026-06-10T07:41:00.000Z',
      empreinte: 'capture', modifieLe: null
    }));
  }
}

function oublierCompte() {
  sessionStorage.clear();
  localStorage.removeItem('freel.config.supabase.v1');
  localStorage.removeItem('freel.session.supabase.v1');
  localStorage.removeItem('freel.synchro.appareil.v1');
}

/**
 * Le faux projet : ses réglages d'authentification, ses tables comptées à zéro
 * (ou absentes, pour l'état « base pas encore préparée »), et la ligne du
 * compte — les faits mêmes de l'appareil, d'où « à jour ».
 */
async function repondreCommeLeProjet(route, page) {
  const requete = route.request();
  const url = requete.url();
  const entetes = {
    'content-type': 'application/json', 'access-control-allow-origin': '*',
    'access-control-expose-headers': 'Content-Range'
  };
  if (requete.method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: { ...entetes, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  }
  // Lot 42 : un renouvellement refusé (jeton révoqué) — « Reconnecte-toi ».
  if (url.includes('/auth/v1/token') && projetCourant === 'refus-session') {
    return route.fulfill({ status: 400, headers: entetes, body: JSON.stringify({ error_description: 'Invalid Refresh Token' }) });
  }
  // Lot 42 : le réseau coupé, pour les faits seulement — « Hors ligne ».
  if (url.includes('/rest/v1/freel_faits?') && projetCourant === 'coupe') return route.abort('internetdisconnected');
  // Lot 42 : un envoi qui n'arrive pas avant la photo — « Envoi… ».
  if (url.includes('/rest/v1/freel_faits?') && requete.method() === 'PATCH' && projetCourant === 'envoi-lent') return undefined;
  if (url.includes('/auth/v1/settings')) {
    return route.fulfill({ status: 200, headers: entetes, body: JSON.stringify({
      disable_signup: projetCourant !== 'inscriptions-ouvertes', mailer_autoconfirm: false
    }) });
  }
  if (requete.method() === 'HEAD') {
    const absente = projetCourant === 'base-absente' || url.includes('/user_data');
    return route.fulfill({ status: absente ? 404 : 200, headers: { ...entetes, 'content-range': '*/0' } });
  }
  if (url.includes('/rest/v1/freel_faits?') && requete.method() === 'GET') {
    const faits = JSON.parse(await page.evaluate(() => localStorage.getItem('freel.faits.v1')) ?? 'null');
    /* Lot 42 : « conflit », le compte a avancé (version 4) avec un client
       saisi ailleurs ; « envoi-lent », il n'a pas bougé mais ne porte pas la
       même chose — l'appareil, modifié, envoie. */
    const ailleurs = faits === null ? null
      : { ...faits, clients: [...(faits.clients ?? []), { id: 'capture-ailleurs', nom: 'Client saisi au téléphone' }] };
    const ligne = projetCourant === 'conflit'
      ? { version: 4, faits: ailleurs }
      : projetCourant === 'envoi-lent' ? { version: 3, faits: ailleurs } : { version: 3, faits };
    return route.fulfill({ status: 200, headers: entetes, body: JSON.stringify(
      faits === null ? [] : [{ ...ligne, schema: faits.version, maj_le: '2026-06-10T07:41:00Z' }]
    ) });
  }
  return route.fulfill({ status: 200, headers: entetes, body: '[]' });
}

const themeDemande = argument('theme');
const PALETTES = ['calme', 'nuit', 'clair', 'sombre'];
if (themeDemande !== undefined && themeDemande !== '' && !PALETTES.includes(themeDemande)) {
  console.error(`Thème inconnu : « ${themeDemande} » (attendu : ${PALETTES.join(', ')}).`);
  process.exit(1);
}
const THEMES = themeDemande ? [themeDemande] : ['calme', 'nuit'];
const ecranDemande = argument('ecran');
const vues = ecranDemande ? VUES.filter((v) => v.nom.includes(ecranDemande)) : VUES;

if (vues.length === 0) {
  console.error(`Aucune vue ne correspond à « ${ecranDemande} ».`);
  process.exit(1);
}

/* La capture porte sur le BUILD, pas sur le serveur de développement : c'est
   la version que verra l'utilisateur, chargement différé des écrans compris.
   Un écran qui ne s'affiche qu'en développement est un écran cassé. */
console.log('Construction…');
await new Promise((resoudre, rejeter) => {
  const build = spawn('npm', ['run', 'build'], { cwd: join(RACINE, 'app'), stdio: 'inherit' });
  build.on('exit', (code) => (code === 0 ? resoudre() : rejeter(new Error(`build : ${code}`))));
});

const base = `http://127.0.0.1:${PORT}/`;
/*
 * LE PORT PRIS PAR UN AUTRE APERÇU. Avec `--strictPort`, notre aperçu meurt
 * aussitôt ; l'attente ci-dessous trouvait alors le serveur DÉJÀ là — celui
 * d'une autre copie du dépôt — et photographiait son build sans un mot : au
 * lot 42, la pastille capturée disait « Compte relié », le code d'avant.
 * On s'arrête, et `--port=` en choisit un autre.
 */
const occupe = await fetch(base).then(() => true, () => false);
if (occupe) {
  console.error(`Le port ${PORT} répond déjà : un autre aperçu l’occupe. Relance avec --port=<libre>.`);
  process.exit(1);
}
const apercu = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: join(RACINE, 'app'), stdio: 'ignore', detached: true });
// On attend que le serveur réponde plutôt que de dormir une durée choisie au
// hasard : trop courte elle rend le script instable, trop longue elle le rend
// pénible, et aucune des deux n'est juste sur toutes les machines.
for (let essai = 0; essai < 60; essai += 1) {
  try {
    const r = await fetch(base);
    if (r.ok) break;
  } catch { /* pas encore prêt */ }
  await new Promise((r) => setTimeout(r, 500));
}

mkdirSync(SORTIE, { recursive: true });

/* La langue du navigateur, pas seulement celle du contexte : le format d'un
   champ de date suit la langue du processus (`LANG`), et `locale` seul le
   laissait en « 04/28/2026 ». Essayé : `--lang=fr-FR` ne suffit pas. */
const navigateur = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--lang=fr'],
  env: { ...process.env, LANG: 'fr_FR.UTF-8', LANGUAGE: 'fr' }
});
const manquees = [];
let capturees = 0;

for (const theme of THEMES) {
  const LARGEUR = Number(argument('largeur') ?? 1440) || 1440;
  /* En français : le navigateur du bac à sable est en anglais, et les champs
     de date s'y photographiaient « mm/dd/yyyy » — ce que l'utilisateur ne
     voit jamais. Une capture qui ne montre pas l'écran réel ne prouve rien.
     Voir aussi le lancement, plus haut. */
  const contexte = await navigateur.newContext({
    viewport: { width: LARGEUR, height: 960 }, locale: 'fr-FR', timezoneId: 'Europe/Paris'
  });
  await contexte.addInitScript(
    ({ palette, faits, cle, maintenant }) => {
      window.localStorage.setItem('freel-v111-theme', palette);
      // Une vue du Compte pose ses propres faits (`preparerCompte`) et recharge :
      // les écraser ici les effacerait au rechargement.
      if (window.sessionStorage.getItem('capture.faits') === null) {
        window.localStorage.setItem(cle, JSON.stringify(faits));
      }
      /* L'horloge est figée AVANT tout script de la page : `Date.now()` et
         `new Date()` sans argument rendent la date du handoff. Sans cela, la
         moitié des chiffres — retards, échéances à venir, allure sur l'année —
         changerait d'un jour à l'autre, et une capture différente ne voudrait
         plus rien dire. */
      const fixe = new Date(maintenant).getTime();
      const Vraie = Date;
      // eslint-disable-next-line no-global-assign
      window.Date = class extends Vraie {
        constructor(...args) {
          if (args.length === 0) super(fixe); else super(...args);
        }
        static now() { return fixe; }
      };
    },
    { palette: theme, faits: JEU, cle: 'freel.faits.v1', maintenant: AUJOURDHUI }
  );

  const page = await contexte.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 160)));
  await contexte.route(`${PROJET_FACTICE}/**`, (route) => repondreCommeLeProjet(route, page));

  for (const vue of vues) {
    erreurs.length = 0;
    projetCourant = vue.compte?.projet ?? 'pret';
    /* Un envoi qui ne finit pas (« Envoi… ») garde une requête ouverte :
       `networkidle` l'attendait jusqu'à ce que l'application l'abandonne, et
       la photo montrait « Hors ligne ». Cette vue-là n'attend que la page. */
    const jusqua = vue.reseauEnSuspens === true ? 'load' : 'networkidle';
    /* Le mode « autre logiciel » : les faits de la démonstration, le profil
       changé, posés comme ceux du Compte — et retirés après la photo, par un
       rechargement, pour que la vue suivante retrouve la démonstration. */
    if (vue.hauteur !== undefined) await page.setViewportSize({ width: LARGEUR, height: vue.hauteur });
    if (vue.externe === true) {
      await page.goto(`${base}#/`, { waitUntil: 'networkidle' });
      await page.evaluate((faits) => {
        sessionStorage.setItem('capture.faits', '1');
        localStorage.setItem('freel.faits.v1', JSON.stringify(faits));
      }, { ...JEU, entreprise: { ...JEU.entreprise, emissionFactures: 'externe' } });
      await page.goto(base + vue.hash, { waitUntil: jusqua });
      await page.reload({ waitUntil: jusqua });
    }
    if (vue.compte !== undefined) {
      await page.goto(`${base}#/`, { waitUntil: 'networkidle' });
      await page.evaluate(preparerCompte, { ...vue.compte, jeu: JEU, projet: PROJET_FACTICE });
      await page.goto(base + vue.hash, { waitUntil: jusqua });
      await page.reload({ waitUntil: jusqua });
    }
    await page.goto(base + vue.hash, { waitUntil: jusqua });
    if (vue.recharger === true) await page.reload({ waitUntil: jusqua });
    // Les écrans sont chargés à la demande : on attend le titre, sinon on
    // capturerait l'écran d'attente. `h1:visible` parce qu'un changement de
    // hash laisse le précédent monté en `display: none` pendant la suspension.
    await page.waitForSelector('h1:visible', { timeout: 15000 }).catch(() => {});

    for (const [libelle, valeur] of vue.remplir ?? []) {
      const champ = page.getByLabel(libelle, { exact: true }).first();
      await champ.waitFor({ timeout: 15000 }).catch(() => {});
      await champ.fill(valeur).catch(() => {});
    }

    // Ce qui doit être là AVANT de cliquer : la carte « À choisir » n'apparaît
    // qu'une fois le compte lu, et le clic la cherchait trop tôt (lot 42).
    if (vue.avantDOuvrir) await page.waitForSelector(vue.avantDOuvrir, { timeout: 15000 }).catch(() => {});

    let ouverte = true;
    for (const libelle of vue.ouvrir ?? []) {
      /*
       * LES ONGLETS PAR PRÉFIXE, LES BOUTONS PAR NOM EXACT D'ABORD.
       *
       * Le préfixe seul sur les boutons a fait capturer un écran FAUX sans que
       * rien ne le signale : `^Semaine` désigne aussi bien le segment
       * « Semaine » de la bascule que le bouton « Semaine précédente » de
       * l'en-tête — et celui-ci vient avant dans le document. Le script
       * reculait donc d'une semaine, et la capture montrait le 1ᵉʳ juin là où
       * l'horloge était au 10. Le contrôle visuel comparait deux semaines
       * différentes, sans que la capture ait l'air anormale.
       *
       * Les ONGLETS gardent le préfixe : leur libellé peut porter un compte à
       * la suite — « Missions 5 » dans le handoff — et l'égalité stricte ne les
       * trouverait plus le jour où on l'ajoutera.
       */
      const cible = page.getByRole('tab', { name: new RegExp(`^${libelle}`) }).first();
      const exact = page.getByRole('button', { name: new RegExp(`^${libelle}$`) }).first();
      const secours = page.getByRole('button', { name: new RegExp(`^${libelle}`) }).first();
      const choisie = await cible.count() > 0 ? cible
        : await exact.count() > 0 ? exact
          : secours;

      if (await choisie.count() === 0) { ouverte = false; break; }
      await choisie.click({ timeout: 5000 }).catch(() => { ouverte = false; });
      await page.waitForTimeout(500);
    }

    if (!ouverte) {
      manquees.push(`${theme}-${vue.nom} (libellé « ${(vue.ouvrir ?? []).join(' › ')} » introuvable)`);
      continue;
    }

    /*
     * ATTENDRE CE QUE LA VUE PROMET.
     *
     * `networkidle` puis `h1:visible` ne suffisent pas quand la vue ouvre un
     * module DIFFÉRÉ : le titre de l'écran est déjà là, le script photographie,
     * et le fragment arrive après. La capture du générateur de CRA a été prise
     * exactement comme ça — l'onglet bien ouvert, l'atelier absent, et rien
     * dans le rapport pour le dire.
     */
    if (vue.attendre) {
      const arrive = await page.waitForSelector(vue.attendre, { timeout: 15000 })
        .then(() => true).catch(() => false);
      if (!arrive) {
        const etat = await page.locator('[data-etat]').first().getAttribute('data-etat', { timeout: 1000 }).catch(() => null);
        if (process.env.CAPTURE_ECHEC) await page.screenshot({ path: process.env.CAPTURE_ECHEC });
        manquees.push(`${theme}-${vue.nom} (« ${vue.attendre} » n’est jamais apparu${etat === null ? '' : ` ; synchronisation : ${etat}`})`);
        continue;
      }
      await page.waitForTimeout(400);
    }

    const suffixe = LARGEUR === 1440 ? '' : `-${LARGEUR}`;
    /* Un volet du téléphone est fixé à l'écran : photographié en pleine page,
       il flotte au milieu d'une image de trois écrans de haut. On prend alors
       ce que l'œil voit — l'écran, le volet ouvert dessus. */
    /* Un volet plus haut que l'écran (le formulaire d'une facture émise
       ailleurs) se photographie sur une fenêtre agrandie à sa hauteur
       (`hauteur`), et cadré (`cadre`) : en pleine page, seul son premier
       écran figurait, le dépôt du PDF et le bouton coupés. */
    const pleinePage = !((vue.cadreAuTelephone === true && LARGEUR < 761) || vue.cadre === true);
    await page.screenshot({ path: join(SORTIE, `${theme}-${vue.nom}${suffixe}.png`), fullPage: pleinePage });
    capturees += 1;
    if (vue.compte !== undefined) await page.evaluate(oublierCompte);
    if (vue.hauteur !== undefined) await page.setViewportSize({ width: LARGEUR, height: 960 });
    if (vue.externe === true) {
      await page.evaluate(() => sessionStorage.removeItem('capture.faits'));
      await page.reload({ waitUntil: jusqua });
    }
    if (erreurs.length > 0) {
      manquees.push(`${theme}-${vue.nom} capturé MAIS erreur JS : ${erreurs[0]}`);
    }
  }

  await contexte.close();
}

await navigateur.close();
// Le groupe entier : `npx` tué seul laissait `vite preview` tenir le port —
// c'est ainsi qu'un aperçu d'une autre copie occupait 4174 (voir plus haut).
try { process.kill(-apercu.pid); } catch { apercu.kill(); }

writeFileSync(join(SORTIE, 'INDEX.md'),
  '# Captures de l’application\n\n'
  + (JEU_ESSAI
    ? 'Générées par `app/scripts/capturer-app.mjs --jeu=essai` sur\n'
      + '`app/src/test/jeu-d-essai.json`, horloge figée au 15 décembre 2026.\n\n'
      + 'Ce compte est fictif mais de forme réelle : il ne se compare à aucune capture du\n'
      + 'handoff, il se REGARDE — champs vides, libellés qui débordent, graphes aplatis.\n\n'
    : 'Générées par `app/scripts/capturer-app.mjs` sur\n'
      + '`docs/design/jeu-de-demonstration.json`, horloge figée au 10 juin 2026.\n\n')
  + 'Les captures portent le nom de l’écran de l’application (lot 51). La colonne\n'
  + '« Handoff » donne son homonyme dans `docs/design/captures/` : c’est la paire\n'
  + 'que `controleur-visuel` compare. Sans homonyme, la référence est la maquette\n'
  + 'de `docs/design/direction/`.\n\n'
  + '**Ne pas retoucher à la main.**\n\n'
  + '| Capture | Écran | Handoff |\n|---|---|---|\n'
  + VUES.map((v) => `| \`${v.nom}\` | ${v.hash}${v.ouvrir ? ` › ${v.ouvrir.join(' › ')}` : ''} | `
    + `${v.handoff ? `\`${v.handoff}\`` : '—'} |`).join('\n')
  + '\n');

console.log(`\n${capturees} captures dans ${SORTIE}`);
if (manquees.length > 0) {
  console.log('À signaler :');
  for (const m of manquees) console.log(`  · ${m}`);
}
