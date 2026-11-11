import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import styles from './ConfirmationSurPlace.module.css';

/**
 * Un geste qui ne se défait pas, confirmé là où on l'a demandé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DIRE CE QUI SE PERD, PAS « ÊTES-VOUS SÛR »
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Annuler par un avoir » se trouvait sur la même ligne que « Relancer » et
 * émettait d'un clic une écriture que rien ne défait — sur une facture
 * encaissée, un remboursement inscrit au livre à la date du jour, qui fait
 * baisser le chiffre d'affaires déclaré. Supprimer une dépense, une échéance,
 * une mission partait de même. Le lot 21 avait corrigé le seul relevé ; neuf
 * autres gestes attendaient.
 *
 * Une question générique ne sert à rien : on la valide par réflexe. La
 * confirmation porte donc la CONSÉQUENCE — ce qui part, ce qui reste, ce qui
 * change dans les chiffres —, que chaque appelant écrit pour son geste.
 *
 * Sur place plutôt qu'en fenêtre : la conséquence se lit à côté de la ligne
 * qu'elle concerne, et un panneau latéral déjà ouvert n'en empile pas un
 * second. Plutôt qu'un « Annuler » dans le toast, aussi : un toast de cinq
 * secondes, en `role="status"`, ne se rejoint pas au clavier à temps.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE FOCUS NE TOMBE PAS DANS LE VIDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le bouton cliqué disparaît pour laisser place à la confirmation : sans
 * relais, le focus retombait au début de la page (c'était le cas au relevé).
 * Il va sur « Garder », le choix sans conséquence — une frappe d'Entrée de
 * trop ne détruit rien —, et le groupe est nommé par la conséquence, que le
 * lecteur d'écran lit en y entrant. « Garder » ou Échap le rendent au bouton
 * d'origine.
 */
export function ConfirmationSurPlace(
  {
    libelle, precision, classeDeclencheur, consequence,
    libelleConfirmer, libelleGarder = 'Garder', onConfirmer, peutOuvrir
  }: {
    /** Le libellé du bouton d'origine. */
    readonly libelle: string;
    /**
     * Ce que le lecteur d'écran entend en plus — « — 2026-014, Client » —
     * quand le même bouton se répète ligne après ligne.
     */
    readonly precision?: string;
    readonly classeDeclencheur: string | undefined;
    /** Ce que le geste fait perdre ou change — jamais une simple question. */
    readonly consequence: ReactNode;
    readonly libelleConfirmer: string;
    readonly libelleGarder?: string;
    readonly onConfirmer: () => void;
    /**
     * Un geste que l'écriture refuserait (un client qui a des factures) ne
     * demande pas de confirmation : on la validerait pour s'entendre dire
     * non. L'appelant affiche le refus et rend `false`.
     */
    readonly peutOuvrir?: () => boolean;
  }
) {
  const [ouverte, setOuverte] = useState(false);
  const bouton = useRef<HTMLButtonElement | null>(null);
  // Rendre le focus au bouton seulement quand on revient d'une confirmation
  // gardée : au premier rendu, le voler serait un défaut bien pire.
  const rendreLeFocus = useRef(false);

  useEffect(() => {
    if (ouverte || !rendreLeFocus.current) return;
    rendreLeFocus.current = false;
    bouton.current?.focus();
  }, [ouverte]);

  function ouvrir(): void {
    if (peutOuvrir !== undefined && !peutOuvrir()) return;
    setOuverte(true);
  }

  function renoncer(): void {
    rendreLeFocus.current = true;
    setOuverte(false);
  }

  function confirmer(): void {
    onConfirmer();
    // Le plus souvent, le geste fait disparaître la ligne et ce composant
    // avec. S'il reste — l'écriture a refusé —, le bouton revient avec le
    // focus, plutôt qu'une confirmation qu'on vient de valider.
    renoncer();
  }

  if (!ouverte) {
    return (
      <button ref={bouton} type="button" className={classeDeclencheur} onClick={ouvrir}>
        {libelle}
        {/* L'espace HORS de la portée masquée : le calcul du nom accessible
            rogne celle qui ouvre un élément (« avoir— 2026-014 »). */}
        {precision !== undefined && (
          <>{' '}<span className={styles.horsEcran}>— {precision}</span></>
        )}
      </button>
    );
  }

  return (
    <BlocConfirmation
      consequence={consequence}
      libelleConfirmer={libelleConfirmer}
      libelleGarder={libelleGarder}
      onConfirmer={confirmer}
      onGarder={renoncer}
    />
  );
}

/**
 * La confirmation seule, pour l'appelant qui ne peut pas la poser à la place
 * du bouton.
 *
 * Le barème en est le cas : le bouton « Retirer » vit dans la dernière cellule
 * d'un tableau qui défile. La confirmation posée là élargissait le tableau et
 * en poussait les premières colonnes hors de la carte ; elle se pose sous le
 * tableau, et c'est l'appelant qui rend le focus au bouton.
 */
export function BlocConfirmation(
  { consequence, libelleConfirmer, libelleGarder = 'Garder', onConfirmer, onGarder }: {
    readonly consequence: ReactNode;
    readonly libelleConfirmer: string;
    readonly libelleGarder?: string;
    readonly onConfirmer: () => void;
    readonly onGarder: () => void;
  }
) {
  const garder = useRef<HTMLButtonElement | null>(null);
  const id = useId();

  useEffect(() => { garder.current?.focus(); }, []);

  return (
    <div
      className={styles.confirmation}
      role="group"
      aria-labelledby={`${id}-consequence`}
      onKeyDown={(e) => {
        // Échap renonce à la confirmation, pas au panneau qui la contient :
        // le panneau écoute le document, on l'arrête avant.
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        onGarder();
      }}
    >
      <p id={`${id}-consequence`} className={styles.consequence}>{consequence}</p>
      <span className={styles.actions}>
        <button type="button" className={styles.confirmer} onClick={onConfirmer}>
          {libelleConfirmer}
        </button>
        <button ref={garder} type="button" className={styles.garder} onClick={onGarder}>
          {libelleGarder}
        </button>
      </span>
    </div>
  );
}
