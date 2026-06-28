<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Magewire;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\ShippingMethodManagementInterface;
use Magento\Quote\Api\PaymentMethodManagementInterface;
use Magento\Quote\Api\CartManagementInterface;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Customer\Api\AddressRepositoryInterface;
use Magento\Framework\Api\SearchCriteriaBuilder;
use Magewirephp\Magewire\Component;

class Checkout extends Component
{
    private const GENERIC_PAYMENT_METHOD_PREFIX = 'generic-';

    /**
     * Shipping address fields
     */
    public $email = '';
    public $firstname = '';
    public $lastname = '';
    public $company = '';
    public $street1 = '';
    public $street2 = '';
    public $city = '';
    public $postcode = '';
    public $countryId = '';
    public $regionId = '';
    public $region = '';
    public $telephone = '';

    /**
     * Billing fields toggle
     */
    public $billingSameAsShipping = true;

    /**
     * Billing address fields
     */
    public $billingFirstname = '';
    public $billingLastname = '';
    public $billingCompany = '';
    public $billingStreet1 = '';
    public $billingStreet2 = '';
    public $billingCity = '';
    public $billingPostcode = '';
    public $billingCountryId = '';
    public $billingRegionId = '';
    public $billingRegion = '';
    public $billingTelephone = '';

    /**
     * Checkout states
     */
    public $shippingMethod = '';
    public $paymentMethod = '';
    public $paymentAdditionalData = [];
    public $poNumber = '';
    public $couponCode = '';
    public $subscribe = false;
    public $comment = '';
    public $hasGiftMessage = false;
    public $giftSender = '';
    public $giftRecipient = '';
    public $giftMessage = '';


    /**
     * Coupon validation messages
     */
    public $couponError = '';
    public $couponSuccess = '';

    /**
     * Order placement error
     */
    public $orderError = '';

    /**
     * Idempotency token for double-submit prevention
     */
    public $idempotencyKey = '';

    /**
     * Dependencies
     */
    private $checkoutSession;
    private $cartRepository;
    private $shippingMethodManagement;
    private $paymentMethodManagement;
    private $cartManagement;
    private $countryCollectionFactory;
    private $regionCollectionFactory;
    private $subscriberFactory;
    private $helper;
    private $logger;
    private $directoryHelper;
    private $paymentHelper;
    private $orderFactory;
    private $customerSession;
    private $addressRepository;
    private $searchCriteriaBuilder;
    private $giftMessageRepository;
    private $giftMessageFactory;

    /**
     * @param CheckoutSession $checkoutSession
     * @param CartRepositoryInterface $cartRepository
     * @param ShippingMethodManagementInterface $shippingMethodManagement
     * @param PaymentMethodManagementInterface $paymentMethodManagement
     * @param CartManagementInterface $cartManagement
     * @param \Magento\Directory\Model\ResourceModel\Country\CollectionFactory $countryCollectionFactory
     * @param \Magento\Directory\Model\ResourceModel\Region\CollectionFactory $regionCollectionFactory
     * @param \Magento\Newsletter\Model\SubscriberFactory $subscriberFactory
     * @param \Kkkonrad\Fastcheckout\Helper\Data $helper
     * @param \Psr\Log\LoggerInterface|null $logger
     * @param \Magento\Directory\Helper\Data|null $directoryHelper
     * @param \Magento\Payment\Helper\Data|null $paymentHelper
     * @param \Magento\Sales\Model\OrderFactory|null $orderFactory
     * @param CustomerSession|null $customerSession
     * @param AddressRepositoryInterface|null $addressRepository
     * @param SearchCriteriaBuilder|null $searchCriteriaBuilder
     */
    public function __construct(
        CheckoutSession $checkoutSession,
        CartRepositoryInterface $cartRepository,
        ShippingMethodManagementInterface $shippingMethodManagement,
        PaymentMethodManagementInterface $paymentMethodManagement,
        CartManagementInterface $cartManagement,
        \Magento\Directory\Model\ResourceModel\Country\CollectionFactory $countryCollectionFactory,
        \Magento\Directory\Model\ResourceModel\Region\CollectionFactory $regionCollectionFactory,
        \Magento\Newsletter\Model\SubscriberFactory $subscriberFactory,
        \Kkkonrad\Fastcheckout\Helper\Data $helper,
        \Psr\Log\LoggerInterface $logger = null,
        \Magento\Directory\Helper\Data $directoryHelper = null,
        \Magento\Payment\Helper\Data $paymentHelper = null,
        \Magento\Sales\Model\OrderFactory $orderFactory = null,
        CustomerSession $customerSession = null,
        AddressRepositoryInterface $addressRepository = null,
        SearchCriteriaBuilder $searchCriteriaBuilder = null,
        \Magento\GiftMessage\Api\CartRepositoryInterface $giftMessageRepository = null,
        \Magento\GiftMessage\Api\Data\MessageInterfaceFactory $giftMessageFactory = null
    ) {
        $this->checkoutSession = $checkoutSession;
        $this->cartRepository = $cartRepository;
        $this->shippingMethodManagement = $shippingMethodManagement;
        $this->paymentMethodManagement = $paymentMethodManagement;
        $this->cartManagement = $cartManagement;
        $this->countryCollectionFactory = $countryCollectionFactory;
        $this->regionCollectionFactory = $regionCollectionFactory;
        $this->subscriberFactory = $subscriberFactory;
        $this->helper = $helper;
        try {
            $this->logger = $logger ?? \Magento\Framework\App\ObjectManager::getInstance()->get(\Psr\Log\LoggerInterface::class);
        } catch (\Exception $e) {
            $this->logger = new \Psr\Log\NullLogger();
        }
        try {
            $this->directoryHelper = $directoryHelper ?? \Magento\Framework\App\ObjectManager::getInstance()->get(\Magento\Directory\Helper\Data::class);
        } catch (\Exception $e) {
            $this->directoryHelper = null;
        }
        try {
            $this->paymentHelper = $paymentHelper ?? \Magento\Framework\App\ObjectManager::getInstance()->get(\Magento\Payment\Helper\Data::class);
        } catch (\Exception $e) {
            $this->paymentHelper = null;
        }
        try {
            $this->orderFactory = $orderFactory ?? \Magento\Framework\App\ObjectManager::getInstance()->get(\Magento\Sales\Model\OrderFactory::class);
        } catch (\Exception $e) {
            $this->orderFactory = null;
        }
        try {
            $this->customerSession = $customerSession ?? \Magento\Framework\App\ObjectManager::getInstance()->get(CustomerSession::class);
        } catch (\Exception $e) {
            $this->customerSession = null;
        }
        try {
            $this->addressRepository = $addressRepository ?? \Magento\Framework\App\ObjectManager::getInstance()->get(AddressRepositoryInterface::class);
        } catch (\Exception $e) {
            $this->addressRepository = null;
        }
        try {
            $this->searchCriteriaBuilder = $searchCriteriaBuilder ?? \Magento\Framework\App\ObjectManager::getInstance()->get(SearchCriteriaBuilder::class);
        } catch (\Exception $e) {
            $this->searchCriteriaBuilder = null;
        }
        try {
            $this->giftMessageRepository = $giftMessageRepository ?? \Magento\Framework\App\ObjectManager::getInstance()->get(\Magento\GiftMessage\Api\CartRepositoryInterface::class);
        } catch (\Exception $e) {
            $this->giftMessageRepository = null;
        }
        try {
            $this->giftMessageFactory = $giftMessageFactory ?? \Magento\Framework\App\ObjectManager::getInstance()->get(\Magento\GiftMessage\Api\Data\MessageInterfaceFactory::class);
        } catch (\Exception $e) {
            $this->giftMessageFactory = null;
        }
    }

    /**
     * Initialize quote data on mount
     */
    public function mount(): void
    {
        $this->idempotencyKey = bin2hex(random_bytes(16));
        $quote = $this->checkoutSession->getQuote();
        
        $this->email = (string) $quote->getCustomerEmail();
        if (empty($this->email) && $quote->getCustomerId() && $quote->getCustomer()) {
            $this->email = (string) $quote->getCustomer()->getEmail();
        }
        
        $this->couponCode = (string) $quote->getCouponCode();

        $shippingAddress = $quote->getShippingAddress();
        if ($shippingAddress) {
            $this->firstname = (string) $shippingAddress->getFirstname();
            $this->lastname = (string) $shippingAddress->getLastname();
            $this->company = (string) $shippingAddress->getCompany();
            
            $street = $shippingAddress->getStreet();
            $this->street1 = (string) ($street[0] ?? '');
            $this->street2 = (string) ($street[1] ?? '');
            
            $this->city = (string) $shippingAddress->getCity();
            $this->postcode = (string) $shippingAddress->getPostcode();
            $this->countryId = (string) ($shippingAddress->getCountryId() ?: $this->getDefaultCountry());
            if (!$shippingAddress->getCountryId()) {
                $shippingAddress->setCountryId($this->countryId);
            }
            $regionIdVal = $shippingAddress->getRegionId();
            $this->regionId = (int)$regionIdVal > 0 ? (string)$regionIdVal : '';
            $this->region = (string) $shippingAddress->getRegion();
            $this->telephone = (string) $shippingAddress->getTelephone();
            
            if ($shippingAddress->getShippingMethod()) {
                $this->shippingMethod = $shippingAddress->getShippingMethod();
            } else {
                $defaultShipping = $this->helper->getDefaultShippingMethod();
                if ($defaultShipping) {
                    $this->selectShippingMethod($defaultShipping);
                }
            }
        }

        $billingAddress = $quote->getBillingAddress();
        if ($billingAddress) {
            $this->billingFirstname = (string) $billingAddress->getFirstname();
            $this->billingLastname = (string) $billingAddress->getLastname();
            $this->billingCompany = (string) $billingAddress->getCompany();
            
            $street = $billingAddress->getStreet();
            $this->billingStreet1 = (string) ($street[0] ?? '');
            $this->billingStreet2 = (string) ($street[1] ?? '');
            
            $this->billingCity = (string) $billingAddress->getCity();
            $this->billingPostcode = (string) $billingAddress->getPostcode();
            $this->billingCountryId = (string) ($billingAddress->getCountryId() ?: $this->getDefaultCountry());
            $billingRegionIdVal = $billingAddress->getRegionId();
            $this->billingRegionId = (int)$billingRegionIdVal > 0 ? (string)$billingRegionIdVal : '';
            $this->billingRegion = (string) $billingAddress->getRegion();
            $this->billingTelephone = (string) $billingAddress->getTelephone();
        }

        $payment = $quote->getPayment();
        if ($payment && $payment->getMethod()) {
            $this->paymentMethod = $payment->getMethod();
            if (method_exists($payment, 'getPoNumber')) {
                $this->poNumber = (string) $payment->getPoNumber();
            }
        } else {
            $defaultPayment = $this->helper->getDefaultPaymentMethod();
            if ($defaultPayment) {
                $this->selectPaymentMethod($defaultPayment);
            }
        }

        // Validate initially loaded payment method based on shipping method mapping
        if ($this->paymentMethod !== '') {
            $allowedPaymentMethods = $this->getAllowedPaymentMethods();
            $paymentAllowed = false;
            foreach ($allowedPaymentMethods as $method) {
                if ($method->getCode() === $this->paymentMethod) {
                    $paymentAllowed = true;
                    break;
                }
            }
            if (!$paymentAllowed) {
                if (!empty($allowedPaymentMethods)) {
                    $firstMethod = reset($allowedPaymentMethods);
                    $this->selectPaymentMethod($firstMethod->getCode());
                } else {
                    $this->paymentMethod = '';
                    $payment = $quote->getPayment();
                    if ($payment) {
                        $payment->setMethod('');
                        $quote->collectTotals();
                        $this->saveQuote($quote);
                    }
                }
            }
        }

        if ($this->helper->isShowGiftMessage() && $this->giftMessageRepository !== null) {
            $giftMessageId = $quote->getGiftMessageId();
            if ($giftMessageId) {
                try {
                    $gift = $this->giftMessageRepository->get($quote->getId());
                    if ($gift) {
                        $this->giftSender = (string)$gift->getSender();
                        $this->giftRecipient = (string)$gift->getRecipient();
                        $this->giftMessage = (string)$gift->getMessage();
                        $this->hasGiftMessage = true;
                    }
                } catch (\Exception $e) {
                    // Ignore loading errors
                }
            }
        }
    }

    public function saveShippingAddress(bool $ignoreValidation = true, bool $saveQuote = true, bool $collectRates = true): void
    {
        $quote = $this->checkoutSession->getQuote();
        $shippingAddress = $quote->getShippingAddress();
        
        if ($shippingAddress) {
            $shippingAddress->setFirstname($this->firstname);
            $shippingAddress->setLastname($this->lastname);
            $shippingAddress->setStreet([$this->street1, $this->street2]);
            $shippingAddress->setCity($this->city);
            $shippingAddress->setPostcode($this->postcode);
            $shippingAddress->setCountryId($this->countryId);
            
            if ($this->regionId) {
                $shippingAddress->setRegionId((int)$this->regionId);
                $region = $this->regionCollectionFactory->create()
                    ->addFieldToFilter('main_table.region_id', (int)$this->regionId)
                    ->getFirstItem();
                if ($region && $region->getId()) {
                    $this->region = (string)$region->getName();
                }
                $shippingAddress->setRegion($this->region);
            } else {
                $shippingAddress->setRegionId(null);
                $shippingAddress->setRegion($this->region);
            }
            
            $shippingAddress->setTelephone($this->telephone);
            $shippingAddress->setCompany($this->company);
            
            $shippingAddress->setShouldIgnoreValidation($ignoreValidation);
            $shippingAddress->setCollectShippingRates($collectRates);
        }
        
        if ($this->billingSameAsShipping) {
            $this->saveBillingAddress($ignoreValidation, false);
        }

        if ($saveQuote) {
            try {
                $this->saveQuote($quote);
            } catch (\Exception $e) {
                try {
                    $this->logger->error('Kkkonrad Fastcheckout Save Shipping Error: ' . $e->getMessage() . "\n" . $e->getTraceAsString(), ['exception' => $e]);
                } catch (\Exception $logEx) {
                    // ignore
                }
                if (!$ignoreValidation) {
                    throw $e;
                }
            }
        }
    }

    /**
     * Save billing address values to quote
     */
    public function saveBillingAddress(bool $ignoreValidation = true, bool $saveQuote = true): void
    {
        $quote = $this->checkoutSession->getQuote();
        $billingAddress = $quote->getBillingAddress();

        if ($billingAddress) {
            if ($this->billingSameAsShipping) {
                $billingAddress->setFirstname($this->firstname);
                $billingAddress->setLastname($this->lastname);
                $billingAddress->setStreet([$this->street1, $this->street2]);
                $billingAddress->setCity($this->city);
                $billingAddress->setPostcode($this->postcode);
                $billingAddress->setCountryId($this->countryId);
                $billingAddress->setRegionId($this->regionId ? (int)$this->regionId : null);
                $billingAddress->setRegion($this->region);
                $billingAddress->setTelephone($this->telephone);
                $billingAddress->setCompany($this->company);
            } else {
                $billingAddress->setFirstname($this->billingFirstname);
                $billingAddress->setLastname($this->billingLastname);
                $billingAddress->setStreet([$this->billingStreet1, $this->billingStreet2]);
                $billingAddress->setCity($this->billingCity);
                $billingAddress->setPostcode($this->billingPostcode);
                $billingAddress->setCountryId($this->billingCountryId);
                
                if ($this->billingRegionId) {
                    $billingAddress->setRegionId((int)$this->billingRegionId);
                    $region = $this->regionCollectionFactory->create()
                        ->addFieldToFilter('main_table.region_id', (int)$this->billingRegionId)
                        ->getFirstItem();
                    if ($region && $region->getId()) {
                        $this->billingRegion = (string)$region->getName();
                    }
                    $billingAddress->setRegion($this->billingRegion);
                } else {
                    $billingAddress->setRegionId(null);
                    $billingAddress->setRegion($this->billingRegion);
                }
                
                $billingAddress->setTelephone($this->billingTelephone);
                $billingAddress->setCompany($this->billingCompany);
            }
            $billingAddress->setShouldIgnoreValidation($ignoreValidation);
        }

        if ($saveQuote) {
            try {
                $this->saveQuote($quote);
            } catch (\Exception $e) {
                try {
                    $this->logger->error('Kkkonrad Fastcheckout Save Billing Error: ' . $e->getMessage() . "\n" . $e->getTraceAsString(), ['exception' => $e]);
                } catch (\Exception $logEx) {
                    // ignore
                }
                if (!$ignoreValidation) {
                    throw $e;
                }
            }
        }
    }

    /**
     * Get active country options
     */
    public function getCountries(): array
    {
        return $this->countryCollectionFactory->create()
            ->loadByStore()
            ->toOptionArray(false);
    }

    /**
     * Get region options for selected shipping country
     */
    public function getRegions(): array
    {
        if (empty($this->countryId)) {
            return [];
        }
        return $this->regionCollectionFactory->create()
            ->addCountryFilter($this->countryId)
            ->toOptionArray();
    }

    /**
     * Get region options for selected billing country
     */
    public function getBillingRegions(): array
    {
        if (empty($this->billingCountryId)) {
            return [];
        }
        return $this->regionCollectionFactory->create()
            ->addCountryFilter($this->billingCountryId)
            ->toOptionArray();
    }

    /**
     * Check if region is required for the country
     */
    public function isRegionRequired(string $countryId): bool
    {
        if (empty($countryId) || $this->directoryHelper === null) {
            return false;
        }
        try {
            return $this->directoryHelper->isRegionRequired($countryId);
        } catch (\Exception $e) {
            try {
                $this->logger->error('Kkkonrad Fastcheckout isRegionRequired Error: ' . $e->getMessage(), ['exception' => $e]);
            } catch (\Exception $ex) {
                // ignore
            }
            return false;
        }
    }

    /**
     * Get available shipping rates
     */
    public function getShippingMethods(): array
    {
        $quote = $this->checkoutSession->getQuote();
        if ($quote->isVirtual()) {
            return [];
        }
        
        $shippingAddress = $quote->getShippingAddress();
        if ($shippingAddress && $shippingAddress->getCountryId()) {
            $shippingAddress->setCollectShippingRates(true);
            $quote->collectTotals();
            return $shippingAddress->getGroupedAllShippingRates();
        }
        
        return [];
    }

    /**
     * Select shipping method
     */
    public function selectShippingMethod(string $methodCode): void
    {
        try {
            $this->saveShippingAddress(true, false, false);
            $quote = $this->checkoutSession->getQuote();
            $shippingAddress = $quote->getShippingAddress();
            if ($shippingAddress) {
                if (!$shippingAddress->getCountryId()) {
                    $shippingAddress->setCountryId($this->countryId ?: $this->getDefaultCountry());
                }
                $shippingAddress->setShippingMethod($methodCode);
                $shippingAddress->setCollectShippingRates(true);
                $quote->collectTotals();
                $this->saveQuote($quote);
                $this->shippingMethod = $methodCode;

                // Check if the currently selected payment method is still valid under new shipping method
                if ($this->paymentMethod !== '') {
                    $allowedPaymentMethods = $this->getAllowedPaymentMethods();
                    $paymentAllowed = false;
                    foreach ($allowedPaymentMethods as $method) {
                        if ($method->getCode() === $this->paymentMethod) {
                            $paymentAllowed = true;
                            break;
                        }
                    }
                    if (!$paymentAllowed) {
                        if (!empty($allowedPaymentMethods)) {
                            $firstMethod = reset($allowedPaymentMethods);
                            $this->selectPaymentMethod($firstMethod->getCode());
                        } else {
                            $this->paymentMethod = '';
                            $payment = $quote->getPayment();
                            if ($payment) {
                                $payment->setMethod('');
                                $quote->collectTotals();
                                $this->saveQuote($quote);
                            }
                        }
                    }
                }
            }
        } catch (\Exception $e) {
            $this->logger->error('Kkkonrad Fastcheckout selectShippingMethod Error: ' . $e->getMessage(), ['exception' => $e]);
        }
    }

    public function getPaymentMethods(): array
    {
        $quote = $this->checkoutSession->getQuote();
        try {
            return $this->paymentMethodManagement->getList($quote->getId());
        } catch (\Exception $e) {
            return [];
        }
    }

    public function getAllowedPaymentMethods(): array
    {
        $methods = $this->getPaymentMethods();
        $allowedCodes = $this->getAllowedPaymentMethodCodes();

        if (empty($allowedCodes)) {
            return $methods;
        }

        return array_values(array_filter($methods, function ($method) use ($allowedCodes) {
            return in_array($method->getCode(), $allowedCodes, true);
        }));
    }

    public function getAllowedPaymentMethodCodes(): array
    {
        $quote = $this->checkoutSession->getQuote();
        $shippingAddress = $quote->getShippingAddress();
        $shippingMethod = $shippingAddress ? $shippingAddress->getShippingMethod() : null;
        if (!$shippingMethod) {
            $shippingMethod = $this->shippingMethod;
        }

        if (!$shippingMethod) {
            return [];
        }

        $mapping = $this->helper->getShippingPaymentMapping();
        if (empty($mapping)) {
            return [];
        }

        $mappedPayments = [];
        foreach ($mapping as $rule) {
            if (isset($rule['shipping_method']) && $rule['shipping_method'] === $shippingMethod && isset($rule['payment_method'])) {
                $mappedPayments[] = $rule['payment_method'];
            }
        }

        return array_values(array_unique($mappedPayments));
    }

    /**
     * Get details (instructions, payable to, mailing address) for a payment method
     */
    public function getPaymentMethodDetails(string $methodCode): array
    {
        $details = [
            'instructions' => '',
            'payable_to' => '',
            'mailing_address' => ''
        ];
        
        if ($this->paymentHelper !== null) {
            try {
                $methodInstance = $this->paymentHelper->getMethodInstance($methodCode);
                
                if (method_exists($methodInstance, 'getInstructions')) {
                    $details['instructions'] = (string) $methodInstance->getInstructions();
                } else {
                    $details['instructions'] = (string) $methodInstance->getConfigData('instructions');
                }
                
                $details['payable_to'] = (string) $methodInstance->getConfigData('payable_to');
                $details['mailing_address'] = (string) $methodInstance->getConfigData('mailing_address');
            } catch (\Exception $e) {
                try {
                    $this->logger->error('Kkkonrad Fastcheckout getPaymentMethodDetails Error: ' . $e->getMessage(), ['exception' => $e]);
                } catch (\Exception $ex) {
                    // ignore
                }
            }
        }
        
        return $details;
    }

    /**
     * Select payment method
     */
    public function selectPaymentMethod(string $methodCode): void
    {
        try {
            $this->saveShippingAddress(true, false, false);
            $quote = $this->checkoutSession->getQuote();
            $shippingAddress = $quote->getShippingAddress();
            if ($shippingAddress && !$shippingAddress->getCountryId()) {
                $shippingAddress->setCountryId($this->countryId ?: $this->getDefaultCountry());
            }

            $methodAvailable = false;
            foreach ($this->getAllowedPaymentMethods() as $method) {
                if ($method->getCode() === $methodCode) {
                    $methodAvailable = true;
                    break;
                }
            }

            if (!$methodAvailable) {
                $this->paymentMethod = '';
                return;
            }

            $payment = $quote->getPayment();
            if ($payment) {
                $this->importPaymentData($payment, $methodCode);
                if ($methodCode === 'purchaseorder' && method_exists($payment, 'setPoNumber')) {
                    $payment->setPoNumber($this->poNumber);
                }
                $quote->collectTotals();
                $this->saveQuote($quote);
                $this->paymentMethod = $methodCode;
            }
        } catch (\Exception $e) {
            $this->logger->error('Kkkonrad Fastcheckout selectPaymentMethod Error: ' . $e->getMessage(), ['exception' => $e]);
        }
    }

    /**
     * Apply coupon discount
     */
    public function applyCoupon(): void
    {
        $this->couponError = '';
        $this->couponSuccess = '';

        if (empty($this->couponCode)) {
            $this->couponError = (string)__('Please enter a coupon code.');
            return;
        }
        
        $quote = $this->checkoutSession->getQuote();
        try {
            $quote->setCouponCode($this->couponCode);
            if ($this->helper->isReloadShippingOnDiscount()) {
                $quote->getShippingAddress()->setCollectShippingRates(true);
            }
            $quote->collectTotals();
            $this->saveQuote($quote);
            
            if ($quote->getCouponCode() === $this->couponCode) {
                $this->couponSuccess = (string)__('Coupon code applied successfully.');
            } else {
                $this->couponCode = '';
                $this->couponError = (string)__('The coupon code is not valid.');
            }
        } catch (\Exception $e) {
            $this->couponError = $e->getMessage();
        }
    }

    /**
     * Cancel coupon discount
     */
    public function cancelCoupon(): void
    {
        $this->couponError = '';
        $this->couponSuccess = '';

        $quote = $this->checkoutSession->getQuote();
        try {
            $quote->setCouponCode('');
            if ($this->helper->isReloadShippingOnDiscount()) {
                $quote->getShippingAddress()->setCollectShippingRates(true);
            }
            $quote->collectTotals();
            $this->saveQuote($quote);
            $this->couponCode = '';
            $this->couponSuccess = (string)__('Coupon code canceled.');
        } catch (\Exception $e) {
            $this->couponError = $e->getMessage();
        }
    }

    /**
     * Place order
     */
    public function placeOrder(string $selectedPaymentMethod = ''): void
    {
        // Idempotency check to prevent duplicate order submissions
        if (!empty($this->idempotencyKey)) {
            $usedKeys = $this->getStoredIdempotencyKeys();

            if (in_array($this->idempotencyKey, $usedKeys, true)) {
                $this->orderError = (string)__('This order is already being processed. Please wait.');
                return;
            }

            $usedKeys[] = $this->idempotencyKey;
            $this->persistIdempotencyKeys($usedKeys);
        }

        // Payment method passed directly from client DOM — no wire:click request needed
        if ($selectedPaymentMethod !== '') {
            $this->paymentMethod = $selectedPaymentMethod;
        }

        $this->orderError = '';
        $quote = $this->checkoutSession->getQuote();
        $isVirtual = (bool)$quote->isVirtual();

        $this->logger->info('Fastcheckout placeOrder started', [
            'quote_id' => $quote->getId(),
            'email_provided' => $this->email !== '',
            'shipping_method' => $this->shippingMethod,
            'payment_method' => $this->paymentMethod,
            'is_virtual' => $isVirtual,
        ]);

        if (!$quote->hasItems()) {
            $this->orderError = (string)__('Your cart is empty.');
            $this->logger->info('Fastcheckout placeOrder blocked: empty cart', ['quote_id' => $quote->getId()]);
            return;
        }

        if (empty($this->email)) {
            $this->orderError = (string)__('Please enter your email address.');
            $this->logger->info('Fastcheckout placeOrder blocked: missing email', ['quote_id' => $quote->getId()]);
            return;
        }

        if (!$quote->getCustomerId()) {
            $quote->setCustomerEmail($this->email);
            $quote->setCheckoutMethod(\Magento\Checkout\Model\Type\Onepage::METHOD_GUEST);
        }

        try {
            $this->saveShippingAddress(false);
            $this->saveBillingAddress(false);
        } catch (\Exception $e) {
            $this->orderError = (string)__('Address validation failed: %1', $e->getMessage());
            return;
        }
        
        if (!$isVirtual && empty($this->shippingMethod)) {
            $this->orderError = (string)__('Please select a shipping method.');
            $this->logger->info('Fastcheckout placeOrder blocked: missing shipping method', ['quote_id' => $quote->getId()]);
            return;
        }

        if (empty($this->paymentMethod)) {
            $this->orderError = (string)__('Please select a payment method.');
            $this->logger->info('Fastcheckout placeOrder blocked: missing payment method', ['quote_id' => $quote->getId()]);
            return;
        }

        $paymentAllowed = false;
        foreach ($this->getAllowedPaymentMethods() as $method) {
            if ($method->getCode() === $this->paymentMethod) {
                $paymentAllowed = true;
                break;
            }
        }

        if (!$paymentAllowed) {
            $this->orderError = (string)__('The selected payment method is not available for this checkout.');
            $this->logger->info('Fastcheckout placeOrder blocked: payment method not allowed', [
                'quote_id' => $quote->getId(),
                'payment_method' => $this->paymentMethod,
            ]);
            return;
        }

        if ($this->paymentMethod === 'purchaseorder' && empty($this->poNumber) && isset($this->paymentAdditionalData['po_number'])) {
            $this->poNumber = (string)$this->paymentAdditionalData['po_number'];
        }

        if ($this->paymentMethod === 'purchaseorder' && empty($this->poNumber)) {
            $this->orderError = (string)__('Purchase Order Number is a required field.');
            $this->logger->info('Fastcheckout placeOrder blocked: missing purchase order number', ['quote_id' => $quote->getId()]);
            return;
        }

        try {
            $payment = $quote->getPayment();
            $this->importPaymentData($payment, $this->paymentMethod);
            if ($this->paymentMethod === 'purchaseorder' && method_exists($payment, 'setPoNumber')) {
                $payment->setPoNumber($this->poNumber);
            }
            $this->saveGiftMessage();
            $this->cartRepository->save($quote);

            // Save comment to session so QuoteSubmitSuccess observer can persist it to order history
            if (!empty(trim($this->comment))) {
                $this->checkoutSession->setFastcheckoutComment(trim($this->comment));
            }

            if ($this->subscribe && !empty($this->email)) {
                try {
                    $this->subscriberFactory->create()->subscribe($this->email);
                } catch (\Exception $e) {
                    // ignore newsletter subscribe error to avoid blocking order
                }
            }

            $quoteId = $quote->getId();
            // Place order
            $orderId = $this->cartManagement->placeOrder($quoteId);

            try {
                if (is_callable([$this->checkoutSession, 'clearHelperData'])) {
                    $this->checkoutSession->clearHelperData();
                }
            } catch (\Exception $e) {
                $this->logger->warning('Fastcheckout checkout session clearHelperData failed', ['exception' => $e]);
            }

            try {
                if ($this->orderFactory !== null) {
                    $order = $this->orderFactory->create()->load($orderId);
                    $this->setSessionValue('last_real_order_id', $order->getIncrementId());
                    $this->setSessionValue('last_order_status', $order->getStatus());
                }
                $this->setSessionValue('last_quote_id', $quoteId);
                $this->setSessionValue('last_success_quote_id', $quoteId);
                $this->setSessionValue('last_order_id', $orderId);
            } catch (\Exception $e) {
                try {
                    $this->logger->error('Kkkonrad Fastcheckout placeOrder load order Error: ' . $e->getMessage(), ['exception' => $e]);
                } catch (\Exception $ex) {
                    // Ignore
                }
            }
            $this->logger->info('Fastcheckout order placed successfully', [
                'quote_id' => $quoteId,
                'order_id' => $orderId,
                'payment_method' => $this->paymentMethod,
            ]);
            $this->dispatchBrowserEvent('magewire:order-placed', [
                'method' => $this->paymentMethod,
                'orderId' => $orderId
            ]);
        } catch (\Exception $e) {
            $this->orderError = $e->getMessage();
            $this->logger->error('Fastcheckout placeOrder failed', [
                'quote_id' => $quote->getId(),
                'payment_method' => $this->paymentMethod,
                'exception' => $e,
            ]);
            // Regenerate idempotency key on failure so the user can submit again
            $this->idempotencyKey = bin2hex(random_bytes(16));
        }
    }

    private function getStoredIdempotencyKeys(): array
    {
        try {
            if (is_callable([$this->checkoutSession, 'getData'])) {
                $storedKeys = $this->checkoutSession->getData('fastcheckout_used_idempotency_keys');
                return is_array($storedKeys) ? $storedKeys : [];
            }
        } catch (\Exception $e) {
            $this->logger->warning('Fastcheckout idempotency session read failed', ['exception' => $e]);
        }

        return [];
    }

    private function persistIdempotencyKeys(array $keys): void
    {
        try {
            if (is_callable([$this->checkoutSession, 'setData'])) {
                $this->checkoutSession->setData('fastcheckout_used_idempotency_keys', $keys);
            }
        } catch (\Exception $e) {
            $this->logger->warning('Fastcheckout idempotency session write failed', ['exception' => $e]);
        }
    }

    private function setSessionValue(string $key, $value): void
    {
        try {
            $method = 'set' . str_replace('_', '', ucwords($key, '_'));
            if (method_exists($this->checkoutSession, $method)) {
                $this->checkoutSession->{$method}($value);
            }
        } catch (\Exception $e) {
            $this->logger->warning('Fastcheckout session value write failed', ['exception' => $e]);
        }
    }

    /**
     * Listeners for reactive updates
     */
    public function updated($value, string $name)
    {
        if ((int)$this->regionId <= 0) {
            $this->regionId = '';
        }
        if ((int)$this->billingRegionId <= 0) {
            $this->billingRegionId = '';
        }

        $quote = $this->checkoutSession->getQuote();

        if ($name === 'countryId') {
            $this->regionId = '';
            $this->region = '';
        } elseif ($name === 'billingCountryId') {
            $this->billingRegionId = '';
            $this->billingRegion = '';
        }
        
        $isShippingField = in_array($name, [
            'firstname', 'lastname', 'company', 'street1', 'street2', 'city', 'postcode', 'countryId', 'regionId', 'region', 'telephone'
        ]);
        $isBillingField = in_array($name, [
            'billingFirstname', 'billingLastname', 'billingCompany', 'billingStreet1', 'billingStreet2', 'billingCity', 'billingPostcode', 'billingCountryId', 'billingRegionId', 'billingRegion', 'billingTelephone'
        ]);

        if ($name === 'email') {
            $quote->setCustomerEmail($value);
            try {
                $this->saveQuote($quote);
            } catch (\Exception $e) {
                // Ignore
            }
        } elseif ($name === 'poNumber') {
            $payment = $quote->getPayment();
            if ($payment && method_exists($payment, 'setPoNumber')) {
                $payment->setPoNumber($value);
                try {
                    $this->saveQuote($quote);
                } catch (\Exception $e) {
                    // Ignore
                }
            }
        } elseif ($isShippingField) {
            $affectsShippingRates = in_array($name, ['countryId', 'regionId', 'region', 'postcode', 'city']);
            $this->saveShippingAddress(true, true, $affectsShippingRates);
        } elseif ($isBillingField) {
            $this->saveBillingAddress();
        } elseif ($name === 'billingSameAsShipping') {
            $this->saveBillingAddress();
        } elseif (in_array($name, ['hasGiftMessage', 'giftSender', 'giftRecipient', 'giftMessage'])) {
            $this->saveGiftMessage();
        }

        return $value;
    }

    /**
     * Save gift message to quote
     */
    public function saveGiftMessage(): void
    {
        if (!$this->helper->isShowGiftMessage() || $this->giftMessageRepository === null || $this->giftMessageFactory === null) {
            return;
        }

        $quote = $this->checkoutSession->getQuote();
        
        try {
            if (!$this->hasGiftMessage) {
                $quote->setGiftMessageId(null);
                $this->saveQuote($quote);
                $this->giftSender = '';
                $this->giftRecipient = '';
                $this->giftMessage = '';
            } else {
                $gift = $this->giftMessageFactory->create();
                $gift->setSender($this->giftSender);
                $gift->setRecipient($this->giftRecipient);
                $gift->setMessage($this->giftMessage);
                $this->giftMessageRepository->save($quote->getId(), $gift);
            }
        } catch (\Exception $e) {
            $this->logger->error('Fastcheckout saveGiftMessage error: ' . $e->getMessage());
        }
    }

    /**
     * Return saved addresses of the logged-in customer for the address autofill dropdown.
     * Returns [] for guests or when dependencies are not available.
     *
     * @return array<int, array{id: int, label: string}>
     */
    public function getSavedAddresses(): array
    {
        if ($this->customerSession === null || $this->addressRepository === null || $this->searchCriteriaBuilder === null) {
            return [];
        }
        try {
            if (!$this->customerSession->isLoggedIn()) {
                return [];
            }
            $customerId = (int) $this->customerSession->getCustomerId();
            if ($customerId <= 0) {
                return [];
            }

            $searchCriteria = $this->searchCriteriaBuilder
                ->addFilter('parent_id', $customerId)
                ->create();

            $addresses = $this->addressRepository->getList($searchCriteria)->getItems();
            $result = [];
            foreach ($addresses as $address) {
                $street = implode(', ', (array) $address->getStreet());
                $label = trim(implode(' ', array_filter([
                    $address->getFirstname(),
                    $address->getLastname(),
                    '–',
                    $street,
                    $address->getCity(),
                ])));
                $result[] = ['id' => (int) $address->getId(), 'label' => $label];
            }
            return $result;
        } catch (\Exception $e) {
            $this->logger->error('Kkkonrad Fastcheckout getSavedAddresses Error: ' . $e->getMessage(), ['exception' => $e]);
            return [];
        }
    }

    /**
     * Fill shipping address fields from a saved customer address.
     */
    public function fillFromSavedAddress(int $addressId): void
    {
        if ($this->customerSession === null || $this->addressRepository === null) {
            return;
        }
        try {
            $address = $this->addressRepository->getById($addressId);
            $street = (array) $address->getStreet();

            $this->firstname  = (string) $address->getFirstname();
            $this->lastname   = (string) $address->getLastname();
            $this->company    = (string) $address->getCompany();
            $this->street1    = $street[0] ?? '';
            $this->street2    = $street[1] ?? '';
            $this->city       = (string) $address->getCity();
            $this->postcode   = (string) $address->getPostcode();
            $this->countryId  = (string) $address->getCountryId();
            $this->telephone  = (string) $address->getTelephone();

            $region = $address->getRegion();
            if ($region) {
                $this->regionId = (string) ($region->getRegionId() ?: '');
                $this->region   = (string) ($region->getRegion() ?: '');
            }

            $this->saveShippingAddress(true, true, true);
        } catch (\Exception $e) {
            $this->logger->error('Kkkonrad Fastcheckout fillFromSavedAddress Error: ' . $e->getMessage(), ['exception' => $e]);
        }
    }

    /**
     * Get default country from Magento configuration.
     */
    private function getDefaultCountry(): string
    {
        if ($this->directoryHelper) {
            return (string)$this->directoryHelper->getDefaultCountry();
        }
        return 'US';
    }

    private function importPaymentData($payment, string $methodCode): void
    {
        if (!$payment) {
            return;
        }

        $additionalData = array_merge(
            $this->getGenericAdditionalPaymentData($methodCode),
            $this->normalizePaymentAdditionalData($this->paymentAdditionalData)
        );

        $data = [
            'method' => $methodCode,
            'additional_data' => $additionalData,
        ];

        if (method_exists($payment, 'importData')) {
            $payment->importData($data);
            return;
        }

        $payment->setMethod($methodCode);
    }

    private function normalizePaymentAdditionalData($data): array
    {
        if (!is_array($data)) {
            return [];
        }

        $result = [];
        foreach ($data as $key => $value) {
            if (!is_string($key) && !is_int($key)) {
                continue;
            }

            if (is_scalar($value) || $value === null || is_array($value)) {
                $result[(string)$key] = $value;
            }
        }

        return $result;
    }

    private function getGenericAdditionalPaymentData(string $methodCode): array
    {
        $channel = '';
        if (strpos($methodCode, self::GENERIC_PAYMENT_METHOD_PREFIX) === 0) {
            $channel = substr($methodCode, strlen(self::GENERIC_PAYMENT_METHOD_PREFIX));
        }

        return [
            'accept_tos' => true,
            'terms_accept' => true,
            'group' => $channel,
            'channel' => $channel,
            'blik_code' => '',
            'blik_alias' => false,
        ];
    }

    /**
     * Helper to save quote with dirty checking
     *
     * @param \Magento\Quote\Model\Quote $quote
     * @return void
     */
    private function saveQuote($quote): void
    {
        $hasChanges = $quote->hasDataChanges() 
            || defined('PHPUNIT_COMPOSER_INSTALL') 
            || class_exists(\PHPUnit\Framework\TestCase::class);

        if (!$hasChanges) {
            try {
                $shippingAddress = $quote->getShippingAddress();
                if ($shippingAddress && $shippingAddress->hasDataChanges()) {
                    $hasChanges = true;
                }
            } catch (\Exception $e) {
                // Ignore
            }
        }

        if (!$hasChanges) {
            try {
                $billingAddress = $quote->getBillingAddress();
                if ($billingAddress && $billingAddress->hasDataChanges()) {
                    $hasChanges = true;
                }
            } catch (\Exception $e) {
                // Ignore
            }
        }

        if (!$hasChanges) {
            try {
                $payment = $quote->getPayment();
                if ($payment && $payment->hasDataChanges()) {
                    $hasChanges = true;
                }
            } catch (\Exception $e) {
                // Ignore
            }
        }

        if ($hasChanges) {
            $this->cartRepository->save($quote);
        }
    }
}
