const express = require('express');
const cors = require('cors');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

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
    let driver;
    try {
        console.log('\n=== Starting button click operation ===');
        console.log('Timestamp:', new Date().toISOString());

        // Basic Chrome options that work on Railway
        const options = new chrome.Options()
            .addArguments('--no-sandbox')
            .addArguments('--headless')
            .addArguments('--disable-dev-shm-usage')
            .addArguments('--disable-gpu')
            .addArguments('--window-size=1920,1080')
            .setBinaryPath(process.env.CHROME_BIN);

        console.log('Starting browser...');
        
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();

        // Set reasonable timeouts
        await driver.manage().setTimeouts({
            implicit: 5000,
            pageLoad: 30000,
            script: 30000
        });

        // Navigate to the page
        console.log('Navigating to game.sapien.io...');
        await driver.get('https://game.sapien.io/');
        console.log('Page loaded');

        // Wait for body to ensure page is loaded
        await driver.wait(until.elementLocated(By.css('body')), 10000);

        // Log page state
        const title = await driver.getTitle();
        const url = await driver.getCurrentUrl();
        console.log('Current page:', { title, url });

        // Find all buttons and log them
        const buttons = await driver.findElements(By.css('button'));
        console.log(`Found ${buttons.length} buttons`);

        for (const btn of buttons) {
            const text = await btn.getText();
            const isDisplayed = await btn.isDisplayed();
            console.log('Button:', { text, isDisplayed });
        }

        // Find the Play Now button
        console.log('Looking for Play Now button...');
        const button = await driver.wait(until.elementLocated(By.css('button.Hero_cta-button__oTOqM')), 5000);
        
        // Verify button is clickable
        await driver.wait(until.elementIsVisible(button), 5000);
        await driver.wait(until.elementIsEnabled(button), 5000);

        // Get button details
        const buttonText = await button.getText();
        const isDisplayed = await button.isDisplayed();
        const isEnabled = await button.isEnabled();
        
        console.log('Found button:', {
            text: buttonText,
            isDisplayed,
            isEnabled
        });

        // Scroll to button
        await driver.executeScript('arguments[0].scrollIntoView(true);', button);
        await driver.sleep(1000);

        // Click the button
        console.log('Clicking button...');
        await button.click();
        console.log('Button clicked');

        // Wait for any changes
        await driver.sleep(2000);

        // Navigate to dashboard
        console.log('Navigating to dashboard...');
        await driver.get('https://app.sapien.io/t/dashboard');

        const finalUrl = await driver.getCurrentUrl();
        console.log('Final URL:', finalUrl);

        res.json({
            success: true,
            message: 'Operation completed successfully',
            details: {
                initialUrl: url,
                finalUrl,
                buttonFound: true,
                buttonText,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('\n=== Operation Failed ===');
        console.error('Error:', {
            message: error.message,
            type: error.name
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
        if (driver) {
            await driver.quit();
            console.log('Browser closed');
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
}); 