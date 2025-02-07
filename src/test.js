const http = require('http');

// Test the health endpoint
function testHealthEndpoint() {
    console.log('Testing /health endpoint...');
    
    http.get('http://localhost:3000/health', (resp) => {
        let data = '';

        resp.on('data', (chunk) => {
            data += chunk;
        });

        resp.on('end', () => {
            console.log('Health check response:', JSON.parse(data));
        });

    }).on('error', (err) => {
        console.error('Error testing health endpoint:', err.message);
    });
}

// Test the click-play endpoint
function testClickPlayEndpoint() {
    console.log('Testing /click-play endpoint...');
    
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/click-play',
        method: 'POST'
    };

    const req = http.request(options, (resp) => {
        let data = '';

        resp.on('data', (chunk) => {
            data += chunk;
        });

        resp.on('end', () => {
            console.log('Click-play response:', JSON.parse(data));
        });
    });

    req.on('error', (err) => {
        console.error('Error testing click-play endpoint:', err.message);
    });

    req.end();
}

// Run tests
console.log('Starting server tests...');

// Wait for server to start before running tests
setTimeout(() => {
    testHealthEndpoint();
    setTimeout(testClickPlayEndpoint, 1000);
}, 2000); 