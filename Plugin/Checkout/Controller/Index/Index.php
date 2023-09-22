<?php

namespace IWD\Opc\Plugin\Checkout\Controller\Index;

use IWD\Opc\Helper\Data as OpcHelper;
use Magento\Framework\App\Response\Http as ResponseHttp;
use Magento\Framework\UrlInterface;

class Index
{
    private $opcHelper;
    private $url;
    private $response;

    public function __construct(
        OpcHelper $opcHelper,
        ResponseHttp $response,
        UrlInterface $url
    ) {
        $this->opcHelper = $opcHelper;
        $this->response = $response;
        $this->url = $url;
    }

    public function beforeExecute()
    {
        if ($this->opcHelper->isEnable() && $this->opcHelper->isCheckoutDesign()
            && !($this->opcHelper->isGaAbEnable() && $this->opcHelper->getGaAbCode())) {
            $url = $this->url->getUrl('onepage');
            $this->response->setRedirect($url);
        }
    }
}
