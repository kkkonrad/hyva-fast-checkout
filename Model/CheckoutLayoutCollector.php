<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Model;

use Magento\Checkout\Block\Onepage;
use Magento\Framework\Serialize\SerializerInterface;
use Magento\Framework\View\Design\Theme\ThemeProviderInterface;
use Magento\Framework\View\DesignInterface;
use Magento\Framework\View\LayoutFactory;
use Magento\Framework\View\Page\Layout\ReaderFactory as PageLayoutReaderFactory;
use Psr\Log\LoggerInterface;

/**
 * Builds Magento's real checkout layout without switching the storefront page away from Hyvä.
 */
class CheckoutLayoutCollector
{
    private const NATIVE_THEME_PATH = 'frontend/Magento/blank';

    private const EXCLUDED_PAGE_HANDLES = [
        'default',
        'checkout_index_index',
        'fastcheckout_index_index',
        'fastcheckout_native_components',
        'fastcheckout_checkout_onepage_success',
        'fastcheckout_checkout_onepage_failure',
    ];

    private LayoutFactory $layoutFactory;
    private DesignInterface $design;
    private LoggerInterface $logger;
    private ThemeProviderInterface $themeProvider;
    private PageLayoutReaderFactory $pageLayoutReaderFactory;
    private SerializerInterface $serializer;
    private ?array $collected = null;

    public function __construct(
        LayoutFactory $layoutFactory,
        DesignInterface $design,
        LoggerInterface $logger,
        ThemeProviderInterface $themeProvider,
        PageLayoutReaderFactory $pageLayoutReaderFactory,
        SerializerInterface $serializer
    ) {
        $this->layoutFactory = $layoutFactory;
        $this->design = $design;
        $this->themeProvider = $themeProvider;
        $this->logger = $logger;
        $this->pageLayoutReaderFactory = $pageLayoutReaderFactory;
        $this->serializer = $serializer;
    }

    /**
     * @param string[] $pageHandles Handles already applied to the storefront page
     * @return array<string, mixed>
     */
    public function collect(array $pageHandles = []): array
    {
        if ($this->collected !== null) {
            return $this->collected;
        }

        $this->collected = $this->buildJsLayout(false, $pageHandles);
        if ($this->collected === []) {
            $this->collected = $this->buildJsLayout(true, $pageHandles);
        }

        return $this->collected;
    }

    /**
     * @param string[] $pageHandles
     * @return array<string, mixed>
     */
    private function buildJsLayout(bool $useFallbackTheme, array $pageHandles): array
    {
        $result = [];
        $originalTheme = $this->design->getDesignTheme();

        try {
            if ($useFallbackTheme) {
                $this->design->setDesignTheme(
                    $this->themeProvider->getThemeByFullPath(self::NATIVE_THEME_PATH)
                );
            }
            $layout = $this->layoutFactory->create(['cacheable' => false]);
            $update = $layout->getUpdate();
            $update->addHandle('checkout_index_index');
            $update->addHandle('fastcheckout_native_components');
            $this->addPageHandles($update, $pageHandles);
            // checkout.root targets `content`, normally declared by the global
            // default handle. Recreate only that parent to avoid preparing global
            // RequireJS blocks inside this isolated layout.
            $update->addUpdate(
                '<referenceContainer name="main"><container name="content"/></referenceContainer>'
            );
            $update->load();
            $layout->generateXml();
            $pageLayout = $update->getPageLayout() ?: 'checkout';
            $this->pageLayoutReaderFactory->create()->read($layout->getReaderContext(), $pageLayout);
            $layout->generateElements();

            $checkoutRoot = $layout->getBlock('checkout.root');
            if ($checkoutRoot instanceof Onepage) {
                $jsLayout = $this->serializer->unserialize($checkoutRoot->getJsLayout());
                $result = is_array($jsLayout) ? $jsLayout : [];
            }
        } catch (\Throwable $exception) {
            $this->logger->error('Fastcheckout could not build the native checkout layout.', [
                'exception' => $exception,
                'use_fallback_theme' => $useFallbackTheme
            ]);
            if ($useFallbackTheme) {
                throw $exception;
            }
            $result = [];
        } finally {
            $this->design->setDesignTheme($originalTheme);
        }

        return $result;
    }

    /**
     * @param string[] $pageHandles
     */
    private function addPageHandles($update, array $pageHandles): void
    {
        foreach ($pageHandles as $handle) {
            $handle = (string)$handle;
            if ($handle === ''
                || in_array($handle, self::EXCLUDED_PAGE_HANDLES, true)
                || strpos($handle, 'fastcheckout_') === 0
                || strpos($handle, 'hyva_checkout') === 0
            ) {
                continue;
            }
            $update->addHandle($handle);
        }
    }
}
