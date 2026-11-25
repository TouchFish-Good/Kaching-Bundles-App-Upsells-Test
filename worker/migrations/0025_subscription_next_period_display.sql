-- Purchase dates are display metadata; next_valid_* remains feature-verified access.
ALTER TABLE quantity_breaks_entitlements ADD COLUMN next_display_from INTEGER;
ALTER TABLE quantity_breaks_entitlements ADD COLUMN next_display_until INTEGER;
UPDATE quantity_breaks_entitlements
SET next_display_from = next_valid_from, next_display_until = next_valid_until;
