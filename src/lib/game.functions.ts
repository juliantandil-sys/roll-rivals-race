import { createServerFn } from "@tanstack/react-start";

export type Side = "top" | "bottom";
export type Phase =
  | "WAITING_FOR_PLAYER"
  | "SELECTING_SIDES"
  | "PLACING_DICE"
  | "REVEALING_COLUMN"
  | "MOVING_BALL"
  | "GAME_OVER";

export const COLUMNS = ["Verde", "Rojo", "Azul", "Amarillo"] as const;
export const ROWS = 7;

export type RevealEntry = { top: number; bottom: number; winner: Side | "tie" };

export type PublicGame = {
  id: string;
  code: string;
  phase: Phase;
  round_number: number;
  current_column: number;
  balls: number[];
  reveal: Record<string, RevealEntry>;
  top_taken: boolean;
  bottom_taken: boolean;
  top_ready: boolean;
  bottom_ready: boolean;
  top_seen: string | null;
  bottom_seen: string | null;
  winner: Side | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function rollDice() {
  return Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6));
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function getPlayer(db: any, token: string) {
  const { data, error } = await db
    .from("game_players")
    .select("id, game_id, side, token")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Jugador no encontrado");
  return data;
}

async function getGame(db: any, gameId: string): Promise<PublicGame> {
  const { data, error } = await db.from("games").select("*").eq("id", gameId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Partida no encontrada");
  return data as PublicGame;
}

async function startRound(db: any, game: PublicGame) {
  const round = game.round_number + 1;
  await db.from("game_secrets").insert([
    { game_id: game.id, round_number: round, side: "top", dice: rollDice(), assignment: null },
    { game_id: game.id, round_number: round, side: "bottom", dice: rollDice(), assignment: null },
  ]);
  await db
    .from("games")
    .update({
      round_number: round,
      phase: "PLACING_DICE",
      current_column: 0,
      reveal: {},
      top_ready: false,
      bottom_ready: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", game.id);
}

/** Reveals `col` and either waits for the ball move or keeps advancing on ties. */
async function revealColumn(db: any, gameId: string, col: number) {
  let column = col;
  for (;;) {
    const game = await getGame(db, gameId);
    const { data: secrets } = await db
      .from("game_secrets")
      .select("side, assignment")
      .eq("game_id", gameId)
      .eq("round_number", game.round_number);
    const top = (secrets ?? []).find((s: any) => s.side === "top");
    const bottom = (secrets ?? []).find((s: any) => s.side === "bottom");
    const tv = top?.assignment?.[column] ?? 0;
    const bv = bottom?.assignment?.[column] ?? 0;
    const winner: Side | "tie" = tv > bv ? "top" : bv > tv ? "bottom" : "tie";
    const reveal = { ...(game.reveal ?? {}), [String(column)]: { top: tv, bottom: bv, winner } };

    await db
      .from("games")
      .update({
        reveal,
        current_column: column,
        phase: winner === "tie" ? "REVEALING_COLUMN" : "MOVING_BALL",
        updated_at: new Date().toISOString(),
      })
      .eq("id", gameId);

    if (winner !== "tie") return;
    if (column < 3) {
      column += 1;
      continue;
    }
    const fresh = await getGame(db, gameId);
    await startRound(db, fresh);
    return;
  }
}

async function advanceAfterMove(db: any, gameId: string) {
  const game = await getGame(db, gameId);
  if (game.current_column < 3) {
    await revealColumn(db, gameId, game.current_column + 1);
  } else {
    await startRound(db, game);
  }
}

export const createGame = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  let code = randomCode();
  for (let i = 0; i < 5; i++) {
    const { data } = await db.from("games").select("id").eq("code", code).maybeSingle();
    if (!data) break;
    code = randomCode();
  }
  const { data: game, error } = await db
    .from("games")
    .insert({ code, phase: "SELECTING_SIDES" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const { data: player, error: pErr } = await db
    .from("game_players")
    .insert({ game_id: game.id, side: null })
    .select("token")
    .single();
  if (pErr) throw new Error(pErr.message);
  return { code: game.code as string, gameId: game.id as string, token: player.token as string };
});

export const joinGame = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string }) => ({ code: String(d.code ?? "").trim().toUpperCase() }))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: game } = await db.from("games").select("*").eq("code", data.code).maybeSingle();
    if (!game) throw new Error("No existe una partida con ese código");
    const { count } = await db
      .from("game_players")
      .select("id", { count: "exact", head: true })
      .eq("game_id", game.id);
    if ((count ?? 0) >= 2) throw new Error("La partida ya tiene dos jugadores");
    const { data: player, error } = await db
      .from("game_players")
      .insert({ game_id: game.id, side: null })
      .select("token")
      .single();
    if (error) throw new Error(error.message);
    return { code: game.code as string, gameId: game.id as string, token: player.token as string };
  });

export const getMyState = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => ({ token: String(d.token) }))
  .handler(async ({ data }) => {
    const db = await admin();
    const player = await getPlayer(db, data.token);
    const game = await getGame(db, player.game_id);
    let dice: number[] | null = null;
    let assignment: number[] | null = null;
    if (player.side && game.round_number > 0) {
      const { data: secret } = await db
        .from("game_secrets")
        .select("dice, assignment")
        .eq("game_id", game.id)
        .eq("round_number", game.round_number)
        .eq("side", player.side)
        .maybeSingle();
      dice = secret?.dice ?? null;
      assignment = secret?.assignment ?? null;
    }
    return { side: player.side as Side | null, game, dice, assignment };
  });

export const chooseSide = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; side: Side }) => ({
    token: String(d.token),
    side: d.side === "top" ? ("top" as const) : ("bottom" as const),
  }))
  .handler(async ({ data }) => {
    const db = await admin();
    const player = await getPlayer(db, data.token);
    const game = await getGame(db, player.game_id);
    if (player.side) return { ok: true };
    if (game.phase !== "SELECTING_SIDES") throw new Error("La partida ya comenzó");
    const taken = data.side === "top" ? game.top_taken : game.bottom_taken;
    if (taken) throw new Error("Ese lado ya fue elegido");
    await db.from("game_players").update({ side: data.side }).eq("id", player.id);
    const patch: Record<string, unknown> =
      data.side === "top" ? { top_taken: true } : { bottom_taken: true };
    await db.from("games").update(patch).eq("id", game.id);
    const fresh = await getGame(db, game.id);
    if (fresh.top_taken && fresh.bottom_taken) await startRound(db, fresh);
    return { ok: true };
  });

export const submitAssignment = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; assignment: number[] }) => ({
    token: String(d.token),
    assignment: (d.assignment ?? []).map((n) => Number(n)),
  }))
  .handler(async ({ data }) => {
    const db = await admin();
    const player = await getPlayer(db, data.token);
    const game = await getGame(db, player.game_id);
    if (game.phase !== "PLACING_DICE") throw new Error("No es momento de colocar dados");
    const side = player.side as Side;
    if (!side) throw new Error("Elegí un lado primero");
    if (side === "top" ? game.top_ready : game.bottom_ready)
      throw new Error("Ya confirmaste tus dados");
    const { data: secret } = await db
      .from("game_secrets")
      .select("dice")
      .eq("game_id", game.id)
      .eq("round_number", game.round_number)
      .eq("side", side)
      .maybeSingle();
    if (!secret) throw new Error("No hay dados para esta ronda");
    const sortedA = [...data.assignment].sort().join(",");
    const sortedB = [...(secret.dice as number[])].sort().join(",");
    if (data.assignment.length !== 4 || sortedA !== sortedB)
      throw new Error("Asignación de dados inválida");

    await db
      .from("game_secrets")
      .update({ assignment: data.assignment })
      .eq("game_id", game.id)
      .eq("round_number", game.round_number)
      .eq("side", side);
    await db
      .from("games")
      .update({
        [side === "top" ? "top_ready" : "bottom_ready"]: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", game.id);

    const fresh = await getGame(db, game.id);
    if (fresh.top_ready && fresh.bottom_ready) {
      await db.from("games").update({ phase: "REVEALING_COLUMN" }).eq("id", game.id);
      await revealColumn(db, game.id, 0);
    }
    return { ok: true };
  });

export const moveBall = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; column: number; targetRow: number }) => ({
    token: String(d.token),
    column: Number(d.column),
    targetRow: Number(d.targetRow),
  }))
  .handler(async ({ data }) => {
    const db = await admin();
    const player = await getPlayer(db, data.token);
    const game = await getGame(db, player.game_id);
    const side = player.side as Side;
    if (game.phase !== "MOVING_BALL") throw new Error("No es momento de mover la bola");
    if (data.column !== game.current_column) throw new Error("Columna incorrecta");
    const entry = game.reveal?.[String(game.current_column)];
    if (!entry || entry.winner !== side) throw new Error("No ganaste esta columna");
    const current = game.balls[data.column]!;
    const step = side === "top" ? 1 : -1;
    if (data.targetRow !== current + step) throw new Error("Movimiento inválido");

    const out = data.targetRow >= ROWS || data.targetRow < 0;
    if (out) {
      await db
        .from("games")
        .update({ phase: "GAME_OVER", winner: side, updated_at: new Date().toISOString() })
        .eq("id", game.id);
      return { ok: true, win: true };
    }
    const balls = [...game.balls];
    balls[data.column] = data.targetRow;
    await db
      .from("games")
      .update({ balls, updated_at: new Date().toISOString() })
      .eq("id", game.id);
    await advanceAfterMove(db, game.id);
    return { ok: true, win: false };
  });

export const playAgain = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => ({ token: String(d.token) }))
  .handler(async ({ data }) => {
    const db = await admin();
    const player = await getPlayer(db, data.token);
    const game = await getGame(db, player.game_id);
    if (game.phase !== "GAME_OVER") return { ok: true };
    await db.from("game_secrets").delete().eq("game_id", game.id);
    await db
      .from("games")
      .update({
        phase: "PLACING_DICE",
        round_number: 0,
        current_column: 0,
        balls: [3, 3, 3, 3],
        reveal: {},
        top_ready: false,
        bottom_ready: false,
        winner: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", game.id);
    const fresh = await getGame(db, game.id);
    await startRound(db, fresh);
    return { ok: true };
  });

export const heartbeat = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => ({ token: String(d.token) }))
  .handler(async ({ data }) => {
    const db = await admin();
    const player = await getPlayer(db, data.token);
    if (!player.side) return { ok: true };
    await db
      .from("games")
      .update({ [player.side === "top" ? "top_seen" : "bottom_seen"]: new Date().toISOString() })
      .eq("id", player.game_id);
    return { ok: true };
  });
