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

import { AsyncCountdownEvent } from "@esfx/async-countdown";
import { AsyncQueue } from "@esfx/async-queue";
import * as emu from "ecmarkup";
import * as fs from "fs";
import * as path from "path";
import * as semver from "semver";
import { Transform } from "stream";
import { EcmarkupModule, getEcmarkupModule } from "./ecmarkupModule";
import PluginError = require("plugin-error");
import Vinyl = require("vinyl");

const ecmarkupVersion = require("ecmarkup/package.json").version as string;
const ecmarkupMode = semver.satisfies(ecmarkupVersion, ">= 7.0.0") ? "v7" : "v3";

function ecmarkup(opts?: ecmarkup.Options): NodeJS.ReadWriteStream {
    return new ecmarkup.EcmarkupTransform(opts);
}

// v3.0 - v6.1
interface SinglePageSpec extends Omit<emu.Spec, "toHTML" | "generatedFiles"> {
    toHTML(): string;
}

// v7.0+
interface MultiPageSpec extends Omit<emu.Spec, "toHTML" | "generatedFiles"> {
    toHTML?(): string;
    generatedFiles: Map<string | null, string>;
}

namespace ecmarkup {
    export interface Options extends Omit<emu.Options, "jsOut" | "cssOut" | "outfile" | "watch"> {
        js?: boolean | string;
        css?: boolean | string;
        biblio?: boolean;
    }

    export class EcmarkupTransform extends Transform {
        private _opts: Required<Pick<Options, "js" | "css" | "biblio">>;
        private _emuOpts: emu.Options;
        private _queue = new AsyncQueue<Vinyl[]>();
        private _countdown = new AsyncCountdownEvent(1);
        private _cache = new Map<string, string>();
        private _ecmarkup: EcmarkupModule = getEcmarkupModule();

        constructor(opts: Options = {}) {
            super({ objectMode: true });
            this._opts = {
                js: pluck(opts, "js") ?? pluck(opts as emu.Options, "jsOut") ?? false,
                css: pluck(opts, "css") ?? pluck(opts as emu.Options, "cssOut") ?? false,
                biblio: pluck(opts, "biblio") ?? false,
            };
            this._emuOpts = { ...opts };
            delete this._emuOpts.outfile;
            delete this._emuOpts.cssOut;
            delete this._emuOpts.jsOut;

            if (this._emuOpts.multipage) {
                if (this._opts.js) {
                    throw new Error("Cannot use 'multipage' with 'js'");
                }
                if (this._opts.css) {
                    throw new Error("Cannot use 'multipage' with 'css'");
                }
            }

            switch (this._ecmarkup.mode) {
                case "v7":
                    // ecmarkup v7 adds js and css outputs to `generatedFiles`
                    if (this._emuOpts.multipage) {
                        this._emuOpts.outfile = "";
                    }

                    if (typeof this._opts.js === "string") {
                        this._emuOpts.jsOut = this._opts.js;
                    }
                    else if (this._opts.js) {
                        this._emuOpts.jsOut = "ecmarkup.js";
                    }

                    if (typeof this._opts.css === "string") {
                        this._emuOpts.cssOut = this._opts.css;
                    }
                    else if (this._opts.css) {
                        this._emuOpts.cssOut = "ecmarkup.css";
                    }
                    break;
                case "v3":
                    if (this._emuOpts.multipage) {
                        throw new Error("'multipage' requires ecmarkup >= v7.0.0");
                    }
                    break;
            }

            this._waitForWrite();
        }

        _write(file: Vinyl, enc: string, cb: () => void): void {
            if (file.isNull()) {
                return cb();
            }

            if (file.isStream()) {
                throw new PluginError("gulp-emu", "Stream not supported.");
            }

            // cache the file contents
            this._cache.set(file.path, (<Buffer>file.contents).toString("utf8"));

            // put an entry into the queue for the transformation
            this._enqueue(this._buildAsync(file));

            cb();
        }

        _flush(cb: () => void) {
            if (this._ecmarkup.mode !== "v7") {
                const files: { src: string[], dest: string }[] = [];

                // add extra files
                const css = this._opts.css;
                if (css) {
                    const dest = typeof css === "string" ? css : "elements.css";
                    files.push({ src: [path.join(this._ecmarkup.path, "css/elements.css")], dest });
                }

                const js = this._opts.js;
                if (js) {
                    if (typeof js === "string") {
                        files.push({
                            src: [
                                path.join(this._ecmarkup.path, "js/menu.js"),
                                path.join(this._ecmarkup.path, "js/findLocalReferences.js")
                            ],
                            dest: js
                        });
                    }
                    else {
                        files.push({ src: [path.join(this._ecmarkup.path, "js/menu.js")], dest: "menu.js" });
                        files.push({ src: [path.join(this._ecmarkup.path, "js/findLocalReferences.js")], dest: "findLocalReferences.js" });
                    }
                }

                if (files.length) {
                    this._enqueue(this._readFilesAsync(files));
                }
            }

            this._countdown.signal();
            this._countdown.wait()
                .then(() => cb())
                .catch(e => this.emit("error", e));
        }

        private _enqueue(promise: PromiseLike<Vinyl[]>) {
            this._countdown.add();
            this._queue.put(promise);
        }

        private _finishWrite(files: Vinyl[]) {
            for (const file of files) {
                this.push(file);
            }
            this._countdown.signal();
            this._waitForWrite();
        }

        private _waitForWrite() {
            this._queue.get().then(file => this._finishWrite(file), e => this.emit("error", e));
        }

        private async _buildAsync(file: Vinyl) {
            const files: Vinyl[] = [];
            const opts = { ...this._emuOpts };
            opts.log ??= msg => {
                console.log("ecmarkup:", msg);
            };
            opts.warn ??= err => {
                console.warn(err.message);
            };
            const spec = await this._ecmarkup.module.build(file.path, path => this._readFileAsync(path), this._emuOpts);
            if (spec) {
                if (this._opts.biblio) {
                    const dirname = path.dirname(file.path);
                    const extname = path.extname(file.path);
                    const basename = path.basename(file.path, extname);
                    const biblio = new Vinyl({
                        path: path.join(dirname, basename + ".biblio.json"),
                        base: file.base,
                        contents: Buffer.from(JSON.stringify(spec.exportBiblio()), "utf8")
                    });
                    files.push(biblio);
                }

                switch (this._ecmarkup.mode) {
                    case "v7":
                        if (!isMultiPageSpec(spec)) throw new TypeError("Cannot read spec output.");
                        const dirname = path.dirname(file.path);
                        for (const [filename, contents] of spec.generatedFiles) {
                            if (filename === null) {
                                file.contents = Buffer.from(contents, "utf8");
                                files.push(file);
                            }
                            else {
                                const output = new Vinyl({
                                    path: path.join(dirname, filename),
                                    base: file.base,
                                    contents: Buffer.from(contents, "utf8")
                                });
                                files.push(output);
                            }
                        }
                        break;
                    case "v3":
                        if (!isSinglePageSpec(spec)) throw new TypeError("Cannot read spec output.");
                        file.contents = Buffer.from(spec.toHTML(), "utf8");
                        files.push(file);
                        break;
                }
            }
            return files;
        }

        private async _readFilesAsync(files: { src: string[], dest: string }[]) {
            return await Promise.all(files.map(file => this._mergeFilesAsync(file)));
        }

        private async _mergeFilesAsync(file: { src: string[], dest: string }) {
            const srcContents = await Promise.all(file.src.map(src => this._readFileAsync(src)));
            const contents = srcContents.join("");
            const base = path.dirname(file.src[0]);
            return new Vinyl({
                path: path.join(base, file.dest),
                base,
                contents: Buffer.from(contents, "utf8")
            });
        }

        private async _readFileAsync(path: string) {
            let contents = this._cache.get(path);
            if (!contents) {
                contents = await readFile(path, "utf8");
                this._cache.set(path, contents);
            }
            return contents;
        }
    }
}

function readFile(file: string, encoding: string) {
    return new Promise<string>((resolve, reject) => {
        fs.readFile(file, encoding, (err, data) => err ? reject(err) : resolve(data));
    });
}

function pluck<T, K extends keyof T>(obj: T, key: K) {
    const value = obj[key];
    delete obj[key];
    return value;
}

function isSinglePageSpec(spec: Omit<emu.Spec, "toHTML" | "generatedFiles">): spec is SinglePageSpec {
    return typeof (spec as SinglePageSpec).toHTML === "function";
}

function isMultiPageSpec(spec: Omit<emu.Spec, "toHTML" | "generatedFiles">): spec is MultiPageSpec {
    return typeof (spec as MultiPageSpec).generatedFiles === "object";
}

export = ecmarkup;