<?php

namespace Kkkonrad\Fastcheckout\Plugin\Checkout\Block\Cart;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Framework\UrlInterface;

class Sidebar
{
    public $helper;
    public $url;

    public function __construct(
        Helper $helper,
        UrlInterface $url
    ) {
        $this->helper = $helper;
        $this->url = $url;
    }

    public function afterGetCheckoutUrl($subject, $result)
    {
        if ($this->helper->canUseHyvaNativeCheckout()) {
            $result = $this->url->getUrl('fast-checkout', ['_secure' => true]);
        }

        return $result;
    }
}
