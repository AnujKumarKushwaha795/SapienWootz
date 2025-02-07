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

// Function to create driver with proper security settings
async function createSecureDriver() {
    const options = new chrome.Options()
        .addArguments('--no-sandbox')
        .addArguments('--headless')
        .addArguments('--disable-dev-shm-usage')
        .addArguments('--disable-gpu')
        .addArguments('--window-size=1920,1080')
        // Security and permission settings
        .addArguments('--disable-web-security')
        .addArguments('--allow-running-insecure-content')
        .addArguments('--ignore-certificate-errors')
        .addArguments('--ignore-ssl-errors')
        .addArguments('--allow-insecure-localhost')
        // Additional settings to bypass restrictions
        .addArguments('--disable-blink-features=AutomationControlled')
        .addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        .setBinaryPath(process.env.CHROME_BIN);

    // Set CDP options to enable permissions
    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

    // Set permissions and bypass security
    await driver.executeScript(`
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
    `);

    // Set longer timeouts
    await driver.manage().setTimeouts({
        implicit: 30000,
        pageLoad: 30000,
        script: 30000
    });

    return driver;
}

// Function to verify page access
async function verifyPageAccess(driver, url) {
    console.log(`\nVerifying access to ${url}...`);
    
    try {
        // First, check if we can make a basic request
        await driver.executeScript(`
            return fetch('${url}', {
                method: 'HEAD',
                mode: 'no-cors'
            });
        `);

        // Check for security headers and restrictions
        const securityInfo = await driver.executeScript(`
            return {
                cookies: document.cookie,
                localStorage: Object.keys(localStorage),
                sessionStorage: Object.keys(sessionStorage),
                origin: window.location.origin,
                permissions: {
                    cookies: navigator.cookieEnabled,
                    javascript: typeof window.chrome !== 'undefined',
                    userAgent: navigator.userAgent
                },
                headers: (() => {
                    try {
                        return fetch('${url}').then(r => {
                            let headers = {};
                            r.headers.forEach((v, k) => headers[k] = v);
                            return headers;
                        });
                    } catch(e) {
                        return null;
                    }
                })()
            }
        `);
        console.log('Security Info:', securityInfo);

        return true;
    } catch (error) {
        console.error('Access verification failed:', error.message);
        return false;
    }
}

// Function to safely interact with button
async function safeButtonClick(driver, button) {
    console.log('Attempting safe button click...');
    
    // First ensure the page is stable
    await driver.sleep(2000);
    
    // Get button info before clicking
    const buttonInfo = await driver.executeScript(`
        const btn = arguments[0];
        return {
            text: btn.textContent,
            class: btn.className,
            isVisible: btn.offsetParent !== null,
            rect: btn.getBoundingClientRect(),
            zIndex: window.getComputedStyle(btn).zIndex,
            position: window.getComputedStyle(btn).position
        }
    `, button);
    console.log('Button info:', buttonInfo);

    // Ensure button is in viewport
    await driver.executeScript(`
        const btn = arguments[0];
        const rect = btn.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
            btn.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
    `, button);
    
    // Wait for any scrolling to finish
    await driver.sleep(1000);

    // Try multiple click methods
    const clickMethods = [
        // Method 1: Standard click
        async () => {
            console.log('Trying standard click...');
            await button.click();
        },
        // Method 2: JavaScript click
        async () => {
            console.log('Trying JavaScript click...');
            await driver.executeScript('arguments[0].click()', button);
        },
        // Method 3: Move and click
        async () => {
            console.log('Trying move and click...');
            const actions = driver.actions({async: true});
            await actions
                .move({origin: button})
                .pause(500)
                .click()
                .perform();
        },
        // Method 4: Dispatch click event
        async () => {
            console.log('Trying click event dispatch...');
            await driver.executeScript(`
                const btn = arguments[0];
                const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });
                btn.dispatchEvent(clickEvent);
            `, button);
        }
    ];

    let lastError = null;
    for (const method of clickMethods) {
        try {
            await method();
            // Wait to see if click worked
            await driver.sleep(1000);
            
            // Check if new elements appeared (indicating successful click)
            const newElements = await driver.executeScript(`
                return {
                    hasEmailInput: document.querySelector('#email-input') !== null,
                    hasPopup: document.querySelector('.chakra-modal__content') !== null,
                    newButtons: document.querySelectorAll('button').length
                }
            `);
            
            if (newElements.hasEmailInput || newElements.hasPopup) {
                console.log('Click successful!');
                return true;
            }
        } catch (error) {
            console.log('Click method failed:', error.message);
            lastError = error;
            // Wait before trying next method
            await driver.sleep(1000);
        }
    }

    throw lastError || new Error('All click methods failed');
}

// Modified handleLoginFlow function
async function handleLoginFlow(driver, email, otp = null) {
    console.log('\n=== Starting Login Flow ===');
    
    // First verify access to game.sapien.io
    const hasAccess = await verifyPageAccess(driver, 'https://game.sapien.io');
    if (!hasAccess) {
        throw new Error('Cannot access game.sapien.io - Access restricted');
    }

    // Click Play Now button
    console.log('Clicking Play Now button...');
    const playButton = await driver.findElement(By.css('.Hero_cta-button__oTOqM'));
    await playButton.click();
    
    // Get window handles and verify new tab
    const originalWindow = await driver.getWindowHandle();
    await driver.sleep(2000);
    const handles = await driver.getAllWindowHandles();
    
    if (handles.length < 2) {
        throw new Error('New tab not opened - Possible popup blocker or permission issue');
    }

    // Switch to new tab with verification
    const newWindow = handles.find(h => h !== originalWindow);
    await driver.switchTo().window(newWindow);
    console.log('Switched to dashboard tab');

    // Verify dashboard access
    const hasDashboardAccess = await verifyPageAccess(driver, 'https://app.sapien.io/t/dashboard');
    if (!hasDashboardAccess) {
        throw new Error('Cannot access dashboard - Access restricted');
    }

    // Wait for page load with security checks
    await driver.wait(async function() {
        const state = await driver.executeScript(`
            return {
                loaded: document.readyState === 'complete',
                blocked: document.title.includes('403') || 
                         document.title.includes('Forbidden') ||
                         document.title.includes('Access Denied'),
                error: document.querySelector('pre')?.textContent,
                url: window.location.href,
                content: {
                    body: document.body?.innerHTML.length,
                    title: document.title,
                    scripts: document.scripts.length
                }
            }
        `);
        console.log('Load state:', state);
        
        if (state.blocked) {
            throw new Error(`Access blocked: ${state.error || 'Unknown reason'}`);
        }
        
        return state.loaded && state.content.body > 100;
    }, 20000, 'Dashboard failed to load');

    // Approach 1: Wait for network idle
    await driver.executeScript(`
        window.networkRequests = 0;
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            window.networkRequests++;
            try {
                const response = await originalFetch.apply(this, args);
                return response;
            } finally {
                window.networkRequests--;
            }
        };
    `);

    // Wait for initial load
    await driver.sleep(5000);

    // Try multiple approaches to find the login button
    console.log('Trying multiple approaches to find login button...');
    
    const buttonSelectors = [
        '.chakra-button.css-3nfgc7',
        'button.chakra-button',
        '.chakra-stack button',
        'button:has(.chakra-text)',
        'button:has(img[alt*="avatar"])',
        '//button[contains(@class, "chakra-button")]',
        '//button[.//p[contains(text(), "Log In")]]',
        '//button[.//span[contains(@class, "chakra-avatar")]]'
    ];

    let loginButton = null;
    let attempt = 0;
    const maxAttempts = 10;

    while (!loginButton && attempt < maxAttempts) {
        attempt++;
        console.log(`\nAttempt ${attempt}/${maxAttempts} to find login button`);

        try {
            // Check page state
            const pageState = await driver.executeScript(`
                return {
                    url: window.location.href,
                    readyState: document.readyState,
                    networkRequests: window.networkRequests || 0,
                    bodyLength: document.body.innerHTML.length,
                    buttons: Array.from(document.querySelectorAll('button')).map(b => ({
                        text: b.textContent,
                        class: b.className,
                        visible: b.offsetParent !== null
                    }))
                }
            `);
            console.log('Page state:', pageState);

            // Try each selector
            for (const selector of buttonSelectors) {
                try {
                    if (selector.startsWith('//')) {
                        loginButton = await driver.findElement(By.xpath(selector));
                    } else {
                        loginButton = await driver.findElement(By.css(selector));
                    }
                    
                    // Verify button is actually visible
                    const isVisible = await loginButton.isDisplayed();
                    const isEnabled = await loginButton.isEnabled();
                    
                    if (isVisible && isEnabled) {
                        console.log(`Found button with selector: ${selector}`);
                        break;
                    } else {
                        loginButton = null;
                    }
                } catch (err) {
                    // Continue to next selector
                }
            }

            if (loginButton) break;

            // If button not found, try different strategies
            if (attempt % 3 === 0) {
                console.log('Refreshing page...');
                await driver.navigate().refresh();
                await driver.sleep(5000);
            } else if (attempt % 3 === 1) {
                console.log('Scrolling page...');
                await driver.executeScript('window.scrollTo(0, document.body.scrollHeight/2);');
                await driver.sleep(2000);
            } else {
                console.log('Waiting for more content to load...');
                await driver.sleep(3000);
            }

        } catch (error) {
            console.log(`Attempt ${attempt} failed:`, error.message);
            await driver.sleep(2000);
        }
    }

    if (!loginButton) {
        // Log final page state for debugging
        const finalState = await driver.executeScript(`
            return {
                html: document.documentElement.outerHTML,
                scripts: Array.from(document.scripts).map(s => s.src),
                styles: Array.from(document.styleSheets).map(s => s.href),
                buttons: Array.from(document.querySelectorAll('button')).length
            }
        `);
        console.log('Final page state:', finalState);
        throw new Error('Could not find login button after multiple attempts');
    }

    // Try to click the button safely
    await safeButtonClick(driver, loginButton);
    console.log('Login button clicked successfully');

    // Wait for email input with verification
    const emailInput = await driver.wait(
        until.elementLocated(By.css('#email-input')),
        10000,
        'Email input not found after clicking login button'
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

// Modified endpoint
app.post('/login-signup', async (req, res) => {
    let driver;
    try {
        const { email, otp } = req.body;
        if (!email) throw new Error('Email is required');

        // Create secure driver
        driver = await createSecureDriver();

        // Start from game.sapien.io with verification
        await driver.get('https://game.sapien.io');
        console.log('Navigated to game.sapien.io');

        // Handle login flow
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
                type: error.name,
                step: error.message.includes('access') ? 'Access verification' :
                      error.message.includes('tab') ? 'New tab handling' :
                      error.message.includes('dashboard') ? 'Dashboard loading' :
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