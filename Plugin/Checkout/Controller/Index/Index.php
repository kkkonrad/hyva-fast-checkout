<?php

namespace IWD\Opc\Plugin\Checkout\Controller\Index;

use IWD\Opc\Helper\Data as OpcHelper;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Framework\UrlInterface;

class Index
{
    private $opcHelper;
    private $url;
    private $redirectFactory;

    public function __construct(
        OpcHelper $opcHelper,
        RedirectFactory $redirectFactory,
        UrlInterface $url
    ) {
        $this->opcHelper = $opcHelper;
        $this->redirectFactory = $redirectFactory;
        $this->url = $url;
    }

    public function aroundExecute($subject, callable $proceed)
    {
        if ($this->opcHelper->canUseHyvaNativeCheckout()) {
            return $this->redirectFactory->create()
                ->setUrl($this->url->getUrl('fast-checkout', ['_secure' => true]));
        }

        return $proceed();
    }
}
