import {
	action,
	autorun,
	computed,
	extendObservable,
	makeAutoObservable,
	makeObservable,
	observable,
	reaction,
} from "mobx"
import { Collection } from "../Collection"
import { Annotation } from "../lib/annotation"

export interface ClientModeConfig {
    socket?: WebSocket | (() => WebSocket)
    endpoint?: string | { url: string; method: string }
}

export function ClientModel(config: { name: string } & ClientModeConfig) {
    const { name, ...clientConfig }: { name: string } & ClientModeConfig = config
    
	return <T extends { new (...args: any[]): {} }>(ctr: T) => {
		const storage = {
			[name]: class extends ctr {
				constructor(...args: any[]) {
					super(...args);
					(this as any)["__data"] = {
						type: name,
					};

                    (this as any)["__makeObservable"] = () => {
						const annotations = (this as any)["__annotations"]

						const observableAnnotations = { ...annotations }

						Object.keys(observableAnnotations).forEach(function (
							key
						) {
							switch (observableAnnotations[key].type) {
								case "computed":
									observableAnnotations[key] = computed
									break
								case "action":
									observableAnnotations[key] = action
									break
								case "property":
								case "one_to_many":
								case "many_to_one":
								case "many_to_many":
									observableAnnotations[key] = observable
									break
								default:
									delete observableAnnotations[key]
									break
							}
						})

						makeObservable(this, observableAnnotations)

						for (const key in annotations) {
							const annotation = annotations[key]
							switch (annotation.type) {
								case "many_to_one": {
									reaction(
										() => (this as any)[key],
										(value, previousValue) => {
											if (previousValue != null) {
												const prevCollection = annotation["access"](previousValue)
												if (!(prevCollection instanceof Collection)) {
													throw new Error("Invalid model!")
												}
												prevCollection.remove(this)
											}
											if (value != null) {
												const newCollection =
													annotation["access"](value)
												if (!(newCollection instanceof Collection)) {
													throw new Error("Invalid model!")
												}
												newCollection.add(this)
											}
										}
									)
									break
								}
							}
						}
					}
				}
			},
		};

        const classConfig: ClientModeConfig = (clientConfig != null && Object.keys(clientConfig).length > 0) ? clientConfig : { socket: () => (window as any)["socket"] };

        if (classConfig.endpoint != undefined && classConfig.socket != undefined) {
            throw new Error("Model cannot have both an endpoint and a socket!")
        }

        (storage[name] as any).config = classConfig;
        (storage[name] as any).modelName = name

		return storage[name]
	}
}
