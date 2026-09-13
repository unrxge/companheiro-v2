// studio/eslint.config.mjs — ESLint 9 flat config. eslint-config-next 15.x still
// ships legacy (eslintrc-style) presets, so they are loaded through FlatCompat
// (@eslint/eslintrc, a dependency of eslint 9). A flat config also stops ESLint
// from cascading into the parent repo's .eslintrc.json, which made the build's
// lint step report a duplicate @next/next plugin.

import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  { ignores: ['.next/**', 'node_modules/**', 'out/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // An underscore prefix marks a deliberately unused binding (stub
      // signatures other lanes fill in, rest-sibling drops such as
      // `({ updated_at: _u, ...row })`).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
]

export default eslintConfig
