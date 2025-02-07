const https = require('https');
const readline = require('readline');

// Use the actual Railway domain
const RAILWAY_DOMAIN = 'sapienwootz-production.up.railway.app';

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
function testHealthEndpoint() {
    console.log('Testing /health endpoint...');
    console.log('Using domain:', RAILWAY_DOMAIN);
    
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
    console.log('Using domain:', RAILWAY_DOMAIN);
    
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

// Modified login-signup test function
async function testLoginSignup() {
    console.log('=== Starting Login/Signup Test ===');
    console.log('Using domain:', RAILWAY_DOMAIN);
    
    const email = process.env.TEST_EMAIL || 'anujmaths47@email.com';
    console.log('Testing with email:', email);

    // First request - Submit email
    const emailData = {
        email,
        otp: null // First request only needs email
    };

    // Submit email and wait for OTP
    await submitEmail(emailData);
    
    // Ask for OTP
    console.log('\nCheck your email for OTP...');
    const otp = await askQuestion('Enter the OTP received: ');
    console.log('Submitting OTP:', otp);

    // Second request - Submit OTP
    const otpData = {
        email,
        otp
    };

    await submitOTP(otpData);
    
    // Close readline interface
    rl.close();
}

// Function to submit email
function submitEmail(data) {
    return new Promise((resolve, reject) => {
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
            let data = '';

            resp.on('data', (chunk) => {
                data += chunk;
            });

            resp.on('end', () => {
                console.log('=== Email Submission Response ===');
                try {
                    const response = JSON.parse(data);
                    console.log('Status:', response.success ? 'Success' : 'Failed');
                    console.log('Message:', response.message);
                    if (response.details) {
                        console.log('Details:', JSON.stringify(response.details, null, 2));
                    }
                    resolve(response);
                } catch (error) {
                    console.error('Error parsing response:', error);
                    console.log('Raw response:', data);
                    reject(error);
                }
            });
        });

        req.on('error', (err) => {
            console.error('Request failed:', err.message);
            reject(err);
        });

        req.write(JSON.stringify(data));
        req.end();
    });
}

// Function to submit OTP
function submitOTP(data) {
    return new Promise((resolve, reject) => {
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
            let data = '';

            resp.on('data', (chunk) => {
                data += chunk;
            });

            resp.on('end', () => {
                console.log('=== OTP Submission Response ===');
                try {
                    const response = JSON.parse(data);
                    console.log('Status:', response.success ? 'Success' : 'Failed');
                    console.log('Message:', response.message);
                    if (response.details) {
                        console.log('Details:', JSON.stringify(response.details, null, 2));
                    }
                    resolve(response);
                } catch (error) {
                    console.error('Error parsing response:', error);
                    console.log('Raw response:', data);
                    reject(error);
                }
            });
        });

        req.on('error', (err) => {
            console.error('Request failed:', err.message);
            reject(err);
        });

        req.write(JSON.stringify(data));
        req.end();
    });
}

// Modified run tests function
async function runTests() {
    console.log('Starting server tests...');
    
    // Run health check
    await new Promise(resolve => {
        testHealthEndpoint();
        setTimeout(resolve, 2000);
    });

    // Run click-play test
    await new Promise(resolve => {
        testClickPlayEndpoint();
        setTimeout(resolve, 2000);
    });

    // Run login-signup test with OTP input
    await testLoginSignup();
}

// Run the tests
runTests().catch(console.error); 