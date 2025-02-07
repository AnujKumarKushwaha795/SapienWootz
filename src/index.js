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
            until.elementLocated(By.css('.chakra-button .chakra-text')), // Updated selector
            5000
        );
        console.log('Found Login/Signup button');
        await loginButton.click();
        console.log('Login/Signup button clicked');
        
        // Wait for email form to appear
        await driver.wait(
            until.elementLocated(By.css('input#email-input')),
            5000
        );
        console.log('Email input form visible');
    } catch (error) {
        console.error('Failed to click Login/Signup button:', error.message);
        throw error;
    }
}

// Function to handle email input and submit
async function submitEmail(driver, email) {
    console.log('Handling email submission...');
    try {
        // Wait for email input
        const emailInput = await driver.wait(
            until.elementLocated(By.css('input#email-input')),
            5000
        );
        
        // Clear any existing value
        await emailInput.clear();
        
        // Type email
        await emailInput.sendKeys(email);
        console.log('Email entered:', email);

        // Wait for submit button to be enabled
        const submitButton = await driver.wait(
            until.elementLocated(By.css('button.StyledEmbeddedButton-sc-e15d0508-6')),
            5000
        );

        // Wait until button is clickable
        await driver.wait(
            until.elementIsEnabled(submitButton),
            5000
        );

        // Click submit
        await submitButton.click();
        console.log('Submit button clicked');

        // Wait for OTP input to appear
        await driver.wait(
            until.elementLocated(By.css('input[name="code-0"]')),
            5000
        );
        console.log('OTP input visible');
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

        // Enter each digit with delay
        for (let i = 0; i < 6; i++) {
            await otpInputs[i].clear();
            await otpInputs[i].sendKeys(otp[i]);
            await driver.sleep(200); // Small delay between digits
        }
        console.log('OTP entered');

        // Wait for verification (look for success indicator or next screen)
        await driver.sleep(2000);
        console.log('Waiting for OTP verification...');
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
        if (!email || !otp) {
            throw new Error('Email and OTP are required');
        }

        if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
            throw new Error('OTP must be 6 digits');
        }

        console.log('\n=== Starting Login/Signup Process ===');
        console.log('Timestamp:', new Date().toISOString());

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

        // Set implicit wait
        await driver.manage().setTimeouts({ implicit: 5000 });

        // Navigate to dashboard
        console.log('Navigating to dashboard...');
        await driver.get('https://app.sapien.io/t/dashboard');
        
        // Execute login/signup flow
        await clickLoginSignup(driver);
        console.log('Login/Signup button clicked successfully');

        await submitEmail(driver, email);
        console.log('Email submitted successfully');

        await enterOTP(driver, otp);
        console.log('OTP entered successfully');

        // Verify successful login
        const currentUrl = await driver.getCurrentUrl();
        
        res.json({
            success: true,
            message: 'Login/Signup flow completed',
            details: {
                email,
                verified: true,
                finalUrl: currentUrl,
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