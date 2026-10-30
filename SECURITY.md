# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| `1.0.x` | Yes       |
| `< 1.0` | No        |

`10xgraph-client` is at 1.0 (release candidate `1.0.0-rc.2`). Only the latest
minor release receives security fixes; there are no long-term support branches yet.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report privately through either channel:

1. **GitHub private vulnerability reporting** (preferred) - open a draft advisory at
   https://github.com/10xGraph/10xgraph-client/security/advisories/new.
2. **Email** - `contact@10xscale.ai`, with `SECURITY` in the subject line.

Please include:

- The affected version.
- A description of the issue and its impact.
- Reproduction steps or a proof of concept.
- Whether it affects browser usage, Node usage, or both.

## What to expect

| Stage                                      | Target          |
| ------------------------------------------ | --------------- |
| Acknowledgement of your report             | 3 business days |
| Initial assessment and severity            | 7 business days |
| Fix released, or a status update if longer | 30 days         |

We will credit you in the release notes unless you ask us not to. Please give us a
reasonable window to ship a fix before publishing details.

## Scope

In scope:

- Credential leakage - auth tokens appearing in URLs, logs, error messages, or thrown
  error objects. The WebSocket transport deliberately passes the bearer token via the
  `Sec-WebSocket-Protocol` subprotocol rather than the query string precisely to avoid
  this; a regression there is a real vulnerability.
- Client-side tool execution (`src/tools.ts`) being driven into running something the
  application did not register.
- Prototype pollution or unsafe deserialization when parsing server responses.
- SSRF-adjacent issues in URL construction (`buildWsUrl`, request path joining).
- Vulnerable transitive dependencies that reach shipped code.

Out of scope:

- Vulnerabilities in the API server. Report those against `10xgraph-api`.
- Issues that require the application to pass attacker-controlled configuration
  (`baseUrl`, `auth`, custom `webSocketImpl`) to the client.
- Anything in `examples/` or `react-example/`, which are illustrative and not published.
- Missing hardening when the consuming application disables TLS or targets `http://`.

## Notes for consumers

- Never embed a long-lived API token in a browser bundle. Issue short-lived,
  narrowly-scoped tokens from your own backend.
- `debug: true` logs request and response bodies to the console. Do not enable it in
  production, and do not ship a build with it hardcoded on.
- Client-side tools run with the privileges of the page or process. Only register handlers
  you would be comfortable letting the server invoke with arbitrary arguments, and validate
  arguments inside the handler.
