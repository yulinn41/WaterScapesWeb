/* --- 基本伺服器設定 --------------------------------------------------- */
const http      = require("http");
const WebSocket = require("ws");
const express   = require("express");
const path      = require("path");

const PORT = process.env.PORT || 8081;
const app  = express();

/* 靜態檔案目錄：WaterScapesWeb */
app.use(express.static(path.join(__dirname, "WaterScapesWeb")));
app.get("/*", (req, res) =>
  res.sendFile(path.join(__dirname, "WaterScapesWeb", "index.html"))
);

/* HTTP + WS 共用同一個 server */
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

/* --- 全域狀態 --------------------------------------------------------- */
let unitySocket = null;   // Unity 的 WebSocket
let unityStatus = "Disconnected";
let queueCount  = 0;

/* --- 工具函式 --------------------------------------------------------- */
const broadcast = msg => {
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
};

/* --- WebSocket 連線處理 ------------------------------------------------ */
wss.on("connection", ws => {
  console.log("👉 新客戶端已連接");
  ws.send(`UnityStatus:${unityStatus}`);

  /* 心跳：每 5 分鐘 ping */
  const hb = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, 5 * 60 * 1000);

  ws.on("message", (data, isBinary) => {
    /* A. Unity 認證 */
    if (!isBinary && data.toString() === "Unity") {
      unitySocket = ws;
      unityStatus = "Connected";
      broadcast("UnityStatus:Connected");
      console.log("✅ Unity 端已認證");
      return;
    }

    /* B. 瀏覽器傳來 Binary（PNG） */
    if (isBinary) {
      if (unitySocket && unitySocket.readyState === WebSocket.OPEN) {
        unitySocket.send(data, { binary: true });
        console.log("📨 轉送 Binary 給 Unity，大小:", data.length);

        queueCount++;
        ws.send(`ImageQueue:${queueCount}`);   // ACK
      } else {
        ws.send("Unity 未連接，無法傳送圖片");
      }
      return;
    }

    /* C. 其他文字 */
    const txt = data.toString();
    ws.send(`伺服器回應: ${txt}`);
  });

  ws.on("close", () => {
    clearInterval(hb);
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
  console.log(`🌐 Server ready → http://localhost:${PORT}`)
);
// 全域錯誤攔截
process.on("uncaughtException", err => {
  console.error("🛑 Uncaught Exception:", err);
});
process.on("unhandledRejection", err => {
  console.error("🛑 Unhandled Rejection:", err);
});
