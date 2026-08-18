-- Better Auth's core schema: accounts, sessions, OAuth links, verification,
-- and its rate-limit counters.
--
-- GENERATED, not hand-written:
--   npx @better-auth/cli generate --config src/auth.ts --output db/migrations/0003_auth.sql
--
-- Do not edit it to add a column. Change the config in src/auth.ts and
-- regenerate into a NEW migration file — the library and the table shape have
-- to agree exactly, and hand-editing is how they stop agreeing.
--
-- Regenerated against Postgres for the Neon migration. The types moved with
-- the database and the CLI, not by hand: `emailVerified` was an integer under
-- SQLite and is a real boolean here, and every date is timestamptz rather than
-- SQLite's `date` (which stored a string).
--
-- "role" is the one addition of ours, declared as an additionalField with
-- input:false so it cannot be set by anyone signing up. See src/auth.ts.
--
-- The rate-limit table is in the database rather than in memory on purpose:
-- Workers requests land on whichever isolate is free, so an in-memory counter
-- gives an attacker a fresh allowance on every request and the limit never
-- bites. Under D1 it needed its own migration; the CLI emits it here now.

create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null, "role" text);

create table "session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);

create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "rateLimit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);

create index "session_userId_idx" on "session" ("userId");

create index "account_userId_idx" on "account" ("userId");

create index "verification_identifier_idx" on "verification" ("identifier");