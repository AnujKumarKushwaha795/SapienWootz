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

        // Find the Play Now button with multiple selectors
        console.log('Looking for Play Now button...');
        const buttonSelectors = [
            'button.Hero_cta-button__oTOqM',
            'button.ResponsiveButton_button__Zvkip',
            'button.ResponsiveButton_primary__Ndytn',
            '//button[contains(text(), "Play Now")]'
        ];

        let button = null;
        for (const selector of buttonSelectors) {
            try {
                if (selector.startsWith('//')) {
                    button = await driver.findElement(By.xpath(selector));
                } else {
                    button = await driver.findElement(By.css(selector));
                }
                if (button) {
                    console.log('Found button with selector:', selector);
                    break;
                }
            } catch (err) {
                console.log('Selector failed:', selector);
            }
        }

        if (!button) {
            throw new Error('Play Now button not found');
        }

        // Get button location and size
        const buttonRect = await button.getRect();
        console.log('Button position:', buttonRect);

        // Try to remove any overlapping elements
        await driver.executeScript(`
            // Remove overlapping elements
            const rect = arguments[0].getBoundingClientRect();
            document.querySelectorAll('*').forEach(element => {
                if (element !== arguments[0]) {
                    const elemRect = element.getBoundingClientRect();
                    if (!(rect.right < elemRect.left || 
                          rect.left > elemRect.right || 
                          rect.bottom < elemRect.top || 
                          rect.top > elemRect.bottom)) {
                        element.style.pointerEvents = 'none';
                    }
                }
            });
            // Ensure button is clickable
            arguments[0].style.position = 'relative';
            arguments[0].style.zIndex = '9999';
        `, button);

        // Scroll into view with offset
        await driver.executeScript(`
            arguments[0].scrollIntoView();
            window.scrollBy(0, -100); // Scroll up a bit to avoid headers
        `, button);

        await driver.sleep(1000);

        // Try multiple click methods
        try {
            // Method 1: JavaScript click
            await driver.executeScript('arguments[0].click();', button);
            console.log('JavaScript click successful');
        } catch (error) {
            console.log('JavaScript click failed, trying direct click');
            try {
                // Method 2: Direct click
                await button.click();
                console.log('Direct click successful');
            } catch (error2) {
                console.log('Direct click failed, trying actions');
                // Method 3: Actions click
                const actions = driver.actions({async: true});
                await actions
                    .move({origin: button, x: 10, y: 10}) // Move to slightly offset position
                    .click()
                    .perform();
                console.log('Actions click successful');
            }
        }

        // Wait for any changes
        await driver.sleep(2000);

        // Check if URL changed
        const newUrl = await driver.getCurrentUrl();
        console.log('URL after click:', newUrl);

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
                buttonText: await button.getText(),
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