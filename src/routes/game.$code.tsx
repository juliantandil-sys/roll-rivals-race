import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { readToken, saveToken } from "@/lib/game-session";
import {
  COLUMNS,
  ROWS,
  chooseSide,
  getMyState,
  heartbeat,
  joinGame,
  moveBall,
  playAgain,
  submitAssignment,
  type PublicGame,
  type Side,
} from "@/lib/game.functions";

export const Route = createFileRoute("/game/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Partida ${params.code} — Dados & Bolas` },
      { name: "description", content: "Duelo de dados 1 vs 1 en tiempo real." },
      { property: "og:title", content: `Partida ${params.code} — Dados & Bolas` },
      { property: "og:description", content: "Duelo de dados 1 vs 1 en tiempo real." },
    ],
  }),
  component: GamePage,
});

const COLOR_CLASS = ["bg-col-green", "bg-col-red", "bg-col-blue", "bg-col-yellow"];
const TEXT_CLASS = ["text-col-green", "text-col-red", "text-col-blue", "text-col-yellow"];

type DieItem = { id: number; value: number };
type DragState =
  | { kind: "die"; id: number; value: number; x: number; y: number }
  | { kind: "ball"; column: number; x: number; y: number }
  | null;

function pips(value: number) {
  const map: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const on = new Set(map[value] ?? []);
  return (
    <span className="grid h-full w-full grid-cols-3 grid-rows-3 gap-[2px] p-[15%]">
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={`rounded-full ${on.has(i) ? "bg-foreground" : "bg-transparent"}`}
        />
      ))}
    </span>
  );
}

function Die({
  value,
  size = "md",
  className = "",
  hidden = false,
}: {
  value: number;
  size?: "sm" | "md";
  className?: string;
  hidden?: boolean;
}) {
  const dim = size === "sm" ? "h-9 w-9" : "h-12 w-12";
  return (
    <span
      className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-md select-none ${className}`}
    >
      {hidden ? <span className="text-lg font-bold text-muted-foreground">?</span> : pips(value)}
    </span>
  );
}

function GamePage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();

  const fetchState = useServerFn(getMyState);
  const doJoin = useServerFn(joinGame);
  const doChooseSide = useServerFn(chooseSide);
  const doSubmit = useServerFn(submitAssignment);
  const doMoveBall = useServerFn(moveBall);
  const doPlayAgain = useServerFn(playAgain);
  const doHeartbeat = useServerFn(heartbeat);

  const [token, setToken] = useState<string | null>(null);
  const [game, setGame] = useState<PublicGame | null>(null);
  const [side, setSide] = useState<Side | null>(null);
  const [dice, setDice] = useState<number[] | null>(null);
  const [serverAssignment, setServerAssignment] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<(number | null)[]>([null, null, null, null]);
  const [drag, setDrag] = useState<DragState>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const roundRef = useRef<number>(-1);

  const items: DieItem[] = useMemo(
    () => (dice ?? []).map((value, id) => ({ id, value })),
    [dice],
  );
  const trayItems = items.filter((it) => !slots.includes(it.id));

  const refresh = useCallback(
    async (t: string) => {
      try {
        const res = await fetchState({ data: { token: t } });
        setGame(res.game);
        setSide(res.side);
        setDice(res.dice);
        setServerAssignment(res.assignment);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error de conexión");
      }
    },
    [fetchState],
  );

  // Get or create a player token for this game code.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = readToken(code);
      if (existing) {
        if (!cancelled) setToken(existing);
        return;
      }
      try {
        const res = await doJoin({ data: { code } });
        saveToken(res.code, res.token);
        if (!cancelled) setToken(res.token);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo entrar");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, doJoin]);

  // Realtime + polling + heartbeat.
  useEffect(() => {
    if (!token) return;
    void refresh(token);
    const channel = supabase
      .channel(`game-${code}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `code=eq.${code}` },
        () => void refresh(token),
      )
      .subscribe();
    const poll = setInterval(() => void refresh(token), 2500);
    const beat = setInterval(() => void doHeartbeat({ data: { token } }), 5000);
    void doHeartbeat({ data: { token } });
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(beat);
    };
  }, [token, code, refresh, doHeartbeat]);

  // Reset local dice placement on a new round.
  useEffect(() => {
    if (!game) return;
    if (roundRef.current !== game.round_number) {
      roundRef.current = game.round_number;
      setSlots([null, null, null, null]);
      setSelected(null);
    }
  }, [game]);

  // Rehydrate the placement after reload when the round was already confirmed.
  useEffect(() => {
    if (!serverAssignment || !dice) return;
    const used: number[] = [];
    const next = serverAssignment.map((value) => {
      const idx = dice.findIndex((d, i) => d === value && !used.includes(i));
      used.push(idx);
      return idx;
    });
    setSlots(next);
  }, [serverAssignment, dice]);

  const myReady = game ? (side === "top" ? game.top_ready : game.bottom_ready) : false;
  const rivalReady = game ? (side === "top" ? game.bottom_ready : game.top_ready) : false;
  const rivalSeen = game ? (side === "top" ? game.bottom_seen : game.top_seen) : null;
  const rivalOnline = rivalSeen ? Date.now() - new Date(rivalSeen).getTime() < 15000 : false;
  const bothSides = !!game && game.top_taken && game.bottom_taken;
  const currentEntry = game ? game.reveal?.[String(game.current_column)] : undefined;
  const canMoveBall =
    !!game && game.phase === "MOVING_BALL" && !!currentEntry && currentEntry.winner === side;

  /* ------------------------- drag & drop ------------------------- */

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    };
    const onUp = (e: PointerEvent) => {
      const d = drag;
      setDrag(null);
      if (!d) return;
      if (d.kind === "die") {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const target = el?.closest("[data-slot-col]") as HTMLElement | null;
        if (target) placeDie(d.id, Number(target.dataset["slotCol"]));
        else removeDie(d.id);
      } else {
        dropBall(d.column, e.clientY);
      }
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  const placeDie = (id: number, col: number) => {
    if (myReady || !game || game.phase !== "PLACING_DICE") return;
    setSlots((prev) => {
      const next = prev.map((v) => (v === id ? null : v));
      const displaced = next[col];
      next[col] = id;
      if (displaced != null && prev.includes(id)) {
        const from = prev.indexOf(id);
        next[from] = displaced;
      }
      return next;
    });
    setSelected(null);
  };

  const removeDie = (id: number) => {
    if (myReady) return;
    setSlots((prev) => prev.map((v) => (v === id ? null : v)));
  };

  const dropBall = async (column: number, clientY: number) => {
    if (!canMoveBall || !token || !game) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const step = side === "top" ? 1 : -1;
    const target = game.balls[column]! + step;
    const cellH = rect.height / ROWS;
    const pointerRow = Math.floor((clientY - rect.top) / cellH);
    const reachedOut = side === "top" ? clientY > rect.bottom - cellH * 0.35 : clientY < rect.top + cellH * 0.35;
    const ok = target >= ROWS || target < 0 ? reachedOut : pointerRow === target || (side === "top" ? clientY > rect.top + target * cellH : clientY < rect.top + (target + 1) * cellH);
    if (!ok) return;
    try {
      await doMoveBall({ data: { token, column, targetRow: target } });
      await refresh(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Movimiento inválido");
    }
  };

  /* ------------------------- actions ------------------------- */

  const pickSide = async (s: Side) => {
    if (!token) return;
    try {
      await doChooseSide({ data: { token, side: s } });
      await refresh(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo elegir el lado");
    }
  };

  const confirmReady = async () => {
    if (!token || !dice) return;
    if (slots.some((s) => s == null)) return;
    const assignment = slots.map((id) => dice[id!]!);
    try {
      await doSubmit({ data: { token, assignment } });
      await refresh(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo confirmar");
    }
  };

  const rematch = async () => {
    if (!token) return;
    await doPlayAgain({ data: { token } });
    await refresh(token);
  };

  /* ------------------------- render ------------------------- */

  if (!game) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <div>
          <p className="text-muted-foreground">{error ?? "Cargando partida..."}</p>
          {error && (
            <Button className="mt-4" onClick={() => navigate({ to: "/" })}>
              Volver al inicio
            </Button>
          )}
        </div>
      </main>
    );
  }

  const phaseLabel: Record<string, string> = {
    WAITING_FOR_PLAYER: "Esperando al rival",
    SELECTING_SIDES: "Eligiendo lados",
    PLACING_DICE: "Colocá tus dados",
    REVEALING_COLUMN: `Revelando ${COLUMNS[game.current_column]}`,
    MOVING_BALL: `Moviendo la bola de ${COLUMNS[game.current_column]}`,
    GAME_OVER: "Partida terminada",
  };

  const renderSlotRow = (rowSide: Side) => {
    const mine = rowSide === side;
    return (
      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
        {COLUMNS.map((_, col) => {
          const entry = game.reveal?.[String(col)];
          const revealed = !!entry;
          const value = revealed
            ? rowSide === "top"
              ? entry.top
              : entry.bottom
            : mine && slots[col] != null && dice
              ? dice[slots[col]!]!
              : null;
          const isWinner = revealed && entry.winner === rowSide;
          const filled = mine
            ? slots[col] != null
            : rowSide === "top"
              ? game.top_ready
              : game.bottom_ready;
          return (
            <div
              key={col}
              {...(mine ? { "data-slot-col": col } : {})}
              onClick={() => {
                if (mine && selected != null) placeDie(selected, col);
              }}
              className={`flex h-14 items-center justify-center rounded-xl border-2 border-dashed transition-colors sm:h-16 ${
                isWinner
                  ? "border-foreground bg-accent"
                  : revealed
                    ? "border-border bg-muted/40"
                    : filled
                      ? "border-border bg-muted/30"
                      : "border-border/60"
              }`}
            >
              {value != null ? (
                <Die
                  value={value}
                  size="sm"
                  className={revealed ? "animate-pop-in" : ""}
                  {...(mine && !myReady && slots[col] != null
                    ? {
                        onPointerDown: undefined,
                      }
                    : {})}
                />
              ) : filled ? (
                <Die value={1} size="sm" hidden />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {mine ? "Soltá acá" : "—"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-background px-3 py-4 sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-2">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Salir
          </Link>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-lg font-bold tracking-widest"
          >
            {code} <span className="ml-1 text-xs font-normal text-muted-foreground">{copied ? "¡copiado!" : "copiar"}</span>
          </button>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            {rivalOnline ? "Rival conectado" : "Rival desconectado"}
          </span>
        </header>

        <div className="rounded-xl border border-border bg-card px-4 py-2 text-center text-sm font-semibold">
          {phaseLabel[game.phase]}
          {game.round_number > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Ronda {game.round_number}
            </span>
          )}
        </div>

        {/* Top player */}
        <div className="flex items-center justify-between text-xs font-semibold tracking-wide uppercase">
          <span>
            Jugador 1 — Superior{" "}
            {side === "top" && <span className="text-col-green">(vos)</span>}
          </span>
          <span className="text-muted-foreground">
            {game.top_ready ? "Listo ✓" : game.top_taken ? "Pensando..." : "Libre"}
          </span>
        </div>
        {renderSlotRow("top")}

        {/* Column headers */}
        <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
          {COLUMNS.map((name, i) => {
            const entry = game.reveal?.[String(i)];
            return (
              <div key={name} className="text-center">
                <div className={`h-2 rounded-full ${COLOR_CLASS[i]}`} />
                <div className={`mt-1 text-xs font-bold ${TEXT_CLASS[i]}`}>{name}</div>
                {entry && (
                  <div className="text-[10px] text-muted-foreground">
                    {entry.winner === "tie"
                      ? "Empate"
                      : entry.winner === "top"
                        ? "Gana Superior"
                        : "Gana Inferior"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Board */}
        <div
          ref={boardRef}
          className="grid touch-none grid-cols-4 overflow-hidden rounded-2xl border-2 border-board-line bg-board"
          style={{ gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`, aspectRatio: "4 / 7" }}
        >
          {Array.from({ length: ROWS }).map((_, row) =>
            COLUMNS.map((_, col) => {
              const hasBall = game.balls[col] === row;
              const draggable = hasBall && canMoveBall && col === game.current_column;
              return (
                <div
                  key={`${row}-${col}`}
                  className="relative flex items-center justify-center border border-board-line/60"
                  style={{ gridRow: row + 1, gridColumn: col + 1 }}
                >
                  <span
                    className={`pointer-events-none absolute inset-0 ${COLOR_CLASS[col]} opacity-[0.07]`}
                  />
                  {hasBall && (
                    <span
                      onPointerDown={(e) => {
                        if (!draggable) return;
                        e.preventDefault();
                        setDrag({ kind: "ball", column: col, x: e.clientX, y: e.clientY });
                      }}
                      className={`z-10 h-[72%] max-h-12 w-[72%] max-w-12 rounded-full bg-ball shadow-lg ring-2 transition-transform ${
                        draggable
                          ? "cursor-grab ring-foreground animate-pulse touch-none"
                          : "ring-board-line"
                      } ${drag?.kind === "ball" && drag.column === col ? "opacity-30" : ""}`}
                    />
                  )}
                </div>
              );
            }),
          )}
        </div>

        {/* Bottom player */}
        {renderSlotRow("bottom")}
        <div className="flex items-center justify-between text-xs font-semibold tracking-wide uppercase">
          <span>
            Jugador 2 — Inferior{" "}
            {side === "bottom" && <span className="text-col-green">(vos)</span>}
          </span>
          <span className="text-muted-foreground">
            {game.bottom_ready ? "Listo ✓" : game.bottom_taken ? "Pensando..." : "Libre"}
          </span>
        </div>

        {/* Tray */}
        {side && game.phase === "PLACING_DICE" && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="mb-3 text-xs text-muted-foreground">
              {myReady
                ? rivalReady
                  ? "Revelando..."
                  : "Esperando al rival..."
                : "Arrastrá (o tocá y luego elegí columna) para asignar un dado por columna."}
            </p>
            <div className="flex min-h-14 flex-wrap items-center gap-3">
              {trayItems.length === 0 && (
                <span className="text-sm text-muted-foreground">Todos los dados asignados</span>
              )}
              {trayItems.map((it) => (
                <span
                  key={it.id}
                  onPointerDown={(e) => {
                    if (myReady) return;
                    e.preventDefault();
                    setDrag({ kind: "die", id: it.id, value: it.value, x: e.clientX, y: e.clientY });
                  }}
                  onClick={() => !myReady && setSelected(it.id)}
                  className={`touch-none ${selected === it.id ? "ring-2 ring-foreground rounded-xl" : ""} ${
                    drag?.kind === "die" && drag.id === it.id ? "opacity-30" : ""
                  }`}
                >
                  <Die value={it.value} className="animate-die-roll cursor-grab" />
                </span>
              ))}
            </div>
            <Button
              className="mt-4 w-full"
              size="lg"
              disabled={myReady || slots.some((s) => s == null)}
              onClick={confirmReady}
            >
              {myReady ? "Esperando al rival..." : "Estoy listo"}
            </Button>
          </div>
        )}

        {canMoveBall && (
          <div className="rounded-2xl border border-border bg-accent p-4 text-center text-sm font-semibold">
            ¡Ganaste {COLUMNS[game.current_column]}! Arrastrá la bola hacia el lado rival.
          </div>
        )}

        {error && <p className="text-center text-sm text-destructive">{error}</p>}
      </div>

      {/* Side selection overlay */}
      {!side && game.phase !== "GAME_OVER" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/90 px-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
            <h2 className="text-xl font-bold">Elegí tu lado</h2>
            <p className="text-sm text-muted-foreground">
              Compartí este código con tu rival: <span className="font-mono font-bold">{code}</span>
            </p>
            <Button className="w-full" disabled={game.top_taken} onClick={() => pickSide("top")}>
              SUPERIOR {game.top_taken && "(ocupado)"}
            </Button>
            <Button
              className="w-full"
              variant="secondary"
              disabled={game.bottom_taken}
              onClick={() => pickSide("bottom")}
            >
              INFERIOR {game.bottom_taken && "(ocupado)"}
            </Button>
          </div>
        </div>
      )}

      {side && !bothSides && game.phase !== "GAME_OVER" && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div className="rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg">
            Esperando que el rival elija su lado — código{" "}
            <span className="font-mono font-bold">{code}</span>
          </div>
        </div>
      )}

      {/* Game over */}
      {game.phase === "GAME_OVER" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 px-4">
          <div className="animate-pop-in space-y-6 text-center">
            <h2 className="text-5xl font-black sm:text-7xl">
              {game.winner === side ? "🏆 ¡GANASTE!" : "😔 PERDISTE"}
            </h2>
            <Button size="lg" onClick={rematch}>
              Jugar otra vez
            </Button>
          </div>
        </div>
      )}

      {/* Drag ghost */}
      {drag && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: drag.x, top: drag.y, transform: "translate(-50%, -50%)" }}
        >
          {drag.kind === "die" ? (
            <Die value={drag.value} className="scale-110 shadow-2xl" />
          ) : (
            <span className="block h-12 w-12 rounded-full bg-ball shadow-2xl ring-2 ring-foreground" />
          )}
        </div>
      )}
    </main>
  );
}
