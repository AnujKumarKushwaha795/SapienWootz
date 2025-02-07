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
    const loginButton = await driver.wait(
        until.elementLocated(By.css('.chakra-button.css-3nfgc7')),
        5000
    );
    await loginButton.click();
    console.log('Login/Signup button clicked');
}

// Function to handle email input and submit
async function submitEmail(driver, email) {
    console.log('Handling email submission...');
    try {
        // Wait for email input to be visible
        const emailInput = await driver.wait(
            until.elementLocated(By.css('input#email-input')),
            5000
        );
        
        // Type email
        await emailInput.sendKeys(email);
        console.log('Email entered:', email);

        // Wait for submit button to be enabled and click it
        const submitButton = await driver.wait(
            until.elementLocated(By.css('.StyledEmbeddedButton-sc-e15d0508-6')),
            5000
        );
        await driver.wait(until.elementIsEnabled(submitButton), 5000);
        await submitButton.click();
        console.log('Submit button clicked');
    } catch (error) {
        console.error('Email submission failed:', error.message);
        throw error;
    }
}

// Function to enter OTP
async function enterOTP(driver, otp) {
    console.log('Entering OTP...');
    try {
        // Wait for OTP inputs to be visible
        const otpInputs = await driver.wait(
            until.elementsLocated(By.css('input[name^="code-"]')),
            5000
        );

        // Enter each digit of OTP
        for (let i = 0; i < 6; i++) {
            await otpInputs[i].sendKeys(otp[i]);
            await driver.sleep(200); // Small delay between digits
        }
        console.log('OTP entered');

        // Wait for verification
        await driver.sleep(2000);
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

        console.log('\n=== Starting Login/Signup Process ===');
        console.log('Timestamp:', new Date().toISOString());

        // Setup driver with existing options
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
        
        // Execute login/signup flow
        await clickLoginSignup(driver);
        await submitEmail(driver, email);
        await enterOTP(driver, otp);

        // Verify successful login
        const currentUrl = await driver.getCurrentUrl();
        
        res.json({
            success: true,
            message: 'Login/Signup successful',
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
                step: error.message.includes('email') ? 'Email submission' :
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