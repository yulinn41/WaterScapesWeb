const http = require("http");
const WebSocket = require("ws");
const express = require("express");
const path = require("path");

// 使用 Render 或 Heroku 指定的 PORT 或預設為 8080
const PORT = process.env.PORT || 8081;

// 創建 Express 應用
const app = express();

// 提供靜態檔案 (將 public 資料夾設為根目錄)//改這個
app.use(express.static(path.join(__dirname, "WaterScapesWeb")));

// 創建 HTTP 伺服器，並將 Express 設置為 handler
const server = http.createServer(app);

// 在 HTTP 伺服器上創建 WebSocket 伺服器
const wss = new WebSocket.Server({ server });

// 全局狀態變數
let unityStatus = "Disconnected"; // Unity 的狀態：Connected 或 Disconnected
let unitySocket = null; // 儲存 Unity 客戶端的連接

// 處理 WebSocket 連接
wss.on("connection", (ws) => {
    console.log("新客戶端已連接");

    // 當新客戶端連接時，發送 Unity 的當前狀態
    ws.send(`UnityStatus:${unityStatus}`);
    console.log(`同步 Unity 狀態給新客戶端: ${unityStatus}`);

    // 心跳檢查機制
    const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping(); // 發送心跳信號
        }
    }, 300000); // 每 5分鐘發送一次心跳

    ws.on("message", (message) => {
        const msgString = message.toString();
        //console.log("收到消息:", msgString);

        // 處理 Unity 連接
        if (msgString === "Unity") {
            console.log("Unity 客戶端已認證");
            unityStatus = "Connected"; // 更新全局狀態
            unitySocket = ws; // 保存 Unity 連接
            broadcastToClients(`UnityStatus:${unityStatus}`); // 廣播 Unity 狀態
        }

        // 處理圖片數據
        else if (msgString.startsWith("data:image/png;base64,")) {
            console.log("收到圖片數據");

            if (unitySocket && unitySocket.readyState === WebSocket.OPEN) {
                unitySocket.send(msgString); // 將圖片數據發送到 Unity
                console.log("圖片數據已發送到 Unity");

                const timeout = setTimeout(() => {
                    console.error("互動端未回應，超時中止回呼");
                    ws.send("互動端未回應，請稍後重試");
                }, 1000); // 設置超時（例如 1 秒）

                unitySocket.once("message", (unityMessage) => {
                    clearTimeout(timeout); // 清除超時
                    if (unityMessage.toString().startsWith("ImageQueue:")) {
                        ws.send(unityMessage.toString()); // 回傳給當前客戶端
                        console.log("圖片排隊數量已回傳給客戶端:", unityMessage.toString());
                    }
                });
            } else {
                ws.send("無法轉發圖片數據，Unity 未連接");
                console.log("Unity 未連接，無法轉發圖片數據");
            }
        }

        // 處理其他消息
        else {
            ws.send(`伺服器回應: ${msgString}`);
            console.log("已回應消息: ", `伺服器回應: ${msgString}`);
        }
    });

    // 處理客戶端斷開連線

    ws.on("close", (code, reason) => {

        clearInterval(interval); // 清除心跳定時器
        if (code === 1006) {
            console.error("⚠️ 1006 Abnormal Closure - 可能是網路問題或伺服器異常導致的非正常關閉");
        }
        if (ws === unitySocket) {
            unitySocket = null;
            unityStatus = "Disconnected"; // 更新全局狀態
            broadcastToClients(`UnityStatus:${unityStatus}`); // 廣播 Unity 狀態
            console.log(`⚠️ Unity客戶端連線關閉 - 代碼: ${code}, 原因: ${reason}`);

        } else {
            console.log(`🔴 Web客戶端連線關閉 - 代碼: ${code}, 原因: ${reason}`);
        }
    });

    // 錯誤處理
    ws.on("error", (err) => {
        console.error("WebSocket 錯誤:", err);
    });

    ws.on("pong", () => {
        if (ws === unitySocket) {
            console.log("收到 Unity Pong");
        }
    });

});

// 廣播消息給所有客戶端
function broadcastToClients(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// 啟動伺服器
server.listen(PORT, () => {
    console.log(`伺服器正在執行，端口：${PORT}`);
    console.log(`靜態網頁可訪問：http://localhost:${PORT}`);
});
