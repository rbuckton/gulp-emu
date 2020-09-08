const gulp = require("gulp");
const mocha = require("gulp-mocha");
const del = require("del");
const { buildProject } = require("./scripts/build");
const { exec } = require("./scripts/exec");

const clean = () => del(["out"]);
gulp.task("clean", clean);

const build = () => exec(process.execPath, [require.resolve("typescript/lib/tsc.js"), "-b", "tsconfig.json"]);
gulp.task("build:debug", build);

const buildClean = gulp.series(clean, build);
gulp.task("build:release", buildClean);
gulp.task("build", buildClean);
gulp.task("prepublish", buildClean);

const acceptBaselines = () => gulp
    .src("tests/baselines/local/**/*")
    .pipe(gulp.dest("tests/baselines/reference"));
gulp.task("accept-baselines", acceptBaselines);

const cleanLocalBaselines = () => del(["tests/baselines/local"]);
gulp.task("clean-local-baselines", cleanLocalBaselines);

const test = () => gulp
    .src("out/tests/index.js", { read: false })
    .pipe(mocha());
const testClean = gulp.series(build, cleanLocalBaselines, test);
gulp.task("test", testClean);
gulp.task("default", testClean);

const watch = () => gulp
    .watch(["src/**/*", "tests/baselines/reference/**/*", "tests/scenarios/**/*"], testClean);
gulp.task("watch", gulp.series(build, watch));

gulp.task("diff", () => {
    const difftool = process.env.DIFF;
    if (!difftool) {
        throw new Error("Add the 'DIFF' environment variable to the path of the program you want to use.");
    }
    return exec(difftool, ["tests/baselines/reference", "tests/baselines/local"], { ignoreExitCode: true, waitForExit: false, verbose: true })
});