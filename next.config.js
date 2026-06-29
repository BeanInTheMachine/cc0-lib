/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    dangerouslyAllowSVG: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.cloudnouns.com",
      },
    ],
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: require.resolve("crypto-browserify"),
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer"),
        process: require.resolve("process/browser"),
      };

      const nodeModuleMap = {
        stream: require.resolve("stream-browserify"),
        crypto: require.resolve("crypto-browserify"),
      };

      config.plugins.push(
        {
          apply(compiler) {
            compiler.hooks.normalModuleFactory.tap("NodeSchemePlugin", (factory) => {
              factory.hooks.beforeResolve.tap("NodeSchemePlugin", (resolveData) => {
                if (!resolveData) return;
                const m = /^node:(\w+)$/.exec(resolveData.request);
                if (m) {
                  const replacement = nodeModuleMap[m[1]];
                  if (replacement) {
                    resolveData.request = replacement;
                  }
                }
              });
            });
          },
        },
        new webpack.ProvidePlugin({
          process: "process/browser",
          Buffer: ["buffer", "Buffer"],
        })
      );
    }
    return config;
  },
};

module.exports = nextConfig;
