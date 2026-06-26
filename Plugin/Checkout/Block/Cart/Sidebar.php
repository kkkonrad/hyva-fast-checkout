<?php

namespace Kkkonrad\Fastcheckout\Plugin\Checkout\Block\Cart;

use Kkkonrad\Fastcheckout\Helper\Data as OpcHelper;
use Magento\Framework\UrlInterface;

class Sidebar
{
    public $opcHelper;
    public $url;

    public function __construct(
        OpcHelper $opcHelper,
        UrlInterface $url
    ) {
        $this->opcHelper = $opcHelper;
        $this->url = $url;
    }

    public function afterGetCheckoutUrl($subject, $result)
    {
        if ($this->opcHelper->canUseHyvaNativeCheckout()) {
            $result = $this->url->getUrl('fast-checkout', ['_secure' => true]);
        }

        return $result;
    }
}
