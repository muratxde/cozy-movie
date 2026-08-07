const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const app = express();
const PORT_HTTP = 80;
const PORT_HTTPS = 443;
const SSL_DIR = path.join(__dirname, 'ssl');
const DOMAIN = 'gulsummurat.me'; // We'll search for this string in pem files

// Serve static files from current directory
app.use(express.static(__dirname));

// Default route (SPA fallback)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start servers
const startServers = () => {
    try {
        const keyPath = path.join(SSL_DIR, `${DOMAIN}-key.pem`);
        const certPath = path.join(SSL_DIR, `${DOMAIN}-crt.pem`);
        
        if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
            const privateKey = fs.readFileSync(keyPath, 'utf8');
            const certificate = fs.readFileSync(certPath, 'utf8');
            const credentials = { key: privateKey, cert: certificate };
            
            // Redirect HTTP to HTTPS
            http.createServer((req, res) => {
                res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
                res.end();
            }).listen(PORT_HTTP, () => {
                console.log(`HTTP Server running on port ${PORT_HTTP} (Redirecting to HTTPS)`);
            });

const { ExpressPeerServer } = require('peer');

            // HTTPS server
            const httpsServer = https.createServer(credentials, app);
            
            // Mount PeerJS on the HTTPS server
            const peerServer = ExpressPeerServer(httpsServer, {
                debug: true,
                path: '/'
            });
            
            app.use('/peerjs', peerServer);

            httpsServer.listen(PORT_HTTPS, () => {
                console.log(`HTTPS & PeerJS Server running on port ${PORT_HTTPS}`);
            });
        } else {
            throw new Error("SSL certificates not found");
        }
    } catch (err) {
        console.log("Starting HTTP server only. SSL Certificates not available:", err.message);
        http.createServer(app).listen(PORT_HTTP, () => {
            console.log(`HTTP Server running on port ${PORT_HTTP}`);
        });
    }
};

startServers();
