/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentVariableService, IEnvironmentVariableCollection, IEnvironmentVariableMutator, EnvironmentVariableMutatorType } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { Event, Emitter } from 'vs/base/common/event';
import { debounce } from 'vs/base/common/decorators';
import { IProcessEnvironment } from 'vs/base/common/platform';

export class EnvironmentVariableCollection implements IEnvironmentVariableCollection {
	readonly entries: Map<string, IEnvironmentVariableMutator>;

	constructor(
		variables?: string[],
		values?: string[],
		types?: EnvironmentVariableMutatorType[]
	) {
		this.entries = new Map();
		if (variables && values && types) {
			if (variables.length !== values.length || variables.length !== types.length) {
				throw new Error('Cannot create environment collection from arrays of differing length');
			}
			for (let i = 0; i < variables.length; i++) {
				this.entries.set(variables[i], { value: values[i], type: types[i] });
			}
		}
	}

	// TODO: Remove? Does diff do the job?
	// equals(other: IEnvironmentVariableCollection): boolean {
	// 	if (this.entries.size !== other.entries.size) {
	// 		return false;
	// 	}
	// 	let result = true;
	// 	this.entries.forEach((mutator, variable) => {
	// 		const otherMutator = other.entries.get(variable);
	// 		if (otherMutator !== mutator) {
	// 			result = false;
	// 		}
	// 	});
	// 	return result;
	// }

	// TODO: Consider doing a full diff, just marking the environment as stale with no action available?
	getNewAdditions(other: IEnvironmentVariableCollection): ReadonlyMap<string, IEnvironmentVariableMutator> | undefined {
		const result = new Map<string, IEnvironmentVariableMutator>();
		other.entries.forEach((newMutator, variable) => {
			const currentMutator = this.entries.get(variable);
			if (currentMutator?.type !== newMutator.type || currentMutator.value !== newMutator.value) {
				result.set(variable, newMutator);
			}
		});
		return result.size === 0 ? undefined : result;
	}

	applyToProcessEnvironment(env: IProcessEnvironment): void {
		this.entries.forEach((mutator, variable) => {
			switch (mutator.type) {
				case EnvironmentVariableMutatorType.Append:
					env[variable] = (env[variable] || '') + mutator.value;
					break;
				case EnvironmentVariableMutatorType.Prepend:
					env[variable] = mutator.value + (env[variable] || '');
					break;
				case EnvironmentVariableMutatorType.Replace:
					env[variable] = mutator.value;
					break;
			}
		});
	}
}

/**
 * Tracks and persists environment variable collections as defined by extensions.
 */
export class EnvironmentVariableService implements IEnvironmentVariableService {
	_serviceBrand: undefined;

	private _collections: Map<string, IEnvironmentVariableCollection> = new Map();
	private _mergedCollection: IEnvironmentVariableCollection = new EnvironmentVariableCollection();

	// TODO: Generate a summary of changes inside the terminal component as it needs to be done per-terminal compared to what it started with
	private readonly _onDidChangeCollections = new Emitter<IEnvironmentVariableCollection>();
	get onDidChangeCollections(): Event<IEnvironmentVariableCollection> { return this._onDidChangeCollections.event; }

	constructor() {
		// TODO: Load in persisted collections
		// TODO: Fire an event when collections have changed that the terminal component can listen to
	}

	get mergedCollection(): IEnvironmentVariableCollection {
		return this._mergedCollection;
	}

	set(extensionIdentifier: string, collection: IEnvironmentVariableCollection): void {
		this._collections.set(extensionIdentifier, collection);
		this._mergedCollection = this._resolveMergedCollection();
		this._notifyCollectionUpdates();
	}

	delete(extensionIdentifier: string): void {
		this._collections.delete(extensionIdentifier);
		this._mergedCollection = this._resolveMergedCollection();
		this._notifyCollectionUpdates();
	}

	@debounce(1000)
	private _notifyCollectionUpdates(): void {
		this._onDidChangeCollections.fire(this._mergedCollection);
	}

	private _resolveMergedCollection(): IEnvironmentVariableCollection {
		const result = new EnvironmentVariableCollection();
		this._collections.forEach(collection => {
			collection.entries.forEach((mutator, variable) => {
				if (!result.entries.has(variable)) {
					result.entries.set(variable, mutator);
				}
			});
		});
		return result;
	}
}
