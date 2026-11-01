-- D1 for the coach panel. Emails and Telegram ids live only here, never in the public repo.
CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, google_sub TEXT, coach_id TEXT, role TEXT NOT NULL CHECK (role IN ('coach','editor')), active INTEGER NOT NULL DEFAULT 1, added_by TEXT, added_at TEXT);
-- Owners come from OWNER_EMAILS, not users rows; this only pins their Google sub.
CREATE TABLE IF NOT EXISTS owners (email TEXT PRIMARY KEY, google_sub TEXT);
CREATE TABLE IF NOT EXISTS tg_links (telegram_id TEXT PRIMARY KEY, email TEXT NOT NULL, linked_at TEXT);
CREATE TABLE IF NOT EXISTS link_codes (code_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER);
CREATE TABLE IF NOT EXISTS edits (sha TEXT PRIMARY KEY, email TEXT, coach_id TEXT, op TEXT, created INTEGER, status TEXT, conclusion TEXT, notified INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS usage (email TEXT, day TEXT, kind TEXT, n INTEGER, PRIMARY KEY (email, day, kind));
