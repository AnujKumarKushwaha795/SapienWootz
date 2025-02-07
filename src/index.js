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
        
        console.log('\nAttempting click with full context...');
        await driver.executeScript(`
            const button = arguments[0];
            
            // Log pre-click state
            console.log('Pre-click button state:', {
                focused: document.activeElement === button,
                visible: button.offsetParent !== null,
                clickable: getComputedStyle(button).pointerEvents !== 'none'
            });
            
            // Attempt click
            button.click();
            
            // Log post-click state
            console.log('Post-click state:', {
                url: window.location.href,
                changed: window.location.href !== 'https://game.sapien.io/'
            });
        `, button);

        const finalUrl = await driver.getCurrentUrl();
        console.log('\nFinal URL:', finalUrl);

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