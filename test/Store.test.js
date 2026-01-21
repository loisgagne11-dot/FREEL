/**
 * Tests unitaires pour Store.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from '../src/services/Store.js';

describe('Store', () => {
  let store;

  beforeEach(() => {
    store = new Store();
  });

  describe('get/set', () => {
    it('should set and get a value', () => {
      store.set('test', 'value');
      expect(store.get('test')).toBe('value');
    });

    it('should return undefined for non-existent keys', () => {
      expect(store.get('nonexistent')).toBeUndefined();
    });

    it('should update existing values', () => {
      store.set('test', 'value1');
      store.set('test', 'value2');
      expect(store.get('test')).toBe('value2');
    });
  });

  describe('update', () => {
    it('should update multiple values at once', () => {
      store.update({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3'
      });

      expect(store.get('key1')).toBe('value1');
      expect(store.get('key2')).toBe('value2');
      expect(store.get('key3')).toBe('value3');
    });
  });

  describe('on/emit', () => {
    it('should listen to value changes', () => {
      let called = false;
      let receivedValue = null;

      store.on('test', (value) => {
        called = true;
        receivedValue = value;
      });

      store.set('test', 'hello');

      expect(called).toBe(true);
      expect(receivedValue).toBe('hello');
    });

    it('should call multiple listeners', () => {
      let count = 0;

      store.on('test', () => count++);
      store.on('test', () => count++);
      store.on('test', () => count++);

      store.set('test', 'value');

      expect(count).toBe(3);
    });

    it('should emit wildcard events', () => {
      let wildCardCalled = false;
      let eventData = null;

      store.on('*', (data) => {
        wildCardCalled = true;
        eventData = data;
      });

      store.set('test', 'value');

      expect(wildCardCalled).toBe(true);
      expect(eventData.key).toBe('test');
      expect(eventData.value).toBe('value');
    });

    it('should unsubscribe listeners', () => {
      let count = 0;
      const unsubscribe = store.on('test', () => count++);

      store.set('test', 'value1');
      expect(count).toBe(1);

      unsubscribe();

      store.set('test', 'value2');
      expect(count).toBe(1); // Should not have incremented
    });

    it('should handle listener errors gracefully', () => {
      store.on('test', () => {
        throw new Error('Test error');
      });

      // Should not throw
      expect(() => store.set('test', 'value')).not.toThrow();
    });
  });

  describe('reset', () => {
    it('should reset state to default', () => {
      store.set('missions', [{ id: 1 }]);
      store.set('company', { name: 'Test' });

      store.reset();

      expect(store.get('missions')).toEqual([]);
      expect(store.get('company')).toBeNull();
    });

    it('should preserve theme when resetting', () => {
      store.set('theme', 'light');
      store.set('missions', [{ id: 1 }]);

      store.reset();

      expect(store.get('theme')).toBe('light');
      expect(store.get('missions')).toEqual([]);
    });

    it('should emit reset event', () => {
      let resetCalled = false;

      store.on('*', (data) => {
        if (data.type === 'reset') {
          resetCalled = true;
        }
      });

      store.reset();

      expect(resetCalled).toBe(true);
    });
  });

  describe('initial state', () => {
    it('should have correct default values', () => {
      const newStore = new Store();

      expect(newStore.get('company')).toBeNull();
      expect(newStore.get('missions')).toEqual([]);
      expect(newStore.get('theme')).toBe('dark');
      expect(newStore.get('privacyMode')).toBe(false);
      expect(newStore.get('view')).toBe('dashboard');
    });
  });
});
