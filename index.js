const express = require('express');
const app = express();
const PORT = process.env.PORT || 8000;

// Koyeb Health Check ke liye chota Web Server
app.get('/', (req, res) => {
  res.send('WhatsApp Bot/History Tracker is Running!');
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

// Aapka WhatsApp connection code yahan aayega
