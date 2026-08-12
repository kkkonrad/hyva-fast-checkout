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
    /** @var CheckoutSession */
    private $checkoutSession;

    /** @var ViewModelRegistry */
    private $viewModelRegistry;

    /** @var Helper */
    private $helper;

    /** @var CompositeConfigProvider */
    private $configProvider;

    /** @var ResolverInterface */
    private $localeResolver;

    /** @var CheckoutLayoutCollector */
    private $layoutCollector;

    /** @var Quote|null */
    private $quote;

    public function __construct(
        Context $context,
        CheckoutSession $checkoutSession,
        ViewModelRegistry $viewModelRegistry,
        Helper $helper,
        CompositeConfigProvider $configProvider,
        ResolverInterface $localeResolver,
        CheckoutLayoutCollector $layoutCollector,
        array $data = []
    ) {
        $this->checkoutSession = $checkoutSession;
        $this->viewModelRegistry = $viewModelRegistry;
        $this->helper = $helper;
        $this->configProvider = $configProvider;
        $this->localeResolver = $localeResolver;
        $this->layoutCollector = $layoutCollector;

        parent::__construct($context, $data);
    }

    public function isShowComment(): bool
    {
        return $this->helper->isShowComment();
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

    public function getItemsQty(): float
    {
        return (float)$this->getQuote()->getItemsQty();
    }

    public function getCartUrl(): string
    {
        return $this->getUrl('checkout/cart');
    }
}
