-- Add a nullable asset revision for optimistic MCP edits. Existing rows are
-- interpreted as revision zero until their next persisted update.
ALTER TABLE assets ADD COLUMN revision INTEGER;
