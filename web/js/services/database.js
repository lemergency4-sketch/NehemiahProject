/**
 * web/js/services/database.js
 *
 * Database service layer for Nehemiah Project — Treasury Pilot
 * - Single entry point between repositories and the low-level idb adapter
 * - Provides runTransaction helper for transactional operations
 * - Ensures additional stores exist (funds, auditLogs, dashboardCache)
 * - Seeds the funds store on first init
 */

import {
  _openDB as _idbOpen,
  initDB as idbInitDB,
  getAll as idbGetAll,
  get as idbGet,
  put as idbPut,
  bulkPut as idbBulkPut,
  deleteRecord as idbDeleteRecord,
  queryEntriesByMonth as idbQueryEntriesByMonth
} from '../services/idb-adapter.js';

import { DB_NAME, STORES } from '../database/schema.js';
import { FUNDS_SEED } from '../database/seeds.js';

/**
 * Ensure the store definitions map for quick lookup.
 */
const storeMap = new Map(STORES.map(s => [s.name, s]));

function _storeDef(name) {
  return storeMap.get(name);
}

/**
 * Create missing object stores by performing an upgrade to the database version.
 * This helper will only create stores that do not already exist.
 *
 * @param {Array<string>} names - store names to ensure exist
 */
async function ensureStoresExist(names = []) {
  if (!names || names.length === 0) return;
  const db = await _idbOpen();
  const missing = names.filter(n => !db.objectStoreNames.contains(n));
  db.close();
  if (missing.length === 0) return;

  // Open a new connection with version bump to create missing stores
  const newVersion = (db.version || 1) + 1;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, newVersion);
    req.onupgradeneeded = (ev) => {
      const upgradeDb = req.result;
      for (const name of missing) {
        if (upgradeDb.objectStoreNames.contains(name)) continue;
        const def = _storeDef(name) || { name, options: { keyPath: 'id' }, indexes: [] };
        const os = upgradeDb.createObjectStore(def.name, def.options || { keyPath: 'id' });
        (def.indexes || []).forEach(idx => {
          try {
            os.createIndex(idx.name, idx.keyPath, idx.options || { unique: false });
          } catch (e) {
            // ignore index creation errors (e.g., already exists)
            console.warn('index create failed', idx.name, e);
          }
        });
      }
    };
    req.onsuccess = () => {
      req.result.close();
      resolve(true);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn('DB upgrade blocked');
  });
}

/**
 * Run an IndexedDB transaction across one or more stores.
 * The callback receives an object mapping storeName -> IDBObjectStore.
 *
 * Example:
 * await runTransaction(["entries","oplog"], 'readwrite', async (stores) => {
 *   stores.entries.put(obj);
 *   stores.oplog.add(op);
 * });
 *
 * @param {Array<string>} stores - store names
 * @param {'readonly'|'readwrite'} mode - transaction mode
 * @param {(stores:{[name:string]:IDBObjectStore})=>Promise<any>} callback
 */
export async function runTransaction(stores = [], mode = 'readwrite', callback) {
  if (!Array.isArray(stores) || stores.length === 0) throw new Error('runTransaction requires at least one store name');
  if (typeof callback !== 'function') throw new TypeError('runTransaction requires a callback');

  const db = await _idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const storesObj = {};
    for (const s of stores) storesObj[s] = tx.objectStore(s);

    let cbResult;
    try {
      cbResult = callback(storesObj);
    } catch (err) {
      tx.abort();
      db.close();
      return reject(err);
    }

    // If callback returns a promise, wait for it
    Promise.resolve(cbResult)
      .then(() => {
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(new Error('Transaction aborted')); };
      })
      .catch(err => {
        try { tx.abort(); } catch (e) { /* ignore */ }
        db.close();
        reject(err);
      });
  });
}

/**
 * Wrapper API exposing commonly used DB operations.
 * Repositories should use these functions rather than calling idb-adapter directly.
 */
export async function init() {
  // Initialize existing adapter (creates core stores)
  const db = await idbInitDB();
  // Ensure new stores exist
  await ensureStoresExist(['funds', 'auditLogs', 'dashboardCache']);

  // Seed funds if not seeded
  const seededFunds = await idbGet('settings', 'fundsSeeded');
  if (!seededFunds || seededFunds.value !== true) {
    const now = new Date().toISOString();
    const records = (FUNDS_SEED || []).map((label, i) => ({
      id: `fund_${i + 1}_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      name: label,
      createdAt: now,
      updatedAt: now,
      isDefault: i === 0, // mark General as default
      active: true
    }));
    // Use bulkPut to insert funds
    await idbBulkPut('funds', records);
    await idbPut('settings', { key: 'fundsSeeded', value: true });
  }

  return db;
}

export async function getAll(storeName) {
  return idbGetAll(storeName);
}

export async function get(storeName, id) {
  return idbGet(storeName, id);
}

export async function put(storeName, record) {
  return idbPut(storeName, record);
}

export async function bulkPut(storeName, records) {
  return idbBulkPut(storeName, records);
}

export async function deleteRecord(storeName, id) {
  return idbDeleteRecord(storeName, id);
}

export async function queryEntriesByMonth(monthKey) {
  return idbQueryEntriesByMonth(monthKey);
}

export function _getRawDB() {
  // Expose for advanced use cases (repositories only)
  return _idbOpen();
}
