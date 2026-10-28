const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const qrcode = require('qrcode-terminal');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// 1. MongoDB Atlas Connection
// Note: Apni MongoDB connection string yahan paste karein agar alag hai
const MONGO_URI = process.env.MONGO_URI || "YOUR_MONGODB_URI_HERE";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch(err => console.error("MongoDB Connection Error:", err));

// MongoDB Schema & Model for Messages
const messageSchema = new mongoose.Schema({
  sender: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
  fromMe: Boolean
});

const Message = mongoose.model('Message', messageSchema);

// 2. Express Web Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoint to fetch all messages for dashboard
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ timestamp: -1 }).limit(100);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Messages fetch nahi ho sake" });
  }
});

// 3. WhatsApp Baileys Bot Logic
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
      console.log('Connection closed due to error, reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('WhatsApp connected successfully!');
    }
  });

  // Incoming aur Outgoing (Self-sent) Dono Messages Logging
  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg.message) return;

      // Message text extract karna
      const text = msg.message.conversation || 
                   msg.message.extendedTextMessage?.text || 
                   msg.message.imageMessage?.caption || "";

      if (!text) return;

      const isFromMe = msg.key.fromMe;
      const senderNumber = isFromMe ? "Aap (Me)" : (msg.key.remoteJid ? msg.key.remoteJid.split('@')[0] : "Unknown");

      // Save to MongoDB
      const newMessage = new Message({
        sender: senderNumber,
        message: text,
        fromMe: isFromMe,
        timestamp: new Date()
      });

      await newMessage.save();
      console.log(`[Saved] ${senderNumber}: ${text}`);
    } catch (err) {
      console.error("Message save karte waqt error:", err);
    }
  });
}

// Web Server Start
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Start WhatsApp Bot
connectToWhatsApp();
