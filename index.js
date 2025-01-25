const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const shop = process.env.SHOPIFY_NAME;
const api_key = process.env.SHOPIFY_API_KEY;
const scopes = 'read_customers,write_customers,customers,read_products,write_products,products';
const redirect_uri = `${process.env.BASE_URL}/token`;
const password = process.env.SHOPIFY_PASSWORD;
let shopifyToken = '';

app.use(bodyParser.json());

app.get('/install', async (req, res) => {
    url = `https://${shop}.myshopify.com/admin/oauth/authorize?client_id=${api_key}&scope=${scopes}&redirect_uri=${redirect_uri}`
    console.log(url)
    res.status(200).redirect(url);
});

app.get('/token', async (req, res) => {
    const { code, hmac } = req.query;

    if (!code || !hmac) {
        return res.status(400).json({ message: 'Missing code or hmac in query parameters.' });
    }

    try {
        const response = await axios.post(`https://${shop}.myshopify.com/admin/oauth/access_token`, {
            client_id: api_key,
            client_secret: password,
            code: code,
        });

        const { access_token } = response.data;

        // Persist the access token
        shopifyToken = access_token;
        res.status(200).json({ message: 'Access token retrieved and stored successfully.'});
    } catch (error) {
        console.error('Error exchanging code for access token:', error.message);
        res.status(500).json({ message: 'Failed to retrieve access token.', error: error.message });
    }
});

// GET: Fetch customer data from Shopify
app.get('/customers', async (req, res) => {
    const accessToken = shopifyToken;

    if (!accessToken) {
        return res.status(401).json({ message: 'Access token not available. Please authenticate first.' });
    }

    try {
        const response = await axios.get(`https://${shop}.myshopify.com/admin/api/2025-01/custmers/count.json`, {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
            },
        });

        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error fetching customer data:', error.message);
        res.status(500).json({ message: 'Failed to fetch customer data.', error: error.message });
    }
});

app.post('/email', async (req, res) => {
    const payload = req.body;

    try {
        for (const customer of payload) {
            const email = customer.contact_email;
            const propertyValue = customer.propertyValue === 'true';

            // Search for the customer by email
            const searchUrl = `https://${process.env.SHOPIFY_API_KEY}:${process.env.SHOPIFY_PASSWORD}@${process.env.SHOPIFY_STORE}/admin/api/2023-01/customers/search.json?query=email:${email}`;
            const searchResponse = await axios.get(searchUrl);

            if (searchResponse.data.customers.length === 0) {
                console.error(`Customer not found: ${email}`);
                continue;
            }

            const customerId = searchResponse.data.customers[0].id;

            // Update the customer's marketing status
            const updateUrl = `https://${process.env.SHOPIFY_API_KEY}:${process.env.SHOPIFY_PASSWORD}@${process.env.SHOPIFY_STORE}/admin/api/2023-01/customers/${customerId}.json`;
            await axios.put(updateUrl, {
                customer: {
                    id: customerId,
                    accepts_marketing: propertyValue,
                },
            });

            console.log(`Successfully updated customer: ${email}`);
        }

        res.status(200).send('Customers updated successfully');
    } catch (error) {
        console.error('Error updating customers:', error.message);
        res.status(500).send('Error processing webhook');
    }
});

app.listen(PORT, () => {
    console.log(`Webhook service running on port ${PORT}`);
});
