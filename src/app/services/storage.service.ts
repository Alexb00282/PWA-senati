import { Injectable } from '@angular/core';

// Estados permitidos para cada entrega guardada localmente.
export type EstadoSincronizacion = 'PENDIENTE' | 'SINCRONIZADO' | 'ERROR';

// Estructura que representa una entrega pendiente o ya registrada localmente.
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
  estadoSincronizacion: EstadoSincronizacion;
  intentosSincronizacion: number;
  ultimoError?: string;
}

type NuevaEntrega = Omit<EntregaPendiente, 'id' | 'fechaRegistro' | 'estadoSincronizacion' | 'intentosSincronizacion' | 'ultimoError'> & {
  estadoSincronizacion?: EstadoSincronizacion;
  intentosSincronizacion?: number;
  ultimoError?: string;
};

@Injectable({ providedIn: 'root' })
export class StorageService {
  // Nombre de la base de datos IndexedDB usada por la aplicación.
  private readonly dbName = 'senatiTaskDB';
  // Nombre del almacén donde se almacenan las entregas pendientes.
  private readonly storeName = 'entregas_pendientes';
  // Versión de la base de datos para permitir cambios futuros sin romper datos existentes.
  private readonly dbVersion = 2;
  // Cachea la conexión para no abrir la base varias veces innecesariamente.
  private dbPromise?: Promise<IDBDatabase>;

  // Abre la base de datos y la crea si aún no existe.
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
          } else {
            const store = request.transaction?.objectStore(this.storeName);
            if (store && !store.indexNames.contains('estadoSincronizacion')) {
              store.createIndex('estadoSincronizacion', 'estadoSincronizacion', { unique: false });
            }
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

  // Guarda una entrega nueva con fecha actual y estado inicial PENDIENTE.
  async guardarEntregaLocal(entrega: NuevaEntrega): Promise<IDBValidKey> {
    const database = await this.abrirDB();
    const registro: EntregaPendiente = {
      ...entrega,
      fechaRegistro: new Date().toISOString(),
      estadoSincronizacion: entrega.estadoSincronizacion ?? 'PENDIENTE',
      intentosSincronizacion: entrega.intentosSincronizacion ?? 0,
      ultimoError: entrega.ultimoError ?? undefined
    };

    return new Promise<IDBValidKey>((resolve, reject) => {
      const transaction = database.transaction(this.storeName, 'readwrite');
      const request = transaction.objectStore(this.storeName).add(registro);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('No se pudo guardar la entrega localmente.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Se canceló el guardado de la entrega.'));
    });
  }

  // Recupera todas las entregas guardadas para mostrarlas en la bandeja local.
  async listarEntregasLocales(): Promise<EntregaPendiente[]> {
    const database = await this.abrirDB();

    return new Promise<EntregaPendiente[]>((resolve, reject) => {
      const request = database
        .transaction(this.storeName, 'readonly')
        .objectStore(this.storeName)
        .getAll();
      request.onsuccess = () => resolve((request.result as EntregaPendiente[]).sort((a, b) => new Date(b.fechaRegistro).getTime() - new Date(a.fechaRegistro).getTime()));
      request.onerror = () => reject(request.error ?? new Error('No se pudieron leer las entregas locales.'));
    });
  }

  // Busca una entrega específica por su id para mostrar detalle o editar su estado.
  async obtenerEntregaLocal(id: number): Promise<EntregaPendiente | undefined> {
    const database = await this.abrirDB();

    return new Promise<EntregaPendiente | undefined>((resolve, reject) => {
      const request = database
        .transaction(this.storeName, 'readonly')
        .objectStore(this.storeName)
        .get(id);
      request.onsuccess = () => resolve((request.result as EntregaPendiente | undefined) ?? undefined);
      request.onerror = () => reject(request.error ?? new Error('No se pudo cargar la entrega local.'));
    });
  }

  // Elimina un registro local después de confirmar la acción del usuario.
  async eliminarEntregaLocal(id: number): Promise<void> {
    const database = await this.abrirDB();

    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(this.storeName, 'readwrite');
      const request = transaction.objectStore(this.storeName).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('No se pudo eliminar la entrega local.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Se canceló la eliminación de la entrega.'));
    });
  }

  // Cuenta cuántas entregas están pendientes de sincronización real.
  async contarPendientes(): Promise<number> {
    const entregas = await this.listarEntregasLocales();
    return entregas.filter((entrega) => entrega.estadoSincronizacion === 'PENDIENTE').length;
  }

  // Actualiza el estado de una entrega según el resultado real de sincronización.
  async actualizarEstado(id: number, estado: EstadoSincronizacion, ultimoError?: string): Promise<void> {
    const database = await this.abrirDB();

    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        const entrega = request.result as EntregaPendiente | undefined;
        if (!entrega) {
          resolve();
          return;
        }

        const updateRequest = store.put({
          ...entrega,
          estadoSincronizacion: estado,
          ultimoError: ultimoError ?? entrega.ultimoError,
          intentosSincronizacion: (entrega.intentosSincronizacion ?? 0) + 1
        });

        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject(updateRequest.error ?? new Error('No se pudo actualizar el estado de sincronización.'));
      };

      request.onerror = () => reject(request.error ?? new Error('No se pudo localizar la entrega para actualizar el estado.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Se canceló la actualización de sincronización.'));
    });
  }
}
