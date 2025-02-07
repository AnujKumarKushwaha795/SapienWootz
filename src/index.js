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

// Function to find and click login/signup button
async function clickLoginSignup(driver) {
    console.log('Looking for Login/Signup button...');
    try {
        // Wait for button using multiple selectors
        const loginButton = await driver.wait(
            until.elementLocated(By.css('.chakra-button.css-3nfgc7')), // Updated selector
            5000
        );
        
        // Log button state before clicking
        const buttonState = await driver.executeScript(`
            const button = arguments[0];
            return {
                isVisible: button.offsetWidth > 0 && button.offsetHeight > 0,
                isEnabled: !button.disabled,
                text: button.textContent,
                position: button.getBoundingClientRect()
            }
        `, loginButton);
        console.log('Found button:', buttonState);

        // Click the button
        await loginButton.click();
        console.log('Login/Signup button clicked');
        
        // Wait for email form to appear
        const emailInput = await driver.wait(
            until.elementLocated(By.css('#email-input')),
            5000
        );
        
        // Verify email input is visible
        const isVisible = await emailInput.isDisplayed();
        console.log('Email input visible:', isVisible);
        
        return true;
    } catch (error) {
        console.error('Failed to click Login/Signup button:', error.message);
        throw error;
    }
}

// Function to handle email input and submit
async function submitEmail(driver, email) {
    console.log('Handling email submission...');
    try {
        // Wait for and find email input
        const emailInput = await driver.wait(
            until.elementLocated(By.css('#email-input')),
            5000
        );
        
        // Clear and type email
        await emailInput.clear();
        await emailInput.sendKeys(email);
        console.log('Email entered:', email);

        // Find submit button
        const submitButton = await driver.findElement(
            By.css('button.StyledEmbeddedButton-sc-e15d0508-6')
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

        // Wait for OTP input to appear
        const otpInput = await driver.wait(
            until.elementLocated(By.css('input[name="code-0"]')),
            5000
        );
        
        return await otpInput.isDisplayed();
    } catch (error) {
        console.error('Email submission failed:', error.message);
        throw error;
    }
}

// Function to enter OTP
async function enterOTP(driver, otp) {
    console.log('Entering OTP...');
    try {
        // Wait for all OTP inputs
        const otpInputs = await driver.wait(
            until.elementsLocated(By.css('input[name^="code-"]')),
            5000
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

        // Wait for verification
        await driver.sleep(2000);
        
        // Check if we're redirected or OTP inputs are gone
        try {
            await driver.wait(
                until.stalenessOf(otpInputs[0]),
                5000,
                'OTP verification did not complete'
            );
        } catch (error) {
            console.log('Waiting for OTP verification...');
        }

        return true;
    } catch (error) {
        console.error('OTP entry failed:', error.message);
        throw error;
    }
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
        console.log('Timestamp:', new Date().toISOString());
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
        console.log('Navigating to dashboard...');
        await driver.get('https://app.sapien.io/t/dashboard');
        
        // Click login/signup button
        await clickLoginSignup(driver);
        
        // Submit email
        const emailSubmitted = await submitEmail(driver, email);
        
        // If OTP is provided, enter it
        if (otp && emailSubmitted) {
            const otpEntered = await enterOTP(driver, otp);
            if (otpEntered) {
                console.log('Login/Signup completed successfully');
            }
        }

        // Get final state
        const currentUrl = await driver.getCurrentUrl();
        const pageTitle = await driver.getTitle();
        
        res.json({
            success: true,
            message: otp ? 'Login/Signup completed' : 'Email submitted, waiting for OTP',
            details: {
                email,
                step: otp ? 'completed' : 'awaiting_otp',
                currentUrl,
                pageTitle,
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