CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  phase text NOT NULL DEFAULT 'WAITING_FOR_PLAYER',
  round_number int NOT NULL DEFAULT 0,
  current_column int NOT NULL DEFAULT 0,
  balls int[] NOT NULL DEFAULT '{3,3,3,3}',
  reveal jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_taken boolean NOT NULL DEFAULT false,
  bottom_taken boolean NOT NULL DEFAULT false,
  top_ready boolean NOT NULL DEFAULT false,
  bottom_ready boolean NOT NULL DEFAULT false,
  top_seen timestamptz,
  bottom_seen timestamptz,
  winner text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.games TO anon, authenticated;
GRANT ALL ON public.games TO service_role;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public game state is readable" ON public.games FOR SELECT USING (true);

CREATE TABLE public.game_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  side text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.game_players TO service_role;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.game_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  round_number int NOT NULL,
  side text NOT NULL,
  dice int[] NOT NULL,
  assignment int[],
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, round_number, side)
);

GRANT ALL ON public.game_secrets TO service_role;
ALTER TABLE public.game_secrets ENABLE ROW LEVEL SECURITY;

ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER TABLE public.games REPLICA IDENTITY FULL;