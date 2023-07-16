import { Annotation, verifyAnnotations } from "../lib/annotation"
import { ObjectType } from "../lib/ObjectType"

export function ManyToOne<T>(typeTarget: () => ObjectType<T>, access: (item: T) => any) {
	return (target: any, key: string) => {
		verifyAnnotations(target)

		target["__annotations"][key] = {
			type: "many_to_one",
			access,
			itemType: typeTarget
		} as Annotation<T>
	}
}