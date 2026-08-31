/**
 * Give the tests a working localStorage.
 *
 * Node 26 has a localStorage global of its own, which is disabled unless the
 * process is started with --localstorage-file. Because vitest's jsdom
 * environment shares one global object, Node's disabled version sits in front
 * of the one jsdom provides, and `window.localStorage` reads as undefined —
 * with a warning about a flag that has nothing to do with this project.
 *
 * That is worth working around rather than working with. Every call site in the
 * app wraps storage in try/catch, since a browser in private mode can refuse
 * it — so on a platform with no storage at all the tests pass by taking the
 * catch, and prove nothing about the behaviour they name. A theme cache that is
 * never written looks exactly like a theme cache that is correctly left alone.
 */
if (!globalThis.localStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(String(k)) ?? null,
      setItem: (k: string, v: string) => void store.set(String(k), String(v)),
      removeItem: (k: string) => void store.delete(String(k)),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}
