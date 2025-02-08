const https = require('https');

// Use the correct Railway domain
const RAILWAY_DOMAIN = 'sapienwootz-production-a4f9.up.railway.app';

// Test function
async function testEndpoint(path) {
    console.log(`\nTesting ${path}...`);
    
    const options = {
        hostname: RAILWAY_DOMAIN,
        path: path,
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        },
        rejectUnauthorized: false
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('Status:', res.statusCode);
                console.log('Response:', data);
                resolve(data);
            });
        });

        req.on('error', (error) => {
            console.error('Error:', error.message);
            reject(error);
        });

        req.end();
    });
}

// Run tests
async function runTests() {
    try {
        await testEndpoint('/');
        await testEndpoint('/health');
        await testEndpoint('/debug');
    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

runTests(); 