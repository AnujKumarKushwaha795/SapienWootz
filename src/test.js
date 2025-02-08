const https = require('https');
const readline = require('readline');

// Use the actual Railway domain
const RAILWAY_DOMAIN = 'sapienwootz-anuj.up.railway.app';

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Promisify readline question
function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// Test the health endpoint
async function testHealthEndpoint() {
    console.log('Testing /health endpoint...');
    console.log('Using domain:', RAILWAY_DOMAIN);
    
    return new Promise((resolve) => {
        const options = {
            hostname: RAILWAY_DOMAIN,
            path: '/health',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
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
                        console.log('Health check response:', JSON.parse(data));
                    } else {
                        console.log('No data received from health check');
                    }
                    resolve();
                } catch (error) {
                    console.error('Error parsing response:', error);
                    console.log('Raw response:', data);
                    resolve();
                }
            });
        });

        req.on('error', (err) => {
            console.error('Error testing health endpoint:', err.message);
            resolve();
        });

        req.end();
    });
}

// Test the click-play endpoint
async function testClickPlayEndpoint() {
    console.log('=== Starting Click-Play Test ===');
    console.log('Using domain:', RAILWAY_DOMAIN);
    
    return new Promise((resolve) => {
        const options = {
            hostname: RAILWAY_DOMAIN,
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
                    }
                    resolve();
                } catch (error) {
                    console.error('Error parsing response:', error);
                    console.log('Raw response:', data);
                    resolve();
                }
            });
        });

        req.on('error', (err) => {
            console.error('Request failed:', err.message);
            resolve();
        });

        req.end();
    });
}

// Test the login-signup flow
async function testLoginSignup() {
    console.log('=== Starting Login/Signup Test ===');
    console.log('Using domain:', RAILWAY_DOMAIN);
    
    // First step: Submit email
    const email = process.env.TEST_EMAIL || 'anujmaths47@email.com';
    console.log('Testing with email:', email);

    const emailSubmissionResponse = await submitLoginRequest(email);
    
    if (!emailSubmissionResponse?.success) {
        console.log('Email submission failed, stopping test');
        return;
    }

    // Wait for user to get OTP
    console.log('\nCheck your email for OTP...');
    const otp = await askQuestion('Enter the OTP received: ');
    
    if (!otp || otp.length !== 6) {
        console.log('Invalid OTP entered, stopping test');
        return;
    }

    // Submit OTP
    await submitLoginRequest(email, otp);
    
    // Close readline interface
    rl.close();
}

// Helper function to make login requests
function submitLoginRequest(email, otp = null) {
    return new Promise((resolve) => {
        const data = { email, otp };
        
        const options = {
            hostname: RAILWAY_DOMAIN,
            path: '/login-signup',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            rejectUnauthorized: false
        };

        const req = https.request(options, (resp) => {
            let responseData = '';

            resp.on('data', (chunk) => {
                responseData += chunk;
            });

            resp.on('end', () => {
                console.log(`=== ${otp ? 'OTP' : 'Email'} Submission Response ===`);
                try {
                    const response = JSON.parse(responseData);
                    console.log('Status:', response.success ? 'Success' : 'Failed');
                    console.log('Message:', response.message);
                    if (response.details) {
                        console.log('Details:', JSON.stringify(response.details, null, 2));
                    }
                    resolve(response);
                } catch (error) {
                    console.error('Error parsing response:', error);
                    console.log('Raw response:', responseData);
                    resolve(null);
                }
            });
        });

        req.on('error', (err) => {
            console.error('Request failed:', err.message);
            resolve(null);
        });

        req.write(JSON.stringify(data));
        req.end();
    });
}

// Add endpoint verification to test
async function verifyEndpoints() {
    console.log('\n=== Verifying Endpoints ===');
    
    const endpoints = [
        'https://game.sapien.io',
        'https://app.sapien.io/t/dashboard',
        'https://sapienwootz-anuj.up.railway.app'
    ];

    for (const url of endpoints) {
        const options = {
            hostname: new URL(url).hostname,
            path: new URL(url).pathname,
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
            },
            rejectUnauthorized: false
        };

        try {
            const result = await new Promise((resolve, reject) => {
                const req = https.request(options, (res) => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers
                    });
                });

                req.on('error', (error) => {
                    resolve({
                        error: error.message,
                        code: error.code
                    });
                });

                req.end();
            });

            console.log(`\nEndpoint: ${url}`);
            console.log('Status:', result);
        } catch (error) {
            console.error(`Failed to verify ${url}:`, error);
        }
    }
}

// Add to main test execution
async function runTests() {
    console.log('Starting server tests...');
    
    // First verify endpoints
    await verifyEndpoints();
    
    // Then run other tests
    await testHealthEndpoint();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await testClickPlayEndpoint();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await testLoginSignup();
}

// Run all tests
runTests().catch(console.error); 