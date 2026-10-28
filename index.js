const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const qrcode = require('qrcode-terminal');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

// Express JSON middleware
app.use(express.json());

// 1. Website ki index.html main route par show karna
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. MongoDB se messages fetch karne ka API endpoint
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await MessageModel.find().sort({ timestamp: -1 }).limit(100);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Express Server Listener
const server = app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use.`);
  } else {
    console.error(err);
  }
});

// MongoDB Connection
const MONGO_URI = process.env.DATABASE_URL;

const messageSchema = new mongoose.Schema({
  remoteJid: String,
  sender: String,
  messageText: String,
  timestamp: { type: Date, default: Date.now }
});

const MessageModel = mongoose.model('WhatsAppMessage', messageSchema);

if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));
}

// WhatsApp Bot Logic
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('--- SCAN THIS QR CODE ---');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✅ WhatsApp Connected!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type === 'notify') {
      for (const msg of messages) {
        if (msg.message) {
          const remoteJid = msg.key.remoteJid;
          
          // Agar message aapne khud bheja hai toh 'Aap (Me)' show ho, warna doosre ka naam
          const sender = msg.key.fromMe ? 'Aap (Me)' : (msg.pushName || 'Unknown');
          
          const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || '[Media/Other]';

          try {
            const newMsg = new MessageModel({ remoteJid, sender, messageText });
            await newMsg.save();
            console.log(`Message saved from ${sender}: ${messageText}`);
          } catch (dbErr) {
            console.error('DB Save Error:', dbErr);
          }
        }
      }
    }
  });
}

startBot();
