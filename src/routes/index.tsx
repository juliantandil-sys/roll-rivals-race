import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { createGame, joinGame } from "@/lib/game.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveToken } from "@/lib/game-session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Front.ON — Duelo 1 vs 1 en tiempo real" },
      {
        name: "description",
        content:
          "Juego de dados multijugador 1 vs 1: tirá 4 dados, ganá columnas y empujá la bola fuera de la cancha rival.",
      },
      { property: "og:title", content: "Front.ON — Duelo 1 vs 1 en tiempo real" },
      {
        property: "og:description",
        content: "Creá una partida, compartí el código y jugá en tiempo real contra tu rival.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const create = useServerFn(createGame);
  const join = useServerFn(joinGame);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await create();
      saveToken(res.code, res.token);
      navigate({ to: "/game/$code", params: { code: res.code } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear la partida");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await join({ data: { code } });
      saveToken(res.code, res.token);
      navigate({ to: "/game/$code", params: { code: res.code } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo unir a la partida");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-background px-4 py-12">
      <div className="text-center">
        <div className="mb-4 flex justify-center gap-2">
          {["bg-col-green", "bg-col-red", "bg-col-blue", "bg-col-yellow"].map((c) => (
            <span key={c} className={`h-3 w-10 rounded-full ${c}`} />
          ))}
        </div>
        <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl">
          Front.ON
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">
          Duelo 1 vs 1 en tiempo real. Tirá tus 4 dados en secreto, ganá columnas y empujá una bola
          fuera de la cancha del rival.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-card p-6 shadow-lg">
        <Button className="w-full" size="lg" disabled={busy} onClick={handleCreate}>
          Crear nueva partida
        </Button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> o unite con un código{" "}
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD12"
            maxLength={6}
            className="text-center font-mono text-lg tracking-widest uppercase"
          />
          <Button variant="secondary" disabled={busy || code.length < 4} onClick={handleJoin}>
            Unirme
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </main>
  );
}
