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

  // ==================== 修改開始 ====================

  // 為每個 WebSocket 連線添加一個 'isAlive' 屬性，用於心跳檢測
  ws.isAlive = true;

  // 當收到 Pong 消息時，將 isAlive 設為 true
  ws.on('pong', () => {
    ws.isAlive = true;
    // console.log("收到客戶端協議級 pong 回應"); // 可選：如果日誌太多可以註釋掉
  });

  // 定義心跳間隔，例如 30 秒，與 Unity 客戶端的心跳發送頻率匹配
  const HEARTBEAT_INTERVAL = 30 * 1000; // 30 秒

  /* 心跳：定期 ping 客戶端並檢查 isAlive 狀態 */
  const hb = setInterval(() => {
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        if (client.isAlive === false) { // 如果上次 ping 後客戶端沒有回應 pong
          console.warn("⚠️ WebSocket 連線因心跳超時關閉 (客戶端未回應 Pong)。");
          return client.terminate(); // 強制關閉連線
        }
        client.isAlive = false; // 設置為 false，等待下一次 pong
        client.ping(); // 發送協議級 ping
      }
    });
  }, HEARTBEAT_INTERVAL);

  // 為每個 WebSocket 連線添加錯誤處理
  ws.on("error", error => {
    console.error("❌ WebSocket 個別連線錯誤:", error);
  });

  // ==================== 修改結束 ====================

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
    // ==================== 修改開始 (處理 Unity 的文字 "ping") ====================
    if (txt === "ping") { // 這是 Unity 發送的文字心跳
        // 伺服器不需要特別回覆文字 "pong"，因為協議級的 ping/pong 已經在處理活性檢測
        // console.log("收到 Unity 的文字心跳: ping"); // 可選的日誌
    } else {
        ws.send(`伺服器回應: ${txt}`);
    }
    // ==================== 修改結束 ====================
  });

  ws.on("close", () => {
    // 當連線關閉時，清除該連線的心跳定時器 (如果每個客戶端都有自己的定時器)
    // 注意: 上面我把 hb 移到 wss.on("connection") 外部，變成管理所有客戶端
    // 如果您希望每個客戶端有獨立的 hb，則需要像舊代碼那樣定義 hb = setInterval(...)
    // 如果是所有客戶端共享一個心跳，這裡不需要 clearInterval(hb)
    // 但為了安全，保持清除，確保沒有懸掛的定時器
    clearInterval(hb); // 這個清除的是 wss.on("connection") 內部的單個定時器

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