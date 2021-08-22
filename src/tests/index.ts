/// <reference types="mocha" />
import { Deferred } from "@esfx/async-deferred";
import { assert, use } from "chai";
import { chaiBaseline } from "chai-baseline";
import * as events from "events";
import * as fs from "fs";
import * as path from "path";
import { getEcmarkupModule, setEcmarkup } from "../ecmarkupModule";
import emu = require("../index");
import File = require("vinyl");

// preload each ecmarkup version we're testing against
import "ecmarkup-v4";
import "ecmarkup-v7";
import "ecmarkup-v8";
import "ecmarkup-v9";

use(chaiBaseline);

describe("scenario", () => {
    const testsdir = path.join(__dirname, "../../tests");
    const baselinesdir = path.join(testsdir, "baselines");
    const scenariosdir = path.join(testsdir, "scenarios");
    for (const version of fs.readdirSync(scenariosdir)) {
        describe(version, function () {
            this.timeout(10_000);
            const versiondir = path.join(scenariosdir, version);
            const setupJs = path.join(versiondir, "setup.js");
            if (fs.existsSync(setupJs)) {
                const setup = require(setupJs) as (setEcmarkup_: typeof setEcmarkup) => void;
                beforeEach(() => setup(setEcmarkup));
                afterEach(() => setEcmarkup(undefined));
            }

            for (const name of fs.readdirSync(versiondir)) {
                if (name === "node_modules") continue;
                const scenariodir = path.join(versiondir, name);
                const build = path.join(scenariodir, "build.js");
                if (fs.existsSync(build)) {
                    it(name, async function () {
                        let ended = false;
                        const deferred = new Deferred<void>();
                        const files: string[] = [];
                        const participants: PromiseLike<void>[] = [];
                        const ecmarkupVersion = getEcmarkupModule().version;
                        const gulpEmuMode = getEcmarkupModule().mode;
                        const scenario = require(build) as (emu_: typeof emu) => events.EventEmitter;
                        const stream = scenario(emu);
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
                            const summary = {
                                ecmarkupVersion: ecmarkupVersion,
                                mode: gulpEmuMode,
                                files: files.sort()
                            };
                            const summaryText = JSON.stringify(summary, undefined, "  ");
                            participants.push(assert.baseline(summaryText, path.join(version, name, "files.json"), { base: baselinesdir }));
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