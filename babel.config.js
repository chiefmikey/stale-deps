module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: { node: 'current' },
      modules: 'auto'
    }],
    '@babel/preset-typescript'
  ],
  plugins: [
    '@babel/plugin-syntax-jsx',
    '@babel/plugin-syntax-typescript',
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    '@babel/plugin-proposal-class-properties'
  ],
  assumptions: {
    setPublicClassFields: true
  },
  sourceType: 'module'
};
