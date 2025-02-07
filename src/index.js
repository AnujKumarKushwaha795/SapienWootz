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
            By.css('button.primary'),
            By.css('button.Hero_cta-button__oTOqM.primary')
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

        // Take screenshot before clicking
        const beforeScreenshot = await driver.takeScreenshot();
        require('fs').writeFileSync('/tmp/screenshots/before-click.png', beforeScreenshot, 'base64');

        console.log('Attempting to click Play Now button...');

        // Try multiple click methods
        try {
            await driver.executeScript("arguments[0].scrollIntoView(true);", button);
            await driver.sleep(1000);
            
            // Method 1: Standard click
            await button.click();
            
            // Wait for navigation after click
            console.log('Waiting for navigation after click...');
            await driver.wait(async () => {
                const currentUrl = await driver.getCurrentUrl();
                return currentUrl.includes('app.sapien.io/t/dashboard');
            }, 10000, 'Navigation to dashboard failed');

        } catch (error) {
            console.log('Standard click failed:', error.message);
            try {
                // Method 2: JavaScript click
                await driver.executeScript('arguments[0].click();', button);
                
                // Wait for navigation after JavaScript click
                await driver.wait(async () => {
                    const currentUrl = await driver.getCurrentUrl();
                    return currentUrl.includes('app.sapien.io/t/dashboard');
                }, 10000, 'Navigation to dashboard failed');

            } catch (error2) {
                console.log('JavaScript click failed:', error2.message);
                // Method 3: Actions click
                const actions = driver.actions({async: true});
                await actions.move({origin: button}).click().perform();
                
                // Wait for navigation after actions click
                await driver.wait(async () => {
                    const currentUrl = await driver.getCurrentUrl();
                    return currentUrl.includes('app.sapien.io/t/dashboard');
                }, 10000, 'Navigation to dashboard failed');
            }
        }

        // Take screenshot after clicking
        const afterScreenshot = await driver.takeScreenshot();
        require('fs').writeFileSync('/tmp/screenshots/after-click.png', afterScreenshot, 'base64');

        const finalUrl = await driver.getCurrentUrl();
        console.log('Final URL:', finalUrl);

        // Check if we reached the dashboard
        if (!finalUrl.includes('app.sapien.io/t/dashboard')) {
            throw new Error('Failed to navigate to dashboard after clicking Play Now button');
        }

        res.json({
            success: true,
            message: 'Successfully clicked Play Now and navigated to dashboard',
            details: {
                finalUrl,
                buttonFound: true,
                usedSelector,
                timestamp: new Date().toISOString(),
                navigationSuccessful: true
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
                      error.message.includes('dashboard') ? 'Dashboard navigation failed' :
                      'Unknown error',
                navigationSuccessful: false
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