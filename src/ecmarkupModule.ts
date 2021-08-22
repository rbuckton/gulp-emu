/*!
 *  Copyright 2021 Ron Buckton (rbuckton@chronicles.org)
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import * as semver from "semver";
import * as path from "path";

/* @internal */
export interface EcmarkupModule {
    readonly path: string;
    readonly version: string;
    readonly mode: "v7" | "v3";
    readonly module: typeof import("ecmarkup");
}

interface PackageJson {
    name: string;
    version: string;
}

function resolveEcmarkupModule(packagePath: string): EcmarkupModule {
    if (!path.isAbsolute(packagePath) || path.basename(packagePath) !== "package.json") {
        throw new TypeError("Expected an absolute path to 'package.json'")
    }
    const packageJson = require(packagePath) as PackageJson;
    if (packageJson.name !== "ecmarkup") {
        throw new Error("Invalid ecmarkup package reference.");
    }
    const pathname = path.dirname(packagePath);
    const version = packageJson.version;
    const mode = semver.satisfies(version, ">= 7.0.0") ? "v7" : "v3";
    const module = require(pathname);
    return {
        path: pathname,
        version,
        mode,
        module
    };
}

const ecmarkupModule = resolveEcmarkupModule(require.resolve("ecmarkup/package.json"));

let currentEcmarkupModule = ecmarkupModule;

/* @internal */
export function setEcmarkup(packagePath: string | undefined) {
    currentEcmarkupModule = packagePath ? resolveEcmarkupModule(packagePath) : ecmarkupModule;
}

/* @internal */
export function getEcmarkupModule() {
    return currentEcmarkupModule;
}

export {};