/* --- 基本伺服器設定 --------------------------------------------------- */
const http      = require("http");
const WebSocket = require("ws");
const express   = require("express");
const path      = require("path");

// Render / Heroku 會給 PORT；否則預設 8081
const PORT = process.env.PORT || 8081;
const app  = express();

/* 靜態檔案：WaterScapesWeb 資料夾 */
app.use(express.static(path.join(__dirname, "WaterScapesWeb")));
app.get("/*", (req, res) =>
  res.sendFile(path.join(__dirname, "WaterScapesWeb", "index.html"))
);

/* HTTP + WS 共用同一個 server */
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

/* --- 全域狀態 --------------------------------------------------------- */
let unitySocket = null;               // Unity 的連線
let unityStatus = "Disconnected";     // "Connected" / "Disconnected"
let queueCount  = 0;                  // 範例：圖片排隊計數

/* --- 工具函式 --------------------------------------------------------- */
function broadcast(msg) {
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

/* --- WebSocket 連線處理 ------------------------------------------------ */
wss.on("connection", ws => {
  console.log("👉 新客戶端已連接");
  ws.send(`UnityStatus:${unityStatus}`);   // 通知 Unity 目前狀態

  /* 心跳：每 5 分鐘 ping 一次，避免閒置斷線 */
  const hb = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, 5 * 60 * 1000);

  /* 1. 收到訊息 ------------------------------------------------------- */
  ws.on("message", (data, isBinary) => {
    /* ----- 1‑A Unity 認證 (文字) ------------------------------------ */
    if (!isBinary && data.toString() === "Unity") {
      unitySocket = ws;
      unityStatus = "Connected";
      broadcast("UnityStatus:Connected");
      console.log("✅ Unity 端已認證");
      return;
    }

    /* ----- 1‑B Binary：瀏覽器送來的 PNG ----------------------------- */
    if (isBinary) {
      if (unitySocket && unitySocket.readyState === WebSocket.OPEN) {
        unitySocket.send(data, { binary: true });
        console.log("📨 已轉送 Binary 給 Unity，大小:", data.length, "bytes");

        /* 回 ACK：簡單示範累加 queueCount */
        queueCount++;
        ws.send(`ImageQueue:${queueCount}`);
      } else {
        ws.send("Unity 未連接，無法傳送圖片");
      }
      return;
    }

    /* ----- 1‑C 其他文字 -------------------------------------------- */
    const txt = data.toString();
    console.log("📝 文字訊息:", txt);
    ws.send(`伺服器回應: ${txt}`);
  });

  /* 2. 關閉 ---------------------------------------------------------- */
  ws.on("close", () => {
    clearInterval(hb);

    // 若 Unity 端斷線
    if (ws === unitySocket) {
      unitySocket = null;
      unityStatus = "Disconnected";
      broadcast("UnityStatus:Disconnected");
      console.warn("❌ Unity 端斷線");
    } else {
      console.log("❌ 一般客戶端斷線");
    }
  });
});

/* --- 啟動 ------------------------------------------------------------- */
server.listen(PORT, () =>
  console.log(`🌐 伺服器已啟動：http://localhost:${PORT}`)
);
