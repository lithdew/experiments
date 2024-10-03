# experiments

My repository of experiments with architectures, algorithms, data structures and stuff.

A (non-exhaustive) list of stuff that has been played with so far in this repository:
- Bun
- PostgreSQL
- Kysely
- PGlite

## [pg-rbac](./pg-rbac/)

Hierarchical role-based access control implemented using a closure table. Uses pglite and Bun.

## [kysely-codec](./kysely-codec/)

An example demonstrating:
1. how to serialize SQL expressions built using Kysely into AST nodes, and
2. how to deserialize Kysely AST Nodes back into SQL expressions that may be built on top of using Kysely.

This is particularly useful for persisting fragments of built SQL for the purposes of i.e. serializing
WHERE clauses representative of validation/permission checks for an access control system. 