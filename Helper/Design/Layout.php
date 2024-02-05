<?php

namespace IWD\Opc\Helper\Design;

use Magento\Store\Model\ScopeInterface;
use IWD\Opc\Helper\Data;

class Layout extends Data
{
    //Layout
    const XML_PATH_DESKTOP_RESOLUTION = 'iwd_opc/design/layout/desktop';
    const XML_PATH_MOBILE_RESOLUTION = 'iwd_opc/design/layout/mobile';
    const XML_PATH_TABLET_RESOLUTION = 'iwd_opc/design/layout/tablet';
    const XML_PATH_ADDRESS_TYPE_ORDER = 'iwd_opc/design/layout/address_type_order';

    /**
     * @return mixed
     */
    public function getDesktopResolution()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_DESKTOP_RESOLUTION, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getMobileResolution()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_MOBILE_RESOLUTION, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getTabletResolution()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_TABLET_RESOLUTION, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getAddressTypeOrder()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_ADDRESS_TYPE_ORDER, ScopeInterface::SCOPE_STORE);
    }
}
