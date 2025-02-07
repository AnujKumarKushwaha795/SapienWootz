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
        console.log('=== Starting button click operation ===');

        // Configure Chrome options
        const options = new chrome.Options()
            .addArguments('--no-sandbox')
            .addArguments('--headless')
            .addArguments('--disable-dev-shm-usage')
            .addArguments('--disable-gpu')
            .addArguments('--window-size=1920,1080')
            .addArguments('--disable-extensions')
            .addArguments('--disable-infobars')
            .addArguments('--remote-debugging-port=9222')
            .setBinaryPath(process.env.CHROME_BIN);

        // Create WebDriver instance
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();

        console.log('Browser started successfully');

        // Navigate to the page
        console.log('Navigating to game.sapien.io...');
        await driver.get('https://game.sapien.io/');
        console.log('Page loaded');

        // Wait for page load
        await driver.wait(until.elementLocated(By.css('body')), 10000);
        console.log('Body element found');

        // Try multiple button finding strategies
        const buttonSelectors = [
            By.css('button.Hero_cta-button__oTOqM'),
            By.xpath("//button[contains(text(), 'Play Now')]"),
            By.css('button.ResponsiveButton_button__Zvkip'),
            By.css('button.primary')
        ];

        let button = null;
        let usedSelector = '';

        for (const selector of buttonSelectors) {
            try {
                console.log('Trying selector:', selector);
                await driver.wait(until.elementLocated(selector), 5000);
                button = await driver.findElement(selector);
                if (button) {
                    usedSelector = selector.toString();
                    console.log('Button found with selector:', usedSelector);
                    break;
                }
            } catch (err) {
                console.log('Selector not found:', selector);
            }
        }

        if (!button) {
            throw new Error('Play Now button not found with any selector');
        }

        // Wait for button to be clickable
        await driver.wait(until.elementIsVisible(button), 5000);
        await driver.wait(until.elementIsEnabled(button), 5000);

        console.log('Attempting to click Play Now button...');

        // Click the button
        await button.click();
        console.log('Button clicked successfully');

        // Wait a moment for any click effects
        await driver.sleep(2000);

        // Verify the click was successful by checking URL or page changes
        const currentUrl = await driver.getCurrentUrl();
        console.log('URL after click:', currentUrl);

        if (currentUrl === 'https://game.sapien.io/') {
            // If we're still on the same page, try clicking again
            console.log('Still on game page, trying alternative click method...');
            await driver.executeScript('arguments[0].click();', button);
            await driver.sleep(2000);
        }

        // Navigate to dashboard
        console.log('Navigating to dashboard...');
        await driver.get('https://app.sapien.io/t/dashboard');

        const finalUrl = await driver.getCurrentUrl();
        console.log('Final URL:', finalUrl);

        res.json({
            success: true,
            message: 'Operation completed',
            details: {
                finalUrl,
                buttonFound: true,
                usedSelector,
                clickVerified: currentUrl !== 'https://game.sapien.io/',
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
        if (driver) {
            console.log('Closing WebDriver...');
            await driver.quit();
            console.log('WebDriver closed successfully');
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
}); 