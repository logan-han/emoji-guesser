const fs = require('fs');
const path = require('path');

const configPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-scripts',
  'config',
  'webpackDevServer.config.js'
);
const startScriptPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-scripts',
  'scripts',
  'start.js'
);

if (!fs.existsSync(configPath)) {
  process.exit(0);
}

let source = fs.readFileSync(configPath, 'utf8');

source = source.replace(
  '    https: getHttpsConfig(),',
  "    server: getHttpsConfig() ? { type: 'https', options: getHttpsConfig() } : 'http',"
);

const legacyMiddlewareHooks = `    // \`proxy\` is run between \`before\` and \`after\` \`webpack-dev-server\` hooks
    proxy,
    onBeforeSetupMiddleware(devServer) {
      // Keep \`evalSourceMapMiddleware\`
      // middlewares before \`redirectServedPath\` otherwise will not have any effect
      // This lets us fetch source contents from webpack for the error overlay
      devServer.app.use(evalSourceMapMiddleware(devServer));

      if (fs.existsSync(paths.proxySetup)) {
        // This registers user provided middleware for proxy reasons
        require(paths.proxySetup)(devServer.app);
      }
    },
    onAfterSetupMiddleware(devServer) {
      // Redirect to \`PUBLIC_URL\` or \`homepage\` from \`package.json\` if url not match
      devServer.app.use(redirectServedPath(paths.publicUrlOrPath));

      // This service worker file is effectively a 'no-op' that will reset any
      // previous service worker registered for the same host:port combination.
      // We do this in development to avoid hitting the production cache if
      // it used the same host and port.
      // https://github.com/facebook/create-react-app/issues/2272#issuecomment-302832432
      devServer.app.use(noopServiceWorkerMiddleware(paths.publicUrlOrPath));
    },`;

const webpack5MiddlewareHook = `    proxy,
    setupMiddlewares(middlewares, devServer) {
      if (!devServer) {
        throw new Error('webpack-dev-server is not defined');
      }

      // Keep \`evalSourceMapMiddleware\` before \`redirectServedPath\` otherwise
      // it will not have any effect. This lets us fetch source contents from
      // webpack for the error overlay.
      devServer.app.use(evalSourceMapMiddleware(devServer));

      if (fs.existsSync(paths.proxySetup)) {
        require(paths.proxySetup)(devServer.app);
      }

      devServer.app.use(redirectServedPath(paths.publicUrlOrPath));
      devServer.app.use(noopServiceWorkerMiddleware(paths.publicUrlOrPath));

      return middlewares;
    },`;

source = source.replace(legacyMiddlewareHooks, webpack5MiddlewareHook);

fs.writeFileSync(configPath, source);

if (!fs.existsSync(startScriptPath)) {
  process.exit(0);
}

let startScript = fs.readFileSync(startScriptPath, 'utf8');

startScript = startScript.replace(
  `        devServer.close();
        process.exit();`,
  `        if (typeof devServer.close === 'function') {
          devServer.close();
          process.exit();
          return;
        }

        if (typeof devServer.stopCallback === 'function') {
          devServer.stopCallback(() => process.exit());
          return;
        }

        if (typeof devServer.stop === 'function') {
          Promise.resolve(devServer.stop()).finally(() => process.exit());
          return;
        }

        process.exit();`
);

fs.writeFileSync(startScriptPath, startScript);
