# gulp-emu

`gulp-emu` is a gulp plugin for building [ecmarkup](https://github.com/bterlson/ecmarkup) specifications.

# Installation
```
npm install gulp-emu
```

> NOTE: `gulp-emu` requires NodeJS 4.0 or greater.

# Usage

```js
var emu = require("gulp-emu");

gulp.task("build", () => gulp.src("spec.html")
    .pipe(emu(options))
    .pipe(gulp.dest("out")));
```

# Options
`gulp-emu` has the following options:

* `biblio` &lt;`boolean`&gt; - Indicates whether to include `{basename}.biblio.json` in the output stream.
* `css` &lt;`boolean`&gt; - Indicates whether to include `elements.css` in the output stream.
* `js` &lt;`boolean`&gt; - Indicates whether to include `menu.js` and `findLocalReferences.js` in the output stream.
* `ecmarkup` [options](https://bterlson.github.io/ecmarkup/#useful-options)

