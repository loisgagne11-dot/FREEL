import { Component, type ReactNode } from 'react';
import { CLE_STOCKAGE } from '../../state/schema';
import { dateDuJour } from '../../state/selecteurs';

/**
 * Ce qu'on montre quand un écran lève une exception, au lieu d'un écran blanc.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN FILET, ALORS QUE LA VALIDATION REFUSE DÉJÀ LES BLOCS ABÎMÉS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La validation à l'entrée vérifie des formes, pas tout ce qu'un écran lira.
 * Le jour où quelque chose lui échappe, React démonte l'arbre entier : il ne
 * reste qu'une page vide, sans message, et la seule issue qu'on trouve seul
 * est de vider le stockage du navigateur — c'est-à-dire de tout perdre.
 *
 * Le filet dit donc trois choses : tes données n'ont pas été touchées, voici
 * de quoi les garder telles qu'elles sont enregistrées, voici de quoi
 * réessayer. Le téléchargement lit le stockage DIRECTEMENT, sans passer par le
 * magasin : c'est peut-être lui qui a cédé.
 *
 * Deux portées. Autour de l'écran, le rail reste utilisable et on peut aller
 * ailleurs (la clé de route remet le filet à zéro). Autour de l'application,
 * pour ce qui tombe dans la coquille elle-même — le compteur « à traiter »
 * calcule sur tous les faits à chaque rendu.
 */
interface Proprietes {
  readonly portee: 'ecran' | 'application';
  readonly children: ReactNode;
}

interface Etat {
  readonly erreur: Error | null;
}

/** Ce qui est enregistré dans le navigateur, tel quel — même illisible. */
function donneesBrutes(): string | null {
  try {
    return globalThis.localStorage?.getItem(CLE_STOCKAGE) ?? null;
  } catch {
    return null;
  }
}

function telechargerDonneesBrutes(contenu: string): void {
  const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = `freel-donnees-brutes-${dateDuJour()}.json`;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  // Révoquer dans la même tâche annule le téléchargement sur certains
  // navigateurs : on laisse au clic le temps d'aboutir.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const styleCadre = {
  maxWidth: '560px', margin: '48px auto', padding: '20px 22px',
  background: 'var(--panel)', border: '1px solid var(--red-line)', borderRadius: '12px',
  color: 'var(--text)', display: 'grid', gap: '12px'
} as const;

const styleBouton = {
  font: 'inherit', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
  background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--line-2)'
} as const;

export class FiletErreur extends Component<Proprietes, Etat> {
  override state: Etat = { erreur: null };

  static getDerivedStateFromError(erreur: unknown): Etat {
    return { erreur: erreur instanceof Error ? erreur : new Error(String(erreur)) };
  }

  override render(): ReactNode {
    const { erreur } = this.state;
    if (erreur === null) return this.props.children;

    const application = this.props.portee === 'application';
    const brutes = donneesBrutes();
    return (
      <section role="alert" style={styleCadre}>
        <strong style={{ fontSize: '16px' }}>
          {application ? 'L’application n’a pas pu s’afficher.' : 'Cet écran n’a pas pu s’afficher.'}
        </strong>
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Tes données enregistrées n’ont pas été modifiées.
          {brutes !== null && ' Télécharge-les telles quelles et garde le fichier : il permet de tout retrouver.'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {brutes !== null && (
            <button type="button" style={styleBouton} onClick={() => telechargerDonneesBrutes(brutes)}>
              Télécharger mes données brutes
            </button>
          )}
          <button
            type="button"
            style={styleBouton}
            onClick={() => (application ? globalThis.location.reload() : this.setState({ erreur: null }))}
          >
            {application ? 'Recharger' : 'Réessayer'}
          </button>
        </div>
        <details style={{ color: 'var(--muted)', fontSize: '12px' }}>
          <summary style={{ cursor: 'pointer' }}>Détail technique</summary>
          <code style={{ overflowWrap: 'anywhere' }}>{erreur.message}</code>
        </details>
      </section>
    );
  }
}
