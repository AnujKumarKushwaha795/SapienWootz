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

        // Find and click the button with retry logic
        async function findAndClickButton() {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    console.log(`Attempt ${attempt + 1} to find and click button`);
                    
                    // Try multiple selectors to find the button
                    const buttonSelectors = [
                        'button.Hero_cta-button__oTOqM.primary',
                        'button.ResponsiveButton_button__Zvkip',
                        'button.ResponsiveButton_primary__Ndytn',
                        '//button[.//span[contains(text(), "Play Now")]]',
                        '//button[contains(@class, "Hero_cta-button__oTOqM")]'
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
                            continue;
                        }
                    }

                    if (!button) {
                        throw new Error('Button not found with any selector');
                    }

                    // Wait for button to be visible and enabled
                    await driver.wait(until.elementIsVisible(button), 5000);
                    await driver.wait(until.elementIsEnabled(button), 5000);

                    // Get button info
                    const buttonText = await button.getText();
                    const isDisplayed = await button.isDisplayed();
                    console.log('Button found:', { buttonText, isDisplayed });

                    // Scroll button into view
                    await driver.executeScript('arguments[0].scrollIntoView({block: "center"});', button);
                    await driver.sleep(1000);

                    // Make sure button and its content are clickable
                    await driver.executeScript(`
                        const button = arguments[0];
                        button.style.position = 'relative';
                        button.style.zIndex = '9999';
                        button.style.pointerEvents = 'auto';
                        
                        // Also ensure the span inside is clickable
                        const span = button.querySelector('.ResponsiveButton_button__content__PruRK');
                        if (span) {
                            span.style.pointerEvents = 'auto';
                            span.style.position = 'relative';
                            span.style.zIndex = '10000';
                        }
                    `, button);

                    // Try clicking the button
                    try {
                        // First try: Click the span inside the button
                        const span = await button.findElement(By.css('.ResponsiveButton_button__content__PruRK'));
                        await span.click();
                    } catch (error) {
                        console.log('Span click failed, trying button click');
                        // Second try: Direct button click
                        await button.click();
                    }

                    console.log('Click executed');
                    
                    // Wait and check if URL changed
                    await driver.sleep(2000);
                    const newUrl = await driver.getCurrentUrl();
                    console.log('URL after button click:', newUrl);

                    // Only navigate to dashboard if button click didn't do it
                    if (newUrl === 'https://game.sapien.io/') {
                        console.log('Manual navigation to dashboard needed');
                        await driver.get('https://app.sapien.io/t/dashboard');
                    } else {
                        console.log('Button click successfully changed URL');
                    }

                    const finalUrl = await driver.getCurrentUrl();
                    console.log('Final URL:', finalUrl);

                    return {
                        success: true,
                        buttonText,
                        newUrl,
                        finalUrl,
                        clickNavigated: newUrl !== 'https://game.sapien.io/'
                    };
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
            message: 'Operation completed successfully',
            details: {
                initialUrl: url,
                urlAfterClick: clickResult.newUrl,
                finalUrl: clickResult.finalUrl,
                buttonFound: true,
                buttonText: clickResult.buttonText,
                clickNavigated: clickResult.clickNavigated,
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