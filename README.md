# Kkkonrad Fastcheckout

Fastcheckout to moduł procesu zamówienia Magento 2 przeznaczony dla motywów Hyvä.
Renderuje standardowe komponenty Knockout Magento odpowiedzialne za adresy i
płatności wewnątrz układu Hyvä. Natywny koszyk Magento oraz operacje REST pozostają
jedynym źródłem danych.

Moduł nie wymaga Magewire i nie utrzymuje dodatkowego stanu procesu zamówienia.

## Podgląd

![Widok procesu zamówienia Kkkonrad Fastcheckout](docs/images/checkout.png)

## Funkcje

- responsywny układ procesu zamówienia zgodny z Hyvä;
- standardowe formularze adresu wysyłki i adresu rozliczeniowego Magento wraz z
  natywną walidacją;
- warstwa zgodności dla rendererów płatności RequireJS/Knockout;
- mapowanie metod płatności do metod dostawy;
- zachowanie adresu gościa po odświeżeniu strony;
- obsługa komentarzy do zamówienia, zapisu do newslettera i wiadomości prezentowych;
- zachowanie atrybutu rozszerzającego automatu paczkowego InPost;
- opcjonalne przypisanie zamówienia gościa do istniejącego klienta o tym samym
  adresie e-mail.

## Wymagania

- Magento 2.4 (`magento/framework` 103.x);
- PHP 8.1–8.4;
- Hyvä Theme Module 1.4 lub nowszy.

## Instalacja

Instalacja za pomocą Composera:

```bash
composer require kkkonrad/fastcheckout
php bin/magento module:enable Kkkonrad_Fastcheckout
php bin/magento setup:upgrade
php bin/magento cache:clean
```

W środowisku produkcyjnym należy dodatkowo skompilować DI i wdrożyć pliki
statyczne:

```bash
php bin/magento setup:di:compile
php bin/magento setup:static-content:deploy -f pl_PL en_US
```

Moduł rejestruje swoje szablony w konfiguracji Tailwind Hyvä. Po instalacji lub
zmianie szablonów procesu zamówienia należy ponownie zbudować CSS aktywnego motywu.

## Konfiguracja

Konfiguracja jest dostępna w panelu administracyjnym:

`Stores > Configuration > Kkkonrad > Checkout`

Ustawienia pozwalają włączyć moduł, wybrać domyślne metody dostawy i płatności,
zarządzać polami dodatkowymi oraz zdefiniować mapowanie metod płatności do metod
dostawy.

Proces zamówienia jest dostępny pod ścieżką `/fast-checkout/`. Gdy moduł oraz zgodny
motyw Hyvä są aktywne, standardowa strona zamówienia przekierowuje pod ten adres.

## Architektura

- `Block/Hyva/Checkout.php` przygotowuje konfigurację procesu zamówienia po stronie
  serwera.
- `view/frontend/templates/hyva/knockout/checkout-bridge.phtml` uruchamia RequireJS
  i Knockout.
- `view/frontend/web/js/hyva/checkout-bridge.js` montuje komponenty procesu
  zamówienia Magento.
- Obiekty Magento `quote`, `checkout-data` oraz operacje REST zarządzają adresami,
  metodami i podsumowaniem.
- Niewielkie mixiny RequireJS zapewniają trwałość danych i zgodność z zewnętrznymi
  modułami płatności.

Moduł nie zawiera komponentu Magewire, mechanizmu modyfikowania DOM przez Livewire
ani orkiestratora stanu opartego na Alpine.

## Testy

Uruchomienie testów jednostkowych PHP z katalogu głównego Magento:

```bash
vendor/bin/phpunit -c app/code/Kkkonrad/Fastcheckout/phpunit.xml.dist
```

Uruchomienie testów jednostkowych JavaScript:

```bash
node --test app/code/Kkkonrad/Fastcheckout/Test/Unit/Js/*.test.js
```

Uruchomienie testów Playwright:

```bash
cd app/code/Kkkonrad/Fastcheckout/Test/E2e
npm ci
npx playwright test
```
