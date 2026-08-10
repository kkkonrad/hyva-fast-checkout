<?php

namespace Kkkonrad\Fastcheckout\Block\Hyva;

use Hyva\Theme\Model\ViewModelRegistry;
use Hyva\Theme\ViewModel\HyvaCsp;
use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Helper\Product\Configuration as ProductConfiguration;
use Magento\Checkout\Model\CompositeConfigProvider;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\Locale\ResolverInterface;
use Magento\Framework\Pricing\Helper\Data as PricingHelper;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Item;
use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Model\CheckoutLayoutCollector;
use Magento\Tax\Helper\Data as TaxHelper;


class Checkout extends Template
{
    /**
     * @var CheckoutSession
     */
    private $checkoutSession;

    /**
     * @var PricingHelper
     */
    private $pricingHelper;

    /**
     * @var ImageHelper
     */
    private $imageHelper;

    /**
     * @var ProductConfiguration
     */
    private $productConfiguration;

    /**
     * @var ViewModelRegistry
     */
    private $viewModelRegistry;

    /**
     * @var Quote|null
     */
    private $quote;

    /** @var CompositeConfigProvider */
    private $configProvider;

    /** @var ResolverInterface */
    private $localeResolver;

    /**
     * Checkout config per quote object, shared by every block instance in the request.
     *
     * @var array<int, array>
     */
    private static $checkoutConfigCache = [];

    /**
     * @var array|null
     */
    private $summaryTotalsCache;

    /**
     * @var Helper
     */
    private $helper;

    /** @var TaxHelper */
    private $taxHelper;

    /** @var array|null */
    private $shippingMethodsCache;

    /** @var CheckoutLayoutCollector */
    private $layoutCollector;

    /**
     * @param Context $context
     * @param CheckoutSession $checkoutSession
     * @param PricingHelper $pricingHelper
     * @param ImageHelper $imageHelper
     * @param ProductConfiguration $productConfiguration
     * @param ViewModelRegistry $viewModelRegistry
     * @param CompositeConfigProvider $configProvider
     * @param ResolverInterface $localeResolver
     * @param TaxHelper $taxHelper
     * @param CheckoutLayoutCollector $layoutCollector
     * @param array $data
     */
    public function __construct(
        Context $context,
        CheckoutSession $checkoutSession,
        PricingHelper $pricingHelper,
        ImageHelper $imageHelper,
        ProductConfiguration $productConfiguration,
        ViewModelRegistry $viewModelRegistry,
        Helper $helper,
        CompositeConfigProvider $configProvider,
        ResolverInterface $localeResolver,
        TaxHelper $taxHelper,
        CheckoutLayoutCollector $layoutCollector,
        array $data = []
    ) {
        $this->checkoutSession = $checkoutSession;
        $this->pricingHelper = $pricingHelper;
        $this->imageHelper = $imageHelper;
        $this->productConfiguration = $productConfiguration;
        $this->viewModelRegistry = $viewModelRegistry;
        $this->helper = $helper;
        $this->configProvider = $configProvider;
        $this->localeResolver = $localeResolver;
        $this->taxHelper = $taxHelper;
        $this->layoutCollector = $layoutCollector;

        parent::__construct($context, $data);
    }

    /**
     * @return bool
     */
    public function isShowComment(): bool
    {
        return $this->helper->isShowComment();
    }

    /**
     * Magento store default country (general/country/default), then shipping origin.
     */
    public function getDefaultDestinationCountryId(): string
    {
        $country = (string)$this->_scopeConfig->getValue(
            \Magento\Directory\Helper\Data::XML_PATH_DEFAULT_COUNTRY,
            \Magento\Store\Model\ScopeInterface::SCOPE_STORE
        );
        if ($country !== '') {
            return $country;
        }

        return (string)$this->_scopeConfig->getValue(
            'shipping/origin/country_id',
            \Magento\Store\Model\ScopeInterface::SCOPE_STORE
        );
    }

    /**
     * Apply the Magento default destination (country / optional origin postcode,
     * region and city) so already-collected rates can be read before the shopper
     * types an address, and report which fields were written so the caller can put
     * the address back the way the shopper left it.
     *
     * @return string[] data keys written by this call
     */
    private function applyDefaultShippingDestination(): array
    {
        $quote = $this->getQuote();
        if (!$quote || $quote->isVirtual()) {
            return [];
        }

        $shippingAddress = $quote->getShippingAddress();
        if (!$shippingAddress) {
            return [];
        }

        $applied = [];

        if (!(string)$shippingAddress->getCountryId()) {
            $country = $this->getDefaultDestinationCountryId();
            if ($country !== '') {
                $shippingAddress->setCountryId($country);
                $applied[] = 'country_id';
            }
        }

        if (!(string)$shippingAddress->getPostcode()) {
            $postcode = (string)$this->_scopeConfig->getValue(
                'shipping/origin/postcode',
                \Magento\Store\Model\ScopeInterface::SCOPE_STORE
            );
            if ($postcode !== '') {
                $shippingAddress->setPostcode($postcode);
                $applied[] = 'postcode';
            }
        }

        if (!(int)$shippingAddress->getRegionId()) {
            $regionId = (int)$this->_scopeConfig->getValue(
                'shipping/origin/region_id',
                \Magento\Store\Model\ScopeInterface::SCOPE_STORE
            );
            if ($regionId > 0) {
                $shippingAddress->setRegionId($regionId);
                $applied[] = 'region_id';
            }
        }

        if (!(string)$shippingAddress->getCity()) {
            $city = (string)$this->_scopeConfig->getValue(
                'shipping/origin/city',
                \Magento\Store\Model\ScopeInterface::SCOPE_STORE
            );
            if ($city !== '') {
                $shippingAddress->setCity($city);
                $applied[] = 'city';
            }
        }

        return $applied;
    }

    /**
     * Drop the placeholder destination again. Rendering must not leave the shipping
     * origin on the quote: anything saving the quote later in the request would
     * persist the store address as the shopper's own.
     *
     * @param string[] $applied
     */
    private function revertDefaultShippingDestination(array $applied): void
    {
        if ($applied === []) {
            return;
        }

        $quote = $this->getQuote();
        $shippingAddress = $quote ? $quote->getShippingAddress() : null;
        if (!$shippingAddress) {
            return;
        }

        foreach ($applied as $field) {
            $shippingAddress->unsetData($field);
        }
    }

    /**
     * Reuse grouped shipping rates that are already present on the quote.
     *
     * Carrier collection can perform remote calls and must not delay the HTML
     * response. When no rates are cached, the native KO rate processor estimates
     * them asynchronously after the shipping form has painted.
     *
     * @return array
     */
    public function getShippingMethods(): array
    {
        if ($this->shippingMethodsCache !== null) {
            return $this->shippingMethodsCache;
        }

        $this->shippingMethodsCache = [];
        $quote = $this->getQuote();
        if (!$quote || $quote->isVirtual()) {
            return $this->shippingMethodsCache;
        }

        $applied = $this->applyDefaultShippingDestination();
        $shippingAddress = $quote->getShippingAddress();
        if (!$shippingAddress || !$shippingAddress->getCountryId()) {
            $this->revertDefaultShippingDestination($applied);
            return $this->shippingMethodsCache;
        }

        try {
            $rates = $shippingAddress->getGroupedAllShippingRates();
            $this->shippingMethodsCache = is_array($rates) ? $rates : [];
        } catch (\Throwable $exception) {
            $this->shippingMethodsCache = [];
        } finally {
            $this->revertDefaultShippingDestination($applied);
        }

        return $this->shippingMethodsCache;
    }

    public function getSelectedShippingMethodCode(): string
    {
        $quote = $this->getQuote();
        if (!$quote || !$quote->getShippingAddress()) {
            return '';
        }

        return (string)$quote->getShippingAddress()->getShippingMethod();
    }

    /**
     * JSON for an inline <script> block.
     *
     * JSON_HEX_TAG is what keeps shopper-supplied values (city, postcode, saved
     * address inside checkoutConfig) from closing the script element. Matches
     * Magento\Framework\Serialize\Serializer\JsonHexTag, which core uses for the
     * same purpose in Template::getJsLayout().
     *
     * @param mixed $data
     * @return string
     */
    public function serializeForScript($data): string
    {
        $json = json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

        return $json === false ? 'null' : $json;
    }

    /**
     * @return HyvaCsp
     */
    public function getHyvaCsp(): HyvaCsp
    {
        return $this->viewModelRegistry->require(HyvaCsp::class);
    }

    /**
     * @return Quote
     */
    public function getQuote()
    {
        if ($this->quote === null) {
            $this->quote = $this->checkoutSession->getQuote();
        }

        return $this->quote;
    }

    /**
     * The checkout page renders two instances of this block (the Tailwind shell and
     * the Knockout bridge), so the memo is shared per quote instead of per block.
     * CompositeConfigProvider is one of the most expensive calls in the request.
     *
     * ponytail: per-request static keyed by quote object; move to a DI-scoped service
     * if the module ever runs under a persistent app server (RoadRunner/FrankenPHP).
     */
    public function getCheckoutConfig()
    {
        $quote = $this->getQuote();
        $cacheKey = $quote ? spl_object_id($quote) : 0;
        if (array_key_exists($cacheKey, self::$checkoutConfigCache)) {
            return self::$checkoutConfigCache[$cacheKey];
        }

        if (!$quote || !$quote->getId() || !$quote->hasItems()) {
            return self::$checkoutConfigCache[$cacheKey] = [];
        }

        try {
            return self::$checkoutConfigCache[$cacheKey] = $this->configProvider->getConfig();
        } catch (\Throwable $exception) {
            return self::$checkoutConfigCache[$cacheKey] = [];
        }
    }

    /**
     * @return string
     */
    public function getLocaleCode()
    {
        return (string)$this->localeResolver->getLocale();
    }

    /**
     * Complete Magento checkout tree processed on the native checkout.root block.
     */
    public function getCheckoutJsLayout(): array
    {
        return $this->layoutCollector->collect();
    }

    /**
     * @return Item[]
     */
    public function getVisibleItems()
    {
        return $this->getQuote()->getAllVisibleItems();
    }

    /**
     * @return float
     */
    public function getItemsQty()
    {
        return (float) $this->getQuote()->getItemsQty();
    }

    /**
     * @param float|int|string|null $amount
     * @return string
     */
    public function formatPrice($amount)
    {
        return $this->pricingHelper->currency((float)$amount, true, false);
    }

    /**
     * @param Item $item
     * @return string
     */
    public function getItemImageUrl(Item $item)
    {
        return $this->imageHelper
            ->init($item->getProduct(), 'cart_page_product_thumbnail')
            ->getUrl();
    }

    /**
     * @param Item $item
     * @return int
     */
    public function getItemImageWidth(Item $item)
    {
        return (int) $this->imageHelper
            ->init($item->getProduct(), 'cart_page_product_thumbnail')
            ->getWidth() ?: 56;
    }

    /**
     * @param Item $item
     * @return int
     */
    public function getItemImageHeight(Item $item)
    {
        return (int) $this->imageHelper
            ->init($item->getProduct(), 'cart_page_product_thumbnail')
            ->getHeight() ?: 56;
    }

    /**
     * @param Item $item
     * @return array
     */
    public function getItemOptions(Item $item)
    {
        return $this->productConfiguration->getCustomOptions($item);
    }

    /**
     * @param Item $item
     * @return float
     */
    public function getItemRowTotal(Item $item)
    {
        // Magento cart "both" still has a primary amount; prefer incl when configured
        // for incl/both (standard Magento item price renderer shows incl first for both).
        if ($this->displayCartPriceInclTax() || $this->displayCartBothPrices()) {
            $rowTotal = $item->getRowTotalInclTax();
        } else {
            $rowTotal = $item->getRowTotal();
        }

        if ($rowTotal === null) {
            $rowTotal = $item->getRowTotal() ?: $item->getRowTotalInclTax();
        }

        return (float) $rowTotal;
    }

    /**
     * Get summary totals dynamically collected, sorted, and translated based on store configuration.
     * Honors Magento tax/cart_display for subtotal, shipping and grand total (excl/incl/both).
     *
     * @return array<int, array{code: string, label: string|\Magento\Framework\Phrase, value: float, strong: bool}>
     */
    public function getSummaryTotals()
    {
        if ($this->summaryTotalsCache !== null) {
            return $this->summaryTotalsCache;
        }

        $quote = $this->getQuote();
        if (!$quote->getTotalsCollectedFlag()) {
            $quote->collectTotals();
        }

        $totals = [];
        $taxTotalValue = 0.0;
        $quoteTotals = $quote->getTotals();
        if (isset($quoteTotals['tax'])) {
            $taxTotalValue = (float)$quoteTotals['tax']->getValue();
        }

        foreach ($quoteTotals as $code => $total) {
            foreach ($this->buildSummaryTotalRows((string)$code, $total, $taxTotalValue) as $row) {
                $value = (float)$row['value'];
                // Skip zero values for optional segments (like tax, discount, fees),
                // but always show subtotal and grand total even if zero.
                if ($value == 0.0 && !in_array($row['code'], ['subtotal', 'subtotal_excl', 'subtotal_incl', 'grand_total', 'grand_total_excl', 'grand_total_incl'], true)) {
                    continue;
                }
                $totals[] = $row;
            }
        }

        $this->summaryTotalsCache = $totals;

        return $this->summaryTotalsCache;
    }

    /**
     * Expand one Magento quote total into one or more display rows per tax cart settings.
     *
     * @param string $code
     * @param \Magento\Quote\Model\Quote\Address\Total|\Magento\Framework\DataObject $total
     * @param float $taxTotalValue
     * @return array<int, array{code: string, label: string|\Magento\Framework\Phrase, value: float, strong: bool}>
     */
    public function buildSummaryTotalRows(string $code, $total, float $taxTotalValue = 0.0): array
    {
        $title = $total->getTitle();
        $strong = ($total->getArea() === 'footer' || $code === 'grand_total');
        $value = (float)$total->getValue();
        $taxConfig = $this->getTaxConfig();

        if ($code === 'subtotal') {
            // Magento Tax::fetch for both/incl sets value=INCL and value_excl_tax=excl
            // (see Magento\Tax\Model\Sales\Total\Quote\Tax). Cart uses getValueExclTax().
            $excl = $this->resolveSubtotalExclTax($total);
            $incl = $this->resolveSubtotalInclTax($total);
            if ($taxConfig && $taxConfig->displayCartSubtotalBoth()) {
                return [
                    [
                        'code' => 'subtotal_excl',
                        'label' => __('%1 (Excl. Tax)', $title),
                        'value' => $excl,
                        'strong' => false,
                    ],
                    [
                        'code' => 'subtotal_incl',
                        'label' => __('%1 (Incl. Tax)', $title),
                        'value' => $incl,
                        'strong' => false,
                    ],
                ];
            }
            if ($taxConfig && $taxConfig->displayCartSubtotalInclTax()) {
                return [[
                    'code' => 'subtotal',
                    'label' => $title,
                    'value' => $incl,
                    'strong' => false,
                ]];
            }

            return [[
                'code' => 'subtotal',
                'label' => $title,
                'value' => $excl,
                'strong' => false,
            ]];
        }

        if ($code === 'shipping') {
            // Shipping total keeps getValue() as excl; incl is shipping_incl_tax
            // (Magento\Tax\Block\Checkout\Shipping::getShippingExcludeTax / IncludeTax).
            $excl = $this->resolveShippingExclTax($total);
            $incl = $this->resolveShippingInclTax($total);
            if ($taxConfig && $taxConfig->displayCartShippingBoth()) {
                return [
                    [
                        'code' => 'shipping_excl',
                        'label' => __('%1 (Excl. Tax)', $title),
                        'value' => $excl,
                        'strong' => false,
                    ],
                    [
                        'code' => 'shipping_incl',
                        'label' => __('%1 (Incl. Tax)', $title),
                        'value' => $incl,
                        'strong' => false,
                    ],
                ];
            }
            if ($taxConfig && $taxConfig->displayCartShippingInclTax()) {
                return [[
                    'code' => 'shipping',
                    'label' => $title,
                    'value' => $incl,
                    'strong' => false,
                ]];
            }

            return [[
                'code' => 'shipping',
                'label' => $title,
                'value' => $excl,
                'strong' => false,
            ]];
        }

        if ($code === 'grand_total') {
            $grandIncl = $value;
            if ($taxConfig && $taxConfig->displayCartTaxWithGrandTotal() && $grandIncl != 0.0) {
                $grandExcl = max($grandIncl - $taxTotalValue, 0.0);

                return [
                    [
                        'code' => 'grand_total_incl',
                        'label' => __('Grand Total Incl. Tax'),
                        'value' => $grandIncl,
                        'strong' => true,
                    ],
                    [
                        'code' => 'grand_total_excl',
                        'label' => __('Grand Total Excl. Tax'),
                        'value' => $grandExcl,
                        'strong' => true,
                    ],
                ];
            }

            return [[
                'code' => 'grand_total',
                'label' => $title,
                'value' => $grandIncl,
                'strong' => true,
            ]];
        }

        return [[
            'code' => $code,
            'label' => $title,
            'value' => $value,
            'strong' => $strong,
        ]];
    }

    /**
     * Magento Tax\Model\Config from the injected TaxHelper (null-safe).
     *
     * @return \Magento\Tax\Model\Config|null
     */
    public function getTaxConfig()
    {
        $helper = $this->getTaxHelper();
        if (!$helper || !method_exists($helper, 'getConfig')) {
            return null;
        }

        return $helper->getConfig();
    }

    /**
     * Subtotal excluding tax.
     * Magento Tax::fetch (both/incl) sets value=INCL and value_excl_tax=excl.
     * Excl-only collectors leave value=excl without value_excl_tax.
     *
     * @param \Magento\Quote\Model\Quote\Address\Total|\Magento\Framework\DataObject $total
     * @return float
     */
    public function resolveSubtotalExclTax($total): float
    {
        if (method_exists($total, 'getValueExclTax')) {
            $excl = $total->getValueExclTax();
            if ($excl !== null && $excl !== '') {
                return (float)$excl;
            }
        }
        $excl = $total->getData('value_excl_tax');
        if ($excl !== null && $excl !== '') {
            return (float)$excl;
        }

        // Excl-only mode: getValue() is excl. Both/incl always sets value_excl_tax above.
        return (float)$total->getValue();
    }

    /**
     * Subtotal including tax.
     * Magento both/incl: value and value_incl_tax are INCL.
     *
     * @param \Magento\Quote\Model\Quote\Address\Total|\Magento\Framework\DataObject $total
     * @return float
     */
    public function resolveSubtotalInclTax($total): float
    {
        if (method_exists($total, 'getValueInclTax')) {
            $incl = $total->getValueInclTax();
            if ($incl !== null && $incl !== '') {
                return (float)$incl;
            }
        }
        $incl = $total->getData('value_incl_tax');
        if ($incl === null || $incl === '') {
            $incl = $total->getData('subtotal_incl_tax');
        }
        if ($incl === null || $incl === '') {
            $quote = $this->getQuote();
            $address = $quote ? $quote->getShippingAddress() : null;
            if ($address && $address->getSubtotalInclTax() !== null && $address->getSubtotalInclTax() !== '') {
                $incl = $address->getSubtotalInclTax();
            }
        }
        if ($incl !== null && $incl !== '') {
            return (float)$incl;
        }

        // Both/incl Magento fetch stores INCL in value when value_incl_tax missing.
        return (float)$total->getValue();
    }

    /**
     * Shipping excl tax — Magento total value stays excl for shipping.
     *
     * @param \Magento\Quote\Model\Quote\Address\Total|\Magento\Framework\DataObject $total
     * @return float
     */
    public function resolveShippingExclTax($total): float
    {
        return (float)$total->getValue();
    }

    /**
     * @param \Magento\Quote\Model\Quote\Address\Total|\Magento\Framework\DataObject $total
     * @return float
     */
    public function resolveShippingInclTax($total): float
    {
        $incl = null;
        if (method_exists($total, 'getShippingInclTax')) {
            $incl = $total->getShippingInclTax();
        }
        if ($incl === null || $incl === '') {
            $incl = $total->getData('shipping_incl_tax');
        }
        if ($incl === null || $incl === '') {
            $quote = $this->getQuote();
            $address = $quote ? $quote->getShippingAddress() : null;
            if ($address) {
                $incl = $address->getShippingInclTax();
            }
        }

        return $incl !== null && $incl !== '' ? (float)$incl : (float)$total->getValue();
    }

    /**
     * @return string
     */
    public function getCartUrl()
    {
        return $this->getUrl('checkout/cart');
    }

    /**
     * @return \Magento\Tax\Helper\Data|null
     */
    public function getTaxHelper()
    {
        return $this->taxHelper;
    }

    /**
     * Magento tax/cart/display/price = Including Tax
     */
    public function displayCartPriceInclTax(): bool
    {
        $helper = $this->getTaxHelper();

        return $helper ? (bool)$helper->displayCartPriceInclTax() : false;
    }

    /**
     * Magento tax/cart/display/price = Including and Excluding Tax
     */
    public function displayCartBothPrices(): bool
    {
        $helper = $this->getTaxHelper();

        return $helper ? (bool)$helper->displayCartBothPrices() : false;
    }

    /**
     * Magento tax/cart/display/shipping = Excluding Tax
     */
    public function displayShippingPriceExclTax(): bool
    {
        $helper = $this->getTaxHelper();

        return $helper ? (bool)$helper->displayShippingPriceExcludingTax() : true;
    }

    /**
     * Magento tax/cart/display/shipping = Including and Excluding Tax
     */
    public function displayShippingBothPrices(): bool
    {
        $helper = $this->getTaxHelper();

        return $helper ? (bool)$helper->displayShippingBothPrices() : false;
    }

    /**
     * Rate amount excluding tax (Magento TaxHelper::getShippingPrice).
     *
     * @param \Magento\Quote\Model\Quote\Address\Rate|\Magento\Framework\DataObject $rate
     * @return float
     */
    public function getShippingRateAmountExclTax($rate): float
    {
        return $this->getShippingRateAmountWithTaxFlag($rate, false);
    }

    /**
     * Rate amount including tax (Magento TaxHelper::getShippingPrice).
     *
     * @param \Magento\Quote\Model\Quote\Address\Rate|\Magento\Framework\DataObject $rate
     * @return float
     */
    public function getShippingRateAmountInclTax($rate): float
    {
        return $this->getShippingRateAmountWithTaxFlag($rate, true);
    }

    /**
     * Primary shipping price amount for the current Magento display setting.
     *
     * @param \Magento\Quote\Model\Quote\Address\Rate|\Magento\Framework\DataObject $rate
     * @return float
     */
    public function getShippingRateDisplayAmount($rate): float
    {
        if ($this->displayShippingPriceExclTax()) {
            return $this->getShippingRateAmountExclTax($rate);
        }

        return $this->getShippingRateAmountInclTax($rate);
    }

    /**
     * @param \Magento\Quote\Model\Quote\Address\Rate|\Magento\Framework\DataObject $rate
     * @param bool $includingTax
     * @return float
     */
    private function getShippingRateAmountWithTaxFlag($rate, bool $includingTax): float
    {
        $price = (float)($rate && method_exists($rate, 'getPrice') ? $rate->getPrice() : 0);
        $helper = $this->getTaxHelper();
        if (!$helper) {
            return $price;
        }

        $quote = $this->getQuote();
        $address = $quote ? $quote->getShippingAddress() : null;
        $ctc = $quote ? $quote->getCustomerTaxClassId() : null;

        return (float)$helper->getShippingPrice($price, $includingTax, $address, $ctc);
    }
}
