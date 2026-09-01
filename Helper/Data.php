<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Helper;

use Hyva\Theme\Service\HyvaThemes;
use Magento\Framework\App\Helper\AbstractHelper;
use Magento\Framework\App\Helper\Context;
use Magento\Framework\Json\Helper\Data as JsonHelper;
use Magento\Framework\View\DesignInterface;
use Magento\Store\Model\ScopeInterface;

class Data extends AbstractHelper
{
    public const XML_PATH_ENABLE = 'fastcheckout/general/enable';
    public const XML_PATH_TWO_STEP = 'fastcheckout/general/two_step';
    public const XML_PATH_SEPARATE_ORDER_ACTIONS = 'fastcheckout/general/separate_order_actions';
    public const XML_PATH_PLACE_ORDER_OUTSIDE_SUMMARY = 'fastcheckout/general/place_order_outside_summary';

    public const XML_PATH_DISCOUNT_VISIBILITY = 'fastcheckout/extended/show_discount';
    public const XML_PATH_COMMENT_VISIBILITY = 'fastcheckout/extended/show_comment';
    public const XML_PATH_SUBSCRIBE_VISIBILITY = 'fastcheckout/extended/show_subscribe';
    public const XML_PATH_SUBSCRIBE_BY_DEFAULT = 'fastcheckout/extended/subscribe_by_default';
    public const XML_PATH_SHIPPING_PAYMENT_MAPPING = 'fastcheckout/extended/shipping_payment_mapping';
    private ?bool $canUseHyvaNativeCheckoutCache = null;

    public function __construct(
        Context $context,
        private JsonHelper $jsonHelper,
        private DesignInterface $design,
        private HyvaThemes $hyvaThemes
    ) {
        parent::__construct($context);
    }

    public function isEnable(): bool
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_ENABLE, ScopeInterface::SCOPE_STORE);
    }

    public function isTwoStep(): bool
    {
        return (bool)$this->scopeConfig->getValue(
            self::XML_PATH_TWO_STEP,
            ScopeInterface::SCOPE_STORE
        );
    }

    public function isSeparateOrderActions(): bool
    {
        return (bool)$this->scopeConfig->getValue(
            self::XML_PATH_SEPARATE_ORDER_ACTIONS,
            ScopeInterface::SCOPE_STORE
        );
    }

    public function isPlaceOrderOutsideSummary(): bool
    {
        return (bool)$this->scopeConfig->getValue(
            self::XML_PATH_PLACE_ORDER_OUTSIDE_SUMMARY,
            ScopeInterface::SCOPE_STORE
        );
    }

    public function isShowComment(): bool
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_COMMENT_VISIBILITY, ScopeInterface::SCOPE_STORE);
    }

    public function getShippingPaymentMapping(): array
    {
        $mapping = $this->scopeConfig->getValue(
            self::XML_PATH_SHIPPING_PAYMENT_MAPPING,
            ScopeInterface::SCOPE_STORE
        );
        if (!$mapping) {
            return [];
        }

        try {
            $decoded = $this->jsonHelper->jsonDecode($mapping);
            return is_array($decoded) ? $decoded : [];
        } catch (\Throwable $exception) {
            $this->_logger->warning('Invalid fastcheckout shipping/payment mapping', [
                'exception' => $exception,
            ]);
            return [];
        }
    }

    public function isShowDiscount(): bool
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_DISCOUNT_VISIBILITY, ScopeInterface::SCOPE_STORE);
    }

    public function isShowSubscribe(): bool
    {
        $moduleStatus = $this->isModuleOutputEnabled('Magento_Newsletter');
        return $this->scopeConfig->getValue(self::XML_PATH_SUBSCRIBE_VISIBILITY, ScopeInterface::SCOPE_STORE)
            && $moduleStatus;
    }

    public function isSubscribeByDefault(): bool
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_SUBSCRIBE_BY_DEFAULT, ScopeInterface::SCOPE_STORE);
    }

    public function canUseHyvaNativeCheckout(): bool
    {
        if ($this->canUseHyvaNativeCheckoutCache !== null) {
            return $this->canUseHyvaNativeCheckoutCache;
        }

        return $this->canUseHyvaNativeCheckoutCache =
            $this->isEnable()
            && $this->isModuleOutputEnabled('Kkkonrad_Fastcheckout')
            && $this->hyvaThemes->isHyvaTheme($this->design->getDesignTheme());
    }
}
