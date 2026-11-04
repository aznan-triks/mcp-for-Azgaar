# Security policy

**Read [docs/SECURITY.md](docs/SECURITY.md) first** (en français : [docs/fr/SECURITY.md](docs/fr/SECURITY.md)): it says what runs where, what the AI may do, and how each scanner finding was fixed or documented.

## Supported versions

| Version | Status |
|---|---|
| the latest commit on the default branch | supported |
| anything older, including published releases that a newer one replaced | fixed only if the answer affects them |

Node 22.18+ is the supported runtime; the map page is the pinned Azgaar build named in `known-good.json`, and a security update to that engine is applied through `npm run update` (which tests the candidate end to end before it replaces the current one).

## Reporting

Open a **private** security advisory on the repository (Security → Report a vulnerability) instead of a public issue, so the map data of other users is not put on display while the problem is open. Expected first response within 5 working days; no fixed embargo, but a fix and a written description are published together once the version is tagged.

If the report is about the vendored generator itself (Azgaar's own code, not this bridge), it belongs upstream: https://github.com/Azgaar/Fantasy-Map-Generator — tell us too, so the pin can be moved deliberately rather than reactively.

## What is out of scope

Anything that needs you to expose the local server to a network (`server.host` is a debugging knob), to enable `map_eval` and then complain that it evaluates JavaScript, or to hand the map folder to another user of the machine. The server has one trust domain: the person sitting at that machine.
