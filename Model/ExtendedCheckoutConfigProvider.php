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
                'showDiscount' => $this->helper->isShowDiscount(),
                'showSubscribe' => $this->helper->isShowSubscribe(),
                'subscribeByDefault' => $this->helper->isSubscribeByDefault(),
                'twoStep' => $this->helper->isTwoStep(),
                'newsletterLabel' => (string)__('Sign Up for Our Newsletter')
            ]
        ];
    }
}
