var SystemJSRegisterPublicModules = require('../../systemjs-register-public-modules.js');

module.exports = {
  mode: 'development',

  entry: './main.js',
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
    filename: 'out.js',
  },
};
