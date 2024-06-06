const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const WebSocket = require('ws'); 

const app = express();
const PORT = 3000;
const SECRET_KEY = 'you_wont_understand_its_a_secret';
let selectedSymbol = '';

var cors = require('cors')
app.use(cors());
app.use(bodyParser.json());

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

app.get('/symbols', async (req, res) => {
    try {
        const response = await axios.get('https://api.kucoin.com/api/v1/symbols');
        res.json(response.data.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch symbols' });
    }
});

app.post('/login', (req, res) => {
  const { symbol, pin } = req.body;

  selectedSymbol = symbol;
  if (pin === 'Mys3cureP1n!123') {
      const token = jwt.sign({ symbol }, SECRET_KEY, { expiresIn: '1h' });
      res.json({ token });
  } else {
      res.status(401).json({ error: 'Invalid pin' });
  }
});

app.get('/orderbook', authenticateToken, async (req, res) => {
    try {
        const { symbol } = req.user;
        const response = await axios.get(`https://api.kucoin.com/api/v1/market/orderbook/level2_100?symbol=${symbol}`);
        res.json(response.data.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch order book data' });
    }
});

const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

const wss = new WebSocket.Server({ server });

const sendOrderBookData = async () => {
  try {
      console.log(`Selected symbol is: ${selectedSymbol}`);
      const response = await axios.get(`https://api.kucoin.com/api/v1/market/orderbook/level2_100?symbol=${selectedSymbol}`);
      if (response.data && response.data.data && response.data.data.bids && response.data.data.asks) {
          console.log(`data response is: ${response.data.data.bids}`);
          
          const orderBookData = {
              timestamp: Date.now(),
              bids: response.data.data.bids,
              asks: response.data.data.asks
          };

          wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify(orderBookData));
              }
          });
      } else {
          console.error('Response data is missing expected structure:', response.data);
      }
  } catch (error) {
      console.error('Failed to fetch and send order book data:', error);
  }
};

let intervalId;

wss.on('connection', (ws) => {
  console.log('WebSocket connection established.');

 
  sendOrderBookData();

  
  if (!intervalId) {
      intervalId = setInterval(sendOrderBookData, 60000); 
  }

  ws.on('message', (message) => {
      console.log(`Received message from client: ${message}`);
  });

  
  ws.on('close', () => {
      console.log('WebSocket connection closed.');
      
      
      if (wss.clients.size === 0 && intervalId) {
          clearInterval(intervalId);
          intervalId = null;
      }
  });
});

