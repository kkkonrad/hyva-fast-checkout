<?php

namespace IWD\Opc\Plugin\Checkout\Block;

use IWD\Opc\Helper\Data as OpcHelper;
use Magento\Framework\UrlInterface;

class Cart
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
            $result = $this->url->getUrl('onepage', ['_secure' => true]);
        }

        return $result;
    }
}
