import nextConfig from 'eslint-config-next';

const config = [
  ...nextConfig,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/scene/**',
      'public/assets/**',
      'docs/**',
    ],
  },
];

export default config;
