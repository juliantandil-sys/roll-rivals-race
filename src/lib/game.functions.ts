import { createServerFn } from "@tanstack/react-start";

export type Side = "top" | "bottom";
export type Direction = "left-to-right" | "right-to-left";
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
  top_hand_roll: number | null;
  bottom_hand_roll: number | null;
  hand_side: Side | null;
  direction: Direction | null;
  osadia_started_at: string | null;
  ready_deadline: string | null;
  sequence_started: boolean;
  winner: Side | null;
};

type GameMeta = {
  top_hand_roll?: number;
  bottom_hand_roll?: number;
  hand_side?: Side;
  direction?: Direction;
  osadia_started_at?: string | null;
  ready_deadline?: string | null;
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

function rollHand() {
  return 1 + Math.floor(Math.random() * 6);
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
  const meta = (data.reveal?.__meta ?? {}) as GameMeta;
  return {
    ...data,
    top_hand_roll: meta.top_hand_roll ?? null,
    bottom_hand_roll: meta.bottom_hand_roll ?? null,
    hand_side: meta.hand_side ?? null,
    direction: meta.direction ?? null,
    osadia_started_at: meta.osadia_started_at ?? null,
    ready_deadline: meta.ready_deadline ?? null,
    sequence_started: data.sequence_started ?? false,
  } as PublicGame;
}

async function dealRound(db: any, game: PublicGame) {
  const round = game.round_number;
  const now = Date.now();
  const meta = (game.reveal?.["__meta"] ?? {}) as GameMeta;
  const reveal = {
    ...(game.reveal ?? {}),
    __meta: {
      ...meta,
      direction: meta.direction ?? "left-to-right",
      osadia_started_at: new Date(now + 15000).toISOString(),
      ready_deadline: new Date(now + 30000).toISOString(),
    },
  };
  await db.from("game_secrets").insert([
    { game_id: game.id, round_number: round, side: "top", dice: rollDice(), assignment: null },
    { game_id: game.id, round_number: round, side: "bottom", dice: rollDice(), assignment: null },
  ]);
    const { error } = await db.from("games").update({
      round_number: round,
      phase: "PLACING_DICE",
      current_column: 0,
      reveal,
      sequence_started: false,
      top_ready: false,
      bottom_ready: false,
      updated_at: new Date().toISOString(),
    }).eq("id", game.id);
    if (error) throw new Error(`No se pudo repartir la ronda: ${error.message}`);
}

async function autoCompleteExpiredRound(db: any, game: PublicGame) {
  const meta = (game.reveal?.__meta ?? {}) as GameMeta;
  if (!meta.ready_deadline || Date.now() < new Date(meta.ready_deadline).getTime()) return game;
  const missingSides = [
    ...(game.top_ready ? [] : ["top" as const]),
    ...(game.bottom_ready ? [] : ["bottom" as const]),
  ];
  for (const missingSide of missingSides) {
    const { data: secret } = await db.from("game_secrets")
      .select("dice").eq("game_id", game.id).eq("round_number", game.round_number).eq("side", missingSide).maybeSingle();
    if (!secret) continue;
    const { error } = await db.from("game_secrets")
      .update({ assignment: secret.dice }).eq("game_id", game.id).eq("round_number", game.round_number)
      .eq("side", missingSide).is("assignment", null);
    if (error) throw new Error(`No se pudieron acomodar los dados: ${error.message}`);
  }
  const nextReveal = { ...(game.reveal ?? {}), __meta: { ...meta, ready_deadline: null, osadia_started_at: null } };
  const { error: gameError } = await db.from("games").update({
    top_ready: true,
    bottom_ready: true,
    reveal: nextReveal,
    updated_at: new Date().toISOString(),
  }).eq("id", game.id).eq("phase", "PLACING_DICE");
  if (gameError) throw new Error(`No se pudo confirmar el tiempo: ${gameError.message}`);
  await startRoundSequence(db, game.id);
  return getGame(db, game.id);
}

async function getHistoricalTotals(db: any, gameId: string) {
  const { data, error } = await db.from("game_secrets").select("side, dice").eq("game_id", gameId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((totals: { top: number; bottom: number }, secret: any) => {
    const sum = (secret.dice as number[]).reduce((total, value) => total + value, 0);
    totals[secret.side as Side] += sum;
    return totals;
  }, { top: 0, bottom: 0 });
}

async function resolveHand(db: any, game: PublicGame) {
  let topRoll = rollHand();
  let bottomRoll = rollHand();
  while (topRoll === bottomRoll) {
    topRoll = rollHand();
    bottomRoll = rollHand();
  }
  const metaReveal = { __meta: { top_hand_roll: topRoll, bottom_hand_roll: bottomRoll, hand_side: topRoll > bottomRoll ? "top" : "bottom" } };
  const { data: claimed, error } = await db.from("games").update({
    round_number: 1,
    reveal: metaReveal,
    phase: "PLACING_DICE",
    updated_at: new Date().toISOString(),
  }).eq("id", game.id).eq("phase", "SELECTING_SIDES").select("id").maybeSingle();
  if (error) throw new Error(`No se pudo definir la mano: ${error.message}`);
  if (claimed) await dealRound(db, { ...game, round_number: 1, reveal: metaReveal, phase: "PLACING_DICE" });
  return !!claimed;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function prepareNextRound(db: any, game: PublicGame) {
  const nextRound = game.round_number + 1;
  const reveal = { __meta: { hand_side: game.hand_side === "top" ? "bottom" : "top" } };
  const { error } = await db.from("games").update({
    round_number: nextRound,
    phase: "PLACING_DICE",
    current_column: 0,
    reveal,
    top_ready: false,
    bottom_ready: false,
    sequence_started: false,
    updated_at: new Date().toISOString(),
  }).eq("id", game.id);
  if (error) throw new Error(`No se pudo preparar la siguiente ronda: ${error.message}`);
  await dealRound(db, { ...game, round_number: nextRound, phase: "PLACING_DICE", reveal });
}

async function startRoundSequence(db: any, gameId: string) {
  const { data: claimed, error } = await db.from("games").update({
    phase: "REVEALING_COLUMN",
    sequence_started: true,
  }).eq("id", gameId).eq("phase", "PLACING_DICE")
    .eq("top_ready", true).eq("bottom_ready", true).eq("sequence_started", false)
    .select("id").maybeSingle();
  if (error) throw new Error(`No se pudo iniciar la secuencia: ${error.message}`);
  if (claimed) await runRoundSequence(db, gameId);
}

async function runRoundSequence(db: any, gameId: string) {
  const initial = await getGame(db, gameId);
  const { data: secrets } = await db.from("game_secrets")
    .select("side, assignment").eq("game_id", gameId).eq("round_number", initial.round_number);
  const top = (secrets ?? []).find((s: any) => s.side === "top");
  const bottom = (secrets ?? []).find((s: any) => s.side === "bottom");
  const assignments = { top: top?.assignment as number[], bottom: bottom?.assignment as number[] };
  const columns = initial.direction === "right-to-left" ? [3, 2, 1, 0] : [0, 1, 2, 3];

  for (const column of columns) {
    const game = await getGame(db, gameId);
    const tv = assignments.top?.[column] ?? 0;
    const bv = assignments.bottom?.[column] ?? 0;
    const winner: Side | "tie" = tv > bv ? "top" : bv > tv ? "bottom" : "tie";
    const reveal = { ...(game.reveal ?? {}), [String(column)]: { top: tv, bottom: bv, winner } };
    await db.from("games").update({ reveal, current_column: column, phase: "REVEALING_COLUMN", updated_at: new Date().toISOString() }).eq("id", gameId);
    await wait(2000);

    const fresh = await getGame(db, gameId);
    const balls = [...fresh.balls];
    if (winner === "tie") {
      balls[column] = 3;
    } else {
      const step = winner === "top" ? 1 : -1;
      const margin = Math.abs(tv - bv);
      let distance = margin >= 4 ? 2 : 1;
      const target = balls[column]! + step * distance;
      if (target >= ROWS || target < 0) distance = 1;
      const finalTarget = balls[column]! + step * distance;
      if (finalTarget >= ROWS || finalTarget < 0) {
        await db.from("games").update({ phase: "GAME_OVER", winner, updated_at: new Date().toISOString() }).eq("id", gameId);
        return;
      }
      balls[column] = finalTarget;
    }
    await db.from("games").update({ balls, phase: "MOVING_BALL", updated_at: new Date().toISOString() }).eq("id", gameId);
    await wait(2000);
  }
  await prepareNextRound(db, await getGame(db, gameId));
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
    let game = await getGame(db, player.game_id);
    if (game.phase === "SELECTING_SIDES" && game.top_taken && game.bottom_taken && !game.hand_side) {
      await resolveHand(db, game);
      game = await getGame(db, player.game_id);
    }
    game = await autoCompleteExpiredRound(db, game);
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
    const totals = await getHistoricalTotals(db, game.id);
    const historicalTotals = game.phase === "GAME_OVER"
      ? totals
      : {
          top: player.side === "top" ? totals.top : null,
          bottom: player.side === "bottom" ? totals.bottom : null,
        };
    return { side: player.side as Side | null, game, dice, assignment, historicalTotals };
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
    const { error: playerError } = await db
      .from("game_players")
      .update({ side: data.side })
      .eq("id", player.id);
    if (playerError) throw new Error(playerError.message);
    const patch: Record<string, unknown> =
      data.side === "top" ? { top_taken: true } : { bottom_taken: true };
    const { error: gameError } = await db.from("games").update(patch).eq("id", game.id);
    if (gameError) throw new Error(gameError.message);
    const fresh = await getGame(db, game.id);
    if (fresh.top_taken && fresh.bottom_taken) await resolveHand(db, fresh);
    return { ok: true };
  });

export const submitAssignment = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; assignment: number[]; direction: Direction }) => ({
    token: String(d.token),
    assignment: (d.assignment ?? []).map((n) => Number(n)),
    direction: d.direction === "right-to-left" ? ("right-to-left" as const) : ("left-to-right" as const),
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
        reveal: {
          ...(game.reveal ?? {}),
          __meta: {
            ...(game.reveal?.__meta as GameMeta ?? {}),
            direction: data.direction,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", game.id);

    const fresh = await getGame(db, game.id);
    if (fresh.top_ready && fresh.bottom_ready) await startRoundSequence(db, game.id);
    return { ok: true };
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
        phase: "SELECTING_SIDES",
        round_number: 0,
        current_column: 0,
        balls: [3, 3, 3, 3],
        reveal: {},
        top_ready: false,
        bottom_ready: false,
        top_taken: false,
        bottom_taken: false,
        winner: null,
        sequence_started: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", game.id);
    await db.from("game_players").update({ side: null }).eq("game_id", game.id);
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
