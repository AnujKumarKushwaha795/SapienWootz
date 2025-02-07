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

// Add this function at the top level
async function verifyDashboard(driver) {
    try {
        // Wait for dashboard elements
        await driver.wait(until.elementLocated(By.css('body')), 5000);
        
        // Collect dashboard information
        return {
            title: await driver.getTitle(),
            url: await driver.getCurrentUrl(),
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.log('Dashboard verification error:', error.message);
        return null;
    }
}

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

        // Find and click the button with retry logic
        async function findAndClickButton() {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    console.log(`\nAttempt ${attempt + 1} to find and click button`);
                    
                    // Find the button's text span first
                    console.log('Looking for Play Now text...');
                    const playNowSpan = await driver.wait(
                        until.elementLocated(By.xpath("//span[contains(text(), 'Play Now')]")),
                        5000
                    );
                    console.log('Found Play Now text');

                    // Get the parent button
                    const button = await driver.executeScript(`
                        const span = arguments[0];
                        let element = span;
                        while (element && element.tagName !== 'BUTTON') {
                            element = element.parentElement;
                        }
                        return element;
                    `, playNowSpan);
                    
                    if (!button) {
                        throw new Error('Could not find parent button');
                    }

                    // Log button state
                    const buttonState = await driver.executeScript(`
                        const btn = arguments[0];
                        return {
                            isVisible: btn.offsetWidth > 0 && btn.offsetHeight > 0,
                            isEnabled: !btn.disabled,
                            position: btn.getBoundingClientRect(),
                            styles: window.getComputedStyle(btn),
                            html: btn.outerHTML
                        }
                    `, button);
                    console.log('Button state:', buttonState);

                    // Ensure button is clickable
                    await driver.executeScript(`
                        // Remove any overlays
                        document.querySelectorAll('div[class*="overlay"], div[class*="modal"]')
                            .forEach(e => e.remove());
                        
                        // Make button clickable
                        const btn = arguments[0];
                        btn.style.opacity = '1';
                        btn.style.visibility = 'visible';
                        btn.style.display = 'block';
                        btn.style.pointerEvents = 'auto';
                        btn.style.position = 'relative';
                        btn.style.zIndex = '999999';
                        
                        // Ensure no other elements are blocking
                        document.body.style.position = 'relative';
                        Array.from(document.body.children).forEach(child => {
                            if (child !== btn && !child.contains(btn)) {
                                child.style.position = 'relative';
                                child.style.zIndex = '1';
                            }
                        });
                    `, button);

                    // Scroll into view
                    await driver.executeScript('arguments[0].scrollIntoView({block: "center"});', button);
                    await driver.sleep(1000);

                    // Click using JavaScript
                    console.log('Attempting click...');
                    await driver.executeScript(`
                        arguments[0].click();
                        // Backup: trigger click event
                        arguments[0].dispatchEvent(new MouseEvent('click', {
                            view: window,
                            bubbles: true,
                            cancelable: true
                        }));
                    `, button);

                    // Wait for navigation
                    await driver.sleep(2000);
                    const newUrl = await driver.getCurrentUrl();
                    console.log('URL after click:', newUrl);

                    if (newUrl !== 'https://game.sapien.io/') {
                        console.log('✅ Click successful!');
                        return {
                            success: true,
                            strategy: 'JavaScript Click',
                            buttonText: 'Play Now!',
                            newUrl,
                            finalUrl: newUrl,
                            clickNavigated: true
                        };
                    }

                    console.log('Click did not change URL, trying next attempt...');

                } catch (error) {
                    console.log(`Attempt ${attempt + 1} failed:`, error.message);
                    await driver.sleep(1000);
                }
            }
            throw new Error('Failed to find or click button after 3 attempts');
        }

        // Execute the find and click operation
        const clickResult = await findAndClickButton();
        
        res.json({
            success: true,
            message: `Operation completed successfully using ${clickResult.strategy}`,
            details: {
                initialUrl: url,
                urlAfterClick: clickResult.newUrl,
                finalUrl: clickResult.finalUrl,
                buttonFound: true,
                buttonText: clickResult.buttonText,
                clickNavigated: clickResult.clickNavigated,
                strategy: clickResult.strategy,
                dashboardVerified: clickResult.dashboardVerified,
                dashboardElements: clickResult.dashboardElements,
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