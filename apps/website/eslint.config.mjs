import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'app',
    stylistic: false,
    jsonc: false,
    yaml: false,
    pnpm: false,
    unicorn: false,
    ignores: [
      '.next/**',
      '.vinext/**',
      'build/**',
      'dist/**',
      'out/**',
      'public/**',
      'next-env.d.ts',
    ],
  },
  {
    rules: {
      'antfu/top-level-function': 'off',
      'node/prefer-global/process': 'off',
      'perfectionist/sort-imports': 'off',
      'perfectionist/sort-named-imports': 'off',
      'ts/method-signature-style': 'off',
    },
  },
)
