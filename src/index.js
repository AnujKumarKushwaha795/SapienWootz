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

        // Configure Chrome options with more debugging
        const options = new chrome.Options()
            .addArguments('--no-sandbox')
            .addArguments('--headless')
            .addArguments('--disable-dev-shm-usage')
            .addArguments('--disable-gpu')
            .addArguments('--window-size=1920,1080')
            .addArguments('--disable-extensions')
            .addArguments('--disable-infobars')
            .addArguments('--remote-debugging-port=9222')
            .addArguments('--enable-logging')
            .addArguments('--v=1')
            .setBinaryPath(process.env.CHROME_BIN);

        console.log('Chrome options configured:', options.serialize());

        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();

        // Enable verbose logging
        await driver.manage().setTimeouts({
            implicit: 10000,
            pageLoad: 30000,
            script: 30000
        });

        console.log('Browser started with timeouts configured');

        // Navigate and log page details
        console.log('Navigating to game.sapien.io...');
        await driver.get('https://game.sapien.io/');
        
        // Log page information
        const title = await driver.getTitle();
        const currentUrl = await driver.getCurrentUrl();
        console.log('Page loaded:', { title, url: currentUrl });

        // Get page source for debugging
        const pageSource = await driver.getPageSource();
        console.log('Page source length:', pageSource.length);
        
        // Log all buttons on the page
        const allButtons = await driver.findElements(By.css('button'));
        console.log('Total buttons found:', allButtons.length);
        
        for (let i = 0; i < allButtons.length; i++) {
            const btn = allButtons[i];
            const text = await btn.getText();
            const classes = await btn.getAttribute('class');
            const isDisplayed = await btn.isDisplayed();
            const isEnabled = await btn.isEnabled();
            console.log(`Button ${i + 1}:`, {
                text,
                classes,
                isDisplayed,
                isEnabled
            });
        }

        // Try multiple button finding strategies with detailed logging
        const buttonSelectors = [
            By.css('button.Hero_cta-button__oTOqM'),
            By.xpath("//button[contains(text(), 'Play Now')]"),
            By.css('button.ResponsiveButton_button__Zvkip'),
            By.css('button.primary'),
            By.css('button[type="button"]'),
            By.xpath("//button[.//text()[contains(., 'Play')]]")
        ];

        let button = null;
        let usedSelector = '';
        let buttonDetails = {};

        for (const selector of buttonSelectors) {
            try {
                console.log('\nTrying selector:', selector);
                const elements = await driver.findElements(selector);
                console.log(`Found ${elements.length} elements with selector`);

                for (const element of elements) {
                    const text = await element.getText();
                    const classes = await element.getAttribute('class');
                    const isDisplayed = await element.isDisplayed();
                    const isEnabled = await element.isEnabled();
                    const rect = await element.getRect();
                    const tagName = await element.getTagName();
                    const attributes = await driver.executeScript(`
                        const attrs = {};
                        const elem = arguments[0];
                        for (const attr of elem.attributes) {
                            attrs[attr.name] = attr.value;
                        }
                        return attrs;
                    `, element);

                    console.log('Element details:', {
                        text,
                        classes,
                        isDisplayed,
                        isEnabled,
                        rect,
                        tagName,
                        attributes
                    });

                    if (text.includes('Play') && isDisplayed && isEnabled) {
                        button = element;
                        usedSelector = selector.toString();
                        buttonDetails = {
                            text,
                            classes,
                            isDisplayed,
                            isEnabled,
                            rect,
                            attributes
                        };
                        console.log('Found matching button!');
                        break;
                    }
                }

                if (button) break;
            } catch (err) {
                console.log('Selector failed:', err.message);
            }
        }

        if (!button) {
            console.log('\nFull page source:', pageSource);
            throw new Error('Play Now button not found with any selector');
        }

        console.log('\nSelected button details:', buttonDetails);

        // Scroll into view and check visibility
        await driver.executeScript('arguments[0].scrollIntoView(true);', button);
        await driver.sleep(1000);
        
        const isInViewport = await driver.executeScript(`
            const elem = arguments[0];
            const rect = elem.getBoundingClientRect();
            return (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
        `, button);
        
        console.log('Button in viewport:', isInViewport);

        // Try multiple click methods with detailed logging
        let clickSuccessful = false;
        
        // Method 1: Standard click
        try {
            console.log('\nTrying standard click...');
            await button.click();
            await driver.sleep(2000);
            const newUrl = await driver.getCurrentUrl();
            const newTitle = await driver.getTitle();
            clickSuccessful = newUrl !== 'https://game.sapien.io/';
            console.log('After standard click:', { newUrl, newTitle });
        } catch (error) {
            console.log('Standard click failed:', error.message);
        }

        // Method 2: JavaScript click
        if (!clickSuccessful) {
            try {
                console.log('\nTrying JavaScript click...');
                await driver.executeScript(`
                    arguments[0].dispatchEvent(new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true
                    }));
                `, button);
                await driver.sleep(2000);
                const newUrl = await driver.getCurrentUrl();
                const newTitle = await driver.getTitle();
                clickSuccessful = newUrl !== 'https://game.sapien.io/';
                console.log('After JavaScript click:', { newUrl, newTitle });
            } catch (error) {
                console.log('JavaScript click failed:', error.message);
            }
        }

        // Method 3: Actions click
        if (!clickSuccessful) {
            try {
                console.log('\nTrying Actions click...');
                const actions = driver.actions({async: true});
                await actions.move({origin: button}).click().perform();
                await driver.sleep(2000);
                const newUrl = await driver.getCurrentUrl();
                const newTitle = await driver.getTitle();
                clickSuccessful = newUrl !== 'https://game.sapien.io/';
                console.log('After Actions click:', { newUrl, newTitle });
            } catch (error) {
                console.log('Actions click failed:', error.message);
            }
        }

        // Log final state
        console.log('\nFinal button state:', await driver.executeScript(`
            const button = arguments[0];
            return {
                isConnected: button.isConnected,
                offsetParent: button.offsetParent !== null,
                computedDisplay: window.getComputedStyle(button).display,
                computedVisibility: window.getComputedStyle(button).visibility,
                boundingRect: button.getBoundingClientRect(),
                eventListeners: getEventListeners ? Object.keys(getEventListeners(button)) : 'Not available'
            }
        `, button));

        if (!clickSuccessful) {
            throw new Error('Failed to verify button click - page did not change after clicking');
        }

        console.log('Button click verified successfully');

        // Navigate to dashboard only if click was successful
        console.log('Navigating to dashboard...');
        await driver.get('https://app.sapien.io/t/dashboard');

        const finalUrl = await driver.getCurrentUrl();
        console.log('Final URL:', finalUrl);

        res.json({
            success: true,
            message: clickSuccessful ? 'Button clicked and navigated successfully' : 'Navigation completed but click may have failed',
            details: {
                finalUrl,
                buttonFound: true,
                usedSelector,
                clickVerified: clickSuccessful,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('\n=== Operation Failed ===');
        console.error('Detailed error:', {
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
            console.log('\nClosing WebDriver...');
            await driver.quit();
            console.log('WebDriver closed successfully');
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
}); 