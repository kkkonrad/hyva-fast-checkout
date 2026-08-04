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
- natywny bootstrap RequireJS Magento i warstwa zgodności rendererów płatności
  Knockout;
- stabilne hosty KO dla metod płatności (jednorazowy adopt, soft-remove zamiast
  niszczenia rendererów przy zmianie dostawy / odświeżeniu `method-list`);
- współdzielony adres rozliczeniowy między metodami płatności (Update / Edytuj
  na jednej metodzie zachowuje dane na pozostałych);
- odzyskiwanie hostowanych pól karty (Secure Forms i podobne) po reparent /
  soft-hide, bez per-vendor DI;
- mapowanie metod płatności do metod dostawy;
- podsumowanie zamówienia oparte o natywne totals Magento (w tym Tax), ze
  skróconym komunikatem gdy dostawa nie jest jeszcze wybrana;
- zachowanie adresu gościa po odświeżeniu strony;
- obsługa komentarzy do zamówienia i zapisu do newslettera;
- automatyczne zachowanie skalarnych `extension_attributes` koszyka i adresu
  (np. paczkomat) oraz opcjonalne widgety UI ładowane tylko gdy moduł jest obecny;
- opcjonalne przypisanie zamówienia gościa do istniejącego klienta o tym samym
  adresie e-mail.

## Wymagania

- Magento 2.4 (`magento/framework` 103.x);
- PHP 8.1–8.4;
- Hyvä Theme Module 1.4 lub nowszy.

## Instalacja

Pakiet **nie jest dostępny na Packagist**. Instalacja odbywa się przez Composer
bezpośrednio z GitHuba (repozytorium VCS).

### Composer + GitHub

W katalogu głównym Magento dodaj repozytorium i wymagaj pakietu:

```bash
composer config repositories.kkkonrad-fastcheckout vcs https://github.com/kkkonrad/hyva-fast-checkout.git
composer require kkkonrad/fastcheckout:dev-master
```

Albo ręcznie w `composer.json` projektu:

```json
{
  "repositories": [
    {
      "type": "vcs",
      "url": "https://github.com/kkkonrad/hyva-fast-checkout.git"
    }
  ],
  "require": {
    "kkkonrad/fastcheckout": "dev-master"
  }
}
```

Następnie:

```bash
composer update kkkonrad/fastcheckout
php bin/magento module:enable Kkkonrad_Fastcheckout
php bin/magento setup:upgrade
php bin/magento cache:clean
```

**Uwagi:**

- dla prywatnego repozytorium użyj SSH (`git@github.com:kkkonrad/hyva-fast-checkout.git`)
  albo tokenu GitHub w HTTPS i uprawnień Composer do `github.com`;
- zamiast `dev-master` można wskazać gałąź (`dev-nazwa-galezi`) lub tag
  (`"kkkonrad/fastcheckout": "7.0.0"`), jeśli jest opublikowany w repozytorium;
- przy instalacji z gałęzi Composer często prosi o `minimum-stability: dev`
  oraz `prefer-stable: true` w `composer.json` projektu.

### Instalacja ręczna (app/code)

Alternatywnie sklonuj moduł do `app/code`:

```bash
git clone https://github.com/kkkonrad/hyva-fast-checkout.git app/code/Kkkonrad/Fastcheckout
php bin/magento module:enable Kkkonrad_Fastcheckout
php bin/magento setup:upgrade
php bin/magento cache:clean
```

### Środowisko produkcyjne

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

Ustawienia pozwalają włączyć moduł, sterować widocznością komentarza, rabatu i
newslettera, opcjonalnie przypisywać zamówienia gości oraz definiować mapowanie
metod płatności do metod dostawy.

Proces zamówienia jest dostępny pod standardową ścieżką `/checkout/`. Gdy moduł oraz
zgodny motyw Hyvä są aktywne, Fastcheckout zastępuje zawartość tej strony bez
dodatkowego przekierowania. Dotychczasowa ścieżka `/fast-checkout/` pozostaje
dostępna jako alias zapewniający zgodność wsteczną.

## Architektura

- `Block/Hyva/Checkout.php` jednokrotnie scala standardowy `jsLayout` i przekazuje
  go natywnym procesorom checkoutu Magento.
- `Model/CheckoutLayoutCollector.php` zbiera OPC `jsLayout` z plików layout
  aktywnych modułów (preferowane na Hyvä, gdzie motyw usuwa `checkout.root`)
  oraz z merge motywu; pusty wynik nie jest cache’owany.
- `view/frontend/web/js/requirejs-base.js` ustawia ścieżkę zasobów przed natywnym
  bootstrapem RequireJS, również przy włączonej minifikacji i łączeniu JavaScript.
- Magento ładuje własną konfigurację RequireJS; szablon
  `view/frontend/templates/hyva/knockout/checkout-bridge.phtml` uruchamia wyłącznie
  most Knockout.
- `view/frontend/web/js/hyva/checkout-bridge.js` montuje komponenty procesu
  zamówienia Magento (adres, metody, summary, place order).
- `payment-host-bridge.js` + `payment-list.js` — stabilne sloty per metoda oraz
  soft-remove (ukrycie bez `dispose` rendererów z hostowanymi polami karty).
- `billing-address-validation-mixin.js` — wspólny adres rozliczeniowy między
  rendererami (`billingAddress{methodCode}`) przy Update / Edytuj / zmianie metody.
- Obiekty Magento `quote`, `checkout-data` oraz operacje REST zarządzają adresami,
  metodami i podsumowaniem.
- Mixiny RequireJS (nie `map` override’y całych modułów) zapewniają trwałość
  danych i zgodność ze standardowymi bramkami / przewoźnikami.
- `Plugin/Quote/PreserveShippingExtensionAttributes.php` odkrywa skalarne
  atrybuty rozszerzające Cart/Address i zachowuje je przy zapisie (zamiast
  hardcodu pod jednego vendor’a).

Moduł nie zawiera komponentu Magewire, mechanizmu modyfikowania DOM przez Livewire
ani orkiestratora stanu opartego na Alpine.

## Zgodność z modułami zewnętrznymi (shipping / payment)

Fastcheckout działa jak host natywnego checkoutu Magento Knockout + REST.
**Instalacja standardowego modułu dostawy lub płatności nie powinna wymagać
patchy ani wpisów DI w Kkkonrad_Fastcheckout.**

- Renderery płatności i komponenty UI dostawy pochodzą ze scalonego
  `jsLayout` handle `checkout_index_index` (wszystkie aktywne moduły + motyw).
- Lista dostępnych metod płatności jest synchronizowana z Magento
  `method-list` (REST); soft-remove chroni bramki z Secure Forms / hosted fields
  przed zniszczeniem przy chwilowym zniknięciu metody (zmiana dostawy, free
  shipping, odświeżenie totals).
- Skalarne `extension_attributes` na `CartInterface` / `AddressInterface` są
  auto-odkrywane i ponownie ustawiane przy zapisie quote, gdy istnieje
  odpowiadająca kolumna w bazie (paczkomaty, store pickup itd.).
- Opcjonalne widgety UI (np. InPost) ładują się tylko gdy dany moduł zarejestruje
  ścieżkę AMD; brak modułu kończy się cicho.
- Hostowane pola karty (m.in. PayU Secure Forms) są remountowane po reparent
  hosta / soft-hide, a reject tokenizacji nie zostawia zablokowanego place order.

Nie dodawaj per-vendor DI „pod Fastcheckout” w projekcie sklepu, jeśli standardowy
checkout Magento Luma/Hyvä i tak ładuje ten sam renderer.

## Testy

Uruchomienie testów jednostkowych PHP z katalogu głównego Magento:

```bash
vendor/bin/phpunit --no-extensions -c dev/tests/unit/phpunit.xml.dist \
    app/code/Kkkonrad/Fastcheckout/Test/Unit
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

Testy składające rzeczywiste zamówienia są domyślnie pomijane. Można je
uruchomić świadomie przez `FC_PLACE_REAL_ORDER=1`. Test ciepłego startu formularza
adresu wymaga gotowości w ciągu 1000 ms od `DOMContentLoaded`; dla innego
środowiska limit można ustawić przez `FC_ADDRESS_READY_BUDGET_MS`.

Test PayU Cards uruchamia się osobno na sklepie integracyjnym:

```bash
FC_PAYU_E2E=1 FC_PAYU_BASE_URL=https://m10625.app-on-demand.net/ \
    npx playwright test PayuCompatibility.spec.js
```

## Odświeżanie plików statycznych (developer / hosty on-demand)

Po zmianach w `view/frontend/web` odśwież opublikowane kopie Magento w
`pub/static`, żeby storefront nie serwował starego JS/CSS:

```bash
app/code/Kkkonrad/Fastcheckout/bin/sync-frontend-static.sh
php bin/magento cache:flush
```

Skrypt jest wymagany, gdy katalogi
`pub/static/frontend/*/Kkkonrad_Fastcheckout` już istnieją (również w trybie
developer). `requirejs-config.js` leży poza `web/` — po jego zmianie skopiuj go
do drzew static albo przeładuj stronę tak, by Magento przebudował merge RequireJS.
