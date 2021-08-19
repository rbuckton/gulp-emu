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
    readonly module: typeof import("ecmarkup");
    readonly mode: "v7" | "v3";
    readonly path: string;
}

const ecmarkupModule: EcmarkupModule = {
    path: path.dirname(require.resolve("ecmarkup/package.json")),
    mode: semver.satisfies(require("ecmarkup/package.json").version, ">= 7.0.0") ? "v7" : "v3",
    module: require("ecmarkup"),
};

let currentEcmarkupModule = ecmarkupModule;

/* @internal */
export function setEcmarkup(packagePath: string | undefined) {
    if (packagePath) {
        if (!path.isAbsolute(packagePath) || path.basename(packagePath) !== "package.json") {
            throw new TypeError("Expected an absolute path to 'package.json'")
        }
        currentEcmarkupModule = {
            path: path.dirname(packagePath),
            mode: semver.satisfies(require(packagePath).version, ">= 7.0.0") ? "v7" : "v3",
            module: require(path.dirname(packagePath)) as typeof import("ecmarkup"),
        };
    }
    else {
        currentEcmarkupModule = ecmarkupModule;
    }
}

/* @internal */
export function getEcmarkupModule() {
    return currentEcmarkupModule;
}

export {};