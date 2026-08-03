// A durable local store, on IndexedDB.
//
// Why not SQLite: sql.js is a ~1.5 MB wasm build that holds the database in
// memory and has no persistence of its own — you serialise the whole file and
// write the blob into IndexedDB anyway. So "SQLite in the browser" is this,
// plus a megabyte and a half, plus save/load bookkeeping. For a list of saved
// plans there is nothing to gain: no joins, no queries, tens of rows. If plans
// ever need real querying (search across stops, stats over months), the swap is
// this one file — everything above it only calls put/get/all/del.
//
// localStorage was the previous store and is not adequate: it is synchronous,
// capped around 5 MB, and string-only, so a plan had to be flattened to a few
// fields and the rest was thrown away. That is why a saved route came back
// without its dates, its start point or its people.

const DB = "kuk-saarthi";
const VERSION = 1;
const STORE = "plans";

let handle: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (handle) return handle;
  handle = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // a failed open must not poison every later call (private mode, quota, …)
  handle.catch(() => {
    handle = null;
  });
  return handle;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Store a record (keyed by its `id`), replacing any record with the same id. */
export const put = <T extends { id: string }>(rec: T): Promise<unknown> => run("readwrite", (s) => s.put(rec));

/** One record by id, or undefined. */
export const get = <T>(id: string): Promise<T | undefined> => run<T | undefined>("readonly", (s) => s.get(id));

/** Every record in the store. */
export const all = <T>(): Promise<T[]> => run<T[]>("readonly", (s) => s.getAll());

/** Forget one record. */
export const del = (id: string): Promise<unknown> => run("readwrite", (s) => s.delete(id));
