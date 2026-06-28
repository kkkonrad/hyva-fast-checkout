<?php

namespace Kkkonrad\Fastcheckout\Plugin\Checkout\Block;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Framework\UrlInterface;

class Link
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

    public function afterGetHref($subject, $result)
    {
        if ($this->helper->canUseHyvaNativeCheckout()) {
            $result = $this->url->getUrl('fast-checkout', ['_secure' => true]);
        }

        return $result;
    }
}
