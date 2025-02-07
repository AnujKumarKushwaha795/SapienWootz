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

        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();

        // Navigate to the page
        console.log('Navigating to game.sapien.io...');
        await driver.get('https://game.sapien.io/');
        
        // Analyze page access and button state
        const pageAnalysis = await driver.executeScript(`
            return {
                // Page Access
                url: window.location.href,
                readyState: document.readyState,
                hasAccess: document.documentElement !== null,
                
                // Button Search
                buttonsByTag: document.getElementsByTagName('button').length,
                buttonsByClass: document.querySelector('.Hero_cta-button__oTOqM') !== null,
                buttonsByText: Array.from(document.getElementsByTagName('button'))
                    .map(b => ({text: b.textContent.trim(), visible: b.offsetParent !== null})),
                
                // Security Checks
                isCorsEnabled: document.location.origin === 'https://game.sapien.io',
                hasFrames: window.top !== window.self,
                
                // Event Listeners
                hasClickHandlers: typeof document.onclick === 'function' || 
                                typeof document.addEventListener === 'function',
                
                // Page Structure
                bodyContent: document.body.innerHTML.length,
                scripts: document.scripts.length,
                
                // Button Environment
                playButton: (() => {
                    const btn = document.querySelector('.Hero_cta-button__oTOqM');
                    if (!btn) return null;
                    return {
                        exists: true,
                        isVisible: btn.offsetParent !== null,
                        isEnabled: !btn.disabled,
                        hasClickHandler: btn.onclick !== null,
                        styles: {
                            display: getComputedStyle(btn).display,
                            visibility: getComputedStyle(btn).visibility,
                            pointerEvents: getComputedStyle(btn).pointerEvents,
                            zIndex: getComputedStyle(btn).zIndex,
                            position: getComputedStyle(btn).position
                        },
                        rect: btn.getBoundingClientRect(),
                        parent: {
                            tag: btn.parentElement.tagName,
                            id: btn.parentElement.id,
                            classes: btn.parentElement.className
                        }
                    };
                })()
            };
        `);

        console.log('\nPage Analysis:', JSON.stringify(pageAnalysis, null, 2));

        // Try to find any click handlers
        const clickHandlers = await driver.executeScript(`
            const button = document.querySelector('.Hero_cta-button__oTOqM');
            if (!button) return 'Button not found';
            
            // Get all event listeners
            const listeners = [];
            const clone = button.cloneNode(true);
            
            // Check onclick attribute
            if (button.onclick) listeners.push('onclick attribute');
            
            // Check parent handlers
            let parent = button.parentElement;
            while (parent) {
                if (parent.onclick) listeners.push('parent onclick');
                parent = parent.parentElement;
            }
            
            // Check if button has href-like behavior
            const hasHref = button.getAttribute('href') || 
                          button.closest('a') ||
                          button.dataset.href;
            
            return {
                directHandlers: listeners,
                hasHref: !!hasHref,
                buttonHTML: button.outerHTML,
                parentChain: (() => {
                    const chain = [];
                    let el = button;
                    while (el && el.tagName !== 'BODY') {
                        chain.push({
                            tag: el.tagName,
                            id: el.id,
                            classes: el.className
                        });
                        el = el.parentElement;
                    }
                    return chain;
                })()
            };
        `);

        console.log('\nClick Handler Analysis:', JSON.stringify(clickHandlers, null, 2));

        // Try to intercept navigation
        await driver.executeScript(`
            window.addEventListener('beforeunload', function(e) {
                console.log('Navigation attempted to:', document.activeElement);
            });
            
            // Monitor all link clicks
            document.addEventListener('click', function(e) {
                console.log('Click detected on:', e.target);
                console.log('Target href:', e.target.href);
            }, true);
        `);

        // Now try to click with this information
        const button = await driver.findElement(By.css('.Hero_cta-button__oTOqM'));
        
        console.log('\nAttempting to capture and replicate click behavior...');

        // First, inject a click monitor
        await driver.executeScript(`
            window._clickData = null;
            document.addEventListener('click', function(e) {
                window._clickData = {
                    target: e.target.outerHTML,
                    x: e.clientX,
                    y: e.clientY,
                    timestamp: Date.now(),
                    defaultPrevented: e.defaultPrevented,
                    path: e.composedPath().map(el => ({
                        tag: el.tagName,
                        id: el.id,
                        class: el.className
                    }))
                };
            }, true);
        `);

        // Try clicking the button with Actions API
        const actions = driver.actions({async: true});
        
        // Get button location
        const rect = await button.getRect();
        const centerX = rect.x + rect.width/2;
        const centerY = rect.y + rect.height/2;

        // Move to button center and click
        await actions
            .move({x: Math.floor(centerX), y: Math.floor(centerY)})
            .pause(500)
            .press()
            .pause(100)
            .release()
            .perform();

        await driver.sleep(1000);

        // Get click data
        const clickData = await driver.executeScript('return window._clickData;');
        console.log('\nClick Data:', clickData);

        // Try to replicate the exact click behavior
        if (clickData) {
            await driver.executeScript(`
                const button = arguments[0];
                const clickData = arguments[1];

                // Create a precise click event
                const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX: clickData.x,
                    clientY: clickData.y,
                    screenX: clickData.x,
                    screenY: clickData.y,
                    button: 0,
                    buttons: 1
                });

                // Dispatch event on the exact same element that received the original click
                const targetElement = document.querySelector('.Hero_cta-button__oTOqM');
                targetElement.dispatchEvent(clickEvent);

                // Also try clicking any parent elements that might have handlers
                clickData.path.forEach(element => {
                    const el = document.querySelector(
                        element.id ? '#' + element.id : 
                        element.class ? '.' + element.class.split(' ')[0] : 
                        element.tag
                    );
                    if (el) el.click();
                });
            `, button, clickData);
        }

        await driver.sleep(2000);
        
        // Check if URL changed
        const newUrl = await driver.getCurrentUrl();
        console.log('URL after click:', newUrl);

        // If still on same page, try to find the actual click handler
        if (newUrl === 'https://game.sapien.io/') {
            const buttonProps = await driver.executeScript(`
                const button = arguments[0];
                const props = {};
                for (let key in button) {
                    if (key.startsWith('__reactProps$')) {
                        props.reactProps = button[key];
                    }
                    if (key.startsWith('__reactEventHandlers$')) {
                        props.reactHandlers = button[key];
                    }
                }
                return props;
            `, button);

            console.log('\nButton React Properties:', buttonProps);

            // Try to execute any found handlers
            if (buttonProps.reactHandlers?.onClick) {
                await driver.executeScript(`
                    const handlers = arguments[0];
                    if (handlers.onClick) handlers.onClick();
                `, buttonProps.reactHandlers);
            }
        }

        await driver.sleep(2000);
        const finalUrl = await driver.getCurrentUrl();
        console.log('Final URL:', finalUrl);

        res.json({
            success: true,
            message: 'Analysis complete',
            details: {
                pageAnalysis,
                clickHandlers,
                finalUrl,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('\n=== Operation Failed ===');
        console.error('Detailed Error:', {
            message: error.message,
            type: error.name,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            message: 'Operation failed',
            details: {
                error: error.message,
                type: error.name,
                step: 'Analysis phase'
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