import { WebSocketServer } from "ws";   // node >=18 支援 ES Module
// const { WebSocketServer } = require("ws"); // 若用 CommonJS

const wss = new WebSocketServer({ port: 8080 });

// 記錄哪一端是 Unity、哪一端是瀏覽器
let unitySocket  = null;
let webSockets   = new Set();

wss.on("connection", socket => {
  console.log("👉 新連線");

  // 先等第一則訊息來判斷身分
  socket.once("message", (data, isBinary) => {
    if (!isBinary && data.toString() === "ClientType:Unity") {
      unitySocket = socket;
      socket.send("UnityStatus:Connected");
      console.log("✅ Unity 端連上");
    } else {
      webSockets.add(socket);
      socket.send("UnityStatus:" + (unitySocket ? "Connected" : "Disconnected"));
      console.log("✅ Web 端連上");
      // 如果這是瀏覽器，要把收到的第一包資料也處理掉
      handleWebData(socket, data, isBinary);
    }

    // 後續所有訊息
    socket.on("message", (d, isB) => {
      if (socket === unitySocket) handleUnityData(socket, d, isB);
      else                        handleWebData (socket, d, isB);
    });
  });

  socket.on("close", () => {
    if (socket === unitySocket) {
      unitySocket = null;
      console.log("❌ Unity 端離線");
      // 通知所有瀏覽器
      webSockets.forEach(ws => ws.send("UnityStatus:Disconnected"));
    } else {
      webSockets.delete(socket);
      console.log("❌ Web 端離線");
    }
  });
});

// ---------- 處理函式 ----------
function handleWebData(ws, data, isBinary) {
  if (!unitySocket || unitySocket.readyState !== 1) {
    ws.send("UnityStatus:Disconnected");
    return;
  }

  if (isBinary) {
    // 這裡的 data 是 Buffer，直接轉送
    unitySocket.send(data, { binary: true });
    // （可選）回覆排隊數
    const queueCount = 1;   // 依你的邏輯增加
    ws.send("ImageQueue:" + queueCount);
  } else {
    // 文字訊息就照需求處理
    const msg = data.toString();
    console.log("🌐 Text from Web:", msg);
  }
}

function handleUnityData(ws, data, isBinary) {
  if (isBinary) {
    console.log("🎮 Unity 傳來", data.length, "bytes（二進位）");
    // 你可能不需要處理，或把結果回覆給瀏覽器
  } else {
    const msg = data.toString();
    console.log("🎮 Text from Unity:", msg);
    // broadcast 回所有瀏覽器
    webSockets.forEach(c => c.send(msg));
  }
}

console.log("🌐 WebSocket Server 啟動在 ws://localhost:8080");






// --- Canvas 繪製與工具列功能 ---
// --- Canvas 繪製與工具列功能 ---
const canvas       = document.getElementById("myCanvas");
const ctx          = canvas.getContext("2d");
const colorButtons = document.querySelectorAll(".color-button");
const brushOptions = document.querySelectorAll(".brush-option");
const currentCircle= document.getElementById("currentCircle");
const eraserBtn    = document.getElementById("eraserBtn");   // ← 新增：橡皮擦按鈕
let undoBtn        = document.getElementById("undoBtn");

let strokes       = [];
let currentStroke = [];
let drawing       = false;
let isEraser      = false;
let currentColor  = "#6b2f1c";

// 初始畫筆設定
ctx.lineCap     = "round";
ctx.lineJoin    = "round";
ctx.strokeStyle = currentColor;
ctx.lineWidth   = parseInt(brushOptions[0]?.getAttribute("data-size") || 20, 10);

// --- 顏色按鈕點擊：同時關閉橡皮擦 回復筆刷 ---
colorButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        // 如果之前是橡皮擦，先切回筆刷
        if (isEraser) {
            isEraser = false;
            eraserBtn.classList.remove("active");
        }

        // 更新按鈕樣式與畫筆顏色
        colorButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentColor = btn.getAttribute("data-color");
        ctx.strokeStyle = currentColor;
    });
});

// 筆刷大小選擇
brushOptions.forEach(opt => {
    opt.addEventListener("click", e => {
        e.preventDefault();
        const size = parseInt(opt.getAttribute("data-size"), 10);
        ctx.lineWidth = size;
        currentCircle.style.width  = `${size / 2}px`;
        currentCircle.style.height = `${size / 2}px`;
    });
});

// 取得 Canvas 坐標
function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX, clientY;
    if (e.touches && e.touches[0]) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top)  * scaleY
    };
}

// 繪製流程
canvas.addEventListener("mousedown", startDrawing);
canvas.addEventListener("touchstart", startDrawing, { passive: false });
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("touchmove", draw, { passive: false });
canvas.addEventListener("mouseup",   stopDrawing);
canvas.addEventListener("touchend",  stopDrawing);
canvas.addEventListener("mouseout",  stopDrawing);

function startDrawing(e) {
    drawing = true;
    currentStroke = [];
    ctx.beginPath();
    // 根據模式選顏色
    ctx.strokeStyle = isEraser ? "#ffffffff" : currentColor;
    const pos = getCanvasCoords(e);
    ctx.moveTo(pos.x, pos.y);
    currentStroke.push({
        x: pos.x, y: pos.y,
        color: ctx.strokeStyle,
        width: ctx.lineWidth
    });
}

function draw(e) {
    if (!drawing) return;
    e.preventDefault();
    const pos = getCanvasCoords(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    currentStroke.push({ x: pos.x, y: pos.y });
}

function stopDrawing() {
    if (!drawing) return;
    drawing = false;
    strokes.push(currentStroke);
}
// 重繪所有筆畫
function redrawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) {
        if (stroke.length === 0) continue;
        ctx.beginPath();
        ctx.strokeStyle = stroke[0].color;
        ctx.lineWidth   = stroke[0].width;
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
            ctx.lineTo(stroke[i].x, stroke[i].y);
        }
        ctx.stroke();
    }
}

// 撤回上一筆
document.getElementById("undoBtn").addEventListener("click", () => {
    strokes.pop();
    redrawAll();
});

// 切換橡皮擦
// --- 橡皮擦按鈕：切換模式 ---
// 切換橡皮擦按鈕：切換模式，同時取消所有顏色按鈕的 active
eraserBtn.addEventListener("click", () => {
  isEraser = !isEraser;
  eraserBtn.classList.toggle("active", isEraser);

  if (isEraser) {
    // 進入橡皮擦，就取消所有顏色按鈕的 active
    colorButtons.forEach(b => b.classList.remove("active"));
  } else {
    // 象徵「點回畫筆」，可以自動選第一支顏色（或維持目前的 currentColor）
    // 這邊示範選回第一支：
    colorButtons[0].classList.add("active");
    currentColor = colorButtons[0].getAttribute("data-color");
    ctx.strokeStyle = currentColor;
  }
});

// 清除畫布
document.getElementById("clear-canvas").addEventListener("click", () => {
    strokes = [];
    redrawAll();
});

// 檢查空畫布
function isCanvasBlank() {
    const blank = document.createElement("canvas");
    blank.width  = canvas.width;
    blank.height = canvas.height;
    return canvas.toDataURL() === blank.toDataURL();
}


// --- 多畫面及上傳流程 ---
const screens = {
    0: document.getElementById("screen0"),
    1: document.getElementById("screen1"),
    2: document.getElementById("screen2"),
    3: document.getElementById("screen3")
};
// 切畫面：改為加/移除「active」class
function setActiveScreen(n) {
  // 隱藏所有 screen
  Object.values(screens).forEach(s => {
    s.classList.remove("active");
  });
  // 顯示當前那個
  if (screens[n]) {
    screens[n].classList.add("active");
  }

  // timeline 顯示邏輯也改 class
  const timeline = document.getElementById("timeline");
  if ([1,2,3].includes(n)) {
    timeline.classList.add("active");
  } else {
    timeline.classList.remove("active");
  }

  // 更新小圓點（不變）
  const dots = document.querySelectorAll(".timeline .dot");
  dots.forEach(d => { 
    d.classList.remove("active");
    d.innerHTML = "";
  });
  if (dots[n-1]) {
    dots[n-1].classList.add("active");
    dots[n-1].innerHTML = "<div class='inner-dot'></div>";
  }
}


document.getElementById("go-to-screen2").addEventListener("click", () => setActiveScreen(2));

// 上傳 → 第三頁
document.getElementById("uploadBtn").addEventListener("click",  async ()  => {
    // (1) 空畫布檢查
    if (isCanvasBlank()) {
        return alert("你還沒有畫圖，請先畫圖再上傳！");
    }
    // (2) 連線檢查
    if (ws.readyState !== WebSocket.OPEN) {
        return alert("上傳失敗，請檢查伺服器連接！");
    }
    if (!unityConnected) {
        return alert("上傳失敗，遊戲尚未連接！");
    }

    // (3) 建立 128×256 的暫存 canvas
    const tmp = document.createElement("canvas");
    tmp.width  = 128;
    tmp.height = 256;
    const tctx = tmp.getContext("2d");
    tctx.fillStyle = "#FFEEDE";
    tctx.fillRect(0, 0, tmp.width, tmp.height);
    tctx.drawImage(canvas,
        0, 0, canvas.width, canvas.height,
        0, 0, tmp.width, tmp.height
    );

    // (4) 傳送圖片資料
    const imageData = tmp.toDataURL("image/png");
    
// 1. 把 dataURL 轉 Blob → ArrayBuffer
const blob        = await (await fetch(imageData)).blob();   // fetch 可把 base64 轉成 Blob
const arrayBuffer = await blob.arrayBuffer();

    ws.send(arrayBuffer);

    // (5) 清空畫布記錄
    strokes = [];
    redrawAll();

    // (6) 顯示結果與下載
    resultImg.src = canvas.toDataURL("image/png");
    saveBtn.href   = canvas.toDataURL("image/png");
    setActiveScreen(3);
});

// 再來一次 → 第二頁
document.getElementById("retryBtn").addEventListener("click", () => {
    strokes = [];
    redrawAll();
    setActiveScreen(2);
});

// 預設顯示第一頁
setActiveScreen(1);
