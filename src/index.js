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
            memory: process.memoryUsage()
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
            defaultViewport: {
                width: 1920,
                height: 1080
            }
        });
        console.log('Browser launched successfully');

        const page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        // Enable detailed logging
        page.on('console', msg => console.log('Browser console:', msg.text()));
        page.on('pageerror', err => console.error('Browser page error:', err.message));
        page.on('requestfailed', request => 
            console.error('Failed request:', request.url(), request.failure()?.errorText)
        );
        
        // Set longer timeout for navigation
        page.setDefaultNavigationTimeout(120000); // 2 minutes

        console.log('Navigating to game.sapien.io...');
        const response = await page.goto('https://game.sapien.io/', {
            waitUntil: ['networkidle0', 'domcontentloaded', 'load'],
            timeout: 120000
        });
        console.log('Navigation response:', {
            status: response.status(),
            url: response.url()
        });

        // Wait for the page to be fully loaded
        await page.waitForSelector('body', { visible: true });

        // Log the page title and URL
        console.log('Page loaded:', {
            title: await page.title(),
            url: page.url()
        });

        // Try multiple button selectors
        const buttonSelectors = [
            'button.Hero_cta-button__oTOqM',
            'button:has-text("Play Now")',
            'button.ResponsiveButton_button__Zvkip',
            'button.primary'
        ];

        let button = null;
        for (const selector of buttonSelectors) {
            console.log(`Trying selector: ${selector}`);
            try {
                button = await page.waitForSelector(selector, {
                    visible: true,
                    timeout: 5000
                });
                if (button) {
                    console.log(`Button found with selector: ${selector}`);
                    break;
                }
            } catch (err) {
                console.log(`Selector ${selector} not found`);
            }
        }

        if (!button) {
            throw new Error('Play Now button not found with any selector');
        }

        // Get button properties
        const buttonProperties = await button.evaluate(el => ({
            isVisible: el.offsetParent !== null,
            text: el.textContent.trim(),
            disabled: el.disabled,
            classes: el.className,
            rect: el.getBoundingClientRect()
        }));
        console.log('Button properties:', buttonProperties);

        // Take screenshot before clicking
        await page.screenshot({ path: '/tmp/before-click.png', fullPage: true });

        console.log('Attempting to click Play Now button...');
        
        // Try multiple click methods
        try {
            // Method 1: Direct click
            await button.click({ delay: 100 });
        } catch (error) {
            console.log('Direct click failed, trying alternative methods...');
            
            // Method 2: JavaScript click
            await page.evaluate((selector) => {
                const button = document.querySelector(selector);
                if (button) button.click();
            }, buttonSelectors[0]);
            
            // Method 3: Mouse click
            const buttonBox = await button.boundingBox();
            if (buttonBox) {
                await page.mouse.move(buttonBox.x + buttonBox.width/2, buttonBox.y + buttonBox.height/2);
                await page.mouse.click(buttonBox.x + buttonBox.width/2, buttonBox.y + buttonBox.height/2);
            }
        }

        // Wait for navigation
        await page.waitForNavigation({ 
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: 120000 
        }).catch(e => console.log('Navigation after click:', e.message));

        // Take screenshot after clicking
        await page.screenshot({ path: '/tmp/after-click.png', fullPage: true });

        const finalUrl = page.url();
        console.log('Final URL:', finalUrl);

        res.json({
            success: true,
            message: 'Operation completed',
            details: {
                finalUrl,
                buttonFound: true,
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