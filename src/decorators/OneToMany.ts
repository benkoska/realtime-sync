import { Annotation, verifyAnnotations } from "../lib/annotation"
import { ObjectType } from "../lib/ObjectType"

export function OneToMany<T>(typeTarget: () => ObjectType<T>) {
	return (target: any, key: string) => {
		verifyAnnotations(target)

		target["__annotations"][key] = {
			type: "one_to_many",
			itemType: typeTarget
		} as Annotation<T>
	}
}