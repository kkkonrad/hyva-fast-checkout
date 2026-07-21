# Kkkonrad Fastcheckout

**Fastcheckout** to zaawansowany moduł optymalizacji i dostosowywania koszyka zakupowego (One-Page Checkout) dedykowany dla platformy Magento 2 ze szczególnym uwzględnieniem szablonów **Hyvä Themes** oraz technologii **Magewire**.

Moduł ten zapewnia wyjątkową szybkość działania, przejrzysty 2-kolumnowy układ graficzny dostosowany do urządzeń mobilnych oraz autorską technologię mostu kompatybilności (KO Bridge), która pozwala uruchamiać tradycyjne bramki płatności i wysyłki napisane w Knockout.js i RequireJS.

---

## Główne Funkcje i Możliwości

### 🚀 Wydajność i Kompatybilność Hybrydowa
- **Most kompatybilności Knockout.js (KO Bridge)**: Umożliwia integrację i renderowanie płatności opartych na Knockout.js w ekosystemie szablonu Hyvä (który domyślnie korzysta z Alpine.js i Magewire).
- **Zabezpieczenie CSP (Content Security Policy)**: Pełna kompatybilność z mechanizmem CSP w Hyvä dzięki rejestracji skryptów inline za pomocą interfejsu `HyvaCsp`.
- **Integracja Tailwind CSS**: Wbudowany obserwator integruje ścieżkę modułu z kompilatorem Tailwind w szablonie Hyvä.

### 📦 Elastyczna Konfiguracja i Logika Biznesowa
- **Dynamiczne mapowanie metod dostawy i płatności**: Możliwość sztywnego przypisania metod płatności do wybranych metod dostawy (np. pobranie tylko przy wysyłce kurierskiej).
- **Automatyczne przypisywanie zamówienia do konta klienta**: Jeśli klient składa zamówienie jako gość, ale podany e-mail pasuje do istniejącego konta, moduł automatycznie przypisze zamówienie do tego konta.
- **Dodatkowe pola koszyka**:
  - Komentarz do zamówienia (zapisywany w historii zamówienia).
  - Newsletter (checkbox zapisu do newslettera).
  - Wiadomość prezentowa (Gift Message) dla całego zamówienia.

### 🛡️ Bezpieczeństwo i Niezawodność
- **Zabezpieczenie przed podwójnym kliknięciem (Idempotency)**: Generowanie unikalnego klucza w sesji zapobiega złożeniu dwóch takich samych zamówień (np. w przypadku wolnego łącza internetowego).
- **Bezpieczny fallback adresów**: Wbudowane pluginy naprawiające walidację regionów w adresach oraz błędy Magento przy walidacji brakujących pól adresowych u gości.
- **Odporność na błędy serializacji**: Przechwytywanie i odrzucanie obiektowych parametrów płatności w bazie w celu uniknięcia krytycznych błędów zapisu Quote.

---

## Struktura Modułu i Główne Pliki

```
Kkkonrad/Fastcheckout/
├── Block/                          # Klasy bloków widoku (Hyva Checkout i konfiguracja mapowania)
├── Controller/                     # Kontroler obsługujący trasę /fast-checkout
├── Helper/                         # Helpery konfiguracyjne i pomocnicze koszyka
├── Magewire/                       # Komponent Magewire (backendowy stan checkoutu)
├── Model/                          # Logika modeli (generowanie zasobów RequireJS, źródła configu)
├── Observer/                       # Obserwatory zdarzeń (Tailwind compilation, przypisanie konta, komentarze)
├── Plugin/                         # Wtyczki kompatybilności (czyszczenie lockerów InPost, poprawki walidacji)
├── Test/Unit/                      # Zestaw testów jednostkowych
├── etc/                            # Konfiguracja modułu (di.xml, routes.xml, system.xml, config.xml)
├── view/                           # Widok: szablony phtml, zasoby js/css, pliki układu layout XML
└── README.md                       # Główny plik dokumentacji modułu
```

---

## Instalacja

### Wymagania

- Magento 2.4 z `magento/framework` w wersji `103.x`.
- PHP `8.1`, `8.2`, `8.3` lub `8.4`.
- Hyvä Theme Module `^1.4`.
- Magewire `^1.13`.
- Dostęp do konsoli w katalogu głównym Magento oraz użytkownik z prawem zapisu do plików aplikacji.

### Instalacja przez Composer

Pakiet ma nazwę `kkkonrad/fastcheckout`. Repozytorium zawierające pakiet musi być wcześniej dodane do konfiguracji Composer projektu.

```bash
composer require kkkonrad/fastcheckout
```

Composer zainstaluje również deklarowane zależności Hyvä i Magewire. Jeśli moduł jest rozwijany lokalnie, można dodać go jako repozytorium typu `path`:

```bash
composer config repositories.fastcheckout path /ścieżka/do/Fastcheckout
composer require kkkonrad/fastcheckout:@dev
```

### Instalacja ręczna

1. Skopiuj cały katalog modułu do:

   ```text
   app/code/Kkkonrad/Fastcheckout
   ```

2. Jeżeli Hyvä Theme Module lub Magewire nie są jeszcze zainstalowane, dodaj je przez Composer:

   ```bash
   composer require hyva-themes/magento2-theme-module:^1.4 magewirephp/magewire:^1.13
   ```

### Aktywacja w Magento

Polecenia wykonuj z katalogu głównego Magento jako użytkownik obsługujący pliki aplikacji. W środowisku developerskim:

```bash
php bin/magento module:enable Kkkonrad_Fastcheckout
php bin/magento setup:upgrade
php bin/magento cache:clean
```

W trybie produkcyjnym użyj pełnej sekwencji z maintenance, kompilacją DI i wdrożeniem zasobów dla używanych wersji językowych:

```bash
php bin/magento maintenance:enable
php bin/magento module:enable Kkkonrad_Fastcheckout
php bin/magento setup:upgrade --keep-generated
php bin/magento setup:di:compile
php bin/magento setup:static-content:deploy -f pl_PL en_US
php bin/magento cache:flush
php bin/magento maintenance:disable
```

### Regeneracja Tailwind CSS (wymagane dla Hyvä)

Szablony Fastcheckout korzystają z klas Tailwind CSS. Observer `HyvaConfigGenerateBefore` rejestruje ścieżkę modułu w konfiguracji kompilatora Tailwind Hyvä, ale **nie generuje CSS automatycznie**. Po instalacji lub aktualizacji modułu trzeba ręcznie przebudować style aktywnego motywu Hyvä, inaczej layout checkoutu może wyglądać niepoprawnie (brakujące style).

W katalogu Tailwind motywu (zwykle `app/design/frontend/<Vendor>/<theme>/web/tailwind`):

```bash
# Zależności Node (tylko jeśli brak node_modules)
npm ci

# Produkcyjna kompilacja CSS
npm run build
```

Przykład dla typowego child theme Hyvä:

```bash
cd app/design/frontend/Vendor/theme/web/tailwind
npm ci   # pomiń, jeśli node_modules już istnieje
npm run build
```

Po kompilacji wyczyść cache Magento (`php bin/magento cache:clean`) i w razie potrzeby w trybie produkcyjnym ponów `setup:static-content:deploy`. W trybie developerskim możesz użyć `npm run watch` podczas pracy nad szablonami.

### Weryfikacja instalacji

Sprawdź, czy Magento widzi aktywny moduł:

```bash
php bin/magento module:status Kkkonrad_Fastcheckout
```

Oczekiwany wynik zawiera `Module is enabled`. Następnie:

1. Przejdź do **Sklepy > Konfiguracja > Kkkonrad > Checkout**.
2. Ustaw **Enable Module?** na `Yes` w odpowiednim zakresie konfiguracji.
3. Zapisz konfigurację i wyczyść cache.
4. Otwórz adres `/fast-checkout/` w sklepie z produktem dodanym do koszyka.

Jeżeli po wdrożeniu przeglądarka nadal korzysta ze starych plików JavaScript, wykonaj pełne odświeżenie strony (`Ctrl+F5`).

---

## Konfiguracja w Panelu Administracyjnym

Wszystkie parametry modułu konfiguruje się w sekcji **Sklepy > Konfiguracja > Kkkonrad > Checkout** (Stores > Configuration > Kkkonrad > Checkout).

### Najważniejsze grupy ustawień:
- **General Settings**: Włączenie modułu oraz wybór domyślnej metody płatności i dostawy.
- **Extended Options**: Zarządzanie widocznością sekcji kuponów rabatowych, komentarzy, zgody na newsletter i wiadomości prezentowej.
- **Shipping-Payment Method Mapping**: Tabela mapowania określająca, które płatności są dostępne dla poszczególnych kurierów. Metody dostawy mogą używać wildcardów typu `carrier_*`, ale metody płatności są zawsze dopasowywane po dokładnym kodzie.
- **Generic field capture**: Proste widgety mogą przekazać dane bez osobnego mixina przez pola nazwane `additional_data[field]`, `payment[additional_data][field]`, `custom_attributes[field]`, `shipping[custom_attributes][field]`, `extension_attributes[field]` albo przez data-atrybuty `data-fastcheckout-payment-additional-field`, `data-fastcheckout-payment-extension-field`, `data-fastcheckout-shipping-custom-field`, `data-fastcheckout-shipping-extension-field`. Aktywna metoda płatności ma też obsługę popularnych prostych nazw pól z gatewayów, m.in. `blik_code`, `blikCode`, `group`, `channel`, `regulation_accept`, `methodId`, `saveAlias`.
- **Wewnętrzna walidacja pól wymaganych**: Moduł sprawdza `purchaseorder.po_number` oraz `instore_pickup.extension_attributes.pickup_location_code`, zgodnie z kontraktami Magento Offline Payments i Magento Inventory In-Store Pickup. Reguły te nie są wystawione w konfiguracji administratora.
- **JS extension points**: Moduły mogą rejestrować adaptery bez edycji Fastcheckout: `window.fastcheckoutPaymentDataAssigners.push(function (paymentData) { ... })`, `window.fastcheckoutPaymentValidators.push({ validate: function () { return true; } })`, `window.fastcheckoutCustomShippingValidators.push(function (shippingMethod) { return true; })`. Po inicjalizacji dostępne są też `window.fastcheckoutHyvaPayment.registerDataAssigner(...)`, `window.fastcheckoutHyvaPayment.registerValidator(...)` i `window.fastcheckoutHyvaShipping.registerValidator(...)`.
- **RequireJS Auto-Generation**: Automatyczne generowanie plików RequireJS dla motywów Hyvä.

---

## Testy Jednostkowe

Moduł dostarcza testy jednostkowe weryfikujące poprawność logiki pomocniczej oraz kontroli stanu Magewire. Uruchomienie testów:

```bash
# Test helpera Data
vendor/bin/phpunit app/code/Kkkonrad/Fastcheckout/Test/Unit/Helper/DataTest.php

# Test komponentu Magewire Checkout
vendor/bin/phpunit app/code/Kkkonrad/Fastcheckout/Test/Unit/Magewire/CheckoutTest.php

# Test bloku widoku Checkout
vendor/bin/phpunit app/code/Kkkonrad/Fastcheckout/Test/Unit/Block/Hyva/CheckoutTest.php

# Pełny zestaw testów modułu
vendor/bin/phpunit -c app/code/Kkkonrad/Fastcheckout/phpunit.xml.dist
```

---

## Rozszerzona Dokumentacja Techniczna

W celu szczegółowego zapoznania się z mechanizmami działania zapraszamy do lektury dedykowanych dokumentów:

1. 💻 **[Most Integracyjny Knockout.js (KO Bridge)](docs/integracja_ko.md)** – Informacje o tym, jak wstrzykiwane jest środowisko KO, jak działają proxy JS, mixiny oraz specyficzne integracje (np. Braintree).
2. 🏛️ **[Architektura Systemowa i Przepływ Danych](docs/architektura.md)** – Opis cyklu życia koszyka, walidacji pól, synchronizacji formularza Magewire/Alpine, obsługi InPost oraz stabilizacji zapisu bazy danych.
