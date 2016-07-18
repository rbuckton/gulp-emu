var gulp = require("gulp")
  , tsb = require("gulp-tsb")
  , mocha = require("gulp-mocha")
  , del = require("del");

var project = tsb.create("src");

gulp.task("clean", cb => del(["out"], cb));

gulp.task("build", () => project
    .src()
    .pipe(project.compile())
    .pipe(gulp.dest("out")));

gulp.task("accept-baselines", () => gulp
    .src("tests/baselines/local/**/*")
    .pipe(gulp.dest("tests/baselines/reference")));

gulp.task("clean-local-baselines", cb => del(["tests/baselines/local"])
    .then(() => cb, e => cb(e)));

gulp.task("test", ["build", "clean-local-baselines"], () => gulp
    .src("out/tests/index.js", { read: false })
    .pipe(mocha()));

gulp.task("watch", ["build"], () => gulp
    .watch(project.globs.concat(["tests/baselines/reference/**/*", "tests/scenarios/**/*"]), ["test"]));

gulp.task("prepublish", ["test"]);

gulp.task("default", ["build"]);