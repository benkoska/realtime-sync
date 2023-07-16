import { action, makeObservable } from "mobx"
import { Collection } from "./Collection"
import { Database, setupDatabase } from "./database"
import { ClientModeConfig } from "./decorators"
import { Annotation } from "./lib/annotation"
import { createNode } from "./lib/node"
import { v4 } from "uuid"

function createRootNode(models: Map<string, any>, item: any): { id: any; type: any; node: any } {
	const rootNode = createNode(models, item)
	rootNode["__makeObservable"]()

	const { type: rootType, ...remainder } = item
	const rootId = item.id

	return {
		id: rootId,
		type: rootType,
		node: rootNode,
	}
}

export async function createStateGraph(
    modelsArray: Array<any>,
	root?: any | { type: string; id: string },
    autoPerformTransactions: boolean = true,
	name: string = "realtime-sync"
) {
	const database = await setupDatabase(
		name,
		modelsArray
	)
	if (!database) throw new Error("Could not initialize database!")

    const models = new Map<string, any>()
    for (const model of modelsArray) {
        models.set(model.modelName, model)
    }

	let graph: StateGraph<any>

	const isDatabaseRoot = (() => {
		if (root == undefined) return false

		const keys = Object.keys(root)
		return keys.length == 2 && keys.includes("type") && keys.includes("id")
	})()

	if (root != undefined && !isDatabaseRoot) {
		const {
			id: rootId,
			type: rootType,
			node: rootNode,
		} = createRootNode(models, root)

		const { type: _, ...remainder } = root

		database.update(rootType, remainder)

		graph = new StateGraph<typeof rootNode>(rootNode, database, models)
	} else {
		graph = new StateGraph<any>(null, database, models)
	}

	for (const type of modelsArray) {
		graph.items.set(type.modelName, new Map())
	}

    if (root != undefined && !isDatabaseRoot) {
        graph.items.get(root.type)!.set(root.id, graph.root);
    }

	if (isDatabaseRoot) {
		const rootEntry = await database.get(root.type, root.id)
		graph.setRoot({ type: root.type, ...rootEntry })
	}

	for (const type of modelsArray.map((i) => i.modelName)) {
		const values = await database.getAll(type)
        for (const value of values) {
            graph.add({ type: type, ...value })
        }
	}

    if (autoPerformTransactions) {
	    await graph.performTransactions()
    }

	return graph
}

async function performSave(config: ClientModeConfig, type: string, changes: any): Promise<boolean> {
	if (config.socket != undefined) {
		const message = JSON.stringify({
			message: "update",
			data: {
				type,
				...changes,
			},
		})

		if (typeof config.socket === "function") {
			const socket = config.socket()
			if (socket == undefined || socket.readyState !== socket.OPEN) return false

			config.socket().send(message)
		} else {
			if (config.socket == undefined || config.socket.readyState !== config.socket.OPEN) return false

			config.socket.send(message)
		}
	}

	if (config.endpoint != undefined) {
		const body = JSON.stringify(changes)

		var url: RequestInfo
		var method: string

		if (typeof config.endpoint == "string") {
			url = config.endpoint
			method = "PATCH"
		} else {
			url = config.endpoint.url
			method = config.endpoint.method
		}

		const response = await fetch(url, {
			method,
			body,
		})

		if (response.status != 200) return false
	}

    return true
}

export class StateGraph<T> {
    private models: Map<string, any>

	public root: T | null
	public items: Map<string, Map<string, any>>

	public database: Database

	constructor(root: T | null, database: Database, models: Map<string, any>) {
		this.root = root
        this.database = database
        this.models = models
        
		this.items = new Map()

		makeObservable(this, {
			add: action,
			update: action,
		})
	}

	setRoot(root: any) {
		const { id, type } = root

		if (!id || !type) return

		const existingNode = this.items.get(type)!.get(id)

		if (existingNode != undefined) {
			this.root = existingNode
		} else {
			const {
				id: rootId,
				type: rootType,
				node: rootNode,
			} = createRootNode(this.models, root)

			const { type: _, ...remainder } = root

			this.database.update(rootType, remainder)

			this.root = rootNode

			this.items.get(rootType)!.set(rootId, rootNode)

			rootNode["__graph"] = this
		}
	}

	async performTransactions() {
        var connectionWorks = true

		const transactions = await this.database.getAll("Transaction")

		for (const transaction of transactions) {
			const { id: transactionId, type, date, changes } = transaction

            if (connectionWorks) {
                const config: ClientModeConfig = this.models.get(type)!.config

                const response = await performSave(config, type, changes)

                if (response) {
                    await this.database.delete("Transaction", transactionId)
                } else {
			        connectionWorks = false
                    this.update({ type, ...changes })
                }
            } else {
                this.update({ type, ...changes })
            }
		}
	}

	async save(type: string, changes: any) {
		const config: ClientModeConfig = this.models.get(type)!.config

		const transactionId = v4()
		await this.database.add("Transaction", {
			id: transactionId,
			type,
			date: new Date(),
			changes: changes,
		})

		const response = await performSave(config, type, changes)
        if (response) {
            await this.database.delete("Transaction", transactionId)
            this.performTransactions()
        }
	}

	private configureItem(object: any, node: any, update: boolean) {
		const annotations = node["__annotations"]
		for (const key in object) {
			if (key === "type") continue

			const item = object[key]
			const annotation: Annotation<any> = annotations[key]

			if (annotation == undefined) {
				// console.warn("Data without annotation for field:", key)
				continue
			}

			if (annotation.type === "property") {
                if (annotations[key].transform != undefined) {
                    node[key] = annotations[key].transform(item)
                } else {
                    node[key] = item
                }
				node["__data"][key] = item
			} else if (item instanceof Array) {
				if (annotation.type !== "many_to_many") {
					throw new Error(
						"Cannot have an array that does not corrolate to a many_to_many relationship"
					)
				}

				const collection = node[key]

				if (!(collection instanceof Collection))
					throw new Error("Invalid model")

				const type = (annotation.itemType() as any).modelName

				for (const value of item) {
					const valueItem = this.items.get(type)!.get(value.id)
					collection.add(valueItem)

					const itemCollection = annotation.access(valueItem)
					if (!(itemCollection instanceof Collection))
						throw new Error("Invalid model")
					itemCollection.add(node)
				}

				node["__data"][key] = item
			} else if (typeof item == "object") {
				if (annotation.type !== "many_to_one") {
					throw new Error(
						"Cannot have a field with id that does not corrolate to a many_to_one relationship"
					)
				}

				const valueKey = item != null ? item.id : null

				if (valueKey != null) {
					const value = this.items
						.get((annotation.itemType() as any).modelName)!
						.get(valueKey)
					if (value == node[key]) continue

					if (node[key] != null) {
						annotation.access(node[key]).remove(node)
						node[key] = null
					}
					node[key] = value
					annotation.access(value).add(node)
				} else {
					const currentValue = node[key]
					if (!!currentValue) {
						annotation.access(node[key]).remove(node)
					}
					node[key] = null
				}

				node["__data"][key] = valueKey ? { id: valueKey } : valueKey
			} else {
				throw Error(
					"Node cannot have annotations of the type: " +
						annotation.type
				)
			}
		}
		node["__graph"] = this
	}

	async add(object: any) {
		const { type, ...remainder } = object
		if (type === undefined) {
			throw Error("Cannot add a type without a type")
		}
		const id = object.id
		if (id === undefined) {
			throw Error("Cannot add an item without an id")
		}

		if (!!this.items.get(type)!.get(id)) {
			this.update(object)
			return
		}

		this.database.update(type, remainder)

		const node = new (this.models.get(type) as any)
		// node["__data"]["type"] = type;

		this.configureItem(object, node, false)

		node["__makeObservable"]()

		this.items.get(type)!.set(id, node)
	}

	update(object: any) {
		const typeStr = object.type
		if (typeStr === undefined) {
			throw Error("Cannot add an item without a type")
		}

		const id = object.id
		if (id === undefined) {
			throw Error("Cannot add an item without an id")
		}

		const node = this.items.get(typeStr)!.get(id)

		this.configureItem(object, node, true)

		const { type: extractedType, ...dataRemainder } = node["__data"]
		this.database.update(typeStr, dataRemainder)
	}

    delete(object: any) {
        const typeStr = object.type
		if (typeStr === undefined) {
			throw Error("Cannot add an item without a type")
		}

		const id = object.id
		if (id === undefined) {
			throw Error("Cannot add an item without an id")
		}

		const node = this.items.get(typeStr)!.get(id)

        const annotations = node["__annotations"]
		for (const key in node) {
			const item = node[key]
			const annotation: Annotation<any> = annotations[key]

            if (item == null) continue
			if (annotation == undefined) continue

			if (annotation.type == 'many_to_one') {
                (annotation.access(item) as Collection<any>).remove(node)
                // collection.forEach((item) => annotation.access(item).remove(node))
            } else if (annotation.type == 'one_to_many') {
                item[annotation.access] = null
            } else if (annotation.type == 'many_to_many') {
                const collection = item as Collection<any>
                collection.items.forEach((item) => annotation.access(item).remove(node))
            }
		}

        this.items.get(typeStr)!.delete(id)

        this.database.delete(typeStr, id)
    }

    get<T>(type: any, id: string): T | null {
        if (!this.items.has(type.modelName)) { return null }

        return (this.items.get(type.modelName)!.get(id) ?? null) as T
    }

    getAll<T>(type: any): Map<string, T> | null {
        if (!this.items.has(type.modelName)) { return null }
        return this.items.get(type.modelName) as Map<string, T>
    }

    getAllArray<T>(type: any): T[] | null {
        if (!this.items.has(type.modelName)) { return null }
        const allItems = this.items.get(type.modelName) as Map<string, T>
        return Array.from(allItems.keys()).map((id) => allItems.get(id)!)
    }
}
