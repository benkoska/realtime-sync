export function createNode(
	models: Map<string, any>,
	item: any,
	isRoot: boolean = false
) {
	const typeStr = item.type
	if (typeStr === undefined) {
		throw Error("Cannot add a type without a type to the graph")
	}

	const id = item.id
	if (id === undefined) {
		throw Error("Cannot add an item without an id")
	}

	const node = new (models.get(typeStr)! as any)()
	const annotations = node["__annotations"]

	for (const key in item) {
		if (key === "type") continue

		if (isRoot && annotations[key].type !== "property") {
			throw Error(
				"the root node cannot have annotations of the type: " +
					annotations[key].type
			)
		}

		if (annotations[key] == undefined) {
			continue
		}

		if (annotations[key].type === "property") {
			if (annotations[key].transform != undefined) {
				node[key] = annotations[key].transform(item[key])
			} else {
				node[key] = item[key]
			}

			node["__data"][key] = item[key]
		}
	}

	return node
}
