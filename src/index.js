const express = require('express');
const cors = require('cors');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const app = express();
// Railway automatically sets PORT environment variable
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Middleware to set JSON headers
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
});

// Add a basic root endpoint for testing
app.get('/', (req, res) => {
    res.json({
        message: 'Railway server is running',
        timestamp: new Date().toISOString(),
        service: 'SapienWootz API'
    });
});

// Modified health check endpoint
app.get('/health', async (req, res) => {
    try {
        const endpoints = {
            game: await verifyEndpoint('https://game.sapien.io'),
            dashboard: await verifyEndpoint('https://app.sapien.io/t/dashboard'),
            railway: await verifyEndpoint('https://sapienwootz-anuj.railway.app')
        };

        res.json({
            status: Object.values(endpoints).every(e => e.exists) ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            port: PORT,
            env: process.env.NODE_ENV || 'development',
            message: 'Server is running',
            endpoints
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
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

// Function to create lightweight driver
async function createLightweightDriver() {
    const options = new chrome.Options()
        // Essential settings only
        .addArguments('--no-sandbox')
        .addArguments('--headless=new')
        .addArguments('--disable-dev-shm-usage')
        .addArguments('--disable-gpu')
        // Memory optimization
        .addArguments('--js-flags=--max-old-space-size=512') // Limit memory
        .addArguments('--single-process') // Use single process
        .addArguments('--disable-extensions')
        .addArguments('--disable-component-extensions-with-background-pages')
        // Reduce memory usage
        .addArguments('--disable-features=TranslateUI,BlinkGenPropertyTrees')
        .addArguments('--disable-site-isolation-trials')
        .addArguments('--disable-features=IsolateOrigins,site-per-process')
        // Essential window settings
        .addArguments('--window-size=800,600') // Smaller window size
        .setBinaryPath(process.env.CHROME_BIN);

    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

    // Set minimal timeouts
    await driver.manage().setTimeouts({
        implicit: 5000,
        pageLoad: 10000,
        script: 5000
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

// Function to analyze login button
async function findLoginButton(driver) {
    console.log('\n=== Starting Login Button Analysis ===');
    
    // Wait for initial page load
    await driver.sleep(3000);
    
    // First check URL and title
    const currentUrl = await driver.getCurrentUrl();
    const pageTitle = await driver.getTitle();
    console.log('Current URL:', currentUrl);
    console.log('Page Title:', pageTitle);
    
    // Get detailed page analysis
    const analysis = await driver.executeScript(`
        return {
            // Document State
            documentState: {
                readyState: document.readyState,
                documentElement: !!document.documentElement,
                hasBody: !!document.body,
                bodyChildren: document.body ? document.body.children.length : 0,
                url: window.location.href,
                title: document.title
            },

            // Button Analysis
            buttons: Array.from(document.querySelectorAll('button')).map(btn => ({
                text: btn.textContent?.trim(),
                className: btn.className,
                type: btn.type,
                isVisible: btn.offsetParent !== null,
                hasAvatar: btn.querySelector('.chakra-avatar') !== null,
                hasText: btn.querySelector('.chakra-text') !== null,
                dimensions: {
                    width: btn.offsetWidth,
                    height: btn.offsetHeight,
                    top: btn.offsetTop,
                    left: btn.offsetLeft
                },
                styles: {
                    display: window.getComputedStyle(btn).display,
                    visibility: window.getComputedStyle(btn).visibility,
                    opacity: window.getComputedStyle(btn).opacity,
                    position: window.getComputedStyle(btn).position
                },
                attributes: Array.from(btn.attributes).map(attr => ({
                    name: attr.name,
                    value: attr.value
                })),
                html: btn.outerHTML,
                parent: btn.parentElement ? {
                    tag: btn.parentElement.tagName,
                    class: btn.parentElement.className
                } : null
            })),
            
            // Stack Analysis
            stacks: Array.from(document.querySelectorAll('.chakra-stack')).map(stack => ({
                className: stack.className,
                hasButton: stack.querySelector('button') !== null,
                buttonCount: stack.querySelectorAll('button').length,
                dimensions: {
                    width: stack.offsetWidth,
                    height: stack.offsetHeight
                },
                children: Array.from(stack.children).map(child => ({
                    tag: child.tagName,
                    class: child.className,
                    isButton: child.tagName === 'BUTTON'
                })),
                html: stack.outerHTML
            })),
            
            // Specific Login Button Search
            loginButton: (() => {
                const searches = {
                    byExactClass: document.querySelector('.chakra-button.css-3nfgc7'),
                    byPartialClass: document.querySelector('[class*="chakra-button"]'),
                    byText: Array.from(document.querySelectorAll('button'))
                        .find(b => b.textContent?.includes('Log In')),
                    byStack: document.querySelector('.chakra-stack button'),
                    byAvatar: document.querySelector('button .chakra-avatar')?.closest('button')
                };

                // Log each search result
                const results = {};
                for (const [method, element] of Object.entries(searches)) {
                    results[method] = element ? {
                        found: true,
                        html: element.outerHTML,
                        visible: element.offsetParent !== null
                    } : {
                        found: false
                    };
                }

                return {
                    searchResults: results,
                    bestMatch: (() => {
                        const button = searches.byExactClass || 
                                     searches.byText || 
                                     searches.byStack ||
                                     searches.byAvatar;
                        if (!button) return null;
                        
                        return {
                            found: true,
                            method: searches.byExactClass ? 'exactClass' :
                                   searches.byText ? 'text' :
                                   searches.byStack ? 'stack' :
                                   'avatar',
                            element: {
                                className: button.className,
                                text: button.textContent?.trim(),
                                isVisible: button.offsetParent !== null,
                                hasAvatar: button.querySelector('.chakra-avatar') !== null,
                                dimensions: {
                                    width: button.offsetWidth,
                                    height: button.offsetHeight,
                                    top: button.offsetTop,
                                    left: button.offsetLeft
                                },
                                html: button.outerHTML
                            }
                        };
                    })()
                };
            })(),

            // Page Structure
            pageStructure: {
                totalElements: document.getElementsByTagName('*').length,
                iframes: document.getElementsByTagName('iframe').length,
                scripts: document.getElementsByTagName('script').length,
                loadingIndicators: document.querySelectorAll('[class*="loading"]').length,
                errorMessages: document.querySelectorAll('[class*="error"]').length
            }
        };
    `);
    
    console.log('\n=== Document State ===');
    console.log(JSON.stringify(analysis.documentState, null, 2));

    console.log('\n=== Button Count ===');
    console.log('Total buttons found:', analysis.buttons.length);

    console.log('\n=== Stack Analysis ===');
    console.log('Total stacks found:', analysis.stacks.length);
    
    console.log('\n=== Login Button Search Results ===');
    console.log(JSON.stringify(analysis.loginButton.searchResults, null, 2));

    console.log('\n=== Page Structure ===');
    console.log(JSON.stringify(analysis.pageStructure, null, 2));

    // If button not found, log all buttons for inspection
    if (!analysis.loginButton.bestMatch) {
        console.log('\n=== All Buttons Found ===');
        analysis.buttons.forEach((btn, index) => {
            console.log(`\nButton ${index + 1}:`);
            console.log(JSON.stringify(btn, null, 2));
        });
    }
    
    return analysis.loginButton.bestMatch;
}

// Function to verify endpoint status
async function verifyEndpoint(url) {
    console.log(`\n=== Verifying Endpoint: ${url} ===`);
    
    try {
        // Try using node-fetch or axios
        const https = require('https');
        
        return new Promise((resolve, reject) => {
            const options = {
                method: 'HEAD', // Use HEAD request first
                rejectUnauthorized: false, // Allow self-signed certificates
                timeout: 5000 // 5 second timeout
            };

            const req = https.request(url, options, (res) => {
                console.log('\nEndpoint Status:', {
                    statusCode: res.statusCode,
                    statusMessage: res.statusMessage,
                    headers: res.headers
                });

                // Check if endpoint is accessible
                if (res.statusCode >= 200 && res.statusCode < 400) {
                    resolve({
                        exists: true,
                        statusCode: res.statusCode,
                        headers: res.headers
                    });
                } else {
                    resolve({
                        exists: false,
                        statusCode: res.statusCode,
                        error: `Server returned ${res.statusCode}`
                    });
                }
            });

            req.on('error', (error) => {
                console.error('Endpoint verification failed:', {
                    message: error.message,
                    code: error.code,
                    stack: error.stack
                });
                
                resolve({
                    exists: false,
                    error: error.message,
                    code: error.code
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    exists: false,
                    error: 'Request timed out'
                });
            });

            req.end();
        });
    } catch (error) {
        console.error('Verification error:', error);
        return {
            exists: false,
            error: error.message
        };
    }
}

// Modified handleLoginFlow function
async function handleLoginFlow(driver, email, otp = null) {
    console.log('\n=== Starting Login Flow ===');
    
    try {
        // First verify the endpoints
        const gameEndpoint = await verifyEndpoint('https://game.sapien.io');
        console.log('Game endpoint status:', gameEndpoint);
        
        if (!gameEndpoint.exists) {
            throw new Error(`Game endpoint not accessible: ${gameEndpoint.error}`);
        }

        // Click Play Now with minimal wait
        console.log('Clicking Play Now button...');
        const playButton = await driver.findElement(By.css('.Hero_cta-button__oTOqM'));
        await playButton.click();
        
        // Verify dashboard endpoint before switching
        const dashboardEndpoint = await verifyEndpoint('https://app.sapien.io/t/dashboard');
        console.log('Dashboard endpoint status:', dashboardEndpoint);
        
        if (!dashboardEndpoint.exists) {
            throw new Error(`Dashboard endpoint not accessible: ${dashboardEndpoint.error}`);
        }

        // Handle new window
        const originalWindow = await driver.getWindowHandle();
        await driver.sleep(2000);
        const handles = await driver.getAllWindowHandles();
        const newWindow = handles.find(h => h !== originalWindow);
        
        if (!newWindow) {
            throw new Error('New window not opened');
        }
        
        // Switch to new window
        await driver.switchTo().window(newWindow);
        console.log('Switched to new window');
        
        // Find login button with analysis
        const loginButtonInfo = await findLoginButton(driver);
        
        if (!loginButtonInfo) {
            throw new Error('Could not find login button after analysis');
        }
        
        console.log('Found login button:', loginButtonInfo);
        
        // Try to click based on the found information
        let loginButton;
        if (loginButtonInfo.method === 'class') {
            loginButton = await driver.findElement(By.css(`.${loginButtonInfo.element.className.split(' ').join('.')}`));
        } else if (loginButtonInfo.method === 'text') {
            loginButton = await driver.findElement(By.xpath(`//button[contains(., '${loginButtonInfo.element.text}')]`));
        } else {
            loginButton = await driver.findElement(By.css('.chakra-stack button'));
        }
        
        // Click the button
        await driver.executeScript(`
            const button = arguments[0];
            button.scrollIntoView({behavior: 'instant', block: 'center'});
            setTimeout(() => button.click(), 100);
        `, loginButton);
        
        // Wait for email input
        const emailInput = await driver.wait(
            until.elementLocated(By.css('#email-input')),
            5000,
            'Email input not found'
        );
        
        // Enter email
        await emailInput.sendKeys(email);
        
        // Click submit
        const submitButton = await driver.findElement(By.css('.StyledEmbeddedButton-sc-e15d0508-6'));
        await submitButton.click();
        
        // Handle OTP if provided
        if (otp) {
            const otpInputs = await driver.wait(
                until.elementsLocated(By.css('input[name^="code-"]')),
                5000
            );
            
            for (let i = 0; i < otp.length; i++) {
                await otpInputs[i].sendKeys(otp[i]);
            }
        }
        
        return {
            success: true,
            currentUrl: await driver.getCurrentUrl()
        };
        
    } catch (error) {
        console.error('Login flow error:', error);
        throw error;
    }
}

// Modified endpoint
app.post('/login-signup', async (req, res) => {
    let driver;
    try {
        const { email, otp } = req.body;
        if (!email) throw new Error('Email is required');

        // Create lightweight driver
        driver = await createLightweightDriver();

        // Navigate to start page
        await driver.get('https://game.sapien.io');
        
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
                step: 'Login flow'
            }
        });
    } finally {
        if (driver) {
            try {
                await driver.quit();
            } catch (error) {
                console.error('Error closing driver:', error);
            }
        }
    }
});

// Add a debug endpoint
app.get('/debug', (req, res) => {
    res.json({
        status: 'running',
        timestamp: new Date().toISOString(),
        serverInfo: {
            port: PORT,
            env: process.env.NODE_ENV || 'development',
            nodeVersion: process.version,
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime()
        },
        headers: req.headers
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        status: 'error',
        message: err.message,
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Not Found',
        path: req.path,
        timestamp: new Date().toISOString()
    });
});

// Modified listen with better logging
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=== Server Information ===`);
    console.log(`Server running on port: ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Health check: https://sapienwootz-anuj.railway.app/health`);
}); 