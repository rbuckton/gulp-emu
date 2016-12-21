/*!
 *  Copyright 2016 Ron Buckton (rbuckton@chronicles.org)
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

import * as fs from "fs";
import * as path from "path";
import * as gutil from "gulp-util";
import { build, Options as BuildOptions } from "ecmarkup";
import { Transform } from "stream";
import { AsyncQueue, CountdownEvent } from "prex";
import Vinyl = require("vinyl");

function ecmarkup(opts?: ecmarkup.Options): NodeJS.ReadWriteStream {
    return new ecmarkup.EcmarkupTransform(opts);
}

namespace ecmarkup {
    export interface Options extends BuildOptions {
        js?: boolean | string;
        css?: boolean | string;
        biblio?: boolean;
    }

    export class EcmarkupTransform extends Transform {
        private _opts: Pick<Options, "js" | "css" | "biblio">;
        private _emuOpts: Options;
        private _queue = new AsyncQueue<Vinyl[]>();
        private _countdown = new CountdownEvent(1);
        private _cache = new Map<string, string>();

        constructor(opts: Options = {}) {
            super({ objectMode: true });
            this._opts = {
                js: pluck(opts, "js"),
                css: pluck(opts, "css"),
                biblio: pluck(opts, "biblio")
            };
            this._emuOpts = opts;
            this._waitForWrite();
        }

        _write(file: Vinyl, enc: string, cb: () => void): void {
            if (file.isNull()) {
                return cb();
            }

            if (file.isStream()) {
                throw new gutil.PluginError("gulp-emu", "Stream not supported.");
            }

            // cache the file contents
            this._cache.set(file.path, (<Buffer>file.contents).toString("utf8"));

            // put an entry into the queue for the transformation
            this._enqueue(this._buildAsync(file));

            cb();
        }

        _flush(cb: () => void) {
            const files: { src: string[], dest: string }[] = [];

            const css = this._opts.css;
            if (css) {
                const dest = typeof css === "string" ? css : "elements.css";
                files.push({ src: [require.resolve("ecmarkup/css/elements.css")], dest });
            }

            const js = this._opts.js;
            if (js) {
                if (typeof js === "string") {
                    files.push({
                        src: [
                            require.resolve("ecmarkup/js/menu.js"),
                            require.resolve("ecmarkup/js/findLocalReferences.js")
                        ],
                        dest: js
                    });
                }
                else {
                    files.push({ src: [require.resolve("ecmarkup/js/menu.js")], dest: "menu.js" });
                    files.push({ src: [require.resolve("ecmarkup/js/findLocalReferences.js")], dest: "findLocalReferences.js" });
                }
            }

            if (files.length) {
                this._enqueue(this._readFilesAsync(files));
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
            const spec = await build(file.path, path => this._readFileAsync(path), this._emuOpts);
            if (spec) {
                if (this._opts.biblio) {
                    const dirname = path.dirname(file.path);
                    const extname = path.extname(file.path);
                    const basename = path.basename(file.path, extname);
                    const biblio = new Vinyl({
                        path: path.join(dirname, basename + ".biblio.json"),
                        base: file.base,
                        contents: new Buffer(JSON.stringify(spec.exportBiblio()), "utf8")
                    });
                    files.push(biblio);
                }
                const html = spec.toHTML();
                file.contents = new Buffer(html, "utf8");
                files.push(file);
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
                contents: new Buffer(contents, "utf8")
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

export = ecmarkup;