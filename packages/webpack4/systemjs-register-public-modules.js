// TODO
// This is the webpack v4 plugin rewrite
const sep = require('path').sep;
const webpack = require('webpack');

const { Template } = webpack;

const PLUGIN_NAME = 'SystemJSRegister';

////////////////////////////////////////////////////////////////////////////////////////////////////
// Helpers
function stringifySparseArray(arr) {
  return (
    '[' +
    arr
      .map(function(value) {
        if (value === undefined) {
          return '';
        } else if (typeof value == 'boolean') {
          return value ? 1 : 0;
        } else {
          return JSON.stringify(value);
        }
      })
      .join(',')
      .replace(/,+$/, '') +
    ']'
  );
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Webpack plugin
class SystemJSRegisterPublicModules {
  constructor(options) {
    this.options = options || {};

    // default is public modules
    this.registerModules = options.registerModules || [{ filter: 'public' }];

    this.bundlesConfigForChunks =
      typeof options.bundlesConfigForChunks == 'boolean' ? options.bundlesConfigForChunks : true;
  }

  apply(compiler) {
    compiler.hooks.compilation.tap(PLUGIN_NAME, compilation => {
      const { bundlesConfigForChunks } = this;
      const { mainTemplate } = compilation;

      // Renders additional content to the bootstrap section of the main template
      mainTemplate.hooks.bootstrap.tap(PLUGIN_NAME, (source, chunk, hash) => {
        // TODO: This is called 3 times while its only called one time on wp2
        const manifest = this.getModuleLoaderManifest(
          compilation.modules,
          chunk,
          mainTemplate.outputOptions,
          hash,
          compiler.context
        );

        // TODO: maybe store it as a object could be the better option here
        let publicModuleLoaderManifest = [];
        let publicESModules = [];
        Object.keys(manifest.registerModules).forEach(key => {
          if (typeof key === 'number') {
            // webpack production mode
            publicModuleLoaderManifest[key] = manifest.registerModules[key];
            publicESModules[key] = manifest.esModules.hasOwnProperty(key) ? 1 : undefined;
          } else {
            // webpack dev mode
            publicModuleLoaderManifest.push(manifest.registerModules[key]);
            publicESModules.push(manifest.esModules.hasOwnProperty(key) ? 1 : undefined);
          }
        });

        return Template.asString([
          `// ${PLUGIN_NAME} bootstrap`,
          `var publicModuleLoaderManifest = JSON.parse('${JSON.stringify(
            manifest.registerModules
          )}');`,
          `var publicESModules = ${stringifySparseArray(publicESModules)};`,
          bundlesConfigForChunks
            ? `var publicModuleChunks = ${stringifySparseArray(manifest.chunks)};`
            : '',
          source,
        ]);
      });

      mainTemplate.hooks.addModule.tap(PLUGIN_NAME, source => {
        return Template.asString([
          source,
          `// ${PLUGIN_NAME} addModule`,
          'defineIfPublicSystemJSModule(moduleId);',
        ]);
      });

      mainTemplate.hooks.requireExtensions.tap(PLUGIN_NAME, (source, chunk, hash) => {
        const { bundlesConfigForChunks } = this;

        let output = [source, '', `// ${PLUGIN_NAME} requireExtensions`];

        if (bundlesConfigForChunks) {
          const chunkMaps = chunk.getChunkMaps();
          const { chunkFilename } = compilation.outputOptions;

          output.push('var systemJSBundlesConfig = {};');
          output.push('for (var chunkId in publicModuleChunks) {');
          output.push(
            Template.indent([
              'var moduleIds = publicModuleChunks[chunkId];',
              'var moduleNames = [];',
              'for (var i = 0; i < moduleIds.length; i++)',
              Template.indent(['moduleNames.push(publicModuleLoaderManifest[moduleIds[i]]);']),
            ])
          );
          output.push('}');
        }

        output.push('function defineIfPublicSystemJSModule(moduleId) {');
        output.push('var publicKey = publicModuleLoaderManifest[moduleId];');
        output.push('if (publicKey)');
        output.push(
          Template.indent([
            'System.register(publicKey, [], function($__exports) {',
            // this could be moved into execution scope
            Template.indent([
              'return {',
              Template.indent([
                'execute: function () {',
                Template.indent([`$__exports("default", ${mainTemplate.requireFn}.n(moduleId));`]),
                '}',
              ]),
              '};',
            ]),
            '});',

            // 'if (publicESModules[moduleId])',
            // Template.indent([
            //   'System.register(publicKey, [], function($__export) {',
            //   // this could be moved into execution scope
            //   Template.indent(['$__export(__webpack_require__(moduleId));']),
            //   '});',
            // ]),
            // 'else',
            // Template.indent([
            //   'System.registerDynamic(publicKey, [], false, function() {',
            //   Template.indent(['return __webpack_require__(moduleId);']),
            //   '});',
            // ]),
          ])
        );
        output.push('}');
        output.push('for (var moduleId in modules)');
        output.push(
          Template.indent([
            'if (Object.prototype.hasOwnProperty.call(modules, moduleId))',
            Template.indent(['defineIfPublicSystemJSModule(moduleId);']),
          ])
        );

        return Template.asString(output);
      });
    });
  }

  // given the entry chunk, determine which modules are public
  // and create the manifest of public modules and chunks to public modules
  //
  // id to public name (if public, otherwise undefined)
  // manifest.registerModules = ['b', 'a', 'main', 'lodash', undefined, undefined];
  //
  // id to boolean, indicating which are ES module objects
  // manifest.esModules = [0,0,1,0,0];
  //
  // chunk id to list of public module ids in that chunk
  // manifest.chunks = [[0, 3]];
  getModuleLoaderManifest(modules, entryChunk, outputOptions, hash, path) {
    const { bundlesConfigForChunks } = this;

    let includes = this.registerModules;
    // Note that the module ids are strings in development mode of webpack and
    // numbers in the production mode of webpack
    let manifest = {
      registerModules: {},
      esModules: {},
      chunks: [],
    };
    let existingKeys = [];
    // let path = outputOptions.path;

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // Filters

    // default filters and naming functions
    function publicFilter(module) {
      // is this good enough?
      return module.request.match(/^@[^\/\\]+\/\\[^\/\\]$|^[^\/\\]+$/);
    }
    function localFilter(module) {
      // modules outside of the project root are not considered local anymore
      if (module.path.substr(0, path.length) != path) {
        return false;
      }
      return !module.path.substr(path.length).match(/(^|\/|\\)node_modules(\/|\\|$)/);
    }
    function publicModuleName(module) {
      return module.request;
    }
    function localModuleName(module) {
      return module.relPath;
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // convert module objects into structured module objects for our own use
    const moduleObjs = modules.map(m => ({
      id: m.id,
      request: m.rawRequest || '',
      path: m.resource || '',

      relPath:
        m.resource && m.resource.substr(0, path.length + 1) == path + sep
          ? m.resource.substr(path.length + 1)
          : m.resource || '',

      // NB TODO:
      // isPackageMain: true / false
      // packageName: from package.json / node_modules derivation
      // packageVersion: from package.json

      meta: m.buildMeta,
    }));

    // determine includes
    includes.forEach((include, index) => {
      var filter = include.filter;
      var publicKeyFn = include.keyname;

      // public key template function
      // we should really do this with better properties than the normal module entries
      if (typeof publicKeyFn == 'string') {
        var string = publicKeyFn;
        publicKeyFn = function(module, existingKeys) {
          var str = string;
          // allow simple templating
          for (var p in module) {
            if (module.hasOwnProperty(p)) str = str.replace('[' + p + ']', module[p]);
          }
          return str;
        };
      }

      // default filters
      if (filter == 'all') {
        filter = function(module) {
          return true;
        };
        publicKeyFn =
          publicKeyFn ||
          function(module, existingKeys) {
            if (publicFilter(module)) {
              return publicNames(module);
            } else {
              return localNames(module);
            }
          };
      } else if (filter == 'public') {
        filter = publicFilter;
        publicKeyFn = publicKeyFn || publicModuleName;
      } else if (filter == 'local') {
        filter = localFilter;
        publicKeyFn = publicKeyFn || localModuleName;
      }

      if (!publicKeyFn) {
        throw new TypeError(
          'SystemJS register public modules plugin has no keyname function defined for filter ' +
            index
        );
      }

      moduleObjs
        .filter(m => filter(m, existingKeys))
        .forEach(m => {
          const publicKey = publicKeyFn(m, existingKeys);

          if (typeof publicKey !== 'string') {
            throw new TypeError(
              'SystemJS register public modules plugin did not return a valid key for ' + m.path
            );
          }

          if (existingKeys.indexOf(publicKey) !== -1) {
            if (manifest.registerModules[m.id] != publicKey) {
              throw new TypeError(
                'SystemJS register public module ' +
                  publicKey +
                  ' is already defined to another module'
              );
            }
            existingKeys.push(publicKey);
          }

          manifest.registerModules[m.id] = publicKey;

          if (m.meta.exportsType === 'namespace') {
            manifest.esModules[m.id] = true;
          }
        });
    });

    // build up list of public modules against chunkids
    if (bundlesConfigForChunks) {
      function visitChunks(chunk, visitor) {
        visitor(chunk);

        for (const chunkGroup of chunk.groupsIterable) {
          for (const child of chunkGroup.childrenIterable) {
            child.chunks.forEach(visitor);
          }
        }
      }

      visitChunks(entryChunk, function(chunk) {
        var publicChunkModuleIds = [];

        for (const module of chunk.modulesIterable) {
          if (manifest.registerModules[module.id]) {
            publicChunkModuleIds.push(module.id);
          }
        }

        // is it possible for the main entry point to contain multiple chunks? how would we know what these are?
        // or is the main compilation always the first chunk?
        if (publicChunkModuleIds.length && chunk.id !== entryChunk.id) {
          manifest.chunks[chunk.id] = publicChunkModuleIds;
        }
      });
    }

    return manifest;
  }
}

module.exports = SystemJSRegisterPublicModules;
