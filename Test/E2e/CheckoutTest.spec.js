import { test, expect } from '@playwright/test';

const selectors = {
    email: 'input[data-wire-field="email"]',
    firstname: 'input[data-wire-field="firstname"]',
    lastname: 'input[data-wire-field="lastname"]',
    company: 'input[data-wire-field="company"]',
    street1: 'input[data-wire-field="street1"]',
    street2: 'input[data-wire-field="street2"]',
    city: 'input[data-wire-field="city"]',
    postcode: 'input[data-wire-field="postcode"]',
    telephone: 'input[data-wire-field="telephone"]',
    country: 'select[wire\\:model\\.blur="countryId"]',
    region: 'select[wire\\:model\\.blur="regionId"]',
    savedAddresses: '#saved-address-select',
    useSavedAddressBtn: 'button[data-select-id="saved-address-select"]',
    placeOrderBtn: 'button[type="submit"]',
    orderError: '#messages .message-error, #messages .message.error',
    cartItemsList: 'ul.divide-y.divide-gray-150',
    couponInput: 'input[wire\\:model\\.defer="couponCode"]',
    couponApplyBtn: 'button[wire\\:click="applyCoupon"]',
    couponSuccess: '.text-green-700',
    couponError: '.text-red-700',
    newsletterCheckbox: 'input[wire\\:model="subscribe"]'
};

export class CheckoutPage {
    constructor(page) {
        this.page = page;
    }

    async goto() {
        await this.page.goto('/fast-checkout/');
        await this.page.waitForLoadState('domcontentloaded');
    }

    async fillShippingAddress(data) {
        await this.page.locator(selectors.email).fill(data.email);
        await this.page.locator(selectors.email).blur();

        await this.page.locator(selectors.firstname).fill(data.firstname);
        await this.page.locator(selectors.firstname).blur();

        await this.page.locator(selectors.lastname).fill(data.lastname);
        await this.page.locator(selectors.lastname).blur();

        await this.page.locator(selectors.street1).fill(data.street1);
        await this.page.locator(selectors.street1).blur();

        await this.page.locator(selectors.city).fill(data.city);
        await this.page.locator(selectors.city).blur();

        await this.page.locator(selectors.postcode).fill(data.postcode);
        await this.page.locator(selectors.postcode).blur();

        await this.page.locator(selectors.telephone).fill(data.telephone);
        await this.page.locator(selectors.telephone).blur();
    }

    async selectSavedAddress(addressId) {
        await this.page.locator(selectors.savedAddresses).selectOption({ value: String(addressId) });
        await this.page.locator(selectors.useSavedAddressBtn).click();
    }

    async applyCoupon(code) {
        await this.page.locator(selectors.couponInput).fill(code);
        await this.page.locator(selectors.couponApplyBtn).click();
    }

    async toggleNewsletter() {
        await this.page.locator(selectors.newsletterCheckbox).click();
    }

    async placeOrder() {
        await this.page.locator(selectors.placeOrderBtn).click();
        await this.page.waitForLoadState('domcontentloaded');
    }
}

test.describe('IWD Magewire Checkout E2E Tests', () => {

    test('should validate input validation rules on blur', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        // Blur empty required field to trigger validation message
        const emailInput = page.locator(selectors.email);
        await emailInput.focus();
        await emailInput.blur();

        const errorMsg = page.locator('label:has(input[data-wire-field="email"]) .field-error');
        await expect(errorMsg).toBeVisible();
        await expect(emailInput).toHaveClass(/border-red-400/);
    });

    test('should allow guest checkout flow with manual input', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        await checkout.fillShippingAddress({
            email: 'guest@example.com',
            firstname: 'John',
            lastname: 'Doe',
            street1: 'Test Street 12',
            city: 'New York',
            postcode: '10001',
            telephone: '123456789'
        });

        // Verify order summary displays items
        await expect(page.locator(selectors.cartItemsList)).toBeVisible();

        // Try placing order (will load or trigger order failure since gateway is dummy)
        await checkout.placeOrder();
    });

    test('should restore and clear localStorage fields correctly', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        // Fill one field
        await page.locator(selectors.firstname).fill('LocalStorageTest');
        await page.locator(selectors.firstname).blur();

        // Reload page
        await page.reload();
        await page.waitForLoadState('domcontentloaded');

        // Check if value restored from localStorage (give brief delay for restore timeout)
        await page.waitForTimeout(500);
        await expect(page.locator(selectors.firstname)).toHaveValue('LocalStorageTest');
    });

    test('should support address autofill for logged-in customers', async ({ page }) => {
        // Assume customer is logged in or session is populated
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        const savedSelect = page.locator(selectors.savedAddresses);
        if (await savedSelect.isVisible()) {
            await checkout.selectSavedAddress(1);
            
            // Wait for fields to populate
            await page.waitForTimeout(500);
            
            // Assert populated fields are not empty
            await expect(page.locator(selectors.firstname)).not.toBeEmpty();
            await expect(page.locator(selectors.lastname)).not.toBeEmpty();
            await expect(page.locator(selectors.street1)).not.toBeEmpty();
        }
    });

    test('should apply discount coupon successfully', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        await checkout.applyCoupon('VALID_COUPON');
        // Expect coupon message container or total update
        const couponSuccess = page.locator(selectors.couponSuccess);
        await expect(couponSuccess).toBeVisible();
    });
});
