<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Theme;

use Hyva\Theme\Service\HyvaThemes;
use Magento\Framework\View\Asset\PreProcessor\Chain;
use Magento\Framework\View\Asset\PreProcessor\Minify;

class AllowJsMinifierForHyvaPlugin
{
    private HyvaThemes $hyvaThemes;

    public function __construct(HyvaThemes $hyvaThemes)
    {
        $this->hyvaThemes = $hyvaThemes;
    }

    public function aroundProcess(Minify $subject, callable $proceed, Chain $chain): void
    {
        $targetPath = $chain->getTargetAssetPath();

        if (strtolower((string)pathinfo($targetPath, PATHINFO_EXTENSION)) === 'js') {
            $proceed($chain);
            return;
        }

        $themePath = implode('/', array_slice(explode('/', $targetPath), 0, 3));
        if ($this->hyvaThemes->isHyvaThemeCode($themePath)) {
            return;
        }

        $proceed($chain);
    }
}
