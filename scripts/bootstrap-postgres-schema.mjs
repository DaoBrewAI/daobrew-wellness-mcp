#!/usr/bin/env node

console.error([
  "DaoBrew shared Postgres schema is Alembic-owned.",
  "Run `python -m alembic upgrade head` from the repository root with a safe DATABASE_URL.",
  "The MCP package no longer applies shared schema DDL at runtime or via this script.",
].join("\n"));
process.exit(1);
