const https = require('https');

// Test the health endpoint
function testHealthEndpoint() {
    console.log('Testing /health endpoint...');
    
    const options = {
        hostname: 'sapienwootz-production.up.railway.app',
        path: '/health',
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        },
        rejectUnauthorized: false
    };

    const req = https.request(options, (resp) => {
        let data = '';

        if (resp.statusCode === 301 || resp.statusCode === 302) {
            console.log('Redirecting to:', resp.headers.location);
            return;
        }

        resp.on('data', (chunk) => {
            data += chunk;
        });

        resp.on('end', () => {
            try {
                if (data) {
                    console.log('Health check response:', JSON.parse(data));
                } else {
                    console.log('No data received from health check');
                }
            } catch (error) {
                console.error('Error parsing response:', error);
                console.log('Raw response:', data);
            }
        });
    }).on('error', (err) => {
        console.error('Error testing health endpoint:', err.message);
    });

    req.end();
}

// Test the click-play endpoint
function testClickPlayEndpoint() {
    console.log('=== Starting Click-Play Test ===');
    console.log('Timestamp:', new Date().toISOString());
    
    const options = {
        hostname: 'sapienwootz-production.up.railway.app',
        path: '/click-play',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        rejectUnauthorized: false
    };

    const req = https.request(options, (resp) => {
        let data = '';

        resp.on('data', (chunk) => {
            data += chunk;
        });

        resp.on('end', () => {
            try {
                if (data) {
                    const response = JSON.parse(data);
                    console.log('=== Response Details ===');
                    console.log('Status:', response.success ? 'Success' : 'Failed');
                    console.log('Message:', response.message);
                    if (response.details) {
                        console.log('Details:', JSON.stringify(response.details, null, 2));
                    }
                } else {
                    console.log('No data received');
                }
            } catch (error) {
                console.error('Error parsing response:', error);
                console.log('Raw response:', data);
            }
        });
    });

    req.on('error', (err) => {
        console.error('Request failed:', err.message);
    });

    req.end();
}

// Run tests
console.log('Starting server tests...');

// Run tests sequentially
testHealthEndpoint();
setTimeout(testClickPlayEndpoint, 2000); 