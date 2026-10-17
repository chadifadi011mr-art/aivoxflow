// Mutable registry for fingerprinted asset URLs.
// build.mjs fills this before emitting pages, so every template links to the
// hashed filename. Keeping it in a module avoids threading a context object
// through every component.
export const assets = {
  css: '/assets/css/site.css',
  js: '/assets/js/site.js',
};
