-- Keep operational collection refreshes separate from merchant campaign edits.
-- Historical sync times are unknown and must remain NULL until a successful run.
ALTER TABLE quantity_breaks_collection_conflicts ADD COLUMN synced_at TEXT;
