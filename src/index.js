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

// Function to click login/signup button
async function clickLoginSignup(driver) {
    console.log('\n=== Clicking Login/Signup Button ===');
    
    // Wait for page load and React render
    await driver.sleep(2000); // Give React time to render
    
    // Wait for any loading indicators to disappear
    try {
        await driver.wait(
            until.elementLocated(By.css('body')),
            5000,
            'Page body not found'
        );
    } catch (error) {
        console.log('Page load wait error:', error.message);
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

        // Setup driver
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

        // Navigate to dashboard
        await driver.get('https://app.sapien.io/t/dashboard');
        
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