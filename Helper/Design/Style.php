<?php

namespace IWD\Opc\Helper\Design;

use IWD\Opc\Helper\Data;
use Magento\Store\Model\ScopeInterface;

class Style extends Data
{
    //Style
    const XML_PATH_FONT_FAMILY = 'iwd_opc/design/style/font';

    const XML_PATH_MAIN_BACKGROUND = 'iwd_opc/design/style/page_background';
    const XML_PATH_SUMMARY_BACKGROUND = 'iwd_opc/design/style/sidebar_background';

    const XML_PATH_MAIN_COLOR = 'iwd_opc/design/style/body_text_color';
    const XML_PATH_HEADING_COLOR = 'iwd_opc/design/style/heading_text_color';
    const XML_PATH_LINK_COLOR = 'iwd_opc/design/style/link_color';
    const XML_PATH_HIGHLIGHT_COLOR = 'iwd_opc/design/style/input_highlight_color';

    const XML_PATH_PRIMARY_BUTTON_BACKGROUND = 'iwd_opc/design/style/primary_btn_background';
    const XML_PATH_PRIMARY_BUTTON_TEXT_COLOR = 'iwd_opc/design/style/primary_btn_text_color';

    const XML_PATH_SECONDARY_BUTTON_BACKGROUND = 'iwd_opc/design/style/secondary_btn_background';
    const XML_PATH_SECONDARY_BUTTON_TEXT_COLOR = 'iwd_opc/design/style/secondary_btn_text_color';

    /**
     * @return mixed
     */
    public function getFontFamily()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_FONT_FAMILY, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getMainBackground()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_MAIN_BACKGROUND, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getSummaryBackground()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_SUMMARY_BACKGROUND, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getMainColor()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_MAIN_COLOR, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getHeadingColor()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_HEADING_COLOR, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getLinkColor()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_LINK_COLOR, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getHighlightColor()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_HIGHLIGHT_COLOR, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getPrimaryButtonBackground()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_PRIMARY_BUTTON_BACKGROUND, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getPrimaryButtonTextColor()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_PRIMARY_BUTTON_TEXT_COLOR, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getSecondaryButtonBackground()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_SECONDARY_BUTTON_BACKGROUND, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @return mixed
     */
    public function getSecondaryButtonTextColor()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_SECONDARY_BUTTON_TEXT_COLOR, ScopeInterface::SCOPE_STORE);
    }
}
