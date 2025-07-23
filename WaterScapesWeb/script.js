
function setVh() {
  // 取得當前視窗高度，乘以 1% 存入 --vh
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
window.addEventListener('load',  setVh);
window.addEventListener('resize', setVh);



/* --- WebSocket 連線設定（放檔案最前面） ------------------------------ */
let ws;
let unityConnected = false;

function connectWebSocket() {
  ws = new WebSocket("wss://creativeexpotaiwan-waterscapes.onrender.com");
  ws.binaryType = "arraybuffer";     // ← 確保瀏覽器用 Binary

  ws.onopen    = () => console.log("已連接伺服器");
  ws.onclose   = () => { console.log("斷線，1 秒後重連"); setTimeout(connectWebSocket, 1000); };
  ws.onerror   = err => console.error("WS 錯誤:", err);
  ws.onmessage = ev  => {
    if (typeof ev.data === "string") {
      if (ev.data.startsWith("UnityStatus:")) {
        unityConnected = ev.data.endsWith("Connected");
        console.log("Unity 連線狀態:", unityConnected);
      } else if (ev.data.startsWith("ImageQueue:")) {
        const n = ev.data.split(":")[1];
        //alert(`圖片已排隊，當前數量：${n}`);
      }
    }
  };
}
connectWebSocket();

/* --- 以下保留你原本的 Canvas / 上傳程式 ------------------------------ */
/* ・・・中略・・・ */
/* 這裡的 (4) 傳送圖片資料流程是 OK 的：toDataURL → fetch → blob → arrayBuffer → ws.send(...) */

// --- Canvas 繪製與工具列功能 ---
const canvas       = document.getElementById("myCanvas");
const ctx          = canvas.getContext("2d");
const colorButtons = document.querySelectorAll(".color-button");
const brushOptions = document.querySelectorAll(".brush-option");
const currentCircle= document.getElementById("currentCircle");
let undoBtn        = document.getElementById("undoBtn");

let strokes       = [];
let currentStroke = [];
let drawing       = false;
let currentColor  = "#a47864";

// 初始畫筆設定
ctx.lineCap     = "round";
ctx.lineJoin    = "round";
ctx.strokeStyle = currentColor;
ctx.lineWidth   = parseInt(brushOptions[0]?.getAttribute("data-size") || 20, 10);

// --- 顏色按鈕點擊：同時關閉橡皮擦 回復筆刷 ---
colorButtons.forEach(btn => {
btn.addEventListener("click", () => {
    // 先清掉所有 active
    colorButtons.forEach(b => b.classList.remove("active"));
    // 再把自己設 active
    btn.classList.add("active");
    currentColor = btn.dataset.color;
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
    ctx.strokeStyle = currentColor;
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
    tmp.width  = 256;
    tmp.height = 384;
    const tctx = tmp.getContext("2d");
    tctx.fillStyle = "#ffffffff";
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
