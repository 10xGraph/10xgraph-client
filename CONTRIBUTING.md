# Contributing to 10xgraph-client

Thanks for helping out. This covers setup, the checks your change has to pass, and what we
look for in a pull request.

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Scope of this package

This is the **TypeScript client SDK**. It talks to the server in
[`10xgraph-api`](https://github.com/10xGraph/10xgraph-api). If your
change is about how the server behaves rather than how the client calls it, it belongs
there. If it is about graph execution, it belongs in the core
[`10xgraph`](https://github.com/10xGraph/10xGraph) package.

## Setup

Requires Node 20 or newer.

```bash
git clone https://github.com/10xGraph/10xgraph-client.git
cd 10xgraph-client
npm ci
```

## The checks

All of these run in CI. Run them locally before opening a pull request.

```bash
npm run check          # lint + typecheck + tests, the whole gate
npm run lint           # eslint: zero errors, warnings capped at the ratchet
npm run format:check   # prettier
npm run typecheck      # tsc --noEmit, covers src/ and tests/
npm run test:run       # vitest
npm run test:coverage  # vitest + the coverage ratchet
npm run build          # tsc declarations + vite bundle
```

Notes:

- Coverage thresholds in `vitest.config.ts` are a **ratchet**. Raise them as coverage
  improves; never lower them to make a build pass.
- `npm run lint` must report **zero errors**. It also enforces a **warning ratchet**:
  `--max-warnings 253`, the count at the time linting was introduced (139
  `no-explicit-any`, 114 `no-console`). Adding a warning fails the build. When you fix
  warnings, lower the number in the `lint` script to lock the gain in. Never raise it.
- `tsconfig.json` type-checks `tests/` too. A test that does not type-check fails CI.

## Making a change

1. Branch off the default branch.
2. Add a test. Every endpoint has one in `tests/`; follow the neighbouring file's shape.
3. Update `CHANGELOG.md` under `[Unreleased]`, in the right subsection.
4. Update `README.md` if you changed a public method signature or added an endpoint.
5. Open the pull request and fill in the template.

### Public API changes

Everything exported from `src/index.ts` is public, and `index.ts` uses `export *` - so
**any exported symbol in any re-exported module is public API**, whether you intended it
or not. Before exporting something new, decide whether you want to support it forever.

The compatibility policy is at the top of [CHANGELOG.md](CHANGELOG.md). In short: nothing
is removed without a deprecation cycle, moved modules keep a shim for a minor release, and
breaking changes get a `### Breaking` heading with migration steps.

The package entry points (`main`, `module`, `types`, `exports`) are part of the contract.

### Touching the build or packaging

The tarball is verified in CI against the real artifact, not against `package.json`. If you
change `files`, the entry points, or the build, check what actually ships:

```bash
npm run build
npm pack --dry-run
```

Two specific traps this package has already hit once:

- Scoped packages need `publishConfig.access: "public"`, or `npm publish` is rejected.
- Build scripts must be cross-platform. Shell built-ins like `cp -r` break Windows
  contributors. Use a Node-based tool (`rimraf` is already a devDependency) or make the
  compiler emit to the right place directly.

### Types

This package targets browsers as well as Node. Do not reference the `NodeJS` namespace or
other ambient Node typings in `src/` - it forces every consumer to install `@types/node`.
Use portable equivalents such as `ReturnType<typeof setTimeout>`.

## Commit and pull request expectations

- One logical change per pull request.
- Imperative commit subjects: `fix sourcemaps by shipping src`.
- Explain _why_ in the body, not just what.
- CI must be green before review.

## Releasing

Maintainers only. Bump the version, tag it, and push:

```bash
npm version <patch|minor|major>
git push --follow-tags
```

The release workflow runs the full CI suite against the tag, refuses to proceed if the tag
does not match `package.json`, and creates the GitHub release. Publishing to npm is a
deliberate manual `npm publish`.

## License

10xGraph is [MIT licensed](LICENSE) and made by [10xScale](https://10xscale.ai). Contributions
are accepted under the same license.
