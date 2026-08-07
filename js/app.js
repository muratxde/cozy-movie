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
    const pipBtn = document.getElementById('pipBtn');
    const micBtn = document.getElementById('micBtn');
    const lockBtn = document.getElementById('lockBtn');
    const doodleBtn = document.getElementById('doodleBtn');
    const doodleCanvas = document.getElementById('doodleCanvas');

    
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
    const randomMovieBtn = document.getElementById('randomMovieBtn');
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
    const typingIndicator = document.getElementById('typingIndicator');

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
    function getCurrentVideoId() { return currentVideoState ? currentVideoState.url : (currentFile ? currentFile.name : null); }
    
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
    let isHostLocked = false;
    let hostLockOwner = null;

    function handlePlayEvent() {
        if (ignoreNextPlay) { ignoreNextPlay = false; return; }
        if (isHostLocked && hostLockOwner !== myId) {
            showToast("Kumanda Kilitli! Sadece yönetici kontrol edebilir.");
            ignoreNextPause = true;
            getActiveVideoElement().pause();
            return;
        }
        ambientLight.classList.add('active');
        updateAmbientLight();
        if (peerConnection && peerConnection.open) peerConnection.send({ type: 'play', time: getActiveCurrentTime(), user: myId === 'film-gecemiz-murat' ? 'Murat' : 'Gülsüm', videoId: getCurrentVideoId() });
    }
    
    function handlePauseEvent() {
        if (ignoreNextPause) { ignoreNextPause = false; return; }
        if (isHostLocked && hostLockOwner !== myId) {
            showToast("Kumanda Kilitli!");
            ignoreNextPlay = true;
            getActiveVideoElement().play();
            return;
        }
        ambientLight.classList.remove('active');
        cancelAnimationFrame(animationFrameId);
        if (peerConnection && peerConnection.open) peerConnection.send({ type: 'pause', time: getActiveCurrentTime(), user: myId === 'film-gecemiz-murat' ? 'Murat' : 'Gülsüm', videoId: getCurrentVideoId() });
    }
    
    function handleSeekEvent() {
        if (ignoreNextSeek) { ignoreNextSeek = false; return; }
        if (isHostLocked && hostLockOwner !== myId) {
            showToast("Kumanda Kilitli!");
            return;
        }
        if (peerConnection && peerConnection.open) peerConnection.send({ type: 'seek', time: getActiveCurrentTime(), user: myId === 'film-gecemiz-murat' ? 'Murat' : 'Gülsüm', videoId: getCurrentVideoId() });
    }

    if (player) {
        player.on('play', handlePlayEvent);
        player.on('pause', handlePauseEvent);
        player.on('seeked', handleSeekEvent);
    }
    nativePlayerEl.addEventListener('play', handlePlayEvent);
    nativePlayerEl.addEventListener('pause', handlePauseEvent);
    nativePlayerEl.addEventListener('seeked', handleSeekEvent);
    // Loading Overlay Logic for Native Player
    const loadingOverlay = document.getElementById('loadingOverlay');
    let bufferPercentText = document.getElementById('bufferPercentText');
    if (!bufferPercentText && loadingOverlay) {
        bufferPercentText = document.createElement('p');
        bufferPercentText.id = 'bufferPercentText';
        bufferPercentText.style.cssText = 'color: var(--primary); font-weight: bold; font-size: 1.2rem; margin-top: 1rem;';
        loadingOverlay.appendChild(bufferPercentText);
    }

    function showLoading() {
        // Sadece video izleme ekranındayken yükleme ekranını göster (arka planda çalışırken gösterme)
        if (loadingOverlay && !playerContainer.classList.contains('hidden')) {
            loadingOverlay.classList.remove('hidden');
            if (bufferPercentText) bufferPercentText.innerText = "%0 Yüklendi";
        }
    }
    function hideLoading() {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }

    nativePlayerEl.addEventListener('loadstart', showLoading);
    nativePlayerEl.addEventListener('waiting', showLoading);
    nativePlayerEl.addEventListener('playing', hideLoading);
    nativePlayerEl.addEventListener('canplay', hideLoading);
    nativePlayerEl.addEventListener('seeked', hideLoading); // İleri sarma bitince gizle
    nativePlayerEl.addEventListener('error', (e) => {
        hideLoading();
        // Video kapatılırken (src temizlenirken) hata vermemesi için src kontrolü
        if (nativePlayerEl.getAttribute('src')) {
            alert("Video yüklenirken bir hata oluştu. Linkin veya dosyanın geçerli olduğundan emin olun.");
        }
    });
    nativePlayerEl.addEventListener('progress', () => {
        if (nativePlayerEl.buffered.length > 0 && nativePlayerEl.duration > 0 && !isNaN(nativePlayerEl.duration)) {
            let maxBuffered = 0;
            // Get the furthest buffered range
            for (let i = 0; i < nativePlayerEl.buffered.length; i++) {
                if (nativePlayerEl.buffered.end(i) > maxBuffered) {
                    maxBuffered = nativePlayerEl.buffered.end(i);
                }
            }
            const percent = Math.min(100, (maxBuffered / nativePlayerEl.duration) * 100);
            if (bufferPercentText && !loadingOverlay.classList.contains('hidden')) {
                bufferPercentText.innerText = `%${percent.toFixed(1)} Yüklendi`;
            }
        }
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
        
        if (type === 'self' || type === 'other') {
            const isSelf = type === 'self';
            // Determine name based on myId. If myId has 'murat', self is Murat, else Gülsüm.
            const selfName = myId.includes('murat') ? 'Murat' : 'Gülsüm';
            const otherName = selfName === 'Murat' ? 'Gülsüm' : 'Murat';
            const msgName = isSelf ? selfName : otherName;
            
            const bgColor = msgName === 'Murat' ? '0984e3' : 'ff7675';
            const avatarUrl = `https://ui-avatars.com/api/?name=${msgName}&background=${bgColor}&color=fff&rounded=true&size=32`;
            
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '8px';
            if (isSelf) div.style.flexDirection = 'row-reverse';
            
            div.innerHTML = `<img src="${avatarUrl}" style="width:24px; height:24px; border-radius:50%; flex-shrink:0;"> <span>${msg}</span>`;
        } else {
            div.innerText = msg;
        }
        
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
    let typingTimeout;
    function sendChatMessage() {
        let text = chatInput.value.trim();
        if (!text || !peerConnection) return;
        
        // Auto convert <3 to ❤️
        text = text.replace(/<3/g, '❤️');
        
        appendChatMessage(text, 'self');
        peerConnection.send({ type: 'chat', text: text });
        peerConnection.send({ type: 'stop_typing' });
        chatInput.value = '';
    }
    sendChatBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => { 
        if (e.key === 'Enter') {
            sendChatMessage();
        } else {
            if (peerConnection && peerConnection.open) {
                peerConnection.send({ type: 'typing' });
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    peerConnection.send({ type: 'stop_typing' });
                }, 2000);
            }
        }
    });

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
                
                if (state.time && state.time > 10) {
                    setTimeout(() => {
                        if (confirm(`En son bu filmi izliyordunuz. Kaldığınız yerden (${Math.floor(state.time / 60)}:${Math.floor(state.time % 60)}) devam etmek ister misiniz?`)) {
                            setActiveCurrentTime(state.time);
                            // playActiveVideo();
                        }
                    }, 500);
                }
            }
        }).catch(e => console.error("IndexedDB okuma hatası:", e));
    }

    function clearMovieState() {
        if (typeof localforage !== 'undefined') localforage.removeItem('movie_state');
        currentFile = null;
        currentVideoState = null;
        pendingSync = null;
        nativePlayerEl.removeAttribute('src'); // src="" yerine removeAttribute kullanarak hata eventini engelle
        nativePlayerEl.load();
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
                peerConnection.send({ type: 'close_movie', user: myId === 'film-gecemiz-murat' ? 'Murat' : 'Gülsüm' });
            }
        });
    }

    if (pipBtn) {
        pipBtn.addEventListener('click', async () => {
            try {
                const videoEl = getActiveVideoElement();
                if (videoEl !== document.pictureInPictureElement) {
                    await videoEl.requestPictureInPicture();
                } else {
                    await document.exitPictureInPicture();
                }
            } catch (error) {
                console.error("PiP error:", error);
                showToast("Bu tarayıcı Ekran İçinde Ekran (PiP) desteklemiyor.");
            }
        });
    }


    if (lockBtn) {
        lockBtn.addEventListener('click', () => {
            isHostLocked = !isHostLocked;
            hostLockOwner = isHostLocked ? myId : null;
            
            if (isHostLocked) {
                lockBtn.innerHTML = '<i class="ph-bold ph-lock-key"></i>';
                lockBtn.style.color = "#ff4757";
                showToast("Kumanda Kilitlendi! Sadece siz kontrol edebilirsiniz.");
            } else {
                lockBtn.innerHTML = '<i class="ph-bold ph-lock-key-open"></i>';
                lockBtn.style.color = "white";
                showToast("Kumanda Kilidi Açıldı.");
            }
            
            if (peerConnection && peerConnection.open) {
                peerConnection.send({ type: 'host_lock', locked: isHostLocked, owner: hostLockOwner });
            }
        });
    }

    // --- Doodle (Çizim) Özelliği ---
    let isDoodleMode = false;
    let doodleCtx = null;
    let isDrawing = false;
    let lastX = 0; let lastY = 0;
    let clearDoodleTimer = null;
    
    if (doodleCanvas) {
        doodleCtx = doodleCanvas.getContext('2d');
        const resizeCanvas = () => {
            doodleCanvas.width = doodleCanvas.offsetWidth || 800;
            doodleCanvas.height = doodleCanvas.offsetHeight || 450;
        };
        window.addEventListener('resize', resizeCanvas);
        setTimeout(resizeCanvas, 500);
    }
    
    if (doodleBtn) {
        doodleBtn.addEventListener('click', () => {
            isDoodleMode = !isDoodleMode;
            if (isDoodleMode) {
                doodleCanvas.style.pointerEvents = 'auto';
                doodleBtn.style.color = "#ff477e";
                doodleBtn.innerHTML = '<i class="ph-fill ph-pencil-simple"></i>';
                showToast("Çizim Modu Açık! 🎨");
            } else {
                doodleCanvas.style.pointerEvents = 'none';
                doodleBtn.style.color = "white";
                doodleBtn.innerHTML = '<i class="ph-bold ph-pencil-simple"></i>';
                showToast("Çizim Modu Kapatıldı.");
            }
        });
    }

    window.drawDoodleLine = function(x0, y0, x1, y1, color, emit) {
        if (!doodleCtx) return;
        doodleCtx.beginPath();
        doodleCtx.moveTo(x0 * doodleCanvas.width, y0 * doodleCanvas.height);
        doodleCtx.lineTo(x1 * doodleCanvas.width, y1 * doodleCanvas.height);
        doodleCtx.strokeStyle = color;
        doodleCtx.lineWidth = 4;
        doodleCtx.lineCap = 'round';
        doodleCtx.stroke();
        doodleCtx.closePath();

        clearTimeout(clearDoodleTimer);
        clearDoodleTimer = setTimeout(() => {
            if (doodleCtx) doodleCtx.clearRect(0, 0, doodleCanvas.width, doodleCanvas.height);
        }, 5000);

        if (!emit) return;
        if (peerConnection && peerConnection.open) {
            peerConnection.send({ type: 'doodle', x0: x0, y0: y0, x1: x1, y1: y1, color: color });
        }
    };

    if (doodleCanvas) {
        const getCoords = (e) => {
            const rect = doodleCanvas.getBoundingClientRect();
            if (e.touches && e.touches.length > 0) {
                return { x: (e.touches[0].clientX - rect.left) / rect.width, y: (e.touches[0].clientY - rect.top) / rect.height };
            }
            return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
        };

        const onDown = (e) => {
            if (!isDoodleMode) return;
            isDrawing = true;
            const pos = getCoords(e);
            lastX = pos.x; lastY = pos.y;
        };
        const onMove = (e) => {
            if (!isDrawing) return;
            const pos = getCoords(e);
            const myColor = myId.includes('murat') ? '#0984e3' : '#ff7675';
            window.drawDoodleLine(lastX, lastY, pos.x, pos.y, myColor, true);
            lastX = pos.x; lastY = pos.y;
        };
        const onUp = () => { isDrawing = false; };

        doodleCanvas.addEventListener('mousedown', onDown);
        doodleCanvas.addEventListener('mousemove', onMove);
        doodleCanvas.addEventListener('mouseup', onUp);
        doodleCanvas.addEventListener('mouseout', onUp);
        
        doodleCanvas.addEventListener('touchstart', onDown);
        doodleCanvas.addEventListener('touchmove', onMove);
        doodleCanvas.addEventListener('touchend', onUp);
    }

    let localAudioStream = null;
    let currentVoiceCall = null;
    let isMicMuted = true;


    if (micBtn) {
        micBtn.addEventListener('click', async () => {
            if (!localAudioStream) {
                try {
                    localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    localAudioStream.getAudioTracks()[0].enabled = false; // start muted logically
                    
                    // Call partner if connected
                    if (peer && partnerId) {
                        currentVoiceCall = peer.call(partnerId, localAudioStream);
                        currentVoiceCall.on('stream', remoteStream => playRemoteStream(remoteStream));
                    }
                } catch(e) {
                    showToast("Mikrofon izni alınamadı!");
                    return;
                }
            }
            
            isMicMuted = !isMicMuted;
            localAudioStream.getAudioTracks()[0].enabled = !isMicMuted;
            
            if (isMicMuted) {
                micBtn.innerHTML = '<i class="ph-bold ph-microphone-slash"></i>';
                micBtn.style.color = "white";
                showToast("Mikrofon kapatıldı 🔇");
            } else {
                micBtn.innerHTML = '<i class="ph-bold ph-microphone"></i>';
                micBtn.style.color = "#4cd137";
                showToast("Mikrofon açıldı 🎤");
            }
        });
    }

    function playRemoteStream(stream) {
        let mediaEl = document.getElementById('remoteAudioPlayer');
        if (!mediaEl) {
            mediaEl = document.createElement('video');
            mediaEl.id = 'remoteAudioPlayer';
            mediaEl.autoplay = true;
            // PiP style floating video
            mediaEl.style.position = 'fixed';
            mediaEl.style.bottom = '80px';
            mediaEl.style.right = '20px';
            mediaEl.style.width = '120px';
            mediaEl.style.height = '120px';
            mediaEl.style.borderRadius = '50%';
            mediaEl.style.objectFit = 'cover';
            mediaEl.style.border = '3px solid #ff477e';
            mediaEl.style.zIndex = '9999';
            mediaEl.style.boxShadow = '0 10px 20px rgba(0,0,0,0.5)';
            document.body.appendChild(mediaEl);
        }
        mediaEl.srcObject = stream;
    }

    // --- Film Kütüphanesi (Azure Blob Auto-List) ---
    const HARDCODED_SAS_URL = "https://murat132580.blob.core.windows.net/movies?sv=2026-02-06&ss=bfqt&srt=co&sp=rwdlacupiytfx&se=2035-08-06T01:54:13Z&st=2026-08-05T17:39:13Z&spr=https&sig=Ljdb1u6dJnLJ2knDqqDfnoO8dh%2BpnF1RpRfta38C7wM%3D";
    var currentAzureBaseUrl = HARDCODED_SAS_URL;

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
                    
                    // Video URL: SAS token (parametreler) ile birlikte oluştur
                    // Kapsayıcı listeleme için kullandığımız restype ve comp haricindeki tüm SAS token ayarlarını korumalıyız (ileri sarma için sv=... şart)
                    let videoUrl;
                    try {
                        let urlObj = new URL(currentAzureBaseUrl);
                        urlObj.searchParams.delete('restype');
                        urlObj.searchParams.delete('comp');
                        urlObj.pathname = urlObj.pathname.replace(/\/$/, '') + '/' + encodedName;
                        videoUrl = urlObj.toString();
                    } catch(e) {
                        videoUrl = currentAzureBaseUrl.replace(/\/$/, '') + '/' + encodedName;
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

    if (randomMovieBtn) {
        randomMovieBtn.addEventListener('click', function() {
            const cards = document.querySelectorAll('.movie-card');
            if (cards.length > 0) {
                const randomIndex = Math.floor(Math.random() * cards.length);
                const selectedCard = cards[randomIndex];
                // Scroll to the card smoothly
                selectedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Simulate click after a tiny delay for effect
                setTimeout(() => { selectedCard.click(); }, 300);
            }
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
        // Sabitlenmiş SAS URL'den kütüphaneyi hemen yükle
        fetchAzureLibrary(currentAzureBaseUrl);
    }

    loginBtn.addEventListener('click', tryLogin);
    passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') tryLogin(); });
    usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') tryLogin(); });

    // --- P2P Logic ---
    function initPeer() {
        try {
            peer = new Peer(myId, { 
                host: 'gulsummurat.me', 
                port: 443, 
                path: '/peerjs',
                secure: true,
                config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } 
            });
            
            peer.on('call', call => {
                call.answer(localAudioStream || undefined); // Answer with local stream if available
                currentVoiceCall = call;
                call.on('stream', remoteStream => playRemoteStream(remoteStream));
            });
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
            peerConnection.send({ type: 'sync_controls', time: getActiveCurrentTime(), paused: isVideoPaused(), videoId: getCurrentVideoId() });
            
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
        
        let autoSyncInterval;
        peerConnection.on('close', () => {
            connectionStatus.className = 'status-badge disconnected';
            statusText.innerText = 'Bağlantı Koptu! Aranıyor...';
            peerConnection = null;
            if (autoSyncInterval) clearInterval(autoSyncInterval);
            // Restart polling
            connectInterval = setInterval(attemptConnection, 3000);
        });
        
        // Auto-Sync heartbeat every 3 seconds
        autoSyncInterval = setInterval(() => {
            if (peerConnection && peerConnection.open && !isVideoPaused()) {
                peerConnection.send({ type: 'sync_time', time: getActiveCurrentTime(), videoId: getCurrentVideoId() });
            }
            // Periodically save state for 'Continue Watching' feature
            if (typeof localforage !== 'undefined' && getCurrentVideoId()) {
                if (currentFile) {
                    localforage.setItem('movie_state', { type: 'file', blob: currentFile, name: currentFile.name, size: currentFile.size, time: getActiveCurrentTime() });
                } else if (currentVideoState) {
                    localforage.setItem('movie_state', { type: 'url', url: currentVideoState.url, time: getActiveCurrentTime() });
                }
            }
        }, 3000);
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
        if (isHostLocked && hostLockOwner === myId && ['play', 'pause', 'seek', 'sync_time', 'sync_controls'].includes(data.type)) {
            // I am the host, ignore incoming controls from partner
            return;
        }
        
        isSyncing = true;
        try {
            if (data.type === 'doodle') {
                if (typeof window.drawDoodleLine === 'function') {
                    window.drawDoodleLine(data.x0, data.y0, data.x1, data.y1, data.color, false);
                }
            }
            else if (data.type === 'host_lock') {
                isHostLocked = data.locked;
                hostLockOwner = data.owner;
                if (isHostLocked && hostLockOwner !== myId) {
                    showToast("Kumanda karşı taraf tarafından kilitlendi! Kontrol artık onda.");
                    if (lockBtn) {
                        lockBtn.innerHTML = '<i class="ph-bold ph-lock-key"></i>';
                        lockBtn.style.color = "#ff4757";
                    }
                } else if (!isHostLocked) {
                    showToast("Kumanda kilidi açıldı!");
                    if (lockBtn) {
                        lockBtn.innerHTML = '<i class="ph-bold ph-lock-key-open"></i>';
                        lockBtn.style.color = "white";
                    }
                }
            }
            else if (data.type === 'chat') {
                appendChatMessage(data.text, 'other');
                if (chatContainer.classList.contains('closed')) chatUnreadBadge.classList.remove('hidden');
                typingIndicator.classList.add('hidden');
            }
            else if (data.type === 'typing') {
                typingIndicator.classList.remove('hidden');
            }
            else if (data.type === 'stop_typing') {
                typingIndicator.classList.add('hidden');
            }
            else if (data.type === 'sync_controls') {
                if (data.videoId && data.videoId !== getCurrentVideoId()) return; // Strict match
                setActiveCurrentTime(data.time);
                if (!data.paused) playActiveVideo();
            }
            else if (data.type === 'sync_time') {
                if (data.videoId && data.videoId !== getCurrentVideoId()) return; // Strict match
                if (!isVideoPaused() && Math.abs(getActiveCurrentTime() - data.time) > 1.5) {
                    ignoreNextSeek = true;
                    setActiveCurrentTime(data.time);
                }
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
                if (data.user) showToast(data.user + ' filmi kapattı, lütfen yeni film seçin.');
            }
            else if (data.type === 'play') {
                if (data.videoId && data.videoId !== getCurrentVideoId()) return; // Strict match
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
                if (data.videoId && data.videoId !== getCurrentVideoId()) return; // Strict match
                if (Math.abs(getActiveCurrentTime() - data.time) > 1) {
                    ignoreNextSeek = true;
                    setActiveCurrentTime(data.time);
                }
                ignoreNextPause = true;
                pauseActiveVideo();
                if (data.user) showToast(data.user + ' filmi durdurdu ⏸️');
            }
            else if (data.type === 'seek') {
                if (data.videoId && data.videoId !== getCurrentVideoId()) return; // Strict match
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
        // Burst 3-5 emojis
        const count = Math.floor(Math.random() * 3) + 3;
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                const span = document.createElement('span');
                span.className = 'floating-emoji';
                span.innerText = emoji;
                // Random horizontal position
                const randomX = Math.random() * 80 + 10; // 10% to 90%
                span.style.left = `${randomX}%`;
                
                // Add some random size and animation duration
                const randomSize = Math.random() * 2 + 1.5; // 1.5rem to 3.5rem
                span.style.fontSize = `${randomSize}rem`;
                const randomDuration = Math.random() * 2 + 2; // 2s to 4s
                span.style.animationDuration = `${randomDuration}s`;
                
                floatingEmojisContainer.appendChild(span);
                
                setTimeout(() => {
                    span.remove();
                }, randomDuration * 1000);
            }, i * 200); // Stagger the burst
        }
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

    // Sürükle Bırak Altyazı Desteği (Drag & Drop)
    document.body.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    document.body.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith('.srt') || file.name.endsWith('.vtt')) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const text = ev.target.result;
                    loadSubtitleFromText(text, file.name);
                    showToast("Sürüklenen Altyazı yüklendi 📝");
                    
                    if (peerConnection && peerConnection.open) {
                        peerConnection.send({ type: 'load_subtitle', text: text, name: file.name });
                    }
                };
                reader.readAsText(file);
            } else {
                showToast("Lütfen sadece .srt veya .vtt formatında altyazı dosyası bırakın.");
            }
        }
    });

});
