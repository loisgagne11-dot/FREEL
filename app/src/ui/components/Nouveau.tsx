import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import styles from './Nouveau.module.css';
import menu from './Exporter.menu.module.css';

/**
 * Le bouton « + Nouveau » de la barre du haut : créer, d'où que l'on soit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CHAQUE ENTRÉE OUVRE LA SAISIE, PAS L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * « Nouvelle facture » qui déposerait sur la liste des factures obligerait à
 * chercher le bouton une seconde fois — le reproche exact fait à l'ancienne
 * version. Chaque entrée vise donc la sous-route qui OUVRE la saisie : la
 * rédaction, le formulaire de dépense, celui de mission, la carte des congés.
 *
 * Il vit dans `BarreActions`, déjà différé : il n'a pas besoin d'un second
 * chargement à la demande pour un menu de quatre liens.
 */
const ENTREES: readonly { readonly libelle: string; readonly href: string }[] = [
  { libelle: 'Facture', href: '#/facture/nouvelle' },
  { libelle: 'Dépense', href: '#/achats/depense' },
  { libelle: 'Mission', href: '#/activite/nouvelle-mission' },
  { libelle: 'Congés', href: '#/activite/conges' }
];

export function Nouveau() {
  const [ouvert, setOuvert] = useState(false);
  const enveloppe = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const liste = useRef<HTMLDivElement>(null);

  const elements = (): HTMLElement[] =>
    Array.from(liste.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!ouvert) return undefined;
    elements()[0]?.focus();
    // Le clic dehors ferme ; un clic sur le bouton est traité par sa propre
    // bascule, sinon le menu se fermerait puis se rouvrirait.
    function dehors(e: MouseEvent): void {
      if (e.target instanceof Node && enveloppe.current?.contains(e.target) === true) return;
      setOuvert(false);
    }
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, [ouvert]);

  function fermer(rendreLeFocus: boolean): void {
    setOuvert(false);
    if (rendreLeFocus) bouton.current?.focus();
  }

  function surTouche(e: KeyboardEvent): void {
    const items = elements();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const aller = (n: number): void => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    switch (e.key) {
      case 'Escape': e.preventDefault(); fermer(true); break;
      case 'ArrowDown': aller(i + 1); break;
      case 'ArrowUp': aller(i - 1); break;
      case 'Home': aller(0); break;
      case 'End': aller(items.length - 1); break;
      case 'Tab': fermer(false); break;
    }
  }

  return (
    <div className={styles.enveloppe} ref={enveloppe}>
      <button
        ref={bouton}
        type="button"
        className={styles.bouton}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
      >
        <span className={styles.plus} aria-hidden="true">+</span>
        <span className={styles.libelle}>Nouveau</span>
      </button>
      {ouvert && (
        <div className={menu.menu} role="menu" aria-label="Créer" ref={liste} onKeyDown={surTouche}>
          {ENTREES.map((e) => (
            <a key={e.href} role="menuitem" tabIndex={-1} className={menu.entree}
              href={e.href} onClick={() => fermer(false)}>
              {e.libelle}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
