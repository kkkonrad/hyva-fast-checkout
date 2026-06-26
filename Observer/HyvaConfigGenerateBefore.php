<?php declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Observer;

use Magento\Framework\Component\ComponentRegistrar;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;

class HyvaConfigGenerateBefore implements ObserverInterface
{
    protected ComponentRegistrar $componentRegistrar;

    public function __construct(ComponentRegistrar $componentRegistrar)
    {
        $this->componentRegistrar = $componentRegistrar;
    }

    public function execute(Observer $event)
    {
        $config = $event->getData('config');
        $extensions = $config->hasData('extensions') ? $config->getData('extensions') : [];
        $moduleName = 'Kkkonrad_Fastcheckout';
        $path = $this->componentRegistrar->getPath(ComponentRegistrar::MODULE, $moduleName);

        if ($path) {
            $bp = defined('BP') ? BP : '';
            $extensions[] = ['src' => substr($path, strlen($bp) + 1)];
        }

        $config->setData('extensions', $extensions);
    }
}
