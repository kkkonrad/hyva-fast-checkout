<?php

namespace IWD\Opc\Block\Checkout;

use Magento\Framework\View\Element\Template;
use IWD\Opc\Helper\Data as OpcHelper;

class Design extends Template
{
    public $opcHelper;

    public function __construct(
        Template\Context $context,
        OpcHelper $opcHelper,
        array $data = []
    ) {
        parent::__construct($context, $data);
        $this->opcHelper = $opcHelper;
    }

    public function getMainBackground() {
        return $this->opcHelper->getMainBackground();
    }

    public function getMainColor() {
        return $this->opcHelper->getMainColor();
    }

    public function getSummaryBackground() {
        return $this->opcHelper->getSummaryBackground();
    }

    public function getHeadingColor() {
        return $this->opcHelper->getHeadingColor();
    }

    public function getLinkColor() {
        return $this->opcHelper->getLinkColor();
    }

    public function getHighlightColor() {
        return $this->opcHelper->getHighlightColor();
    }

    public function getPrimaryButtonBackground() {
        return $this->opcHelper->getPrimaryButtonBackground();
    }

    public function getPrimaryButtonTextColor() {
        return $this->opcHelper->getPrimaryButtonTextColor();
    }

    public function getSecondaryButtonBackground() {
        return $this->opcHelper->getSecondaryButtonBackground();
    }

    public function getSecondaryButtonTextColor() {
        return $this->opcHelper->getSecondaryButtonTextColor();
    }

    public function getFontFamily() {
        return $this->opcHelper->getFontFamily();
    }

    public function getDesktopResolution() {
        return $this->opcHelper->getDesktopResolution();
    }

    public function getMobileResolution() {
        return $this->opcHelper->getMobileResolution();
    }

    public function getTabletResolution() {
        return $this->opcHelper->getTabletResolution();
    }

    public function getAddressTypeOrder() {
        return $this->opcHelper->getAddressTypeOrder();
    }

    public function getDefaultShipping() {
        return $this->opcHelper->getDefaultShipping();
    }

    public function getDefaultPayment() {
        return $this->opcHelper->getDefaultPayment();
    }

}