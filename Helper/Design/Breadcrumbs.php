<?php

namespace IWD\Opc\Helper\Design;

use Magento\Store\Model\ScopeInterface;
use IWD\Opc\Helper\Data;

class Breadcrumbs extends Data
{
    //Breadcrumbs
    const XML_PATH_BREADCRUMBS_ITEM_COLOR = 'iwd_opc/design/style/breadcrumbs/item_color';
    const XML_PATH_BREADCRUMBS_ITEM_BACKGROUND = 'iwd_opc/design/style/breadcrumbs/item_background';
    const XML_PATH_BREADCRUMBS_ACTIVE_ITEM_COLOR = 'iwd_opc/design/style/breadcrumbs/active_item_color';
    const XML_PATH_BREADCRUMBS_ACTIVE_ITEM_BACKGROUND = 'iwd_opc/design/style/breadcrumbs/active_item_background';
    const XML_PATH_BREADCRUMBS_COMPLETED_ITEM_COLOR = 'iwd_opc/design/style/breadcrumbs/completed_item_color';
    const XML_PATH_BREADCRUMBS_COMPLETED_ITEM_BACKGROUND = 'iwd_opc/design/style/breadcrumbs/completed_item_background';

    /**
     * @return mixed
     */
    public function getBreadcrumbsItemColor()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_BREADCRUMBS_ITEM_COLOR, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getBreadcrumbsItemBackground()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_BREADCRUMBS_ITEM_BACKGROUND, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getBreadcrumbsActiveItemColor()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_BREADCRUMBS_ACTIVE_ITEM_COLOR, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getBreadcrumbsActiveItemBackground()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_BREADCRUMBS_ACTIVE_ITEM_BACKGROUND, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getBreadcrumbsCompletedItemColor()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_BREADCRUMBS_COMPLETED_ITEM_COLOR, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getBreadcrumbsCompletedItemBackground()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_BREADCRUMBS_COMPLETED_ITEM_BACKGROUND, ScopeInterface::SCOPE_STORE);
    }
}
