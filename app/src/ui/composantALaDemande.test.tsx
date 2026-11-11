// @vitest-environment jsdom
import { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { composantALaDemande, sousRouteSiEcran } from './composantALaDemande';

describe('composantALaDemande — plus de repli une fois le code arrivé', () => {
  it('rend le composant tout de suite quand son module est déjà arrivé', async () => {
    const Carte = composantALaDemande(() => Promise.resolve(() => <p>contenu de la carte</p>));
    Carte.lancer();
    // Laisse la promesse partagée se résoudre, comme le préchargement au repos.
    await new Promise((ok) => setTimeout(ok, 0));

    render(<Suspense fallback={<p>Chargement…</p>}><Carte /></Suspense>);

    // `getBy` et non `findBy` : c'est l'absence de repli qui est la règle.
    // Si le composant suspendait encore, React montrerait « Chargement… » et
    // retiendrait la révélation 300 ms, soit dix fois le temps de chargement.
    expect(screen.getByText('contenu de la carte')).toBeTruthy();
    expect(screen.queryByText('Chargement…')).toBeNull();
  });

  it('garde le repli tant que le module n’est pas arrivé', async () => {
    let arriver: (c: () => React.JSX.Element) => void = () => undefined;
    const Lente = composantALaDemande(
      () => new Promise<() => React.JSX.Element>((ok) => { arriver = ok; })
    );

    render(<Suspense fallback={<p>Chargement…</p>}><Lente /></Suspense>);
    expect(screen.getByText('Chargement…')).toBeTruthy();

    arriver(() => <p>enfin là</p>);
    expect(await screen.findByText('enfin là')).toBeTruthy();
  });
});

describe('sousRouteSiEcran — ne précharger que ce que l’adresse désigne', () => {
  it('rend la sous-route quand l’adresse désigne l’écran', () => {
    expect(sousRouteSiEcran('config', '#/config/fiscal')).toBe('fiscal');
    expect(sousRouteSiEcran('config', '#/config')).toBe('');
  });

  it('rend null quand l’adresse désigne un autre écran', () => {
    // Le module de Config peut arriver au repos pendant qu'on lit Argent :
    // charger alors la section « fiscal » téléchargerait ce qu'on ne regarde pas.
    expect(sousRouteSiEcran('config', '#/argent/fiscal')).toBeNull();
  });
});
