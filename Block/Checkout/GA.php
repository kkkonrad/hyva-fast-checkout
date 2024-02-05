<?php

namespace IWD\Opc\Block\Checkout;

use Magento\Framework\View\Element\Template;
use IWD\Opc\Helper\Data as OpcHelper;
use IWD\Opc\Helper\GoogleAnalitics;
use IWD\Opc\Helper\Quote as QuoteHelper;

class GA extends Template
{
    /**
     * @var OpcHelper
     */
    public $opcHelper;

    /**
     * @var GoogleAnalitics
     */
    public $ga;

    /**
     * @var QuoteHelper
     */
    public $quoteHelper;

    /**
     * GA constructor.
     * @param Template\Context $context
     * @param OpcHelper $opcHelper
     * @param GoogleAnalitics $ga
     * @param QuoteHelper $quoteHelper
     * @param array $data
     */
    public function __construct(
        Template\Context $context,
        OpcHelper $opcHelper,
        GoogleAnalitics $ga,
        QuoteHelper $quoteHelper,
        array $data = []
    ) {
        parent::__construct($context, $data);
        $this->opcHelper = $opcHelper;
        $this->ga = $ga;
        $this->quoteHelper = $quoteHelper;
    }

    /**
     * @return bool|int
     */
    public function isGa4Active() {
        return $this->ga->isGa4Active();
    }

    /**
     * @return mixed
     */
    public function getGa4TrackingId() {
        return $this->ga->getGa4TrackingId();
    }

    /**
     * @return array
     */
    public function getGa4() {
        return [
            'active' => $this->isGa4Active(),
            'tracking_id' => $this->getGa4TrackingId(),
        ];
    }

    /**
     * @return array
     */
    public function getCart() {
        return $this->quoteHelper->getCart();
    }
}
