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
import { build, BuildOptions } from "ecmarkup";
import { Transform } from "stream";
import { AsyncQueue, CountdownEvent } from "prex";
import Vinyl = require("vinyl");

function ecmarkup(opts?: ecmarkup.Options): NodeJS.ReadWriteStream {
    return new ecmarkup.EcmarkupTransform(opts);
}

namespace ecmarkup {
    export interface Options extends BuildOptions {
        js?: boolean;
        css?: boolean;
        biblio?: boolean;
    }

    export class EcmarkupTransform extends Transform {
        private _opts: Options;
        private _queue = new AsyncQueue<Vinyl[]>();
        private _countdown = new CountdownEvent(1);
        private _cache: { [path: string]: string; } = Object.create(null);

        constructor(opts?: Options) {
            super({ objectMode: true });
            this._opts = opts || {};
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
            this._cache[file.path] = file.contents.toString("utf8");

            // put an entry into the queue for the transformation
            this._enqueue(build(file.path, path => this._readFile(path), this._opts).then(spec => {
                const files: Vinyl[] = [];
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
            }));

            cb();
        }

        _flush(cb: () => void) {
            const files: string[] = [];

            if (this._opts.css) {
                files.push(require.resolve("ecmarkup/css/elements.css"));
            }

            if (this._opts.js) {
                files.push(require.resolve("ecmarkup/js/menu.js"));
                files.push(require.resolve("ecmarkup/js/findLocalReferences.js"));
            }

            if (files.length) {
                this._enqueueFiles(files);
            }

            this._countdown.signal();
            this._countdown.wait()
                .then(() => cb())
                .catch(e => this.emit("error", e));
        }

        private _enqueueFiles(files: string[]) {
            this._enqueue(Promise.all(files.map(file => this._readFile(file))).then(filesContents => filesContents.map((contents, i) => new Vinyl({
                path: files[i],
                base: path.dirname(files[i]),
                contents: new Buffer(contents, "utf8")
            }))));
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

        private _readFile(path: string): PromiseLike<string> {
            return this._cache[path]
                ? Promise.resolve(this._cache[path])
                : readFile(path, "utf8")
                    .then(contents => this._cache[path] = contents);
        }
    }
}

function readFile(file: string, encoding: string) {
    return new Promise<string>((resolve, reject) => {
        fs.readFile(file, encoding, (err, data) => err ? reject(err) : resolve(data));
    });
}

export = ecmarkup;