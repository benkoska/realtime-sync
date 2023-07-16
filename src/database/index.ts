import { Annotation } from "../lib/annotation"

export class Database {
	private schemas: Map<String, Schema>
	private database: IDBDatabase

	constructor(schemas: Array<Schema>, database: IDBDatabase) {
		this.schemas = new Map()
		for (const schema of schemas) {
			this.schemas.set(schema.name, schema)
		}

		this.database = database
	}

	private createTransaction(
		store: string,
		dbMode: IDBTransactionMode,
		resolve?: any,
		reject?: any,
		abort?: any
	) {
		let tx: IDBTransaction = this.database.transaction(store, dbMode)
		tx.onerror = reject
		tx.oncomplete = resolve
		tx.onabort = abort
		return tx
	}

	async get<R = any>(
		name: string,
		identifier: string | number | { [key: string]: string | number }
	): Promise<R | null> {
		if (identifier == null) return null

		return new Promise((resolve, reject) => {
            if (!this.database.objectStoreNames.contains(name)) {
                reject(`Table ${name} not found`);
            }

			const transaction = this.createTransaction(name, "readonly", resolve, reject)
			const objectStore = transaction.objectStore(name)
			let request: IDBRequest
			if (
				typeof identifier == "string" ||
				typeof identifier == "number"
			) {
				request = objectStore.get(identifier)
			} else {
				const keys = Object.keys(identifier)
				if (keys.length != 1)
					throw new Error(
						"Queries with more than one field are unsupported!"
					)
				request = objectStore.index(keys[0]).get(identifier[keys[0]])
			}

			request.onsuccess = (e: any) => {
				resolve(e.target.result as R)
			}
		})
	}

    async getMany<R = any>(name: string, identifier: { [key: string]: string | number }): Promise<R[]> {
		return new Promise((resolve, reject) => {
            if (!this.database.objectStoreNames.contains(name)) {
                reject(`Table ${name} not found`);
            }

			const transaction = this.createTransaction(name, "readonly", resolve, reject)
			const objectStore = transaction.objectStore(name)
			let request: IDBRequest
            const keys = Object.keys(identifier)
            if (keys.length != 1)
                throw new Error(
                    "Queries with more than one field are unsupported!"
                )
            
            request = objectStore.index(keys[0]).getAll(identifier[keys[0]])

			request.onsuccess = (e: any) => {
				resolve(e.target.result as R[])
			}
		})
    }

    async getAll<R = any>(name: string): Promise<R[]> {
		return new Promise((resolve, reject) => {
            if (!this.database.objectStoreNames.contains(name)) {
                reject(`Table ${name} not found`);
            }

            const transaction = this.createTransaction(name, "readonly", resolve, reject)
			const objectStore = transaction.objectStore(name)
            const request = objectStore.getAll()

            request.onsuccess = (e: any) => {
				resolve(e.target.result as R[])
			}
        })
    }

    async add<T = any, R = any>(name: string, value: T, key?: any): Promise<R> {
        return new Promise((resolve, reject) => {
            if (!this.database.objectStoreNames.contains(name)) {
                reject(`Table ${name} not found`);
            }

            const transaction = this.createTransaction(name, "readwrite", resolve, reject)
			const objectStore = transaction.objectStore(name)
            const request = objectStore.add(value, key)

            request.onsuccess = (e: any) => {
                transaction.commit()
                resolve(e.target.result as R);
            };
        })
    }

    async update<T = any, R = any>(name: string, value: T, key?: any): Promise<R> {
        return new Promise((resolve, reject) => {
            if (!this.database.objectStoreNames.contains(name)) {
                reject(`Table ${name} not found`);
            }

            const transaction = this.createTransaction(name, "readwrite", resolve, reject)
			const objectStore = transaction.objectStore(name)
            const request = objectStore.put(value, key)

            request.onsuccess = (e: any) => {
                transaction.commit()
                resolve(e.target.result as R);
            };
        })
    }

    async delete(name: string, key: string | number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.database.objectStoreNames.contains(name)) {
                reject(`Table ${name} not found`);
            }

            const transaction = this.createTransaction(name, "readwrite", resolve, reject)
			const objectStore = transaction.objectStore(name)
            const request = objectStore.delete(key)

            request.onsuccess = (e: any) => {
                transaction.commit()
                resolve();
            };
        })
    }

    async deleteAll(name: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.database.objectStoreNames.contains(name)) {
                reject(`Table ${name} not found`);
            }

            const transaction = this.createTransaction(name, "readwrite", resolve, reject)
			const objectStore = transaction.objectStore(name)
            const request = objectStore.clear()

            request.onsuccess = (e: any) => {
                transaction.commit()
                resolve();
            };
        })
    }
}

interface Field {
	name: string
	multiEntry: boolean
}

interface Schema {
	name: string
	fields: Field[]
}

export async function setupDatabase(
	name: string,
	models: Array<any>
): Promise<Database | null> {
	const idbInstance = typeof window !== "undefined" ? window.indexedDB : null
	if (!idbInstance) {
		return null
	}

	const schemas: Schema[] = models.map((model) => {
		const instance = new model()
		const annotations: { [key: string]: Annotation<any> } =
			instance["__annotations"]

		return {
			name: model.name,
			fields: Object.keys(annotations)
				.map((key) => {
					const annotation = annotations[key]

					if (
						!["property", "many_to_many", "many_to_one"].includes(
							annotation.type
						)
					)
						return undefined

					return {
						name: key,
						multiEntry: annotation.type == "many_to_many",
					} as Field
				})
				.filter((val) => val != undefined) as Field[],
		}
	})

	return new Promise<Database>((resolve, reject) => {
		const request = idbInstance.open(name, 1)

		request.onerror = (e: any) => {
			reject(e.target.error.name)
		}

		request.onsuccess = () => {
			resolve(new Database(schemas, request.result))
		}

		request.onupgradeneeded = (e: any) => {
			const db: IDBDatabase = e.target.result

			for (const schema of schemas) {
				if (db.objectStoreNames.contains(schema.name)) continue

				const store = db.createObjectStore(schema.name, {
					keyPath: "id",
					autoIncrement: false,
				})

				for (const field of schema.fields) {
					store.createIndex(field.name, field.name, {
						multiEntry: field.multiEntry,
					})
				}
			}

            (() => {
                if (db.objectStoreNames.contains("transactions")) return

                const store = db.createObjectStore("Transaction", {
                    keyPath: "id",
                    autoIncrement: false
                })

                store.createIndex("id", "id")
                store.createIndex("type", "type")
                store.createIndex("date", "date")
                store.createIndex("changes", "changes")
            })()
		}
	})
}
