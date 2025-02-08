const https = require('https');

// Use the actual Railway domain
const RAILWAY_DOMAIN = 'sapienwootz-anuj.railway.app';

// Generic test function for endpoints
async function testEndpoint(path, name) {
    console.log(`\n=== Testing ${name} ===`);
    console.log(`URL: https://${RAILWAY_DOMAIN}${path}`);
    
    return new Promise((resolve) => {
        const options = {
            hostname: RAILWAY_DOMAIN,
            path: path,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
            },
            rejectUnauthorized: false,
            timeout: 10000
        };

        const req = https.request(options, (resp) => {
            let data = '';
            
            resp.on('data', (chunk) => data += chunk);
            
            resp.on('end', () => {
                console.log('\nResponse Status:', resp.statusCode);
                console.log('Content-Type:', resp.headers['content-type']);
                
                try {
                    const parsed = data ? JSON.parse(data) : null;
                    console.log('\nResponse Data:', JSON.stringify(parsed, null, 2));
                    resolve({
                        success: resp.statusCode >= 200 && resp.statusCode < 300,
                        data: parsed
                    });
                } catch (error) {
                    console.error('Error parsing response:', error.message);
                    console.log('Raw response:', data);
                    resolve({
                        success: false,
                        error: error.message
                    });
                }
            });
        });

        req.on('error', (error) => {
            console.error(`\nRequest failed:`, error.message);
            resolve({
                success: false,
                error: error.message
            });
        });

        req.on('timeout', () => {
            req.destroy();
            console.error('\nRequest timed out');
            resolve({
                success: false,
                error: 'Timeout'
            });
        });

        req.end();
    });
}

// Main test execution
async function runTests() {
    console.log('\n=== Starting Server Tests ===');
    console.log('Testing server:', RAILWAY_DOMAIN);
    
    const tests = [
        { path: '/', name: 'Root Endpoint' },
        { path: '/health', name: 'Health Endpoint' },
        { path: '/debug', name: 'Debug Endpoint' }
    ];
    
    const results = [];
    
    for (const test of tests) {
        const result = await testEndpoint(test.path, test.name);
        results.push({
            name: test.name,
            ...result
        });
        // Wait between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Print summary
    console.log('\n=== Test Summary ===');
    results.forEach(result => {
        console.log(`${result.name}: ${result.success ? '✅ Passed' : '❌ Failed'}`);
        if (!result.success) {
            console.log(`  Error: ${result.error}`);
        }
    });
    
    process.exit(0);
}

// Run tests
runTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
}); 