<?php

namespace Kkkonrad\Fastcheckout\Model;

use Magento\Checkout\Model\ConfigProviderInterface;
use Kkkonrad\Fastcheckout\Helper\Data as Helper;

class ExtendedCheckoutConfigProvider implements ConfigProviderInterface
{
    public function __construct(private Helper $helper)
    {
    }

    public function getConfig()
    {
        return [
            'fastcheckoutSettings' => [
                'showSubscribe' => $this->helper->isShowSubscribe(),
                'subscribeByDefault' => $this->helper->isSubscribeByDefault(),
                'twoStep' => $this->helper->isTwoStep(),
                'paymentFilteringEnabled' => $this->helper->isPaymentFilteringEnabled(),
                'newsletterLabel' => (string)__('Sign Up for Our Newsletter')
            ]
        ];
    }
}
