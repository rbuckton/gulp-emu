var vfs = require("vinyl-fs");
module.exports = function (emu) {
    return vfs
        .src("**/*.html", { cwd: __dirname })
        .pipe(emu({ contributors: "Test", biblio: true }));
};