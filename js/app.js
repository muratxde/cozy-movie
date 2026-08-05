document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const loginScreen = document.getElementById('loginScreen');
    const usernameInput = document.getElementById('usernameInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    const appHeader = document.getElementById('appHeader');
    const connectionStatus = document.getElementById('connectionStatus');
    const mediaSelector = document.getElementById('mediaSelector');
    const guestWaiting = document.getElementById('guestWaiting');
    const playerContainer = document.getElementById('playerContainer');
    const urlInput = document.getElementById('urlInput');
    const loadUrlBtn = document.getElementById('loadUrlBtn');
    const fileInput = document.getElementById('fileInput');
    const ambientLight = document.getElementById('ambientLight');
    const statusText = document.getElementById('statusText');
    const guestMessage = document.getElementById('guestMessage');
    const mainPlayerEl = document.getElementById('mainPlayer');
    const nativePlayerEl = document.getElementById('nativePlayer');
    const fileTransferContainer = document.getElementById('fileTransferContainer');
    const transferProgressBar = document.getElementById('transferProgressBar');
    const transferText = document.getElementById('transferText');
    const transferSpeedText = document.getElementById('transferSpeedText');
    const hostSeedStatus = document.getElementById('hostSeedStatus');
    
    // Chat UI
    const chatToggleBtn = document.getElementById('chatToggleBtn');
    const chatContainer = document.getElementById('chatContainer');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');
    const chatUnreadBadge = document.getElementById('chatUnreadBadge');

    let player; 
    let activePlayer = null; 
    let peer;
    let peerConnection;
    let isSyncing = false;
    
    let myId = "";
    let partnerId = "";
    let connectInterval;
    
    // File Transfer State
    let amISendingFile = false;
    let currentFile = null;
    let currentFileOffset = 0;
    const CHUNK_SIZE = 64 * 1024; 
    let receivedChunks = [];
    let expectedFileSize = 0;
    let receivedSize = 0;
    let expectedMimeType = '';
    let transferStartTime = 0;

    // --- Video.js Init ---
    try {
        player = videojs('mainPlayer', { controls: true, autoplay: false, preload: 'auto', fluid: true, responsive: true });
        activePlayer = player;
    } catch (e) {
        console.error("Video.js yüklenemedi:", e);
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let animationFrameId;

    function getActiveVideoElement() { return activePlayer === nativePlayerEl ? nativePlayerEl : player.tech().el(); }
    function getActiveCurrentTime() { return activePlayer === nativePlayerEl ? nativePlayerEl.currentTime : player.currentTime(); }
    function setActiveCurrentTime(time) { if (activePlayer === nativePlayerEl) nativePlayerEl.currentTime = time; else player.currentTime(time); }
    
    function playActiveVideo() {
        try {
            const p = activePlayer === nativePlayerEl ? nativePlayerEl.play() : player.play();
            if (p && p.catch) p.catch(e => console.log("Otomatik oynatma engellendi:", e));
        } catch (e) { console.error("Oynatma hatası:", e); }
    }
    
    function pauseActiveVideo() {
        try {
            if (activePlayer === nativePlayerEl) nativePlayerEl.pause(); else player.pause();
        } catch (e) { console.error("Durdurma hatası:", e); }
    }
    
    function isVideoPaused() {
        return activePlayer === nativePlayerEl ? nativePlayerEl.paused : player.paused();
    }

    function updateAmbientLight() {
        const videoElement = getActiveVideoElement();
        if (!videoElement || videoElement.paused || videoElement.ended) return;
        if (videoElement.readyState >= 2) { 
            try {
                canvas.width = 16; canvas.height = 16;
                ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let r = 0, g = 0, b = 0, count = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i] === 0 && data[i+1] === 0 && data[i+2] === 0) continue;
                    r += data[i]; g += data[i+1]; b += data[i+2]; count++;
                }
                if (count > 0) ambientLight.style.background = `rgb(${Math.floor(r/count)}, ${Math.floor(g/count)}, ${Math.floor(b/count)})`;
            } catch (e) {} 
        }
        animationFrameId = requestAnimationFrame(updateAmbientLight);
    }

    function handlePlayEvent() {
        ambientLight.classList.add('active');
        updateAmbientLight();
        if (!isSyncing && peerConnection) peerConnection.send({ type: 'play', time: getActiveCurrentTime() });
    }
    
    function handlePauseEvent() {
        ambientLight.classList.remove('active');
        cancelAnimationFrame(animationFrameId);
        if (!isSyncing && peerConnection) peerConnection.send({ type: 'pause', time: getActiveCurrentTime() });
    }
    
    function handleSeekEvent() {
        if (!isSyncing && peerConnection) peerConnection.send({ type: 'seek', time: getActiveCurrentTime() });
    }

    if (player) {
        player.on('play', handlePlayEvent);
        player.on('pause', handlePauseEvent);
        player.on('seeked', handleSeekEvent);
    }
    nativePlayerEl.addEventListener('play', handlePlayEvent);
    nativePlayerEl.addEventListener('pause', handlePauseEvent);
    nativePlayerEl.addEventListener('seeked', handleSeekEvent);
    nativePlayerEl.addEventListener('error', (e) => {
        alert("Video yüklenirken bir hata oluştu. Linkin veya dosyanın geçerli olduğundan emin olun.");
    });

    // --- Chat System ---
    function appendChatMessage(msg, type) {
        const div = document.createElement('div');
        div.className = `chat-msg ${type}`;
        div.innerText = msg;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    function toggleChat() {
        chatContainer.classList.toggle('closed');
        if (!chatContainer.classList.contains('closed')) {
            chatUnreadBadge.classList.add('hidden');
            chatInput.focus();
        }
    }
    chatToggleBtn.addEventListener('click', toggleChat);
    closeChatBtn.addEventListener('click', () => chatContainer.classList.add('closed'));
    function sendChatMessage() {
        const text = chatInput.value.trim();
        if (!text || !peerConnection) return;
        appendChatMessage(text, 'self');
        peerConnection.send({ type: 'chat', text: text });
        chatInput.value = '';
    }
    sendChatBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });

    // --- Login Logic ---
    function tryLogin() {
        const user = usernameInput.value.trim().toLowerCase();
        const pass = passwordInput.value.trim();
        
        if (pass !== "1305") {
            loginError.classList.remove('hidden');
            return;
        }
        
        if (user === "murat") {
            myId = "film-gecemiz-murat";
            partnerId = "film-gecemiz-gulsum";
        } else if (user === "gulsum" || user === "gülsüm") {
            myId = "film-gecemiz-gulsum";
            partnerId = "film-gecemiz-murat";
        } else {
            loginError.classList.remove('hidden');
            return;
        }
        
        // Success
        loginScreen.classList.add('hidden');
        appHeader.classList.remove('hidden');
        connectionStatus.classList.remove('hidden');
        mediaSelector.classList.remove('hidden');
        loginError.classList.add('hidden');
        
        initPeer();
    }

    loginBtn.addEventListener('click', tryLogin);
    passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') tryLogin(); });
    usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') tryLogin(); });

    // --- P2P Logic ---
    function initPeer() {
        try {
            peer = new Peer(myId, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
        } catch(e) {
            alert("Bağlantı motoru başlatılamadı!");
            return;
        }

        peer.on('open', (id) => {
            console.log("Logged in as:", id);
            attemptConnection();
            connectInterval = setInterval(attemptConnection, 3000);
        });
        
        peer.on('connection', (conn) => {
            // Incoming connection from partner
            if (conn.peer === partnerId) {
                if (peerConnection && peerConnection.open) return; // Already connected
                peerConnection = conn;
                setupConnectionEvents();
            }
        });
        
        peer.on('error', (err) => {
            console.log("PeerJS error:", err.type);
            // Ignore peer-unavailable errors during polling
        });
    }

    function attemptConnection() {
        if (peerConnection && peerConnection.open) {
            clearInterval(connectInterval);
            return;
        }
        
        const conn = peer.connect(partnerId, { reliable: true });
        conn.on('open', () => {
            peerConnection = conn;
            setupConnectionEvents();
        });
        conn.on('error', () => {
            // Silently fail and retry
        });
    }

    function setupConnectionEvents() {
        clearInterval(connectInterval);
        
        peerConnection.on('open', () => {
            connectionStatus.className = 'connection-status connected';
            statusText.innerText = '❤️ Sevgiliniz Bağlandı';
            chatToggleBtn.classList.remove('hidden');
            chatInput.disabled = false;
            sendChatBtn.disabled = false;
            appendChatMessage("Bağlantı kuruldu! Birlikte film izlemeye hazırsınız.", 'system');
            
            // Sync controls state instantly
            peerConnection.send({ type: 'sync_controls', time: getActiveCurrentTime(), paused: isVideoPaused() });
            
            if (currentFile) {
                startFileTransfer(currentFile);
            } else if (currentVideoState) {
                peerConnection.send(currentVideoState);
            }
        });
        
        peerConnection.on('data', handleSyncData);
        
        peerConnection.on('close', () => {
            connectionStatus.className = 'connection-status disconnected';
            statusText.innerText = 'Bağlantı Koptu! Aranıyor...';
            peerConnection = null;
            // Restart polling
            connectInterval = setInterval(attemptConnection, 3000);
        });
    }

    function switchToPlayer(type) {
        try {
            if (type === 'native') {
                document.querySelector('.video-js').classList.add('hidden');
                nativePlayerEl.classList.remove('hidden');
                activePlayer = nativePlayerEl;
                if (player) player.pause(); 
            } else {
                document.querySelector('.video-js').classList.remove('hidden');
                nativePlayerEl.classList.add('hidden');
                activePlayer = player;
                nativePlayerEl.pause();
            }
        } catch(e) { console.log(e); }
    }

    function startFileTransfer(file) {
        amISendingFile = true;
        currentFile = file;
        currentFileOffset = 0;
        hostSeedStatus.classList.remove('hidden');
        document.getElementById('hostSeedText').innerText = "Aktarım Başlıyor...";
        peerConnection.send({ type: 'file_transfer_start', name: file.name, size: file.size, mimeType: file.type || 'video/mp4' });
    }

    function sendNextChunk() {
        if (!currentFile || !peerConnection) return;
        if (currentFileOffset >= currentFile.size) return;
        
        const chunk = currentFile.slice(currentFileOffset, currentFileOffset + CHUNK_SIZE);
        const reader = new FileReader();
        reader.onload = (e) => {
            peerConnection.send({ type: 'file_transfer_chunk', data: e.target.result });
            currentFileOffset += CHUNK_SIZE;
            const progress = Math.min(100, (currentFileOffset / currentFile.size) * 100);
            document.getElementById('hostSeedText').innerText = `Aktarım: %${progress.toFixed(1)}`;
        };
        reader.readAsArrayBuffer(chunk);
    }

    function handleSyncData(data) {
        isSyncing = true;
        try {
            if (data.type === 'chat') {
                appendChatMessage(data.text, 'other');
                if (chatContainer.classList.contains('closed')) chatUnreadBadge.classList.remove('hidden');
            }
            else if (data.type === 'sync_controls') {
                setActiveCurrentTime(data.time);
                if (!data.paused) playActiveVideo();
            }
            else if (data.type === 'file_transfer_start') {
                amISendingFile = false; // I am receiving
                mediaSelector.classList.add('hidden');
                switchToPlayer('native');
                playerContainer.classList.remove('hidden');
                fileTransferContainer.classList.remove('hidden');
                
                if (!nativePlayerEl.src) nativePlayerEl.src = ""; 
                
                expectedFileSize = data.size;
                expectedMimeType = data.mimeType;
                receivedChunks = [];
                receivedSize = 0;
                transferStartTime = Date.now();
                peerConnection.send({ type: 'file_transfer_ack' });
            }
            else if (data.type === 'file_transfer_chunk') {
                receivedChunks.push(data.data);
                receivedSize += data.data.byteLength;
                
                const progress = Math.min(100, (receivedSize / expectedFileSize) * 100);
                transferProgressBar.style.width = `${progress}%`;
                transferText.innerText = `Film yükleniyor: %${progress.toFixed(1)}`;
                
                if (receivedSize >= expectedFileSize) {
                    fileTransferContainer.classList.add('hidden');
                    const blob = new Blob(receivedChunks, { type: expectedMimeType });
                    nativePlayerEl.src = URL.createObjectURL(blob);
                    peerConnection.send({ type: 'file_transfer_complete' });
                    receivedChunks = []; 
                } else {
                    peerConnection.send({ type: 'file_transfer_ack' });
                }
            }
            else if (data.type === 'file_transfer_ack') {
                if (amISendingFile) sendNextChunk();
            }
            else if (data.type === 'file_transfer_complete') {
                if (amISendingFile) {
                    document.getElementById('hostSeedText').innerText = `Aktarım bitti!`;
                    setTimeout(() => {
                        amISendingFile = false;
                        hostSeedStatus.classList.add('hidden');
                        peerConnection.send({ type: isVideoPaused() ? 'seek' : 'play', time: getActiveCurrentTime() });
                    }, 2000);
                }
            }
            else if (data.type === 'load_url') {
                mediaSelector.classList.add('hidden');
                switchToPlayer('native');
                nativePlayerEl.src = data.url;
                playerContainer.classList.remove('hidden');
                playActiveVideo();
            }
            else if (data.type === 'play') {
                if (Math.abs(getActiveCurrentTime() - data.time) > 1) setActiveCurrentTime(data.time);
                playActiveVideo();
            }
            else if (data.type === 'pause') {
                setActiveCurrentTime(data.time);
                pauseActiveVideo();
            }
            else if (data.type === 'seek') {
                setActiveCurrentTime(data.time);
            }
        } catch(e) { console.error("Sync Data Hatası:", e); }
        setTimeout(() => { isSyncing = false; }, 300);
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            mediaSelector.classList.add('hidden');
            playerContainer.classList.remove('hidden');
            switchToPlayer('native');
            nativePlayerEl.src = URL.createObjectURL(file);
            playActiveVideo();
            if (peerConnection && peerConnection.open) {
                startFileTransfer(file);
            } else {
                currentFile = file;
                amISendingFile = true;
                alert("Sevgiliniz bağlandığında dosya aktarımı otomatik başlayacak!");
            }
            fileInput.value = ''; 
        });
    }

    if (loadUrlBtn) {
        loadUrlBtn.addEventListener('click', () => {
            const url = urlInput.value.trim();
            if (!url) return;
            mediaSelector.classList.add('hidden');
            playerContainer.classList.remove('hidden');
            switchToPlayer('native');
            nativePlayerEl.src = url;
            playActiveVideo();
            
            currentVideoState = { type: 'load_url', url: url };
            
            if (peerConnection && peerConnection.open) {
                peerConnection.send(currentVideoState);
            } else {
                alert("Sevgiliniz bağlandığında URL otomatik olarak onda da açılacak.");
            }
        });
    }
});
