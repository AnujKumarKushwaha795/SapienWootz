const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Basic root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Simple health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// Debug endpoint
app.get('/debug', (req, res) => {
    res.json({
        status: 'running',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development',
        port: PORT
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=== Server Information ===`);
    console.log(`Server running on port: ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Health check: https://sapienwootz-production-a4f9.up.railway.app/health`);
}); 








