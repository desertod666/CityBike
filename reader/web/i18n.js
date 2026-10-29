/* UI text only. Protocol payloads, passwords and user-entered values are excluded. */
'use strict';
(() => {
  const rows=String.raw`Управлять пультом\tControl remote\tStyr fjernkontroll
Пульт ESP32\tESP32 remote\tESP32-fjernkontroll
Включить пульт\tTurn remote on\tSlå på fjernkontroll
Выключить пульт\tTurn remote off\tSlå av fjernkontroll
Удерживайте кнопку для действия. Отпустите, чтобы завершить.\tHold a button to act. Release it to stop.\tHold inne en knapp for å utføre handlingen. Slipp for å avslutte.
Точно хотите выключить велосипед?\tAre you sure you want to turn the bike off?\tEr du sikker på at du vil slå av sykkelen?
Для подтверждения удерживайте Power off. Отпускание завершит команду.\tHold Power off to confirm. Release it to end the command.\tHold inne Power off for å bekrefte. Slipp for å avslutte kommandoen.
CAN-запись:\tCAN recording:\tCAN-opptak:
автоматически при нажатии\tautomatic on button press\tautomatisk ved knappetrykk
записываю действие\trecording action\ttar opp handlingen
отправлена\tuploaded\tlastet opp
Пульт выключен\tRemote is off\tFjernkontroll er av
Для пульта нужна новая прошивка ESP32\tThe remote requires updated ESP32 firmware\tFjernkontrollen krever oppdatert ESP32-fastvare
BLE подключён · кнопки готовы\tBLE connected · buttons ready\tBLE tilkoblet · knappene er klare
BLE подключён · ожидаю подписку\tBLE connected · waiting for subscription\tBLE tilkoblet · venter på abonnement
Пульт включён · ожидаю велосипед\tRemote is on · waiting for bike\tFjernkontroll er på · venter på sykkelen
Запускаю пульт…\tStarting remote…\tStarter fjernkontroll…
Сохраняются кадры до нажатия, удержание и 3 секунды после отпускания. Дополнительные провода питания этим ридером не измеряются.\tRecords before the press, during the hold and 3 seconds after release. This reader does not measure the additional power wires.\tLagrer rammer før trykket, under holdet og 3 sekunder etter at knappen slippes. Leseren måler ikke de ekstra strømledningene.
Показывать все BLE-устройства	Show all BLE devices	Vis alle BLE-enheter
По умолчанию ищу сервис пульта или имя Citybike Tester. Если пульта нет в списке, включите показ всех устройств.	Searches for the remote service or Citybike Tester name by default. If the remote is missing, enable all devices.	Søker som standard etter fjernkontrollens tjeneste eller navnet Citybike Tester. Hvis fjernkontrollen mangler, vis alle enheter.
Этап:	Stage:	Trinn:
Ожидание	Waiting	Venter
Выбор устройства	Device selection	Enhetsvalg
Устройство выбрано	Device selected	Enhet valgt
Соединение BLE	BLE connection	BLE-tilkobling
Поиск сервиса пульта	Finding remote service	Finner fjernkontrollens tjeneste
Поиск характеристики кнопок	Finding button characteristic	Finner knappekarakteristikk
Подписка на кнопки	Subscribing to buttons	Abonnerer på knapper
Чтение кнопок	Reading buttons	Leser knapper
Этап неизвестен	Unknown stage	Ukjent trinn
Браузер сообщает: Bluetooth доступен	Browser reports Bluetooth is available	Nettleseren melder at Bluetooth er tilgjengelig
Браузер сообщает: Bluetooth недоступен	Browser reports Bluetooth is unavailable	Nettleseren melder at Bluetooth er utilgjengelig
Доступность адаптера пока не подтверждена	Adapter availability has not been confirmed	Adapterens tilgjengelighet er ikke bekreftet
Устройство без имени	Unnamed device	Enhet uten navn
Ошибка подключения	Connection error	Tilkoblingsfeil
Соединение Bluetooth прервано	Bluetooth connection interrupted	Bluetooth-tilkoblingen ble avbrutt
Превышено время ожидания Bluetooth	Bluetooth request timed out	Tidsavbrudd for Bluetooth-forespørsel
Подключение отменено	Connection cancelled	Tilkobling avbrutt
Начато	Started	Startet
Нет показания	No reading	Ingen måleverdi
Пульт · Bluetooth и кнопки	Remote · Bluetooth and buttons	Fjernkontroll · Bluetooth og knapper
Чтение сервисного пульта	Workshop remote reader	Avlesning av servicefjernkontroll
Найдите пульт, затем включите чтение кнопок. Выберите название проверяемой кнопки и нажмите, удержите и отпустите её.	Find the remote, then start reading its buttons. Select the button you are testing, then press, hold and release it.	Finn fjernkontrollen, og start avlesning av knappene. Velg knappen du tester, og trykk, hold og slipp den.
Найти пульт	Find remote	Finn fjernkontroll
Читать кнопки	Read buttons	Les knapper
Отключить пульт	Disconnect remote	Koble fra fjernkontroll
Проверяемая кнопка	Button being tested	Knapp som testes
Без подписи	Unlabelled	Uten beskrivelse
Другое действие	Other action	Annen handling
Имя устройства	Device name	Enhetsnavn
Уведомлений	Notifications	Varslinger
Неизвестный формат	Unknown format	Ukjent format
Скачать BLE-запись	Download BLE log	Last ned BLE-logg
Отправить BLE-запись	Upload BLE log	Last opp BLE-logg
Реклама и сведения подключения	Advertising and connection details	Annonsering og tilkoblingsdetaljer
Браузер показывает только доступные ему поля рекламы. Полный радиопакет и MAC-адрес здесь недоступны. UUID из документации не считаются наблюдаемой рекламой.	The browser shows only advertising fields it exposes. Full radio packets and the MAC address are unavailable here. Documented UUIDs are not observed advertising.	Nettleseren viser bare annonseringsfeltene den gjør tilgjengelige. Hele radiopakker og MAC-adressen er ikke tilgjengelige her. Dokumenterte UUID-er regnes ikke som observert annonsering.
Подключение к ПК может занять единственное BLE-соединение пульта. Перед записью команд PCB через CAN отключите пульт здесь и верните его к велосипеду.	The PC connection may occupy the remote's only BLE connection. Before recording PCB commands over CAN, disconnect the remote here and reconnect it to the bike.	PC-tilkoblingen kan oppta fjernkontrollens eneste BLE-forbindelse. Før opptak av PCB-kommandoer over CAN må du koble fjernkontrollen fra her og tilbake til sykkelen.
Новая BLE-запись	New BLE log	Ny BLE-logg
Начать новую BLE-запись? Сначала скачайте или отправьте текущую.	Start a new BLE log? Download or upload the current one first.	Starte en ny BLE-logg? Last ned eller last opp den nåværende først.
В этом браузере нет Web Bluetooth. Откройте сайт в Chrome или Edge на ПК с Bluetooth.	This browser has no Web Bluetooth. Open the site in Chrome or Edge on a PC with Bluetooth.	Denne nettleseren har ikke Web Bluetooth. Åpne nettstedet i Chrome eller Edge på en PC med Bluetooth.
Bluetooth этого компьютера или телефона. CAN-ридер не требуется.	Uses Bluetooth on this computer or phone. No CAN reader is required.	Bruker Bluetooth på denne datamaskinen eller telefonen. CAN-leser er ikke nødvendig.
Пульт не выбран	No remote selected	Ingen fjernkontroll valgt
Пульт выбран	Remote selected	Fjernkontroll valgt
Выберите пульт в окне браузера	Select the remote in the browser chooser	Velg fjernkontrollen i nettleservinduet
Подключение к пульту…	Connecting to remote…	Kobler til fjernkontrollen…
Принимаю кнопки пульта	Receiving remote button events	Mottar knappehendelser fra fjernkontrollen
Пульт отключён	Remote disconnected	Fjernkontroll frakoblet
Реклама ещё не запрашивалась	Advertising has not been requested	Annonsering er ikke forespurt ennå
Ожидаю доступную рекламу…	Waiting for available advertising…	Venter på tilgjengelig annonsering…
Наблюдение рекламы включено	Advertising observation enabled	Observasjon av annonsering er aktivert
Наблюдение рекламы остановлено	Advertising observation stopped	Observasjon av annonsering er stoppet
Этот браузер не предоставляет чтение рекламы. Уведомления кнопок можно читать отдельно.	This browser does not expose advertising reads. Button notifications can still be read separately.	Denne nettleseren tilbyr ikke avlesning av annonsering. Knappevarslinger kan fortsatt leses separat.
Реклама недоступна в этом браузере. Уведомления кнопок можно читать отдельно.	Advertising is unavailable in this browser. Button notifications can still be read separately.	Annonsering er ikke tilgjengelig i denne nettleseren. Knappevarslinger kan fortsatt leses separat.
Последняя BLE-запись сохраняется в этом браузере.	The latest BLE log is saved in this browser.	Den siste BLE-loggen lagres i denne nettleseren.
Не удалось сохранить в браузере. Скачайте или отправьте запись перед обновлением страницы.	Could not save in this browser. Download or upload the log before reloading the page.	Kunne ikke lagre i nettleseren. Last ned eller last opp loggen før du laster siden på nytt.
Вытеснено событий:	Events no longer retained:	Hendelser som ikke lenger er lagret:
Кнопка	Button	Knapp
нажата	pressed	trykket
отпущена	released	sluppet
Неизвестный формат уведомления	Unknown notification format	Ukjent varslingsformat
Пульт не выбран. Включите его и проверьте, что он доступен для подключения.	No remote selected. Turn it on and check that it is available for connection.	Ingen fjernkontroll valgt. Slå den på og sjekk at den er tilgjengelig for tilkobling.
BLE-запись получена сервером. Код:	BLE log received by the server. ID:	BLE-loggen er mottatt av serveren. ID:
Пульт занят	Remote is busy	Fjernkontrollen er opptatt
Сначала отключите пульт	Disconnect the remote first	Koble fra fjernkontrollen først
Сначала найдите и выберите пульт	Find and select the remote first	Finn og velg fjernkontrollen først
Для другого пульта сначала сохраните данные и начните новую запись	Save the data and start a new log before selecting a different remote	Lagre dataene og start en ny logg før du velger en annen fjernkontroll
Неверная характеристика пульта	Unexpected remote characteristic	Uventet karakteristikk for fjernkontrollen
У характеристики нет уведомлений	The characteristic does not support notifications	Karakteristikken støtter ikke varslinger
Описание действия	Action description	Beskrivelse av handling
Например: нажимаю Walk Assist	For example: pressing Walk Assist	For eksempel: trykker på trilleassistanse
Текст можно подготовить до старта. Во время теста нажмите «Отметить действие» в нужный момент.	You can prepare the text before starting. During the test, press Mark action at the right moment.	Du kan skrive teksten før start. Under testen trykker du på Marker handling på riktig tidspunkt.
Сервис ридера	Reader service tools	Serviceverktøy for leseren
Дополнительное чтение Spard	Additional Spard reads	Ekstra Spard-lesing
Доступ и отправка записей	Access and recording uploads	Tilgang og opplasting av opptak
Откройте живые данные или запишите тест на 30 или 60 секунд.	Open live data or record a 30 or 60 second test.	Åpne sanntidsdata eller ta opp en test på 30 eller 60 sekunder.
Ошибки, замеченные ридером	Faults observed by the reader	Feil registrert av leseren
Последние 8 событий текущего чтения. История PCB не запрашивалась.	Last 8 events in this reading session. PCB history has not been requested.	Siste 8 hendelser i denne leseøkten. PCB-historikken er ikke hentet.
Журнал начнётся после подключения обновлённой страницы USB-ПК.	The log starts when the updated USB-computer page connects.	Loggen starter når den oppdaterte siden på USB-PC-en kobles til.
Ненулевые коды пока не получены. Это не проверка под нагрузкой.	No nonzero codes received yet. This is not a test under load.	Ingen feilkoder mottatt ennå. Dette er ikke en test under belastning.
После ошибки получен код 00	Code 00 received after this fault	Kode 00 mottatt etter denne feilen
Следующий код	Next code	Neste kode
Последний полученный код	Last received code	Siste mottatte kode
Повторов	Occurrences	Forekomster
Более ранние события вытеснены	Earlier events no longer fit in the log	Tidligere hendelser har ikke lenger plass i loggen
Контроллер	Controller	Kontroller
Батарея	Battery	Batteri
Узел	Node	Node
CityBike Reader · Тесты CAN	CityBike Reader · CAN diagnostics	CityBike Reader · CAN-diagnostikk
Диагностика велосипеда	Bicycle diagnostics	Sykkeldiagnostikk
Переключить дневной и ночной режим	Switch day and night mode	Bytt mellom dag- og nattmodus
Язык	Language	Språk
ВЕЛОСИПЕД И БАТАРЕЯ · ESP32	BICYCLE AND BATTERY · ESP32	SYKKEL OG BATTERI · ESP32
Живые данные CAN	Live CAN data	CAN-data i sanntid
Ожидание ESP	Waiting for ESP	Venter på ESP
Данные поступают только с ESP32	Data comes from ESP32 only	Data kommer kun fra ESP32
ESP32 · напрямую по USB / Wi-Fi	ESP32 · direct USB / Wi-Fi	ESP32 · direkte USB / Wi-Fi
ESP32 · через подключённый USB-ПК	ESP32 · via the connected USB computer	ESP32 · via tilkoblet USB-PC
Начать чтение · без таймера	Start reading · continuous	Start lesing · kontinuerlig
Остановить просмотр	Stop reading	Stopp lesing
Без таймера · до нажатия «Остановить просмотр»	Continuous · until you press Stop reading	Kontinuerlig · til du trykker Stopp lesing
Все данные	All data	Alle data
★ Избранное	★ Favorites	★ Favoritter
Избрано показателей:	Favorite readings:	Favorittverdier:
Избранных показателей пока нет. Откройте «Все данные» и нажмите звезду рядом с нужным показателем.	No favorites yet. Open All data and select the star next to a reading.	Ingen favoritter ennå. Åpne Alle data og velg stjernen ved en verdi.
Показанные данные	Displayed data	Viste data
В избранное	Add to favorites	Legg til favoritter
Убрать из избранного	Remove from favorites	Fjern fra favoritter
Ожидание известных сообщений	Waiting for known messages	Venter på kjente meldinger
известных сообщений	known messages	kjente meldinger
Нет данных	No data	Ingen data
сейчас	just now	akkurat nå
с назад	s ago	s siden
Дополнительных ID пока нет.	No additional IDs yet.	Ingen ekstra ID-er ennå.
Дополнительные CAN ID	Additional CAN IDs	Ekstra CAN-ID-er
Управление · таймер выключения	Control · shutdown timer	Styring · avslåingstimer
Батарея · состояние	Battery · status	Batteri · status
Батарея · предупреждения	Battery · warnings	Batteri · varsler
Контроллер · ошибки	Controller · errors	Kontroller · feil
Батарея · заряд и ёмкость	Battery · charge and capacity	Batteri · ladning og kapasitet
Батарея · питание	Battery · power	Batteri · strøm og spenning
Помощь при ходьбе	Walk assist	Trilleassistanse
Контроллер · датчики и запас хода	Controller · sensors and range	Kontroller · sensorer og rekkevidde
Контроллер · движение и питание	Controller · motion and power	Kontroller · bevegelse og strøm
Датчик момента	Torque sensor	Momentsensor
Контроллер · выключение	Controller · shutdown	Kontroller · avslåing
Контроллер · энергия	Controller · energy	Kontroller · energi
Контроллер · режим	Controller · mode	Kontroller · modus
Служебный счётчик	Service counter	Serviceteller
Органы управления	Controls	Betjening
Колесо и ограничение скорости	Wheel and speed limit	Hjul og fartsgrense
Код состояния	Status code	Statuskode
Код предупреждения	Warning code	Varselkode
Код ошибки	Error code	Feilkode
Полная ёмкость	Full capacity	Full kapasitet
Остаток ёмкости	Remaining capacity	Gjenværende kapasitet
Относительный заряд	Relative charge	Relativ ladning
Абсолютный заряд	Absolute charge	Absolutt ladning
Состояние батареи	Battery health	Batterihelse
Ток батареи	Battery current	Batteristrøm
Напряжение батареи	Battery voltage	Batterispenning
Температура батареи	Battery temperature	Batteritemperatur
Состояние walk assist	Walk assist status	Status for trilleassistanse
Заряд по контроллеру	Charge reported by controller	Ladning fra kontroller
Пробег поездки	Trip distance	Turlengde
Каденс по контроллеру	Controller cadence	Kadens fra kontroller
Сигнал момента	Torque signal	Momentsignal
Запас хода	Estimated range	Anslått rekkevidde
Ток контроллера	Controller current	Kontrollerstrøm
Напряжение контроллера	Controller voltage	Kontrollerspenning
Температура мотора	Motor temperature	Motortemperatur
Температура контроллера	Controller temperature	Kontrollertemperatur
Каденс	Cadence	Kadens
Счётчик датчика	Sensor counter	Sensorteller
Запрет выключения	Shutdown inhibited	Avslåing sperret
Калории	Calories	Kalorier
Счётчик импульсов	Pulse counter	Pulsteller
Количество уровней	Number of assist levels	Antall assistansenivåer
Уровень помощи	Assist level	Assistansenivå
Свет	Lights	Lys
Флаг сброса поездки	Trip reset flag	Flagg for nullstilling av tur
Ограничение скорости	Speed limit	Fartsgrense
Код размера колеса	Wheel size code	Hjulstørrelseskode
Окружность колеса	Wheel circumference	Hjulomkrets
Электрическая мощность · расчёт	Electrical power · calculated	Elektrisk effekt · beregnet
Скорость	Speed	Hastighet
Режим	Mode	Modus
Значение	Value	Verdi
значение не подтверждено	unconfirmed value	ubekreftet verdi
проверить формат	check format	kontroller format
CAN · живые данные	CAN · live data	CAN · sanntidsdata
CAN · приём	CAN · receiving	CAN · mottak
CAN остановлен	CAN stopped	CAN stoppet
Приём остановлен	Reading stopped	Lesing stoppet
Нет связи с ESP	No connection to ESP	Ingen forbindelse til ESP
идёт запись	recording	opptak pågår
чтение без таймера	continuous reading	kontinuerlig lesing
приём остановлен	reading stopped	lesing stoppet
Для запуска с телефона введите ключ в блоке «Велосипед · удалённая панель» ниже.	To start from your phone, enter the access key in the Bicycle · remote panel section below.	For å starte fra telefonen, skriv tilgangsnøkkelen i Sykkel · fjernpanel nedenfor.
На USB-ПК подключён адаптер Spard. Подключите ESP32 для чтения CAN.	The USB computer has a Spard adapter selected. Connect ESP32 to read CAN.	Spard-adapteren er valgt på USB-PC-en. Koble til ESP32 for å lese CAN.
Нет связи с ESP через USB-ПК. Оставьте на нём открытый сайт с подключённой ESP.	No ESP connection through the USB computer. Keep this site open there with ESP connected.	Ingen ESP-forbindelse via USB-PC-en. La nettstedet være åpent der med ESP tilkoblet.
На USB-ПК открыта старая версия сайта. Обновите страницу именно на компьютере с ESP; затем чтение можно запускать с телефона.	The USB computer has an older site version. Update the page on the computer with ESP; you can then start reading from your phone.	USB-PC-en har en eldre nettstedversjon. Oppdater siden på PC-en med ESP; deretter kan lesing startes fra telefonen.
На USB-ПК завершите текущую проверку и включите удалённое управление.	Finish the current test on the USB computer and enable remote control.	Avslutt gjeldende test på USB-PC-en og aktiver fjernstyring.
Нет подтверждения запуска. Проверьте удалённое подключение.	Start was not confirmed. Check the remote connection.	Start er ikke bekreftet. Kontroller fjernforbindelsen.
Показаны последние принятые значения. Серые поля не обновляются. Расшифровка по SYM / Bafang V2.5 ещё проверяется на этом велосипеде. Ячейки и серийные номера не подставляются из штатного адаптера Spard.	Latest received values. Gray fields are not updating. SYM / Bafang V2.5 decoding is still being verified on this bicycle. Cells and serial numbers are not copied from the stock Spard adapter.	Siste mottatte verdier. Grå felt oppdateres ikke. SYM / Bafang V2.5-dekoding kontrolleres fortsatt på denne sykkelen. Celler og serienumre hentes ikke fra Spard-adapteren.
Батарея Spard · ESP32	Spard battery · ESP32	Spard-batteri · ESP32
Ожидание полного ответа	Waiting for a complete response	Venter på fullstendig svar
Прочитать батарею через ESP	Read battery through ESP	Les batteri via ESP
Остановить опрос	Stop query	Stopp forespørsel
Все поля Information	All Information fields	Alle Information-felt
Подключить USB	Connect USB	Koble til USB
Отключить USB	Disconnect USB	Koble fra USB
Выбрать / прошить ESP32	Select / flash ESP32	Velg / programmer ESP32
Ридер не подключён	Reader disconnected	Leser frakoblet
Подключение…	Connecting…	Kobler til…
Подключено	Connected	Tilkoblet
Не подключён	Disconnected	Frakoblet
Нет подключения	Disconnected	Frakoblet
USB отключён	USB disconnected	USB frakoblet
Нет связи	No connection	Ingen forbindelse
Подключить	Connect	Koble til
Отключить	Disconnect	Koble fra
Прямое USB	Direct USB	Direkte USB
Велосипед · удалённая панель	Bicycle · remote panel	Sykkel · fjernpanel
Доступ к подключённому ридеру	Access the connected reader	Tilgang til tilkoblet leser
Ключ доступа	Access key	Tilgangsnøkkel
Ключ владельца	Owner access key	Eierens tilgangsnøkkel
Открыть доступ	Unlock access	Åpne tilgang
Подключиться	Connect	Koble til
Выйти	Sign out	Logg ut
Забыть ключ	Forget key	Glem nøkkel
Показать ключ	Show key	Vis nøkkel
Скрыть ключ	Hide key	Skjul nøkkel
Удалённое управление	Remote control	Fjernstyring
Удалённая диагностика	Remote diagnostics	Fjerndiagnostikk
Поддержка подключена	Support connected	Støtte tilkoblet
Удалённая проверка идёт	Remote test running	Fjerntest pågår
Обновление ESP32…	Updating ESP32…	Oppdaterer ESP32…
Автообновление сайта включено	Automatic site updates enabled	Automatiske nettstedoppdateringer aktivert
Ручные испытания — блокировать удалённые задания	Manual tests — block remote jobs	Manuelle tester — blokker fjernoppgaver
Разрешить удалённые проверки	Allow remote tests	Tillat fjerntester
Пароли Spard	Spard passwords	Spard-passord
Spard SBS Plus V1.3 · регистр букв важен	Spard SBS Plus V1.3 · case sensitive	Spard SBS Plus V1.3 · skiller mellom store og små bokstaver
Загрузить пароли	Load passwords	Hent passord
Скопировать	Copy	Kopier
Скопировано	Copied	Kopiert
Пароли доступны после входа с ключом владельца.	Sign in with the owner key to view passwords.	Logg inn med eierens nøkkel for å vise passord.
Загрузка…	Loading…	Laster…
Ожидание	Waiting	Venter
Выключена	Disabled	Deaktivert
Включена	Enabled	Aktivert
Нет связи с сервером	No server connection	Ingen serverforbindelse
Отправляется	Sending	Sender
Готово	Done	Ferdig
Ошибка	Error	Feil
Остановить	Stop	Stopp
Начать	Start	Start
Обновить	Update	Oppdater
Продолжить	Continue	Fortsett
Отмена	Cancel	Avbryt
Настройки	Settings	Innstillinger
Сохранить	Save	Lagre
Завершение…	Finishing…	Avslutter…
Подготовка…	Preparing…	Klargjør…
Данные устарели	Data is stale	Data er utdatert
данные устарели	stale data	utdaterte data
Нет свежих данных	No recent data	Ingen ferske data
Принято кадров	Frames received	Mottatte rammer
Кадров принято	Frames received	Mottatte rammer
Ошибки CAN	CAN errors	CAN-feil
Ошибки	Errors	Feil
Приём	Reading	Lesing
Запись	Recording	Opptak
30 секунд	30 seconds	30 sekunder
60 секунд	60 seconds	60 sekunder
10 минут	10 minutes	10 minutter
Оставшееся время	Time remaining	Tid igjen
До конца теста	Test time remaining	Tid igjen av testen
Тест 30 с	30 s test	30 s test
Тест 60 с	60 s test	60 s test
Запустить тест	Start test	Start test
Остановить тест	Stop test	Stopp test
Пассивная запись CAN	Passive CAN recording	Passivt CAN-opptak
Тест CAN	CAN test	CAN-test
Файлы для анализа	Files for analysis	Filer til analyse
Загрузить файлы	Upload files	Last opp filer
Выбрать файлы	Select files	Velg filer
Загрузка файлов	File upload	Filopplasting
Выберите файл	Select a file	Velg en fil
Отправить файл	Upload file	Last opp fil
Файл отправлен	File uploaded	Fil lastet opp
Открыть файлы	Open files	Åpne filer
Прошивка	Firmware	Fastvare
Прошивка ридера	Reader firmware	Leserens fastvare
Обновление ESP32 · BySykkel	ESP32 update · BySykkel	ESP32-oppdatering · BySykkel
← Вернуться к диагностике	← Back to diagnostics	← Tilbake til diagnostikk
Обновление ридера.	Update your reader.	Oppdater leseren.
Прямо в браузере.	In your browser.	I nettleseren.
Без EXE и установки программ. Chrome получает прошивку с нашего сервера и записывает её через USB в ESP32.	No EXE or software installation. Chrome downloads firmware from our server and writes it to ESP32 over USB.	Ingen EXE eller programinstallasjon. Chrome henter fastvare fra serveren og skriver den til ESP32 via USB.
Останови запись CAN и отсоедини CANH/CANL от велосипеда. Оставь ESP32 подключённой к USB. Закрой подключения к её COM-порту в других вкладках.	Stop CAN recording and disconnect CANH/CANL from the bicycle. Keep ESP32 connected to USB. Close connections to its COM port in other tabs.	Stopp CAN-opptaket og koble CANH/CANL fra sykkelen. La ESP32 være tilkoblet USB. Lukk tilkoblinger til COM-porten i andre faner.
CANH/CANL отсоединены от велосипеда	CANH/CANL disconnected from bicycle	CANH/CANL koblet fra sykkelen
Проверяем файлы прошивки…	Checking firmware files…	Kontrollerer fastvarefiler…
Выбрать ESP32 / COM	Select ESP32 / COM	Velg ESP32 / COM
Прошить ESP32	Flash ESP32	Programmer ESP32
Плата ещё не выбрана. Выбор устройства сам по себе не записывает прошивку.	No board selected. Selecting a device does not write firmware.	Ingen kort valgt. Valg av enhet skriver ikke fastvare.
Ход прошивки	Flash progress	Fremdrift for programmering
Записывается только ESP32-ридер. Настройки Bafang не меняются. Полное стирание памяти отключено; настройки ридера сохраняются.	Only the ESP32 reader is updated. Bafang settings are unchanged. Full erase is disabled; reader settings are preserved.	Kun ESP32-leseren oppdateres. Bafang-innstillinger endres ikke. Full sletting er deaktivert; leserinnstillinger beholdes.
Если загрузчик не подключается	If the bootloader does not connect	Hvis oppstartslasteren ikke kobler til
Закрой соединение с COM в остальных вкладках. Если автоматический вход не сработал: удерживай BOOT, нажми и отпусти RESET, затем отпусти BOOT и повтори выбор порта. После записи нажми RESET, если плата сама не перезапустилась.	Close COM connections in other tabs. If automatic entry fails, hold BOOT, press and release RESET, then release BOOT and select the port again. Press RESET after flashing if the board does not restart.	Lukk COM-tilkoblinger i andre faner. Hvis automatisk oppstart mislykkes: hold BOOT, trykk og slipp RESET, slipp deretter BOOT og velg porten på nytt. Trykk RESET etter programmering hvis kortet ikke starter på nytt.
Журнал обновления	Update log	Oppdateringslogg
Состояние ридера	Reader status	Leserstatus
Время работы	Uptime	Oppetid
Свободная память	Free memory	Ledig minne
Перезапуск / сеанс	Boot / session	Oppstart / økt
Режим записи	Recording mode	Opptaksmodus
Поток данных	Data stream	Datastrøm
ЖИВАЯ АКТИВНОСТЬ	LIVE ACTIVITY	AKTIVITET I SANNTID
НА СВЯЗИ	CONNECTED	TILKOBLET
кадров принято ESP32	frames received by ESP32	rammer mottatt av ESP32
Последние 30 измерений	Last 30 readings	Siste 30 målinger
Счётчик устройства	Device counter	Enhetsteller
Скорость приёма за последние 30 измерений	Receive rate over the last 30 readings	Mottakshastighet for de siste 30 målingene
Диагностика	Diagnostics	Diagnostikk
Дополнительная диагностика	Additional diagnostics	Mer diagnostikk
Проводка и сигнал	Wiring and signal	Kabling og signal
Версии и обновление ESP32	Versions and ESP32 update	Versjoner og ESP32-oppdatering
Где находятся данные	Where data is stored	Hvor data lagres
ПРОЗРАЧНАЯ ЗАПИСЬ	TRANSPARENT RECORDING	TRANSPARENT OPPTAK
Ридер готов к работе.	Reader ready.	Leseren er klar.
Подключите ваш ридер.	Connect your reader.	Koble til leseren.
Шина под наблюдением.	Monitoring the bus.	Overvåker bussen.
Локальная панель ESP32. Выберите скорость для пассивного приёма CAN.	ESP32 local panel. CAN reading uses TRIPLE at 250 kbit/s.	Lokalt ESP32-panel. CAN leses med TRIPLE ved 250 kbit/s.
Соединение с панелью потеряно. Проверьте USB или Wi-Fi и адрес страницы.	Panel connection lost. Check USB or Wi-Fi and the page address.	Forbindelsen til panelet er brutt. Kontroller USB eller Wi-Fi og sideadressen.
Нет подтверждённого ридера	No verified reader	Ingen bekreftet leser
Панель ESP32	ESP32 panel	ESP32-panel
Чтение батареи	Reading battery	Leser batteri
Проверка линии	Checking bus	Kontrollerer buss
Проверка качества CAN	CAN quality check	Kontroll av CAN-kvalitet
Запрос батареи	Battery query	Batteriforespørsel
Ожидание ответа	Waiting for response	Venter på svar
Ответ получен	Response received	Svar mottatt
Последнее чтение	Last reading	Siste lesing
Данные батареи	Battery data	Batteridata
Серийный номер	Serial number	Serienummer
Модель	Model	Modell
Версия ПО	Software version	Programvareversjon
Ячейки	Cells	Celler
Ячейка	Cell	Celle
Напряжение	Voltage	Spenning
Температура	Temperature	Temperatur
Ток	Current	Strøm
Заряд	Charge	Ladning
Ёмкость	Capacity	Kapasitet
Полная	Full	Full
Остаток	Remaining	Gjenværende
Расчётная мощность	Calculated power	Beregnet effekt
Мощность	Power	Effekt
Батарея	Battery	Batteri
Контроллер	Controller	Kontroller
Количество циклов	Cycle count	Antall sykluser
Циклы	Cycles	Sykluser
Число ячеек	Cell count	Antall celler
Минимум	Minimum	Minimum
Максимум	Maximum	Maksimum
Разброс	Spread	Spredning
разброс	spread	spredning
ячееек	cells	celler
ячеек	cells	celler
код состояния	status code	statuskode
по контроллеру	reported by controller	fra kontroller
Обзор	Overview	Oversikt
CAN-поток	CAN stream	CAN-strøm
Ридер и сеть	Reader and network	Leser og nettverk
Программа и обновления	Software and updates	Programvare og oppdateringer
Сохранено	Saved	Lagret
сохранено	saved	lagret
отправлена	uploaded	lastet opp
сохранена	saved	lagret
прервана	interrupted	avbrutt
записывается	recording	opptak pågår
завершение не подтверждено	completion unconfirmed	fullføring ubekreftet
ошибка сохранения	storage error	lagringsfeil
пропуски	gaps	hull
не подтверждено	unconfirmed	ubekreftet
Неизвестный ID	Unknown ID	Ukjent ID
Проверить формат	Check format	Kontroller format
Завершить	Finish	Avslutt
Пауза	Pause	Pause
Продолжить просмотр	Resume viewing	Fortsett visning
Очистить	Clear	Tøm
Скачать	Download	Last ned
Скачать CSV	Download CSV	Last ned CSV
Скачать JSONL	Download JSONL	Last ned JSONL
км/ч	km/h	km/t
об/мин	rpm	o/min
мА·ч	mAh	mAh
мВ	mV	mV
Вт	W	W
КБ	KB	KB
МиБ	MiB	MiB
кбит/с	kbit/s	kbit/s
бит/с	bit/s	bit/s
кадров/с	frames/s	rammer/s
ошибок/с	errors/s	feil/s
кадров	frames	rammer
ошибок	errors	feil
байт	bytes	byte
мин	min	min
В	V	V
А	A	A
мм	mm	mm
км	km	km
код	code	kode
с	s	s
ч	h	t
Диагностика и настройки	Diagnostics and settings	Diagnostikk og innstillinger
Диагностика для поддержки	Support diagnostics	Diagnostikk for støtte
Данные и доступ	Data and access	Data og tilgang
Пассивная запись CAN через ESP32	Passive CAN recording through ESP32	Passivt CAN-opptak via ESP32
Запись CAN через ESP32	CAN recording through ESP32	CAN-opptak via ESP32
Запись обновления · 10 минут	Update capture · 10 minutes	Oppdateringsopptak · 10 minutter
Выберите 30 или 60 секунд. Все принятые кадры сохранятся в браузере.	Choose 30 or 60 seconds. All received frames are saved in this browser.	Velg 30 eller 60 sekunder. Alle mottatte rammer lagres i denne nettleseren.
Готов к тесту	Ready for a test	Klar til test
Завершить тест	Finish test	Avslutt test
Завершить программу	Quit application	Avslutt programmet
Мощность · расчёт	Power · calculated	Effekt · beregnet
Пауза экрана	Pause display	Sett visning på pause
Сумма ячеек	Cell voltage sum	Sum av cellespenninger
Сумма напряжений × ток батареи	Voltage sum × battery current	Spenningssum × batteristrøm
Штатный адаптер Spard	Stock Spard adapter	Original Spard-adapter
ШТАТНЫЙ АДАПТЕР	STOCK ADAPTER	ORIGINAL ADAPTER
Чтение батареи через USB-адаптер Spard. Программа Spard должна освободить его порт.	Read the battery through the Spard USB adapter. Close the port in Spard first.	Les batteriet via Spard USB-adapteren. Frigi porten i Spard først.
Для первого подключения: «Диагностика и настройки» → «Штатный адаптер Spard».	First connection: Diagnostics and settings → Stock Spard adapter.	Første tilkobling: Diagnostikk og innstillinger → Original Spard-adapter.
Подключите ESP32 или откройте удалённый доступ.	Connect ESP32 or unlock remote access.	Koble til ESP32 eller åpne fjerntilgang.
Подключите ESP32 по USB	Connect ESP32 over USB	Koble til ESP32 via USB
Подключите ESP32 по USB и нажмите «Подключить».	Connect ESP32 over USB and press Connect.	Koble til ESP32 via USB og trykk Koble til.
Подключите ридер.	Connect the reader.	Koble til leseren.
USB-подключение на этом компьютере	USB connection on this computer	USB-tilkobling på denne PC-en
Для текущей линии PCB ↔ контроллер подтверждены 250 000 бит/с.	250,000 bit/s is confirmed for the current PCB ↔ controller bus.	250 000 bit/s er bekreftet for gjeldende PCB ↔ kontrollerbuss.
Выберите ридер ESP32 в окне Chrome	Select the ESP32 reader in Chrome	Velg ESP32-leseren i Chrome
Технические данные	Technical data	Tekniske data
Показания контроллера	Controller readings	Kontrollerverdier
Температуры, ёмкость и состояние	Temperatures, capacity and status	Temperaturer, kapasitet og status
Коды состояния сохранены без догадок о назначении битов. Мощность рассчитана по электрическим данным батареи.	Status codes are kept as received without guessing bit meanings. Power is calculated from battery electrical readings.	Statuskoder beholdes som mottatt uten å gjette bitbetydninger. Effekt beregnes fra batteriets elektriske målinger.
Потери очереди / USB	Queue / USB drops	Tap i kø / USB
Пропуски веб-просмотра	Web preview gaps	Hull i nettvisningen
В памяти браузера:	In browser memory:	I nettleserminnet:
Сырые кадры	Raw frames	Rårammer
Неизвестные ID и RTR тоже появятся здесь.	Unknown IDs and RTR frames are shown here too.	Ukjente ID-er og RTR-rammer vises også her.
ПОЛНЫЙ ФРАГМЕНТ CAN	FULL CAN CAPTURE	FULLSTENDIG CAN-OPPTAK
Ожидаем CAN-кадры	Waiting for CAN frames	Venter på CAN-rammer
Выберите проверенную скорость и начните пассивный приём.	Use the verified bus rate to start passive reading.	Bruk bekreftet busshastighet for å starte passiv lesing.
Экран и фильтр не ограничивают запись. Полные сеансы доступны в разделе «Записи браузера».	The display and filter do not limit recording. Full sessions are available under Browser recordings.	Visning og filter begrenser ikke opptaket. Hele økter finnes under Nettleseropptak.
ЛОКАЛЬНОЕ ХРАНИЛИЩЕ	LOCAL STORAGE	LOKAL LAGRING
Записи браузера	Browser recordings	Nettleseropptak
Записей пока нет. Выберите тест 30 или 60 секунд.	No recordings yet. Choose a 30 or 60 second test.	Ingen opptak ennå. Velg en test på 30 eller 60 sekunder.
Кадры и отметки пишутся порциями в хранилище браузера. Неизвестные/RTR/невалидные кадры не отбрасываются. В таблице последние 500 кадров. Лимит сеанса — 128 МиБ; при ошибке записи CAN останавливается.	Frames and markers are saved in batches in browser storage, including unknown, RTR and invalid frames. The table shows the last 500 frames. Session limit: 128 MiB; CAN stops on a storage error.	Rammer og markører lagres i grupper i nettleseren, også ukjente, RTR- og ugyldige rammer. Tabellen viser de siste 500 rammene. Øktgrense: 128 MiB; CAN stoppes ved lagringsfeil.
Выбрать папку для новых логов	Choose folder for new logs	Velg mappe for nye logger
Выберите папку: завершённые JSONL сохраняются в её подпапку diag-logs.	Choose a folder to save completed JSONL recordings in its diag-logs subfolder.	Velg en mappe for å lagre ferdige JSONL-opptak i undermappen diag-logs.
Вкладка должна оставаться открытой во время записи. После её закрытия сеанс помечается прерванным; сохранённые части остаются. Удаление данных сайта браузером удаляет его локальные записи. Скачивайте важные сеансы.	Keep the tab open while recording. Closing it marks the session interrupted; saved parts remain. Clearing browser site data removes local recordings. Download important sessions.	Hold fanen åpen under opptak. Lukkes den, merkes økten som avbrutt; lagrede deler beholdes. Sletting av nettstedsdata fjerner lokale opptak. Last ned viktige økter.
Отправлять завершённые записи	Upload completed recordings	Last opp ferdige opptak
Передавать состояние ридера	Share reader status	Del leserstatus
Разрешить удалённые задания	Allow remote jobs	Tillat fjernoppgaver
Отправка логов, мониторинг и удалённые задания включаются отдельно. Во время ручных испытаний ридером управляете вы.	Log uploads, monitoring and remote jobs are enabled separately. You control the reader during manual tests.	Loggopplasting, overvåking og fjernoppgaver aktiveres separat. Du styrer leseren under manuelle tester.
Отправка выключена. Галочка запоминается в этом браузере.	Uploads are off. This setting is saved in this browser.	Opplasting er av. Innstillingen lagres i denne nettleseren.
Для отправки логов включите галочку «Отправлять завершённые записи». Код и привязка не нужны. Завершённые записи отправляются при доступном интернете; оригиналы остаются в браузере.	Enable Upload completed recordings to send logs. No code or pairing is required. Completed recordings upload when internet is available; originals stay in the browser.	Aktiver Last opp ferdige opptak for å sende logger. Ingen kode eller paring kreves. Ferdige opptak lastes opp når internett er tilgjengelig; originalene beholdes i nettleseren.
Отметить действие	Mark action	Merk handling
Отмечайте начало и конец действия во время записи.	Mark the start and end of each action while recording.	Merk starten og slutten av hver handling under opptak.
Дополнительно: подключение и проводка	More: connection and wiring	Mer: tilkobling og kabling
Определить адаптер Spard	Identify Spard adapter	Identifiser Spard-adapter
Для выбора нужен Chrome или Edge. Результат определения появится в блоке батареи.	Use Chrome or Edge to select a device. Identification results appear in the battery section.	Bruk Chrome eller Edge for å velge enhet. Identifikasjonen vises i batteridelen.
Выберите штатный донгл (на прежних фото — COM4). Сайт отправит его USB VID/PID для определения. Определение получает только USB VID/PID. Для чтения используйте отдельную проверку ниже.	Select the stock dongle (previously COM4). Identification uploads only its USB VID/PID. Use the separate test below for reading.	Velg originaladapteren (tidligere COM4). Identifikasjonen sender kun USB VID/PID. Bruk den separate testen nedenfor for lesing.
Прочитать батарею · 30 с	Read battery · 30 s	Les batteri · 30 s
Наблюдать линию · 30 с	Monitor bus · 30 s	Overvåk buss · 30 s
Перед проверкой освободите COM4 в Spard. Проверка настраивает адаптер на CAN 250 кбит/с и отправляет три штатных запроса Information. Настройки батареи не изменяются.	Release COM4 in Spard first. The test configures the adapter for CAN at 250 kbit/s and sends three stock Information queries. Battery settings are unchanged.	Frigi COM4 i Spard først. Testen setter adapteren til CAN ved 250 kbit/s og sender tre originale Information-forespørsler. Batteriinnstillinger endres ikke.
Проверка общего трафика без запросов к батарее. Передача полных CAN ID этим адаптером пока не подтверждена.	Monitor traffic without battery queries. Full CAN ID forwarding by this adapter is not yet verified.	Overvåk trafikk uten batteriforespørsler. Videresending av fulle CAN-ID-er fra adapteren er ikke bekreftet ennå.
Прошивка, программа Spard, SYM, фото или архив — до 128 МиБ на файл.	Firmware, Spard software, SYM, photo or archive — up to 128 MiB per file.	Fastvare, Spard-programvare, SYM, bilde eller arkiv — opptil 128 MiB per fil.
Выберите файл с этого компьютера. Подключение ридера не требуется.	Select a file from this computer. No reader connection is required.	Velg en fil fra denne PC-en. Leser trenger ikke være tilkoblet.
Отменить загрузку	Cancel upload	Avbryt opplasting
Wi-Fi, проводка и LED	Wi-Fi, wiring and LED	Wi-Fi, kabling og LED
Устройство и LED	Device and LED	Enhet og LED
Сеть ридера	Reader network	Lesernettverk
Адрес панели	Panel address	Paneladresse
Имя сети	Network name	Nettverksnavn
Без пароля	No password	Uten passord
Канал / клиенты	Channel / clients	Kanal / klienter
Канал	Channel	Kanal
Эта сеть предназначена для локальной диагностики и не предоставляет интернет. Любой подключённый к ней клиент может управлять пассивным приёмом.	This network is for local diagnostics and does not provide internet. Any connected client can control passive reading.	Dette nettverket er for lokal diagnostikk og gir ikke internettilgang. Alle tilkoblede klienter kan styre passiv lesing.
Имя Wi-Fi после перезапуска	Wi-Fi name after restart	Wi-Fi-navn etter omstart
Активный уровень LED	LED active level	Aktivt LED-nivå
Сохранить полярность LED	Save LED polarity	Lagre LED-polaritet
Сохранить полярность	Save polarity	Lagre polaritet
Проверка светодиода	LED test	LED-test
Штатный LED	Built-in LED	Innebygd LED
Латиница, цифры, пробел, дефис и _. Изменения применятся после перезапуска питания. CAN должен быть остановлен.	Use Latin letters, digits, spaces, hyphen and _. Changes apply after a power restart. CAN must be stopped.	Bruk latinske bokstaver, tall, mellomrom, bindestrek og _. Endringer trer i kraft etter omstart. CAN må være stoppet.
Схема M5.4/G5.4 из новых материалов	M5.4/G5.4 diagram from new documentation	M5.4/G5.4-diagram fra ny dokumentasjon
Только для показанной пары HMI/BIKE PCB ↔ BIKE PCB/CU: GN (зелёный) — CAN-H; WT (белый) — CAN-L; BK (чёрный) — GND. BN — 36 В; OG — On/off. BN и OG к ридеру не подключаются. Сначала подтвердите соответствие вашего кабеля схеме; распиновка отдельного зелёного порта Control Box остаётся неизвестной.	Only for the shown HMI/BIKE PCB ↔ BIKE PCB/CU pair: GN (green) — CAN-H; WT (white) — CAN-L; BK (black) — GND. BN — 36 V; OG — On/off. Do not connect BN or OG to the reader. Verify your cable against the diagram first; the separate green Control Box port pinout is still unknown.	Kun for vist HMI/BIKE PCB ↔ BIKE PCB/CU: GN (grønn) — CAN-H; WT (hvit) — CAN-L; BK (svart) — GND. BN — 36 V; OG — On/off. Ikke koble BN eller OG til leseren. Kontroller kabelen mot diagrammet først; pinneoppsettet til den separate grønne Control Box-porten er fortsatt ukjent.
Настройки относятся к ридеру ESP32. Параметры контроллера Bafang здесь не изменяются.	These settings apply to the ESP32 reader. Bafang controller parameters are unchanged.	Innstillingene gjelder ESP32-leseren. Bafang-kontrollerens parametere endres ikke her.
Сигнал CAN	CAN signal	CAN-signal
Проверить сигнал	Check signal	Kontroller signal
Порт	Port	Port
Длительность	Duration	Varighet
Трансивер	Transceiver	Transceiver
Точка подключения	Connection point	Tilkoblingspunkt
Скорость шины	Bus rate	Busshastighet
Декодер	Decoder	Dekoder
Расшифровка SYM проверяется	SYM decoding is being verified	SYM-dekoding kontrolleres
Сырые данные	Raw data	Rådata
Исходные кадры сохраняются независимо от расшифровки. Счётчики доставки не доказывают полноту физического захвата.	Raw frames are saved independently of decoding. Delivery counters do not prove physical capture completeness.	Rårammer lagres uavhengig av dekoding. Leveringstellere beviser ikke at det fysiske opptaket er fullstendig.
Точка подключения и скорость ещё не определены. Сначала подтвердите CAN-H, CAN-L и сигнальную землю. Отсутствие HMI-кадров может быть нормальным: стандартного дисплея нет. Выбор профиля не запускает CAN.	Connection point and rate are not yet verified. Confirm CAN-H, CAN-L and signal ground first. Missing HMI frames may be normal: no standard display is fitted. Selecting a profile does not start CAN.	Tilkoblingspunkt og hastighet er ikke bekreftet ennå. Bekreft først CAN-H, CAN-L og signaljord. Manglende HMI-rammer kan være normalt: standarddisplay mangler. Valg av profil starter ikke CAN.
Обновить ESP32 через Chrome	Update ESP32 using Chrome	Oppdater ESP32 med Chrome
Открыть папку логов	Open logs folder	Åpne loggmappe
Закрытие последней вкладки завершает программу после остановки CAN и сохранения логов. Обновление страницы поддерживается; прошивка ESP32 сначала завершается.	Closing the last tab exits the application after stopping CAN and saving logs. Page refresh is supported; ESP32 flashing finishes first.	Når siste fane lukkes, avsluttes programmet etter at CAN er stoppet og logger er lagret. Siden kan oppdateres; ESP32-programmering fullføres først.
ESP-время кадра — программное время чтения очереди, в микросекундах с загрузки. Сохранность всех кадров на нагруженной шине ещё требует стендовой проверки.	ESP frame time is the software queue-read time in microseconds since boot. Capturing every frame on a busy bus still requires bench verification.	ESP-rammetid er tidspunktet for programvarens kølesing, i mikrosekunder siden oppstart. Fullstendig opptak på en belastet buss krever fortsatt benktesting.
Ответ батареи ещё не получен.	No battery response received yet.	Batterisvar er ikke mottatt ennå.
Показаны последние принятые значения. Серые поля не обновляются. Расшифровка по SYM / Bafang V2.5 ещё проверяется на этом велосипеде. Ячейки и серийные номера не подставляются из штатного адаптера.	Latest received values. Gray fields are not updating. SYM / Bafang V2.5 decoding is still being verified on this bicycle. Cells and serial numbers are not copied from the stock adapter.	Siste mottatte verdier. Grå felt oppdateres ikke. SYM / Bafang V2.5-dekoding kontrolleres fortsatt på denne sykkelen. Celler og serienumre kopieres ikke fra originaladapteren.
Запускайте перед обновлением в Spard. Кнопка только записывает CAN; завершить можно раньше.	Start before updating in Spard. This button only records CAN; you can finish early.	Start før oppdatering i Spard. Knappen tar kun opp CAN; du kan avslutte tidligere.
RAW CAN / БЕЗ ФИЛЬТРА ПРИЁМА	RAW CAN / NO RECEIVE FILTER	RÅ CAN / UTEN MOTTAKSFILTER
Classic · 11 / 29 бит · RTR	Classic · 11 / 29 bit · RTR	Classic · 11 / 29 bit · RTR
Ожидание данных	Waiting for data	Venter på data
Ожидание записи	Waiting for recording	Venter på opptak
Авто	Auto	Auto
Формат	Format	Format
Время ESP, с	ESP time, s	ESP-tid, s
Сохранение страницы для автономного запуска…	Saving page for offline use…	Lagrer siden for frakoblet bruk…
↓ Снимок просмотра	↓ Download preview	↓ Last ned forhåndsvisning
· Сайт	· Website	· Nettsted
· сборка	· build	· versjon
занято из	used of	brukt av
браузера	browser storage	nettleserlagring
ESP — · CAN — · получено	ESP — · CAN — · received	ESP — · CAN — · mottatt
ошибки	 errors	feil
потери монитора	monitor drops	tap i overvåking
Удалённый доступ: введите ключ	Remote access: enter key	Fjerntilgang: skriv inn nøkkel
Подготовка опроса	Preparing query	Klargjør forespørsel
Проверка линии · TRIPLE / 250 кбит/с	Bus check · TRIPLE / 250 kbit/s	Busskontroll · TRIPLE / 250 kbit/s
Опрос завершён	Query completed	Forespørsel fullført
Опрос не завершён	Query failed	Forespørsel mislyktes
Опрос остановлен	Query stopped	Forespørsel stoppet
Готов к чтению батареи	Ready to read battery	Klar til å lese batteri
Для самостоятельного опроса нужна прошивка ESP 0.5.2–0.5.7. Ответы из CAN отображаются и с 0.4.9.	Independent queries require ESP firmware 0.5.2–0.5.7. CAN responses can also be displayed with 0.4.9.	Selvstendige forespørsler krever ESP-fastvare 0.5.2–0.5.7. CAN-svar kan også vises med 0.4.9.
Проверка 30 с · до 1 события ошибки на 100 кадров, максимум 10	30 s check · up to 1 error event per 100 frames, maximum 10	30 s kontroll · opptil 1 feilhendelse per 100 rammer, maksimalt 10
Последний ответ	Last response	Siste svar
Ответ на запрос ESP	Response to ESP query	Svar på ESP-forespørsel
Ответ из CAN	Response from CAN	Svar fra CAN
Запрос отправил ESP ·	Query sent by ESP ·	Forespørsel sendt av ESP ·
Принято через ESP ·	Received through ESP ·	Mottatt via ESP ·
Прошивка батареи	Battery firmware	Batterifastvare
Разброс ячеек	Cell voltage spread	Spredning i cellespenning
Температуры	Temperatures	Temperaturer
Не удалось подтвердить действие на USB-ПК	Action on the USB computer was not confirmed	Handlingen på USB-PC-en ble ikke bekreftet
Скопировать пароль	Copy password	Kopier passord
Выделите и скопируйте пароль вручную.	Select and copy the password manually.	Marker og kopier passordet manuelt.
Показания и проверки на этом компьютере работают напрямую, без PIN и связи с сервером.	Readings and tests on this computer work directly, without a PIN or server connection.	Verdier og tester på denne PC-en fungerer direkte, uten PIN eller serverforbindelse.
Сменить ключ	Change key	Bytt nøkkel
Удалённый доступ	Remote access	Fjerntilgang
Нет текущего задания	No active job	Ingen aktiv oppgave
Состояние неизвестно	Unknown status	Ukjent status
Приём идёт	Receiving	Mottar
Остановлен	Stopped	Stoppet
Последние полученные данные	Last received data	Siste mottatte data
Штатный адаптер Spard · USB	Stock Spard adapter · USB	Original Spard-adapter · USB
Доступны чтение Spard и наблюдение линии. Этот USB-лог не является записью всех CAN-кадров.	Spard reading and bus monitoring are available. This USB log is not a capture of all CAN frames.	Spard-lesing og bussovervåking er tilgjengelig. Denne USB-loggen er ikke et opptak av alle CAN-rammer.
Число ошибок не равно числу потерянных кадров. Завершение задания ещё не подтверждает загрузку архива.	Error count is not lost-frame count. A completed job does not yet confirm archive upload.	Antall feil er ikke antall tapte rammer. En fullført oppgave bekrefter ikke at arkivet er lastet opp.
На мосте нужно разрешить удалённые задания и отключить ручной режим.	Allow remote jobs and disable manual mode on the USB computer.	Tillat fjernoppgaver og deaktiver manuell modus på USB-PC-en.
Последнее чтение батареи ·	Last battery reading ·	Siste batterilesing ·
время неизвестно	unknown time	ukjent tidspunkt
мост не в сети	USB bridge offline	USB-bro frakoblet
Прошивка BMS	BMS firmware	BMS-fastvare
Ключ или ссылка владельца	Owner key or link	Eierens nøkkel eller lenke
Ключ удалённого доступа	Remote access key	Nøkkel for fjerntilgang
Прочитать Spard · 30 с	Read Spard · 30 s	Les Spard · 30 s
СТОП	STOP	STOPP
Выполнение удалённой проверки	Remote test progress	Fremdrift for fjerntest
Повторить подтверждение	Retry confirmation	Prøv bekreftelse på nytt
CAN-кадры	CAN frames	CAN-rammer
Ошибки приёма CAN	CAN receive errors	CAN-mottaksfeil
Сведения и доступ	Information and access	Informasjon og tilgang
загрузка	boot	oppstart
Проверить приём CAN	Check CAN reception	Kontroller CAN-mottak
Наблюдение линии	Bus monitoring	Bussovervåking
Идёт чтение	Reading	Leser
Сохранённое чтение	Saved reading	Lagret lesing
Подготовка / сохранение	Preparing / saving	Klargjør / lagrer
не определена	unknown	ukjent
Прочитано:	Read:	Lest:
Сохранено:	Saved:	Lagret:
Номинальная ёмкость	Design capacity	Nominell kapasitet
SOH из пакета	SOH from packet	SOH fra pakken
Второе измерение напряжения	Secondary voltage reading	Sekundær spenningsmåling
Балансировка, маска	Balancing mask	Balanseringsmaske
Статус, код	Status code	Statuskode
SOH, расчёт Spard	SOH calculated by Spard	SOH beregnet av Spard
Проверка файла:	Checking file:	Kontrollerer fil:
Проверка получения:	Verifying upload:	Kontrollerer opplasting:
Отправка:	Uploading:	Laster opp:
Файл «	File “	Filen «
» получен. Напишите в чате «готово» для начала разбора.	” received. Write “ready” in the chat to begin analysis.	» er mottatt. Skriv «klar» i chatten for å starte analysen.
Загрузка отменена или истекло время ожидания. Можно выбрать файл повторно.	Upload cancelled or timed out. You can select the file again.	Opplasting avbrutt eller tidsavbrudd. Du kan velge filen på nytt.
Живой просмотр CAN	Live CAN view	CAN-visning i sanntid
В очереди	Queued	I kø
Принято мостом	Accepted by USB bridge	Godtatt av USB-bro
Выполняется	Running	Pågår
Задание завершено	Job completed	Oppgave fullført
Не выполнено	Failed	Mislyktes
Остановлено	Stopped	Stoppet
Срок запуска истёк	Start window expired	Startfristen er utløpt
Прервано	Interrupted	Avbrutt
Проверка Spard	Spard test	Spard-test
Проверка приёма	Reception test	Mottakstest
Остановка	Stopping	Stopper
Задание	Job	Oppgave
Загружаю справку…	Loading reference…	Henter referanse…
Не удалось загрузить справку. Закройте и откройте этот раздел для повтора.	Could not load the reference. Close and reopen this section to retry.	Kunne ikke hente referansen. Lukk og åpne denne delen for å prøve igjen.
Ключ не принят. Введите другой.	Key not accepted. Enter another key.	Nøkkelen ble ikke godtatt. Skriv inn en annen.
Наблюдение линии через Spard	Bus monitoring through Spard	Bussovervåking via Spard
Нет связи с сервером. Команды недоступны.	No server connection. Commands are unavailable.	Ingen serverforbindelse. Kommandoer er utilgjengelige.
Отправка задания…	Sending job…	Sender oppgave…
Обновление страницы: дождитесь завершения.	Page update in progress. Please wait.	Siden oppdateres. Vent til den er ferdig.
Мост не в сети.	USB bridge offline.	USB-bro frakoblet.
Подключено несколько мостов.	Multiple USB bridges connected.	Flere USB-broer tilkoblet.
Ридер занят.	Reader busy.	Leseren er opptatt.
Удалённые задания не разрешены на мосте.	Remote jobs are disabled on the USB computer.	Fjernoppgaver er deaktivert på USB-PC-en.
Мост ещё не готов к удалённым заданиям.	The USB computer is not ready for remote jobs yet.	USB-PC-en er ikke klar for fjernoppgaver ennå.
Эта сборка моста не поддерживает выбранную проверку.	This USB bridge version does not support the selected test.	Denne versjonen av USB-broen støtter ikke valgt test.
Обновите страницу на компьютере, подключённом к ридеру.	Update the page on the computer connected to the reader.	Oppdater siden på PC-en som er koblet til leseren.
Другое задание уже ожидает выполнения.	Another job is already queued.	En annen oppgave står allerede i kø.
Не удалось подтвердить это задание.	Could not confirm this job.	Kunne ikke bekrefte denne oppgaven.
Сервер отклонил задание.	Server rejected the job.	Serveren avviste oppgaven.
Задание принято сервером. Ожидаем подтверждение моста.	Server accepted the job. Waiting for the USB bridge.	Serveren godtok oppgaven. Venter på USB-broen.
Подтверждение не получено. Проверяем состояние; повтор использует тот же номер задания.	Confirmation not received. Checking status; retries use the same job ID.	Bekreftelse ikke mottatt. Kontrollerer status; nye forsøk bruker samme oppgave-ID.
Время последнего сообщения неизвестно	Last message time unknown	Tidspunkt for siste melding er ukjent
Последнее сообщение	Last message	Siste melding
время приблизительное	approximate time	omtrentlig tid
отключён · ожидаем подключения	disconnected · waiting for connection	frakoblet · venter på tilkobling
подключён	connected	tilkoblet
назад	ago	siden
PIN нужен только для доступа с другого компьютера.	A PIN is only needed for access from another computer.	PIN kreves kun for tilgang fra en annen PC.
Удалённый доступ включён.	Remote access enabled.	Fjerntilgang aktivert.
Удалённый сервер недоступен. Локальная диагностика работает напрямую.	Remote server unavailable. Local diagnostics still work directly.	Fjernserveren er utilgjengelig. Lokal diagnostikk fungerer fortsatt direkte.
Получение состояния…	Getting status…	Henter status…
Несколько мостов	Multiple USB bridges	Flere USB-broer
Штатный адаптер Spard в сети	Stock Spard adapter online	Original Spard-adapter tilkoblet
Мост ESP32 в сети	ESP32 USB bridge online	ESP32 USB-bro tilkoblet
Мост не в сети	USB bridge offline	USB-bro frakoblet
Введите ключ или ссылку с #operator=…	Enter a key or a link with #operator=…	Skriv inn en nøkkel eller en lenke med #operator=…
плата разрешена	board supported	kortet støttes
плата не подходит для этого образа	board not supported by this image	kortet støttes ikke av dette bildet
включена защита, запись недоступна	security enabled, flashing unavailable	beskyttelse aktivert, programmering utilgjengelig
Журнал:	Log:	Logg:
Идёт работа с ESP32	ESP32 operation in progress	ESP32-operasjon pågår
Нужен ESP32 USB Serial/JTAG	ESP32 USB Serial/JTAG required	ESP32 USB Serial/JTAG kreves
Читаю модель и MAC платы. Прошивка не записывается.	Reading board model and MAC. No firmware is being written.	Leser kortmodell og MAC. Ingen fastvare skrives.
ПЛАТА:	BOARD:	KORT:
прошивка не записывалась	firmware was not written	fastvare ble ikke skrevet
Плата определена. Нажмите «Прошить ESP32».	Board identified. Press Flash ESP32.	Kortet er identifisert. Trykk Programmer ESP32.
Плата определена, но не подходит для этого образа ESP32-C3.	Board identified but incompatible with this ESP32-C3 image.	Kortet er identifisert, men er ikke kompatibelt med dette ESP32-C3-bildet.
Плата не выбрана:	No board selected:	Ingen kort valgt:
Выбор устройства отменён. Можно выбрать ESP32 снова.	Device selection cancelled. You can select ESP32 again.	Enhetsvalg avbrutt. Du kan velge ESP32 på nytt.
Запись прошивки. USB не отключать.	Writing firmware. Keep USB connected.	Skriver fastvare. La USB være tilkoblet.
записана и проверена. Вернитесь к диагностике и подключите ESP32. Если USB не появился — нажмите RESET.	written and verified. Return to diagnostics and connect ESP32. Press RESET if USB does not reappear.	skrevet og kontrollert. Gå tilbake til diagnostikk og koble til ESP32. Trykk RESET hvis USB ikke vises igjen.
Обновление не завершено:	Update incomplete:	Oppdatering ikke fullført:
Новый ридер привязан. Можно нажать «Прошить ESP32».	New reader selected. You can press Flash ESP32.	Ny leser er valgt. Du kan trykke Programmer ESP32.
Проверка привязки:	Checking reader selection:	Kontrollerer leservalg:
Нужен Chrome/Edge на ПК с разрешённым Web Serial и HTTPS	Chrome/Edge on a computer with Web Serial and HTTPS is required	Chrome/Edge på en PC med Web Serial og HTTPS kreves
Политика браузера запрещает доступ к USB Serial	Browser policy blocks USB Serial access	Nettleserens policy blokkerer USB Serial-tilgang
Файлы прошивки проверены. Подтвердите отсоединение CAN и нажмите «Выбрать ESP32 / COM».	Firmware files verified. Confirm CAN is disconnected and press Select ESP32 / COM.	Fastvarefiler kontrollert. Bekreft at CAN er frakoblet og trykk Velg ESP32 / COM.
Обновляется интерфейс прошивки. Страница перезагрузится автоматически, когда остальные вкладки освободят ридер.	The flash interface is updating. The page will reload automatically when other tabs release the reader.	Programmeringsgrensesnittet oppdateres. Siden lastes automatisk på nytt når andre faner frigir leseren.
Сервер не принял файл:	Server did not accept the file:	Serveren godtok ikke filen:
Сайт обновляется; дождитесь подключения	Site is updating; wait for connection	Nettstedet oppdateres; vent på tilkobling
Дождитесь завершения текущей загрузки	Wait for the current upload to finish	Vent til gjeldende opplasting er ferdig
Выберите непустой файл до 128 МиБ	Select a nonempty file up to 128 MiB	Velg en fil som ikke er tom, opptil 128 MiB
Недопустимое имя файла	Invalid filename	Ugyldig filnavn
Неверный ответ о частях файла	Invalid file-part response	Ugyldig svar om fildeler
Подтверждение сервера не соответствует файлу	Server receipt does not match the file	Serverkvitteringen samsvarer ikke med filen
Файл ещё отправляется	File upload is still running	Filopplasting pågår fortsatt
Если COM4 занят, закройте его в Spard.	If COM4 is busy, close it in Spard.	Hvis COM4 er opptatt, lukk den i Spard.
другое устройство	different device	annen enhet
кандидат	candidate	kandidat
отправлено:	uploaded:	lastet opp:
штатный адаптер Spard	stock Spard adapter	original Spard-adapter
Выбор профиля не запускает CAN.	Selecting a profile does not start CAN.	Valg av profil starter ikke CAN.
целых пакетов	complete packets	fullstendige pakker
Только listen-only.	Listen-only mode.	Kun lyttemodus.
Запись отменена	Write cancelled	Skriving avbrutt
COM-порт	COM port	COM-port
Chrome и USB — всё для записи теста.	Chrome and USB are all you need to record a test.	Chrome og USB er alt du trenger for å ta opp en test.
ESP32 USB не найдена	ESP32 USB not found	ESP32 USB ikke funnet
HIGH — горит при высоком уровне	HIGH — lit at high level	HIGH — lyser ved høyt nivå
LOW — горит при низком уровне	LOW — lit at low level	LOW — lyser ved lavt nivå
SYM не подтверждён	SYM unverified	SYM ubekreftet
TRIPLE будет установлен перед чтением	TRIPLE will be set before reading	TRIPLE settes før lesing
TRIPLE не подтверждён; приём не запущен	TRIPLE unconfirmed; reading not started	TRIPLE er ubekreftet; lesing ikke startet
USB · браузер	USB · browser	USB · nettleser
USB → браузер	USB → browser	USB → nettleser
USB → диск ПК	USB → computer disk	USB → PC-disk
USB закрыт	USB closed	USB lukket
USB отключён или ридер перезапущен	USB disconnected or reader restarted	USB frakoblet eller leser startet på nytt
USB отключён; остановка CAN не подтверждена:	USB disconnected; CAN stop unconfirmed:	USB frakoblet; CAN-stopp ubekreftet:
Wi-Fi · подключено	Wi-Fi · connected	Wi-Fi · tilkoblet
Wi-Fi ридер отключён	Wi-Fi reader disconnected	Wi-Fi-leser frakoblet
Wi-Fi сохранён. Новая сеть появится после перезапуска питания.	Wi-Fi saved. The new network appears after a power restart.	Wi-Fi lagret. Det nye nettverket vises etter omstart.
Автоподбор CAN	CAN profile comparison	Sammenligning av CAN-profiler
TRIPLE · 75% · тройная	TRIPLE · 75% · triple sampling	TRIPLE · 75 % · trippel sampling
Тройная выборка	Triple sampling	Trippel sampling
одиночная	single sampling	enkel sampling
тройная	triple sampling	trippel sampling
Например: подключаю зарядку	Example: connecting charger	Eksempel: kobler til lader
Действие во время теста	Action during test	Handling under test
Поиск ID или DATA — только на экране	Search ID or DATA — display only	Søk etter ID eller DATA — kun visning
Фильтр кадров	Frame filter	Rammefilter
Ридер подключён. Выберите тест на 30 или 60 секунд.	Reader connected. Choose a 30 or 60 second test.	Leseren er tilkoblet. Velg en test på 30 eller 60 sekunder.
Живые данные CAN. Полная запись не ведётся.	Live CAN data. Full recording is off.	CAN-data i sanntid. Fullstendig opptak er av.
Все принятые кадры сохраняются. Выполняйте действие и отмечайте его начало и конец.	All received frames are saved. Perform your action and mark its start and end.	Alle mottatte rammer lagres. Utfør handlingen og merk start og slutt.
Локальная панель ESP32. Запись начинается по вашему действию.	ESP32 local panel. Recording starts when you choose.	Lokalt ESP32-panel. Opptak starter når du velger det.
Живой просмотр	Live view	Sanntidsvisning
Запись в хранилище браузера	Recording to browser storage	Tar opp til nettleserlagring
Ридер подключён по USB	Reader connected over USB	Leser tilkoblet via USB
Отправка архива на сервер…	Uploading archive…	Laster opp arkiv…
Нужна прошивка ESP32 0.4.2.	ESP32 firmware 0.4.2 required.	ESP32-fastvare 0.4.2 kreves.
Проверка… до 10 секунд	Checking… up to 10 seconds	Kontrollerer… opptil 10 sekunder
Проверка остановлена.	Test stopped.	Testen er stoppet.
На CRX есть активность.	Activity detected on CRX.	Aktivitet registrert på CRX.
Импульсов на CRX нет.	No pulses on CRX.	Ingen pulser på CRX.
Проверка не запускалась.	Test not started.	Testen er ikke startet.
Не менее	At least	Minst
STATUS обновляется; отладочных сообщений пока нет.	STATUS is updating; no debug messages yet.	STATUS oppdateres; ingen feilsøkingsmeldinger ennå.
Хранилище браузера активно	Browser storage active	Nettleserlagring aktiv
Все файлы страницы находятся на ESP32	All page files are stored on ESP32	Alle sidefiler er lagret på ESP32
Страница сохранена для работы без интернета	Page saved for offline use	Siden er lagret for frakoblet bruk
Для выгрузки файлов используйте JSONL/CSV у завершённого сеанса.	Use the JSONL/CSV buttons on a completed session to download files.	Bruk JSONL/CSV-knappene ved en ferdig økt for å laste ned filer.
Папка для новых записей выбрана	Folder selected for new recordings	Mappe valgt for nye opptak
Автообновление недоступно:	Automatic updates unavailable:	Automatiske oppdateringer utilgjengelige:
Откройте интернет-панель на ПК с USB	Open the online panel on the USB computer	Åpne nettpanelet på USB-PC-en
Сначала остановите CAN и завершите запись	Stop CAN and finish recording first	Stopp CAN og avslutt opptaket først
Операция не выполнена	Operation failed	Operasjonen mislyktes
Все прочитанные USB-байты записываются на диск. Просмотр не влияет на состав лога.	Every received USB byte is saved to disk. Viewing does not change the log.	Alle mottatte USB-byte lagres på disk. Visning endrer ikke loggen.
Веб-просмотр · RAM	Web preview · RAM	Nettvisning · RAM
Программа записывает каждый прочитанный USB-байт в wire.bin, события в capture.jsonl и все кадры в frames.csv. Фильтр таблицы меняет только экран.	The application saves each received USB byte to wire.bin, events to capture.jsonl and all frames to frames.csv. The table filter only changes the display.	Programmet lagrer hver mottatte USB-byte i wire.bin, hendelser i capture.jsonl og alle rammer i frames.csv. Tabellfilteret endrer kun visningen.
Подключите устройство для начала записи	Connect a device to start recording	Koble til en enhet for å starte opptak
Запись на диск активна	Disk recording active	Diskopptak aktivt
Запись начнётся при подключении	Recording starts on connection	Opptak starter ved tilkobling
Доступна версия	Version available	Tilgjengelig versjon
Установлена актуальная версия	Latest version installed	Nyeste versjon installert
Проверка ещё не выполнена	Not checked yet	Ikke kontrollert ennå
Подключите ридер по USB	Connect reader over USB	Koble til leseren via USB
Доступна прошивка	Firmware available	Tilgjengelig fastvare
Нажмите «Проверить версии»	Press Check versions	Trykk Kontroller versjoner
Проверить версии	Check versions	Kontroller versjoner
Скачивание через HTTPS, проверка SHA-256. CAN останавливается перед прошивкой ESP32.	Download over HTTPS with SHA-256 verification. CAN stops before flashing ESP32.	Nedlasting via HTTPS med SHA-256-kontroll. CAN stoppes før ESP32 programmeres.
Источник:	Source:	Kilde:
Полярность LED сохранена	LED polarity saved	LED-polaritet lagret
SSID: 1–32 символа, латиница, цифры, пробел, - или _	SSID: 1–32 characters, Latin letters, digits, spaces, - or _	SSID: 1–32 tegn, latinske bokstaver, tall, mellomrom, - eller _
Опишите действие, например «включаю свет»	Describe the action, for example “turning lights on”	Beskriv handlingen, for eksempel «slår på lys»
Отметка добавлена	Marker added	Markør lagt til
Продолжить экран	Resume display	Fortsett visning
Несколько ESP32 — выберите ридер	Multiple ESP32 boards — select reader	Flere ESP32-kort — velg leser
Выберите ридер	Select reader	Velg leser
Выберите COM-порт	Select COM port	Velg COM-port
Проверка версий запущена	Version check started	Versjonskontroll startet
Скачать проверенное обновление программы? Приём CAN будет остановлен, текущие логи закрыты.	Download the verified application update? CAN reading will stop and current logs will close.	Last ned den kontrollerte programoppdateringen? CAN-lesing stoppes og gjeldende logger lukkes.
Подготовка обновления программы…	Preparing application update…	Klargjør programoppdatering…
Обновить прошивку ESP32-C3 по USB? Сначала отсоедините CANH/CANL от велосипеда. CAN будет остановлен. Не отключайте USB во время записи.	Update ESP32-C3 firmware over USB? Disconnect CANH/CANL from the bicycle first. CAN will stop. Keep USB connected while writing.	Oppdater ESP32-C3-fastvare via USB? Koble CANH/CANL fra sykkelen først. CAN stoppes. La USB være tilkoblet under skriving.
Обновление ESP32 запущено	ESP32 update started	ESP32-oppdatering startet
Интернет-панель открывается…	Opening online panel…	Åpner nettpanelet…
Остановить CAN, закрыть логи и завершить программу?	Stop CAN, close logs and quit the application?	Stopp CAN, lukk logger og avslutt programmet?
Программа завершена. Эту вкладку можно закрыть.	Application closed. You can close this tab.	Programmet er avsluttet. Du kan lukke denne fanen.
Профили недоступны; используйте ручной выбор скорости	Profiles unavailable; select the rate manually	Profiler er utilgjengelige; velg hastigheten manuelt
Декодер недоступен. Сырые кадры доступны для просмотра и записи.	Decoder unavailable. Raw frames can still be viewed and recorded.	Dekoder utilgjengelig. Rårammer kan fortsatt vises og tas opp.
Осталось до завершения	Time remaining	Tid igjen
подготовка	preparing	klargjør
Остановить автоподбор	Stop comparison	Stopp sammenligning
Остановить приём	Stop receiving	Stopp mottak
Идёт запись	Recording	Opptak pågår
Поиск скорости…	Finding bus rate…	Søker etter busshastighet…
Тест записывается. Выполняйте действие и добавляйте отметки.	Test recording. Perform your action and add markers.	Testopptak pågår. Utfør handlingen og legg til markører.
Подключите ридер и выберите длительность теста.	Connect the reader and choose test duration.	Koble til leseren og velg testvarighet.
Сейчас запись не идёт	No recording in progress	Ingen opptak pågår
Отмечайте начало и конец действия. Новая отметка не продлевает тест.	Mark the start and end of your action. New markers do not extend the test.	Merk starten og slutten av handlingen. Nye markører forlenger ikke testen.
Каждая запись сохраняет все прочитанные USB-байты в wire.bin, события и отметки в capture.jsonl, все кадры в frames.csv. Фильтры экрана не изменяют лог. При включённой галочке завершённые записи автоматически отправляются; локальные файлы остаются.	Each recording saves all received USB bytes to wire.bin, events and markers to capture.jsonl, and all frames to frames.csv. Display filters do not change the log. If enabled, completed recordings upload automatically; local files remain.	Hvert opptak lagrer alle mottatte USB-byte i wire.bin, hendelser og markører i capture.jsonl og alle rammer i frames.csv. Visningsfiltre endrer ikke loggen. Når aktivert, lastes ferdige opptak opp automatisk; lokale filer beholdes.
Отправка выключена. Настройка запоминается на этом ПК.	Uploads are off. The setting is saved on this computer.	Opplasting er av. Innstillingen lagres på denne PC-en.
Отправка включена, но сервер для этого ПК ещё не настроен. Записи остаются в очереди.	Uploads enabled, but the server is not configured on this computer yet. Recordings remain queued.	Opplasting er aktivert, men serveren er ikke satt opp på denne PC-en ennå. Opptak beholdes i køen.
Отправка записи на сервер…	Uploading recording…	Laster opp opptak…
Отправка включена. В очереди:	Uploads enabled. Queued:	Opplasting aktivert. I kø:
Проверяется	Checking	Kontrollerer
Профиль недоступен; скорость выбирается вручную.	Profile unavailable; select rate manually.	Profilen er utilgjengelig; velg hastighet manuelt.
Применение профиля…	Applying profile…	Bruker profil…
Прошивка не сообщает профиль выборки. Обновите ESP32 через Chrome.	Firmware does not report the sampling profile. Update ESP32 using Chrome.	Fastvaren oppgir ikke samplingprofil. Oppdater ESP32 med Chrome.
Завершите запись и остановите CAN перед сменой профиля.	Finish recording and stop CAN before changing the profile.	Avslutt opptaket og stopp CAN før du endrer profil.
После применения выполните тест 30 с при неизменном состоянии велосипеда.	After applying, run a 30 s test without changing bicycle state.	Kjør en 30 s test etterpå uten å endre sykkelens tilstand.
Кандидат:	Candidate:	Kandidat:
Исходный профиль восстановлен.	Original profile restored.	Opprinnelig profil gjenopprettet.
Исходный профиль не восстановлен.	Original profile not restored.	Opprinnelig profil ikke gjenopprettet.
Для автоподбора нужна прошивка ESP32 0.4.8.	Profile comparison requires ESP32 firmware 0.4.8.	Profilsammenligning krever ESP32-fastvare 0.4.8.
9 этапов, отдельный архив каждого теста. Не меняйте состояние велосипеда; после серии исходный профиль восстановится.	9 stages, with a separate archive per test. Keep bicycle state unchanged; the original profile is restored afterwards.	9 trinn, med eget arkiv per test. Ikke endre sykkelens tilstand; opprinnelig profil gjenopprettes etterpå.
Профиль приёма применён	Receive profile applied	Mottaksprofil aktivert
профиль	profile	profil
Нет CAN-кадров	No CAN frames	Ingen CAN-rammer
Wi-Fi → браузер	Wi-Fi → browser	Wi-Fi → nettleser
Ограниченный просмотр. Для записи всего принятого USB-потока используйте программу на ПК.	Limited preview. Use the desktop application to record the full received USB stream.	Begrenset visning. Bruk PC-programmet for å ta opp hele mottatte USB-strømmen.
Сведения отправлены:	Details uploaded:	Opplysninger lastet opp:
Последняя отправка:	Last upload:	Siste opplasting:
Определён VID	Identified VID	Identifisert VID
Отправляю сведения…	Uploading details…	Laster opp opplysninger…
Выберите штатный адаптер Spard в окне браузера…	Select the stock Spard adapter in the browser…	Velg original Spard-adapter i nettleseren…
Напишите в чате «адаптер отправлен».	Write “adapter uploaded” in the chat.	Skriv «adapter lastet opp» i chatten.
Выбор отменён. Можно выбрать адаптер позже.	Selection cancelled. You can select the adapter later.	Valg avbrutt. Du kan velge adapteren senere.
Батарея · паспортные данные	Battery · design data	Batteri · grunndata
Последовательных ячеек	Cells in series	Celler i serie
Параллельных ячеек	Cells in parallel	Celler i parallell
Сумма ячеек · расчёт	Cell voltage sum · calculated	Sum av cellespenninger · beregnet
Разброс ячеек · расчёт	Cell voltage spread · calculated	Spredning i cellespenning · beregnet
Батарея · циклы и хранение	Battery · cycles and storage	Batteri · sykluser og lagring
Самый долгий перерыв зарядки	Longest time without charge	Lengste tid uten lading
Последний перерыв зарядки	Recent time without charge	Siste tid uten lading
Батарея · напряжения ячеек	Battery · cell voltages	Batteri · cellespenninger
Проверка передатчика ESP	ESP transmitter test	Test av ESP-sender
Три ступени: CAN-периферия ESP, выход GPIO4, передача через трансивер. Велосипед должен быть отсоединён.	Three stages: ESP CAN peripheral, GPIO4 output, transceiver path. The bicycle must be disconnected.	Tre trinn: ESP CAN-periferi, GPIO4-utgang og transceiver. Sykkelen må være frakoblet.
CAN-H/CAN-L физически отсоединены от велосипеда. Подключён только USB.	CAN-H/CAN-L are physically disconnected from the bicycle. Only USB is connected.	CAN-H/CAN-L er fysisk koblet fra sykkelen. Kun USB er tilkoblet.
Проверить передатчик	Test transmitter	Test sender
Технический результат	Technical result	Teknisk resultat
Для самотеста нужна прошивка ESP 0.5.5–0.5.7.	The selftest requires ESP firmware 0.5.5–0.5.7.	Selvtesten krever ESP-fastvare 0.5.5–0.5.7.
Все три ступени пройдены	All three stages passed	Alle tre trinn bestått
Проверка передатчика…	Testing transmitter…	Tester sender…
Готов к проверке при отсоединённой CAN	Ready to test with CAN disconnected	Klar til test med CAN frakoblet
CAN-периферия ESP	ESP CAN peripheral	ESP CAN-periferi
Выход GPIO4	GPIO4 output	GPIO4-utgang
Передача через трансивер	Transceiver path	Overføring via transceiver
Не запускалась	Not run	Ikke kjørt
Не пройдено	Failed	Ikke bestått
Пройдено	Passed	Bestått
Сначала отсоедините CAN-H/CAN-L от велосипеда и подтвердите это	Disconnect CAN-H/CAN-L from the bicycle and confirm this first	Koble CAN-H/CAN-L fra sykkelen og bekreft dette først
Самотест доступен только через подтверждённый USB ESP	The selftest requires a verified ESP USB connection	Selvtesten krever en bekreftet ESP USB-forbindelse
Ридер изменился или отключён; самотест отменён	Reader changed or disconnected; selftest cancelled	Leseren er endret eller frakoblet; selvtest avbrutt
Полный результат самотеста ESP не получен	Complete ESP selftest result was not received	Fullstendig resultat fra ESP-selvtesten er ikke mottatt
Безопасное завершение самотеста не подтверждено	Safe selftest completion was not confirmed	Sikker avslutning av selvtesten er ikke bekreftet
Самотест передатчика не пройден	Transmitter selftest failed	Selvtest av sender mislyktes
Самотест требует подтверждённый USB ESP 0.5.5	The selftest requires verified USB ESP firmware 0.5.5	Selvtesten krever bekreftet USB ESP-fastvare 0.5.5
Активная проверка доступна только по USB	Active testing is available over USB only	Aktiv testing er kun tilgjengelig via USB
Сессия завершена — опрос тихой линии	Session ended — quiet-bus query	Økten er avsluttet — lesing på stille CAN-buss
Для этого режима завершите сессию в штатной системе, сохранив питание батареи.	For this mode, end the session in the original system and keep the battery powered.	Avslutt økten i det originale systemet og behold strøm til batteriet for denne modusen.
Тихая линия · проверка 5 с · только без ошибок	Quiet bus · 5 s check · zero errors required	Stille buss · kontroll i 5 s · krever null feil
Тихий режим требует нулевых ошибок; запрос BMS не отправлен	Quiet mode requires zero errors; BMS query was not sent	Stille modus krever null feil; BMS-forespørselen ble ikke sendt
Подтвердите завершение сессии для выбранного ридера	Confirm that the session has ended for the selected reader	Bekreft at økten er avsluttet for den valgte leseren
Выбранный ридер изменился; опрос отменён	Selected reader changed; query cancelled	Valgt leser er endret; forespørsel avbrutt
Для опроса без сессии нужна прошивка ESP 0.5.7	Queries without a session require ESP firmware 0.5.7	Lesing uten økt krever ESP-fastvare 0.5.7
Опрос тихой линии требует подтверждённый USB ESP 0.5.7	Quiet-bus queries require verified USB ESP firmware 0.5.7	Lesing på stille buss krever bekreftet USB ESP-fastvare 0.5.7
Неизвестный режим опроса батареи	Unknown battery query mode	Ukjent modus for batterilesing
Читать Spard без сессии	Read Spard without a session	Les Spard uten økt
Bafang V2.5 · справочно	Bafang V2.5 · reference only	Bafang V2.5 · kun som referanse
Старый SYM · другая нумерация	Legacy SYM · different numbering	Eldre SYM · annen nummerering
Область показания	Reading scope	Omfang for avlesning
Текущее сообщение CAN; сохранённые ошибки PCB не прочитаны	Current CAN message; stored PCB faults not read	Aktuell CAN-melding; lagrede PCB-feil er ikke lest
Неизвестный код	Unknown code	Ukjent kode
Контроллер · идентификаторы	Controller · identification	Kontroller · identifikasjon
Аппаратная версия	Hardware version	Maskinvareversjon
Версия ПО	Software version	Programvareversjon
Модель контроллера	Controller model	Kontrollermodell
Серийный номер контроллера	Controller serial number	Kontrollerens serienummer
`.split('\n').filter(Boolean).map(line=>line.split('\t'));
  const catalog=new Map();for(const [ru,en,nb]of rows){if(en&&nb)catalog.set(ru,{en,nb});}
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns=[...catalog.keys()].sort((a,b)=>b.length-a.length).map(k=>['В','А','с','ч'].includes(k)?'(?<=\\d\\s)'+escape(k)+'(?![\\p{L}])':k.length<=3?'(?<![\\p{L}\\p{N}])'+escape(k)+'(?![\\p{L}\\p{N}])':escape(k));
  const pattern=new RegExp(patterns.join('|'),'gu'),cache=new Map();
  const language=()=>globalThis.ByPreferences?.snapshot().language||'en';
  const locale=()=>({en:'en-GB',ru:'ru-RU',nb:'nb-NO'}[language()]);
  function t(value){
    if(typeof value!=='string'||language()==='ru')return value;
    const key=language()+'\0'+value;if(cache.has(key))return cache.get(key);
    const exact=catalog.get(value.trim());if(exact)return value.replace(value.trim(),exact[language()]);
    const translated=value.replace(pattern,part=>catalog.get(part)?.[language()]||part);
    if(cache.size>=4096)cache.clear();cache.set(key,translated);return translated;
  }
  const original=new WeakMap(),attributes=new WeakMap(),SKIP='script,style,code,pre,textarea,[data-i18n-skip]';
  function textNode(node){
    if(!node.parentElement||node.parentElement.closest(SKIP))return;
    const current=node.nodeValue,old=original.get(node),source=old&&old.rendered===current?old.source:current,rendered=t(source);
    original.set(node,{source,rendered});if(current!==rendered)node.nodeValue=rendered;
  }
  function element(el){
    if(el.matches(SKIP)||el.closest(SKIP))return;
    let record=attributes.get(el);if(!record){record={};attributes.set(el,record);}
    for(const name of ['title','aria-label','placeholder']){
      if(!el.hasAttribute(name))continue;const current=el.getAttribute(name),old=record[name],source=old&&old.rendered===current?old.source:current,rendered=t(source);record[name]={source,rendered};if(current!==rendered)el.setAttribute(name,rendered);
    }
  }
  function translate(root){
    if(root.nodeType===3){textNode(root);return;}if(root.nodeType!==1&&root.nodeType!==9)return;
    if(root.nodeType===1)element(root);const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);while(walker.nextNode())textNode(walker.currentNode);root.querySelectorAll?.('[title],[aria-label],[placeholder]').forEach(element);
  }
  let mounted=false;
  function mount(){
    if(mounted)return;mounted=true;translate(document);
    const observer=new MutationObserver(changes=>{for(const m of changes){if(m.type==='characterData')textNode(m.target);else if(m.type==='attributes')element(m.target);else for(const node of m.addedNodes)translate(node);}});
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']});
    globalThis.addEventListener('citybike-preferences',()=>{cache.clear();translate(document);});
  }
  globalThis.ByI18n={t,locale,language,translate,catalog};
  if(globalThis.document){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();}
  if(typeof module!=='undefined')module.exports=globalThis.ByI18n;
})();
