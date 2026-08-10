<?php

namespace Kkkonrad\Fastcheckout\Model;

use Magento\Checkout\Model\ConfigProviderInterface;
use Kkkonrad\Fastcheckout\Helper\Data as Helper;

class ExtendedCheckoutConfigProvider implements ConfigProviderInterface
{
    public $helper;

    public function __construct(Helper $helper)
    {
        $this->helper = $helper;
    }

    public function getConfig()
    {
        return [
            'fastcheckoutSettings' => [
                'shippingPaymentMapping' => $this->helper->getShippingPaymentMapping(),
                'showDiscount' => $this->helper->isShowDiscount(),
                'showComment' => $this->helper->isShowComment(),
                'showSubscribe' => $this->helper->isShowSubscribe(),
                'subscribeByDefault' => $this->helper->isSubscribeByDefault(),
                'newsletterLabel' => (string)__('Sign Up for Our Newsletter')
            ]
        ];
    }
}
