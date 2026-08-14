<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Helper;

use Hyva\Theme\Service\HyvaThemes;
use Magento\Framework\App\Helper\Context;
use Magento\Framework\Json\Helper\Data as JsonHelper;
use Magento\Framework\App\Helper\AbstractHelper;

use Magento\Store\Model\ScopeInterface;
use Magento\Framework\View\DesignInterface;
use Magento\Theme\Model\ThemeFactory;

class Data extends AbstractHelper
{

    const XML_PATH_ENABLE = 'fastcheckout/general/enable';
    const XML_PATH_TWO_STEP = 'fastcheckout/general/two_step';

    const XML_PATH_DISCOUNT_VISIBILITY = 'fastcheckout/extended/show_discount';
    const XML_PATH_COMMENT_VISIBILITY = 'fastcheckout/extended/show_comment';
    const XML_PATH_SUBSCRIBE_VISIBILITY = 'fastcheckout/extended/show_subscribe';
    const XML_PATH_SUBSCRIBE_BY_DEFAULT = 'fastcheckout/extended/subscribe_by_default';
    const XML_PATH_SHIPPING_PAYMENT_MAPPING = 'fastcheckout/extended/shipping_payment_mapping';
    const XML_PATH_ASSIGN_ORDER_TO_CUSTOMER = 'fastcheckout/extended/assign_order_to_customer';

    public $jsonHelper;
    protected $design;
    protected $themeFactory;
    private HyvaThemes $hyvaThemes;

    /**
     * Per-request memo of canUseHyvaNativeCheckout() (theme/config checks are not free).
     *
     * @var bool|null
     */
    private $canUseHyvaNativeCheckoutCache = null;

    public function __construct(
        Context $context,
        JsonHelper $jsonHelper,
        DesignInterface $design,
        ThemeFactory $themeFactory,
        HyvaThemes $hyvaThemes
    ) {
        parent::__construct($context);
        $this->jsonHelper = $jsonHelper;
        $this->design = $design;
        $this->themeFactory = $themeFactory;
        $this->hyvaThemes = $hyvaThemes;
    }

    public function isEnable()
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

    public function getShippingPaymentMapping()
    {
        $mapping = $this->scopeConfig->getValue(self::XML_PATH_SHIPPING_PAYMENT_MAPPING, ScopeInterface::SCOPE_STORE);

        if (empty($mapping)) {
            return [];
        }

        try {
            $decoded = $this->jsonHelper->jsonDecode($mapping);
            return is_array($decoded) ? $decoded : [];
        } catch (\Exception $e) {
            $this->_logger->warning('Invalid fastcheckout shipping/payment mapping', ['exception' => $e]);
            return [];
        }
    }

    public function isShowComment()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_COMMENT_VISIBILITY, ScopeInterface::SCOPE_STORE);
    }

    public function isShowDiscount()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_DISCOUNT_VISIBILITY, ScopeInterface::SCOPE_STORE);
    }

    public function isShowSubscribe()
    {
        $moduleStatus = $this->isModuleOutputEnabled('Magento_Newsletter');
        return $this->scopeConfig->getValue(self::XML_PATH_SUBSCRIBE_VISIBILITY, ScopeInterface::SCOPE_STORE)
            && $moduleStatus;
    }

    public function isSubscribeByDefault()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_SUBSCRIBE_BY_DEFAULT, ScopeInterface::SCOPE_STORE);
    }

    /**
     * When enabled, guest orders whose email matches an existing customer are
     * attached to that customer account after place order (previous default behaviour).
     */
    public function isAssignOrderToCustomer(): bool
    {
        return (bool)$this->scopeConfig->getValue(
            self::XML_PATH_ASSIGN_ORDER_TO_CUSTOMER,
            ScopeInterface::SCOPE_STORE
        );
    }

    public function canUseHyvaNativeCheckout()
    {
        if ($this->canUseHyvaNativeCheckoutCache !== null) {
            return $this->canUseHyvaNativeCheckoutCache;
        }

        if (!$this->isEnable() || !$this->isModuleOutputEnabled('Kkkonrad_Fastcheckout')) {
            return $this->canUseHyvaNativeCheckoutCache = false;
        }

        $theme = null;
        try {
            $theme = $this->design ? $this->design->getDesignTheme() : null;
            if ($theme && $this->hyvaThemes->isHyvaTheme($theme)) {
                return $this->canUseHyvaNativeCheckoutCache = true;
            }
        } catch (\Throwable $e) {
            $theme = null;
        }

        if ($this->themeFactory !== null) {
            try {
                $themeId = (int)$this->scopeConfig->getValue(
                    'design/theme/theme_id',
                    ScopeInterface::SCOPE_STORE
                );
                if ($themeId > 0) {
                    $theme = $this->themeFactory->create()->load($themeId);
                    return $this->canUseHyvaNativeCheckoutCache =
                        $this->hyvaThemes->isHyvaTheme($theme);
                }
            } catch (\Throwable $e) {
                // Fall through to the safe non-Hyva result.
            }
        }

        return $this->canUseHyvaNativeCheckoutCache = false;
    }

}
