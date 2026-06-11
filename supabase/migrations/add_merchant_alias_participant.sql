ALTER TABLE merchant_aliases ADD COLUMN IF NOT EXISTS default_participant_id UUID REFERENCES participants(id);
