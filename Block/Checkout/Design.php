<?php

namespace IWD\Opc\Block\Checkout;

use Magento\Framework\View\Element\Template;
use IWD\Opc\Helper\Data as OpcHelper;
use IWD\Opc\Helper\Design\Layout;
use IWD\Opc\Helper\Design\Style;
use IWD\Opc\Helper\Design\Breadcrumbs;

class Design extends Template
{
    /**
     * @var OpcHelper
     */
    public $opcHelper;

    /**
     * @var Layout
     */
    public $layout;

    /**
     * @var Style
     */
    public $style;

    /**
     * @var Breadcrumbs
     */
    public $breadcrumbs;

    /**
     * Design constructor.
     * @param Template\Context $context
     * @param OpcHelper $opcHelper
     * @param Layout $layout
     * @param Style $style
     * @param Breadcrumbs $breadcrumbs
     * @param array $data
     */
    public function __construct(
        Template\Context $context,
        OpcHelper $opcHelper,
        Layout $layout,
        Style $style,
        Breadcrumbs $breadcrumbs,
        array $data = []
    ) {
        parent::__construct($context, $data);
        $this->opcHelper = $opcHelper;
        $this->layout = $layout;
        $this->style = $style;
        $this->breadcrumbs = $breadcrumbs;
    }

    /**
     * @return mixed
     */
    public function getMainBackground() {
        return $this->style->getMainBackground();
    }

    /**
     * @return mixed
     */
    public function getMainColor() {
        return $this->style->getMainColor();
    }

    /**
     * @return mixed
     */
    public function getSummaryBackground() {
        return $this->style->getSummaryBackground();
    }

    /**
     * @return mixed
     */
    public function getHeadingColor() {
        return $this->style->getHeadingColor();
    }

    /**
     * @return mixed
     */
    public function getLinkColor() {
        return $this->style->getLinkColor();
    }

    /**
     * @return mixed
     */
    public function getHighlightColor() {
        return $this->style->getHighlightColor();
    }

    /**
     * @return mixed
     */
    public function getPrimaryButtonBackground() {
        return $this->style->getPrimaryButtonBackground();
    }

    /**
     * @return mixed
     */
    public function getPrimaryButtonTextColor() {
        return $this->style->getPrimaryButtonTextColor();
    }

    /**
     * @return mixed
     */
    public function getSecondaryButtonBackground() {
        return $this->style->getSecondaryButtonBackground();
    }

    /**
     * @return mixed
     */
    public function getSecondaryButtonTextColor() {
        return $this->style->getSecondaryButtonTextColor();
    }

    /**
     * @return mixed
     */
    public function getFontFamily() {
        return $this->style->getFontFamily();
    }

    /**
     * @return array
     */
    public function getResolution() {
        return [
            'desktop' => $this->layout->getDesktopResolution(),
            'tablet' => $this->layout->getTabletResolution(),
            'mobile' => $this->layout->getMobileResolution(),
        ];
    }

    /**
     * @return mixed
     */
    public function getAddressTypeOrder() {
        return $this->layout->getAddressTypeOrder();
    }

    /**
     * @return array
     */
    public function getDefault() {
        return [
            'shipping' => $this->opcHelper->getDefaultShipping(),
            'payment' => $this->opcHelper->getDefaultPayment(),
        ];
    }

    /**
     * @return mixed
     */
    public function getBreadcrumbsItemColor()
    {
        return $this->breadcrumbs->getBreadcrumbsItemColor();
    }

    /**
     * @return mixed
     */
    public function getBreadcrumbsItemBackground()
    {
        return $this->breadcrumbs->getBreadcrumbsItemBackground();
    }

    /**
     * @return mixed
     */
    public function getBreadcrumbsActiveItemColor()
    {
        return $this->breadcrumbs->getBreadcrumbsActiveItemColor();
    }

    /**
     * @return mixed
     */
    public function getBreadcrumbsActiveItemBackground()
    {
        return $this->breadcrumbs->getBreadcrumbsActiveItemBackground();
    }

    /**
     * @return mixed
     */
    public function getBreadcrumbsCompletedItemColor()
    {
        return $this->breadcrumbs->getBreadcrumbsCompletedItemColor();
    }

    /**
     * @return mixed
     */
    public function getBreadcrumbsCompletedItemBackground()
    {
        return $this->breadcrumbs->getBreadcrumbsCompletedItemBackground();
    }

    /**
     * @return int|mixed|string|null
     */
    public function getPreSelectedBillingAddressId() {
        return $this->opcHelper->getPreSelectedBillingAddressId();
    }

    /**
     * @return array|mixed
     */
    public function getRegionCollection() {
        return $this->opcHelper->getRegionCollection();
    }
}
