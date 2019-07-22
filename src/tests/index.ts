/// <reference types="mocha" />
import * as fs from "fs";
import * as path from "path";
import * as events from "events";
import { use, assert } from "chai";
import { chaiBaseline } from "chai-baseline";
import emu = require("../index");
import File = require("vinyl");

use(chaiBaseline);

describe("scenario", () => {
    const testsdir = path.join(__dirname, "../../tests");
    const baselinesdir = path.join(testsdir, "baselines");
    const scenariosdir = path.join(testsdir, "scenarios");
    for (const name of fs.readdirSync(scenariosdir)) {
        const scenariodir = path.join(scenariosdir, name);
        const build = path.join(scenariodir, "build.js");
        if (fs.existsSync(build)) {
            it(name, done => {
                let ended = false;
                const files: string[] = [];
                const participants: PromiseLike<void>[] = [];
                const scenario = require(build) as (emu_: typeof emu) => events.EventEmitter;
                const stream = scenario(emu);
                stream.on("data", (file: File) => {
                    const basename = path.basename(file.relative);
                    const relativedir = path.normalize(path.dirname(file.relative))
                        .replace(/([\\/])\.($|[\\/])/g, "$1dot$2")
                        .replace(/(^|[\\/])\.\.($|[\\/])/g, "$1dotDot$2");
                    const relative = path.join(name, relativedir, basename);
                    files.push(path.normalize(path.join(relativedir, basename)));
                    const contents = file.contents === null ? undefined : file.contents;
                    participants.push(assert.baseline(contents, path.join(name, relativedir, basename), { base: baselinesdir }));
                });

                stream.on("error", done);
                stream.on("close", onend);
                stream.on("end", onend);

                function onend() {
                    if (ended) return;
                    ended = true;
                    participants.push(assert.baseline(JSON.stringify(files.sort(), undefined, "  "), path.join(name, "files.json"), { base: baselinesdir }));
                    waitOne();
                }

                function waitOne() {
                    const participant = participants.shift();
                    if (participant) {
                        participant.then(waitOne, done);
                    }
                    else {
                        done();
                    }
                }
            });
        }
    }
});