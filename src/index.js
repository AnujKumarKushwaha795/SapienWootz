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

// Function to analyze page elements
async function analyzePageElements(driver) {
    console.log('\n=== Analyzing Page Elements ===');
    
    const elements = await driver.executeScript(`
        return {
            // Login/Signup Button Analysis
            loginButton: (() => {
                const button = document.querySelector('.chakra-button.css-3nfgc7');
                if (!button) return null;
                return {
                    exists: true,
                    text: button.textContent,
                    isVisible: button.offsetParent !== null,
                    classes: button.className,
                    hasAvatar: button.querySelector('.chakra-avatar') !== null
                };
            })(),

            // Email Form Analysis
            emailForm: (() => {
                const input = document.querySelector('#email-input');
                const submitBtn = document.querySelector('.StyledEmbeddedButton-sc-e15d0508-6');
                if (!input) return null;
                return {
                    exists: true,
                    inputId: input.id,
                    placeholder: input.placeholder,
                    submitButton: {
                        exists: submitBtn !== null,
                        isEnabled: submitBtn ? !submitBtn.disabled : false,
                        text: submitBtn ? submitBtn.textContent : ''
                    }
                };
            })(),

            // OTP Input Analysis
            otpInputs: (() => {
                const inputs = document.querySelectorAll('input[name^="code-"]');
                return {
                    count: inputs.length,
                    names: Array.from(inputs).map(input => input.name),
                    isVisible: inputs.length > 0 && inputs[0].offsetParent !== null
                };
            })()
        };
    `);

    console.log('Page Elements Analysis:', JSON.stringify(elements, null, 2));
    return elements;
}

// Function to wait for page load
async function waitForPageLoad(driver) {
    console.log('Waiting for page to load completely...');
    const MAX_WAIT = 30000; // 30 seconds total wait time
    const CHECK_INTERVAL = 1000; // Check every second
    
    try {
        // First wait for basic page load
        await driver.wait(async function() {
            const readyState = await driver.executeScript('return document.readyState');
            console.log('Current page state:', readyState);
            return readyState === 'complete';
        }, MAX_WAIT, 'Page did not load completely');

        console.log('Basic page load complete, waiting for content...');

        // Then wait for actual content
        const startTime = Date.now();
        while (Date.now() - startTime < MAX_WAIT) {
            try {
                const pageContent = await driver.executeScript(`
                    return {
                        // Check for various page elements
                        hasBody: document.body !== null,
                        bodyContent: document.body.textContent.length,
                        buttons: document.querySelectorAll('button').length,
                        images: document.querySelectorAll('img').length,
                        // Check for specific elements
                        hasHeader: document.querySelector('header') !== null,
                        hasMain: document.querySelector('main') !== null,
                        hasLoginButton: document.querySelector('.chakra-button') !== null,
                        // Check for React/Next.js mounting
                        hasReactRoot: document.querySelector('#__next') !== null || 
                                    document.querySelector('#root') !== null,
                        // Check for specific dashboard elements
                        hasDashboardElements: document.querySelector('.chakra-stack') !== null
                    }
                `);

                console.log('Page content check:', pageContent);

                // Consider page loaded if we have enough content
                if (pageContent.bodyContent > 100 && 
                    (pageContent.buttons > 0 || pageContent.hasLoginButton)) {
                    console.log('Page content loaded successfully');
                    return true;
                }

                console.log('Content not ready, waiting...');
                await driver.sleep(CHECK_INTERVAL);
            } catch (error) {
                console.log('Error checking content, retrying:', error.message);
                await driver.sleep(CHECK_INTERVAL);
            }
        }

        // If we get here, throw timeout error
        throw new Error('Timeout waiting for page content to load');
    } catch (error) {
        console.error('Page load wait error:', error.message);
        
        // Log final page state for debugging
        try {
            const finalState = await driver.executeScript(`
                return {
                    url: window.location.href,
                    title: document.title,
                    bodyContent: document.body?.textContent?.length || 0,
                    html: document.documentElement.outerHTML
                }
            `);
            console.log('Final page state:', finalState);
        } catch (e) {
            console.error('Could not get final page state:', e.message);
        }
        
        throw error;
    }
}

// Function to wait for dashboard load
async function waitForDashboardLoad(driver) {
    console.log('Waiting for dashboard to load...');
    const MAX_WAIT = 30000;
    const CHECK_INTERVAL = 1000;
    
    const startTime = Date.now();
    while (Date.now() - startTime < MAX_WAIT) {
        try {
            const pageState = await driver.executeScript(`
                return {
                    url: window.location.href,
                    hasLoginButton: document.querySelector('.chakra-button.css-3nfgc7') !== null,
                    hasContent: document.body.textContent.length > 100,
                    isLoading: document.body.textContent.includes('Loading'),
                    elements: {
                        buttons: document.querySelectorAll('button').length,
                        images: document.querySelectorAll('img').length
                    }
                }
            `);
            
            console.log('Dashboard state:', pageState);
            
            if (pageState.hasLoginButton && !pageState.isLoading) {
                console.log('Dashboard loaded successfully');
                return true;
            }
            
            console.log('Dashboard still loading, waiting...');
            await driver.sleep(CHECK_INTERVAL);
        } catch (error) {
            console.log('Error checking dashboard:', error.message);
            await driver.sleep(CHECK_INTERVAL);
        }
    }
    throw new Error('Dashboard failed to load within timeout');
}

// Function to handle the entire login flow
async function handleLoginFlow(driver, email, otp = null) {
    console.log('\n=== Starting Login Flow ===');
    
    // First click Play Now on game.sapien.io
    console.log('Clicking Play Now button...');
    const playButton = await driver.findElement(By.css('.Hero_cta-button__oTOqM'));
    await playButton.click();
    
    // Get window handles
    const originalWindow = await driver.getWindowHandle();
    await driver.sleep(2000);
    const handles = await driver.getAllWindowHandles();
    
    // Switch to new tab
    const newWindow = handles.find(h => h !== originalWindow);
    if (!newWindow) {
        throw new Error('Dashboard tab not opened');
    }
    
    // Switch to new tab
    await driver.switchTo().window(newWindow);
    console.log('Switched to dashboard tab');
    
    // Wait for dashboard page with retry mechanism
    console.log('Waiting for dashboard to load...');
    let maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Wait for page load
            await driver.wait(async function() {
                const state = await driver.executeScript(`
                    return {
                        readyState: document.readyState,
                        hasLoginButton: document.querySelector('.chakra-button.css-3nfgc7') !== null,
                        buttonCount: document.querySelectorAll('button').length,
                        url: window.location.href
                    }
                `);
                console.log(`Attempt ${attempt} - Page state:`, state);
                return state.readyState === 'complete' && state.hasLoginButton;
            }, 10000);

            // If we get here, page loaded successfully
            console.log('Dashboard loaded successfully');
            break;
        } catch (error) {
            console.log(`Attempt ${attempt} failed:`, error.message);
            if (attempt === maxRetries) {
                throw new Error('Failed to load dashboard after multiple attempts');
            }
            // Refresh and wait before retry
            await driver.navigate().refresh();
            await driver.sleep(2000);
        }
    }

    // Find and click login/signup button
    console.log('Looking for login/signup button...');
    const loginButton = await driver.wait(
        until.elementLocated(By.css('.chakra-button.css-3nfgc7')),
        10000,
        'Login button not found'
    );

    // Ensure button is clickable
    await driver.executeScript(`
        const button = arguments[0];
        button.style.opacity = '1';
        button.style.visibility = 'visible';
        button.style.display = 'block';
        button.scrollIntoView({behavior: 'smooth', block: 'center'});
    `, loginButton);

    await driver.sleep(1000); // Wait for scroll

    // Try multiple click methods
    try {
        await loginButton.click();
    } catch (error) {
        console.log('Direct click failed, trying JavaScript click');
        await driver.executeScript('arguments[0].click()', loginButton);
    }
    console.log('Login/signup button clicked');

    // Wait for email input to appear
    console.log('Waiting for email input...');
    const emailInput = await driver.wait(
        until.elementLocated(By.css('#email-input')),
        5000,
        'Email input not found'
    );

    // Enter email
    await emailInput.clear();
    await emailInput.sendKeys(email);
    console.log('Email entered:', email);

    // Find and click submit button
    const submitButton = await driver.wait(
        until.elementLocated(By.css('.StyledEmbeddedButton-sc-e15d0508-6')),
        5000,
        'Submit button not found'
    );

    await driver.wait(
        until.elementIsEnabled(submitButton),
        5000,
        'Submit button never became enabled'
    );

    await submitButton.click();
    console.log('Submit button clicked');

    // Handle OTP if provided
    if (otp) {
        console.log('Entering OTP...');
        const otpInputs = await driver.wait(
            until.elementsLocated(By.css('input[name^="code-"]')),
            5000,
            'OTP inputs not found'
        );

        for (let i = 0; i < 6; i++) {
            await otpInputs[i].sendKeys(otp[i]);
            await driver.sleep(200);
        }
        console.log('OTP entered');
    }

    return {
        success: true,
        currentUrl: await driver.getCurrentUrl()
    };
}

// Main login-signup endpoint
app.post('/login-signup', async (req, res) => {
    let driver;
    try {
        const { email, otp } = req.body;
        if (!email) throw new Error('Email is required');

        // Setup driver with additional options
        const options = new chrome.Options()
            .addArguments('--no-sandbox')
            .addArguments('--headless')
            .addArguments('--disable-dev-shm-usage')
            .addArguments('--disable-gpu')
            .addArguments('--window-size=1920,1080')
            .addArguments('--disable-web-security')  // Allow cross-origin
            .addArguments('--allow-running-insecure-content')  // Allow mixed content
            .setBinaryPath(process.env.CHROME_BIN);

        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();

        // Set longer timeouts
        await driver.manage().setTimeouts({
            implicit: 30000,
            pageLoad: 30000,
            script: 30000
        });

        // Start from game.sapien.io
        await driver.get('https://game.sapien.io');
        console.log('Navigated to game.sapien.io');

        // Handle entire login flow
        const result = await handleLoginFlow(driver, email, otp);

        res.json({
            success: true,
            message: otp ? 'Login completed' : 'Email submitted',
            details: {
                email,
                step: otp ? 'completed' : 'awaiting_otp',
                ...result
            }
        });

    } catch (error) {
        console.error('\n=== Operation Failed ===');
        console.error('Error:', error);

        res.status(500).json({
            success: false,
            message: 'Login failed',
            details: {
                error: error.message,
                type: error.name
            }
        });
    } finally {
        if (driver) {
            await driver.quit();
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
}); 