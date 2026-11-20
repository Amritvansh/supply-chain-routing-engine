/**
 * Safe LocalStorage Wrapper
 *
 * Gracefully handles environments where window.localStorage is restricted
 * (e.g. iframes, strict tracking prevention, disabled cookies/storage)
 * by falling back to an in-memory store instead of throwing SecurityError.
 */

const memoryStore = new Map();

function isLocalStorageAvailable() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const hasStorage = isLocalStorageAvailable();

export const storage = {
  getItem(key) {
    try {
      if (hasStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // Fallback on error
    }
    return memoryStore.get(key) ?? null;
  },

  setItem(key, value) {
    const stringValue = String(value);
    try {
      if (hasStorage) {
        window.localStorage.setItem(key, stringValue);
        return;
      }
    } catch {
      // Fallback on error
    }
    memoryStore.set(key, stringValue);
  },

  removeItem(key) {
    try {
      if (hasStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch {
      // Fallback on error
    }
    memoryStore.delete(key);
  },

  clear() {
    try {
      if (hasStorage) {
        window.localStorage.clear();
        return;
      }
    } catch {
      // Fallback on error
    }
    memoryStore.clear();
  },
};

export default storage;
