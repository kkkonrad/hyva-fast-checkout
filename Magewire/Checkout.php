<?php

declare(strict_types=1);

namespace IWD\Opc\Magewire;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\ShippingMethodManagementInterface;
use Magento\Quote\Api\PaymentMethodManagementInterface;
use Magento\Quote\Api\CartManagementInterface;
use Magewirephp\Magewire\Component;

class Checkout extends Component
{
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
    public $countryId = 'PL';
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
    public $billingCountryId = 'PL';
    public $billingRegionId = '';
    public $billingRegion = '';
    public $billingTelephone = '';

    /**
     * Checkout states
     */
    public $shippingMethod = '';
    public $paymentMethod = '';
    public $couponCode = '';
    public $subscribe = false;

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
    private $opcHelper;

    /**
     * @param CheckoutSession $checkoutSession
     * @param CartRepositoryInterface $cartRepository
     * @param ShippingMethodManagementInterface $shippingMethodManagement
     * @param PaymentMethodManagementInterface $paymentMethodManagement
     * @param CartManagementInterface $cartManagement
     * @param \Magento\Directory\Model\ResourceModel\Country\CollectionFactory $countryCollectionFactory
     * @param \Magento\Directory\Model\ResourceModel\Region\CollectionFactory $regionCollectionFactory
     * @param \Magento\Newsletter\Model\SubscriberFactory $subscriberFactory
     * @param \IWD\Opc\Helper\Data $opcHelper
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
        \IWD\Opc\Helper\Data $opcHelper
    ) {
        $this->checkoutSession = $checkoutSession;
        $this->cartRepository = $cartRepository;
        $this->shippingMethodManagement = $shippingMethodManagement;
        $this->paymentMethodManagement = $paymentMethodManagement;
        $this->cartManagement = $cartManagement;
        $this->countryCollectionFactory = $countryCollectionFactory;
        $this->regionCollectionFactory = $regionCollectionFactory;
        $this->subscriberFactory = $subscriberFactory;
        $this->opcHelper = $opcHelper;
    }

    /**
     * Initialize quote data on mount
     */
    public function mount(): void
    {
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
            $this->countryId = (string) ($shippingAddress->getCountryId() ?: 'PL');
            $regionIdVal = $shippingAddress->getRegionId();
            $this->regionId = (int)$regionIdVal > 0 ? (string)$regionIdVal : '';
            $this->region = (string) $shippingAddress->getRegion();
            $this->telephone = (string) $shippingAddress->getTelephone();
            
            if ($shippingAddress->getShippingMethod()) {
                $this->shippingMethod = $shippingAddress->getShippingMethod();
            } else {
                $defaultShipping = $this->opcHelper->getDefaultShippingMethod();
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
            $this->billingCountryId = (string) ($billingAddress->getCountryId() ?: 'PL');
            $billingRegionIdVal = $billingAddress->getRegionId();
            $this->billingRegionId = (int)$billingRegionIdVal > 0 ? (string)$billingRegionIdVal : '';
            $this->billingRegion = (string) $billingAddress->getRegion();
            $this->billingTelephone = (string) $billingAddress->getTelephone();
        }

        $payment = $quote->getPayment();
        if ($payment && $payment->getMethod()) {
            $this->paymentMethod = $payment->getMethod();
        } else {
            $defaultPayment = $this->opcHelper->getDefaultPaymentMethod();
            if ($defaultPayment) {
                $this->selectPaymentMethod($defaultPayment);
            }
        }
    }

    public function saveShippingAddress(bool $ignoreValidation = true, bool $saveQuote = true): void
    {
        try {
            \Magento\Framework\App\ObjectManager::getInstance()
                ->get(\Psr\Log\LoggerInterface::class)
                ->info('IWD OPC saveShippingAddress properties: ' . json_encode([
                    'firstname' => $this->firstname,
                    'lastname' => $this->lastname,
                    'street1' => $this->street1,
                    'street2' => $this->street2,
                    'city' => $this->city,
                    'postcode' => $this->postcode,
                    'countryId' => $this->countryId,
                    'regionId' => $this->regionId,
                    'region' => $this->region,
                    'telephone' => $this->telephone,
                    'company' => $this->company
                ]));
        } catch (\RuntimeException $e) {
            // ObjectManager not initialized in unit tests
        }

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
            $shippingAddress->setCollectShippingRates(true);
        }
        
        if ($this->billingSameAsShipping) {
            $this->saveBillingAddress($ignoreValidation, false);
        }

        if ($saveQuote) {
            try {
                $this->cartRepository->save($quote);
            } catch (\Exception $e) {
                try {
                    \Magento\Framework\App\ObjectManager::getInstance()
                        ->get(\Psr\Log\LoggerInterface::class)
                        ->error('IWD OPC Save Shipping Error: ' . $e->getMessage() . "\n" . $e->getTraceAsString());
                } catch (\RuntimeException $logEx) {
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
        try {
            \Magento\Framework\App\ObjectManager::getInstance()
                ->get(\Psr\Log\LoggerInterface::class)
                ->info('IWD OPC saveBillingAddress properties: SameAsShipping=' . var_export($this->billingSameAsShipping, true) . ', Data=' . json_encode([
                    'firstname' => $this->billingFirstname,
                    'lastname' => $this->billingLastname,
                    'street1' => $this->billingStreet1,
                    'street2' => $this->billingStreet2,
                    'city' => $this->billingCity,
                    'postcode' => $this->billingPostcode,
                    'countryId' => $this->billingCountryId,
                    'regionId' => $this->billingRegionId,
                    'region' => $this->billingRegion,
                    'telephone' => $this->billingTelephone,
                    'company' => $this->billingCompany
                ]));
        } catch (\RuntimeException $e) {
            // ObjectManager not initialized in unit tests
        }

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
                $this->cartRepository->save($quote);
            } catch (\Exception $e) {
                try {
                    \Magento\Framework\App\ObjectManager::getInstance()
                        ->get(\Psr\Log\LoggerInterface::class)
                        ->error('IWD OPC Save Billing Error: ' . $e->getMessage() . "\n" . $e->getTraceAsString());
                } catch (\RuntimeException $logEx) {
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
        if (empty($countryId)) {
            return false;
        }
        try {
            $directoryHelper = \Magento\Framework\App\ObjectManager::getInstance()
                ->get(\Magento\Directory\Helper\Data::class);
            return $directoryHelper->isRegionRequired($countryId);
        } catch (\RuntimeException $e) {
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
        $quote = $this->checkoutSession->getQuote();
        $shippingAddress = $quote->getShippingAddress();
        if ($shippingAddress) {
            $shippingAddress->setShippingMethod($methodCode);
            $shippingAddress->setCollectShippingRates(true);
            $quote->collectTotals();
            $this->cartRepository->save($quote);
            $this->shippingMethod = $methodCode;
        }
    }

    /**
     * Get available payment methods
     */
    public function getPaymentMethods(): array
    {
        $quote = $this->checkoutSession->getQuote();
        try {
            return $this->paymentMethodManagement->getList($quote->getId());
        } catch (\Exception $e) {
            return [];
        }
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
        
        try {
            $paymentHelper = \Magento\Framework\App\ObjectManager::getInstance()->get(\Magento\Payment\Helper\Data::class);
            $methodInstance = $paymentHelper->getMethodInstance($methodCode);
            
            if (method_exists($methodInstance, 'getInstructions')) {
                $details['instructions'] = (string) $methodInstance->getInstructions();
            } else {
                $details['instructions'] = (string) $methodInstance->getConfigData('instructions');
            }
            
            $details['payable_to'] = (string) $methodInstance->getConfigData('payable_to');
            $details['mailing_address'] = (string) $methodInstance->getConfigData('mailing_address');
        } catch (\Exception $e) {
            // ignore
        }
        
        return $details;
    }

    /**
     * Select payment method
     */
    public function selectPaymentMethod(string $methodCode): void
    {
        $quote = $this->checkoutSession->getQuote();
        $payment = $quote->getPayment();
        if ($payment) {
            $payment->setMethod($methodCode);
            $quote->collectTotals();
            $this->cartRepository->save($quote);
            $this->paymentMethod = $methodCode;
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
            if ($this->opcHelper->isReloadShippingOnDiscount()) {
                $quote->getShippingAddress()->setCollectShippingRates(true);
            }
            $quote->collectTotals();
            $this->cartRepository->save($quote);
            
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
            if ($this->opcHelper->isReloadShippingOnDiscount()) {
                $quote->getShippingAddress()->setCollectShippingRates(true);
            }
            $quote->collectTotals();
            $this->cartRepository->save($quote);
            $this->couponCode = '';
            $this->couponSuccess = (string)__('Coupon code canceled.');
        } catch (\Exception $e) {
            $this->couponError = $e->getMessage();
        }
    }

    /**
     * Place order
     */
    public function placeOrder(): void
    {
        $this->orderError = '';
        $quote = $this->checkoutSession->getQuote();

        if (empty($this->email)) {
            $this->orderError = (string)__('Please enter your email address.');
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
        
        if (!$quote->isVirtual() && empty($this->shippingMethod)) {
            $this->orderError = (string)__('Please select a shipping method.');
            return;
        }

        if (empty($this->paymentMethod)) {
            $this->orderError = (string)__('Please select a payment method.');
            return;
        }

        try {
            $quote->getPayment()->setMethod($this->paymentMethod);
            $this->cartRepository->save($quote);

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

            $this->checkoutSession->clearHelperData();

            try {
                $objectManager = \Magento\Framework\App\ObjectManager::getInstance();
                $order = $objectManager->create(\Magento\Sales\Model\Order::class)->load($orderId);
                
                $this->checkoutSession->setLastQuoteId($quoteId);
                $this->checkoutSession->setLastSuccessQuoteId($quoteId);
                $this->checkoutSession->setLastOrderId($orderId);
                $this->checkoutSession->setLastRealOrderId($order->getIncrementId());
                $this->checkoutSession->setLastOrderStatus($order->getStatus());
            } catch (\Exception $e) {
                // Ignore errors during session/order load (e.g. in unit tests)
            }
            
            $this->redirect('checkout/onepage/success');
        } catch (\Exception $e) {
            $this->orderError = $e->getMessage();
        }
    }

    /**
     * Listeners for reactive updates
     */
    public function updated($value, string $name)
    {
        try {
            \Magento\Framework\App\ObjectManager::getInstance()
                ->get(\Psr\Log\LoggerInterface::class)
                ->info('IWD OPC updated hook: Name = ' . $name . ', Value = ' . var_export($value, true));
        } catch (\RuntimeException $e) {
            // ObjectManager not initialized in unit tests
        }

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
                $this->cartRepository->save($quote);
            } catch (\Exception $e) {
                // Ignore
            }
        } elseif ($isShippingField) {
            $this->saveShippingAddress();
        } elseif ($isBillingField) {
            $this->saveBillingAddress();
        } elseif ($name === 'billingSameAsShipping') {
            $this->saveBillingAddress();
        }

        return $value;
    }
}
