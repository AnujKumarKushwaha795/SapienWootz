const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// Button click endpoint
app.post('/click-play', async (req, res) => {
    let browser;
    try {
        console.log('=== Starting button click operation ===');
        console.log('System info:', {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            memory: process.memoryUsage(),
            env: {
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
                navigationTimeout: process.env.PUPPETEER_NAVIGATION_TIMEOUT
            }
        });

        console.log('Launching browser with configuration...');
        browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--window-size=1920,1080',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-site-isolation-trials'
            ],
            headless: 'new',
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
            defaultViewport: {
                width: 1920,
                height: 1080
            }
        });
        console.log('Browser launched successfully');

        const page = await browser.newPage();
        
        // Enable detailed logging
        page.on('console', msg => console.log('Browser console:', msg.text()));
        page.on('pageerror', err => console.error('Browser page error:', err.message));
        page.on('requestfailed', request => 
            console.error('Failed request:', request.url(), request.failure().errorText)
        );
        
        // Set longer timeout for navigation
        page.setDefaultNavigationTimeout(120000); // 2 minutes
        
        console.log('Setting up page interceptors...');
        await page.setRequestInterception(true);
        page.on('request', request => {
            console.log(`Request: ${request.method()} ${request.url()}`);
            request.continue();
        });

        console.log('Navigating to game.sapien.io...');
        const response = await page.goto('https://game.sapien.io/', {
            waitUntil: ['networkidle0', 'domcontentloaded', 'load'],
            timeout: 120000
        });
        console.log('Navigation response:', {
            status: response.status(),
            url: response.url()
        });

        // Check if page loaded correctly
        const pageContent = await page.content();
        if (!pageContent.includes('Hero_cta-button__oTOqM')) {
            throw new Error('Button class not found in page content');
        }

        console.log('Waiting for Play Now button...');
        const button = await page.waitForSelector('button.Hero_cta-button__oTOqM', {
            visible: true,
            timeout: 30000
        });

        if (!button) {
            throw new Error('Button element not found');
        }

        // Get button properties
        const buttonProperties = await button.evaluate(el => ({
            isVisible: el.offsetParent !== null,
            text: el.textContent,
            disabled: el.disabled,
            classes: el.className
        }));
        console.log('Button properties:', buttonProperties);

        // Take screenshot before clicking
        await page.screenshot({ path: 'before-click.png' });

        console.log('Attempting to click Play Now button...');
        await Promise.all([
            button.click(),
            page.waitForNavigation({ 
                waitUntil: ['networkidle0', 'domcontentloaded'],
                timeout: 120000 
            })
        ]).catch(async (error) => {
            console.error('Click operation failed:', error.message);
            // Try alternative click method
            await page.evaluate(() => {
                const buttons = document.querySelectorAll('button');
                for (const button of buttons) {
                    if (button.textContent.includes('Play Now')) {
                        button.click();
                    }
                }
            });
        });

        // Take screenshot after clicking
        await page.screenshot({ path: 'after-click.png' });

        console.log('Checking current URL:', page.url());

        // Navigate to dashboard
        console.log('Attempting dashboard navigation...');
        await page.goto('https://app.sapien.io/t/dashboard', {
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: 120000
        });

        res.json({
            success: true,
            message: 'Operation completed',
            details: {
                finalUrl: page.url(),
                buttonFound: !!button,
                buttonProperties,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('=== Operation Failed ===');
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            type: error.name,
            timestamp: new Date().toISOString()
        });

        res.status(500).json({
            success: false,
            message: 'Operation failed',
            details: {
                error: error.message,
                type: error.name,
                step: error.message.includes('timeout') ? 'Navigation timeout' : 
                      error.message.includes('Button') ? 'Button interaction failed' : 
                      'Unknown error'
            }
        });
    } finally {
        if (browser) {
            console.log('Cleaning up browser instance...');
            await browser.close();
            console.log('Browser closed successfully');
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
}); 