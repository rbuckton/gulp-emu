// @ts-check
const gulp = require("gulp");
const mocha = require("gulp-mocha");
const del = require("del");
const { buildProject } = require("./scripts/build");
const { exec } = require("./scripts/exec");

gulp.task("clean", () => del(["out"]));
gulp.task("clean-local-baselines", () => del(["tests/baselines/local"]));
gulp.task("build", () => buildProject("tsconfig.json"));

gulp.task("accept-baselines", () => gulp
    .src("tests/baselines/local/**/*")
    .pipe(gulp.dest("tests/baselines/reference")));

gulp.task("test", gulp.series("build", "clean-local-baselines", () => gulp
    .src("out/tests/index.js", { read: false })
    .pipe(mocha())));

gulp.task("prepublish", gulp.task("test"));
gulp.task("default", gulp.task("test"));

gulp.task("watch", gulp.series("build", () => gulp
    .watch(["src/**/*", "tests/baselines/reference/**/*", "tests/scenarios/**/*"], gulp.task("test"))));

gulp.task("diff", () => {
    const difftool = process.env.DIFF;
    if (!difftool) {
        throw new Error("Add the 'DIFF' environment variable to the path of the program you want to use.");
    }
    return exec(difftool, ["tests/baselines/reference", "tests/baselines/local"], { ignoreExitCode: true, waitForExit: false, verbose: true })
});