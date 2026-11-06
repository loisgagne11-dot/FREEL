import type { ReactNode } from 'react';
import { documentAutonome, imprimer, nomDeFichier, telecharger } from '../../infra/telechargement';
import { useToast } from '../components/Toasts';
import { FEUILLE_DOCUMENT } from './feuille';
import styles from './Apercu.module.css';

/**
 * Le cadre qui montre un document, et les deux façons de l'en sortir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN SEUL CADRE POUR TOUS LES DOCUMENTS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le compte rendu d'activité et la facture ont le même besoin : un papier
 * clair sur un fond neutre, sa feuille de style injectée telle quelle, et un
 * repère que l'impression et le téléchargement viennent lire. Écrits deux
 * fois, ils auraient fini par ne plus rendre le même papier — et l'aperçu
 * cesserait de dire la vérité sur ce qui part chez le client.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'APERÇU EST LA SOURCE, PAS UNE COPIE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `sortir` sérialise le nœud qu'on vient de montrer. Reconstruire le document
 * une seconde fois pour le fichier laisserait les deux diverger, et
 * l'utilisateur enverrait au client un papier qu'il n'a pas relu.
 */
export function Apercu({ children }: { readonly children: ReactNode }) {
  return (
    <div className={styles.cadre}>
      {/* La feuille du document, injectée telle quelle : c'est la MÊME chaîne
          que le fichier téléchargé emporte. Deux styles pour un document,
          c'est un aperçu qui ment — voir `documents/feuille.ts`. */}
      <style>{FEUILLE_DOCUMENT}</style>
      <div className={styles.papier} data-papier>{children}</div>
    </div>
  );
}

/**
 * Imprimer ou télécharger le document actuellement à l'écran.
 *
 * `morceaux` compose le nom du fichier — « CRA », le mois, le client. Ils sont
 * nettoyés par `nomDeFichier` : un nom de client contenant une barre oblique
 * produirait sinon un chemin, et un fichier introuvable.
 */
export function useSortieDocument(): (
  action: 'imprimer' | 'telecharger',
  titre: string,
  morceaux: readonly string[]
) => void {
  const toast = useToast();

  return (action, titre, morceaux) => {
    const papier = document.querySelector<HTMLElement>('[data-papier]');
    if (papier === null) return;
    const contenu = documentAutonome(titre, FEUILLE_DOCUMENT, papier.innerHTML);

    if (action === 'telecharger') {
      const nom = `${nomDeFichier(...morceaux)}.html`;
      telecharger(nom, contenu);
      toast(`${nom} téléchargé`);
      return;
    }
    if (!imprimer(contenu)) {
      toast('Impression refusée par le navigateur — utilise « Télécharger »');
    }
  };
}
