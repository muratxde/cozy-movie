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
    const closeMovieBtn = document.getElementById('closeMovieBtn');
    
    // Premium UI Elements
    const reactionsBar = document.getElementById('reactionsBar');
    const floatingEmojisContainer = document.getElementById('floatingEmojisContainer');
    const toastContainer = document.getElementById('toastContainer');
    const cinemaModeBtn = document.getElementById('cinemaModeBtn');
    const subtitleInput = document.getElementById('subtitleInput');
    
    // Film Kütüphanesi UI
    const azureUrlInput = document.getElementById('azureUrlInput');
    const loadLibraryBtn = document.getElementById('loadLibraryBtn');
    const refreshLibraryBtn = document.getElementById('refreshLibraryBtn');
    const librarySearchInput = document.getElementById('librarySearchInput');
    const movieGrid = document.getElementById('movieGrid');
    const movieCountBadge = document.getElementById('movieCountBadge');

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
    
    let amISendingFile = false;
    let currentFile = null;
    let currentVideoState = null;
    let currentFileOffset = 0;
    const CHUNK_SIZE = 128 * 1024; // 128 KB chunks for balanced speed/safety
    let receivedChunks = [];
    let expectedFileSize = 0;
    let expectedFileName = '';
    let receivedSize = 0;
    let expectedMimeType = '';
    let transferStartTime = 0;
    let lastUITime = 0;
    let pendingSync = null; // Deferred play/seek if video not ready yet

    // Helper for formatting sizes
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

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

    let ignoreNextPlay = false;
    let ignoreNextPause = false;
    let ignoreNextSeek = false;

    function handlePlayEvent() {
        ambientLight.classList.add('active');
        updateAmbientLight();
        if (ignoreNextPlay) { ignoreNextPlay = false; return; }
        if (peerConnection && peerConnection.open) peerConnection.send({ type: 'play', time: getActiveCurrentTime(), user: myId === 'film-gecemiz-murat' ? 'Murat' : 'Gülsüm' });
    }
    
    function handlePauseEvent() {
        ambientLight.classList.remove('active');
        cancelAnimationFrame(animationFrameId);
        if (ignoreNextPause) { ignoreNextPause = false; return; }
        if (peerConnection && peerConnection.open) peerConnection.send({ type: 'pause', time: getActiveCurrentTime(), user: myId === 'film-gecemiz-murat' ? 'Murat' : 'Gülsüm' });
    }
    
    function handleSeekEvent() {
        if (ignoreNextSeek) { ignoreNextSeek = false; return; }
        if (peerConnection && peerConnection.open) peerConnection.send({ type: 'seek', time: getActiveCurrentTime(), user: myId === 'film-gecemiz-murat' ? 'Murat' : 'Gülsüm' });
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
    // Execute any deferred play/seek once video becomes ready
    nativePlayerEl.addEventListener('canplay', () => {
        if (pendingSync) {
            const { type, time } = pendingSync;
            pendingSync = null;
            nativePlayerEl.currentTime = time;
            if (type === 'play') { ignoreNextPlay = true; playActiveVideo(); }
        }
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

    // --- State Persistence (IndexedDB) ---
    function restoreMovieState() {
        if (typeof localforage === 'undefined') return;
        localforage.getItem('movie_state').then(state => {
            if (state) {
                console.log("Önceki film geri yüklendi:", state.type);
                mediaSelector.classList.add('hidden');
                playerContainer.classList.remove('hidden');
                switchToPlayer('native');
                
                if (state.type === 'file') {
                    currentFile = state.blob;
                    currentFile.name = state.name;
                    currentFile.size = state.size; // preserve original size
                    nativePlayerEl.src = URL.createObjectURL(currentFile);
                    reactionsBar.classList.remove('hidden');
                } else if (state.type === 'url') {
                    currentVideoState = { type: 'load_url', url: state.url };
                    nativePlayerEl.src = state.url;
                    reactionsBar.classList.remove('hidden');
                }
            }
        }).catch(e => console.error("IndexedDB okuma hatası:", e));
    }

    function clearMovieState() {
        if (typeof localforage !== 'undefined') localforage.removeItem('movie_state');
        currentFile = null;
        currentVideoState = null;
        pendingSync = null;
        nativePlayerEl.src = "";
        if (player) player.pause();
        nativePlayerEl.pause();
        playerContainer.classList.add('hidden');
        guestWaiting.classList.add('hidden');
        mediaSelector.classList.remove('hidden');
        reactionsBar.classList.add('hidden');
        document.body.classList.remove('cinema-mode');
        cinemaModeBtn.innerHTML = '<i class="ph-bold ph-lightbulb"></i> Işıkları Kapat';
    }

    if (closeMovieBtn) {
        closeMovieBtn.addEventListener('click', () => {
            clearMovieState();
            if (peerConnection && peerConnection.open) {
                peerConnection.send({ type: 'close_movie' });
            }
        });
    }

    // --- Film Kütüphanesi (Azure Blob Auto-List) ---
    var currentAzureBaseUrl = localStorage.getItem('azure_storage_url') || '';

    function fetchAzureLibrary(baseUrl) {
        if (!baseUrl || !movieGrid) return;
        currentAzureBaseUrl = baseUrl.trim();
        localStorage.setItem('azure_storage_url', currentAzureBaseUrl);
        if (azureUrlInput) azureUrlInput.value = currentAzureBaseUrl;
        movieGrid.innerHTML = '<div class="loading-catalog"><div class="mini-spinner"></div><span>Kütüphane yükleniyor...</span></div>';
        if (movieCountBadge) movieCountBadge.classList.add('hidden');

        // Parse SAS Token URL correctly
        let fetchUrl;
        try {
            let urlObj = new URL(currentAzureBaseUrl);
            urlObj.searchParams.set('restype', 'container');
            urlObj.searchParams.set('comp', 'list');
            fetchUrl = urlObj.toString();
        } catch(e) {
            fetchUrl = currentAzureBaseUrl.replace(/\/$/, '') + '?restype=container&comp=list';
        }

        fetch(fetchUrl)
            .then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status + ' — Lütfen CORS ve Kapsayıcı İzinlerini kontrol edin.');
                return r.text();
            })
            .then(function(xmlText) {
                var parser = new DOMParser();
                var doc = parser.parseFromString(xmlText, 'text/xml');
                var blobs = doc.getElementsByTagName('Blob');
                var videos = [];
                
                Array.from(blobs).forEach(function(blob) {
                    var nameEl = blob.getElementsByTagName('Name')[0];
                    if (!nameEl) return;
                    var name = nameEl.textContent;
                    if (!/\.(mp4|mkv|avi|mov|webm|ts|m4v)$/i.test(name)) return;
                    
                    var encodedName = name.split('/').map(function(p) {
                        try { return encodeURIComponent(decodeURIComponent(p)); }
                        catch(e) { return encodeURIComponent(p); }
                    }).join('/');
                    
                    // Düzgün URL oluşturma (SAS token varsa korumak için, restype ve comp'i silmek için)
                    let videoUrl;
                    try {
                        let urlObj = new URL(currentAzureBaseUrl);
                        urlObj.searchParams.delete('restype');
                        urlObj.searchParams.delete('comp');
                        let pathname = urlObj.pathname.replace(/\/$/, '') + '/' + encodedName;
                        urlObj.pathname = pathname;
                        videoUrl = urlObj.toString();
                    } catch(e) {
                        videoUrl = currentAzureBaseUrl.replace(/\/$/, '').split('?')[0] + '/' + encodedName;
                    }
                    
                    videos.push({
                        title: name.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ').trim(),
                        url: videoUrl
                    });
                });
                renderMovieCards(videos);
            })
            .catch(function(err) {
                console.error('Azure kütüphane hatası:', err);
                movieGrid.innerHTML =
                    '<div class="empty-library">' +
                    '<i class="ph-fill ph-warning-circle" style="color:#ff4757;opacity:1;"></i>' +
                    '<p style="color:#ff4757;opacity:1;margin-top:0.5rem;">' + err.message + '</p>' +
                    '<p style="font-size:0.78rem;opacity:0.6;margin-top:0.3rem;">CORS ayarı tamam mı? Container erişimi "Container" mı?</p>' +
                    '</div>';
            });
    }

    function renderMovieCards(movies) {
        if (!movies || movies.length === 0) {
            movieGrid.innerHTML = '<div class="empty-library"><i class="ph-duotone ph-film-reel"></i><p>Kütüphanede hiç video yok</p></div>';
            if (movieCountBadge) movieCountBadge.classList.add('hidden');
            return;
        }
        if (movieCountBadge) {
            movieCountBadge.textContent = movies.length + ' film';
            movieCountBadge.classList.remove('hidden');
        }
        movieGrid.innerHTML = '';
        movies.forEach(function(movie) {
            var card = document.createElement('div');
            card.className = 'movie-card';
            card.dataset.url = movie.url;
            card.dataset.title = movie.title;
            var safeTitle = (movie.title || '').replace(/"/g, '&quot;');
            var noPosterHtml = '<div class="poster-fallback"><i class="ph-fill ph-film-slate"></i><span>' + safeTitle + '</span></div>';
            card.innerHTML =
                '<div class="movie-poster">' +
                    noPosterHtml +
                    '<div class="movie-overlay"><div class="play-btn-overlay"><i class="ph-fill ph-play"></i></div></div>' +
                '</div>' +
                '<div class="movie-info">' +
                    '<h4>' + (movie.title || 'İsimsiz Film') + '</h4>' +
                '</div>';
            card.addEventListener('click', function() { selectFromLibrary(movie, card); });
            movieGrid.appendChild(card);
        });
    }

    function selectFromLibrary(movie, cardEl) {
        document.querySelectorAll('.movie-card').forEach(function(c) { c.classList.remove('selected'); });
        cardEl.classList.add('selected');
        mediaSelector.classList.add('hidden');
        playerContainer.classList.remove('hidden');
        switchToPlayer('native');
        nativePlayerEl.src = movie.url;
        playActiveVideo();
        currentVideoState = { type: 'load_url', url: movie.url };
        if (typeof localforage !== 'undefined') {
            localforage.setItem('movie_state', { type: 'url', url: movie.url });
        }
        if (peerConnection && peerConnection.open) {
            peerConnection.send(currentVideoState);
            showToast('"' + movie.title + '" seçildi 🎬');
        }
        reactionsBar.classList.remove('hidden');
    }

    if (loadLibraryBtn) {
        loadLibraryBtn.addEventListener('click', function() {
            var url = azureUrlInput ? azureUrlInput.value.trim() : '';
            if (url) fetchAzureLibrary(url);
        });
    }
    if (azureUrlInput) {
        azureUrlInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') { var url = azureUrlInput.value.trim(); if (url) fetchAzureLibrary(url); }
        });
    }
    if (refreshLibraryBtn) {
        refreshLibraryBtn.addEventListener('click', function() {
            if (currentAzureBaseUrl) fetchAzureLibrary(currentAzureBaseUrl);
        });
    }
    if (librarySearchInput) {
        librarySearchInput.addEventListener('input', function() {
            var q = this.value.toLowerCase().trim();
            document.querySelectorAll('.movie-card').forEach(function(card) {
                var title = (card.dataset.title || '').toLowerCase();
                card.style.display = (q && !title.includes(q)) ? 'none' : '';
            });
        });
    }

    // Auto-fill saved Azure URL
    if (azureUrlInput && currentAzureBaseUrl) azureUrlInput.value = currentAzureBaseUrl;

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
        
        restoreMovieState();
        initPeer();
        // Kaydedilmiş Azure URL varsa kütüphaneyi otomatik yükle
        if (currentAzureBaseUrl) fetchAzureLibrary(currentAzureBaseUrl);
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
        });
    }

    function attemptConnection() {
        if (peerConnection && peerConnection.open) {
            clearInterval(connectInterval);
            return;
        }
        
        const conn = peer.connect(partnerId);
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
        
        const onConnOpen = () => {
            connectionStatus.className = 'status-badge connected';
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
        };

        if (peerConnection.open) {
            onConnOpen();
        } else {
            peerConnection.on('open', onConnOpen);
        }
        
        peerConnection.on('data', handleSyncData);
        
        peerConnection.on('close', () => {
            connectionStatus.className = 'status-badge disconnected';
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
        transferStartTime = Date.now();
        lastUITime = 0;
        document.getElementById('hostSeedText').innerText = "Aktarım Başlıyor... (İnternet hızınıza göre 5-15 dk sürebilir)";
        peerConnection.send({ type: 'file_transfer_start', name: file.name, size: file.size, mimeType: file.type || 'video/mp4' });
        reactionsBar.classList.remove('hidden');
    }

    async function processTransferQueue() {
        if (!amISendingFile || !currentFile || !peerConnection) return;
        
        while (currentFileOffset < currentFile.size) {
            // Wait if WebRTC buffer is full (> 16MB) to prevent crashing
            if (peerConnection.dataChannel && peerConnection.dataChannel.bufferedAmount > 16 * 1024 * 1024) {
                setTimeout(processTransferQueue, 50);
                return; // exit current loop, will resume
            }
            
            const chunk = currentFile.slice(currentFileOffset, currentFileOffset + CHUNK_SIZE);
            const arrayBuf = await chunk.arrayBuffer();
            
            peerConnection.send({ type: 'file_transfer_chunk', data: arrayBuf });
            currentFileOffset += CHUNK_SIZE;
            
            // Update UI occasionally based on time, not strict chunks
            const now = Date.now();
            if (now - lastUITime > 500 || currentFileOffset >= currentFile.size) {
                const progress = Math.min(100, (currentFileOffset / currentFile.size) * 100);
                const elapsed = (now - transferStartTime) / 1000;
                const speed = currentFileOffset / elapsed;
                const remainingBytes = currentFile.size - currentFileOffset;
                const remainingTimeSec = speed > 0 ? remainingBytes / speed : 0;
                
                document.getElementById('hostSeedText').innerText = `Aktarım: %${progress.toFixed(1)} | Hız: ${formatBytes(speed)}/sn | Kalan: ${Math.round(remainingTimeSec)} sn`;
                lastUITime = now;
            }
        }
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
                // Check if we ALREADY have this exact file loaded from IndexedDB!
                if (currentFile && currentFile.name === data.name && currentFile.size === data.size) {
                    console.log("Bu dosya zaten bende var! İndirmeye gerek yok.");
                    peerConnection.send({ type: 'file_transfer_complete' });
                    return;
                }
                
                amISendingFile = false; // I am receiving
                mediaSelector.classList.add('hidden');
                playerContainer.classList.add('hidden');       // Henüz player gösterme
                guestWaiting.classList.remove('hidden');       // Transfer bekleme ekranını göster
                guestMessage.innerText = 'Film geliyor... Lütfen bekle 🍿';
                fileTransferContainer.classList.remove('hidden');
                reactionsBar.classList.remove('hidden');
                
                if (!nativePlayerEl.src) nativePlayerEl.src = ""; 
                
                expectedFileSize = data.size;
                expectedFileName = data.name;
                expectedMimeType = data.mimeType;
                receivedChunks = [];
                receivedSize = 0;
                transferStartTime = Date.now();
                lastUITime = 0;
                
                transferText.innerText = `Film karşıdan indiriliyor... Lütfen bekleyin.`;
                peerConnection.send({ type: 'file_transfer_ack' }); // Start signal
            }
            else if (data.type === 'file_transfer_chunk') {
                const byteLength = data.data.byteLength || data.data.size || 0;
                receivedChunks.push(data.data);
                receivedSize += byteLength;
                
                const now = Date.now();
                if (now - lastUITime > 500 || receivedSize >= expectedFileSize) {
                    const progress = Math.min(100, (receivedSize / expectedFileSize) * 100);
                    const elapsed = (now - transferStartTime) / 1000;
                    const speed = receivedSize / elapsed;
                    const remainingBytes = expectedFileSize - receivedSize;
                    const remainingTimeSec = speed > 0 ? remainingBytes / speed : 0;
                    
                    transferProgressBar.style.width = `${progress}%`;
                    transferText.innerText = `İndiriliyor: %${progress.toFixed(1)} (${formatBytes(receivedSize)} / ${formatBytes(expectedFileSize)})`;
                    if (transferSpeedText) transferSpeedText.innerText = `Hız: ${formatBytes(speed)}/sn | Kalan: ${Math.round(remainingTimeSec)} sn`;
                    lastUITime = now;
                }
                
                if (receivedSize >= expectedFileSize) {
                    fileTransferContainer.classList.add('hidden');
                    guestWaiting.classList.add('hidden');       // Bekleme ekranını kapat
                    const blob = new Blob(receivedChunks, { type: expectedMimeType });
                    // File constructor kullanıyoruz: Blob üzerinde .name/.size read-only olduğundan set edilemez
                    currentFile = new File([blob], expectedFileName, { type: expectedMimeType });
                    
                    // Save to IndexedDB
                    if (typeof localforage !== 'undefined') {
                        localforage.setItem('movie_state', { type: 'file', blob: blob, name: expectedFileName, size: expectedFileSize });
                    }
                    
                    switchToPlayer('native');
                    playerContainer.classList.remove('hidden'); // Şimdi player'ı göster
                    nativePlayerEl.src = URL.createObjectURL(currentFile);
                    peerConnection.send({ type: 'file_transfer_complete' });
                    receivedChunks = []; 
                }
            }
            else if (data.type === 'file_transfer_ack') {
                if (amISendingFile) processTransferQueue();
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
                reactionsBar.classList.remove('hidden');
                
                // Save to IndexedDB
                if (typeof localforage !== 'undefined') {
                    localforage.setItem('movie_state', { type: 'url', url: data.url });
                }
                playActiveVideo();
            }
            else if (data.type === 'close_movie') {
                clearMovieState();
            }
            else if (data.type === 'play') {
                if (activePlayer === nativePlayerEl && nativePlayerEl.readyState < 2) {
                    // Video henüz yüklenmedi, canplay tetiklenince oynatılacak
                    pendingSync = { type: 'play', time: data.time };
                } else {
                    if (Math.abs(getActiveCurrentTime() - data.time) > 1) {
                        ignoreNextSeek = true;
                        setActiveCurrentTime(data.time);
                    }
                    ignoreNextPlay = true;
                    playActiveVideo();
                }
                if (data.user) showToast(data.user + ' filmi başlattı ▶️');
            }
            else if (data.type === 'pause') {
                if (Math.abs(getActiveCurrentTime() - data.time) > 1) {
                    ignoreNextSeek = true;
                    setActiveCurrentTime(data.time);
                }
                ignoreNextPause = true;
                pauseActiveVideo();
                if (data.user) showToast(data.user + ' filmi durdurdu ⏸️');
            }
            else if (data.type === 'seek') {
                if (Math.abs(getActiveCurrentTime() - data.time) > 1) {
                    ignoreNextSeek = true;
                    setActiveCurrentTime(data.time);
                }
                if (data.user) showToast(data.user + ' filmi sardı ⏩');
            }
            else if (data.type === 'reaction') {
                createFloatingEmoji(data.emoji, false);
            }
            else if (data.type === 'load_subtitle') {
                loadSubtitleFromText(data.text, data.name);
                showToast('Sevgiliniz altyazı yükledi 📝');
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
            
            // Save to IndexedDB
            if (typeof localforage !== 'undefined') {
                localforage.setItem('movie_state', { type: 'file', blob: file, name: file.name, size: file.size });
            }
            
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
            
            // Save to IndexedDB
            if (typeof localforage !== 'undefined') {
                localforage.setItem('movie_state', { type: 'url', url: url });
            }
            
            if (peerConnection && peerConnection.open) {
                peerConnection.send(currentVideoState);
            } else {
                alert("Sevgiliniz bağlandığında URL otomatik olarak onda da açılacak.");
            }
        });
    }

    // --- Premium Features Logic ---

    // 1. Reactions
    function createFloatingEmoji(emoji, isMine) {
        const span = document.createElement('span');
        span.className = 'floating-emoji';
        span.innerText = emoji;
        // Random horizontal position
        const randomX = Math.random() * 60 + 20; // 20% to 80%
        span.style.left = `${randomX}%`;
        
        floatingEmojisContainer.appendChild(span);
        
        setTimeout(() => {
            span.remove();
        }, 3000);
    }

    document.querySelectorAll('.reaction-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.target.closest('.reaction-btn');
            if (!targetBtn) return;
            const emoji = targetBtn.getAttribute('data-emoji');
            createFloatingEmoji(emoji, true);
            if (peerConnection && peerConnection.open) {
                peerConnection.send({ type: 'reaction', emoji: emoji });
            }
        });
    });

    // 2. Toasts
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<i class="ph-fill ph-bell-ringing"></i> <span>${message}</span>`;
        toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // 3. Cinema Mode
    if (cinemaModeBtn) {
        cinemaModeBtn.addEventListener('click', () => {
            document.body.classList.toggle('cinema-mode');
            if (document.body.classList.contains('cinema-mode')) {
                cinemaModeBtn.innerHTML = '<i class="ph-bold ph-lightbulb"></i> Işıkları Aç';
            } else {
                cinemaModeBtn.innerHTML = '<i class="ph-bold ph-lightbulb"></i> Işıkları Kapat';
            }
        });
    }

    // 4. Subtitles
    function loadSubtitleFromText(text, name) {
        const blob = new Blob([text], { type: 'text/vtt' });
        const blobUrl = URL.createObjectURL(blob);
        
        // Remove existing tracks
        const existingTracks = nativePlayerEl.querySelectorAll('track');
        existingTracks.forEach(t => t.remove());

        const track = document.createElement('track');
        track.src = blobUrl;
        track.kind = 'subtitles';
        track.srclang = 'tr';
        track.label = name || 'Altyazı';
        track.default = true;
        
        nativePlayerEl.appendChild(track);
    }

    if (subtitleInput) {
        subtitleInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (ev) => {
                const text = ev.target.result;
                loadSubtitleFromText(text, file.name);
                showToast("Altyazı yüklendi 📝");
                
                if (peerConnection && peerConnection.open) {
                    peerConnection.send({ type: 'load_subtitle', text: text, name: file.name });
                }
            };
            reader.readAsText(file);
            subtitleInput.value = '';
        });
    }

});
