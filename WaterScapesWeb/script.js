let ws;

// 記錄 Unity 是否已連接
let unityConnected = false;

// WebSocket 連接
function connectWebSocket() {
    ws = new WebSocket("wss://nantoulightfestival.onrender.com");

    ws.onopen = () => {
        console.log("已連接到伺服器");
    };

    ws.onclose = () => {
        console.log("伺服器連接已斷開");
        setTimeout(connectWebSocket, 1000); // 5 秒後嘗試重連
    };

    ws.onerror = (error) => {
        console.error("WebSocket 錯誤: ", error);
    };

    // 接收 WebSocket 回傳的消息
    ws.onmessage = (event) => {
        // 檢查是否是 Unity 狀態消息
        if (event.data.startsWith("UnityStatus:")) {
            const status = event.data.split(":")[1]; // 提取狀態值
            if (status === "Connected") {
                unityConnected = true;
                console.log("互動軟體已連接");
            } else if (status === "Disconnected") {
                unityConnected = false;
                console.log("互動軟體已斷開");
            }

        }
        else if (event.data.startsWith("ImageQueue:")) {
            const queueCount = event.data.split(":")[1];
            console.log("圖片排隊數量:", queueCount);

            // 更新 HTML 顯示圖片排隊數量
            document.getElementById("queue-status").innerText = `排隊圖片數量：${queueCount}`;
            // 顯示排隊數量的 alert
            alert(`圖片已上傳！當前排隊數量：${queueCount}`);
        } 
        else {
            console.log("其他消息:", event.data);
        }
    };

}

connectWebSocket();

//畫圖
        
        
        const canvas = document.getElementById("myCanvas");
        const ctx = canvas.getContext("2d");
        const buttons = document.querySelectorAll(".color-button");
        let currentColor = "#6b2f1c";
        let isDrawing = false;
        let lastX = 0, lastY = 0;

        ctx.lineWidth = 20;

        buttons.forEach(button => {
            button.addEventListener("click", () => {
                buttons.forEach(btn => btn.classList.remove("active"));
                button.classList.add("active");
                currentColor = button.getAttribute("data-color");
            });
        });

        function getCoordinates(event) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            let x, y;
            if (event.touches) {
                x = (event.touches[0].clientX - rect.left) * scaleX;
                y = (event.touches[0].clientY - rect.top) * scaleY;
            } else {
                x = (event.clientX - rect.left) * scaleX;
                y = (event.clientY - rect.top) * scaleY;
            }
            return { x, y };
        }

        function startDrawing(event) {
            isDrawing = true;
            const { x, y } = getCoordinates(event);
            lastX = x;
            lastY = y;
        }

        function draw(event) {
            if (!isDrawing) return;
            event.preventDefault();
            const { x, y } = getCoordinates(event);

            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(x, y);
            ctx.strokeStyle = currentColor;
            ctx.lineCap = "round";
            ctx.stroke();

            lastX = x;
            lastY = y;
        }

        function stopDrawing() {
            isDrawing = false;
        }

        canvas.addEventListener("mousedown", startDrawing);
        canvas.addEventListener("mousemove", draw);
        canvas.addEventListener("mouseup", stopDrawing);
        canvas.addEventListener("mouseout", stopDrawing);
        canvas.addEventListener("touchstart", startDrawing, { passive: false });
        canvas.addEventListener("touchmove", draw, { passive: false });
        canvas.addEventListener("touchend", stopDrawing);

        document.getElementById("clear-canvas").addEventListener("click", () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });

        const currentCircle = document.getElementById("currentCircle");
        document.querySelectorAll(".brush-option").forEach(option => {
            option.addEventListener("click", (e) => {
                e.preventDefault();
                const size = parseInt(option.getAttribute("data-size"));
                ctx.lineWidth = size;
                currentCircle.style.width = `${size / 2}px`;
                currentCircle.style.height = `${size / 2}px`;
            });
        });


        const screens = {
            1: document.getElementById("screen1"),
            2: document.getElementById("screen2"),
            3: document.getElementById("screen3")

        };
        screens[0] = document.getElementById("screen0");

        const resultImg = document.getElementById("resultImg");
        const saveBtn = document.getElementById("saveBtn");

        // ✅ 控制畫面切換 & dot 狀態的主函式
        function setActiveScreen(screenNumber) {
            Object.values(screens).forEach(screen => screen.style.display = "none");

            const current = screens[screenNumber];
            if (current) current.style.display = "block";

            // ✅ 控制 timeline 顯示：只在 1, 2, 3 頁出現
            const timeline = document.getElementById('timeline');
            if ([1, 2, 3].includes(screenNumber)) {
                timeline.style.display = 'flex';
            } else {
                timeline.style.display = 'none';
            }

            // ✅ 更新 dot 狀態
            const dots = document.querySelectorAll('.timeline .dot');
            dots.forEach(dot => {
                dot.classList.remove('active');
                dot.innerHTML = '';
            });
            if (dots[screenNumber - 1]) {
                dots[screenNumber - 1].classList.add('active');
                dots[screenNumber - 1].innerHTML = '<div class="inner-dot"></div>';
            }
        }

        // ➤ 第一頁 ➔ 第二頁
        document.getElementById('go-to-screen2').addEventListener('click', () => {
            setActiveScreen(2);
        });

        // ➤ 畫完 ➔ 第三頁
// ➤ 畫完 ➔ 第三頁
document.getElementById("uploadBtn").addEventListener("click", () => {
    const canvas = document.getElementById("myCanvas");
    // （1）先做空畫布檢查
    if (isCanvasBlank(canvas)) {
        alert("你還沒有畫圖，請先畫圖再上傳！");
        return;
    }
    // （2）再檢查 WebSocket、Unity 連線狀態
    if (ws.readyState !== WebSocket.OPEN) {
        alert("上傳失敗，請檢查伺服器連接！");
        return;
    }
    if (!unityConnected) {
        alert("上傳失敗，遊戲尚未連接！");
        return;
    }

    // （3）標準化 canvas → 256×256，背景色 FFEEDE
    const targetSize = 256;
    const resizedCanvas = document.createElement("canvas");
    resizedCanvas.width = targetSize;
    resizedCanvas.height = targetSize;
    const resizedCtx = resizedCanvas.getContext("2d");
    resizedCtx.fillStyle = "#FFEEDE";
    resizedCtx.fillRect(0, 0, targetSize, targetSize);
    resizedCtx.drawImage(canvas, 0, 0, targetSize, targetSize);

    // （4）送到後端
    const imageData = resizedCanvas.toDataURL("image/png");
    ws.send(imageData);
    console.log("標準化圖片數據已發送:", imageData.substring(0, 20));

    // （5）清空畫布（包括 offscreen）
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

    // （6）接著原本的第三頁顯示流程
    const dataUrl = canvas.toDataURL("image/png");
    resultImg.src = dataUrl;
    saveBtn.href = dataUrl;
    setActiveScreen(3);
});


        // ➤ 再來一次 ➔ 第二頁
        document.getElementById("retryBtn").addEventListener("click", () => {
            const canvas = document.getElementById("myCanvas");
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setActiveScreen(2);
        });

        // 預設顯示第一頁
        setActiveScreen(1);
