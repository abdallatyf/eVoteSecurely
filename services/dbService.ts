import { AdminUser, VotingEntry, IDCardData, HistoricalStructure } from '../types';

const DB_NAME = 'VotingAppDB';
const DB_VERSION = 2; // Incremented version to add new store
const VOTING_ENTRIES_STORE = 'voting_entries';
const ADMIN_USERS_STORE = 'admin_users';
const GOVERNMENT_STRUCTURES_STORE = 'government_structures';

class VotingDB {
  private db: IDBDatabase | null = null;

  async openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        resolve(this.db);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        // Create object store for voting entries
        if (!db.objectStoreNames.contains(VOTING_ENTRIES_STORE)) {
          const votingEntriesStore = db.createObjectStore(VOTING_ENTRIES_STORE, { keyPath: 'id' });
          votingEntriesStore.createIndex('timestamp', 'timestamp', { unique: false });
          votingEntriesStore.createIndex('validationStatus', 'validationStatus', { unique: false });
        }
        // Create object store for admin users
        if (!db.objectStoreNames.contains(ADMIN_USERS_STORE)) {
          const adminUsersStore = db.createObjectStore(ADMIN_USERS_STORE, { keyPath: 'id' });
          adminUsersStore.createIndex('username', 'username', { unique: true });
        }
        // Create object store for government structures
        if (!db.objectStoreNames.contains(GOVERNMENT_STRUCTURES_STORE)) {
          const structuresStore = db.createObjectStore(GOVERNMENT_STRUCTURES_STORE, { keyPath: 'id' });
          structuresStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        console.log('IndexedDB opened successfully.');
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', (event.target as IDBRequest).error);
        reject((event.target as IDBRequest).error);
      };
    });
  }

  private getObjectStore(storeName: string, mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) {
      throw new Error('Database not open. Call openDb() first.');
    }
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  // --- VotingEntry Operations ---
  async addEntry(entry: VotingEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getObjectStore(VOTING_ENTRIES_STORE, 'readwrite');
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
      store.add(entry);
    });
  }

  async updateEntry(entry: VotingEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getObjectStore(VOTING_ENTRIES_STORE, 'readwrite');
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
      store.put(entry);
    });
  }

  async deleteEntry(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getObjectStore(VOTING_ENTRIES_STORE, 'readwrite');
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
      store.delete(id);
    });
  }

  async getAllEntries(): Promise<VotingEntry[]> {
    return new Promise((resolve, reject) => {
      const store = this.getObjectStore(VOTING_ENTRIES_STORE, 'readonly');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject((event.target as IDBRequest).error);
    });
  }

  async clearAllEntries(): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getObjectStore(VOTING_ENTRIES_STORE, 'readwrite');
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
      store.clear();
    });
  }

  // --- AdminUser Operations ---
  async addAdminUser(admin: AdminUser): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getObjectStore(ADMIN_USERS_STORE, 'readwrite');
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
      store.add(admin);
    });
  }

  async getAdminUser(username: string): Promise<AdminUser | undefined> {
    return new Promise((resolve, reject) => {
      const store = this.getObjectStore(ADMIN_USERS_STORE, 'readonly');
      const index = store.index('username');
      const request = index.get(username);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject((event.target as IDBRequest).error);
    });
  }
  
  async getAdminUserById(id: string): Promise<AdminUser | undefined> {
    return new Promise((resolve, reject) => {
      const store = this.getObjectStore(ADMIN_USERS_STORE, 'readonly');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject((event.target as IDBRequest).error);
    });
  }

  async getAllAdminUsers(): Promise<AdminUser[]> {
    return new Promise((resolve, reject) => {
      const store = this.getObjectStore(ADMIN_USERS_STORE, 'readonly');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject((event.target as IDBRequest).error);
    });
  }

  async updateAdminUser(admin: AdminUser): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getObjectStore(ADMIN_USERS_STORE, 'readwrite');
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
      store.put(admin);
    });
  }

  async deleteAdminUser(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getObjectStore(ADMIN_USERS_STORE, 'readwrite');
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
      store.delete(id);
    });
  }

  // --- GovernmentStructure Operations ---
  async addStructure(structure: HistoricalStructure): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getObjectStore(GOVERNMENT_STRUCTURES_STORE, 'readwrite');
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
      store.add(structure);
    });
  }

  async getAllStructures(): Promise<HistoricalStructure[]> {
    return new Promise((resolve, reject) => {
      const store = this.getObjectStore(GOVERNMENT_STRUCTURES_STORE, 'readonly');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject((event.target as IDBRequest).error);
    });
  }

  async deleteStructure(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getObjectStore(GOVERNMENT_STRUCTURES_STORE, 'readwrite');
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
      store.delete(id);
    });
  }
}

export const votingDB = new VotingDB();
