/// <reference types="mocha" />
import * as fs from "fs";
import * as path from "path";
import * as events from "events";
import { use, assert } from "chai";
import { chaiBaseline } from "chai-baseline";
import emu = require("../index");
import File = require("vinyl");
import * as child_process from "child_process";
import { Deferred } from "@esfx/async-deferred";
import { setEcmarkup } from "../ecmarkupModule";

use(chaiBaseline);

describe("scenario", () => {
    const testsdir = path.join(__dirname, "../../tests");
    const baselinesdir = path.join(testsdir, "baselines");
    const scenariosdir = path.join(testsdir, "scenarios");
    for (const version of fs.readdirSync(scenariosdir)) {
        describe(version, () => {
            const versiondir = path.join(scenariosdir, version);
            const packageJson = path.join(versiondir, "package.json");
            if (fs.existsSync(packageJson)) {
                before(async function () {
                    this.timeout(30_000);
                    const installDeferred = new Deferred<void>();
                    child_process.exec(`npm install --no-package-lock`, { cwd: versiondir }, installDeferred.callback);
                    await installDeferred.promise;
                    try { fs.mkdirSync(path.join(baselinesdir, "local", version), { recursive: true }); } catch { }
                });
            }
            for (const name of fs.readdirSync(versiondir)) {
                if (name === "node_modules") continue;
                const scenariodir = path.join(versiondir, name);
                const build = path.join(scenariodir, "build.js");
                if (fs.existsSync(build)) {
                    beforeEach(() => setEcmarkup(undefined));
                    afterEach(() => setEcmarkup(undefined));
                    it(name, async function () {
                        this.timeout(30_000);
                        let ended = false;
                        const deferred = new Deferred<void>();
                        const files: string[] = [];
                        const participants: PromiseLike<void>[] = [];
                        const scenario = require(build) as (emu_: typeof emu, setEcmarkup_: typeof setEcmarkup) => events.EventEmitter;
                        const stream = scenario(emu, setEcmarkup);
                        stream.on("data", (file: File) => {
                            const basename = path.basename(file.relative);
                            const relativedir = path.normalize(path.dirname(file.relative))
                                .replace(/([\\/])\.($|[\\/])/g, "$1dot$2")
                                .replace(/(^|[\\/])\.\.($|[\\/])/g, "$1dotDot$2");
                            files.push(path.normalize(path.join(relativedir, basename)));
                            const contents = file.contents === null ? undefined : file.contents;
                            const relative = path.join(version, name, relativedir, basename);
                            participants.push(assert.baseline(contents, relative, { base: baselinesdir }));
                        });

                        stream.on("error", deferred.reject);
                        stream.on("close", onend);
                        stream.on("end", onend);

                        await deferred.promise;

                        function onend() {
                            if (ended) return;
                            ended = true;
                            participants.push(assert.baseline(JSON.stringify(files.sort(), undefined, "  "), path.join(version, name, "files.json"), { base: baselinesdir }));
                            Promise.any(participants).then(
                                deferred.resolve,
                                e => e instanceof AggregateError ?
                                    deferred.reject(e.errors[0]) :
                                    deferred.reject(e));
                        }
                    });
                }
            }
        });
    }
});