export interface History<T> {
  state: T;
  canUndo: boolean;
  canRedo: boolean;
  commit: (next: T) => T;
  undo: () => T;
  redo: () => T;
}

export function createHistory<T>(initial: T): History<T> {
  let past: T[] = [];
  let current = initial;
  let future: T[] = [];

  const api: History<T> = {
    get state() { return current; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    commit(next) {
      past = [...past, current];
      current = next;
      future = [];
      return current;
    },
    undo() {
      if (!past.length) return current;
      future = [current, ...future];
      current = past[past.length - 1];
      past = past.slice(0, -1);
      return current;
    },
    redo() {
      if (!future.length) return current;
      past = [...past, current];
      current = future[0];
      future = future.slice(1);
      return current;
    },
  };

  return api;
}
