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
                '--single-process'
            ],
            headless: 'new',
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
        });
        console.log('Browser launched successfully');

        const page = await browser.newPage();
        console.log('Navigating to game.sapien.io...');
        await page.goto('https://game.sapien.io/', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // Wait for the button to be visible
        console.log('Waiting for Play Now button...');
        await page.waitForSelector('button.Hero_cta-button__oTOqM', {
            visible: true,
            timeout: 5000
        });

        // Click the button
        console.log('Clicking Play Now button...');
        await page.click('button.Hero_cta-button__oTOqM');

        // Wait for navigation or response
        await page.waitForTimeout(2000);

        res.json({
            success: true,
            message: 'Play Now button clicked successfully',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Detailed error:', {
            message: error.message,
            stack: error.stack,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
        });
        res.status(500).json({
            success: false,
            message: 'Failed to click button',
            error: error.message
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