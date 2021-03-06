# Webpack SystemJS Registration Plugin

This repo is based on Guy Bedford's [Webpack SystemJS Registration Plugin](https://github.com/guybedford/systemjs-webpack-plugin) but rewritten for webpack 4 and SystemJS 5+.
The original code is based in `packages/webpack2` while the new code is based in `packages/webpack4`.

## Idea

The basic idea is to make some modules imported by webpack available through `System.import`.
So when you have the following code in your webpack bundle:

```js
// Module in webpack
import _ from 'loadsh';

export function getLast(array) {
  return _.last(array);
}
```

You then can use the lodash dependency from this bundle in another bundle on your website by using systemJS modules:

```js
// System.JS module (e.g. generated by rollup)
System.register(['loadsh'], function(_export, _context) {
  'use strict';
  var _;

  return {
    setters: [
      function(module) {
        _ = module.default;
      },
    ],
    execute: function() {
      _.last([1, 2, 3]);
      // => 3
    },
  };
});
```

### Internals

First, you should know that Webpack and System.js have both an internal module resolver.
Webpack uses its own local-scoped `__webpack_require__(moduleId)` function to load modules internally, while System.js uses the global `System.import('module-name')` for loading its modules.
