<?php

namespace IWD\Opc\Plugin\Checkout\Block\Cart;

use IWD\Opc\Helper\Data as OpcHelper;
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
        if ($this->opcHelper->isEnable()) {
            $result = $this->url->getUrl('onepage');
        }

        return $result;
    }
}
