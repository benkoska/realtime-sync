import { Annotation } from "./lib/annotation"
import { StateGraph } from "./StateGraph"

const arrayOfObjectsEqual = (a1: any, a2: any) => a1.length == a2.length && Object.keys(a1).every((p) => objectsEqual(a1[p], a2[p]))
const objectsEqual = (o1: any, o2: any) => Object.keys(o1).length === Object.keys(o2).length && Object.keys(o1).every((p) => o1[p] === o2[p])

export abstract class Model {
	public save() {
		const data = (this as any)["__data"]

		const annotations = (this as any)["__annotations"]

		var changes: any = {}

		for (const key in annotations) {
			const annotation: Annotation<any> = annotations[key]

			switch (annotation.type) {
				case "property": {
					if (data[key] !== (this as any)[key]) {
						changes[key] = (this as any)[key]
					}
					break
				}
				case "many_to_one": {
					const item = (this as any)[key]

					if (item == undefined) {
						if (!!data[key]) {
							changes[key] = { id: "" }
						}
					} else if (data[key] == null) {
						if (item != null) {
							changes[key] = { id: item.id }
						}
					} else if (data[key].id !== item.id) {
						changes[key] = { id: item.id }
					}
					break
				}
				case "many_to_many": {
					if (data[key] == null) continue

					const item = (this as any)[key]
					const currentValues = item.items.map((i: any) => ({
						id: i.id,
					}))

					if (!arrayOfObjectsEqual(currentValues, data[key])) {
						changes[key] = currentValues
					}
					break
				}
			}
		}

		if (Object.keys(changes).length === 0) {
			return
		}

		const graph: StateGraph<any> = (this as any)["__graph"]
		graph.save(data["type"], { id: data["id"], ...changes })

		for (const changeKey in changes) {
			data[changeKey] = changes[changeKey]
		}
	}
}
