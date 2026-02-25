const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/bwt', (req, res) => {
    https.get('https://bwt.cbp.gov/xml/bwt.xml', (response) => {
        let data = '';
        response.on('data', (chunk) => {
            data += chunk;
        });
        response.on('end', () => {
            res.set('Content-Type', 'application/xml');
            res.send(data);
        });
    }).on('error', (err) => {
        console.error('Error fetching XML:', err.message);
        res.status(500).send('Error fetching data');
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
