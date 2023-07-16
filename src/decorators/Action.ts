import { Annotation, verifyAnnotations } from "../lib/annotation"

export function Action() {
	return (target: any, key: string) => {
		verifyAnnotations(target)

		target["__annotations"][key] = {
			type: "action"
		} as Annotation<never>
	}
}