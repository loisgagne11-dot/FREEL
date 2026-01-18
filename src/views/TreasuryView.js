/**
 * Vue Trésorerie
 * TODO: Migrer depuis FREEL_V50.html
 */

import { el } from '../utils/dom.js';

export class TreasuryView {
  render() {
    return el('div', { className: 'container' }, [
      el('h1', {}, 'Trésorerie'),
      el('p', {}, 'Vue à implémenter - Migration depuis V50')
    ]);
  }

  destroy() {}
}
