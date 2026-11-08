// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros, ratio } from '../../domain/types';
import { type Depense, type Faits, faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import {
  type Justificatif, type StockageJustificatifs, empreinteDe, stockageMemoireJustificatifs
} from '../../infra/justificatifs';
import { construireArchive } from '../../infra/justificatifs.archive';
import { CLE_DERNIERE_ARCHIVE } from '../../infra/archive.derniere';
import { FournisseurToasts } from '../components/Toasts';
import { Donnees } from './Config.donnees';
import RappelArchive from './Achats.archive';

/*
 * L'archive des justificatifs, vue de l'écran.
 *
 * Le module d'archive a ses propres tests (format, empreintes, refus). Ceux-ci
 * tiennent ce que l'écran PROMET : qu'il dit quand les pièces n'existent que
 * dans ce navigateur, que l'archive part en téléchargement, et que les deux
 * gestes de restauration font ce que leur libellé annonce — en particulier
 * qu'« Ajouter seulement les pièces manquantes » ne touche pas aux faits.
 */

function depense(m: Partial<Depense> = {}): Depense {
  return {
    id: 'dep-1', libelle: 'Abonnement', fournisseur: 'Fournisseur démo', provenance: 'france',
    montantTtc: euros(89), tauxTva: ratio(0.20), payeeLe: dateISO('2026-03-14'),
    justificatifId: 'piece-1', rapprochement: 'en_attente', ...m
  };
}

async function piece(id: string, depenseId: string, texte: string): Promise<Justificatif> {
  const contenu = new Blob([texte], { type: 'application/pdf' });
  return {
    id, nomFichier: `${id}.pdf`, typeMime: 'application/pdf', taille: contenu.size,
    empreinte: await empreinteDe(contenu), deposeLe: '2026-03-15T10:00:00.000Z',
    fait: { nature: 'depense', id: depenseId }, contenu
  };
}

async function stockageAvec(...pieces: Justificatif[]): Promise<ReturnType<typeof stockageMemoireJustificatifs>> {
  const s = stockageMemoireJustificatifs();
  for (const p of pieces) await s.deposer(p);
  return s;
}

function faitsAvec(depenses: readonly Depense[]): Faits {
  return { ...faitsVides(), depenses: [...depenses] };
}

function afficher(stockage: StockageJustificatifs) {
  render(<FournisseurToasts><Donnees stockage={stockage} /></FournisseurToasts>);
  return userEvent.setup();
}

/** Les téléchargements partent par un lien cliqué : on relève leurs noms. */
const telecharges: string[] = [];
const creerUrl = URL.createObjectURL;
const cliquer = HTMLAnchorElement.prototype.click;

beforeEach(() => {
  telecharges.length = 0;
  URL.createObjectURL = (() => 'blob:essai') as typeof URL.createObjectURL;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    telecharges.push(this.download);
  };
  localStorage.removeItem(CLE_DERNIERE_ARCHIVE);
  useFaits.setState({ faits: faitsVides(), chargement: { phase: 'initial' } });
});

afterEach(() => {
  cleanup();
  URL.createObjectURL = creerUrl;
  HTMLAnchorElement.prototype.click = cliquer;
  vi.restoreAllMocks();
});

describe('l’archive complète', () => {
  /**
   * Une sauvegarde à laquelle personne ne pense ne protège rien : tant
   * qu'aucune archive n'a été faite ici, l'écran dit que les pièces n'existent
   * que dans ce navigateur.
   */
  it('dit que les pièces n’existent qu’ici, puis qu’elles sont toutes archivées', async () => {
    useFaits.setState({ faits: faitsAvec([depense()]) });
    const utilisateur = afficher(await stockageAvec(await piece('piece-1', 'dep-1', 'facture')));

    expect(await screen.findByText(/Jamais archivés depuis ce navigateur/)).toBeTruthy();

    await utilisateur.click(screen.getByRole('button', { name: 'Créer l’archive complète (ZIP)' }));

    await waitFor(() => expect(telecharges).toHaveLength(1));
    expect(telecharges[0]).toMatch(/archive.*\.zip$/);
    expect(await screen.findByText(/tous tes justificatifs y sont/)).toBeTruthy();
    expect(localStorage.getItem(CLE_DERNIERE_ARCHIVE)).not.toBeNull();
  });
});

describe('la restauration d’une archive', () => {
  async function archiveDe(faits: Faits, pieces: readonly Justificatif[]): Promise<File> {
    const { archive } = await construireArchive(faits, await stockageAvec(...pieces), new Date());
    return new File([archive], 'freel-archive.zip', { type: 'application/zip' });
  }

  /**
   * Le geste de qui change de navigateur : ses faits sont déjà là (compte
   * relié, sauvegarde JSON), seules les pièces manquent. Adopter les faits de
   * l'archive écraserait des saisies plus récentes.
   */
  it('« Ajouter seulement les pièces manquantes » restaure les pièces sans toucher aux faits', async () => {
    const fichier = await archiveDe(faitsAvec([depense()]), [await piece('piece-1', 'dep-1', 'facture')]);
    const recents = faitsAvec([depense(), depense({ id: 'dep-2', justificatifId: null, fournisseur: 'Autre démo' })]);
    useFaits.setState({ faits: recents });
    const ici = stockageMemoireJustificatifs();
    const utilisateur = afficher(ici);

    await utilisateur.upload(screen.getByLabelText('Restaurer une sauvegarde'), fichier);
    const confirmation = await screen.findByRole('alert');
    expect(confirmation.textContent).toMatch(/1\s*justificatif/);

    await utilisateur.click(within(confirmation).getByRole('button', { name: 'Ajouter seulement les pièces manquantes' }));

    // Attendre la FIN du geste (son message), pas l'arrivée de la pièce :
    // une adoption des faits, si elle avait lieu, viendrait après.
    expect(await screen.findByText(/1 pièce\(s\) ajoutée\(s\)/)).toBeTruthy();
    expect(ici.contenu.has('piece-1')).toBe(true);
    expect(useFaits.getState().faits.depenses).toHaveLength(2);
  });

  it('« Tout remplacer » restaure les pièces puis les faits de l’archive', async () => {
    const fichier = await archiveDe(faitsAvec([depense()]), [await piece('piece-1', 'dep-1', 'facture')]);
    const ici = stockageMemoireJustificatifs();
    const utilisateur = afficher(ici);

    await utilisateur.upload(screen.getByLabelText('Restaurer une sauvegarde'), fichier);
    const confirmation = await screen.findByRole('alert');
    await utilisateur.click(within(confirmation).getByRole('button', { name: 'Tout remplacer par cette archive' }));

    await waitFor(() => expect(useFaits.getState().faits.depenses[0]?.id).toBe('dep-1'));
    expect(ici.contenu.get('piece-1')?.empreinte).toBe((await piece('piece-1', 'dep-1', 'facture')).empreinte);
  });

  /** Remplacer les faits détache les pièces d'ici qui n'y ont plus de fait : il faut le dire avant. */
  it('annonce les pièces d’ici qui se retrouveraient sans fait', async () => {
    const fichier = await archiveDe(faitsVides(), []);
    useFaits.setState({ faits: faitsAvec([depense()]) });
    const utilisateur = afficher(await stockageAvec(await piece('piece-1', 'dep-1', 'facture')));
    await screen.findByText(/Jamais archivés/);

    await utilisateur.upload(screen.getByLabelText('Restaurer une sauvegarde'), fichier);
    expect((await screen.findByRole('alert')).textContent).toMatch(/1 justificatif\(s\) déposé\(s\) ici\s+ne correspondront plus/);
  });

  /**
   * Sur téléphone, la confirmation tombait trois cents pixels sous le bouton
   * qui l'avait demandée : on choisissait un fichier, rien ne semblait venir.
   */
  it('amène la confirmation à l’écran et y place le focus', async () => {
    // jsdom n'implémente pas `scrollIntoView` : on le pose le temps du test.
    const defiler = vi.fn();
    Element.prototype.scrollIntoView = defiler;
    try {
      const fichier = await archiveDe(faitsAvec([depense()]), [await piece('piece-1', 'dep-1', 'facture')]);
      const utilisateur = afficher(stockageMemoireJustificatifs());

      await utilisateur.upload(screen.getByLabelText('Restaurer une sauvegarde'), fichier);
      const confirmation = await screen.findByRole('alert');
      await waitFor(() => expect(defiler).toHaveBeenCalled());
      expect(document.activeElement).toBe(confirmation);
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  it('dit pourquoi un ZIP qui n’est pas une archive de l’application est refusé', async () => {
    const utilisateur = afficher(stockageMemoireJustificatifs());
    await utilisateur.upload(
      screen.getByLabelText('Restaurer une sauvegarde'),
      new File(['pas un zip'], 'autre.zip', { type: 'application/zip' })
    );
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).not.toMatch(/Tout remplacer/);
    expect(alerte.textContent?.length).toBeGreaterThan(10);
  });
});

describe('le rappel sur Achats', () => {
  it('compte les pièces jamais archivées, et se tait une fois l’archive faite', async () => {
    const stockage = await stockageAvec(
      await piece('piece-1', 'dep-1', 'a'), await piece('piece-2', 'dep-1', 'b')
    );
    render(<RappelArchive stockage={stockage} />);
    expect(await screen.findByText(/2\s*justificatifs pas encore archivés/)).toBeTruthy();
    cleanup();

    localStorage.setItem(CLE_DERNIERE_ARCHIVE, '2026-04-01T00:00:00.000Z');
    render(<RappelArchive stockage={stockage} />);
    await waitFor(() => expect(screen.queryByText(/pas encore archivé/)).toBeNull());
  });
});
