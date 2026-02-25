-- Expand status to include granular pipeline stages
ALTER TABLE content DROP CONSTRAINT content_status_check;
ALTER TABLE content ADD CONSTRAINT content_status_check
  CHECK (status IN ('pending', 'extracting', 'classifying', 'completed', 'failed'));

-- Migrate any existing 'processing' records to 'extracting'
UPDATE content SET status = 'extracting' WHERE status = 'processing';

-- Add columns for manual review workflow
ALTER TABLE content ADD COLUMN review_status TEXT CHECK (review_status IN ('approved', 'rejected'));
ALTER TABLE content ADD COLUMN review_notes TEXT;
ALTER TABLE content ADD COLUMN reviewed_at TIMESTAMPTZ;

-- Index for finding unreviewed completed items efficiently
CREATE INDEX idx_content_unreviewed ON content (reviewed_at)
  WHERE reviewed_at IS NULL AND status = 'completed';
