var vfs = require("vinyl-fs");
module.exports = function (emu, setEcmarkup) {
    setEcmarkup(require.resolve("ecmarkup/package.json"));
    return vfs
        .src("**/*.html", { cwd: __dirname })
        .pipe(emu({ contributors: "Test", date: new Date(2020, 1, 1), js: "ecmarkup.js", css: "ecmarkup.css" }));
};