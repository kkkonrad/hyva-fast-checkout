import {test, expect} from '@playwright/test';
import {resolve} from 'node:path';

test('spaces shipping errors without relying on Tailwind utilities', async ({page}) => {
    await page.setContent(`<div id="fastcheckout-checkout">
        <form id="co-shipping-method-form"><div class="grid gap-3">
            <div data-fastcheckout-shipping-method-error hidden></div>
            <div id="checkout-shipping-method-load">Shipping methods</div>
        </div></form>
    </div>`);
    await page.addStyleTag({path: resolve(
        __dirname, '../../view/frontend/web/css/hyva-default-checkout.css'
    )});
    for (const mode of ['one-step', 'two-step']) {
        await page.locator('#fastcheckout-checkout').evaluate((root, value) => {
            root.dataset.fastcheckoutMode = value;
        }, mode);
        for (const text of [
            'Proszę wybrać punkt odbioru dla tej metody dostawy.',
            'Brak metody wysyłki. Wybierz metodę wysyłki i spróbuj ponownie.'
        ]) {
            const error = page.locator('[data-fastcheckout-shipping-method-error]');
            await error.evaluate((node, value) => {
                node.textContent = value;
                node.hidden = false;
            }, text);
            expect(await error.evaluate((node) => (
                node.nextElementSibling.getBoundingClientRect().top - node.getBoundingClientRect().bottom
            ))).toBe(12);
            await error.evaluate((node) => { node.hidden = true; });
            expect(await page.locator('#checkout-shipping-method-load').evaluate((node) => (
                node.getBoundingClientRect().top - node.parentElement.getBoundingClientRect().top
            ))).toBe(0);
        }
    }
});

test('keeps address warning styles and wallet proxy visibility', async ({page}) => {
    const addressRoots = [
        'fastcheckout-native-shipping-address',
        'payment-method-billing-address',
        'checkout-billing-address'
    ];
    await page.setContent(`<div id="fastcheckout-checkout"
        style="--color-red-600: #dc2626; --text-sm: 0.875rem">
        <form id="co-payment-form" data-fastcheckout-bound="1"></form>
        ${addressRoots.map((root) => `<div class="${root}">
            ${['control', 'admin__field-control'].map((control) => `
                <div class="${control}"><div class="message warning">
                    <span>Invalid address</span>
                </div></div>`).join('')}
        </div>`).join('')}
        <button data-fastcheckout-place-order-ssr style="display:flex">Place Order</button>
        <button data-fastcheckout-place-order-mobile style="display:flex">Place Order</button>
    </div>`);
    for (const file of ['hyva-default-checkout.css', 'hyva-ko-payment.css']) {
        await page.addStyleTag({path: resolve(__dirname, '../../view/frontend/web/css', file)});
    }
    const warnings = page.locator('#fastcheckout-checkout .message.warning');
    await expect(warnings).toHaveCount(6);
    for (const warning of await warnings.all()) {
        await expect(warning).toHaveCSS('color', 'rgb(220, 38, 38)');
        await expect(warning).toHaveCSS('font-size', '14px');
        await expect(warning).toHaveCSS('margin', '4px 0px 0px');
        await expect(warning.locator('span')).toHaveCSS('display', 'inline');
        expect(await warning.evaluate((node) => ['::before', '::after'].map(
            (pseudo) => getComputedStyle(node, pseudo).content
        ))).toEqual(['none', 'none']);
    }
    for (const [width, attribute] of [
        [1280, 'data-fastcheckout-place-order-ssr'],
        [390, 'data-fastcheckout-place-order-mobile']
    ]) {
        await page.setViewportSize({width, height: 900});
        const button = page.locator(`[${attribute}]`);
        await expect(button).toBeVisible();
        await button.evaluate((node) => node.setAttribute('data-fastcheckout-wallet-only', '1'));
        await expect(button).toBeHidden();
        await button.evaluate((node) => node.removeAttribute('data-fastcheckout-wallet-only'));
        await expect(button).toBeVisible();
    }
});
