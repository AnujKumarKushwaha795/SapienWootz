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

// Modified clickLoginSignup function
async function clickLoginSignup(driver) {
    console.log('\n=== Clicking Login/Signup Button ===');
    
    // Wait for complete page load
    await waitForPageLoad(driver);
    
    // Verify dashboard content loaded
    const dashboardContent = await driver.executeScript(`
        return {
            buttons: document.querySelectorAll('button').length,
            images: document.querySelectorAll('img').length,
            text: document.body.textContent.length
        }
    `);
    console.log('Dashboard content:', dashboardContent);

    if (dashboardContent.buttons === 0) {
        console.log('Page seems empty, waiting longer...');
        await driver.sleep(5000); // Wait additional time if content not loaded
    }

    // Multiple selectors to try with proper wait
    const selectors = [
        '.chakra-button.css-3nfgc7',
        '.chakra-stack button',
        '.chakra-stack .chakra-button',
        'button:has(.chakra-text)',
        '//button[.//p[contains(text(), "Log In / Sign Up")]]',
        '//button[contains(@class, "chakra-button")]'
    ];

    let button = null;
    for (const selector of selectors) {
        try {
            // Wait for each selector with timeout
            if (selector.startsWith('//')) {
                await driver.wait(
                    until.elementLocated(By.xpath(selector)),
                    5000
                );
                button = await driver.findElement(By.xpath(selector));
            } else {
                await driver.wait(
                    until.elementLocated(By.css(selector)),
                    5000
                );
                button = await driver.findElement(By.css(selector));
            }
            
            // Check if button is visible and clickable
            if (button && await button.isDisplayed()) {
                const isClickable = await driver.executeScript(`
                    const btn = arguments[0];
                    const rect = btn.getBoundingClientRect();
                    const style = window.getComputedStyle(btn);
                    return rect.width > 0 && 
                           rect.height > 0 && 
                           style.display !== 'none' && 
                           style.visibility !== 'hidden' &&
                           style.opacity !== '0';
                `, button);
                
                if (isClickable) {
                    console.log('Found clickable button with selector:', selector);
                    break;
                }
            }
            button = null; // Reset if not clickable
        } catch (err) {
            console.log('Selector failed:', selector, err.message);
        }
    }

    if (!button) {
        // Log page state for debugging
        const pageState = await driver.executeScript(`
            return {
                buttons: Array.from(document.querySelectorAll('button')).map(b => ({
                    text: b.textContent,
                    classes: b.className,
                    isVisible: b.offsetParent !== null,
                    rect: b.getBoundingClientRect()
                })),
                html: document.body.innerHTML
            }
        `);
        console.log('Page state:', JSON.stringify(pageState, null, 2));
        throw new Error('Login/Signup button not found after trying all selectors');
    }

    // Scroll button into view
    await driver.executeScript('arguments[0].scrollIntoView({block: "center"});', button);
    await driver.sleep(500);

    // Make button clickable
    await driver.executeScript(`
        const button = arguments[0];
        button.style.position = 'relative';
        button.style.zIndex = '9999';
        button.style.opacity = '1';
        button.style.pointerEvents = 'auto';
        button.style.display = 'block';
        button.style.visibility = 'visible';
    `, button);

    // Click the button
    try {
        await button.click();
        console.log('Button clicked via WebDriver');
    } catch (error) {
        console.log('WebDriver click failed, trying JavaScript click');
        await driver.executeScript('arguments[0].click()', button);
    }
    
    console.log('Login/Signup button clicked');

    // Verify email input appears
    try {
        await driver.wait(
            until.elementLocated(By.css('#email-input')),
            5000,
            'Email input did not appear after clicking login button'
        );
        console.log('Email input appeared successfully');
    } catch (error) {
        console.error('Email input verification failed:', error.message);
        throw error;
    }
}

// Function to handle email submission
async function submitEmail(driver, email) {
    console.log('\n=== Submitting Email ===');

    // Wait for and find email input
    const emailInput = await driver.wait(
        until.elementLocated(By.css('#email-input')),
        5000,
        'Email input not found'
    );

    // Clear and type email
    await emailInput.clear();
    await emailInput.sendKeys(email);
    console.log('Email entered:', email);

    // Find submit button and wait for it to be enabled
    const submitButton = await driver.wait(
        until.elementLocated(By.css('.StyledEmbeddedButton-sc-e15d0508-6')),
        5000,
        'Submit button not found'
    );

    // Wait for button to be enabled
    await driver.wait(
        until.elementIsEnabled(submitButton),
        5000,
        'Submit button never became enabled'
    );

    // Click submit
    await submitButton.click();
    console.log('Submit button clicked');

    // Wait for OTP inputs to appear
    await driver.wait(
        until.elementLocated(By.css('input[name="code-0"]')),
        5000,
        'OTP input did not appear after submitting email'
    );
}

// Function to enter OTP
async function enterOTP(driver, otp) {
    console.log('\n=== Entering OTP ===');

    // Wait for all OTP inputs
    const otpInputs = await driver.wait(
        until.elementsLocated(By.css('input[name^="code-"]')),
        5000,
        'OTP inputs not found'
    );

    // Verify we have all 6 inputs
    if (otpInputs.length !== 6) {
        throw new Error(`Expected 6 OTP inputs, found ${otpInputs.length}`);
    }

    // Enter each digit
    for (let i = 0; i < 6; i++) {
        await otpInputs[i].clear();
        await otpInputs[i].sendKeys(otp[i]);
        await driver.sleep(200);
    }

    console.log('OTP entered successfully');
    await driver.sleep(2000); // Wait for verification
}

// Main login/signup endpoint
app.post('/login-signup', async (req, res) => {
    let driver;
    try {
        const { email, otp } = req.body;
        
        // Validate inputs
        if (!email) {
            throw new Error('Email is required');
        }

        console.log('\n=== Starting Login/Signup Process ===');
        console.log('Email:', email);
        console.log('OTP Present:', !!otp);

        // Setup driver with longer timeouts
        const options = new chrome.Options()
            .addArguments('--no-sandbox')
            .addArguments('--headless')
            .addArguments('--disable-dev-shm-usage')
            .addArguments('--disable-gpu')
            .addArguments('--window-size=1920,1080')
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

        // Navigate to dashboard with enhanced retry logic
        let maxRetries = 5; // Increased retries
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`\nNavigation attempt ${attempt}/${maxRetries}`);
                
                // Clear cache and cookies on retry
                if (attempt > 1) {
                    await driver.manage().deleteAllCookies();
                    await driver.executeScript('window.localStorage.clear(); window.sessionStorage.clear();');
                }

                // Navigate to the page
                await driver.get('https://app.sapien.io/t/dashboard');
                console.log('Initial navigation complete');

                // Wait for page load with increased timeout
                await waitForPageLoad(driver);
                console.log('Page loaded successfully');
                break;
            } catch (error) {
                lastError = error;
                console.log(`Navigation attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    throw new Error(`Failed to load page after ${maxRetries} attempts: ${error.message}`);
                }
                
                // Exponential backoff
                const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000);
                console.log(`Waiting ${waitTime}ms before retry...`);
                await driver.sleep(waitTime);
            }
        }

        // Analyze page elements
        const analysis = await analyzePageElements(driver);
        console.log('Initial page analysis complete');

        // Execute login flow
        await clickLoginSignup(driver);
        console.log('Login/Signup button clicked successfully');

        await submitEmail(driver, email);
        console.log('Email submitted successfully');

        if (otp) {
            await enterOTP(driver, otp);
            console.log('OTP entered successfully');
        }

        // Get final state
        const finalAnalysis = await analyzePageElements(driver);
        
        res.json({
            success: true,
            message: otp ? 'Login/Signup completed' : 'Email submitted, waiting for OTP',
            details: {
                email,
                step: otp ? 'completed' : 'awaiting_otp',
                initialAnalysis: analysis,
                finalAnalysis,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('\n=== Operation Failed ===');
        console.error('Error:', error);

        res.status(500).json({
            success: false,
            message: 'Login/Signup failed',
            details: {
                error: error.message,
                type: error.name,
                step: error.message.includes('Login/Signup button') ? 'Finding login button' :
                      error.message.includes('email') ? 'Email submission' :
                      error.message.includes('OTP') ? 'OTP verification' :
                      'Unknown error'
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