/** Abstraction du stockage persistant (localStorage dans le navigateur / WebView mobile). */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

export class LocalStore implements KeyValueStore {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('Sauvegarde impossible', e);
    }
  }
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignoré */
    }
  }
  keys(): string[] {
    try {
      return Object.keys(localStorage);
    } catch {
      return [];
    }
  }
}

/** Stockage mémoire (tests, navigation privée). */
export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  get(key: string): string | null {
    return this.m.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.m.set(key, value);
  }
  remove(key: string): void {
    this.m.delete(key);
  }
  keys(): string[] {
    return [...this.m.keys()];
  }
}
