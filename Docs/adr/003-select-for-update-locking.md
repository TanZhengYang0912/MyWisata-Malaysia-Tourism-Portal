# ADR-003: SELECT FOR UPDATE pessimistic locking in debit_withdrawal

**Status:** Accepted

## Decision

`debit_withdrawal` (and all debit RPCs) open the wallet row with `SELECT ... FOR UPDATE` before reading the balance and writing the debit entry. The lock is held for the entire transaction.

## Rationale

Without row-level locking, two concurrent `debit_withdrawal` calls for the same user can both read the same `earnings_sen` value, both pass the balance check, and both insert debit entries — resulting in a double-spend. PostgreSQL's `FOR UPDATE` serializes concurrent RPCs on the same wallet row: the second caller blocks until the first commits, then re-reads the (now-reduced) balance and either succeeds or raises `insufficient_earnings`. Optimistic locking (compare-and-swap) was considered but rejected because it requires a retry loop on the client, which adds round-trips and complexity without improving throughput for the single-user case.
