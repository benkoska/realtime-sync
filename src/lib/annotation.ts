import { ObjectType } from "./ObjectType";

export function verifyAnnotations(target: any) {
	if (!target["__annotations"]) {
		target["__annotations"] = {}
	}
}

type SimpleAnnotation = {
    type: 'computed' | 'property' | 'action'
};

type OneParamAnnotation<T> = {
    type: 'one_to_many'
    itemType: () => ObjectType<T>
    access: keyof T
};

type TwoParamAnnotation<T> = {
    type: 'many_to_many' | 'many_to_one'
    itemType: () => ObjectType<T>
    access: (item: T) => any
}

export type Annotation<T> = SimpleAnnotation | OneParamAnnotation<T> | TwoParamAnnotation<T>