<?php

namespace IWD\Opc\Plugin;

use IWD\Opc\Helper\Data as OpcHelper;
use Magento\Framework\ObjectManagerInterface;
use Magento\Checkout\Model\Session;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Quote\Api\CartRepositoryInterface;

class GiftCardAccount
{
    public $opcHelper;
    public $objectManager;
    public $checkoutSession;
    public $storeManager;
    public $quoteRepository;

    public function __construct(
        OpcHelper $opcHelper,
        ObjectManagerInterface $objectManager,
        Session $checkoutSession,
        StoreManagerInterface $storeManager,
        CartRepositoryInterface $quoteRepository
    ) {
        $this->opcHelper = $opcHelper;
        $this->objectManager = $objectManager;
        $this->checkoutSession = $checkoutSession;
        $this->storeManager = $storeManager;
        $this->quoteRepository = $quoteRepository;
    }

    /**
     * @param $subject \Magento\GiftCardAccount\Model\Giftcardaccount
     * @param $result \Magento\GiftCardAccount\Model\Giftcardaccount
     * @return \Magento\GiftCardAccount\Model\Giftcardaccount
     * @throws \Magento\Framework\Exception\NoSuchEntityException
     */
    public function afterAddToCart($subject, $result)
    {
        if ($this->opcHelper->isEnable() && $this->opcHelper->isCheckoutDesign()) {
            $quote = $this->checkoutSession->getQuote();
            if ($quote) {
                $website = $this->storeManager->getStore($quote->getStoreId())->getWebsite();
                if ($subject->isValid(true, true, $website)) {
                    /**
                     * @var $giftCardAccountHelper \Magento\GiftCardAccount\Helper\Data
                     */
                    $giftCardAccountHelper = $this->objectManager->create('\Magento\GiftCardAccount\Helper\Data');
                    $cards = $giftCardAccountHelper->getCards($quote);
                    if ($cards) {
                        foreach ($cards as $key => $card) {
                            $cards[$key]['oa'] = $card['a'];
                        }

                        $giftCardAccountHelper->setCards($quote, $cards);
                        $quote->collectTotals();
                        $this->quoteRepository->save($quote);
                    }
                }
            }
        }

        return $result;
    }
}
