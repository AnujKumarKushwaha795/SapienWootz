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
            .addArguments('--start-maximized')
            .addArguments('--disable-extensions');

        // Create WebDriver instance
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();

        console.log('Navigating to game.sapien.io...');
        await driver.get('https://game.sapien.io/');

        // Wait for page load
        await driver.wait(until.titleContains(''), 10000);
        console.log('Page loaded successfully');

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
                // Wait for button to be clickable
                button = await driver.wait(until.elementIsVisible(
                    await driver.findElement(selector)
                ), 5000);
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

        // Get button properties
        const buttonProperties = await driver.executeScript(`
            const button = arguments[0];
            return {
                isVisible: button.offsetParent !== null,
                text: button.textContent.trim(),
                disabled: button.disabled,
                classes: button.className,
                position: button.getBoundingClientRect()
            }
        `, button);

        console.log('Button properties:', buttonProperties);

        // Take screenshot before clicking
        await driver.takeScreenshot().then(
            (image) => require('fs').writeFileSync('/tmp/before-click.png', image, 'base64')
        );

        console.log('Attempting to click Play Now button...');

        // Try multiple click methods
        try {
            // Method 1: Standard click
            await button.click();
        } catch (error) {
            console.log('Standard click failed, trying alternatives...');
            
            // Method 2: JavaScript click
            await driver.executeScript('arguments[0].click();', button);
            
            // Method 3: Actions click
            const actions = driver.actions({async: true});
            await actions.move({origin: button}).click().perform();
        }

        // Wait for navigation
        await driver.wait(until.urlContains('sapien'), 10000);

        // Take screenshot after clicking
        await driver.takeScreenshot().then(
            (image) => require('fs').writeFileSync('/tmp/after-click.png', image, 'base64')
        );

        const finalUrl = await driver.getCurrentUrl();
        console.log('Final URL:', finalUrl);

        res.json({
            success: true,
            message: 'Operation completed',
            details: {
                finalUrl,
                buttonFound: true,
                buttonProperties,
                usedSelector,
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