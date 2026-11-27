/** @vitest-environment jsdom */

import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dateISO, euros } from '../../domain/types';
import { faitsVides } from '../../state/schema';
import { useFaits } from '../../state/store';
import { FournisseurToasts } from '../components/Toasts';
import { GenerateurCra } from './Outils.cra';

/*
 * LE MODULE DU PDF PEUT MANQUER AU MOMENT DU CLIC.
 *
 * Il n'est téléchargé qu'à ce moment-là : un déploiement entre l'ouverture
 * de la page et le clic, ou un réseau coupé, et il n'arrive pas. Un bouton
 * qui ne fait alors rien, sans un mot, se clique trois fois puis s'abandonne
 * — sans que l'utilisateur sache qu'« Imprimer » lui reste.
 */
vi.mock('../documents/craPdf', () => {
  throw new Error('Module introuvable après un déploiement');
});

afterEach(cleanup);

it('dit que le PDF n’a pas pu être préparé, et ce qui reste possible', async () => {
  const base = faitsVides();
  useFaits.setState({
    faits: {
      ...base,
      missions: [{
        id: 'm', clientId: null, clientNom: 'Client Alpha', description: 'Mission', tjm: euros(500),
        debut: dateISO('2026-06-01'), fin: dateISO('2026-06-30'), statut: 'active',
        entites: [{
          id: 'e', nom: 'Client Alpha', couleur: '#1f8b58',
          adresse: '', contact: '', email: '', telephone: '',
          rythmes: [{ du: dateISO('2026-06-01'), au: dateISO('2026-06-30'), parJour: { lun: 1 }, tjm: null }],
          ajustements: {}
        }]
      }]
    }
  });
  const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  render(<FournisseurToasts><GenerateurCra ouvert annee={2026} onFermer={() => {}} /></FournisseurToasts>);
  await userEvent.click(screen.getByRole('button', { name: 'Télécharger le PDF' }));

  expect(await screen.findByText(
    'Le PDF n’a pas pu être préparé — réessaie, ou passe par « Imprimer »', {}, { timeout: 4000 }
  )).toBeTruthy();
  expect(clic).not.toHaveBeenCalled();
});
