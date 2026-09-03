ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS top_hand_roll int,
  ADD COLUMN IF NOT EXISTS bottom_hand_roll int,
  ADD COLUMN IF NOT EXISTS hand_side text,
  ADD COLUMN IF NOT EXISTS direction text,
  ADD COLUMN IF NOT EXISTS sequence_started boolean NOT NULL DEFAULT false;