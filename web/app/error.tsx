'use client'; // Граница ошибок — клиентский компонент

import { useEffect } from "react";
import { reportError } from "@/lib/client/errors.ts";

// Если игра упала при отрисовке, игрок видит не белый экран, а просьбу продолжить:
// партия сохраняется каждый ход, поэтому после перезапуска её можно продолжить с того же места.
export default function GameError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => { reportError("render", error); }, [error]);
  return (
    <main style={{ minHeight: "100vh", background: "#2a2622", color: "#e8dfc8", display: "grid", placeItems: "center", padding: 16, fontFamily: "Georgia, serif" }}>
      <div style={{ maxWidth: 420, background: "#e8dfc8", color: "#2b2620", padding: "20px 22px", boxShadow: "4px 4px 0 #0006" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Связь с резиденцией прервалась</h2>
        <p style={{ margin: "0 0 16px", lineHeight: 1.45 }}>В игре случилась ошибка, мы её уже записали. Партия сохранена — продолжите с того же хода.</p>
        <button onClick={() => unstable_retry()} style={{ background: "#2b2620", color: "#e8dfc8", border: "none", padding: "10px 18px", fontSize: 15, cursor: "pointer" }}>Продолжить</button>
      </div>
    </main>
  );
}
