<?php

namespace IWD\Opc\Block;

use Magento\Checkout\Block\Onepage as CheckoutOnepage;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\View\Element\Template\Context;
use Magento\Framework\Data\Form\FormKey;
use Magento\Checkout\Model\CompositeConfigProvider;

class Onepage extends CheckoutOnepage
{

    public $checkoutSession;
    public $quote = null;

    /**
     * @var \Magento\Framework\View\LayoutInterface
     */
    protected $layout;

    /**
     * Onepage constructor.
     * @param Context $context
     * @param FormKey $formKey
     * @param CompositeConfigProvider $configProvider
     * @param CheckoutSession $checkoutSession
     * @param array $layoutProcessors
     * @param array $data
     */
    public function __construct(
        Context $context,
        FormKey $formKey,
        CompositeConfigProvider $configProvider,
        CheckoutSession $checkoutSession,
        array $layoutProcessors = [],
        array $data = []
    ) {
        $this->checkoutSession = $checkoutSession;
        $this->layout = $context->getLayout();
        parent::__construct($context, $formKey, $configProvider, $layoutProcessors, $data);
    }

    /**
     * @return \Magento\Quote\Model\Quote|null
     */
    public function getQuote()
    {
        if (null === $this->quote) {
            $this->quote = $this->checkoutSession->getQuote();
        }

        return $this->quote;
    }

    /**
     * @return mixed
     */
    public function renderPayPalInContextBlock()
    {
        return $this->layout->createBlock(\Magento\Paypal\Block\Express\InContext\Component::class)
            ->setTemplate('Magento_Paypal::express/in-context/shortcut/button.phtml')
            ->toHtml();
    }
}
