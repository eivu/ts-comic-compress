# [2.0.0](https://github.com/eivu/ts-comic-compress/compare/v1.2.0...v2.0.0) (2026-05-02)


### ⚠ BREAKING CHANGES

* **Package is now ESM-only.** `package.json` sets `"type": "module"` and ships a strict `"exports"` map. CommonJS consumers can no longer `require()` this package; they must `import()` it (Node 18.18+) or migrate their consuming project to ESM.
* **Minimum Node.js version is now 18.18.**
* **Public entry points are now declared via `exports`.** Consumers should use:
  - `import { ComicProcessor } from "@eivu/ts-comic-compress"` for the full surface, or
  - `import { ComicProcessor } from "@eivu/ts-comic-compress/processor"` for the focused subpath.
  Reaching into `dist/*.js` directly is no longer supported.
* **`chalk` upgraded from `^4` to `^5`** (ESM-only). No API changes; the import shape is unchanged.
* **`pdfjs-dist` is now used via its modern ESM build**, with the worker source resolved through `createRequire(import.meta.url)`.
* **Tests migrated from Jest to Vitest.** Test behavior is unchanged, but if you were hooking into the test runner downstream, the harness is now Vitest.
* **`fs-extra` removed** in favor of a thin local wrapper around `node:fs/promises` (`src/fs-utils.ts`). No behavior change; one fewer CJS-only dependency.


### Features

* All compiled output is now native ESM (`import`/`export`) with `.js` specifiers in relative imports, no `require()`/`__importStar`/`__importDefault` plumbing in `dist/`.
* `runCli()` is exported from the main entry, so consumers can drive the CLI programmatically. The `comic-compress` bin still auto-invokes it when the file is executed directly.

# [1.2.0](https://github.com/eivu/ts-comic-compress/compare/v1.1.2...v1.2.0) (2026-05-01)


### Features

*  Skipped images now raise exceptions ([#11](https://github.com/eivu/ts-comic-compress/issues/11)) ([19f7b6c](https://github.com/eivu/ts-comic-compress/commit/19f7b6c5af99d89078df235a854cf9bf1ce2624b))

## [1.1.2](https://github.com/eivu/ts-comic-compress/compare/v1.1.1...v1.1.2) (2026-02-03)


### Bug Fixes

* **workflow:** Attempt [#3](https://github.com/eivu/ts-comic-compress/issues/3) ([#9](https://github.com/eivu/ts-comic-compress/issues/9)) ([5cb7525](https://github.com/eivu/ts-comic-compress/commit/5cb7525c3605851d0fce5301d0e66e74a2f936ad))

## [1.1.1](https://github.com/eivu/ts-comic-compress/compare/v1.1.0...v1.1.1) (2026-02-03)


### Bug Fixes

* **publishing:** Trying to use oidc for publshing to npm ([#8](https://github.com/eivu/ts-comic-compress/issues/8)) ([0ad8f24](https://github.com/eivu/ts-comic-compress/commit/0ad8f24a9b2b1eefd8675ecd25350923b5f3a56d)), closes [/#diff-87db21a973eed4fef5f32b267aa60fcee5cbdf03c67fafdc2a9b553bb0b15f34R46](https://github.com///issues/diff-87db21a973eed4fef5f32b267aa60fcee5cbdf03c67fafdc2a9b553bb0b15f34R46)

# [1.1.0](https://github.com/eivu/ts-comic-compress/compare/v1.0.0...v1.1.0) (2026-02-03)


### Bug Fixes

* **versioning:** Fixed semantic versioning creds ([#4](https://github.com/eivu/ts-comic-compress/issues/4)) ([2e7fc9b](https://github.com/eivu/ts-comic-compress/commit/2e7fc9b9e48d75c7f7decbb6846d1accdf660a21))
* **workflow:** Allowing repo to publish to npm ([#7](https://github.com/eivu/ts-comic-compress/issues/7)) ([0bede78](https://github.com/eivu/ts-comic-compress/commit/0bede78274646b0abbd5ecc79d160cc0f9ad5919))


### Features

* Added tests ([#3](https://github.com/eivu/ts-comic-compress/issues/3)) ([2686bc4](https://github.com/eivu/ts-comic-compress/commit/2686bc40977fb187393daf8c108f63f5191e27f9))
* **cbr:** App now supports cbr files over 2gb ([ac6b08f](https://github.com/eivu/ts-comic-compress/commit/ac6b08fa527bb3f6bb73b58c983848e49c428d35)), closes [/#diff-19651ffca5f6e31d2ceb41e60782d20bf96ddcfc284da2540eeb9d568040c5b5L187-R224](https://github.com///issues/diff-19651ffca5f6e31d2ceb41e60782d20bf96ddcfc284da2540eeb9d568040c5b5L187-R224) [/#diff-19651ffca5f6e31d2ceb41e60782d20bf96ddcfc284da2540eeb9d568040c5b5L208-R293](https://github.com///issues/diff-19651ffca5f6e31d2ceb41e60782d20bf96ddcfc284da2540eeb9d568040c5b5L208-R293) [/#diff-6763274d9da9a64ac0410b1c2c304867d85863934f55cb732cd8366c8c019dc0R1-R7](https://github.com///issues/diff-6763274d9da9a64ac0410b1c2c304867d85863934f55cb732cd8366c8c019dc0R1-R7) [/#diff-0efe37fd00411a87f29f6595262cba4ccd067841fb1cf6a84065adeea7b96e20R4-R14](https://github.com///issues/diff-0efe37fd00411a87f29f6595262cba4ccd067841fb1cf6a84065adeea7b96e20R4-R14)
