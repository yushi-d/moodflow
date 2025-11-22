// MoodWave - Real-time Collaborative Mood Visualization
// Powered by PubNub

class MoodWave {
    constructor() {
        this.currentRoom = 'cosmic';
        this.particles = [];
        this.waveData = [];
        this.onlineUsers = new Set();
        this.maxParticles = 200;
        this.wavePoints = 100;

        // Initialize canvases
        this.canvas = document.getElementById('vibeCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.waveCanvas = document.getElementById('waveCanvas');
        this.waveCtx = this.waveCanvas.getContext('2d');

        this.resizeCanvases();
        window.addEventListener('resize', () => this.resizeCanvases());

        // Initialize PubNub
        this.initPubNub();

        // Initialize wave data
        for (let i = 0; i < this.wavePoints; i++) {
            this.waveData.push({ height: 0, color: '#667eea' });
        }

        // Set up event listeners
        this.setupEventListeners();

        // Start animation loop
        this.animate();

        // Send presence heartbeat
        setInterval(() => this.sendPresence(), 30000);
    }

    initPubNub() {
        this.pubnub = new PubNub({
            publishKey: 'demo',
            subscribeKey: 'demo',
            userId: 'user-' + Math.random().toString(36).substr(2, 9)
        });

        // Subscribe to current room
        this.subscribeToRoom(this.currentRoom);

        // Listen for messages
        this.pubnub.addListener({
            message: (event) => this.handleMessage(event),
            presence: (event) => this.handlePresence(event),
            status: (event) => {
                if (event.category === 'PNConnectedCategory') {
                    console.log('Connected to PubNub');
                    this.sendPresence();
                }
            }
        });
    }

    subscribeToRoom(room) {
        this.pubnub.subscribe({
            channels: [`moodwave-${room}`],
            withPresence: true
        });

        // Get current occupancy
        this.pubnub.hereNow({
            channels: [`moodwave-${room}`],
            includeUUIDs: true
        }).then((response) => {
            const occupancy = response.channels[`moodwave-${room}`]?.occupancy || 1;
            document.getElementById('onlineCount').textContent = occupancy;
        });
    }

    unsubscribeFromRoom(room) {
        this.pubnub.unsubscribe({
            channels: [`moodwave-${room}`]
        });
    }

    handleMessage(event) {
        const { message } = event;

        if (message.type === 'vibe') {
            this.addParticle(message.vibe, message.color, message.x, message.y);
            this.updateWave(message.color);
            this.addMessageToFeed(message);
        } else if (message.type === 'presence') {
            this.onlineUsers.add(message.userId);
            this.updateOnlineCount();
        }
    }

    handlePresence(event) {
        if (event.action === 'join') {
            this.onlineUsers.add(event.uuid);
        } else if (event.action === 'leave' || event.action === 'timeout') {
            this.onlineUsers.delete(event.uuid);
        }
        this.updateOnlineCount();
    }

    updateOnlineCount() {
        document.getElementById('onlineCount').textContent = Math.max(1, this.onlineUsers.size);
    }

    sendPresence() {
        this.publishMessage({
            type: 'presence',
            userId: this.pubnub.getUUID()
        });
    }

    publishMessage(message) {
        this.pubnub.publish({
            channel: `moodwave-${this.currentRoom}`,
            message: message
        });
    }

    sendVibe(vibe, color) {
        const x = Math.random() * this.canvas.width;
        const y = Math.random() * this.canvas.height;

        const message = {
            type: 'vibe',
            vibe: vibe,
            color: color,
            x: x / this.canvas.width,  // Normalize for different screen sizes
            y: y / this.canvas.height,
            timestamp: Date.now(),
            userId: this.pubnub.getUUID()
        };

        this.publishMessage(message);

        // Add locally immediately for better UX
        this.addParticle(vibe, color, message.x, message.y);
        this.updateWave(color);
    }

    addParticle(emoji, color, normalizedX, normalizedY) {
        // Remove oldest particles if at max
        if (this.particles.length >= this.maxParticles) {
            this.particles.splice(0, 10);
        }

        const x = normalizedX * this.canvas.width;
        const y = normalizedY * this.canvas.height;

        this.particles.push({
            emoji: emoji,
            color: color,
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            life: 1.0,
            size: 20 + Math.random() * 20,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.1
        });

        // Update stats
        document.getElementById('activeVibes').textContent = this.particles.length;
    }

    updateWave(color) {
        // Shift wave data and add new point
        this.waveData.shift();
        this.waveData.push({
            height: 0.3 + Math.random() * 0.7,
            color: color
        });
    }

    addMessageToFeed(message) {
        const messageList = document.getElementById('messageList');
        const messageEl = document.createElement('div');
        messageEl.className = 'message';
        messageEl.style.borderLeftColor = message.color;

        const time = new Date(message.timestamp).toLocaleTimeString();

        messageEl.innerHTML = `
            <span class="message-emoji">${message.vibe}</span>
            <span class="message-text">Vibe sent in ${this.currentRoom} room</span>
            <span class="message-time">${time}</span>
        `;

        messageList.insertBefore(messageEl, messageList.firstChild);

        // Keep only last 20 messages
        while (messageList.children.length > 20) {
            messageList.removeChild(messageList.lastChild);
        }
    }

    setupEventListeners() {
        // Room selection
        document.querySelectorAll('.room-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const newRoom = e.target.dataset.room;
                if (newRoom !== this.currentRoom) {
                    // Update UI
                    document.querySelector('.room-btn.active').classList.remove('active');
                    e.target.classList.add('active');

                    // Switch rooms
                    this.unsubscribeFromRoom(this.currentRoom);
                    this.currentRoom = newRoom;
                    this.subscribeToRoom(this.currentRoom);

                    // Clear particles and messages
                    this.particles = [];
                    document.getElementById('messageList').innerHTML = '';

                    // Update background gradient based on room
                    this.updateRoomTheme(newRoom);
                }
            });
        });

        // Vibe buttons
        document.querySelectorAll('.vibe-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const vibe = e.target.dataset.vibe;
                const color = e.target.dataset.color;
                this.sendVibe(vibe, color);

                // Visual feedback
                e.target.style.transform = 'scale(1.2)';
                setTimeout(() => {
                    e.target.style.transform = '';
                }, 200);
            });
        });

        // Click on canvas to send random vibe
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / this.canvas.width;
            const y = (e.clientY - rect.top) / this.canvas.height;

            const vibes = ['✨', '💫', '⭐', '🌟', '💖', '🔥', '🌈'];
            const colors = ['#FFD700', '#FF69B4', '#FF4500', '#9370DB', '#87CEEB'];

            const randomVibe = vibes[Math.floor(Math.random() * vibes.length)];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];

            this.publishMessage({
                type: 'vibe',
                vibe: randomVibe,
                color: randomColor,
                x: x,
                y: y,
                timestamp: Date.now(),
                userId: this.pubnub.getUUID()
            });

            this.addParticle(randomVibe, randomColor, x, y);
            this.updateWave(randomColor);
        });
    }

    updateRoomTheme(room) {
        const themes = {
            cosmic: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            chill: 'linear-gradient(135deg, #2E3192 0%, #1BFFFF 100%)',
            energetic: 'linear-gradient(135deg, #F2994A 0%, #F2C94C 100%)',
            zen: 'linear-gradient(135deg, #56ab2f 0%, #a8e063 100%)',
            party: 'linear-gradient(135deg, #ff0844 0%, #ffb199 100%)'
        };

        document.body.style.background = themes[room] || themes.cosmic;
    }

    resizeCanvases() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;

        this.waveCanvas.width = this.waveCanvas.offsetWidth;
        this.waveCanvas.height = this.waveCanvas.offsetHeight;
    }

    animate() {
        // Clear canvases
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.waveCtx.clearRect(0, 0, this.waveCanvas.width, this.waveCanvas.height);

        // Draw background particles
        this.drawBackgroundEffect();

        // Update and draw particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            // Update position
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.rotationSpeed;

            // Apply slight gravity and drag
            p.vy += 0.05;
            p.vx *= 0.99;
            p.vy *= 0.99;

            // Bounce off edges
            if (p.x < 0 || p.x > this.canvas.width) p.vx *= -0.8;
            if (p.y < 0 || p.y > this.canvas.height) p.vy *= -0.8;

            // Keep in bounds
            p.x = Math.max(0, Math.min(this.canvas.width, p.x));
            p.y = Math.max(0, Math.min(this.canvas.height, p.y));

            // Decay life
            p.life -= 0.003;

            // Remove dead particles
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            // Draw particle
            this.ctx.save();
            this.ctx.globalAlpha = p.life;
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.rotation);

            // Draw glow
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = p.color;

            // Draw emoji
            this.ctx.font = `${p.size}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(p.emoji, 0, 0);

            this.ctx.restore();
        }

        // Draw wave
        this.drawWave();

        // Update stats
        document.getElementById('activeVibes').textContent = this.particles.length;

        requestAnimationFrame(() => this.animate());
    }

    drawBackgroundEffect() {
        const time = Date.now() / 1000;

        for (let i = 0; i < 5; i++) {
            const x = (Math.sin(time * 0.5 + i) * 0.5 + 0.5) * this.canvas.width;
            const y = (Math.cos(time * 0.3 + i) * 0.5 + 0.5) * this.canvas.height;

            const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, 100);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    drawWave() {
        const width = this.waveCanvas.width;
        const height = this.waveCanvas.height;
        const segmentWidth = width / this.wavePoints;

        this.waveCtx.beginPath();
        this.waveCtx.moveTo(0, height);

        for (let i = 0; i < this.wavePoints; i++) {
            const x = i * segmentWidth;
            const y = height - (this.waveData[i].height * height * 0.8);

            if (i === 0) {
                this.waveCtx.lineTo(x, y);
            } else {
                const prevX = (i - 1) * segmentWidth;
                const prevY = height - (this.waveData[i - 1].height * height * 0.8);
                const cpX = (prevX + x) / 2;

                this.waveCtx.quadraticCurveTo(prevX, prevY, cpX, (prevY + y) / 2);
                this.waveCtx.quadraticCurveTo(cpX, (prevY + y) / 2, x, y);
            }
        }

        this.waveCtx.lineTo(width, height);
        this.waveCtx.closePath();

        const gradient = this.waveCtx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');

        this.waveCtx.fillStyle = gradient;
        this.waveCtx.fill();

        // Draw wave line
        this.waveCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        this.waveCtx.lineWidth = 2;
        this.waveCtx.stroke();

        // Animate wave decay
        for (let i = 0; i < this.waveData.length; i++) {
            this.waveData[i].height *= 0.98;
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MoodWave();
});
