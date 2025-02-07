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
        console.log('Launching browser...');
        browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--window-size=1920,1080'
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
        
        // Set longer timeout for navigation
        page.setDefaultNavigationTimeout(60000);
        
        console.log('Navigating to game.sapien.io...');
        await page.goto('https://game.sapien.io/', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        // Wait for the button to be visible
        console.log('Waiting for Play Now button...');
        await page.waitForSelector('button.Hero_cta-button__oTOqM', {
            visible: true,
            timeout: 10000
        });

        // Click the button
        console.log('Clicking Play Now button...');
        await Promise.all([
            page.click('button.Hero_cta-button__oTOqM'),
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 })
        ]);

        // Navigate to dashboard
        console.log('Navigating to dashboard...');
        await page.goto('https://app.sapien.io/t/dashboard', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        // Take screenshot for verification (optional)
        await page.screenshot({ path: 'dashboard.png' });

        res.json({
            success: true,
            message: 'Play Now button clicked and navigated to dashboard successfully',
            timestamp: new Date().toISOString(),
            currentUrl: page.url()
        });

    } catch (error) {
        console.error('Detailed error:', {
            message: error.message,
            stack: error.stack,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
        });
        res.status(500).json({
            success: false,
            message: 'Failed to complete operation',
            error: error.message,
            step: error.message.includes('timeout') ? 'Navigation timeout' : 'Operation failed'
        });
    } finally {
        if (browser) {
            console.log('Closing browser...');
            await browser.close();
            console.log('Browser closed successfully');
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
}); 