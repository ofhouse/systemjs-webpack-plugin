var SystemJSRegisterPublicModules = require('../../systemjs-register-public-modules.js');

module.exports = {
  mode: 'development',

  entry: './main.js',

  module: {
    rules: [{ parser: { system: false } }],
  },

  plugins: [
    new SystemJSRegisterPublicModules({
      bundlesConfigForChunks: true, // defaults to true
      registerModules: [
        { filter: 'local', keyname: 'app/[relPath]' },
        { filter: 'public', keyname: m => m.request },
      ],
    }),
  ],
  output: {
    publicPath: '/test/example-project/dist/',
    filename: 'out.js',
  },
};
