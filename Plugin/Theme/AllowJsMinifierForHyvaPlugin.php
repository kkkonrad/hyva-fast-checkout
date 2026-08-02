<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Theme;

use Hyva\Theme\Service\HyvaThemes;
use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Framework\View\Asset\PreProcessor\Chain;
use Magento\Framework\View\Asset\PreProcessor\Minify;

class AllowJsMinifierForHyvaPlugin
{
    private HyvaThemes $hyvaThemes;
    private Helper $helper;

    public function __construct(HyvaThemes $hyvaThemes, Helper $helper)
    {
        $this->hyvaThemes = $hyvaThemes;
        $this->helper = $helper;
    }

    public function aroundProcess(Minify $subject, callable $proceed, Chain $chain): void
    {
        $targetPath = $chain->getTargetAssetPath();
        $extension = strtolower((string)pathinfo($targetPath, PATHINFO_EXTENSION));
        $themePath = implode('/', array_slice(explode('/', $targetPath), 0, 3));
        $isHyvaTheme = $this->hyvaThemes->isHyvaThemeCode($themePath);

        if ($isHyvaTheme) {
            if (
                $extension === 'js' &&
                $this->helper->isEnable() &&
                $this->helper->isModuleOutputEnabled('Kkkonrad_Fastcheckout')
            ) {
                $proceed($chain);
            }
            return;
        }

        $proceed($chain);
    }
}
