// rollup.config.js
import resolve from '@rollup/plugin-node-resolve'
import babel from '@rollup/plugin-babel'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import cleanup from 'rollup-plugin-cleanup'
import builtins from 'rollup-plugin-node-builtins'


var external = Object.keys( require( './package.json' ).dependencies ).concat(
  'path',
  'crypto'
)

const extensions = [
  '.ts', '.js', '.jsx', '.tsx', '.json'
]

export default {
  external,
  input: 'src/main.ts',
  output: {
    dir: 'bundle',
    format: 'umd',
    globals: {
      '@ledgerhq/hw-transport-node-hid-noevents': 'TransportU2F',
      '@ledgerhq/hw-app-btc': 'Btc',
      'bitcoinjs-lib': 'bitcoinjs',
      'async-lock': 'AsyncLock',
      'electrum-api': 'electrumApi'
    }
  },
  plugins: [
    builtins(),
    resolve({ extensions , preferBuiltins: true, browser: true }),
    json(),
    commonjs(),
    babel({ extensions, include: ['src/**/*'], exclude: 'node_modules/**' }),
    cleanup({ comments: 'none', compactComments: false, extensions: ['js', 'jsx', 'ts', 'tsx']})
  ]
}
