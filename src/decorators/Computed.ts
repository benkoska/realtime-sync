import { Annotation, verifyAnnotations } from "../lib/annotation"

export function Computed() {
	return (target: any, key: string) => {
		verifyAnnotations(target)

		target["__annotations"][key] = {
			type: "computed"
		} as Annotation<never>
	}
}