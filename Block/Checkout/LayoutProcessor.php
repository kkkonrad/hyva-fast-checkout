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
            $shipping['config']['template'] = 'Kkkonrad_Fastcheckout/hyva/shipping-address';
            $shipping['template'] = 'Kkkonrad_Fastcheckout/hyva/shipping-address';
            $shipping['config']['popUpForm']['options']['appendTo'] =
                '#fastcheckout-checkout .fastcheckout-native-shipping-address';
        }

        if (is_array($jsLayout['components']['checkout']['children']['sidebar']['children']['summary'] ?? null)) {
            $summary = &$jsLayout['components']['checkout']['children']['sidebar']['children']['summary'];
            $summary['config'] = is_array($summary['config'] ?? null) ? $summary['config'] : [];
            $summary['config']['template'] = 'Kkkonrad_Fastcheckout/hyva/summary';
            $summary['template'] = 'Kkkonrad_Fastcheckout/hyva/summary';
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
            $discount['config']['template'] = 'Kkkonrad_Fastcheckout/hyva/payment/discount';
            $discount['template'] = 'Kkkonrad_Fastcheckout/hyva/payment/discount';
        }

        return $jsLayout;
    }
}
