<?php

namespace IWD\Opc\Cron;

use Magento\Store\Model\ScopeInterface;

class Report
{
    const API_URL = "https://api.iwdagency.com/addCheckoutSuite/";

    public $storeManager;
    public $scopeConfig;

    /**
     * @var \Magento\Framework\HTTP\Adapter\CurlFactory
     */
    private $curlFactory;

    /**
     * @var \Magento\Framework\App\ResourceConnection
     */
    private $resource;

    /**
     * Report constructor.
     * @param \Magento\Store\Model\StoreManagerInterface $storeManager
     * @param \Magento\Framework\App\Config\ScopeConfigInterface $scopeConfig
     * @param \Magento\Framework\HTTP\Adapter\CurlFactory $curlFactory
     * @param \Magento\Framework\App\ResourceConnection $resource
     */
    public function __construct(
        \Magento\Store\Model\StoreManagerInterface $storeManager,
        \Magento\Framework\App\Config\ScopeConfigInterface $scopeConfig,
        \Magento\Framework\HTTP\Adapter\CurlFactory $curlFactory,
        \Magento\Framework\App\ResourceConnection $resource
    ) {
        $this->storeManager = $storeManager;
        $this->scopeConfig = $scopeConfig;
        $this->curlFactory = $curlFactory;
        $this->resource = $resource;
    }

    /**
     * @return $this
     * @throws \Magento\Framework\Exception\NoSuchEntityException
     */
    public function execute()
    {
        $store = $this->storeManager->getStore();
        $base_url = $store->getBaseUrl();
        $storeEmail = $this->getStoreEmail();

        $readConnection = $this->resource->getConnection(\Magento\Framework\App\ResourceConnection::DEFAULT_CONNECTION);

        $orderTable = $this->resource->getTableName('sales_order');

        $query = "SELECT SUM(`grand_total`) AS orders_amount, COUNT(`entity_id`) AS orders_count FROM `{$orderTable}`";
        $orders = $readConnection->fetchAll($query);

        $count_orders = 0;
        $grandTotal = 0;

        foreach ($orders as $row) {
            $count_orders = $row['orders_count'];
            $grandTotal = $row['orders_amount'];
        }

        if (empty($count_orders)) {
            $count_orders = 0;
        }
        if (empty($grandTotal)) {
            $grandTotal = 0;
        }

        // execute request to api server
        try {
            // prepare request
            $requestJson = [
                'Domains' => $base_url,
                'ClientEmail' => $storeEmail,
                'SecretCode' => 'IWDEXTENSIONS',
                'AuthToken' => 'IWDEXTENSIONS',
                'OrdersAmount' => $grandTotal,
                'OrdersCount' => $count_orders,
            ];

            $request = base64_encode(json_encode($requestJson));

            $config = [
                'timeout' => 15,
                'header' => false,
                'verifypeer' => false,
                'verifyhost' => false
            ];

            $http = $this->curlFactory->create();
            $http->setConfig($config);
            $http->write(\Zend_Http_Client::GET, self::API_URL . $request, '1.1');
            $response = $http->read();
        } catch (\Exception $e) {
            // do nothing
        }

        return $this;
    }

    public function getStoreEmail()
    {
        return $this->scopeConfig->getValue('trans_email/ident_general/email', ScopeInterface::SCOPE_STORE);
    }
}
