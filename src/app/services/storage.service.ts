import { Injectable } from '@angular/core';

export interface EntregaPendiente {
  id?: number;
  tareaId?: number;
  curso: string;
  tituloTarea: string;
  instructor?: string;
  comentario: string;
  archivoNombre: string;
  archivo?: File;
  fechaRegistro: string;
  estadoSincronizacion: 'PENDIENTE';
}

type NuevaEntrega = Omit<EntregaPendiente, 'id' | 'fechaRegistro' | 'estadoSincronizacion'>;

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly dbName = 'senatiTaskDB';
  private readonly storeName = 'entregas_pendientes';
  private readonly dbVersion = 1;
  private dbPromise?: Promise<IDBDatabase>;

  abrirDB(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB no está disponible en este navegador.'));
    }

    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(this.storeName)) {
            database.createObjectStore(this.storeName, {
              keyPath: 'id',
              autoIncrement: true
            });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'));
        request.onblocked = () => reject(new Error('La actualización de IndexedDB está bloqueada por otra pestaña.'));
      }).catch((error: unknown) => {
        this.dbPromise = undefined;
        throw error;
      });
    }

    return this.dbPromise;
  }

  async guardarEntregaLocal(entrega: NuevaEntrega): Promise<IDBValidKey> {
    const database = await this.abrirDB();
    const registro: EntregaPendiente = {
      ...entrega,
      fechaRegistro: new Date().toISOString(),
      estadoSincronizacion: 'PENDIENTE'
    };

    return new Promise<IDBValidKey>((resolve, reject) => {
      const transaction = database.transaction(this.storeName, 'readwrite');
      const request = transaction.objectStore(this.storeName).add(registro);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('No se pudo guardar la entrega localmente.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Se canceló el guardado de la entrega.'));
    });
  }

  async listarEntregasLocales(): Promise<EntregaPendiente[]> {
    const database = await this.abrirDB();

    return new Promise<EntregaPendiente[]>((resolve, reject) => {
      const request = database
        .transaction(this.storeName, 'readonly')
        .objectStore(this.storeName)
        .getAll();
      request.onsuccess = () => resolve(request.result as EntregaPendiente[]);
      request.onerror = () => reject(request.error ?? new Error('No se pudieron leer las entregas locales.'));
    });
  }
}
