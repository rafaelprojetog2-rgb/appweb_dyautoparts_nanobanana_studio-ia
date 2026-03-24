export function abrirDB(): Promise<IDBDatabase> {

  return new Promise((resolve, reject) => {

    const request = indexedDB.open("dyautoparts_db", 1);

    request.onupgradeneeded = (event: any) => {

      const db = event.target.result;

      if (!db.objectStoreNames.contains("produtos")) {
        db.createObjectStore("produtos", { keyPath: "ean" });
      }

      if (!db.objectStoreNames.contains("inventario")) {
        db.createObjectStore("inventario", { autoIncrement: true });
      }

    };

    request.onsuccess = () => resolve(request.result);

    request.onerror = () => reject(request.error);

  });

}