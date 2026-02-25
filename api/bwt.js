const https = require('https');

module.exports = (req, res) => {
    https.get('https://bwt.cbp.gov/xml/bwt.xml', (response) => {
        let data = '';
        response.on('data', (chunk) => {
            data += chunk;
        });
        response.on('end', () => {
            res.setHeader('Content-Type', 'application/xml');
            res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate');
            res.status(200).send(data);
        });
    }).on('error', (err) => {
        console.error('Error fetching XML:', err.message);
        res.status(500).send('Error fetching data');
    });
};
