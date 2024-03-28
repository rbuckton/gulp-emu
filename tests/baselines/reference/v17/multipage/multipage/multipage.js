'use strict';
let multipageMap = JSON.parse(`{"index":["sec-intro"],"example":["sec-example","_ref_0","_ref_1"],"copyright-and-software-license":["sec-copyright-and-software-license"]}`);
'use strict';
let idToSection = Object.create(null);
for (let [section, ids] of Object.entries(multipageMap)) {
  for (let id of ids) {
    if (!idToSection[id]) {
      idToSection[id] = section;
    }
  }
}
if (location.hash) {
  let targetSec = idToSection[location.hash.substring(1)];
  if (targetSec != null) {
    let match = location.pathname.match(/([^/]+)\.html?$/);
    if ((match != null && match[1] !== targetSec) || location.pathname.endsWith('/multipage/')) {
      window.navigating = true;
      location = (targetSec === 'index' ? './' : targetSec + '.html') + location.hash;
    }
  }
}

