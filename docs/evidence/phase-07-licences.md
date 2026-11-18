# Phase 7 dependency licence review

Run: 2026-11-18 on Windows, pnpm 12.21.0, Node 26.13.0.

Command:

```powershell
pnpm licence-check
```

The check reads `pnpm -r licenses list --json` from the installed tree, so it covers direct and transitive dependencies of every workspace package. It is also a CI step (`.github/workflows/ci.yml`). A licence label not on the reviewed allowlist fails the check.

Installed packages reported: 164 across 7 licence labels.

| Licence label | Packages | Review note |
|---|---|---|
| Apache-2.0 | 7 | Permissive; compatible with Apache-2.0 distribution |
| BSD-3-Clause | 1 | Permissive; compatible with Apache-2.0 distribution |
| CC-BY-4.0 | 1 | Attribution: caniuse-lite build data, credited in README.md |
| ISC | 5 | Permissive; compatible with Apache-2.0 distribution |
| MIT | 146 | Permissive; compatible with Apache-2.0 distribution |
| MIT OR Apache-2.0 | 2 | Permissive; compatible with Apache-2.0 distribution |
| MPL-2.0 | 2 | Weak copyleft: lightningcss used unmodified as build tooling |

No GPL, AGPL, SSPL, BUSL or `UNLICENSED` package was reported. MPL-2.0 and CC-BY-4.0 are the only labels that carry conditions; both are limited to build-time packages and are recorded in README.md.

## Packages by licence

### Apache-2.0

- `@qorechain/pqc` 0.2.3
- `@qorechain/qoreseal` 0.1.0
- `@qorechain/qoresign` 0.1.0, 0.2.0
- `baseline-browser-mapping` 2.11.37
- `detect-libc` 2.1.2
- `expect-type` 1.4.0
- `typescript` 5.9.3

### BSD-3-Clause

- `source-map-js` 1.2.2

### CC-BY-4.0

- `caniuse-lite` 1.0.30001826

### ISC

- `electron-to-chromium` 1.5.486
- `lru-cache` 5.1.1
- `picocolors` 1.1.1
- `semver` 6.3.2, 7.8.6
- `yallist` 3.1.1

### MIT

- `@actions/core` 3.0.1
- `@actions/exec` 3.0.0
- `@actions/http-client` 4.0.1
- `@actions/io` 3.0.2
- `@adraffy/ens-normalize` 1.11.1
- `@babel/code-frame` 7.29.7
- `@babel/compat-data` 7.29.7
- `@babel/core` 7.29.13
- `@babel/generator` 7.29.14
- `@babel/helper-compilation-targets` 7.29.13
- `@babel/helper-globals` 7.29.7
- `@babel/helper-module-imports` 7.29.7
- `@babel/helper-module-transforms` 7.29.14
- `@babel/helper-plugin-utils` 7.29.7
- `@babel/helper-string-parser` 7.29.14
- `@babel/helper-validator-identifier` 7.29.7
- `@babel/helper-validator-option` 7.29.7
- `@babel/helpers` 7.29.14
- `@babel/parser` 7.29.14
- `@babel/plugin-transform-react-jsx-self` 7.29.7
- `@babel/plugin-transform-react-jsx-source` 7.29.7
- `@babel/template` 7.29.7
- `@babel/traverse` 7.29.14
- `@babel/types` 7.29.14
- `@esbuild/win32-x64` 0.28.2
- `@jest/diff-sequences` 30.5.0
- `@jest/get-type` 30.5.0
- `@jest/schemas` 30.5.0
- `@jridgewell/gen-mapping` 0.3.13
- `@jridgewell/remapping` 2.3.5
- `@jridgewell/resolve-uri` 3.1.3
- `@jridgewell/sourcemap-codec` 1.6.0
- `@jridgewell/trace-mapping` 0.3.31
- `@noble/ciphers` 1.3.0, 2.2.0, 2.4.0
- `@noble/curves` 1.9.0, 1.9.1, 2.2.0, 2.4.0
- `@noble/hashes` 1.8.0, 2.2.0, 2.4.0
- `@noble/post-quantum` 0.7.1
- `@nomicfoundation/edr` 0.25.1
- `@nomicfoundation/edr-win32-x64-msvc` 0.25.1
- `@nomicfoundation/hardhat-errors` 3.1.5
- `@nomicfoundation/hardhat-network-helpers` 3.0.12
- `@nomicfoundation/hardhat-node-test-reporter` 3.1.1
- `@nomicfoundation/hardhat-node-test-runner` 3.1.2
- `@nomicfoundation/hardhat-utils` 5.1.2
- `@nomicfoundation/hardhat-vendored` 3.0.4
- `@nomicfoundation/hardhat-viem` 3.1.0
- `@nomicfoundation/hardhat-zod-utils` 3.0.9
- `@nomicfoundation/solidity-analyzer` 0.1.2
- `@nomicfoundation/solidity-analyzer-win32-x64-msvc` 0.1.2
- `@openzeppelin/contracts` 5.6.1
- `@rolldown/pluginutils` 1.0.0-rc.3
- `@rollup/rollup-win32-x64-gnu` 4.68.4
- `@rollup/rollup-win32-x64-msvc` 4.68.4
- `@scure/base` 1.2.6, 2.2.0, 2.4.0
- `@scure/bip32` 1.7.0, 2.4.0
- `@scure/bip39` 1.6.0, 2.4.0
- `@sentry/core` 9.47.2
- `@sinclair/typebox` 0.34.52
- `@streamparser/json` 0.0.26
- `@streamparser/json-node` 0.0.26
- `@types/babel__core` 7.20.5
- `@types/babel__generator` 7.27.0
- `@types/babel__template` 7.4.4
- `@types/babel__traverse` 7.28.0
- `@types/chai` 5.2.3
- `@types/deep-eql` 4.0.2
- `@types/estree` 1.0.10
- `@types/node` 26.6.6
- `@types/react` 19.3.0
- `@types/react-dom` 19.3.0
- `@vitejs/plugin-react` 5.2.0
- `@vitest/mocker` 5.1.0
- `@vitest/spy` 5.1.0
- `abitype` 1.2.3
- `adm-zip` 0.6.1
- `ansi-colors` 4.1.3
- `ansi-regex` 5.0.1
- `ansi-styles` 4.3.0, 5.2.0
- `assertion-error` 2.0.1
- `browserslist` 4.29.6
- `chai` 6.3.0
- `chalk` 4.1.2
- `chokidar` 5.0.0
- `color-convert` 2.0.1
- `color-name` 1.1.4
- `convert-source-map` 2.0.0
- `csstype` 3.2.3
- `debug` 4.4.3
- `enquirer` 2.4.1
- `env-paths` 4.0.0
- `es-module-lexer` 2.3.2
- `esbuild` 0.28.2
- `escalade` 3.2.0
- `estree-walker` 3.0.3
- `ethereum-cryptography` 3.2.0
- `eventemitter3` 5.0.1
- `fast-equals` 6.2.2
- `fdir` 6.5.0
- `gensync` 1.0.0-beta.2
- `hardhat` 3.22.0
- `has-flag` 4.0.0
- `is-safe-filename` 0.1.1
- `isows` 1.0.7
- `jest-diff` 30.5.2
- `js-tokens` 4.0.0
- `jsesc` 3.1.0
- `json-stream-stringify` 3.1.7
- `json5` 2.2.3
- `magic-string` 1.4.5
- `micro-eth-signer` 0.19.0
- `micro-packed` 0.9.0
- `ms` 2.1.3
- `nanoid` 3.3.20
- `node-releases` 2.0.64
- `obug` 3.0.0
- `ox` 0.14.57
- `p-map` 7.1.1
- `picomatch` 4.0.7
- `postcss` 8.5.33
- `pretty-format` 30.5.1
- `react` 19.3.1
- `react-dom` 19.3.1
- `react-is` 18.3.1, 19.3.1
- `react-refresh` 0.18.0
- `readdirp` 5.1.1
- `resolve.exports` 2.0.4
- `rfdc` 1.4.1
- `rollup` 4.68.4
- `scheduler` 0.28.0
- `std-env` 4.3.0
- `strip-ansi` 6.0.1
- `supports-color` 7.2.0
- `tinybench` 6.2.3
- `tinyexec` 1.3.1
- `tinyglobby` 0.2.17
- `tsx` 4.23.15
- `tunnel` 0.0.6
- `undici` 6.29.1, 7.30.2
- `undici-types` 8.9.0
- `update-browserslist-db` 1.4.0
- `viem` 2.57.11
- `vite` 7.3.8
- `vitest` 5.1.0
- `why-is-node-running` 3.2.1
- `ws` 8.21.0, 8.23.0
- `zod` 3.25.76

### MIT OR Apache-2.0

- `@biomejs/biome` 2.6.8
- `@biomejs/cli-win32-x64` 2.6.8

### MPL-2.0

- `lightningcss` 1.33.0
- `lightningcss-win32-x64-msvc` 1.33.0

## What this does not prove

- It does not prove that a package's declared licence is legally correct or that its files are free of other terms.
- It reads the platform-specific optional packages installed on Windows. CI on Linux resolves the matching Linux binaries; the licence labels are the same.
- It is a review of the current lockfile, not of future updates.
