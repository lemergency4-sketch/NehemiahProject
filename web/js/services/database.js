/**
 * web/js/services/database.js
 *
 * Database service layer for Nehemiah Project — Treasury Pilot
 * - Single entry point between repositories and the low-level idb adapter
 * - Provides runTransaction helper for transactional operations
 * - Ensures additional stores exist (funds, auditLogs, dashboardCache)
 * - Centralized seeding of domain data (meetings, categories, payment methods, currencies, funds)
 *
 * Notes:
 * - This module is the single place responsible for seeding. The low-level
 *   adapter must not perform any seeding or fetch JSON seed files.
 * - Seeding is idempotent and guarded by the settings.seeded flag for
 *   backward compatibility. When seeding runs, it writes settings.seeded = true
 *   and settings.schemaVersion = 1.
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
} from './idb-adapter.js';

import { DB_NAME, STORES } from '../database/schema.js';
import { MEETINGS, CATEGORIES, PAYMENT_METHODS, CURRENCIES, FUNDS } from '../database/seeds.js';

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
    req.onupgradeneeded = (/*ev*/) => {
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
  // Ensure supplemental stores exist
  await ensureStoresExist(['funds', 'auditLogs', 'dashboardCache']);

  // Use a settings flag to ensure seeding runs only once. Preserve backward compatibility
  // with older flag names by checking both 'seeded' and legacy 'fundsSeeded'.
  const seededFlag = await idbGet('settings', 'seeded').catch(() => undefined);
  const legacyFundsSeed = await idbGet('settings', 'fundsSeeded').catch(() => undefined);
  if ((seededFlag && seededFlag.value === true) || (legacyFundsSeed && legacyFundsSeed.value === true)) {
    return db; // already seeded
  }

  // Build seed records for each store according to schema expectations
  const now = new Date().toISOString();

  // Meetings
  const meetingsRecords = Array.isArray(MEETINGS) ? MEETINGS.map((name, i) => {
    const id = `meeting_${i + 1}_${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    return {
      id,
      name,
      description: '',
      createdAt: now,
      updatedAt: now,
      isDefault: i === 0,
      isActive: true,
      active: true,
      version: 1
    };
  }) : [];

  // Categories (giving & expense)
  const categoriesRecords = [];
  if (CATEGORIES && typeof CATEGORIES === 'object') {
    for (const kind of Object.keys(CATEGORIES)) {
      const list = Array.isArray(CATEGORIES[kind]) ? CATEGORIES[kind] : [];
      list.forEach((label, idx) => {
        const id = `category_${kind}_${String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        categoriesRecords.push({
          id,
          label,
          kind,
          defaultFundId: null,
          createdAt: now,
          updatedAt: now,
          isDefault: idx === 0 && kind === Object.keys(CATEGORIES)[0],
          isActive: true,
          active: true,
          version: 1
        });
      });
    }
  }

  // Payment methods
  const paymentMethodRecords = Array.isArray(PAYMENT_METHODS) ? PAYMENT_METHODS.map((label, i) => ({
    id: `pm_${i + 1}_${String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    label,
    displayOrder: i,
    createdAt: now,
    updatedAt: now,
    isDefault: i === 0,
    isActive: true,
    active: true,
    version: 1
  })) : [];

  // Currencies (use code as keyPath)
  const currencyRecords = Array.isArray(CURRENCIES) ? CURRENCIES.map((c) => ({
    code: c.code,
    name: c.name || c.code,
    symbol: c.symbol || '',
    isDefault: !!c.isDefault,
    createdAt: now,
    updatedAt: now,
    active: c.active !== undefined ? !!c.active : true,
    version: c.version || 1
  })) : [];

  // Funds
  const fundsRecords = Array.isArray(FUNDS) ? FUNDS.map((name, i) => ({
    id: `fund_${i + 1}_${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    name,
    createdAt: now,
    updatedAt: now,
    isDefault: i === 0,
    active: true,
    version: 1
  })) : [];

  // Settings entries to mark seeding complete and record schema version
  const settingsRecords = [
    { key: 'seeded', value: true },
    { key: 'fundsSeeded', value: true }, // legacy flag for backward compatibility
    { key: 'schemaVersion', value: 1 }
  ];

  // Perform seeding inside a single transaction where possible for atomicity.
  try {
    // Ensure all target stores exist before attempting transaction
    await ensureStoresExist(['meetings', 'categories', 'paymentMethods', 'currencies', 'funds']);

    await runTransaction(
      ['meetings', 'categories', 'paymentMethods', 'currencies', 'funds', 'settings'],
      'readwrite',
      (stores) => {
        // meetings
        const ms = stores.meetings;
        for (const r of meetingsRecords) ms.put(r);
        // categories
        const cs = stores.categories;
        for (const r of categoriesRecords) cs.put(r);
        // paymentMethods
        const ps = stores.paymentMethods;
        for (const r of paymentMethodRecords) ps.put(r);
        // currencies (keyPath: code)
        const cur = stores.currencies;
        for (const r of currencyRecords) cur.put(r);
        // funds
        const fs = stores.funds;
        for (const r of fundsRecords) fs.put(r);
        // settings
        const ss = stores.settings;
        for (const r of settingsRecords) ss.put(r);
        // return synchronously; runTransaction wraps callback with Promise.resolve
        return true;
      }
    );
  } catch (err) {
    // If transaction-based seeding failed, fall back to bulkPut helpers per-store
    console.warn('transactional seeding failed, falling back to per-store bulkPut', err);
    if (meetingsRecords.length) await idbBulkPut('meetings', meetingsRecords).catch(() => undefined);
    if (categoriesRecords.length) await idbBulkPut('categories', categoriesRecords).catch(() => undefined);
    if (paymentMethodRecords.length) await idbBulkPut('paymentMethods', paymentMethodRecords).catch(() => undefined);
    if (currencyRecords.length) await idbBulkPut('currencies', currencyRecords).catch(() => undefined);
    if (fundsRecords.length) await idbBulkPut('funds', fundsRecords).catch(() => undefined);
    for (const r of settingsRecords) {
      try { await idbPut('settings', r); } catch (e) { /* ignore */ }
    }
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
