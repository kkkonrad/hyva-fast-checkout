<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Block\Checkout;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Checkout\Block\Checkout\LayoutProcessorInterface;

/**
 * Applies only Fastcheckout presentation templates to Magento's native jsLayout.
 */
class LayoutProcessor implements LayoutProcessorInterface
{
    private const CORE_SHIPPING_TEMPLATE = 'Magento_Checkout/shipping';
    private const CORE_SHIPPING_METHOD_LIST_TEMPLATE =
        'Magento_Checkout/shipping-address/shipping-method-list';
    private const CORE_SHIPPING_METHOD_ITEM_TEMPLATE =
        'Magento_Checkout/shipping-address/shipping-method-item';
    private const CORE_SUMMARY_TEMPLATE = 'Magento_Checkout/summary';
    private const CORE_DISCOUNT_TEMPLATE = 'Magento_SalesRule/payment/discount';

    private Helper $helper;

    public function __construct(Helper $helper)
    {
        $this->helper = $helper;
    }

    public function process($jsLayout)
    {
        if (!$this->helper->canUseHyvaNativeCheckout()) {
            return $jsLayout;
        }

        if (is_array($jsLayout['components']['checkout']['children']['steps']['children']
            ['shipping-step']['children']['shippingAddress'] ?? null)) {
            $shipping = &$jsLayout['components']['checkout']['children']['steps']['children']
                ['shipping-step']['children']['shippingAddress'];
            $shipping['config'] = is_array($shipping['config'] ?? null) ? $shipping['config'] : [];
            $this->setTemplateDefault(
                $shipping,
                'template',
                self::CORE_SHIPPING_TEMPLATE,
                'Kkkonrad_Fastcheckout/hyva/shipping-address'
            );
            $shipping['config']['popUpForm']['options']['appendTo'] =
                '#fastcheckout-checkout .fastcheckout-native-shipping-address';
            $this->setTemplateDefault(
                $shipping,
                'shippingMethodListTemplate',
                self::CORE_SHIPPING_METHOD_LIST_TEMPLATE,
                'Kkkonrad_Fastcheckout/hyva/shipping-list'
            );
            $this->setTemplateDefault(
                $shipping,
                'shippingMethodItemTemplate',
                self::CORE_SHIPPING_METHOD_ITEM_TEMPLATE,
                'Kkkonrad_Fastcheckout/hyva/shipping-method-item'
            );
        }

        if (is_array($jsLayout['components']['checkout']['children']['sidebar']['children']['summary'] ?? null)) {
            $summary = &$jsLayout['components']['checkout']['children']['sidebar']['children']['summary'];
            $summary['config'] = is_array($summary['config'] ?? null) ? $summary['config'] : [];
            $this->setTemplateDefault(
                $summary,
                'template',
                self::CORE_SUMMARY_TEMPLATE,
                'Kkkonrad_Fastcheckout/hyva/summary'
            );
            foreach (['cart_items' => 10, 'itemsAfter' => 20, 'totals' => 30] as $name => $sortOrder) {
                if (isset($summary['children'][$name])) {
                    $summary['children'][$name]['sortOrder'] = $sortOrder;
                }
            }
        }

        if (is_array($jsLayout['components']['checkout']['children']['steps']['children']
            ['billing-step']['children']['payment']['children']['afterMethods']['children']['discount'] ?? null)) {
            $discount = &$jsLayout['components']['checkout']['children']['steps']['children']
                ['billing-step']['children']['payment']['children']['afterMethods']['children']['discount'];
            $discount['config'] = is_array($discount['config'] ?? null) ? $discount['config'] : [];
            $this->setTemplateDefault(
                $discount,
                'template',
                self::CORE_DISCOUNT_TEMPLATE,
                'Kkkonrad_Fastcheckout/hyva/payment/discount'
            );
        }

        return $jsLayout;
    }

    private function setTemplateDefault(
        array &$component,
        string $key,
        string $coreTemplate,
        string $fastcheckoutTemplate
    ): void {
        $configured = $component['config'][$key] ?? null;
        $direct = $component[$key] ?? null;
        $custom = $configured !== null && $configured !== $coreTemplate
            ? $configured
            : ($direct !== null && $direct !== $coreTemplate ? $direct : null);

        if ($custom !== null) {
            $component['config'][$key] = $custom;
            $component[$key] = $custom;
            return;
        }

        $component['config'][$key] = $fastcheckoutTemplate;
        $component[$key] = $fastcheckoutTemplate;
    }
}
