const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const SHOP = process.env.SHOPIFY_NAME;
const API_KEY = process.env.SHOPIFY_API_KEY;
const SCOPES = 'customer_read_customers,customer_write_customers,read_customers,write_customers,customer_read_companies';
const REDIRECT_URI = `${process.env.BASE_URL}/token`;
const PASS = process.env.SHOPIFY_PASSWORD;
let shopifyToken = '';

app.use(bodyParser.json());


/* middleware
    * This middleware checks if the shopifyToken is set. If not, it redirects to the authentication route.
    * When testing, postman can't really handle redirects, so you can manually set the shopifyToken to test the other routes.
    * go to the /auth route to authenticate and get the token.
    * quick note: The /customer endpoint uses the middleware so you can use it to set the token and already see the customers.
    * for that, use browser to be redirected.
*/
const authMiddleware = (req, res, next) => {
    if (!shopifyToken) {
        console.log('Redirecting to authentication...');
        return res.redirect(`/auth?next=${encodeURIComponent(req.originalUrl)}`);
    }
    next();
};


app.get('/auth', (req, res) => {
    const nextPath = req.query.next || '/';
    const authUrl = `https://${SHOP}.myshopify.com/admin/oauth/authorize?client_id=${API_KEY}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${encodeURIComponent(nextPath)}`;
    res.redirect(authUrl);
});

app.get('/token', async (req, res) => {
    const { code, hmac, state } = req.query;
    const redirectAfterAuth = state ? decodeURIComponent(state) : '/';


    if (!code || !hmac) {
        return res.status(400).json({ message: 'Missing code or hmac in query parameters.' });
    }

    try {
        const response = await axios.post(`https://${SHOP}.myshopify.com/admin/oauth/access_token`, {
            client_id: API_KEY,
            client_secret: PASS,
            code: code,
        });

        const { access_token } = response.data;

        // Persist the access token
        shopifyToken = access_token;
        res.redirect(redirectAfterAuth || '/');
    } catch (error) {
        console.error('Error exchanging code for access token:', error.message);
        res.status(500).json({ message: 'Failed to retrieve access token.', error: error.message });
    }
});


/*
    This GraphQL endpoint serves the following purposes:
    1. Fetching only the necessary customer fields (id, firstName, lastName, email) efficiently.
    2. Retrieving up to 50 customers in a single request, minimizing API calls.
    3. Identifying customers by email to modify their marketing consent.
*/
app.get('/customers', authMiddleware, async (req, res) => {
    const accessToken = shopifyToken;

    const query = {
        query: `
            {
                customers(first: 50) {
                    edges {
                        node {
                            id
                            firstName
                            lastName
                            email
                        }
                    }
                }
            }
        `
    };

    try {
        const response = await axios.post(`https://${SHOP}.myshopify.com/admin/api/2025-01/graphql.json`, query, {
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

/*
    This endpoint fetches detailed information about a specific customer by their email address:
    1. Uses the provided email to retrieve customer data from Shopify.
    2. Returns customer details, including their profile and settings.
    3. Useful for checking the current email marketing consent state.
*/
app.get('/customers/:email', authMiddleware, async (req, res) => {
    const { email } = req.params;
    const accessToken = shopifyToken;

    if (!accessToken) {
        return res.status(403).json({ message: 'Access token is missing. Please authenticate using /auth and /token routes or provide a token in the request headers.' });
    }

    try {
        const encodedEmail = encodeURIComponent(email);

        const response = await axios.get(`https://${SHOP}.myshopify.com/admin/api/2025-01/customers/search.json?query=${encodedEmail}`, {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
            },
        });

        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error fetching customers from Shopify:', error.message);
        res.status(500).json({ message: 'Failed to fetch customers.', error: error.message });
    }
});


/*
    This endpoint updates the marketing consent status for customers based on their email address:
    1. This endpoint does not use the middleware because it is a POST request.
       To test it using Postman, you must first authenticate using the /auth endpoint or any other endpoint that uses the middleware.
    2. Example payload:
       [
           {
               "contact_email": "example@example.com",
               "propertyName": "accepts_marketing",
               "propertyValue": "true"
           },
           {
               "contact_email": "another@example.com",
               "propertyName": "accepts_marketing",
               "propertyValue": "false"
           }
       ]
*/
app.post('/marketing-consent', async (req, res) => {
    const input = req.body;
    const accessToken = shopifyToken;

    if (!Array.isArray(input)) {
        return res.status(400).json({ message: 'Input must be an array of objects.' });
    }

    try {
        for (const item of input) {
            const { contact_email, propertyName, propertyValue } = item;

            if (!contact_email || !propertyName || !propertyValue) {
                return res.status(400).json({ message: 'Each object must contain contact_email, propertyName, and propertyValue.' });
            }

            if (propertyName !== 'accepts_marketing') {
                return res.status(400).json({ message: 'propertyName must be "accepts_marketing".' });
            }

            if (!['true', 'false'].includes(propertyValue)) {
                return res.status(400).json({ message: 'propertyValue must be "true" or "false".' });
            }

            const encodedEmail = encodeURIComponent(contact_email);
            console.log(`Fetching customer by email: ${contact_email}`);
            
            const customerResponse = await axios.get(
                `https://${SHOP}.myshopify.com/admin/api/2025-01/customers/search.json?query=${encodedEmail}`,
                {
                    headers: {
                        'X-Shopify-Access-Token': accessToken,
                        'Content-Type': 'application/json',
                    },
                }
            );

            console.log('Customer search response:', JSON.stringify(customerResponse.data, null, 2));


            if (!customerResponse.data.customers || customerResponse.data.customers.length === 0) {
                return res.status(404).json({ message: `No customer found with email: ${contact_email}` });
            }

            const customerId = customerResponse.data.customers[0].id;

            const updatePayload = {
                customer: {
                    id: customerId,
                    email_marketing_consent: {
                        state: propertyValue === 'true' ? 'subscribed' : 'unsubscribed',
                        consent_updated_at: propertyValue === 'true' ? new Date().toISOString() : null,
                        opt_in_level: 'single_opt_in',
                    }
                },
            };

            console.log(`Updating customer ${contact_email} with payload:`, JSON.stringify(updatePayload, null, 2));

            const updateResponse = await axios.put(
                `https://${SHOP}.myshopify.com/admin/api/2025-01/customers/${customerId}.json`,
                updatePayload,
                {
                    headers: {
                        'X-Shopify-Access-Token': accessToken,
                        'Content-Type': 'application/json',
                    },
                }
            );

            console.log(`Update response for ${contact_email}:`, JSON.stringify(updateResponse.data, null, 2));

            console.log(`Customer ${contact_email} updated:`, updateResponse.data);
        }

        res.status(200).json({ message: 'Marketing consent updated successfully for all provided customers.' });
    } catch (error) {
        console.error('Error updating marketing consent:', error.message);
        res.status(500).json({ message: 'Failed to update marketing consent.', error: error.message });
    }
});


app.listen(PORT, () => {
    console.log(`Webhook service running on port ${PORT}`);
});
