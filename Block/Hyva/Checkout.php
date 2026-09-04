<?php

namespace Kkkonrad\Fastcheckout\Block\Hyva;

use Hyva\Theme\Model\ViewModelRegistry;
use Hyva\Theme\ViewModel\HyvaCsp;
use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Model\CheckoutLayoutCollector;
use Magento\Checkout\Model\CompositeConfigProvider;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\Locale\ResolverInterface;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Magento\Quote\Model\Quote;

class Checkout extends Template
{
    private ?Quote $quote = null;

    public function __construct(
        Context $context,
        private CheckoutSession $checkoutSession,
        private ViewModelRegistry $viewModelRegistry,
        private Helper $helper,
        private CompositeConfigProvider $configProvider,
        private ResolverInterface $localeResolver,
        private CheckoutLayoutCollector $layoutCollector,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    public function isShowComment(): bool
    {
        return $this->helper->isShowComment();
    }

    public function isTwoStep(): bool
    {
        return $this->helper->isTwoStep();
    }

    public function isSeparateOrderActions(): bool
    {
        return $this->helper->isSeparateOrderActions();
    }

    public function isPlaceOrderOutsideSummary(): bool
    {
        return $this->helper->isPlaceOrderOutsideSummary();
    }

    /**
     * JSON for an inline script, escaped like Magento's JsonHexTag serializer.
     *
     * @param mixed $data
     */
    public function serializeForScript($data): string
    {
        $json = json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

        return $json === false ? 'null' : $json;
    }

    public function getHyvaCsp(): HyvaCsp
    {
        return $this->viewModelRegistry->require(HyvaCsp::class);
    }

    public function getQuote(): Quote
    {
        if ($this->quote === null) {
            $this->quote = $this->checkoutSession->getQuote();
        }

        return $this->quote;
    }

    public function getCheckoutConfig(): array
    {
        $quote = $this->getQuote();
        if (!$quote->getId() || !$quote->hasItems()) {
            return [];
        }

        return $this->configProvider->getConfig();
    }

    public function getLocaleCode(): string
    {
        return (string)$this->localeResolver->getLocale();
    }

    /**
     * Complete Magento checkout tree processed on the native checkout.root block.
     */
    public function getCheckoutJsLayout(): array
    {
        return $this->layoutCollector->collect($this->getLayout()->getUpdate()->getHandles());
    }

}
