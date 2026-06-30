# Szczegółowy Opis Architektury modułu Fastcheckout

Moduł **Kkkonrad_Fastcheckout** został zbudowany na bazie hybrydowego podziału ról między asynchronicznym backendem (Magewire/PHP) a responsywnym frontendem (Alpine.js/JavaScript). Niniejsza dokumentacja szczegółowo opisuje mechanizmy działania poszczególnych warstw architektury.

---

## 1. Przepływ Żądań i Routing (Request Lifecycle)

Proces obsługi koszyka rozpoczyna się w momencie wejścia użytkownika na podstronę koszyka:

```
[Klient wchodzi na /checkout]
         │
         ▼
[Wtyczka: Checkout\Controller\Index\Index::aroundExecute]
         │  (Weryfikacja: canUseHyvaNativeCheckout)
         ├─────────────────────────────────────────► [Użyj standardowego koszyka Luma]
         │
         ▼
[Przekierowanie na: /fast-checkout]
         │
         ▼
[Kontroler: Fastcheckout\Controller\Index\Index]
         │  (Weryfikacje: Aktywność modułu, obecność produktów, minimalna kwota)
         ├─────────────────────────────────────────► [Przekierowanie do /checkout/cart]
         │
         ▼
[Inicjalizacja Sesji i Renderowanie Layoutu]
         │
         ▼
[Inicjalizacja Magewire i Alpine.js w templates]
```

### Klasy Kontrolerów:
- **[Controller/Index/Index.php](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/Controller/Index/Index.php)**: 
  - Weryfikuje koszyk (czy zawiera produkty, czy nie ma flagi błędu oraz czy spełnia wymaganie minimalnej kwoty zamówienia).
  - Weryfikuje uprawnienia gościa (blokada składania zamówienia przez gości, jeśli konfiguracja globalna tego zabrania).
  - Regeneruje ID sesji klienta w celu podniesienia bezpieczeństwa transakcji.
  - Inicjalizuje checkout w obiekcie onepage i renderuje stronę.
- **[Controller/Action.php](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/Controller/Action.php)**:
  - Klasa bazowa dostarczająca wspólne zależności, takie jak sesja koszyka (`checkoutSession`), repozytorium koszyka oraz obiekty pomocnicze.

---

## 2. Warstwa Backendowa: Komponent Magewire

Komponent Magewire ([Magewire/Checkout.php](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/Magewire/Checkout.php)) synchronizuje stan koszyka z serwerem bez konieczności przeładowywania strony.

### Cykl Inicjalizacji (`mount()`):
- Losuje i przypisuje bezpieczny token zapobiegający dublowaniu transakcji (`idempotencyKey`).
- Pobiera z Quote dane adresowe dostawy i płatności.
- Weryfikuje dopuszczalność zapisanych metod płatności na bazie mapowania metod dostawy (jeśli zapisana w koszyku płatność nie pasuje do kuriera, automatycznie podmienia ją na pierwszą dozwoloną).
- Przywraca ewentualną wiadomość prezentową (Gift Message) zapisaną w Quote.

### Reaktywne Aktualizacje (`updated()`):
Po każdej modyfikacji pola formularza na frontendzie (po stronie Alpine.js), wywoływane jest zdarzenie synchronizujące wartość z Magewire, które uruchamia metodę `updated($value, $name)`:
- **Zmiana kraju dostawy (`countryId`)**: Czyści wartości województwa/regionu (`regionId`, `region`), zapobiegając przesyłaniu błędnych kombinacji kraju i regionu.
- **Modyfikacja pól adresowych**: 
  - Zmiana pól kluczowych dla kalkulacji kosztów dostawy (kraj, region, kod pocztowy, miasto) uruchamia asynchroniczne odświeżenie i pobranie stawek kurierów (`saveShippingAddress(..., $collectRates = true)`).
  - Zmiana pozostałych pól (np. ulica, telefon) zapisuje dane w Quote, ignorując kosztowną operację rekalkulacji stawek kurierskich.
- **Wiadomość prezentowa**: Wszelkie zmiany w polach nadawcy, odbiorcy i treści prezentowej wywołują automatyczny zapis za pomocą `saveGiftMessage()`.

### Proces Składania Zamówienia (`placeOrder()`):
Metoda ta jest wywoływana asynchronicznie na samym końcu procesu:
1. **Walidacja idempotentności**: Sprawdzenie w sesji koszyka, czy wygenerowany klucz nie został już zgłoszony.
2. **Kwalifikacja klienta**: Jeśli klient nie jest zalogowany, automatycznie konfiguruje koszyk do zakupu gościnnego i przypisuje e-mail do Quote.
3. **Zapis adresów z pełną walidacją**: Uruchamia `saveShippingAddress(false)` i `saveBillingAddress(false)`. Jeśli walidacja po stronie core Magento rzuci wyjątek, proces składania zamówienia zostaje przerwany, a klient widzi czytelny komunikat o błędzie adresu.
4. **Weryfikacja regulaminów (Agreements)**: Integracja z Magento Checkout Agreements poprzez walidator `AgreementsValidatorInterface`.
5. **Zapis komentarza**: Komentarz klienta wpisany w polu tekstowym zostaje tymczasowo odłożony w sesji jako `fastcheckout_comment`.
6. **Złożenie zamówienia**: Wywołanie metody `placeOrder` na repozytorium koszyka.
7. **Obsługa sesji po złożeniu zamówienia**: Czyszczenie danych sesyjnych oraz wysłanie zdarzenia przeglądarki `magewire:order-placed` wraz z adresem URL przekierowania (np. na bramkę płatności zewnętrznej lub stronę sukcesu).

---

## 3. Warstwa Frontendowa: Alpine.js i Szablony

### Formularz Checkout ([view/frontend/templates/hyva/checkout.phtml](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/view/frontend/templates/hyva/checkout.phtml))
Zbudowany przy użyciu Tailwind CSS w układzie wielokolumnowym:
- **Mobile**: Układ jednokolumnowy, upraszczający wprowadzanie danych.
- **Tablet**: Układ dwukolumnowy (dane adresowe + podsumowanie i płatność).
- **Desktop**: Układ trzykolumnowy, dający pełny podgląd wszystkich sekcji koszyka bez konieczności przewijania strony.

### Logika Alpine.js (`initCheckout()`):
- **Debounced input**: Wprowadzanie wartości do pól wrażliwych na opóźnienia sieciowe (np. kod pocztowy, e-mail) posiada debouncing (opóźnienie wysyłki żądania Magewire o 150-800ms), dzięki czemu zapytania AJAX nie blokują interfejsu podczas pisania.
- **Autouzupełnianie adresów**: Obsługa dropdownu pozwalającego wybrać jeden z adresów pobranych z profilu klienta (`fillSavedAddress()`).
- **Walidacja w przeglądarce**: Niestandardowe walidatory dopasowane do polskich realiów:
  - Kod pocztowy: Wymuszenie formatu `XX-XXX` przy wysyłce do Polski.
  - Telefon: Wymuszenie minimum 9 cyfr oraz automatyczne formatowanie (np. dodawanie spacji co 3 cyfry oraz prefiksu `+48`).
  - Email: Wykrywanie typowych literówek w popularnych domenach pocztowych (np. sugerowanie `gmail.com` zamiast `gamil.com` / `onet.pl` zamiast `onet.pl.pl`).
- **Obsługa błędów płatności**: Nasłuchiwanie zdarzeń `fastcheckout:payment-error`. W przypadku błędu bramki płatności (np. odrzucenie transakcji), strona płynnie przewija się do sekcji wyboru płatności, a formularz zostaje odblokowany.

---

## 4. Wtyczki i Zgodność (Compatibility Plugins)

Moduł zawiera szereg wtyczek (plugins) eliminujących znane błędy w rdzeniu Magento 2 oraz usprawniających integrację:

1. **[CustomerManagementPlugin.php](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/Plugin/Quote/CustomerManagementPlugin.php)**:
   - Rozwiązuje krytyczny błąd w Magento 2 core, polegający na tym, że podczas rejestracji klienta w locie podczas zakupu jako gość, wymagane niestandardowe atrybuty adresu (np. fax, prefix, suffix, firma) nie były kopiowane, powodując błędy walidacji. Plugin kopiuje te dane bezpośrednio przed walidacją zapisu adresu.
2. **[AbstractAddress.php](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/Plugin/Customer/Model/Address/AbstractAddress.php)**:
   - Naprawia walidację adresu w przypadku krajów, dla których pole Region/Województwo nie jest wymagane. Zapobiega to błędom, gdy w bazie danych Magento istnieją stare lub niepasujące identyfikatory regionów.
3. **[PreserveInpostLocker.php](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/Plugin/Quote/PreserveInpostLocker.php)**:
   - Zapewnia integralność danych Paczkomatów InPost. Podczas asynchronicznych modyfikacji koszyka przez Magewire (np. dodanie kuponu rabatowego), Magento potrafi wyczyścić Extension Attributes. Plugin przed zapisem Quote sprawdza, czy wybrany Paczkomat znajduje się w bazie danych i w razie potrzeby przywraca jego ID (`inpost_locker_id`) do obiektu Quote.
4. **[Info.php](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/Plugin/Payments/Info.php)**:
   - Filtruje dodatkowe informacje o płatnościach. Niektóre wtyczki płatności próbują zapisać w `additional_information` obiekty nieserializowalne. Plugin odrzuca wartości niebędące typami skalarnymi lub obiektami implementującymi `Stringable`, chroniąc koszyk przed wywaleniem błędu bazy danych.
5. **[MergePlugin.php](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/Plugin/Layout/MergePlugin.php)**:
   - Rozwiązuje problem niekompatybilności layoutów XML z szablonem Hyvä. W standardowym Magento kontenery `head.additional` oraz `before.body.end` są zadeklarowane jako kontenery (`referenceContainer`), natomiast Hyvä deklaruje je jako bloki (`referenceBlock`). Plugin w locie modyfikuje drzewo XML, zamieniając tagi `referenceContainer` na `referenceBlock`, dzięki czemu zewnętrzne moduły nie psują renderowania strony.

---

## 5. Obserwatory (Observers)

1. **[QuoteSubmitSuccess.php](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/Observer/QuoteSubmitSuccess.php)**:
   - Uruchamia się po pomyślnym złożeniu zamówienia.
   - Odczytuje komentarz z sesji (`fastcheckout_comment`) i zapisuje go jako widoczny dla klienta rekord w tabeli historii statusów zamówienia (`sales_order_status_history`).
   - Automatycznie przypisuje zamówienie złożone jako gość do konta klienta, jeśli adres e-mail pokrywa się z istniejącym kontem.
   - Przypisuje zakupione linki produktów cyfrowych (Downloadable) bezpośrednio do konta klienta.
2. **[HyvaConfigGenerateBefore.php](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/Observer/HyvaConfigGenerateBefore.php)**:
   - Rejestruje katalog modułu Fastcheckout w procesie kompilacji stylów Tailwind CSS w szablonie Hyvä. Gwarantuje to, że wszelkie klasy CSS użyte w plikach `.phtml` koszyka zostaną prawidłowo wygenerowane w finalnym pliku stylów motywu.
3. **[IsAllowedGuestCheckoutObserver.php](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/Observer/Downloadable/IsAllowedGuestCheckoutObserver.php)**:
   - Dostosowuje uprawnienia zakupów gościnnych dla produktów do pobrania (Downloadable), respektując konfigurację sklepu w tym zakresie.
