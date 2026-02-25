-- Content ingestion table
CREATE TABLE content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Source data
  url TEXT NOT NULL UNIQUE,

  -- Extracted content
  title TEXT,
  body_text TEXT,
  author TEXT,
  publish_date TIMESTAMPTZ,

  -- AI-generated metadata
  categories TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT,
  confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  needs_review BOOLEAN DEFAULT false,

  -- Pipeline metadata
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  llm_model TEXT,
  processing_time_ms INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for GET endpoint filtering
CREATE INDEX idx_content_categories ON content USING GIN (categories);
CREATE INDEX idx_content_status ON content (status);
CREATE INDEX idx_content_needs_review ON content (needs_review) WHERE needs_review = true;
CREATE INDEX idx_content_created_at ON content (created_at DESC);

-- Enable Row Level Security
ALTER TABLE content ENABLE ROW LEVEL SECURITY;

-- Public policies (demo scope)
CREATE POLICY "Allow public read" ON content FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON content FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON content FOR UPDATE USING (true);
