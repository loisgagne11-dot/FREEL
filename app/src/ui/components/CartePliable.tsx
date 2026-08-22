import { useCallback, useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './CartePliable.module.css';

/**
 * Une carte qu'on peut replier — et qui, repliée, dit encore l'essentiel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE MÉCANISME QUE LE HANDOFF APPELLE « TRANSVERSAL, À CONSERVER »
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `freel-fold.js` était l'un des rares utilitaires que la spec de design
 * demandait explicitement de garder. Il n'avait pas été repris.
 *
 * Ce n'est pas un accordéon décoratif. Sa règle tient en une phrase, et c'est
 * elle qui fait la différence :
 *
 *   **Repliée, la carte affiche son en-tête PLUS sa synthèse.**
 *
 * Replier ne fait donc jamais perdre l'information : elle se condense. Une
 * carte « Achats » repliée continue de dire « 12 achats · 3 480 € TTC · 2
 * pièces manquantes ». Un accordéon ordinaire, lui, remplace le contenu par
 * rien — et l'utilisateur doit déplier pour savoir s'il a besoin de déplier.
 *
 * C'est ce qui rend le pli utilisable au quotidien : on replie ce qu'on a lu,
 * l'écran raccourcit, et rien ne disparaît.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉTAT EST CONSERVÉ, PAR ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Replier une carte à chaque visite serait un geste à refaire indéfiniment.
 * L'état vit dans `localStorage`, sous une clé par écran — comme dans la spec
 * (`freel-fold:<nom-de-fichier>`). Ce n'est pas un fait comptable : il ne va
 * ni dans le magasin, ni dans la sauvegarde, ni au compte distant. Une
 * préférence d'affichage qui voyagerait avec les données comptables serait une
 * confusion de nature.
 *
 * L'identité d'une carte est son `id`, pas son titre : renommer un intitulé ne
 * doit pas rouvrir toutes les cartes de quelqu'un.
 */
export function CartePliable(
  { id, ecran, titre, aide, resume, actions, children, deplieeParDefaut = true }: {
    /** Identité stable de la carte. Ne change pas quand le titre change. */
    readonly id: string;
    /** L'écran auquel elle appartient — l'état est conservé par écran. */
    readonly ecran: string;
    readonly titre: ReactNode;
    /**
     * L'explication « i », posée À CÔTÉ du bouton de pliage.
     *
     * ───────────────────────────────────────────────────────────────────────
     * ELLE NE PEUT PAS VIVRE DANS LE TITRE
     * ───────────────────────────────────────────────────────────────────────
     *
     * `Info` est un bouton, et un bouton dans un bouton est du HTML invalide.
     * Le navigateur ne se contente pas de le tolérer : à l'analyse, il FERME
     * le bouton extérieur et sort l'intérieur de son conteneur. L'explication
     * échappait donc au découpage du titre, se plaçait où sa largeur naturelle
     * la menait, et poussait la page hors de l'écran en portrait — trouvé par
     * le vérificateur responsive sur un titre un peu long.
     *
     * La règle était déjà écrite ici — « les commandes vivent hors du
     * bouton » — mais rien ne l'imposait. Ce paramètre l'impose.
     */
    readonly aide?: ReactNode;
    /**
     * Ce que la carte dit une fois repliée.
     *
     * Obligatoire, et c'est tout l'intérêt : une carte qui n'aurait rien à
     * dire repliée ne devrait pas être pliable, elle devrait être courte.
     */
    readonly resume: ReactNode;
    /** Commandes de l'en-tête. Leur clic ne plie pas la carte. */
    readonly actions?: ReactNode;
    readonly children: ReactNode;
    readonly deplieeParDefaut?: boolean;
  }
) {
  const [pliee, setPliee] = useState(() => lireEtat(ecran, id, !deplieeParDefaut));
  const idContenu = useId();

  useEffect(() => { ecrireEtat(ecran, id, pliee); }, [ecran, id, pliee]);

  const basculer = useCallback(() => setPliee((p) => !p), []);

  return (
    <section className={`${styles.carte} ${pliee ? styles.pliee : ''}`}>
      <header className={styles.entete}>
        {/*
          * Le bouton porte le TITRE, et rien d'autre.
          *
          * La spec note que les clics sur les commandes de l'en-tête ne doivent
          * pas plier la carte. Plutôt que d'intercepter les clics — fragile, et
          * invisible au clavier —, les commandes vivent hors du bouton. Une
          * zone cliquable qui contient d'autres zones cliquables est un piège
          * pour la souris comme pour les lecteurs d'écran.
          *
          * Le chevron est APRÈS le titre, pas avant : la référence le pose au
          * bord droit de la carte, et le titre garde `flex: 1` pour pousser le
          * chevron jusque-là. Il reste DANS ce même bouton — un chevron sorti
          * dans un élément à part aurait doublé la commande de pliage pour une
          * seule action, un piège au clavier comme au lecteur d'écran.
          */}
        <button
          type="button"
          className={styles.bascule}
          aria-expanded={!pliee}
          aria-controls={idContenu}
          onClick={basculer}
        >
          <span className={styles.titre}>{titre}</span>
          <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M8 5 L16 12 L8 19" fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {aide !== undefined && <span className={styles.aide}>{aide}</span>}

        {actions !== undefined && <div className={styles.actions}>{actions}</div>}
      </header>

      {/* La synthèse ne s'affiche QUE repliée : dépliée, elle répéterait ce que
          le contenu dit déjà, en moins précis. */}
      {pliee && <p className={styles.resume}>{resume}</p>}

      <div id={idContenu} className={styles.contenu} hidden={pliee}>
        {children}
      </div>
    </section>
  );
}

const cle = (ecran: string) => `freel.pli.${ecran}`;

/**
 * L'état des plis d'un écran.
 *
 * Toute lecture est enveloppée : en navigation privée `localStorage` lève à
 * l'accès, et une carte qui refuse de s'afficher parce qu'on n'a pas pu lire
 * une préférence d'affichage serait une panne pour un confort.
 */
function lireEtat(ecran: string, id: string, defaut: boolean): boolean {
  try {
    const brut = window.localStorage.getItem(cle(ecran));
    if (brut === null) return defaut;
    const o: unknown = JSON.parse(brut);
    if (typeof o !== 'object' || o === null) return defaut;
    const v = (o as Record<string, unknown>)[id];
    return typeof v === 'boolean' ? v : defaut;
  } catch {
    return defaut;
  }
}

function ecrireEtat(ecran: string, id: string, pliee: boolean): void {
  try {
    const brut = window.localStorage.getItem(cle(ecran));
    const o: Record<string, unknown> = brut === null ? {} : JSON.parse(brut) as Record<string, unknown>;
    o[id] = pliee;
    window.localStorage.setItem(cle(ecran), JSON.stringify(o));
  } catch {
    // Stockage indisponible : le pli vaudra pour la session courante.
  }
}
