// Function to set CSS variable --vh for responsive heights
function setVh() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
window.addEventListener('load', setVh);
window.addEventListener('resize', setVh);

/* --- WebSocket Connection Setup (at the beginning of the file) ------------------------------ */
let ws;
let unityConnected = false;

function connectWebSocket() {
  ws = new WebSocket("wss://creativeexpotaiwan-waterscapes.onrender.com");
  ws.binaryType = "arraybuffer"; // Ensure browser uses Binary

  ws.onopen = () => console.log("已連接伺服器");
  ws.onclose = () => { console.log("斷線，1 秒後重連"); setTimeout(connectWebSocket, 1000); };
  ws.onerror = err => console.error("WS 錯誤:", err);
  ws.onmessage = ev => {
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

/* --- Below retains your original Canvas / Upload program ------------------------------ */
// --- Canvas Drawing and Toolbar Functions ---
const canvas = document.getElementById("myCanvas");
const ctx = canvas.getContext("2d");
const colorButtons = document.querySelectorAll(".color-button");
const brushOptions = document.querySelectorAll(".brush-option");
const currentCircle = document.getElementById("currentCircle");
let undoBtn = document.getElementById("undoBtn");

let strokes = [];
let currentStroke = [];
let drawing = false;
let currentColor = "#a47864";

// Initial brush settings
ctx.lineCap = "round";
ctx.lineJoin = "round";
ctx.strokeStyle = currentColor;
ctx.lineWidth = parseInt(brushOptions[0]?.getAttribute("data-size") || 20, 10);

// --- Color button click: also close eraser, restore brush ---
colorButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    // Clear all active states first
    colorButtons.forEach(b => b.classList.remove("active"));
    // Then set itself to active
    btn.classList.add("active");
    currentColor = btn.dataset.color;
    ctx.strokeStyle = currentColor;
  });
});

// Brush size selection
brushOptions.forEach(opt => {
  opt.addEventListener("click", e => {
    e.preventDefault();
    const size = parseInt(opt.getAttribute("data-size"), 10);
    ctx.lineWidth = size;
    currentCircle.style.width = `${size / 2}px`;
    currentCircle.style.height = `${size / 2}px`;
  });
});

// Get Canvas coordinates
function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
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
    y: (clientY - rect.top) * scaleY
  };
}

// Drawing process
canvas.addEventListener("mousedown", startDrawing);
canvas.addEventListener("touchstart", startDrawing, { passive: false });
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("touchmove", draw, { passive: false });
canvas.addEventListener("mouseup", stopDrawing);
canvas.addEventListener("touchend", stopDrawing);
canvas.addEventListener("mouseout", stopDrawing);

function startDrawing(e) {
  drawing = true;
  currentStroke = [];
  ctx.beginPath();
  // Select color based on mode
  ctx.strokeStyle = currentColor;
  const pos = getCanvasCoords(e);
  ctx.moveTo(pos.x, pos.y);
  currentStroke.push({
    x: pos.x,
    y: pos.y,
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

// Redraw all strokes
function redrawAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    ctx.beginPath();
    ctx.strokeStyle = stroke[0].color;
    ctx.lineWidth = stroke[0].width;
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i].x, stroke[i].y);
    }
    ctx.stroke();
  }
}

// Undo last stroke
document.getElementById("undoBtn").addEventListener("click", () => {
  strokes.pop();
  redrawAll();
});

// Clear canvas
document.getElementById("clear-canvas").addEventListener("click", () => {
  strokes = [];
  redrawAll();
});

// Check if canvas is blank
function isCanvasBlank() {
  const blank = document.createElement("canvas");
  blank.width = canvas.width;
  blank.height = canvas.height;
  return canvas.toDataURL() === blank.toDataURL();
}

// --- Multi-screen and Upload Process ---
const screens = {
  0: document.getElementById("screen0"),
  1: document.getElementById("screen1"),
  2: document.getElementById("screen2"),
  3: document.getElementById("screen3")
};

// **NEW: Function to adjust Canvas size and redraw**
function refreshCanvasDisplay() {
    redrawAll();
}

// Switch screen: Add/remove "active" class
// ... (script.js 的其餘部分不變) ...

// **修正後的 setActiveScreen 函數**
function setActiveScreen(n) {
  // Hide all screens
  Object.values(screens).forEach(s => {
    s.classList.remove("active");
    s.style.display = 'none'; // 確保非活躍畫面被隱藏

    // 清除可能由 orientation change 設置的 inline style
    s.style.visibility = '';
    s.style.opacity = '';
    s.style.pointerEvents = '';
    s.style.height = '';
    s.style.overflow = '';
  });

  // Show the current one
  if (screens[n]) {
    screens[n].classList.add("active");
    screens[n].style.display = ''; // 清除 inline display，讓 CSS 規則生效

    // **新增：如果活躍畫面是 screen1，強制重啟 description 的動畫**
    if (n === 1) {
      const descriptionElement = screens[n].querySelector('.animated-description');
      if (descriptionElement) {
        // 移除動畫類別
        descriptionElement.classList.remove('animated-description');
        // 強制瀏覽器重排 (reflow) - 這是確保動畫重播的關鍵
        // 透過讀取元素的 offsetWidth 屬性來觸發重排
        void descriptionElement.offsetWidth; // 注意 `void` 操作符，它確保這行語句只執行副作用，不返回任何值
        // 重新添加動畫類別
        descriptionElement.classList.add('animated-description');
      }
    }
    
    // If it's screen2, trigger canvas adjustment and redraw
    if (n === 2) {
      refreshCanvasDisplay();
    }
  }

  // Timeline display logic also changes class
  const timeline = document.getElementById("timeline");
  if ([1, 2, 3].includes(n)) {
    timeline.classList.add("active");
  } else {
    timeline.classList.remove("active");
  }

  // Update dots (unchanged)
  const dots = document.querySelectorAll(".timeline .dot");
  dots.forEach(d => {
    d.classList.remove("active");
    d.innerHTML = "";
  });
  if (dots[n - 1]) {
    dots[n - 1].classList.add("active");
    dots[n - 1].innerHTML = "<div class='inner-dot'></div>";
  }
}


// **修正後的 handleOrientationChange 函數**
function handleOrientationChange() {
    const isLandscape = window.matchMedia("(orientation: landscape)").matches;
    const orientationMessage = document.getElementById('orientation-message');

    Object.values(screens).forEach(screenElement => {
        if (isLandscape) {
            screenElement.style.visibility = 'hidden';
            screenElement.style.opacity = '0';
            screenElement.style.pointerEvents = 'none';
            screenElement.style.height = '0';
            screenElement.style.overflow = 'hidden';
            screenElement.style.display = 'none'; // 新增：橫向時強制隱藏
        } else {
            screenElement.style.visibility = '';
            screenElement.style.opacity = '';
            screenElement.style.pointerEvents = '';
            screenElement.style.height = '';
            screenElement.style.overflow = '';
            // 這裡不直接設置 display = '' 或 flex/grid
            // 而是讓 setActiveScreen 或 CSS 的 .active 規則來控制顯示
        }
    });

    if (orientationMessage) {
        orientationMessage.style.display = isLandscape ? 'flex' : 'none';
    }

    // 如果當前活躍畫面是 screen2，並且切換回直向模式，重新繪製 canvas
    const activeScreen = document.querySelector('.screen.active');
    if (!isLandscape && activeScreen && activeScreen.id === 'screen2') {
        // 在這裡觸發重繪，確保畫布內容在顯示時可見
        refreshCanvasDisplay(); // 使用新的函數名稱
    }

    // **新增：在每次方向切換後，確保當前活躍畫面狀態正確**
    // 這一步可能需要一點點延遲，以確保瀏覽器完成佈局重繪
    const currentActiveScreenId = activeScreen ? activeScreen.id : null;
    const currentActiveScreenNumber = currentActiveScreenId ? parseInt(currentActiveScreenId.replace('screen', '')) : null;

    // 如果有活躍畫面，在方向改變後重新設置一次活躍畫面，強制佈局和顯示更新
    if (currentActiveScreenNumber !== null) {
        setTimeout(() => {
            setActiveScreen(currentActiveScreenNumber);
        }, 50); // 這裡給予一個小小的延遲，讓瀏覽器有時間完成佈局計算
    }
}

// Trigger orientation change handling on load and orientation/resize events
window.addEventListener('load', handleOrientationChange);
window.addEventListener('orientationchange', handleOrientationChange);
window.addEventListener('resize', handleOrientationChange); // Also listen to resize in case orientationchange doesn't fire

document.getElementById("go-to-screen2").addEventListener("click", () => setActiveScreen(2));

// Upload -> Third page
document.getElementById("uploadBtn").addEventListener("click", async () => {
  // (1) Check for blank canvas
  if (isCanvasBlank()) {
    return alert("你還沒有畫圖，請先畫圖再上傳！");
  }
  // (2) Check connection
  if (ws.readyState !== WebSocket.OPEN) {
    return alert("上傳失敗，請檢查伺服器連接！");
  }
  if (!unityConnected) {
    return alert("上傳失敗，遊戲尚未連接！");
  }

  // (3) Create a temporary 256x384 canvas
  const tmp = document.createElement("canvas");
  tmp.width = 256;
  tmp.height = 384;
  const tctx = tmp.getContext("2d");
  tctx.fillStyle = "#ffffffff";
  tctx.fillRect(0, 0, tmp.width, tmp.height);
  tctx.drawImage(canvas,
    0, 0, canvas.width, canvas.height,
    0, 0, tmp.width, tmp.height
  );

  // (4) Send image data
  const imageData = tmp.toDataURL("image/png");

  // 1. Convert dataURL to Blob -> ArrayBuffer
  const blob = await (await fetch(imageData)).blob(); // fetch can convert base64 to Blob
  const arrayBuffer = await blob.arrayBuffer();

  ws.send(arrayBuffer);

  // (6) Display result and download
  resultImg.src = canvas.toDataURL("image/png");
  saveBtn.href = canvas.toDataURL("image/png");
  setActiveScreen(3);
});

// Try again -> Second page
document.getElementById("retryBtn").addEventListener("click", () => {
  strokes = [];
  redrawAll();
  setActiveScreen(2);
});

// Default display first page
setActiveScreen(1);