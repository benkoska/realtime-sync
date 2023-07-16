import { makeObservable, observable } from "mobx"
import { Model } from "./Model"

export class Collection<T extends Model> {
	items: T[] = []

	constructor() {
        (this as any)["__data"] = []
		makeObservable(this, {
			items: observable
		})
	}

	add(item: T, persist: boolean = true) {
        const index = this.items.indexOf(item);
        if (index > -1) {
            return
        }
		this.items.push(item)
	}

	remove(item: T, persist: boolean = true) {
		const index = this.items.indexOf(item)
        if (index > -1) {
            this.items.splice(index, 1)
        }
	}

	map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[] {
		return this.items.map(callbackfn, thisArg)
	}

    flatMap<U, This = undefined> (
        callback: (this: This, value: T, index: number, array: T[]) => U | ReadonlyArray<U>,
        thisArg?: This
    ): U[] {
        return this.items.flatMap(callback, thisArg)
    }

    forEach(callbackfn: (value: T, index: number, array: T[]) => void, thisArg?: any) {
        return this.items.forEach(callbackfn, thisArg)
    }

	save() {
        this.forEach((item) => item.save())
	}
}