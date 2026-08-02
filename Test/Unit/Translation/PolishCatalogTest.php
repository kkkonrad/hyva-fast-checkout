<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Translation;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;

class PolishCatalogTest extends TestCase
{
    public function testFrontendLiteralTranslationsExistInPolishCatalog(): void
    {
        $moduleRoot = dirname(__DIR__, 3);
        $translations = [];
        $handle = fopen($moduleRoot . '/i18n/pl_PL.csv', 'r');
        while (($row = fgetcsv($handle, 0, ',', '"', '')) !== false) {
            if (isset($row[0])) {
                $translations[$row[0]] = true;
            }
        }
        fclose($handle);

        $missing = [];
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($moduleRoot . '/view/frontend')
        );
        foreach ($files as $file) {
            if (!$file instanceof SplFileInfo || !$file->isFile() ||
                !preg_match('/\.(?:php|phtml|js)$/', $file->getFilename())) {
                continue;
            }

            preg_match_all(
                '/(?:__|\$t|translate|translateMessage|translateClientMessage|translateFastcheckoutMessage)' .
                '\(\s*([\'\"])((?:\\\\.|(?!\1).)*)\1/sU',
                (string)file_get_contents($file->getPathname()),
                $matches,
                PREG_SET_ORDER
            );
            foreach ($matches as $match) {
                $phrase = stripcslashes($match[2]);
                if ($phrase !== '' && !isset($translations[$phrase])) {
                    $missing[$phrase][] = substr($file->getPathname(), strlen($moduleRoot) + 1);
                }
            }
        }

        self::assertSame([], $missing, 'Missing pl_PL translations: ' . json_encode($missing));
    }
}
