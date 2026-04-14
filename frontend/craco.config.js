// Load configuration from environment or config file
const path = require('path');
const webpack = require('webpack');

// Environment variable overrides
const config = {
  disableHotReload: process.env.DISABLE_HOT_RELOAD === 'true',
};

module.exports = {
  devServer: (devServerConfig) => {
    // Fix WebSocket configuration
    devServerConfig.client = {
      webSocketURL: {
        hostname: '0.0.0.0',
        pathname: '/ws',
        port: process.env.WDS_SOCKET_PORT || 443,
        protocol: 'wss',
      },
      overlay: {
        errors: true,
        warnings: false,
      },
    };
    return devServerConfig;
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {
      
      // Expose BACKEND_URL to the frontend bundle from REACT_APP_BACKEND_URL
      // CRA only injects REACT_APP_* prefixed vars, but the codebase uses process.env.BACKEND_URL
      webpackConfig.plugins.push(
        new webpack.DefinePlugin({
          'process.env.BACKEND_URL': JSON.stringify(process.env.REACT_APP_BACKEND_URL || ''),
        })
      );

      // Disable hot reload completely if environment variable is set
      if (config.disableHotReload) {
        // Remove hot reload related plugins
        webpackConfig.plugins = webpackConfig.plugins.filter(plugin => {
          return !(plugin.constructor.name === 'HotModuleReplacementPlugin');
        });
        
        // Disable watch mode
        webpackConfig.watch = false;
        webpackConfig.watchOptions = {
          ignored: /.*/, // Ignore all files
        };
      } else {
        // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
          ],
        };
      }
      
      return webpackConfig;
    },
  },
};