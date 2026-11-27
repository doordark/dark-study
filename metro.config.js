const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

const prevGetTransformOptions = config.transformer?.getTransformOptions;
config.transformer = {
  ...config.transformer,
  getTransformOptions: async (entryPoints, options, getDependenciesOf) => {
    const base = prevGetTransformOptions
      ? await prevGetTransformOptions(entryPoints, options, getDependenciesOf)
      : {};
    return {
      ...base,
      transform: {
        ...base?.transform,
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    };
  },
};

module.exports = withNativeWind(config, { input: './src/global.css' });
