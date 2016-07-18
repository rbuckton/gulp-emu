var gulp = require("gulp")
  , tsb = require("gulp-tsb")
  , mocha = require("gulp-mocha")
  , del = require("del");

var project = tsb.create("src");
var release = project.withCompilerOptions({ sourceMap: false });

gulp.task("clean", cb => del(["out"], cb));

gulp.task("build:debug", () => project
    .src()
    .pipe(project.compile())
    .pipe(gulp.dest("out")));

gulp.task("build:release", ["clean"], () => release
    .src()
    .pipe(release.compile())
    .pipe(gulp.dest("out")));

gulp.task("build", ["build:release"]);

gulp.task("accept-baselines", () => gulp
    .src("tests/baselines/local/**/*")
    .pipe(gulp.dest("tests/baselines/reference")));

gulp.task("clean-local-baselines", cb => del(["tests/baselines/local"])
    .then(() => cb, e => cb(e)));

gulp.task("test", ["build:debug", "clean-local-baselines"], () => gulp
    .src("out/tests/index.js", { read: false })
    .pipe(mocha()));

gulp.task("watch", ["build:debug"], () => gulp
    .watch(project.globs.concat(["tests/baselines/reference/**/*", "tests/scenarios/**/*"]), ["test"]));

gulp.task("prepublish", ["build:release"]);

gulp.task("default", ["test"]);