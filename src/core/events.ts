/** Bus d'événements minimal et typé. */
export class EventBus<E extends { type: string }> {
  private handlers = new Map<string, Array<(e: E) => void>>();
  private any: Array<(e: E) => void> = [];

  on<T extends E['type']>(type: T, fn: (e: Extract<E, { type: T }>) => void): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(fn as (e: E) => void);
    this.handlers.set(type, list);
    return () => {
      const l = this.handlers.get(type);
      if (l) l.splice(l.indexOf(fn as (e: E) => void), 1);
    };
  }

  onAny(fn: (e: E) => void): () => void {
    this.any.push(fn);
    return () => this.any.splice(this.any.indexOf(fn), 1);
  }

  emit(e: E): void {
    const list = this.handlers.get(e.type);
    if (list) for (const fn of list.slice()) fn(e);
    for (const fn of this.any.slice()) fn(e);
  }

  clear(): void {
    this.handlers.clear();
    this.any = [];
  }
}
