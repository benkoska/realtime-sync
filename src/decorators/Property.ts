import { Annotation, verifyAnnotations } from "../lib/annotation"

interface PropertyConfig {
    transform?: (val: string) => any
    type?: 'date'
}

export function Property(config?: PropertyConfig) {
	return (target: any, key: string) => {
		verifyAnnotations(target)

        let transform: ((val: string) => any) | undefined = undefined
        if (config?.type != null) {
            switch (config?.type) {
                case 'date':
                    transform = (val) => new Date(val)
                    break
            }
         } else if (config?.transform != null) {
            transform = config?.transform
        }

		target["__annotations"][key] = {
			type: "property",
            transform
		} as Annotation<never>
	}
}