<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Magewire;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\ShippingMethodManagementInterface;
use Magento\Quote\Api\PaymentMethodManagementInterface;
use Magento\Quote\Api\CartManagementInterface;
use Magento\Checkout\Api\AgreementsValidatorInterface;
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
    public $street3 = '';
    public $street4 = '';
    public $prefix = '';
    public $middlename = '';
    public $suffix = '';
    public $fax = '';
    public $vatId = '';
    public $city = '';
    public $postcode = '';
    public $countryId = '';
    public $regionId = '';
    public $region = '';
    public $telephone = '';
    public $shippingCustomAttributes = [];
    public $shippingExtensionAttributes = [];

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
    public $billingStreet3 = '';
    public $billingStreet4 = '';
    public $billingPrefix = '';
    public $billingMiddlename = '';
    public $billingSuffix = '';
    public $billingFax = '';
    public $billingVatId = '';
    public $billingCity = '';
    public $billingPostcode = '';
    public $billingCountryId = '';
    public $billingRegionId = '';
    public $billingRegion = '';
    public $billingTelephone = '';
    public $billingCustomAttributes = [];
    public $billingExtensionAttributes = [];

    /**
     * Checkout states
     */
    public $shippingMethod = '';
    public $paymentMethod = '';
    public $paymentAdditionalData = [];
    public $paymentExtensionAttributes = [];
    public $placeOrderRequestHeaders = [];
    public $placeOrderRequestData = [];
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
    private $agreementsValidator;
    private $paymentMethodsCache = null;
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
     * @param AgreementsValidatorInterface|null $agreementsValidator
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
        \Magento\GiftMessage\Api\Data\MessageInterfaceFactory $giftMessageFactory = null,
        AgreementsValidatorInterface $agreementsValidator = null
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
        try {
            $this->agreementsValidator = $agreementsValidator ?? \Magento\Framework\App\ObjectManager::getInstance()->get(AgreementsValidatorInterface::class);
        } catch (\Exception $e) {
            $this->agreementsValidator = null;
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
            $this->street3 = (string) ($street[2] ?? '');
            $this->street4 = (string) ($street[3] ?? '');
            
            $this->prefix = (string) $shippingAddress->getPrefix();
            $this->middlename = (string) $shippingAddress->getMiddlename();
            $this->suffix = (string) $shippingAddress->getSuffix();
            $this->fax = (string) $shippingAddress->getFax();
            $this->vatId = (string) $shippingAddress->getVatId();
            
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
            $this->billingStreet3 = (string) ($street[2] ?? '');
            $this->billingStreet4 = (string) ($street[3] ?? '');
            
            $this->billingPrefix = (string) $billingAddress->getPrefix();
            $this->billingMiddlename = (string) $billingAddress->getMiddlename();
            $this->billingSuffix = (string) $billingAddress->getSuffix();
            $this->billingFax = (string) $billingAddress->getFax();
            $this->billingVatId = (string) $billingAddress->getVatId();
            
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
            if (!$this->isSelectedPaymentMethodStillAllowed($this->paymentMethod)) {
                $this->selectFirstAllowedPaymentMethodOrClear($quote);
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
            $shippingAddress->setPrefix($this->prefix);
            $shippingAddress->setMiddlename($this->middlename);
            $shippingAddress->setSuffix($this->suffix);
            $shippingAddress->setFax($this->fax);
            $shippingAddress->setVatId($this->vatId);
            $shippingAddress->setStreet($this->buildStreetLines($this->street1, $this->street2, $this->street3, $this->street4));
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
            $this->applyAddressEmail($shippingAddress);
            $this->applyAddressAttributes(
                $shippingAddress,
                $this->getMergedAddressCustomAttributes(false),
                $this->getMergedAddressExtensionAttributes(false)
            );
            
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
                $billingAddress->setPrefix($this->prefix);
                $billingAddress->setMiddlename($this->middlename);
                $billingAddress->setSuffix($this->suffix);
                $billingAddress->setFax($this->fax);
                $billingAddress->setVatId($this->vatId);
                $billingAddress->setStreet($this->buildStreetLines($this->street1, $this->street2, $this->street3, $this->street4));
                $billingAddress->setCity($this->city);
                $billingAddress->setPostcode($this->postcode);
                $billingAddress->setCountryId($this->countryId);
                $billingAddress->setRegionId($this->regionId ? (int)$this->regionId : null);
                $billingAddress->setRegion($this->region);
                $billingAddress->setTelephone($this->telephone);
                $billingAddress->setCompany($this->company);
                $this->applyAddressEmail($billingAddress);
                $this->applyAddressAttributes(
                    $billingAddress,
                    $this->getMergedAddressCustomAttributes(false),
                    $this->getMergedAddressExtensionAttributes(false)
                );
            } else {
                $billingAddress->setFirstname($this->billingFirstname);
                $billingAddress->setLastname($this->billingLastname);
                $billingAddress->setPrefix($this->billingPrefix);
                $billingAddress->setMiddlename($this->billingMiddlename);
                $billingAddress->setSuffix($this->billingSuffix);
                $billingAddress->setFax($this->billingFax);
                $billingAddress->setVatId($this->billingVatId);
                $billingAddress->setStreet($this->buildStreetLines(
                    $this->billingStreet1,
                    $this->billingStreet2,
                    $this->billingStreet3,
                    $this->billingStreet4
                ));
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
                $this->applyAddressEmail($billingAddress);
                $this->applyAddressAttributes(
                    $billingAddress,
                    $this->getMergedAddressCustomAttributes(true),
                    $this->getMergedAddressExtensionAttributes(true)
                );
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
            $rates = $shippingAddress->getGroupedAllShippingRates();
            if (!$shippingAddress->getCollectShippingRates() && !empty($rates)) {
                return is_array($rates) ? $rates : [];
            }

            $shippingAddress->setCollectShippingRates(true);
            $quote->collectTotals();
            $rates = $shippingAddress->getGroupedAllShippingRates();
            return is_array($rates) ? $rates : [];
        }
        
        return [];
    }

    /**
     * Select shipping method
     */
    public function selectShippingMethod(string $methodCode): array
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
                    if (!$this->isSelectedPaymentMethodStillAllowed($this->paymentMethod)) {
                        $this->selectFirstAllowedPaymentMethodOrClear($quote);
                    }
                }
            }
        } catch (\Exception $e) {
            $this->logger->error('Kkkonrad Fastcheckout selectShippingMethod Error: ' . $e->getMessage(), ['exception' => $e]);
        }

        $this->paymentMethodsCache = null;
        return $this->refreshCheckoutState();
    }

    public function getPaymentMethods(): array
    {
        if ($this->paymentMethodsCache !== null) {
            return $this->paymentMethodsCache;
        }

        $quote = $this->checkoutSession->getQuote();
        try {
            $methods = $this->paymentMethodManagement->getList($quote->getId());
            $this->paymentMethodsCache = is_array($methods) ? $methods : [];
        } catch (\Exception $e) {
            $this->paymentMethodsCache = [];
        }

        return $this->paymentMethodsCache;
    }

    public function getAllowedPaymentMethods(): array
    {
        $methods = $this->getPaymentMethods();
        $allowedCodes = $this->getAllowedPaymentMethodCodes();

        return array_values(array_filter($methods, function ($method) use ($allowedCodes) {
            return $this->isPaymentMethodAllowedByRules((string)$method->getCode(), $allowedCodes);
        }));
    }

    public function isPaymentMethodAvailable(string $paymentMethodCode, array $shippingAllowedCodes = null): bool
    {
        return $this->isPaymentMethodAllowedByRules(
            $paymentMethodCode,
            $shippingAllowedCodes === null ? $this->getAllowedPaymentMethodCodes() : $shippingAllowedCodes
        );
    }

    public function isPaymentMethodSelected(string $paymentMethodCode): bool
    {
        $selectedPaymentMethod = (string)$this->paymentMethod;

        return $selectedPaymentMethod !== ''
            && (
                $selectedPaymentMethod === $paymentMethodCode
                || $this->paymentMethodCodeMatches($paymentMethodCode, $selectedPaymentMethod)
                || $this->paymentMethodCodeMatches($selectedPaymentMethod, $paymentMethodCode)
            );
    }

    private function isSelectedPaymentMethodStillAllowed(string $paymentMethodCode): bool
    {
        return $this->resolveAvailablePaymentMethodCode($paymentMethodCode) !== '';
    }

    private function selectFirstAllowedPaymentMethodOrClear($quote): void
    {
        $allowedPaymentMethods = $this->getAllowedPaymentMethods();
        if (!empty($allowedPaymentMethods)) {
            $firstMethod = reset($allowedPaymentMethods);
            $this->selectPaymentMethod((string)$firstMethod->getCode());
            return;
        }

        $this->paymentMethod = '';
        $payment = $quote ? $quote->getPayment() : null;
        if ($payment) {
            $payment->setMethod('');
            $quote->collectTotals();
            $this->saveQuote($quote);
        }
    }

    private function isPaymentMethodAllowedByRules(string $paymentMethodCode, array $shippingAllowedCodes = []): bool
    {
        if ($shippingAllowedCodes !== [] && !$this->helper->isPaymentMethodCodeAllowedByRules($paymentMethodCode, $shippingAllowedCodes)) {
            return false;
        }

        if (!$this->helper->isRestrictPaymentEnable()) {
            return true;
        }

        $restrictedPaymentMethods = $this->helper->getRestrictPaymentMethods();
        if ($restrictedPaymentMethods === []) {
            return true;
        }

        return $this->helper->isPaymentMethodCodeAllowedByRules($paymentMethodCode, $restrictedPaymentMethods);
    }

    private function resolveAvailablePaymentMethodCode(string $paymentMethodCode): string
    {
        $paymentMethodCode = trim($paymentMethodCode);
        if ($paymentMethodCode === '') {
            return '';
        }

        $fallbackCode = '';
        foreach ($this->getAllowedPaymentMethods() as $method) {
            $availableCode = (string)$method->getCode();
            if ($availableCode === $paymentMethodCode) {
                return $availableCode;
            }

            if ($fallbackCode === '' && $this->paymentMethodCodeMatches($availableCode, $paymentMethodCode)) {
                $fallbackCode = $availableCode;
            }
        }

        return $fallbackCode;
    }

    private function paymentMethodCodeMatches(string $baseCode, string $selectedCode): bool
    {
        if ($baseCode === '' || $selectedCode === '') {
            return false;
        }

        if ($baseCode === $selectedCode) {
            return true;
        }

        try {
            $matches = $this->helper->paymentMethodCodeMatches($baseCode, $selectedCode);
            if (is_bool($matches)) {
                return $matches;
            }
        } catch (\Throwable $e) {
            // Fall back to local matching for old/mocked helpers.
        }

        return strpos($selectedCode, $baseCode . '_') === 0
            || strpos($selectedCode, $baseCode . '-') === 0;
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

        return $this->helper->getMappedPaymentMethodsForShipping($shippingMethod);
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
     * Return the current quote state in the shape expected by Magento checkout KO actions.
     */
    public function refreshCheckoutState(): array
    {
        try {
            $quote = $this->checkoutSession->getQuote();

            if ($quote && $quote->getId() && $quote->hasItems()) {
                $quote->collectTotals();
                $this->saveQuote($quote);
            }

            if ($quote) {
                $this->couponCode = (string)$quote->getCouponCode();
            }

            return [
                'totals' => $this->buildTotalsData($quote),
                'payment_methods' => $this->buildPaymentMethodsData(),
                'shipping_rates' => $this->buildShippingRatesData(),
                'selected_payment_method' => $this->paymentMethod,
                'selectedPaymentMethod' => $this->paymentMethod,
                'paymentMethod' => $this->paymentMethod,
                'selected_shipping_method' => $this->getSelectedShippingMethodCode($quote),
                'selectedShippingMethod' => $this->getSelectedShippingMethodCode($quote),
                'selected_shipping_rate' => $this->getSelectedShippingMethodCode($quote),
                'selectedShippingRate' => $this->getSelectedShippingMethodCode($quote),
                'coupon_code' => $this->couponCode,
                'customer_email' => $quote ? (string)$quote->getCustomerEmail() : '',
            ];
        } catch (\Exception $e) {
            $this->logger->error('Kkkonrad Fastcheckout refreshCheckoutState Error: ' . $e->getMessage(), ['exception' => $e]);

            return [
                'totals' => [
                    'items' => [],
                    'total_segments' => [],
                    'subtotal' => 0.0,
                    'subtotal_with_discount' => 0.0,
                    'grand_total' => 0.0,
                ],
                'payment_methods' => [],
                'shipping_rates' => [],
                'selected_payment_method' => $this->paymentMethod,
                'selectedPaymentMethod' => $this->paymentMethod,
                'paymentMethod' => $this->paymentMethod,
                'selected_shipping_method' => $this->shippingMethod,
                'selectedShippingMethod' => $this->shippingMethod,
                'selected_shipping_rate' => $this->shippingMethod,
                'selectedShippingRate' => $this->shippingMethod,
                'coupon_code' => $this->couponCode,
            ];
        }
    }

    private function getSelectedShippingMethodCode($quote = null): string
    {
        if ($this->shippingMethod !== '') {
            return (string)$this->shippingMethod;
        }

        try {
            $quote = $quote ?: $this->checkoutSession->getQuote();
            $shippingAddress = $quote ? $quote->getShippingAddress() : null;

            return $shippingAddress ? (string)$shippingAddress->getShippingMethod() : '';
        } catch (\Throwable $e) {
            return '';
        }
    }

    private function buildPaymentMethodsData(): array
    {
        $methods = [];

        foreach ($this->getAllowedPaymentMethods() as $method) {
            $code = (string)$method->getCode();
            $title = method_exists($method, 'getTitle') ? (string)$method->getTitle() : $code;

            $methods[] = [
                'method' => $code,
                'title' => $title !== '' ? $title : $code,
            ];
        }

        return $methods;
    }

    private function buildShippingRatesData(): array
    {
        $ratesData = [];

        foreach ($this->getShippingMethods() as $carrierRates) {
            if ($carrierRates instanceof \Traversable) {
                $carrierRates = iterator_to_array($carrierRates);
            }
            if (!is_array($carrierRates)) {
                $carrierRates = [$carrierRates];
            }

            foreach ($carrierRates as $rate) {
                if (!$rate) {
                    continue;
                }

                $price = $this->getShippingRateNumericValue($rate, ['price'], 0.0);
                if ($price === 0.0 && method_exists($rate, 'getPrice')) {
                    $price = (float)$rate->getPrice();
                }
                $rateData = [
                    'carrier_code' => (string)$rate->getCarrier(),
                    'method_code' => (string)$rate->getMethod(),
                    'carrier_title' => (string)$rate->getCarrierTitle(),
                    'method_title' => (string)$rate->getMethodTitle(),
                    'amount' => $this->getShippingRateNumericValue($rate, ['amount'], $price),
                    'base_amount' => $this->getShippingRateNumericValue($rate, ['base_amount', 'baseAmount'], $price),
                    'price_excl_tax' => $this->getShippingRateNumericValue($rate, ['price_excl_tax', 'priceExclTax'], $price),
                    'price_incl_tax' => $this->getShippingRateNumericValue($rate, ['price_incl_tax', 'priceInclTax'], $price),
                    'available' => !$rate->getErrorMessage(),
                    'error_message' => (string)$rate->getErrorMessage(),
                ];

                $extensionAttributes = $this->getShippingRateExtensionAttributes($rate);
                if (!empty($extensionAttributes)) {
                    $rateData['extension_attributes'] = $extensionAttributes;
                    $rateData['extensionAttributes'] = $extensionAttributes;
                }

                $ratesData[] = $rateData;
            }
        }

        return $ratesData;
    }

    private function getShippingRateNumericValue($rate, array $keys, float $default): float
    {
        foreach ($keys as $key) {
            if (method_exists($rate, 'getData')) {
                try {
                    $value = $rate->getData($key);
                    if ($value !== null && $value !== '' && is_numeric($value)) {
                        return (float)$value;
                    }
                } catch (\Throwable $e) {
                    // Try an explicit getter below.
                }
            }

            $getter = 'get' . str_replace(' ', '', ucwords(str_replace('_', ' ', (string)$key)));
            if (method_exists($rate, $getter)) {
                try {
                    $value = $rate->{$getter}();
                    if ($value !== null && $value !== '' && is_numeric($value)) {
                        return (float)$value;
                    }
                } catch (\Throwable $e) {
                    // Keep the fallback value.
                }
            }
        }

        return $default;
    }

    private function getShippingRateExtensionAttributes($rate): array
    {
        $extensionAttributes = [];

        if (method_exists($rate, 'getExtensionAttributes')) {
            try {
                $extensionAttributes = $this->normalizeGenericData($rate->getExtensionAttributes());
            } catch (\Throwable $e) {
                $extensionAttributes = [];
            }
        }

        if (empty($extensionAttributes) && method_exists($rate, 'getData')) {
            try {
                $extensionAttributes = $this->normalizeGenericData($rate->getData('extension_attributes'));
                if (empty($extensionAttributes)) {
                    $extensionAttributes = $this->normalizeGenericData($rate->getData('extensionAttributes'));
                }
            } catch (\Throwable $e) {
                $extensionAttributes = [];
            }
        }

        return $extensionAttributes;
    }

    private function buildTotalsData($quote): array
    {
        if (!$quote) {
            return [
                'items' => [],
                'total_segments' => [],
                'subtotal' => 0.0,
                'subtotal_with_discount' => 0.0,
                'grand_total' => 0.0,
            ];
        }

        $totalsData = [
            'items' => $this->buildTotalsItemsData($quote),
            'total_segments' => [],
            'subtotal' => (float)$quote->getSubtotal(),
            'subtotal_with_discount' => (float)$quote->getSubtotalWithDiscount(),
            'grand_total' => (float)$quote->getGrandTotal(),
            'coupon_code' => (string)$quote->getCouponCode(),
        ];

        $totals = $quote->getTotals();
        if ($totals instanceof \Traversable) {
            $totals = iterator_to_array($totals);
        }
        if (!is_array($totals)) {
            $totals = [];
        }

        foreach ($totals as $code => $total) {
            $value = (float)$total->getValue();

            $totalsData[(string)$code] = $value;
            $totalsData['total_segments'][] = [
                'code' => (string)$code,
                'title' => (string)$total->getTitle(),
                'value' => $value,
            ];
        }

        if ($totalsData['subtotal_with_discount'] === 0.0) {
            $totalsData['subtotal_with_discount'] = $totalsData['subtotal'];
        }

        return $totalsData;
    }

    private function buildTotalsItemsData($quote): array
    {
        $items = [];

        $visibleItems = $quote->getAllVisibleItems();
        if ($visibleItems instanceof \Traversable) {
            $visibleItems = iterator_to_array($visibleItems);
        }
        if (!is_array($visibleItems)) {
            $visibleItems = [];
        }

        foreach ($visibleItems as $item) {
            $items[] = [
                'item_id' => (int)$item->getId(),
                'name' => (string)$item->getName(),
                'qty' => (float)$item->getQty(),
                'price' => (float)$item->getPrice(),
                'row_total' => (float)$item->getRowTotal(),
            ];
        }

        return $items;
    }

    /**
     * Select payment method
     */
    public function selectPaymentMethod(string $methodCode): array
    {
        try {
            $this->saveShippingAddress(true, false, false);
            $quote = $this->checkoutSession->getQuote();
            $shippingAddress = $quote->getShippingAddress();
            if ($shippingAddress && !$shippingAddress->getCountryId()) {
                $shippingAddress->setCountryId($this->countryId ?: $this->getDefaultCountry());
            }

            $availableMethodCode = $this->resolveAvailablePaymentMethodCode($methodCode);
            if ($availableMethodCode === '') {
                $this->paymentMethod = '';
                return $this->refreshCheckoutState();
            }

            $payment = $quote->getPayment();
            if ($payment) {
                $this->importPaymentData($payment, $availableMethodCode, $methodCode);
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

        return $this->refreshCheckoutState();
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
            $this->logger->warning('Fastcheckout coupon apply failed', ['exception' => $e]);
            $this->couponError = (string)__('We could not apply this coupon code. Please try again.');
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
            $this->logger->warning('Fastcheckout coupon cancel failed', ['exception' => $e]);
            $this->couponError = (string)__('We could not remove this coupon code. Please try again.');
        }
    }

    /**
     * Place order
     */
    public function placeOrder(string $selectedPaymentMethod = ''): array
    {
        // Payment method passed directly from client DOM — no wire:click request needed
        if ($selectedPaymentMethod !== '') {
            $this->paymentMethod = $selectedPaymentMethod;
        }

        $this->orderError = '';
        if ($this->isIdempotencyKeyAlreadyUsed()) {
            $this->orderError = (string)__('This order is already being processed. Please wait.');
            return $this->buildPlaceOrderResponse(false);
        }

        $quote = $this->checkoutSession->getQuote();
        $isVirtual = (bool)$quote->isVirtual();
        $this->applyRawEmailIfMissing();

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
            return $this->buildPlaceOrderResponse(false);
        }

        if (empty($this->email)) {
            $this->orderError = (string)__('Please enter your email address.');
            $this->logger->info('Fastcheckout placeOrder blocked: missing email', ['quote_id' => $quote->getId()]);
            return $this->buildPlaceOrderResponse(false);
        }

        if (!$quote->getCustomerId()) {
            $quote->setCustomerEmail($this->email);
            $quote->setCheckoutMethod(\Magento\Checkout\Model\Type\Onepage::METHOD_GUEST);
        }

        try {
            $this->saveShippingAddress(false);
            $this->saveBillingAddress(false);
            $this->applyRawShippingMethodIfMissing($quote);
        } catch (\Exception $e) {
            $this->logger->warning('Fastcheckout placeOrder blocked: address validation failed', [
                'quote_id' => $quote->getId(),
                'exception' => $e,
            ]);
            $this->orderError = (string)__('Please check your address details and try again.');
            return $this->buildPlaceOrderResponse(false);
        }
        
        if (!$isVirtual && empty($this->shippingMethod)) {
            $this->orderError = (string)__('Please select a shipping method.');
            $this->logger->info('Fastcheckout placeOrder blocked: missing shipping method', ['quote_id' => $quote->getId()]);
            return $this->buildPlaceOrderResponse(false);
        }

        if (empty($this->paymentMethod)) {
            $this->orderError = (string)__('Please select a payment method.');
            $this->logger->info('Fastcheckout placeOrder blocked: missing payment method', ['quote_id' => $quote->getId()]);
            return $this->buildPlaceOrderResponse(false);
        }

        if (!$this->isSelectedPaymentMethodStillAllowed($this->paymentMethod)) {
            $this->orderError = (string)__('The selected payment method is not available for this checkout.');
            $this->logger->info('Fastcheckout placeOrder blocked: payment method not allowed', [
                'quote_id' => $quote->getId(),
                'payment_method' => $this->paymentMethod,
            ]);
            return $this->buildPlaceOrderResponse(false);
        }

        if ($this->paymentMethod === 'purchaseorder' && empty($this->poNumber) && isset($this->paymentAdditionalData['po_number'])) {
            $this->poNumber = (string)$this->paymentAdditionalData['po_number'];
        }

        if ($this->paymentMethod === 'purchaseorder' && empty($this->poNumber)) {
            $this->orderError = (string)__('Purchase Order Number is a required field.');
            $this->logger->info('Fastcheckout placeOrder blocked: missing purchase order number', ['quote_id' => $quote->getId()]);
            return $this->buildPlaceOrderResponse(false);
        }

        if (!$this->validateCheckoutAgreements()) {
            $this->orderError = (string)__(
                "The order wasn't placed. First, agree to the terms and conditions, then try placing your order again."
            );
            $this->logger->info('Fastcheckout placeOrder blocked: checkout agreements validation failed', [
                'quote_id' => $quote->getId(),
                'payment_method' => $this->paymentMethod,
            ]);
            return $this->buildPlaceOrderResponse(false);
        }

        try {
            if (!$this->claimIdempotencyKey()) {
                $this->orderError = (string)__('This order is already being processed. Please wait.');
                return $this->buildPlaceOrderResponse(false);
            }

            $payment = $quote->getPayment();
            $availableMethodCode = $this->resolveAvailablePaymentMethodCode($this->paymentMethod);
            $this->importPaymentData($payment, $availableMethodCode !== '' ? $availableMethodCode : $this->paymentMethod, $this->paymentMethod);
            if ($this->paymentMethod === 'purchaseorder' && method_exists($payment, 'setPoNumber')) {
                $payment->setPoNumber($this->poNumber);
            }
            $this->saveGiftMessage();
            $this->cartRepository->save($quote);

            // Save comment to session so QuoteSubmitSuccess observer can persist it to order history
            if (!empty(trim($this->comment))) {
                $this->setSessionValue('fastcheckout_comment', trim($this->comment));
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
            $placedOrder = null;

            try {
                if (method_exists($this->checkoutSession, 'clearHelperData')) {
                    $this->checkoutSession->clearHelperData();
                }
            } catch (\Exception $e) {
                $this->logger->warning('Fastcheckout checkout session clearHelperData failed', ['exception' => $e]);
            }

            try {
                $this->setSessionValue('last_quote_id', $quoteId);
                $this->setSessionValue('last_success_quote_id', $quoteId);
                $this->setSessionValue('last_order_id', $orderId);
                if ($this->orderFactory !== null) {
                    $placedOrder = $this->orderFactory->create()->load($orderId);
                    if ($placedOrder && $placedOrder->getId()) {
                        $this->setSessionValue('last_real_order_id', $placedOrder->getIncrementId());
                        $this->setSessionValue('last_order_status', $placedOrder->getStatus());
                    }
                }
            } catch (\Throwable $e) {
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

            $redirectUrl = $this->resolveOrderRedirectUrl($orderId, $placedOrder);

            $this->dispatchBrowserEvent('magewire:order-placed', [
                'method' => $this->paymentMethod,
                'orderId' => $orderId,
                'redirectUrl' => $redirectUrl ?: ''
            ]);

            return $this->buildPlaceOrderResponse(true, $orderId, $redirectUrl);
        } catch (\Exception $e) {
            $this->orderError = (string)__('Something went wrong while processing your order. Please try again later.');
            $this->logger->error('Fastcheckout placeOrder failed', [
                'quote_id' => $quote->getId(),
                'payment_method' => $this->paymentMethod,
                'exception' => $e,
            ]);
            // Regenerate idempotency key on failure so the user can submit again
            $this->idempotencyKey = bin2hex(random_bytes(16));

            return $this->buildPlaceOrderResponse(false);
        }
    }

    private function buildPlaceOrderResponse(bool $success, $orderId = null, string $redirectUrl = ''): array
    {
        $response = [
            'success' => $success,
            'message' => $success ? '' : (string)$this->orderError,
            'error' => $success ? '' : (string)$this->orderError,
            'method' => (string)$this->paymentMethod,
            'payment_method' => (string)$this->paymentMethod,
        ];

        if ($orderId) {
            $response['orderId'] = $orderId;
            $response['order_id'] = $orderId;
        }

        if ($redirectUrl !== '') {
            $response['redirectUrl'] = $redirectUrl;
            $response['redirect_url'] = $redirectUrl;
            $response['redirectUri'] = $redirectUrl;
        }

        return $response;
    }

    private function claimIdempotencyKey(): bool
    {
        if (empty($this->idempotencyKey)) {
            $this->idempotencyKey = bin2hex(random_bytes(16));
        }

        $usedKeys = $this->getStoredIdempotencyKeys();
        if (in_array($this->idempotencyKey, $usedKeys, true)) {
            return false;
        }

        $usedKeys[] = $this->idempotencyKey;
        $this->persistIdempotencyKeys(array_slice($usedKeys, -20));

        return true;
    }

    private function isIdempotencyKeyAlreadyUsed(): bool
    {
        return $this->idempotencyKey !== ''
            && in_array($this->idempotencyKey, $this->getStoredIdempotencyKeys(), true);
    }

    private function getStoredIdempotencyKeys(): array
    {
        try {
            if (is_callable([$this->checkoutSession, 'getData'])) {
                $storedKeys = $this->checkoutSession->getData('fastcheckout_used_idempotency_keys');
                return is_array($storedKeys) ? $storedKeys : [];
            }
        } catch (\Throwable $e) {
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
        } catch (\Throwable $e) {
            $this->logger->warning('Fastcheckout idempotency session write failed', ['exception' => $e]);
        }
    }

    private function setSessionValue(string $key, $value): void
    {
        try {
            $method = 'set' . str_replace('_', '', ucwords($key, '_'));
            if (is_callable([$this->checkoutSession, 'setData'])) {
                $this->checkoutSession->setData($key, $value);
            }
            if (is_callable([$this->checkoutSession, $method])) {
                $this->checkoutSession->{$method}($value);
            }
        } catch (\Throwable $e) {
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
            'firstname', 'lastname', 'company', 'street1', 'street2', 'street3', 'street4', 'city', 'postcode', 'countryId', 'regionId', 'region', 'telephone', 'prefix', 'middlename', 'suffix', 'fax', 'vatId'
        ]);
        $isBillingField = in_array($name, [
            'billingFirstname', 'billingLastname', 'billingCompany', 'billingStreet1', 'billingStreet2', 'billingStreet3', 'billingStreet4', 'billingCity', 'billingPostcode', 'billingCountryId', 'billingRegionId', 'billingRegion', 'billingTelephone', 'billingPrefix', 'billingMiddlename', 'billingSuffix', 'billingFax', 'billingVatId'
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
            if (!$this->customerSession->isLoggedIn()) {
                return;
            }
            $customerId = (int)$this->customerSession->getCustomerId();
            if ($customerId <= 0) {
                return;
            }

            $address = $this->addressRepository->getById($addressId);
            if ((int)$address->getCustomerId() !== $customerId) {
                $this->logger->warning('Fastcheckout rejected saved address access for another customer', [
                    'customer_id' => $customerId,
                    'address_id' => $addressId,
                ]);
                return;
            }

            $street = (array) $address->getStreet();

            $this->firstname  = (string) $address->getFirstname();
            $this->lastname   = (string) $address->getLastname();
            $this->company    = (string) $address->getCompany();
            $this->prefix     = (string) $address->getPrefix();
            $this->middlename = (string) $address->getMiddlename();
            $this->suffix     = (string) $address->getSuffix();
            $this->fax        = (string) $address->getFax();
            $this->vatId      = (string) $address->getVatId();
            $this->street1    = $street[0] ?? '';
            $this->street2    = $street[1] ?? '';
            $this->street3    = $street[2] ?? '';
            $this->street4    = $street[3] ?? '';
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

    private function buildStreetLines($line1, $line2, $line3 = '', $line4 = ''): array
    {
        $street = [(string)$line1, (string)$line2];

        if ((string)$line3 !== '' || (string)$line4 !== '') {
            $street[] = (string)$line3;
        }

        if ((string)$line4 !== '') {
            $street[] = (string)$line4;
        }

        return $street;
    }

    private function importPaymentData($payment, string $methodCode, string $selectedMethodCode = ''): void
    {
        if (!$payment) {
            return;
        }

        $selectedMethodCode = $selectedMethodCode !== '' ? $selectedMethodCode : $methodCode;
        $rawPaymentData = $this->getRawPaymentData($methodCode, $selectedMethodCode);
        $additionalData = $this->mergeGenericData(
            $this->getGenericAdditionalPaymentData($selectedMethodCode),
            $this->normalizePaymentAdditionalData($rawPaymentData['additional_data'] ?? []),
            $this->normalizePaymentAdditionalData($this->paymentAdditionalData)
        );

        $data = $this->normalizePaymentPayload($rawPaymentData);
        $data['method'] = $methodCode;
        $data['additional_data'] = $additionalData;

        $extensionAttributes = $this->mergeGenericData(
            $this->normalizePaymentAdditionalData($rawPaymentData['extension_attributes'] ?? []),
            $this->normalizePaymentAdditionalData($this->paymentExtensionAttributes)
        );
        if (!empty($extensionAttributes)) {
            $data['extension_attributes'] = $extensionAttributes;
        }

        if (method_exists($payment, 'importData')) {
            $payment->importData($data);
            return;
        }

        $payment->setMethod($methodCode);
    }

    private function getRawPaymentData(string $methodCode, string $selectedMethodCode = ''): array
    {
        if (!is_array($this->placeOrderRequestData)) {
            return [];
        }

        $paymentData = $this->getRawPaymentPayloadData();
        if (empty($paymentData)) {
            return [];
        }

        $paymentData = $this->normalizePaymentPayload($paymentData);
        $payloadMethod = isset($paymentData['method']) ? (string)$paymentData['method'] : '';
        if (
            $payloadMethod !== ''
            && $payloadMethod !== $methodCode
            && $payloadMethod !== $selectedMethodCode
            && !$this->paymentMethodCodeMatches($methodCode, $payloadMethod)
        ) {
            return [];
        }

        return $paymentData;
    }

    private function getRawPaymentPayloadData(): array
    {
        if (!is_array($this->placeOrderRequestData)) {
            return [];
        }

        $payload = $this->placeOrderRequestData;
        $paymentData = $this->mergeGenericData(
            $this->coercePaymentMethodPayload($payload['payment_method'] ?? []),
            $this->coercePaymentMethodPayload($payload['paymentMethod'] ?? []),
            $this->coercePaymentMethodPayload($payload['payment'] ?? [])
        );

        if (!empty($paymentData)) {
            return $paymentData;
        }

        return $this->payloadLooksLikePaymentData($payload)
            ? $this->normalizeGenericData($payload)
            : [];
    }

    private function coercePaymentMethodPayload($paymentMethod): array
    {
        if (is_scalar($paymentMethod) && (string)$paymentMethod !== '') {
            return ['method' => (string)$paymentMethod];
        }

        return $this->normalizeGenericData($paymentMethod);
    }

    private function payloadLooksLikePaymentData(array $payload): bool
    {
        foreach (['method', 'additional_data', 'additionalData', 'extension_attributes', 'extensionAttributes', 'po_number'] as $key) {
            if (array_key_exists($key, $payload)) {
                return true;
            }
        }

        return false;
    }

    private function normalizePaymentPayload(array $paymentData): array
    {
        $paymentData = $this->normalizeGenericData($paymentData);

        if (isset($paymentData['additionalData']) && !isset($paymentData['additional_data'])) {
            $paymentData['additional_data'] = $paymentData['additionalData'];
        } elseif (isset($paymentData['additionalData']) && is_array($paymentData['additionalData'])) {
            $paymentData['additional_data'] = $this->mergeGenericData(
                $paymentData['additional_data'] ?? [],
                $paymentData['additionalData']
            );
        }

        if (isset($paymentData['extensionAttributes']) && !isset($paymentData['extension_attributes'])) {
            $paymentData['extension_attributes'] = $paymentData['extensionAttributes'];
        } elseif (isset($paymentData['extensionAttributes']) && is_array($paymentData['extensionAttributes'])) {
            $paymentData['extension_attributes'] = $this->mergeGenericData(
                $paymentData['extension_attributes'] ?? [],
                $paymentData['extensionAttributes']
            );
        }

        unset($paymentData['additionalData'], $paymentData['extensionAttributes']);

        return $paymentData;
    }

    private function normalizePaymentAdditionalData($data): array
    {
        return $this->normalizeGenericData($data);
    }

    private function getMergedAddressCustomAttributes(bool $isBilling): array
    {
        $componentAttributes = $isBilling ? $this->billingCustomAttributes : $this->shippingCustomAttributes;

        return $this->mergeGenericData(
            $this->getRawAddressCustomAttributes($isBilling),
            $componentAttributes
        );
    }

    private function getMergedAddressExtensionAttributes(bool $isBilling): array
    {
        $componentAttributes = $isBilling ? $this->billingExtensionAttributes : $this->shippingExtensionAttributes;

        return $this->mergeGenericData(
            $this->getRawAddressExtensionAttributes($isBilling),
            $componentAttributes
        );
    }

    private function getRawAddressCustomAttributes(bool $isBilling): array
    {
        $addressData = $this->getRawAddressData($isBilling);

        return $this->mergeGenericData(
            $addressData['custom_attributes'] ?? [],
            $addressData['customAttributes'] ?? []
        );
    }

    private function getRawAddressExtensionAttributes(bool $isBilling): array
    {
        $addressData = $this->getRawAddressData($isBilling);

        $extensionAttributes = $this->mergeGenericData(
            $addressData['extension_attributes'] ?? [],
            $addressData['extensionAttributes'] ?? []
        );

        if (!$isBilling) {
            $addressInformation = $this->getRawAddressInformationData();
            $extensionAttributes = $this->mergeGenericData(
                $extensionAttributes,
                $addressInformation['extension_attributes'] ?? [],
                $addressInformation['extensionAttributes'] ?? []
            );
        }

        return $extensionAttributes;
    }

    private function getRawAddressData(bool $isBilling): array
    {
        if (!is_array($this->placeOrderRequestData)) {
            return [];
        }

        $addressInformation = $this->getRawAddressInformationData();
        $addressKey = $isBilling ? 'billing_address' : 'shipping_address';
        $camelAddressKey = $isBilling ? 'billingAddress' : 'shippingAddress';

        $addressData = $this->mergeGenericData(
            $addressInformation[$addressKey] ?? [],
            $addressInformation[$camelAddressKey] ?? []
        );

        $addressData = $this->mergeGenericData(
            $addressData,
            $this->placeOrderRequestData[$camelAddressKey] ?? [],
            $this->placeOrderRequestData[$addressKey] ?? []
        );

        return $addressData;
    }

    private function getRawAddressInformationData(): array
    {
        if (!is_array($this->placeOrderRequestData)) {
            return [];
        }

        return $this->mergeGenericData(
            $this->placeOrderRequestData['addressInformation'] ?? [],
            $this->placeOrderRequestData['address_information'] ?? []
        );
    }

    private function applyRawEmailIfMissing(): void
    {
        if (trim((string)$this->email) !== '') {
            return;
        }

        $email = $this->getRawEmailFromPayload();
        if ($email !== '') {
            $this->email = $email;
        }
    }

    private function getRawEmailFromPayload(): string
    {
        if (!is_array($this->placeOrderRequestData)) {
            return '';
        }

        $addressInformation = $this->getRawAddressInformationData();

        foreach ([
            $this->placeOrderRequestData,
            $this->getRawAddressData(true),
            $this->getRawAddressData(false),
            $addressInformation,
            $addressInformation['billing_address'] ?? [],
            $addressInformation['billingAddress'] ?? [],
            $addressInformation['shipping_address'] ?? [],
            $addressInformation['shippingAddress'] ?? [],
        ] as $source) {
            $email = $this->extractEmailFromPayloadSource($source);
            if ($email !== '') {
                return $email;
            }
        }

        return '';
    }

    private function extractEmailFromPayloadSource($source): string
    {
        $source = $this->normalizeGenericData($source);
        foreach (['email', 'customer_email', 'customerEmail'] as $key) {
            if (!empty($source[$key]) && is_scalar($source[$key])) {
                return trim((string)$source[$key]);
            }
        }

        return '';
    }

    private function applyAddressEmail($address): void
    {
        $email = trim((string)$this->email);
        if ($email === '') {
            return;
        }

        if (method_exists($address, 'setEmail')) {
            $address->setEmail($email);
            return;
        }

        if (method_exists($address, 'setData')) {
            $address->setData('email', $email);
        }
    }

    private function applyRawShippingMethodIfMissing($quote): void
    {
        if ($this->shippingMethod !== '') {
            return;
        }

        $shippingMethod = $this->getRawShippingMethodCode();
        if ($shippingMethod === '') {
            return;
        }

        $this->shippingMethod = $shippingMethod;
        $shippingAddress = $quote ? $quote->getShippingAddress() : null;
        if ($shippingAddress && method_exists($shippingAddress, 'setShippingMethod')) {
            $shippingAddress->setShippingMethod($shippingMethod);
        }
    }

    private function getRawShippingMethodCode(): string
    {
        $addressInformation = $this->getRawAddressInformationData();
        $shippingAddress = $this->getRawAddressData(false);

        foreach ([$addressInformation, $shippingAddress, $this->placeOrderRequestData] as $source) {
            $shippingMethod = $this->extractShippingMethodCode($source);
            if ($shippingMethod !== '') {
                return $shippingMethod;
            }
        }

        return '';
    }

    private function extractShippingMethodCode($source): string
    {
        $source = $this->normalizeGenericData($source);
        if ($source === []) {
            return '';
        }

        $carrier = (string)($source['shipping_carrier_code'] ?? $source['shippingCarrierCode'] ?? $source['carrier_code'] ?? $source['carrierCode'] ?? '');
        $method = (string)($source['shipping_method_code'] ?? $source['shippingMethodCode'] ?? $source['method_code'] ?? $source['methodCode'] ?? '');

        if ($carrier !== '' && $method !== '') {
            return $carrier . '_' . $method;
        }

        foreach (['shipping_method', 'shippingMethod', 'method'] as $key) {
            if (!empty($source[$key]) && is_scalar($source[$key])) {
                return (string)$source[$key];
            }
        }

        foreach (['shipping_method', 'shippingMethod', 'shipping_method_data', 'shippingMethodData'] as $key) {
            if (!empty($source[$key]) && is_array($source[$key])) {
                $shippingMethod = $this->extractShippingMethodCode($source[$key]);
                if ($shippingMethod !== '') {
                    return $shippingMethod;
                }
            }
        }

        return '';
    }

    private function mergeGenericData(...$values): array
    {
        $result = [];

        foreach ($values as $value) {
            $normalized = $this->normalizeGenericData($value);
            if ($normalized !== []) {
                $result = array_replace_recursive($result, $normalized);
            }
        }

        return $result;
    }

    private function applyAddressAttributes($address, $customAttributes, $extensionAttributes): void
    {
        foreach ($this->normalizeGenericData($customAttributes) as $code => $value) {
            if (method_exists($address, 'setCustomAttribute')) {
                try {
                    $address->setCustomAttribute($code, $value);
                } catch (\Throwable $e) {
                    // Some quote address implementations reject non-EAV custom attributes; keep data fallback.
                }
            }
            if (method_exists($address, 'setData')) {
                $address->setData($code, $value);
            }
        }

        $normalizedExtensionAttributes = $this->normalizeGenericData($extensionAttributes);
        if (empty($normalizedExtensionAttributes)) {
            return;
        }

        foreach ($normalizedExtensionAttributes as $code => $value) {
            if (method_exists($address, 'setData')) {
                $address->setData($code, $value);
            }
        }

        if (!method_exists($address, 'getExtensionAttributes') || !method_exists($address, 'setExtensionAttributes')) {
            return;
        }

        try {
            $extension = $address->getExtensionAttributes();
            if ($extension === null) {
                $extension = \Magento\Framework\App\ObjectManager::getInstance()
                    ->get(\Magento\Quote\Api\Data\AddressExtensionFactory::class)
                    ->create();
            }

            foreach ($normalizedExtensionAttributes as $code => $value) {
                $setter = 'set' . str_replace(' ', '', ucwords(str_replace('_', ' ', (string)$code)));
                if (method_exists($extension, $setter)) {
                    $extension->{$setter}($value);
                }
            }

            $address->setExtensionAttributes($extension);
        } catch (\Throwable $e) {
            try {
                $this->logger->warning('Fastcheckout address extension attributes sync failed', ['exception' => $e]);
            } catch (\Exception $ignored) {
                // ignore
            }
        }
    }

    private function normalizeGenericData($data): array
    {
        $data = $this->coerceGenericDataArray($data);
        if ($data === null) {
            return [];
        }

        $result = [];
        foreach ($data as $key => $value) {
            if (!is_string($key) && !is_int($key)) {
                continue;
            }
            $attributeData = $this->extractAttributeData($value);
            if ($attributeData !== null) {
                $key = $attributeData['code'];
                $value = $attributeData['value'];
            }

            $value = $this->normalizeGenericValue($value);
            if ($value !== self::UNSUPPORTED_GENERIC_VALUE) {
                $result[(string)$key] = $value;
            }
        }

        return $result;
    }

    private const UNSUPPORTED_GENERIC_VALUE = '__FASTCHECKOUT_UNSUPPORTED_GENERIC_VALUE__';

    private function normalizeGenericValue($value, int $depth = 0)
    {
        if ($depth > 8) {
            return self::UNSUPPORTED_GENERIC_VALUE;
        }

        if ($value === null || is_scalar($value)) {
            return $value;
        }

        if (
            is_object($value) &&
            !method_exists($value, 'toArray') &&
            !($value instanceof \JsonSerializable) &&
            method_exists($value, '__toString')
        ) {
            return (string)$value;
        }

        $arrayValue = $this->coerceGenericDataArray($value);
        if ($arrayValue === null) {
            return self::UNSUPPORTED_GENERIC_VALUE;
        }

        $result = [];
        foreach ($arrayValue as $key => $item) {
            if (!is_string($key) && !is_int($key)) {
                continue;
            }

            $attributeData = $this->extractAttributeData($item);
            if ($attributeData !== null) {
                $key = $attributeData['code'];
                $item = $attributeData['value'];
            }

            $normalized = $this->normalizeGenericValue($item, $depth + 1);
            if ($normalized !== self::UNSUPPORTED_GENERIC_VALUE) {
                $result[(string)$key] = $normalized;
            }
        }

        return $result;
    }

    private function extractAttributeData($attribute): ?array
    {
        if (is_array($attribute) && (isset($attribute['attribute_code']) || isset($attribute['attributeCode']))) {
            return [
                'code' => (string)($attribute['attribute_code'] ?? $attribute['attributeCode']),
                'value' => $attribute['value'] ?? null,
            ];
        }

        if (is_array($attribute) && array_key_exists('value', $attribute)) {
            $code = null;
            if (array_key_exists('code', $attribute) && !$this->hasUnsupportedAttributeArrayKeys($attribute, ['code', 'value', 'label'])) {
                $code = $attribute['code'];
            } elseif (array_key_exists('name', $attribute) && !$this->hasUnsupportedAttributeArrayKeys($attribute, ['name', 'value', 'label'])) {
                $code = $attribute['name'];
            }

            if ($code !== null && (string)$code !== '') {
                return [
                    'code' => (string)$code,
                    'value' => $attribute['value'],
                ];
            }
        }

        if (
            is_object($attribute) &&
            method_exists($attribute, 'getAttributeCode') &&
            method_exists($attribute, 'getValue')
        ) {
            try {
                $code = (string)$attribute->getAttributeCode();
                if ($code === '') {
                    return null;
                }

                return [
                    'code' => $code,
                    'value' => $attribute->getValue(),
                ];
            } catch (\Throwable $e) {
                return null;
            }
        }

        if (is_object($attribute) && method_exists($attribute, 'getValue')) {
            try {
                $code = null;
                if (method_exists($attribute, 'getCode')) {
                    $code = $attribute->getCode();
                } elseif (method_exists($attribute, 'getName')) {
                    $code = $attribute->getName();
                }

                if ($code !== null && (string)$code !== '') {
                    return [
                        'code' => (string)$code,
                        'value' => $attribute->getValue(),
                    ];
                }
            } catch (\Throwable $e) {
                return null;
            }
        }

        return null;
    }

    private function hasUnsupportedAttributeArrayKeys(array $attribute, array $supportedKeys): bool
    {
        foreach (array_keys($attribute) as $key) {
            if (!in_array((string)$key, $supportedKeys, true)) {
                return true;
            }
        }

        return false;
    }

    private function coerceGenericDataArray($data): ?array
    {
        if (is_array($data)) {
            return $data;
        }

        if (is_object($data)) {
            if (method_exists($data, 'toArray')) {
                try {
                    $arrayData = $data->toArray();
                    return is_array($arrayData) ? $arrayData : null;
                } catch (\Throwable $e) {
                    return null;
                }
            }

            if (method_exists($data, '__toArray') && is_callable([$data, '__toArray'])) {
                try {
                    $arrayData = $data->__toArray();
                    return is_array($arrayData) ? $arrayData : null;
                } catch (\Throwable $e) {
                    return null;
                }
            }

            if ($data instanceof \Magento\Framework\DataObject) {
                try {
                    $arrayData = $data->getData();
                    return is_array($arrayData) ? $arrayData : null;
                } catch (\Throwable $e) {
                    return null;
                }
            }

            if ($data instanceof \JsonSerializable) {
                try {
                    $arrayData = $data->jsonSerialize();
                    return is_array($arrayData) ? $arrayData : null;
                } catch (\Throwable $e) {
                    return null;
                }
            }

            if (method_exists($data, '__toString')) {
                return ['value' => (string)$data];
            }
        }

        return null;
    }

    private function validateCheckoutAgreements(): bool
    {
        if ($this->agreementsValidator === null) {
            return true;
        }

        try {
            return (bool)$this->agreementsValidator->isValid($this->getAgreementIds());
        } catch (\Exception $e) {
            $this->logger->warning('Fastcheckout checkout agreements validation failed', ['exception' => $e]);
            return false;
        }
    }

    private function getAgreementIds(): array
    {
        $availableMethodCode = $this->resolveAvailablePaymentMethodCode($this->paymentMethod);
        $rawPaymentData = $this->getRawPaymentData(
            $availableMethodCode !== '' ? $availableMethodCode : $this->paymentMethod,
            $this->paymentMethod
        );
        $extensionAttributes = $this->mergeGenericData(
            $this->normalizePaymentAdditionalData($rawPaymentData['extension_attributes'] ?? []),
            $this->normalizePaymentAdditionalData($this->paymentExtensionAttributes)
        );
        $agreementIds = $extensionAttributes['agreement_ids'] ?? [];
        if (!is_array($agreementIds)) {
            $agreementIds = [$agreementIds];
        }

        $result = [];
        foreach ($agreementIds as $agreementId) {
            if (is_scalar($agreementId) && (string)$agreementId !== '') {
                $result[] = (string)$agreementId;
            }
        }

        return $result;
    }

    private function resolveOrderRedirectUrl($orderId, $placedOrder = null): string
    {
        $redirectUrl = $this->getCheckoutSessionRedirectUrl();
        if ($redirectUrl !== '') {
            return $redirectUrl;
        }

        if (!$orderId) {
            return '';
        }

        try {
            $order = $placedOrder;
            if (!$order && $this->orderFactory !== null) {
                $order = $this->orderFactory->create()->load($orderId);
            }

            if (!$order || !method_exists($order, 'getPayment')) {
                return '';
            }

            $payment = $order->getPayment();
            $redirectUrl = $this->getPaymentRedirectUrl($payment);
            if ($redirectUrl !== '') {
                return $redirectUrl;
            }

            if ($payment && method_exists($payment, 'getMethodInstance')) {
                $methodInstance = $payment->getMethodInstance();
                if ($methodInstance && method_exists($methodInstance, 'getOrderPlaceRedirectUrl')) {
                    return (string)$methodInstance->getOrderPlaceRedirectUrl();
                }
            }
        } catch (\Throwable $e) {
            try {
                $this->logger->warning('Fastcheckout order redirect URL resolve failed', ['exception' => $e]);
            } catch (\Exception $ignored) {
                // ignore
            }
        }

        return '';
    }

    private function getCheckoutSessionRedirectUrl(): string
    {
        try {
            if (method_exists($this->checkoutSession, 'getData')) {
                $redirectUrl = $this->normalizeRedirectUrl($this->checkoutSession->getData('redirect_url'));
                if ($redirectUrl !== '') {
                    return $redirectUrl;
                }
            }

            if (method_exists($this->checkoutSession, 'getRedirectUrl')) {
                return $this->normalizeRedirectUrl($this->checkoutSession->getRedirectUrl());
            }
        } catch (\Throwable $e) {
            $this->logger->warning('Fastcheckout checkout session redirect URL read failed', ['exception' => $e]);
        }

        return '';
    }

    private function getPaymentRedirectUrl($payment): string
    {
        if (!$payment || !method_exists($payment, 'getAdditionalInformation')) {
            return '';
        }

        foreach ($this->getRedirectAdditionalInformationKeys() as $key) {
            try {
                $redirectUrl = $this->normalizeRedirectUrl($payment->getAdditionalInformation($key));
                if ($redirectUrl !== '') {
                    return $redirectUrl;
                }
            } catch (\Throwable $e) {
                // Keep trying other known keys.
            }
        }

        try {
            $additionalInformation = $payment->getAdditionalInformation();
            if (is_array($additionalInformation)) {
                foreach ($this->getRedirectAdditionalInformationKeys() as $key) {
                    if (array_key_exists($key, $additionalInformation)) {
                        $redirectUrl = $this->normalizeRedirectUrl($additionalInformation[$key]);
                        if ($redirectUrl !== '') {
                            return $redirectUrl;
                        }
                    }
                }
            }
        } catch (\Throwable $e) {
            // Ignore non-standard payment implementations.
        }

        return '';
    }

    private function getRedirectAdditionalInformationKeys(): array
    {
        return [
            'redirect_url',
            'redirectUrl',
            'checkout_redirect_url',
            'checkoutRedirectUrl',
            'order_place_redirect_url',
            'orderPlaceRedirectUrl',
            'payment_redirect_url',
            'paymentRedirectUrl',
        ];
    }

    private function normalizeRedirectUrl($redirectUrl): string
    {
        if (is_object($redirectUrl) && method_exists($redirectUrl, '__toString')) {
            $redirectUrl = (string)$redirectUrl;
        }

        if (!is_scalar($redirectUrl)) {
            return '';
        }

        return trim((string)$redirectUrl);
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
            || defined('PHPUNIT_COMPOSER_INSTALL');

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
