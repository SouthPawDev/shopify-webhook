# Shopify Webhook App


## Environment Variables
To use this application with your own Shopify store, create a `.env` file in the root directory of the project and include the following variables:

```env
SHOPIFY_API_KEY=your-shopify-api-key
SHOPIFY_PASSWORD=your-shopify-api-password
SHOPIFY_STORE=https://your-shopify-store.myshopify.com
SHOPIFY_NAME=your-shopify-store-name
BASE_URL=http://localhost:3000
```

Replace the placeholders (`your-shopify-api-key`, `your-shopify-api-password`, etc.) with the appropriate values for your Shopify store.

## How to Use

### Authentication
**Endpoint**: `/auth`

- This endpoint redirects you to Shopify's authentication page.
- To use this endpoint, ensure the `REDIRECT_URI` matches the one whitelisted in your Shopify app settings.

### Get Access Token
**Endpoint**: `/token`

- This endpoint exchanges the authorization code for an access token.
- The access token is stored in memory for use in other routes.

### Fetch Customers
**Endpoint**: `/customers`

**Description**:
- This GraphQL endpoint fetches up to 50 customers with their ID, first name, last name, and email.
- Does not require prior authentication unless you are testing with Postman, as Postman does not handle redirections well. In such cases, authenticate using the `/auth` route first.

**Use Case**:
- Retrieve customer data efficiently to manage or modify marketing consent.

### Fetch Specific Customer by Email
**Endpoint**: `/customers/:email`

**Description**:
- Fetches detailed information about a specific customer using their email address.
- Includes profile and settings data.
- Useful for checking the current email marketing consent state.

**Usage**:
- Example: `GET /customers/test@example.com`

### Update Marketing Consent
**Endpoint**: `/marketing-consent`

**Description**:
- Updates the marketing consent status for customers based on their email address.
- Does not use authentication middleware, making it accessible for testing directly via tools like Postman.

**Payload Example**:
```json
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
```

**Instructions**:
- Use the `/marketing-consent` endpoint with the payload above to test updates to marketing consent.

## Test with Production Base URL
To test this application with the production base URL, use the following base URL:

```
https://shopify-webhook-delta.vercel.app
```

Example:
- Fetch Customers: `GET https://shopify-webhook-delta.vercel.app/customers`
- Update Marketing Consent: `POST https://shopify-webhook-delta.vercel.app/marketing-consent`

## Local Development
1. Clone the repository and install dependencies:
   ```bash
   yarn install
   ```
2. Run the app locally:
   ```bash
   yarn start
   ```
3. Access the app at `http://localhost:3000`.

