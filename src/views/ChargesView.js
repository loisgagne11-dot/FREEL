/**
 * Vue Charges
 * TODO: Migrer depuis FREEL_V50.html
 */

import { el } from '../utils/dom.js';

export class ChargesView {
  render() {
    return el('div', { className: 'container' }, [
      el('h1', {}, 'Charges'),
      el('p', {}, 'Vue à implémenter - Migration depuis V50')
    ]);
  }

  destroy() {}
}
