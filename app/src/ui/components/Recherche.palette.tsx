import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useFaits } from '../../state/store';
import {
  LIBELLE_NATURE, NATURES, construireIndex, rechercher, type ResultatRecherche
} from '../../domain/calculs/recherche';
import { eurExact } from '../format';
import { Montant } from './Montant';
import styles from './Recherche.palette.module.css';

/**
 * La palette de recherche — chargée à la demande par `Recherche`.
 *
 * Une boîte de dialogue modale qui suit le motif « combobox » : le focus reste
 * dans le champ, et ↑ ↓ déplacent une option ACTIVE déclarée par
 * `aria-activedescendant`. Faire passer le focus réel de ligne en ligne
 * obligerait à le rendre au champ à chaque frappe, et un lecteur d'écran
 * annoncerait chaque ligne comme une nouvelle page.
 */
export default function Palette({ onFermer }: { readonly onFermer: () => void }) {
  const faits = useFaits((e) => e.faits);
  const [requete, setRequete] = useState('');
  const [active, setActive] = useState(0);
  const champ = useRef<HTMLInputElement>(null);
  const id = useId();

  // L'index se reconstruit quand les faits changent, pas à chaque frappe.
  const index = useMemo(() => construireIndex(faits), [faits]);
  const resultats = useMemo(() => rechercher(index, requete), [index, requete]);

  useEffect(() => { champ.current?.focus(); }, []);

  function aller(r: ResultatRecherche): void {
    // Fermer d'abord : le changement de route démonte parfois l'écran sous la
    // palette, et le focus doit être rendu avant.
    onFermer();
    window.location.hash = r.href;
  }

  function surTouche(e: KeyboardEvent): void {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        onFermer();
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (resultats.length > 0) setActive((a) => (a + 1) % resultats.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (resultats.length > 0) setActive((a) => (a - 1 + resultats.length) % resultats.length);
        break;
      case 'Enter': {
        const r = resultats[active];
        if (r !== undefined) { e.preventDefault(); aller(r); }
        break;
      }
      case 'Tab':
        // Le champ est le seul élément focalisable : laisser Tab sortir de la
        // boîte modale mettrait le focus derrière le voile.
        e.preventDefault();
        break;
    }
  }

  const idOption = (i: number): string => `${id}-opt-${i}`;
  let position = 0;

  return (
    <div className={styles.voile} onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div
        className={styles.boite}
        role="dialog"
        aria-modal="true"
        aria-label="Rechercher"
        onKeyDown={surTouche}
      >
        <input
          ref={champ}
          className={styles.saisie}
          type="search"
          role="combobox"
          aria-label="Rechercher une facture, un client, une mission, une dépense"
          aria-expanded={resultats.length > 0}
          aria-controls={`${id}-liste`}
          aria-activedescendant={resultats.length > 0 ? idOption(active) : undefined}
          aria-autocomplete="list"
          placeholder="Une facture, un client, un montant…"
          autoComplete="off"
          value={requete}
          onChange={(e) => { setRequete(e.target.value); setActive(0); }}
        />

        <div id={`${id}-liste`} role="listbox" aria-label="Résultats" className={styles.liste}>
          {NATURES.map((nature) => {
            const groupe = resultats.filter((r) => r.nature === nature);
            if (groupe.length === 0) return null;
            return (
              <div key={nature} role="group" aria-labelledby={`${id}-g-${nature}`}>
                <div id={`${id}-g-${nature}`} className={styles.groupe}>{LIBELLE_NATURE[nature]}</div>
                {groupe.map((r) => {
                  const i = position++;
                  return (
                    <div
                      key={`${r.nature}-${r.id}`}
                      id={idOption(i)}
                      role="option"
                      aria-selected={i === active}
                      className={i === active ? `${styles.option} ${styles.optionActive}` : styles.option}
                      onMouseMove={() => setActive(i)}
                      onClick={() => aller(r)}
                    >
                      <span className={styles.texte}>
                        <span className={styles.titre}>{r.titre}</span>
                        {r.detail !== '' && <span className={styles.detail}>{r.detail}</span>}
                      </span>
                      {r.montant !== null && (
                        <span className={styles.montant}><Montant>{eurExact(r.montant)}</Montant></span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {requete.trim() !== '' && resultats.length === 0 && (
          <p className={styles.vide} role="status">Rien ne correspond à « {requete.trim()} ».</p>
        )}
        <p className={styles.aide} aria-hidden="true">↑ ↓ pour choisir · Entrée pour ouvrir · Échap pour fermer</p>
      </div>
    </div>
  );
}
