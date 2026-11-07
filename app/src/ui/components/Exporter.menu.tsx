import { useEffect, useRef } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import { useFaits } from '../../state/store';
import { dateDuJour } from '../../state/selecteurs';
import { livreRecettesCsv } from '../../domain/calculs/livreRecettesCsv';
import { nomSauvegarde, telecharger } from '../../infra/telechargement';
import styles from './Exporter.menu.module.css';

type Entree =
  | { readonly libelle: string; readonly href: string }
  | { readonly libelle: string; readonly action: () => void };

interface Groupe { readonly titre: string; readonly entrees: readonly Entree[] }

export default function MenuExport(
  { annee, ancre, onFermer }: {
    readonly annee: number;
    readonly ancre: RefObject<HTMLElement | null>;
    readonly onFermer: (rendreLeFocus: boolean) => void;
  }
) {
  const faits = useFaits((e) => e.faits);
  const menu = useRef<HTMLDivElement>(null);

  const groupes: readonly Groupe[] = [
    {
      titre: 'Documents',
      entrees: [
        { libelle: 'Compte-rendu d’activité', href: '#/outils/cra' },
        // Une facture se télécharge depuis le facturier, seul endroit qui les
        // liste : exporter « toutes les factures » d'un coup n'existe pas.
        { libelle: 'Factures', href: '#/activite/factures' }
      ]
    },
    {
      titre: 'Comptable',
      entrees: [
        {
          libelle: `Livre des recettes ${annee} (CSV)`,
          action: () => telecharger(
            `livre-des-recettes-${annee}.csv`,
            livreRecettesCsv(faits.recettes, annee),
            'text/csv;charset=utf-8'
          )
        },
        {
          libelle: 'Sauvegarde complète (JSON)',
          action: () => telecharger(
            nomSauvegarde(faits.entreprise.nom, dateDuJour()),
            JSON.stringify(faits, null, 2),
            'application/json;charset=utf-8'
          )
        }
      ]
    }
  ];

  const elements = (): HTMLElement[] =>
    Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => { elements()[0]?.focus(); }, []);

  // Le clic dehors et Échap vivent sur le document : le menu peut avoir perdu
  // le focus (clic sur un fond) sans que l'utilisateur ait « fermé » quoi que ce soit.
  useEffect(() => {
    function dehors(e: MouseEvent): void {
      // L'ancre englobe le bouton : un clic sur lui est traité par son propre
      // gestionnaire (bascule), sinon le menu se fermerait puis se rouvrirait.
      if (ancre.current !== null && e.target instanceof Node && ancre.current.contains(e.target)) return;
      onFermer(false);
    }
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, [ancre, onFermer]);

  function surTouche(e: KeyboardEvent): void {
    const liste = elements();
    const i = liste.indexOf(document.activeElement as HTMLElement);
    const aller = (n: number): void => { e.preventDefault(); liste[(n + liste.length) % liste.length]?.focus(); };
    switch (e.key) {
      case 'Escape': e.preventDefault(); onFermer(true); break;
      case 'ArrowDown': aller(i + 1); break;
      case 'ArrowUp': aller(i - 1); break;
      case 'Home': aller(0); break;
      case 'End': aller(liste.length - 1); break;
      // Tab sort du menu : le laisser ouvert derrière le focus le rendrait orphelin.
      case 'Tab': onFermer(false); break;
    }
  }

  return (
    <div className={styles.menu} role="menu" aria-label="Exporter" ref={menu} onKeyDown={surTouche}>
      {groupes.map((g, k) => (
        <div key={g.titre} role="group" aria-label={g.titre}>
          {k > 0 && <div className={styles.separateur} role="separator" />}
          <div className={styles.legende} aria-hidden="true">{g.titre}</div>
          {g.entrees.map((entree) => 'href' in entree
            ? (
              <a key={entree.libelle} role="menuitem" tabIndex={-1} className={styles.entree}
                href={entree.href} onClick={() => onFermer(false)}>
                {entree.libelle}
              </a>
            )
            : (
              <button key={entree.libelle} type="button" role="menuitem" tabIndex={-1}
                className={styles.entree}
                onClick={() => { entree.action(); onFermer(true); }}>
                {entree.libelle}
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}
