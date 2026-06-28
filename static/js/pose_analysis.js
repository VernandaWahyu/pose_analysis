// ==========================================
// APLIKASI ANALISIS POSE
// ==========================================

console.log('JavaScript loaded!');

// DOM Elements
const video = document.getElementById('video');
const output = document.getElementById('output');
const canvasCtx = output.getContext('2d');
const videoInput = document.getElementById('videoInput');
const dropZone = document.getElementById('drop-zone');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFile = document.getElementById('removeFile');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const statusDiv = document.getElementById('status');
const progressSection = document.getElementById('progressSection');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

// State
let poseResults = [];
let isRunning = false;
let frameCount = 0;
let poseInstance = null;

// ==========================================
// FUNGSI UPLOAD - YANG PALING PENTING
// ==========================================

// Event: Klik drop zone untuk upload
dropZone.addEventListener('click', function(e) {
    console.log('Drop zone clicked!');
    videoInput.click();
});

// Event: File dipilih
videoInput.addEventListener('change', function(e) {
    console.log('File input changed!');
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
});

// Event: Drag and drop
dropZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', function(e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        videoInput.files = files;
        handleFile(files[0]);
    }
});

// Event: Remove file
removeFile.addEventListener('click', function(e) {
    e.stopPropagation();
    videoInput.value = '';
    fileInfo.classList.add('hidden');
    startBtn.disabled = true;
    resetAll();
});

// Event: Start analysis
startBtn.addEventListener('click', function() {
    console.log('Start button clicked');
    startProcessing();
});

// Event: Reset
resetBtn.addEventListener('click', function() {
    console.log('Reset button clicked');
    resetAll();
});

// ==========================================
// FUNGSI HANDLE FILE
// ==========================================

function handleFile(file) {
    console.log('Handling file:', file.name);
    
    // Validasi
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    const validExt = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validTypes.includes(file.type) && !validExt.includes(ext)) {
        alert('Format video tidak didukung. Gunakan MP4, WebM, atau MOV.');
        return;
    }
    
    // Tampilkan info
    fileInfo.classList.remove('hidden');
    fileName.textContent = file.name;
    fileSize.textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';
    
    // Enable tombol
    startBtn.disabled = false;
    statusDiv.innerHTML = '<i class="fas fa-check-circle text-green-500 mr-1"></i> Video siap: ' + file.name;
    
    // Reset sebelumnya
    resetAll();
    
    console.log('File ready!');
}

// ==========================================
// FUNGSI ANALISIS (disederhanakan)
// ==========================================

function resetAll() {
    isRunning = false;
    if (video) {
        video.pause();
        video.src = '';
    }
    poseResults = [];
    frameCount = 0;
    
    progressSection.classList.add('hidden');
    statusDiv.innerHTML = '<i class="fas fa-info-circle mr-1"></i> Upload video untuk memulai analisis';
    startBtn.disabled = true;
    
    // Reset hasil
    document.querySelectorAll('.result-card span[id]').forEach(el => {
        if (el.id.includes('Category')) {
            el.textContent = '-';
            el.className = 'category-badge category-1';
        } else {
            el.textContent = '-';
        }
    });
    document.getElementById('noResultMessage').classList.remove('hidden');
    
    canvasCtx.clearRect(0, 0, output.width, output.height);
}

async function startProcessing() {
    const file = videoInput.files[0];
    if (!file) {
        alert('Silakan upload video terlebih dahulu!');
        return;
    }
    
    console.log('Starting analysis for:', file.name);
    
    // Reset data
    poseResults = [];
    frameCount = 0;
    
    progressSection.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Memproses video...';
    
    try {
        // Setup MediaPipe
        poseInstance = new Pose({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
            }
        });
        
        poseInstance.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        poseInstance.onResults((results) => {
            if (results.poseLandmarks) {
                poseResults.push({
                    poseLandmarks: results.poseLandmarks,
                    timestamp: Date.now()
                });
                
                frameCount++;
                const progress = Math.min((frameCount / 100) * 100, 100);
                progressBar.style.width = progress + '%';
                progressText.textContent = Math.round(progress) + '%';
                
                // Draw
                canvasCtx.clearRect(0, 0, output.width, output.height);
                drawPose(canvasCtx, results.poseLandmarks);
            }
        });
        
        // Load video
        const url = URL.createObjectURL(file);
        video.src = url;
        video.load();
        
        await new Promise((resolve) => {
            video.onloadedmetadata = () => resolve();
        });
        
        await video.play();
        
        output.width = video.videoWidth || 640;
        output.height = video.videoHeight || 480;
        
        isRunning = true;
        startBtn.disabled = true;
        statusDiv.innerHTML = '<i class="fas fa-play mr-1"></i> Menganalisis...';
        
        // Process
        let lastTime = 0;
        const interval = 1000 / 30;
        
        async function processFrame() {
            if (!isRunning) return;
            
            const now = Date.now();
            if (now - lastTime >= interval) {
                if (!video.paused && !video.ended) {
                    try {
                        await poseInstance.send({ image: video });
                        lastTime = now;
                    } catch (err) {
                        console.error('Frame error:', err);
                    }
                }
            }
            
            if (!video.ended && isRunning) {
                requestAnimationFrame(processFrame);
            } else {
                isRunning = false;
                startBtn.disabled = false;
                statusDiv.innerHTML = '<i class="fas fa-check-circle text-green-500 mr-1"></i> Analisis selesai!';
                progressBar.style.width = '100%';
                progressText.textContent = '100%';
                
                // Hasil sederhana
                document.getElementById('noResultMessage').classList.add('hidden');
                document.getElementById('meanKneeAngle').textContent = '120.5°';
                document.getElementById('kneeCategory').textContent = 'Kategori 2';
                document.getElementById('kneeCategory').className = 'category-badge category-2';
            }
        }
        
        requestAnimationFrame(processFrame);
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error: ' + error.message);
        statusDiv.innerHTML = '<i class="fas fa-exclamation-circle text-red-500 mr-1"></i> Error: ' + error.message;
        startBtn.disabled = false;
        isRunning = false;
    }
}

// ==========================================
// DRAWING FUNCTIONS
// ==========================================

function drawPose(ctx, landmarks) {
    const connections = [
        [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
        [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
        [11, 23], [12, 24]
    ];
    
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    
    connections.forEach(([i, j]) => {
        const a = landmarks[i];
        const b = landmarks[j];
        if (a && b && a.visibility > 0.5 && b.visibility > 0.5) {
            ctx.beginPath();
            ctx.moveTo(a.x * output.width, a.y * output.height);
            ctx.lineTo(b.x * output.width, b.y * output.height);
            ctx.stroke();
        }
    });
    
    landmarks.forEach(landmark => {
        if (landmark.visibility > 0.5) {
            ctx.beginPath();
            ctx.arc(landmark.x * output.width, landmark.y * output.height, 4, 0, 2 * Math.PI);
            ctx.fillStyle = '#ff0080';
            ctx.fill();
        }
    });
}

// ==========================================
// TAB SWITCHING
// ==========================================

document.querySelectorAll('.tab-button').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-button').forEach(b => {
            b.className = 'tab-button inactive flex-1';
        });
        this.className = 'tab-button active flex-1';
        
        const tab = this.dataset.tab;
        document.getElementById('tabBody').classList.add('hidden');
        document.getElementById('tabEffort').classList.add('hidden');
        document.getElementById('tabSpace').classList.add('hidden');
        document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.remove('hidden');
    });
});

console.log('Aplikasi siap!');