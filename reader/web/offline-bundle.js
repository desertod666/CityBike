/* Generated local portal bundle. See scripts/sync_reader_web.py. */
/* UI text only. Protocol payloads, passwords and user-entered values are excluded. */
'use strict';
(() => {
  const rows=String.raw`Текущие данные батареи	Current battery data	Gjeldende batteridata
Флаги / DLC	Flags / DLC	Flagg / DLC
Длина DATA	DATA length	DATA-lengde
Объект колеса V2.5 требует 6 байт	The V2.5 wheel object requires 6 bytes	Hjulobjektet i V2.5 krever 6 byte
Длина / флаги SYM	SYM length / flags	SYM-lengde / flagg
Неподдерживаемое поле SYM; сырые данные сохранены	Unsupported SYM field; raw data retained	SYM-feltet støttes ikke; rådata er beholdt
Подтвердите выключение	Confirm shutdown	Bekreft avslåing
В текущем сообщении нет предупреждения	No current warning reported	Ingen aktuell advarsel rapportert
Тормоз уже нажат	Brake already applied	Bremsen er aktivert
Ошибка ручки газа	Throttle fault	Feil på gasshendel
Ручка газа не вернулась в ноль	Throttle not returned to zero	Gasshendelen er ikke tilbake i nullstilling
Пониженное напряжение	Undervoltage	Underspenning
Повышенное напряжение	Overvoltage	Overspenning
Ошибка сигнальных проводов датчиков Холла мотора	Motor Hall signal wiring fault	Feil på ledninger til motorens Hall-sensorer
Ошибка фазных проводов мотора	Motor phase wiring fault	Feil på motorens faseledninger
Защита от перегрева мотора	Motor overtemperature protection	Motorvern mot overtemperatur
Ошибка датчика температуры мотора	Motor temperature sensor fault	Feil på motorens temperatursensor
Ошибка датчика тока	Current sensor fault	Feil på strømsensor
Защита от перегрева контроллера	Controller overtemperature protection	Kontrollervern mot overtemperatur
Ошибка датчика температуры контроллера	Controller temperature sensor fault	Feil på kontrollerens temperatursensor
Ошибка датчика скорости	Speed sensor fault	Feil på hastighetssensor
Ошибка переднего света	Headlight fault	Feil på frontlys
Ошибка сигнала датчика момента	Torque sensor signal fault	Feil på signal fra momentsensor
Превышен ток	Overcurrent	Overstrøm
Ошибка связи HMI и контроллера	HMI/controller communication fault	Kommunikasjonsfeil mellom HMI og kontroller
Защита от низкого напряжения	Low voltage protection	Vern mot underspenning
Защита от повышенного напряжения	Overvoltage protection	Vern mot overspenning
Ошибка цепи определения тормоза	Brake detection circuit fault	Feil i krets for bremseregistrering
Ошибка контроля питания 15 В	15 V supply detection fault	Feil i overvåking av 15 V forsyning
Ошибка цепи определения кнопки	Key detection circuit fault	Feil i krets for knapperegistrering
Напряжение батареи слишком высокое	Battery total voltage too high	Batterispenningen er for høy
Напряжение батареи слишком низкое	Battery total voltage too low	Batterispenningen er for lav
Ток ячеек батареи слишком большой	Battery cell current too high	Battericellenes strøm er for høy
Температура батареи слишком высокая	Battery temperature too high	Batteritemperaturen er for høy
Температура батареи слишком низкая	Battery temperature too low	Batteritemperaturen er for lav
SOC батареи слишком высокий	Battery SOC too high	Batteriets SOC er for høy
SOC батареи слишком низкий	Battery SOC too low	Batteriets SOC er for lav
Трансмиссия заклинила	Transmission stuck	Giret sitter fast
Трансмиссия не сбрасывается	Transmission cannot reset	Giret kan ikke tilbakestilles
Электронный замок заклинил	Electronic lock stuck	Den elektroniske låsen sitter fast
Ошибка модуля Bluetooth	Bluetooth module fault	Feil på Bluetooth-modul
контроллер	controller	kontroller
датчик	sensor	sensor
Русский	Russian	Russisk
Включить пульт\tTurn remote on\tSlå på fjernkontroll
Выключить пульт\tTurn remote off\tSlå av fjernkontroll
CAN-запись:\tCAN recording:\tCAN-opptak:
записываю действие\trecording action\ttar opp handlingen
Пульт выключен\tRemote is off\tFjernkontroll er av
BLE подключён · кнопки готовы\tBLE connected · buttons ready\tBLE tilkoblet · knappene er klare
BLE подключён · ожидаю подписку\tBLE connected · waiting for subscription\tBLE tilkoblet · venter på abonnement
Пульт включён · ожидаю велосипед\tRemote is on · waiting for bike\tFjernkontroll er på · venter på sykkelen
Удержание прервано. Отпустите кнопку и нажмите снова.\tHold interrupted. Release the button and press again.\tHoldet ble avbrutt. Slipp knappen og trykk igjen.
Ожидание	Waiting	Venter
Нет показания	No reading	Ingen måleverdi
Ошибки, замеченные ридером	Faults observed by the reader	Feil registrert av leseren
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
Переключить дневной и ночной режим	Switch day and night mode	Bytt mellom dag- og nattmodus
Язык	Language	Språk
Живые данные CAN	Live CAN data	CAN-data i sanntid
Ожидание ESP	Waiting for ESP	Venter på ESP
Данные поступают только с ESP32	Data comes from ESP32 only	Data kommer kun fra ESP32
ESP32 · напрямую по USB / Wi-Fi	ESP32 · direct USB / Wi-Fi	ESP32 · direkte USB / Wi-Fi
ESP32 · через подключённый USB-ПК	ESP32 · via the connected USB computer	ESP32 · via tilkoblet USB-PC
Начать чтение · без таймера	Start reading · continuous	Start lesing · kontinuerlig
Остановить просмотр	Stop reading	Stopp lesing
Все данные	All data	Alle data
★ Избранное	★ Favorites	★ Favoritter
Избрано показателей:	Favorite readings:	Favorittverdier:
Избранных показателей пока нет. Откройте «Все данные» и нажмите звезду рядом с нужным показателем.	No favorites yet. Open All data and select the star next to a reading.	Ingen favoritter ennå. Åpne Alle data og velg stjernen ved en verdi.
В избранное	Add to favorites	Legg til favoritter
Убрать из избранного	Remove from favorites	Fjern fra favoritter
известных сообщений	known messages	kjente meldinger
Нет данных	No data	Ingen data
сейчас	just now	akkurat nå
с назад	s ago	s siden
Дополнительных ID пока нет.	No additional IDs yet.	Ingen ekstra ID-er ennå.
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
Подключение…	Connecting…	Kobler til…
Подключено	Connected	Tilkoblet
Нет связи	No connection	Ingen forbindelse
Велосипед · удалённая панель	Bicycle · remote panel	Sykkel · fjernpanel
Ошибка	Error	Feil
Остановить	Stop	Stopp
Начать	Start	Start
Отмена	Cancel	Avbryt
Настройки	Settings	Innstillinger
Сохранить	Save	Lagre
Ошибки	Errors	Feil
Приём	Reading	Lesing
Состояние ридера	Reader status	Leserstatus
Свободная память	Free memory	Ledig minne
Серийный номер	Serial number	Serienummer
Модель	Model	Modell
Версия ПО	Software version	Programvareversjon
Ячейка	Cell	Celle
Напряжение	Voltage	Spenning
Температура	Temperature	Temperatur
Ток	Current	Strøm
Заряд	Charge	Ladning
Полная	Full	Full
Остаток	Remaining	Gjenværende
Количество циклов	Cycle count	Antall sykluser
Разброс	Spread	Spredning
ячеек	cells	celler
по контроллеру	reported by controller	fra kontroller
Сохранено	Saved	Lagret
не подтверждено	unconfirmed	ubekreftet
Скачать	Download	Last ned
км/ч	km/h	km/t
об/мин	rpm	o/min
мА·ч	mAh	mAh
мВ	mV	mV
Вт	W	W
кбит/с	kbit/s	kbit/s
бит/с	bit/s	bit/s
байт	bytes	byte
мин	min	min
В	V	V
А	A	A
мм	mm	mm
км	km	km
код	code	kode
с	s	s
ч	h	t
Сумма ячеек	Cell voltage sum	Sum av cellespenninger
Имя сети	Network name	Nettverksnavn
Канал	Channel	Kanal
Авто	Auto	Auto
Формат	Format	Format
ошибки	 errors	feil
Разброс ячеек	Cell voltage spread	Spredning i cellespenning
Последние полученные данные	Last received readings	Sist mottatte måleverdier
CAN-кадры	CAN frames	CAN-rammer
Номинальная ёмкость	Design capacity	Nominell kapasitet
подключён	connected	tilkoblet
назад	ago	siden
Батарея · паспортные данные	Battery · design data	Batteri · grunndata
Последовательных ячеек	Cells in series	Celler i serie
Параллельных ячеек	Cells in parallel	Celler i parallell
Сумма ячеек · расчёт	Cell voltage sum · calculated	Sum av cellespenninger · beregnet
Разброс ячеек · расчёт	Cell voltage spread · calculated	Spredning i cellespenning · beregnet
Батарея · циклы и хранение	Battery · cycles and storage	Batteri · sykluser og lagring
Самый долгий перерыв зарядки	Longest time without charge	Lengste tid uten lading
Последний перерыв зарядки	Recent time without charge	Siste tid uten lading
Батарея · напряжения ячеек	Battery · cell voltages	Batteri · cellespenninger
Bafang V2.5 · справочно	Bafang V2.5 · reference only	Bafang V2.5 · kun som referanse
Старый SYM · другая нумерация	Legacy SYM · different numbering	Eldre SYM · annen nummerering
Область показания	Reading scope	Omfang for avlesning
Текущее сообщение CAN; сохранённые ошибки PCB не прочитаны	Current CAN message; stored PCB faults not read	Aktuell CAN-melding; lagrede PCB-feil er ikke lest
Неизвестный код	Unknown code	Ukjent kode
Контроллер · идентификаторы	Controller · identification	Kontroller · identifikasjon
Аппаратная версия	Hardware version	Maskinvareversjon
Модель контроллера	Controller model	Kontrollermodell
Серийный номер контроллера	Controller serial number	Kontrollerens serienummer
Ридер ESP32	ESP32 reader	ESP32-leser
Версия	Version	Versjon
Адрес	Address	Adresse
Подключено к ридеру	Connected to reader	Koblet til leseren
Нет связи с ридером	No connection to reader	Ingen forbindelse til leseren
ESP32 · напрямую по Wi-Fi	ESP32 · direct Wi-Fi connection	ESP32 · direkte Wi-Fi-forbindelse
Последние CAN-кадры	Latest CAN frames	Siste CAN-meldinger
Пропуски просмотра:	Preview gaps:	Hull i visningen:
Настройки Wi-Fi	Wi-Fi settings	Wi-Fi-innstillinger
Автономная панель · без интернета	Local dashboard · no internet needed	Lokalt panel · uten internett
Неверный ответ ридера	Invalid reader response	Ugyldig svar fra leseren
Операция уже выполняется	An operation is already running	En operasjon pågår allerede
CAN уже читается	CAN is already being read	CAN leses allerede
Чтение запущено другим подключением	Reading was started by another connection	Avlesningen ble startet av en annen forbindelse
Недоступная операция	Operation unavailable	Operasjonen er ikke tilgjengelig
Проверьте имя сети и канал	Check the network name and channel	Kontroller nettverksnavn og kanal
Сначала остановите чтение CAN	Stop CAN reading first	Stopp CAN-avlesningen først
Сохранено. Применится после перезапуска питания.	Saved. Applies after restarting the reader.	Lagret. Tas i bruk etter omstart av leseren.
Изменения применятся после перезапуска питания. CAN должен быть остановлен.	Changes apply after restarting the reader. CAN must be stopped.	Endringer tas i bruk etter omstart av leseren. CAN må være stoppet.
Повторить загрузку	Retry loading	Prøv å laste på nytt
Текущие данные	Live readings	Gjeldende måleverdier
Пульт Bluetooth	Bluetooth remote	Bluetooth-fjernkontroll
Пульт недоступен	Remote unavailable	Fjernkontroll utilgjengelig
Обновите прошивку для пульта по Wi-Fi	Update firmware for Wi-Fi remote control	Oppdater fastvaren for fjernkontroll via Wi-Fi
Пульт не включился	Remote did not start	Fjernkontrollen startet ikke
Дождитесь подключения велосипеда	Wait for the bike to connect	Vent til sykkelen kobler til
Walk Assist · удерживать	Walk Assist · hold	Trilleassistanse · hold inne
Разблокировать	Unlock	Lås opp
Точно выключить питание велосипеда?	Are you sure you want to power off the bike?	Er du sikker på at du vil slå av sykkelen?
Удерживайте кнопку для отправки, затем отпустите.	Hold the button to send, then release.	Hold knappen inne for å sende, og slipp deretter.
Подтвердить Power off	Confirm Power off	Bekreft Power off
Скачать CAN-лог	Download CAN log	Last ned CAN-logg
CAN-лог сохраняется на этом устройстве	CAN log is saved on this device	CAN-loggen lagres på denne enheten
CAN-лог сохраняется в браузере. Его можно скачать после действия.	The CAN log is saved in the browser. You can download it after the action.	CAN-loggen lagres i nettleseren. Du kan laste den ned etter handlingen.
CAN-запись: записываю действие	CAN log: recording action	CAN-logg: registrerer handling
Неполная запись	Incomplete recording	Ufullstendig opptak
`.split('\n').filter(Boolean).map(line=>line.split(/\t|\\t/));
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

;
/* Read-only, unconfirmed SYM decoder. Original payload always stays intact. */
(function (root) {
  const DECODER_VERSION = 'sym-evidence-2-v25';
  const REFERENCE={document:'GYE-1--02 V2.5',sha256:'33864de4e080df20579623e574af38a55e19b2561e1d55c7491eb69bb0979705',compatibility:'unconfirmed'};
  const INSTRUCTIONS=['write_or_public_post','read','normal_reply','error_reply','long_start','long_transfer','long_end','warning'];
  const WARNING_V25={"0":"No current warning reported","3":"Brake already applied","4":"Throttle fault","5":"Throttle not returned to zero","6":"Undervoltage","7":"Overvoltage","8":"Motor Hall signal wiring fault","9":"Motor phase wiring fault","16":"Motor overtemperature protection","17":"Motor temperature sensor fault","18":"Current sensor fault","20":"Controller overtemperature protection","21":"Controller temperature sensor fault","33":"Speed sensor fault","35":"Headlight fault","37":"Torque sensor signal fault","38":"Torque sensor signal fault","39":"Overcurrent","48":"HMI/controller communication fault","49":"Low voltage protection","50":"Overvoltage protection","51":"Brake detection circuit fault","53":"15 V supply detection fault","54":"Key detection circuit fault","65":"Battery total voltage too high","66":"Battery total voltage too low","67":"Battery cell current too high","69":"Battery temperature too high","70":"Battery temperature too low","71":"Battery SOC too high","72":"Battery SOC too low","97":"Transmission stuck","98":"Transmission cannot reset","113":"Electronic lock stuck","129":"Bluetooth module fault"};
  const WARNING_SYM={"0":["No current warning reported"],"27":["Overcurrent"],"7":["Overvoltage"],"6":["Undervoltage"],"3":["Brake already applied"],"5":["Throttle not returned to zero","Throttle fault"],"31":["Low voltage protection"],"32":["Overvoltage protection"],"8":["Motor Hall signal wiring fault"],"9":["Motor phase wiring fault"],"10":["Motor overtemperature protection"],"11":["Motor temperature sensor fault"],"14":["Controller overtemperature protection"],"15":["Controller temperature sensor fault"],"12":["Current sensor fault"],"23":["Headlight fault"],"33":["Brake detection circuit fault"],"35":["15 V supply detection fault"],"36":["Key detection circuit fault"],"21":["Speed sensor fault"]};
  function warningReference(raw){
    if(!Number.isInteger(raw)||raw<0||raw>255)throw Error('A warning is one raw byte');
    const primary=WARNING_V25[raw]??null,legacy=WARNING_SYM[raw]||[];
    return {raw_hex:raw.toString(16).toUpperCase().padStart(2,'0'),decimal:raw,v25:primary,legacy_sym:[...legacy],source_agreement:primary!==null&&legacy.length===1?primary===legacy[0]:null,enum_ambiguous:legacy.length>1,reference:{...REFERENCE,pages:[20,21]},vehicle_validated:false,scope:'current_wire_warning_only',stored_pcb_history_read:false,all_components_healthy_proven:false};
  }
  function interpretId(id){const cmd=(id>>>16)&7;return {source:(id>>>24)&31,destination:(id>>>19)&31,instruction:cmd,instruction_name:INSTRUCTIONS[cmd],public_post:((id>>>19)&31)===31&&cmd===0,object_hex:[5,6].includes(cmd)?null:(id&65535).toString(16).toUpperCase().padStart(4,'0'),sequence:[5,6].includes(cmd)?id&65535:null,evidence:{...REFERENCE,pages:[11,12,18,19]}};}
  function referenceField(raw,value,unit,pages,validity='unconfirmed'){return {raw,value,unit,validity,evidence:{reason:'bafang_v25_reference_not_vehicle_validation',confirmed:false,reference:{...REFERENCE,pages}}};}
  function wheelFields(data){const limit=data[0]+data[1]*256,word=data[2]+data[3]*256,circumference=data[4]+data[5]*256;return {Speed_Limit_kmh:referenceField(limit,limit/100,'km/h',[23,24]),Wheel_Code:referenceField(word,(word>>>4)+(word&15)/10,'code',[23,24],(word&15)<=9?'unconfirmed':'suspected_unavailable'),Wheel_Circumference_mm:referenceField(circumference,circumference,'mm',[24])};}

  function decode(frame, schema) {
    const metadata = {decoder_version:DECODER_VERSION,reference_sha256:schema?.sha256};
    try {
      if (typeof frame.id !== 'string' || !/^(?:0[xX])?[0-9a-fA-F]{1,8}$/.test(frame.id)) throw Error('Формат ID');
      const id = Number.parseInt(frame.id, 16), hex = frame.data;
      if (typeof frame.extended !== 'boolean' || typeof frame.rtr !== 'boolean' || !Number.isInteger(frame.dlc) || frame.dlc < 0 || frame.dlc > 8) throw Error('Флаги / DLC');
      if (!Number.isInteger(id) || id < 0 || id > (frame.extended ? 0x1fffffff : 0x7ff)) throw Error('ID / extended');
      if (typeof hex !== 'string' || !/^(?:[0-9a-fA-F]{2})*$/.test(hex) || hex.length !== (frame.rtr ? 0 : frame.dlc * 2)) throw Error('Длина DATA');
      metadata.source_node = frame.extended ? (id >>> 24) & 31 : null;
      metadata.source_node_evidence = frame.extended ? 'published_identifier_layout_unconfirmed' : 'not_applicable_standard_id';
      if(frame.extended)metadata.reference_layout=interpretId(id);
      if (frame.rtr) return {...metadata,status:'rtr'};
      if(id===0x02f83203){if(!frame.extended||frame.dlc!==6)throw Error('Объект колеса V2.5 требует 6 байт');return {...metadata,status:'decoded_unconfirmed',message:'CR_Wheel_Reference_V25',mapping_source:'bafang_v25',fields:wheelFields(hex.match(/../g).map(x=>parseInt(x,16)))};}
      const msg = schema.messages.find(m => Number.parseInt(m.id, 16) === id);
      if (!msg) return {...metadata,status:'unknown'};
      if (!frame.extended || frame.dlc !== msg.picture_bytes) throw Error('Длина / флаги SYM');
      const data = hex.match(/../g)?.map(x => parseInt(x, 16)) || [], fields = {};
      for (const s of msg.signals) {
        if (s.byte_order !== 'little_endian' || !['unsigned','signed'].includes(s.type)) throw Error('Неподдерживаемое поле SYM; сырые данные сохранены');
        let raw = s.bits_lsb0.reduce((v, bit, i) => v + ((data[Math.floor(bit / 8)] >> (bit % 8)) & 1) * 2 ** i, 0);
        if (s.type === 'signed' && raw >= 2 ** (s.bit_length - 1)) raw -= 2 ** s.bit_length;
        let validity='unconfirmed',reason='sym_mapping_not_independently_validated';
        if(id===0x02f83200&&s.name==='Remaining_Distance'&&raw===65535){validity='suspected_unavailable';reason='remaining_distance_raw_ffff_unverified';}
        else if(id===0x02f83201&&s.name==='Motor_Temperature'&&raw===0){validity='suspected_unavailable';reason='motor_temperature_raw_zero_unverified';}
        else if(id===0x02f83201&&s.name==='Speed'&&raw===65535){validity='suspected_unavailable';reason='bafang_v25_speed_ffff_special_value';}
        fields[s.name] = {raw, value: raw * s.factor + s.offset, unit: s.unit,validity,evidence:{reason,confirmed:false}};
      }
      if(id===0x04f83401)fields.Battery_Current_A.reference_sign_convention='positive_charge_negative_discharge_bafang_v25_unconfirmed';
      if(id===0x02ff1200)Object.assign(fields.Error,{raw_hex:hex.slice(0,2).toUpperCase(),decimal:data[0],meaning:'raw_only_conflicting_reference_dictionaries',reference_warning:warningReference(data[0])});
      return {...metadata,status:'decoded_unconfirmed',message:msg.name,fields};
    } catch (error) { return {...metadata,status:'invalid',reason:error.message}; }
  }
  root.BafangDecoder = {decode,DECODER_VERSION,interpretId,warningReference};
  if (typeof module !== 'undefined') module.exports = {decode,DECODER_VERSION,interpretId,warningReference};
})(typeof globalThis !== 'undefined' ? globalThis : this);

;
/* Passive Bafang V2.5 battery replies. No commands, timers, ports or uploads.
 * Reference p28: 6400 design, 6401 charge history, 6402..6409 cell groups.
 * Scale checked against genuine ESP capture current-bafang-cell-replies.json.
 * A matching layout is not a validation of all Spard/Phylion revisions. */
'use strict';
(() => {
  const FRESH_MS=5000,COHORT_US=100000;
  function known(id){return Number.isInteger(id)&&id>=0&&id<0x20000000&&(id>>>24)===4&&((id>>>16)&7)===2&&((id&65535)===0x6400||(id&65535)===0x6401||(id&65535)>=0x6402&&(id&65535)<=0x6409);}
  function decode(f){
    if(!f||f.extended!==true||f.rtr!==false||typeof f.id!=='string'||!/^[a-f0-9]{1,8}$/i.test(f.id)||!known(parseInt(f.id,16))||!Number.isInteger(f.dlc)||f.dlc<0||f.dlc>8||typeof f.data!=='string'||!/^(?:[a-f0-9]{2})*$/i.test(f.data)||f.data.length!==f.dlc*2)return null;
    const id=parseInt(f.id,16),object=id&65535,bytes=Uint8Array.from(f.data.match(/../g)||[],s=>parseInt(s,16)),word=i=>bytes[i]|bytes[i+1]<<8;
    const result={id:f.id.toUpperCase().padStart(8,'0'),source:4,destination:(id>>>19)&31,object,raw_hex:f.data.toUpperCase(),reference:'Bafang GYE-1--02 V2.5 p28',compatibility:'reference_not_manufacturer_validation'};
    if(object===0x6400){if(f.dlc!==4)return null;return {...result,kind:'design',series:bytes[0],parallel:bytes[1],design_mah:word(2),series_valid:bytes[0]>=1&&bytes[0]<=32};}
    if(object===0x6401){if(f.dlc!==6)return null;return {...result,kind:'charging',cycles:word(0),longest_uncharged_h:word(2),recent_uncharged_h:word(4)};}
    if(f.dlc<2||f.dlc%2)return null;
    return {...result,kind:'cells',first_cell:(object-0x6402)*4+1,raw_cells_mv:Array.from({length:f.dlc/2},(_,i)=>word(i*2))};
  }
  function model(snapshot,extraAge=0){
    if(!Number.isFinite(extraAge)||extraAge<0||!snapshot||snapshot.schema!==1||typeof snapshot.stream_active!=='boolean'||typeof snapshot.boot!=='string'||!/^[A-F0-9]{8}$/.test(snapshot.boot)||!Number.isSafeInteger(snapshot.epoch)||snapshot.epoch<0||!Array.isArray(snapshot.frames)||snapshot.frames.length>64)return null;
    const entries=[];const seen=new Set();
    for(const f of snapshot.frames){const d=decode(f);if(!d)continue;
      if(!Number.isSafeInteger(f.seq)||f.seq<0||!Number.isSafeInteger(f.t_us)||f.t_us<0||!Number.isSafeInteger(f.age_ms)||f.age_ms<0||f.age_ms>86400000||seen.has(d.id))return null;
      // Cached frames inherit snapshot scope; full frame fixtures must agree.
      if(f.boot!==undefined&&f.boot!==snapshot.boot||f.epoch!==undefined&&f.epoch!==snapshot.epoch)return null;
      seen.add(d.id);entries.push({frame:f,decoded:d});
    }
    if(!entries.length)return null;
    const flows=new Map();for(const e of entries){const k=e.decoded.destination;if(!flows.has(k))flows.set(k,[]);flows.get(k).push(e);}
    // Never combine responses addressed to different clients. Prefer the most
    // recently observed valid design response; no synthetic series count.
    const groups=[...flows.values()].sort((a,b)=>{
      const design=x=>x.find(e=>e.decoded.kind==='design'&&e.decoded.series_valid)?.frame.t_us??-1;
      return design(b)-design(a)||Math.max(...b.map(e=>e.frame.t_us))-Math.max(...a.map(e=>e.frame.t_us));
    });
    const selected=groups[0],design=selected.find(e=>e.decoded.kind==='design')||null,charging=selected.find(e=>e.decoded.kind==='charging')||null;
    const cells=[];const needed=[];const count=design?.decoded.series_valid?design.decoded.series:null;
    if(count)for(let i=0;i<count;i++){
      const e=selected.find(e=>e.decoded.object===0x6402+Math.floor(i/4)),raw=e?.decoded.raw_cells_mv[i%4];
      cells.push({index:i+1,mv:raw??null,id:e?.decoded.id??null});if(e&&!needed.includes(e))needed.push(e);
    }
    const complete=!!count&&cells.every(c=>c.mv!==null),cohort=design?[design,...needed]:[],span=cohort.length?Math.max(...cohort.map(e=>e.frame.t_us))-Math.min(...cohort.map(e=>e.frame.t_us)):null;
    const coherent=complete&&span<=COHORT_US,usable=coherent&&cells.every(c=>c.mv>0&&c.mv<65535);
    const age=e=>Math.max(0,e.frame.age_ms)+Math.max(0,extraAge),ageMs=cohort.length?Math.max(...cohort.map(age)):Math.max(...selected.map(age));
    return {boot:snapshot.boot,epoch:snapshot.epoch,destination:selected[0].decoded.destination,design,charging,cells,entries:selected,complete,coherent,usable,span_us:span,age_ms:ageMs,
      stale:snapshot.stream_active!==true||ageMs>FRESH_MS,sum_mv:usable?cells.reduce((n,c)=>n+c.mv,0):null,delta_mv:usable?Math.max(...cells.map(c=>c.mv))-Math.min(...cells.map(c=>c.mv)):null};
  }
  function cards(snapshot,extraAge=0){
    const m=model(snapshot,extraAge);if(!m)return [];
    const n=new Intl.NumberFormat(globalThis.ByI18n?.locale?.()||'ru-RU',{maximumFractionDigits:3}),rows=[];
    const field=(key,name,value,unit='')=>({key,name,value:value===null?'—':n.format(value),unit});
    function card(e,title,fields){const age=e.frame.age_ms+Math.max(0,extraAge);return {id:e.decoded.id,title,fields,age_ms:age,stale:snapshot.stream_active!==true||age>FRESH_MS,observed:true,invalid:false};}
    if(m.design){const e=m.design,d=e.decoded;rows.push(card(e,'Батарея · паспортные данные',[
      field('Series_Count','Последовательных ячеек',d.series),field('Parallel_Count','Параллельных ячеек',d.parallel),field('Design_Capacity_mAh','Номинальная ёмкость',d.design_mah,'мА·ч'),
      field('Cell_Sum_V','Сумма ячеек · расчёт',m.sum_mv===null?null:m.sum_mv/1000,'В'),field('Cell_Delta_mV','Разброс ячеек · расчёт',m.delta_mv,'мВ')
    ]));}
    if(m.charging){const e=m.charging,d=e.decoded;rows.push(card(e,'Батарея · циклы и хранение',[
      field('Cycle_Count','Количество циклов',d.cycles),field('Max_Uncharged_h','Самый долгий перерыв зарядки',d.longest_uncharged_h,'ч'),field('Recent_Uncharged_h','Последний перерыв зарядки',d.recent_uncharged_h,'ч')
    ]));}
    if(m.design?.decoded.series_valid)for(const e of m.entries.filter(e=>e.decoded.kind==='cells')){
      const fields=[];for(let k=0;k<4;k++){const index=e.decoded.first_cell+k;if(index>m.cells.length)break;const raw=e.decoded.raw_cells_mv[k];
        const f=field('Cell_'+index+'_V','Ячейка '+index,raw===undefined||raw===0||raw===65535?null:raw/1000,'В');if(raw===0||raw===65535)f.note='raw 0x'+raw.toString(16).toUpperCase().padStart(4,'0');fields.push(f);
      }
      if(fields.length)rows.push(card(e,'Батарея · напряжения ячеек',fields));
    }
    // The design remains a real received message, but calculated fields cannot
    // look fresh when any contributing cell group is stale or incomplete.
    if(rows[0]&&m.design)rows[0].stale=rows[0].stale||m.stale;
    return rows;
  }
  globalThis.ByBafangBattery={known,decode,model,cards,FRESH_MS,COHORT_US};
  if(typeof module!=='undefined')module.exports=globalThis.ByBafangBattery;
})();

;
/* Latest ESP CAN values only. Bounded RAM; no recorder, adapter I/O or uploads. */
'use strict';
(() => {
  const LIMIT=64,MAX_AGE=86400000;
  const RAW={0x03106303:['Управление · таймер выключения','Значение'],0x04f83402:['Батарея · состояние','Код состояния'],0x04ff1400:['Батарея · предупреждения','Код предупреждения']};
  const TITLES={CR_Warning:'Контроллер · ошибки',Battery_SOC_SOH_Information:'Батарея · заряд и ёмкость',Battery_Current_Voltage_Temp:'Батарея · питание',CR_Walk_Assist_Information:'Помощь при ходьбе',CR_Torque_Sensor_Information:'Контроллер · датчики и запас хода',CR_Speed_Current_Voltage_Temp:'Контроллер · движение и питание',Torque_Sensor_Signal:'Датчик момента',CR_Turn_Off_Instruction:'Контроллер · выключение',CR_Calories:'Контроллер · энергия',CR_Mode:'Контроллер · режим',Pulse_Count:'Служебный счётчик',HMI_Mode:'Органы управления',CR_Wheel_Reference_V25:'Колесо и ограничение скорости'};
  const LABELS={Error:'Код ошибки',Total_Capacity_mAh:'Полная ёмкость',Residual_Capacity_mAh:'Остаток ёмкости','Relative_Capacity %':'Относительный заряд','Absolut_Capacity %':'Абсолютный заряд',SOH:'Состояние батареи',Battery_Current_A:'Ток батареи',Battery_Voltage_V:'Напряжение батареи',Temperature:'Температура батареи',Walk_Assist_Status:'Состояние walk assist',Remaining_Capacity:'Заряд по контроллеру',Trip:'Пробег поездки',Pedal_Revolution:'Каденс по контроллеру',Torque_Sensor_Voltage:'Сигнал момента',Remaining_Distance:'Запас хода',Speed:'Скорость',Current:'Ток контроллера',CR_Voltage:'Напряжение контроллера',Motor_Temperature:'Температура мотора',Controller_Temperature:'Температура контроллера',Cadence:'Каденс',Frame_Counts:'Счётчик датчика','1 means do not turn off':'Запрет выключения',Calories:'Калории',Mode:'Режим',Pulse_Count:'Счётчик импульсов',No_of_total_Modes:'Количество уровней',Gears:'Уровень помощи',Light_Status:'Свет',Trip_Reset:'Флаг сброса поездки',Speed_Limit_kmh:'Ограничение скорости',Wheel_Code:'Код размера колеса',Wheel_Circumference_mm:'Окружность колеса'};
  const UNITS={'km/h':'км/ч',rpm:'об/мин',mV:'мВ',V:'В',A:'А',mAh:'мА·ч',mm:'мм',km:'км',code:'код'};
  const key=f=>(f.extended?'E':'S')+':'+Number.parseInt(f.id,16).toString(16)+(f.rtr?':R':':D');
  function valid(f){return !!f&&typeof f.id==='string'&&/^[0-9a-fA-F]{1,8}$/.test(f.id)&&typeof f.extended==='boolean'&&typeof f.rtr==='boolean'&&Number.isInteger(f.dlc)&&f.dlc>=0&&f.dlc<=8&&Number.parseInt(f.id,16)<(f.extended?0x20000000:0x800)&&typeof f.data==='string'&&/^(?:[0-9a-fA-F]{2})*$/.test(f.data)&&f.data.length===(f.rtr?0:f.dlc*2)&&Number.isSafeInteger(f.seq)&&f.seq>=0&&Number.isSafeInteger(f.t_us)&&f.t_us>=0;}
  const IDENTITY_KEYS=['id','extended','rtr','dlc','data','seq','t_us'];
  const IDENTITY_OBJECTS=['6000','6001','6002','6003'];
  const compact=f=>Object.fromEntries(IDENTITY_KEYS.map(k=>[k,k==='id'?f[k].toUpperCase().padStart(8,'0'):k==='data'?f[k].toUpperCase():f[k]]));
  function validateIdentity(value){
    if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='age_ms,boot,epoch,frames,object'||typeof value.boot!=='string'||!/^[A-F0-9]{8}$/.test(value.boot)||!Number.isSafeInteger(value.epoch)||value.epoch<0||!IDENTITY_OBJECTS.includes(value.object)||!Number.isSafeInteger(value.age_ms)||value.age_ms<0||value.age_ms>MAX_AGE||!Array.isArray(value.frames)||value.frames.length<2||value.frames.length>9)return null;
    let length=null,total=0,previous=null;
    for(let index=0;index<value.frames.length;index++){
      const f=value.frames[index];
      if(!f||Object.keys(f).sort().join(',')!==[...IDENTITY_KEYS].sort().join(',')||!valid(f)||f.extended!==true||f.rtr!==false||f.dlc===0||!(/^[A-F0-9]{8}$/).test(f.id)||!(/^(?:[A-F0-9]{2})*$/).test(f.data))return null;
      const id=parseInt(f.id,16),op=(id>>>16)&7,parameter=id&65535;
      if((id>>>24)!==2||((id>>>19)&31)!==3||previous&&(f.seq<=previous.seq||f.t_us<previous.t_us))return null;
      if(!index){if(op!==4||parameter!==parseInt(value.object,16)||f.dlc!==1)return null;length=parseInt(f.data,16);if(length<1||length>64)return null;}
      else{const last=index===value.frames.length-1;if(op!==(last?6:5)||parameter!==index-1||!last&&f.dlc!==8)return null;total+=f.dlc;if(total>length||!last&&total>=length)return null;}
      previous=f;
    }
    if(total!==length||previous.t_us-value.frames[0].t_us>2000000)return null;
    return {object:value.object,age_ms:value.age_ms,frames:value.frames.map(compact),boot:value.boot,epoch:value.epoch};
  }
  function interpretIdentity(value){
    const r=validateIdentity(value);if(!r)return null;const raw=r.frames.slice(1).map(f=>f.data).join(''),bytes=raw.match(/../g).map(x=>parseInt(x,16));
    return {object:r.object,raw_hex:raw,text:bytes.every(x=>x>=32&&x<=126)?String.fromCharCode(...bytes):null,source:2,destination:3,reference:'Bafang GYE-1--02 V2.5 p25; observed controller framing',compatibility:'reference_not_vehicle_identification'};
  }
  class IdentityAssembler{
    constructor(now=()=>performance.now()){this.now=now;this.reset();}
    reset(boot=null,epoch=null){this.boot=boot;this.epoch=epoch;this.pending=null;this.latest=new Map();this.lastSeq=null;this.lastUs=null;}
    feed(f){
      if(!valid(f)||typeof f.boot!=='string'||!/^[A-F0-9]{8}$/.test(f.boot)||!Number.isSafeInteger(f.epoch)||f.epoch<0){this.pending=null;return null;}
      if(this.boot!==f.boot||this.epoch!==f.epoch)this.reset(f.boot,f.epoch);
      if(this.lastUs!==null&&f.t_us<this.lastUs){this.pending=null;this.latest.clear();}
      if(this.lastSeq!==null&&f.seq!==this.lastSeq+1)this.pending=null;
      this.lastSeq=f.seq;this.lastUs=f.t_us;
      if(this.pending&&f.t_us-this.pending.frames[0].t_us>2000000)this.pending=null;
      const id=parseInt(f.id,16),op=(id>>>16)&7,parameter=id&65535;
      if(!f.extended||f.rtr||(id>>>24)!==2||((id>>>19)&31)!==3)return null;
      if(op===4){this.pending=null;const object=parameter.toString(16).toUpperCase().padStart(4,'0'),length=parseInt(f.data,16);if(IDENTITY_OBJECTS.includes(object)&&f.dlc===1&&length>0&&length<=64)this.pending={object,length,frames:[compact(f)],next:0,total:0};return null;}
      if(op===3){this.pending=null;return null;}
      if(op!==5&&op!==6||!this.pending)return null;
      const p=this.pending,total=p.total+f.dlc;
      if(parameter!==p.next||!f.dlc||total>p.length||op===5&&(f.dlc!==8||total>=p.length)||op===6&&total!==p.length){this.pending=null;return null;}
      p.frames.push(compact(f));p.next++;p.total=total;
      if(op===6){this.pending=null;const record=validateIdentity({object:p.object,age_ms:0,frames:p.frames,boot:this.boot,epoch:this.epoch});if(record){this.latest.set(record.object,{record,seen:this.now()});return record;}}
      return null;
    }
    snapshot(boot,epoch){if(boot!==this.boot||epoch!==this.epoch)return [];return [...this.latest.values()].map(x=>({...x.record,frames:x.record.frames.map(compact),age_ms:Math.min(MAX_AGE,Math.max(0,Math.round(this.now()-x.seen)))}));}
  }
  // One-byte canonical warning broadcasts. Other frames remain in the raw view.
  const WARNING_LIMIT=8;
  function warningFrame(f){
    if(!valid(f)||!f.extended||f.rtr||f.dlc!==1)return false;
    const id=parseInt(f.id,16),source=id>>>24;
    return source>=1&&source<=15&&((id>>>19)&31)===31&&((id>>>16)&7)===7&&(id&65535)===(0x10+source)*256;
  }
  function validateWarningJournal(value){
    if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='events,evicted,schema'||value.schema!==1||!Number.isSafeInteger(value.evicted)||value.evicted<0||!Array.isArray(value.events)||value.events.length>WARNING_LIMIT)return null;
    let prior=null;const events=[];
    for(const e of value.events){
      if(!e||Object.keys(e).sort().join(',')!=='count,first,first_age_ms,last,last_age_ms,next,next_age_ms'||!Number.isSafeInteger(e.count)||e.count<1)return null;
      const fs=[e.first,e.last,...(e.next?[e.next]:[])];
      if(fs.some(f=>!f||Object.keys(f).sort().join(',')!==[...IDENTITY_KEYS].sort().join(',')||!warningFrame(f)||!(/^[A-F0-9]{8}$/).test(f.id)||!(/^[A-F0-9]{2}$/).test(f.data)))return null;
      const a=e.first,b=e.last,c=e.next;
      if(a.data==='00'||a.id!==b.id||a.data!==b.data||b.seq<a.seq||b.t_us<a.t_us||e.count>b.seq-a.seq+1||prior&&a.seq<=prior.first.seq)return null;
      if(c&&(c.id!==a.id||c.data===a.data||c.seq<=b.seq||c.t_us<b.t_us))return null;
      if(!c&&e.next!==null)return null;
      for(const age of [e.first_age_ms,e.last_age_ms,...(c?[e.next_age_ms]:[])])if(!Number.isSafeInteger(age)||age<0||age>MAX_AGE)return null;
      if(e.first_age_ms<e.last_age_ms||c&&e.last_age_ms<e.next_age_ms||!c&&e.next_age_ms!==null)return null;
      events.push({first:compact(a),last:compact(b),next:c?compact(c):null,count:e.count,first_age_ms:e.first_age_ms,last_age_ms:e.last_age_ms,next_age_ms:e.next_age_ms});prior=e;
    }
    return {schema:1,events,evicted:value.evicted};
  }
  class WarningJournal{
    constructor(now=()=>performance.now()){this.now=now;this.reset();}
    reset(){this.events=[];this.nodes=new Map();this.evicted=0;this.lastSeq=-1;this.lastTime=-1;}
    feed(f){
      if(!warningFrame(f)||f.seq<=this.lastSeq||f.t_us<this.lastTime)return;
      this.lastSeq=f.seq;this.lastTime=f.t_us;
      const frame=compact(f),previous=this.nodes.get(frame.id),now=this.now();
      if(previous&&(frame.seq<=previous.frame.seq||frame.t_us<previous.frame.t_us))return;
      if(previous?.frame.data===frame.data){
        if(previous.event){previous.event.last=frame;previous.event.last_seen=now;previous.event.count=Math.min(Number.MAX_SAFE_INTEGER,previous.event.count+1);}
        previous.frame=frame;return;
      }
      if(previous?.event){previous.event.next=frame;previous.event.next_seen=now;}
      let event=null;
      if(frame.data!=='00'){
        event={first:frame,last:frame,next:null,count:1,first_seen:now,last_seen:now,next_seen:null};this.events.push(event);
        if(this.events.length>WARNING_LIMIT){this.events.shift();this.evicted++;}
      }
      this.nodes.set(frame.id,{frame,event});
    }
    snapshot(){const now=this.now(),age=at=>Math.min(MAX_AGE,Math.max(0,Math.round(now-at)));
      return {schema:1,evicted:this.evicted,events:this.events.map(e=>({first:compact(e.first),last:compact(e.last),next:e.next?compact(e.next):null,count:e.count,first_age_ms:age(e.first_seen),last_age_ms:age(e.last_seen),next_age_ms:e.next?age(e.next_seen):null}))};
    }
  }
  class Cache {
    constructor(schema,now=()=>performance.now()){this.warnings=new WarningJournal(now);this.identity=new IdentityAssembler(now);this.schema=schema;this.now=now;this.frames=new Map();this.boot=null;this.epoch=null;this.count=0;this.evicted=0;}
    reset(boot,epoch){this.warnings.reset();this.identity.reset(boot,epoch);this.frames.clear();this.boot=boot;this.epoch=epoch;this.count=0;this.evicted=0;}
    ingest(f){
      if(!valid(f)||typeof f.boot!=='string'||!/^[A-F0-9]{8}$/.test(f.boot)||!Number.isSafeInteger(f.epoch)||f.epoch<0)return false;
      if(this.boot!==f.boot||this.epoch!==f.epoch)this.reset(f.boot,f.epoch);
      const k=key(f),previous=this.frames.get(k);if(previous&&f.seq<=previous.seq)return false;
      this.identity.feed(f);this.warnings.feed(f);
      const known=id=>!!RAW[id]||id===0x02f83203||globalThis.ByBafangBattery?.known(id)||this.schema?.messages?.some(m=>parseInt(m.id,16)===id);
      if(!this.frames.has(k)&&this.frames.size>=LIMIT){const entries=[...this.frames];const old=entries.filter(([,v])=>!known(parseInt(v.id,16))).sort((a,b)=>a[1].seen-b[1].seen)[0]||entries.sort((a,b)=>a[1].seen-b[1].seen)[0];this.frames.delete(old[0]);this.evicted++;}
      this.frames.set(k,{id:f.id.toUpperCase().padStart(8,'0'),extended:f.extended,rtr:f.rtr,dlc:f.dlc,data:f.data.toUpperCase(),seq:f.seq,t_us:f.t_us,seen:this.now()});this.count++;return true;
    }
    snapshot(device={},connected=false){
      const same=this.boot===device.boot&&this.epoch===device.epoch;
      return {schema:1,boot:device.boot||null,epoch:device.epoch??null,stream_active:!!connected&&device.can==='running',
        ...(same?{warning_journal:this.warnings.snapshot()}:{}),
        ...(same&&this.identity.latest.size?{controller_identity:this.identity.snapshot(device.boot,device.epoch)}:{}),
        frames:same?[...this.frames.values()].map(({seen,...f})=>({...f,age_ms:Math.min(MAX_AGE,Math.max(0,Math.round(this.now()-seen)))})):[],evicted_ids:this.evicted};
    }
  }
  const WARNING_TEXT={"No current warning reported":{"ru":"В текущем сообщении нет предупреждения","en":"No current warning reported","nb":"Ingen aktuell advarsel rapportert"},"Brake already applied":{"ru":"Тормоз уже нажат","en":"Brake already applied","nb":"Bremsen er aktivert"},"Throttle fault":{"ru":"Ошибка ручки газа","en":"Throttle fault","nb":"Feil på gasshendel"},"Throttle not returned to zero":{"ru":"Ручка газа не вернулась в ноль","en":"Throttle not returned to zero","nb":"Gasshendelen er ikke tilbake i nullstilling"},"Undervoltage":{"ru":"Пониженное напряжение","en":"Undervoltage","nb":"Underspenning"},"Overvoltage":{"ru":"Повышенное напряжение","en":"Overvoltage","nb":"Overspenning"},"Motor Hall signal wiring fault":{"ru":"Ошибка сигнальных проводов датчиков Холла мотора","en":"Motor Hall signal wiring fault","nb":"Feil på ledninger til motorens Hall-sensorer"},"Motor phase wiring fault":{"ru":"Ошибка фазных проводов мотора","en":"Motor phase wiring fault","nb":"Feil på motorens faseledninger"},"Motor overtemperature protection":{"ru":"Защита от перегрева мотора","en":"Motor overtemperature protection","nb":"Motorvern mot overtemperatur"},"Motor temperature sensor fault":{"ru":"Ошибка датчика температуры мотора","en":"Motor temperature sensor fault","nb":"Feil på motorens temperatursensor"},"Current sensor fault":{"ru":"Ошибка датчика тока","en":"Current sensor fault","nb":"Feil på strømsensor"},"Controller overtemperature protection":{"ru":"Защита от перегрева контроллера","en":"Controller overtemperature protection","nb":"Kontrollervern mot overtemperatur"},"Controller temperature sensor fault":{"ru":"Ошибка датчика температуры контроллера","en":"Controller temperature sensor fault","nb":"Feil på kontrollerens temperatursensor"},"Speed sensor fault":{"ru":"Ошибка датчика скорости","en":"Speed sensor fault","nb":"Feil på hastighetssensor"},"Headlight fault":{"ru":"Ошибка переднего света","en":"Headlight fault","nb":"Feil på frontlys"},"Torque sensor signal fault":{"ru":"Ошибка сигнала датчика момента","en":"Torque sensor signal fault","nb":"Feil på signal fra momentsensor"},"Overcurrent":{"ru":"Превышен ток","en":"Overcurrent","nb":"Overstrøm"},"HMI/controller communication fault":{"ru":"Ошибка связи HMI и контроллера","en":"HMI/controller communication fault","nb":"Kommunikasjonsfeil mellom HMI og kontroller"},"Low voltage protection":{"ru":"Защита от низкого напряжения","en":"Low voltage protection","nb":"Vern mot underspenning"},"Overvoltage protection":{"ru":"Защита от повышенного напряжения","en":"Overvoltage protection","nb":"Vern mot overspenning"},"Brake detection circuit fault":{"ru":"Ошибка цепи определения тормоза","en":"Brake detection circuit fault","nb":"Feil i krets for bremseregistrering"},"15 V supply detection fault":{"ru":"Ошибка контроля питания 15 В","en":"15 V supply detection fault","nb":"Feil i overvåking av 15 V forsyning"},"Key detection circuit fault":{"ru":"Ошибка цепи определения кнопки","en":"Key detection circuit fault","nb":"Feil i krets for knapperegistrering"},"Battery total voltage too high":{"ru":"Напряжение батареи слишком высокое","en":"Battery total voltage too high","nb":"Batterispenningen er for høy"},"Battery total voltage too low":{"ru":"Напряжение батареи слишком низкое","en":"Battery total voltage too low","nb":"Batterispenningen er for lav"},"Battery cell current too high":{"ru":"Ток ячеек батареи слишком большой","en":"Battery cell current too high","nb":"Battericellenes strøm er for høy"},"Battery temperature too high":{"ru":"Температура батареи слишком высокая","en":"Battery temperature too high","nb":"Batteritemperaturen er for høy"},"Battery temperature too low":{"ru":"Температура батареи слишком низкая","en":"Battery temperature too low","nb":"Batteritemperaturen er for lav"},"Battery SOC too high":{"ru":"SOC батареи слишком высокий","en":"Battery SOC too high","nb":"Batteriets SOC er for høy"},"Battery SOC too low":{"ru":"SOC батареи слишком низкий","en":"Battery SOC too low","nb":"Batteriets SOC er for lav"},"Transmission stuck":{"ru":"Трансмиссия заклинила","en":"Transmission stuck","nb":"Giret sitter fast"},"Transmission cannot reset":{"ru":"Трансмиссия не сбрасывается","en":"Transmission cannot reset","nb":"Giret kan ikke tilbakestilles"},"Electronic lock stuck":{"ru":"Электронный замок заклинил","en":"Electronic lock stuck","nb":"Den elektroniske låsen sitter fast"},"Bluetooth module fault":{"ru":"Ошибка модуля Bluetooth","en":"Bluetooth module fault","nb":"Feil på Bluetooth-modul"}};
  const warningText=value=>WARNING_TEXT[value]?.[globalThis.ByI18n?.language?.()||"en"]||value;
  function identityCard(snapshot,extraAge=0){
    const records=snapshot?.controller_identity;if(!snapshot||snapshot.schema!==1||typeof snapshot.boot!=='string'||!/^[A-F0-9]{8}$/.test(snapshot.boot)||!Number.isSafeInteger(snapshot.epoch)||snapshot.epoch<0||typeof snapshot.stream_active!=='boolean'||!Number.isFinite(extraAge)||extraAge<0||!Array.isArray(records)||!records.length||records.length>4||new Set(records.map(r=>r?.object)).size!==records.length)return [];
    const checked=records.map(validateIdentity);if(checked.some(r=>!r||r.boot!==snapshot.boot||r.epoch!==snapshot.epoch))return [];
    const labels={'6000':'Аппаратная версия','6001':'Версия ПО','6002':'Модель контроллера','6003':'Серийный номер контроллера'},ids=[],consumed=[];
    const fields=IDENTITY_OBJECTS.map(object=>{const record=checked.find(r=>r.object===object),decoded=record?interpretIdentity(record):null;if(record){ids.push(record.frames[0].id);consumed.push(...record.frames.map(f=>f.id));}return {key:'Identity_'+object,name:labels[object],value:decoded?decoded.text??'0x'+decoded.raw_hex:'—'};});
    const age=Math.max(...checked.map(r=>r.age_ms))+Math.max(0,extraAge);
    return [{id:'021C6000',title:'Контроллер · идентификаторы',fields,age_ms:age,stale:snapshot.stream_active!==true||age>60000,observed:true,invalid:false,source_ids:ids,consumed_ids:consumed}];
  }
  function cards(snapshot,schema,extraAge=0){
    const latest=new Map((snapshot?.frames||[]).filter(valid).map(f=>[key(f),f]));
    const catalog=(schema?.messages||[]).map(m=>({id:parseInt(m.id,16),name:m.name.replace(/\s+/g,''),signals:m.signals}));
    catalog.push({id:0x02f83203,name:'CR_Wheel_Reference_V25',signals:[{name:'Speed_Limit_kmh'},{name:'Wheel_Code'},{name:'Wheel_Circumference_mm'}]});
    for(const [id,[title,label]]of Object.entries(RAW))catalog.push({id:Number(id),title,rawLabel:label});
    const order=[0x04f83401,0x04f83400,0x02f83201,0x02f83200,0x03106300,0x01f83100,0x02f83203,0x02f83206,0x02f83202,0x02f83204,0x02f83205,0x02f83000,0x02ff1200,0x04f83402,0x04ff1400,0x03106303];catalog.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
    const number=new Intl.NumberFormat(globalThis.ByI18n?.locale?.()||'ru-RU',{maximumFractionDigits:3});
    const base=catalog.map(m=>{
      const frame=latest.get('E:'+m.id.toString(16)+':D'),decoded=frame?globalThis.BafangDecoder.decode(frame,schema):null;
      const age=frame?Math.max(0,frame.age_ms||0)+Math.max(0,extraAge):null;
      const stale=!snapshot?.stream_active||age===null||age>(m.id===0x02f83000?30000:5000);
      const fields=m.rawLabel?[{key:'raw',name:m.rawLabel,value:frame?'0x'+frame.data:'—',raw:true}]:m.signals.map(s=>{
        const f=decoded?.fields?.[s.name],unavailable=f?.validity==='suspected_unavailable'||(s.name==='Motor_Temperature'&&[0,190].includes(f?.raw));
        return {key:s.name,name:LABELS[s.name]||s.name.replaceAll('_',' '),value:!f||unavailable||!Number.isFinite(f.value)?'—':s.name==='Error'?'0x'+frame.data:number.format(f.value),unit:UNITS[f?.unit]||f?.unit||({Temperature:'°C',SOH:'%','Relative_Capacity %':'%','Absolut_Capacity %':'%'}[s.name])||'',note:unavailable?'raw 0x'+Math.trunc(f.raw).toString(16).toUpperCase()+' · значение не подтверждено':null};
      });
      if(m.id===0x02ff1200){
        const ref=decoded?.fields?.Error?.reference_warning;
        fields.push({key:'error_reference',name:'Bafang V2.5 · справочно',value:!ref?'—':ref.v25?warningText(ref.v25):'Неизвестный код'});
        if(ref?.legacy_sym?.length&&ref.source_agreement!==true)fields.push({key:'error_legacy',name:'Старый SYM · другая нумерация',value:ref.legacy_sym.map(warningText).join(' / ')});
        fields.push({key:'error_scope',name:'Область показания',value:ref?'Текущее сообщение CAN; сохранённые ошибки PCB не прочитаны':'—'});
      }
      if(m.id===0x04f83401){const f=decoded?.fields;fields.push({key:'calculated_power',name:'Электрическая мощность · расчёт',value:f?number.format(f.Battery_Current_A.value*f.Battery_Voltage_V.value):'—',unit:'Вт'});}
      return {id:m.id.toString(16).toUpperCase().padStart(8,'0'),title:m.title||TITLES[m.name]||m.name,fields,age_ms:age,stale,observed:!!frame,invalid:!!frame&&decoded?.status==='invalid'};
    });
    return base.concat(globalThis.ByBafangBattery?.cards(snapshot,extraAge)||[],identityCard(snapshot,extraAge));
  }
  function paintWarnings(snapshot,extraAge=0){
    if(!dom?.warnings)return;
    const journal=validateWarningJournal(snapshot?.warning_journal),root=dom.warnings;root.replaceChildren();
    const info=document.createElement('p');info.className='subtle';
    if(!journal){info.textContent=tr('Журнал начнётся после подключения обновлённой страницы USB-ПК.');root.append(info);return;}
    if(!journal.events.length){info.textContent=tr('Ненулевые коды пока не получены. Это не проверка под нагрузкой.');root.append(info);return;}
    for(const event of [...journal.events].reverse()){
      const row=document.createElement('article'),title=document.createElement('strong'),state=document.createElement('span'),raw=document.createElement('small');
      row.className='fault-event';const code=event.first.data,source=parseInt(event.first.id,16)>>>24,ref=globalThis.BafangDecoder?.warningReference(parseInt(code,16));
      const name=source===2?'Контроллер':source===4?'Батарея':'Узел';
      title.textContent=tr(name)+' · 0x'+code+' · '+(ref?.v25?warningText(ref.v25):tr('Неизвестный код'));
      state.textContent=event.next?(event.next.data==='00'?tr('После ошибки получен код 00'):tr('Следующий код')+': 0x'+event.next.data):tr('Последний полученный код');
      const age=Math.max(0,event.last_age_ms+extraAge);raw.textContent='CAN '+event.first.id+' · '+tr('Повторов')+': '+event.count+' · '+Math.floor(age/1000)+' '+tr('с назад');
      row.append(title,state,raw);root.append(row);
    }
    if(journal.evicted){info.textContent=tr('Более ранние события вытеснены')+': '+journal.evicted;root.append(info);}
  }
  let local=null,remote=null,remoteAt=0,dom=null,pending=false,actionError='';
  const tr=value=>globalThis.ByI18n?.t?.(value)||value;
  const setText=(el,value)=>{value=tr(value);if(el.textContent!==value)el.textContent=value;};
  function remoteState(state){globalThis.ByReaderSelftest?.remoteState(state);globalThis.ByEspBattery?.remoteState(state);remote=state;remoteAt=performance.now();paint();}
  function bind(runtime){globalThis.ByReaderSelftest?.bind(runtime);globalThis.ByEspBattery?.bind(runtime);local=runtime;paint();}
  function source(){
    if(local?.transport?.connected)return {local:true,snapshot:local.liveData?.snapshot(local.device,true),device:local.device,connected:true,viewing:!!local.liveViewing,recording:!!local.recorder,extraAge:0,schema:local.schema,query:local.batteryQuery?.snapshot()};
    const state=remote||globalThis.ByRemoteConsole?.snapshot?.().state;
    if(state?.bridge?.kind==='stock')return {snapshot:null,connected:false,device:{},extraAge:0};
    const live=state?.control?.can_live;
    return {local:false,snapshot:live,device:state?.device||{},connected:state?.online===true&&!state?.conflict,viewing:state?.control?.live_view?.active===true,recording:state?.control?.recording===true,schema:globalThis.__canLiveSchema,query:state?.control?.battery_information,extraAge:performance.now()-remoteAt+Math.max(0,state?.age_seconds||0)*1000};
  }
  async function action(mode){
    if(pending)return;pending=true;actionError='';paint();
    try{if(local?.transport?.connected)await local.api('/api/live/'+mode,{});else{const ok=await globalThis.ByRemoteConsole?.run(mode==='start'?'live_start':'live_stop');if(!ok)throw Error('Нет подтверждения запуска. Проверьте удалённое подключение.');}await globalThis.refreshState?.();}
    catch(e){actionError=String(e.message||e);}finally{pending=false;paint();}
  }
  function paint(){
    if(!dom)return;const s=source(),schema=local?.schema||globalThis.__canLiveSchema;if(!schema)return;
    const active=s.connected&&s.snapshot?.stream_active;
    dom.badge.textContent=active?'CAN · живые данные':s.connected?'Приём остановлен':'Нет связи с ESP';dom.badge.className='chip '+(active?'good':'muted');
    dom.origin.textContent=s.local?'ESP32 · напрямую по USB / Wi-Fi':s.connected?'ESP32 · через подключённый USB-ПК':'Данные поступают только с ESP32';
    dom.mode.textContent='TRIPLE · 250 кбит/с · '+(s.recording?'идёт запись':s.viewing?'чтение без таймера':'приём остановлен');
    const remoteControl=globalThis.ByRemoteConsole?.snapshot?.(),allowed=s.local?!local.operation&&!local.ending&&!local.tuner?.active&&!local.scan?.active&&!globalThis.BySpardProbe?.active:remoteControl?.online&&!remoteControl?.busy&&remoteControl?.state?.control?.ready===true&&remoteControl?.state?.control?.busy!==true&&!['queued','accepted','started'].includes(remoteControl?.state?.pending?.state)&&remoteControl?.state?.control?.capabilities?.includes('live_view');
    dom.start.hidden=!!active;dom.stop.hidden=!s.viewing;
    dom.start.disabled=pending||!allowed||active;dom.stop.disabled=pending||!allowed||!s.viewing;
    let reason='';
    if(!s.local){
      if(!remoteControl?.active)reason='Для запуска с телефона введите ключ в блоке «Велосипед · удалённая панель» ниже.';
      else if(remoteControl.state?.bridge?.kind==='stock')reason='На USB-ПК подключён адаптер Spard. Подключите ESP32 для чтения CAN.';
      else if(!remoteControl.online)reason='Нет связи с ESP через USB-ПК. Оставьте на нём открытый сайт с подключённой ESP.';
      else if(!remoteControl.state?.control?.capabilities?.includes('live_view'))reason='На USB-ПК открыта старая версия сайта. Обновите страницу именно на компьютере с ESP; затем чтение можно запускать с телефона.';
      else if(!allowed)reason='На USB-ПК завершите текущую проверку и включите удалённое управление.';
    }
    dom.notice.textContent=actionError||reason;
    paintWarnings(s.snapshot,s.extraAge);
    const list=cards(s.snapshot?{...s.snapshot,stream_active:!!s.connected&&s.snapshot.stream_active}:null,schema,s.extraAge);
    const prefs=globalThis.ByPreferences?.snapshot?.()||{favorites:[],view:'all'},favorites=new Set(prefs.favorites),onlyFavorites=prefs.view==='favorites';
    if(dom.all){dom.all.setAttribute('aria-pressed',String(!onlyFavorites));dom.favorites.setAttribute('aria-pressed',String(onlyFavorites));setText(dom.favoriteCount,'Избрано показателей: '+favorites.size);}
    const visible=list.map(c=>({...c,fields:c.fields.filter(f=>!onlyFavorites||favorites.has(c.id+':'+f.key))})).filter(c=>c.fields.length);
    const signature=JSON.stringify(visible.map(c=>[c.id,c.fields.map(f=>f.key)]));
    if(signature!==dom.signature){
      dom.signature=signature;dom.rows=new Map();dom.grid.replaceChildren();
      for(const c of visible){const article=document.createElement('article');article.dataset.canId=c.id;
        const head=document.createElement('div'),title=document.createElement('h3'),stamp=document.createElement('span');head.className='can-live-message-heading';head.append(title,stamp);article.append(head);
        const dl=document.createElement('dl'),fields=new Map();
        for(const f of c.fields){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd'),button=document.createElement('button'),label=document.createElement('span');row.className='can-live-field';button.type='button';button.className='favorite-toggle';button.dataset.favoriteId=c.id+':'+f.key;button.addEventListener('click',()=>globalThis.ByPreferences?.toggleFavorite(button.dataset.favoriteId));dt.append(button,label);row.append(dt,dd);dl.append(row);fields.set(f.key,{row,button,label,dd});}
        article.append(dl);const id=document.createElement('small');article.append(id);dom.grid.append(article);dom.rows.set(c.id,{article,title,stamp,id,fields});
      }
      if(!visible.length){const empty=document.createElement('p');empty.className='can-live-empty';setText(empty,'Избранных показателей пока нет. Откройте «Все данные» и нажмите звезду рядом с нужным показателем.');dom.grid.append(empty);}
    }
    for(const c of visible){const row=dom.rows.get(c.id);row.article.className='can-live-message'+(c.stale?' is-stale':'');setText(row.title,c.title);setText(row.stamp,!c.observed?'Нет данных':c.age_ms<1000?'сейчас':Math.floor(c.age_ms/1000)+' с назад');setText(row.id,'CAN '+(c.source_ids?.join(' / ')||c.id)+(c.invalid?' · проверить формат':''));
      for(const f of c.fields){const cell=row.fields.get(f.key),selected=favorites.has(c.id+':'+f.key);cell.button.setAttribute('aria-pressed',String(selected));cell.button.setAttribute('aria-label',tr(selected?'Убрать из избранного':'В избранное')+': '+tr(f.name));cell.button.title=tr(selected?'Убрать из избранного':'В избранное');setText(cell.button,selected?'★':'☆');setText(cell.label,f.name);const display=f.note?'Нет показания':f.value+(f.value!=='—'&&f.unit?' '+tr(f.unit):'');setText(cell.dd,display);cell.row.classList.toggle('is-text',tr(display).length>24);cell.dd.title=f.note?tr(f.note):'';}
    }
    dom.coverage.textContent=list.filter(c=>c.observed).length+' / '+list.length+' известных сообщений';
    if(dom.raw){const known=new Set(list.flatMap(c=>[c.id,...(c.consumed_ids||[])]));const extra=(s.snapshot?.frames||[]).filter(f=>f.rtr||!known.has(f.id));dom.raw.textContent=extra.length?extra.map(f=>f.id+'  '+(f.rtr?'RTR':f.data)).join('\n'):'Дополнительных ID пока нет.';}
  }
  function mount(){const root=globalThis.document?.getElementById('canLivePanel');if(!root)return;const get=id=>document.getElementById(id);dom={root,badge:get('canLiveBadge'),origin:get('canLiveOrigin'),mode:get('canLiveMode'),start:get('canLiveStart'),stop:get('canLiveStop'),notice:get('canLiveNotice'),grid:get('canLiveGrid'),coverage:get('canLiveCoverage'),raw:get('canLiveRaw'),warnings:get('canFaultEvents'),all:get('canLiveAll'),favorites:get('canLiveFavorites'),favoriteCount:get('canLiveFavoriteCount')};dom.start.onclick=()=>action('start');dom.stop.onclick=()=>action('stop');if(dom.all){dom.all.onclick=()=>globalThis.ByPreferences?.update({view:'all'});dom.favorites.onclick=()=>globalThis.ByPreferences?.update({view:'favorites'});}globalThis.addEventListener?.('citybike-preferences',e=>{if(dom.language!==e.detail.language)dom.signature=null;dom.language=e.detail.language;paint();});setInterval(paint,500);paint();}
  globalThis.ByCanLive={WarningJournal,warningFrame,validateWarningJournal,WARNING_LIMIT,IdentityAssembler,validateIdentity,interpretIdentity,Cache,cards,valid,LIMIT,bind,remoteState,paint,source};
  if(typeof module!=='undefined')module.exports=globalThis.ByCanLive;
  if(globalThis.document){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();}
})();

;
/* Bounded CAN packet assembly only. Never opens a port or transmits a frame. */
'use strict';
(function(root){
 const MAX_GAP_US=100000,MAX_FRAGMENTS=255,MAX_DIAGNOSTICS=16;
 const header=b=>b.length>=3&&b[0]===0x68&&b[1]>=6&&(b[1]^b[2])===255;
 const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
 const bytes=s=>Uint8Array.from(s.match(/../g)||[],x=>parseInt(x,16));
 const safe=x=>Number.isSafeInteger(x)&&x>=0;
 class Assembler{
  constructor(){this.pending=null;this.scope=null;this.previousSeq=null;this.events=[];this.diagnostics=[];this.counts={valid:0,incomplete:0,invalid:0,orphan:0};}
  note(reason,f){this.diagnostics.push({reason,seq:f?.seq??null});if(this.diagnostics.length>MAX_DIAGNOSTICS)this.diagnostics.shift();}
  close(reason,boundary=true){
   if(!this.pending)return;
   const p=this.pending;this.pending=null;const raw=Uint8Array.from(p.data),declared=raw[1],whole=raw.length===declared;
   let xor=0;for(let i=0;i<raw.length-2;i++)xor^=raw[i];
   const valid=whole&&raw[raw.length-1]===0x16&&xor===raw[raw.length-2];
   this.counts[valid?'valid':whole?'invalid':'incomplete']++;
   this.events.push({status:valid?'checksum_valid':whole?'complete_unverified':'incomplete',reason,declared_length:declared,observed_length:raw.length,raw_hex:hex(raw),xor_valid:valid,command:raw.length>3?raw[3]:null,boot:p.frames[0].boot,epoch:p.frames[0].epoch,first_seq:p.frames[0].seq,last_seq:p.frames.at(-1).seq,t_us:p.frames.at(-1).t_us,fragments:p.frames.length,direction:'unknown_shared_can_id'});
   if(!valid){
    // A legitimate binary payload may contain another header. Recover only
    // after the outer packet fails, never pre-empt a valid outer packet.
    const next=p.frames.findIndex((f,i)=>i>0&&header(bytes(f.data)));
    if(next>0){for(const f of p.frames.slice(next))this.payload(f);if(boundary&&this.pending)this.close(reason);}
   }
  }
  payload(f){
   const b=bytes(f.data);
   if(!this.pending){if(!header(b)){this.counts.orphan++;this.note('orphan_fragment',f);return;}this.pending={data:[],frames:[]};}
   const p=this.pending;
   if(p.frames.length>=MAX_FRAGMENTS){this.close('fragment_limit');return;}
   p.data.push(...b);p.frames.push({boot:f.boot,epoch:f.epoch,seq:f.seq,t_us:f.t_us,data:f.data});
   if(p.data.length>=p.data[1])this.close(p.data.length===p.data[1]?'declared_length_reached':'length_overrun',false);
  }
  feed(f){
   this.events=[];
   if(!f||f.type!=='frame')return [];
   if(typeof f.boot!=='string'||!/^[A-F0-9]{8}$/.test(f.boot)||![f.epoch,f.seq,f.t_us].every(safe)||typeof f.id!=='string'||!/^[A-Fa-f0-9]{1,8}$/.test(f.id)||typeof f.extended!=='boolean'||typeof f.rtr!=='boolean'||!Number.isInteger(f.dlc)||f.dlc<0||f.dlc>8||typeof f.data!=='string'||!/^(?:[A-Fa-f0-9]{2})*$/.test(f.data)||f.data.length!==(f.rtr?0:f.dlc*2)||parseInt(f.id,16)>=(f.extended?0x20000000:0x800)){
    this.close('invalid_frame');this.note('invalid_frame',f);return this.events;
   }
   const scope=f.boot+':'+f.epoch;
   if(scope!==this.scope){this.close('scope_changed');this.scope=scope;this.previousSeq=null;}
   if(this.previousSeq!==null){
    if(f.seq<=this.previousSeq){this.close('duplicate_or_reordered_frame');this.note('duplicate_or_reordered_frame',f);return this.events;}
    if(f.seq!==this.previousSeq+1)this.close('saved_sequence_gap');
   }
   this.previousSeq=f.seq;
   if(parseInt(f.id,16)!==0x666||f.extended||f.rtr)return this.events;
   if(f.dlc===0){this.close('empty_fragment');this.note('empty_fragment',f);return this.events;}
   if(this.pending){const delta=f.t_us-this.pending.frames.at(-1).t_us;if(delta<0||delta>MAX_GAP_US)this.close('timeout_or_clock_reset');}
   this.payload(f);return this.events;
  }
  finish(reason='capture_ended'){this.events=[];this.close(reason);return this.events;}
 }
 root.BySpardCan={Assembler,MAX_GAP_US,MAX_FRAGMENTS,MAX_DIAGNOSTICS};
 if(typeof module!=='undefined')module.exports=root.BySpardCan;
})(typeof globalThis!=='undefined'?globalThis:this);

;
/* Offline stock Spard Information decoding. No serial/CAN I/O or commands. */
(function(root){
  'use strict';
  const SCHEMA=1,DECODER_VERSION='spard-information-1',PACKET_LENGTH=90;
  const EVIDENCE={
    schema:SCHEMA,decoder_version:DECODER_VERSION,
    basis:'static_stock_exe_parser_and_three_complete_checksum_valid_adapter_replies',
    parser:'BaseInfoParser@0x41A358',
    framing:['Get_Data@0x416971-0x416AB8','SocCalcXor@0x57D4B8-0x57D539'],
    cell_count:'0x41A3B4-0x41A3E7: byte71 -> CellNum',
    cells_mv:'0x41A3ED-0x41A499: LE16 slots at4+2*i, active count at71',
    cell_sum_mv:'0x41A490-0x41A49C: calculated sum of active cells, not an independent pack measurement',
    temperatures_c:'0x41ABA0-0x41AD7E: signed bytes36..38; Celsius UI labels',
    design_capacity_mah:'0x41AD86-0x41ADFC: LE16@39 x10; mAh UI label@0x4B49F6',
    full_charge_capacity_mah:'0x41AE02-0x41AE70: LE16@41 x10; stock local truncates to16bits',
    remaining_capacity_mah:'0x41AE74-0x41AF14: LE16@43 x10; mAh UI label@0x4B47C2',
    soc_percent:'0x41B012-0x41B10D: LE16@45 -> progressBar_SOC, no scale',
    current_ma:'0x41B1CC-0x41B31B: signed LE32@47; mA UI label@0x4C0F47',
    cycle_count:'0x41B323-0x41B40C: LE16@51 -> CycleCount',
    balance_mask:'0x41B414-0x41B47F: LE16@53; bit names unassigned',
    firmware_version:'0x41B733-0x41B7F9: signed byte55, hexadecimal text, dot inserted at1; 0x24 ->2.4',
    device_id_raw:'0x41B486-0x41B557: LE32@56 -> Idcode',
    allow_sleep_delay_raw:'0x41B55D-0x41B5C8: LE16@60 -> DelayForSleep; unit unknown',
    battery_status_bytes:'0x41BA87-0x41BB2C: raw bytes62..64; individual bit meanings not decoded',
    pack_status_raw:'0x41BB32-0x41BBCF: LE16@65 -> Pack_Status; individual bit meanings not decoded',
    soh_percent:'0x41B608-0x41B676 and0x41B946-0x41BA82: wire byte72; zero has a separate derived stock fallback',
    battery_address_raw:'0x41B5CF-0x41B602: byte73 -> Bat_Addr',
    rtc_components:'0x41BC6D-0x41C04B: year=2018+byte74; unsigned bytes75..79; clock/timezone unverified',
    maximum_charging_interval_raw:'0x41C2A7-0x41C369: LE16@80; unit unknown',
    secondary_voltage_mv:'0x41C466-0x41C4D1: LE16@82; mV UI label@0x4B4CC3',
    secondary_current_ma:'0x41C4D8-0x41C543 and0x41C629-0x41C6D4: signed LE16@84; mA UI label@0x4B4C65',
    secondary_temperature_c:'0x41C54A-0x41C5CD: trunc(signed16(LE16@86-2731)/10); stock blank if -273',
    unknown_payload:'bytes67..70 retained as raw without an assigned meaning',
    stock_parser_conflict:'0x41C37E-0x41C3E1 reads88..89 as charging interval, but these are XOR/footer in a90-byte packet; omitted'
  };
  const toHex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
  const s16=value=>(value&32768)?value-65536:value;
  function decode(input){
    const result={schema:SCHEMA,decoder_version:DECODER_VERSION,status:'invalid',validated_packet:false,
      checksum_valid:false,fields:{},evidence:JSON.parse(JSON.stringify(EVIDENCE)),warnings:[]};
    let raw;
    if(typeof input==='string'){
      if(!/^(?:[0-9a-fA-F]{2})*$/.test(input))return {...result,reason:'invalid_hex',raw_hex:null};
      raw=Uint8Array.from(input.match(/../g)||[],x=>parseInt(x,16));
    }else if(input instanceof Uint8Array||Object.prototype.toString.call(input)==='[object Uint8Array]'){
      raw=new Uint8Array(input);
    }else return {...result,reason:'bytes_required',raw_hex:null};
    result.raw_hex=toHex(raw);
    if(raw.length!==PACKET_LENGTH)return {...result,reason:'information_packet_must_be_exactly_90_bytes'};
    if(raw[0]!==0x68||raw[89]!==0x16)return {...result,reason:'invalid_header_or_footer'};
    if(raw[1]!==raw.length||raw[2]!==((raw[1]^255)&255))return {...result,reason:'invalid_length_or_complement'};
    let checksum=0;for(let i=0;i<raw.length-2;i++)checksum^=raw[i];
    if(checksum!==raw[88])return {...result,reason:'invalid_xor_checksum'};
    result.validated_packet=result.checksum_valid=true;
    if(raw[3]!==0)return {...result,reason:'not_information_command'};
    const count=raw[71];
    if(count<1||count>16)return {...result,reason:'cell_count_outside_stock_16_slot_layout'};
    const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),u16=offset=>view.getUint16(offset,true);
    const cells=Array.from({length:count},(_,i)=>u16(4+2*i));
    const temperatures=[36,37,38].map(offset=>view.getInt8(offset));
    const fullCapacity=u16(41)*10,secondaryTemp=Math.trunc(s16((u16(86)-2731)&65535)/10)||0;
    const versionHex=raw[55]<128?raw[55].toString(16):null;
    const firmware=versionHex===null?null:versionHex.slice(0,1)+'.'+versionHex.slice(1);
    const fields={
      cell_count:count,cells_mv:cells,cell_sum_mv:cells.reduce((sum,value)=>sum+value,0),
      min_cell_mv:Math.min(...cells),max_cell_mv:Math.max(...cells),delta_cell_mv:Math.max(...cells)-Math.min(...cells),
      temperatures_c:temperatures,design_capacity_mah:u16(39)*10,full_charge_capacity_mah:fullCapacity,
      remaining_capacity_mah:u16(43)*10,soc_percent:u16(45),current_ma:view.getInt32(47,true),
      cycle_count:u16(51),balance_mask:u16(53),firmware_version:firmware,firmware_version_raw:raw[55],
      device_id_raw:view.getUint32(56,true),allow_sleep_delay_raw:u16(60),
      battery_status_bytes:Array.from(raw.slice(62,65)),pack_status_raw:u16(65),soh_percent:raw[72],battery_address_raw:raw[73],
      rtc_components:{year:2018+raw[74],month:raw[75],day:raw[76],hour:raw[77],minute:raw[78],second:raw[79]},
      maximum_charging_interval_raw:u16(80),secondary_voltage_mv:u16(82),secondary_current_ma:view.getInt16(84,true),
      secondary_temperature_c:secondaryTemp===-273?null:secondaryTemp,secondary_temperature_raw:u16(86)
    };
    const derived={cell_sum_mv:'sum_of_reported_cells_not_separately_measured_pack_voltage'};
    if(raw[72]===0&&fields.design_capacity_mah!==0){
      derived.stock_soh_display_percent=(fullCapacity&65535)/fields.design_capacity_mah*100;
      result.warnings.push('stock_soh_fallback_is_derived_not_reported_soh');
    }
    if(fullCapacity>65535){
      derived.stock_full_charge_capacity_display_mah=fullCapacity&65535;
      result.warnings.push('stock_full_charge_capacity_ui_truncates_to_16_bits');
    }
    if(secondaryTemp===-273)result.warnings.push('secondary_temperature_blank_in_stock_ui');
    if(firmware===null)result.warnings.push('signed_char_firmware_format_not_interpreted');
    if(fields.soc_percent>100||fields.soh_percent>100)result.warnings.push('reported_percentage_outside_0_to_100_retained_raw');
    return {...result,status:'decoded',command:0,fields,derived,
      unknown_ranges:[{offset:67,length:4,raw_hex:toHex(raw.slice(67,71))}],
      limitations:['Stock parser layout confirmed; physical calibration is not independently established.',
        'Serial adapter packets are not a raw CAN log; no CAN ID or sender is inferred.',
        'Current charge/discharge polarity and individual status-bit meanings remain unconfirmed.',
        'RTC components are reported by the BMS, without a verified timezone or clock accuracy.',
        'Bytes88/89 are framing and are never interpreted as a charging interval.']};
  }
  root.BySpardInformation={decode,SCHEMA,DECODER_VERSION};
  if(typeof module!=='undefined')module.exports={decode,SCHEMA,DECODER_VERSION};
})(typeof globalThis!=='undefined'?globalThis:this);

;
/* Local BLE controls. Browser persistence and downloads never use ESP heap. */
'use strict';
(() => {
 const tr=s=>globalThis.ByI18n?.t(s)||s,stamp=()=>new Date().toISOString();
 class ActionLog {
  constructor(clock=()=>performance.now()){this.clock=clock;this.ring=[];this.rows=[];this.active=false;this.dropped=0;this.until=0;this.dirty=false;this.error='';}
  async database(){if(!this.db)this.db=await new Promise((resolve,reject)=>{const request=indexedDB.open('citybike-offline-actions-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('recordings');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return this.db;}
  async restore(){const db=await this.database();const data=await new Promise((resolve,reject)=>{const r=db.transaction('recordings').objectStore('recordings').get('latest');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(!this.active&&!this.rows.length&&Array.isArray(data?.rows)&&data.rows.length<=8192){this.rows=data.rows;this.dropped=data.dropped||0;}}
  add(row){if(this.rows.length<8192)this.rows.push(row);else this.dropped++;this.dirty=true;}
  feed(frame){const at=this.clock();this.ring.push({at,frame});while(this.ring.length>512||this.ring[0]?.at<at-3000)this.ring.shift();if(this.active)this.add(frame);}
  mark(action,data={}){this.add({type:'remote_action',action,host_utc:stamp(),...data});}
  async begin(button,boot){if(!this.active){this.rows=[{type:'metadata',kind:'offline_ble_can_window',boot,pre_trigger_ms:3000,button,timestamps:'CAN t_us is native uptime; action host_utc is browser time; ack_t_us is native command completion, not bike execution'} ,...this.ring.filter(x=>this.clock()-x.at<=3000).map(x=>x.frame)];this.dropped=0;this.active=true;}this.until=Infinity;this.mark('press_requested',{button,boot});await this.flush();}
  released(button){if(this.active)this.until=this.clock()+(button===3?30000:3000);}
  async flush(){if(this.writing)await this.writing;if(!this.dirty)return;this.dirty=false;this.writing=(async()=>{const db=await this.database();await new Promise((resolve,reject)=>{const tx=db.transaction('recordings','readwrite');tx.objectStore('recordings').put({rows:this.rows,dropped:this.dropped},'latest');tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('CAN log storage failed'));});})();try{await this.writing;}catch(e){this.error=String(e.message||e);this.dirty=true;throw e;}finally{this.writing=null;}}
  async tick(){if(this.active&&this.clock()>=this.until){this.mark('window_end');this.active=false;}await this.flush();}
  download(){const data=this.rows.concat({type:'summary',dropped_rows:this.dropped,incomplete:this.dropped>0,active:this.active});return new Blob([data.map(row=>JSON.stringify(row)).join('\n')+'\n'],{type:'application/x-ndjson'});}
 }
 class Remote {
  constructor(reader,{log=new ActionLog(reader.clock)}={}){this.r=reader;this.log=log;this.seq=0;this.armed=false;this.held=null;this.error='';this.lastAlive=-Infinity;this.busy=false;this.generation=0;}
  supported(){return this.r.device.capabilities?.includes('ble_remote_wifi_v1');}
  async call(action,extra={},valid=()=>true){const boot=this.r.device.boot,session=this.r.session,created=this.r.clock();return this.r.serial(async()=>{
   if(!valid()||this.r.device.boot!==boot||this.r.session!==session||(['down','keep','alive'].includes(action)&&this.r.clock()-created>650))return {skipped:true};
   return this.r.rawRequest('/api/remote',{action,boot,seq:++this.seq,...extra},{timeout:800});
  });}
  async on(){if(this.enabling||this.armed)return;this.enabling=true;const generation=this.generation,valid=()=>generation===this.generation&&!this.r.closed&&!globalThis.document?.hidden;
   try{await this.r.refresh();if(!valid())return;if(!this.supported())throw Error('Обновите прошивку для пульта по Wi-Fi');if(this.r.device.can!=='running')await this.r.api('/api/live/start');if(!valid()){this.r.release();return;}
    const result=await this.call('on',{},valid);if(result.skipped)return;await this.r.refresh();if(!valid()){this.r.release();return;}if(!this.r.device.ble_remote?.enabled)throw Error('Пульт не включился');this.armed=true;this.lastAlive=this.r.clock();this.error='';
   }finally{this.enabling=false;}}
  async off(){this.generation++;const h=this.held;this.held=null;const was=this.armed;this.armed=false;if(h){this.log.mark('release_requested',{button:h.button});this.log.released(h.button);}if(was||this.enabling)await this.call('off');await this.r.refresh();}
  async down(button,confirmed=false){
   const ble=this.r.device.ble_remote;if(!this.armed||this.held||!ble?.connected||!ble?.subscribed||this.r.device.can!=='running')throw Error('Дождитесь подключения велосипеда');
   if(button===3&&!confirmed)throw Error('Подтвердите выключение');
   const h=this.held={button,hold:this.r.newToken().slice(0,8),at:this.r.clock(),sent:false};
   try{await this.log.begin(button,this.r.device.boot);const result=await this.call('down',{hold:h.hold,button,...(button===3?{confirmed:true}:{})},()=>this.armed&&this.held===h&&this.r.clock()-h.at<650);
    if(result.skipped){if(this.held===h)this.held=null;this.log.released(button);throw Error('Удержание прервано. Отпустите кнопку и нажмите снова.');}else{h.sent=true;this.log.mark('press_ack',{button,ack_t_us:result.t_us,boot:this.r.device.boot});}
   }catch(e){if(this.held===h)this.held=null;this.log.released(button);throw e;}
  }
  async up(){const h=this.held;this.held=null;if(!h)return;this.log.mark('release_requested',{button:h.button});this.log.released(h.button);await this.call('up',{hold:h.hold});}
  revoke(){this.generation++;const h=this.held;this.armed=false;this.held=null;if(h){this.log.mark('release_requested',{button:h.button,reason:'controller_released'});this.log.released(h.button);}}
  async tick(){if(this.busy)return;this.busy=true;try{
   if(this.armed){const b=this.r.device.ble_remote;
    if(!this.r.transport.connected||this.r.device.can!=='running'||!b?.enabled||b.transport!=='wifi'||b.session!==this.r.session.slice(0,16)){await this.off();throw Error('Пульт остановлен. Включите его снова.');}
    if(this.held){const h=this.held;if(this.r.clock()-h.at>=30000||(h.sent&&b.button===0&&this.r.clock()-h.at>1300)){await this.up();this.error='Удержание прервано. Отпустите кнопку и нажмите снова.';}
     else if(h.sent)await this.call('keep',{hold:h.hold},()=>this.armed&&this.held===h);
    }
    if(this.armed&&this.r.clock()-this.lastAlive>=500){const result=await this.call('alive',{},()=>this.armed);if(!result.skipped)this.lastAlive=this.r.clock();}
   }
   this.log.tick().catch(e=>{this.error=String(e.message||e);if(this.armed)this.off().catch(()=>{});});
  }catch(e){this.error=String(e.message||e);this.r.release();}finally{this.busy=false;}}
 }
 function mount(r,paint){
  const get=id=>document.getElementById(id),remote=new Remote(r);r.remote=remote;remote.log.restore().catch(e=>{remote.error=String(e.message||e);paint();});
  const run=f=>Promise.resolve().then(f).catch(e=>{remote.error=String(e.message||e);}).finally(paint);
  get('offlineRemoteOn').onclick=()=>run(()=>remote.on());get('offlineRemoteOff').onclick=()=>run(()=>remote.off());
  const dialog=get('offlineRemoteConfirm');get('offlineRemotePower').onclick=()=>dialog.showModal();get('offlineRemoteCancel').onclick=()=>dialog.close();
  for(const button of document.querySelectorAll('[data-offline-key]')){
   const down=()=>run(()=>remote.down(Number(button.dataset.offlineKey),button.id==='offlineRemoteConfirmed'));
   button.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();button.setPointerCapture(e.pointerId);down();};
   button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>run(()=>remote.up());
   button.onkeydown=e=>{if([' ','Enter'].includes(e.key)&&!e.repeat){e.preventDefault();down();}};
   button.onkeyup=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();run(()=>remote.up());}};
   button.oncontextmenu=e=>e.preventDefault();
  }
  const release=()=>run(()=>remote.up());addEventListener('pointerup',release);addEventListener('pointercancel',release);addEventListener('blur',release);dialog.addEventListener('close',release);
  get('offlineRemoteDownload').onclick=()=>run(async()=>{await remote.log.flush();const url=URL.createObjectURL(remote.log.download()),a=document.createElement('a');a.href=url;a.download='CityBike-BLE-CAN-'+Date.now()+'.jsonl';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  const timer=setInterval(()=>remote.tick().finally(paint),200);addEventListener('pagehide',()=>{clearInterval(timer);remote.revoke();});return remote;
 }
 function paint(r){const get=id=>document.getElementById(id),remote=r.remote,b=r.device.ble_remote||{},valid=r.transport.connected&&remote?.supported();
  get('offlineRemoteOn').disabled=!valid||!!remote.armed||!!remote.enabling;get('offlineRemoteOff').disabled=!valid||!remote?.armed;
  const can=valid&&remote.armed&&b.connected&&b.subscribed&&r.device.can==='running';
  for(const button of document.querySelectorAll('[data-offline-key],#offlineRemotePower')){button.disabled=!can||(!!remote.held&&Number(button.dataset.offlineKey)!==remote.held.button);button.setAttribute('aria-pressed',String(!!remote.held&&Number(button.dataset.offlineKey)===remote.held.button));}
  get('offlineRemoteStatus').textContent=tr(!valid?'Пульт недоступен':!b.enabled?'Пульт выключен':b.subscribed?'BLE подключён · кнопки готовы':b.connected?'BLE подключён · ожидаю подписку':'Пульт включён · ожидаю велосипед');
  get('offlineRemoteError').textContent=tr(remote?.error||remote?.log.error||'');get('offlineRemoteDownload').disabled=!remote?.log.rows.length;
  get('offlineRemoteLog').textContent=tr(remote?.log.active?'CAN-запись: записываю действие':'CAN-лог сохраняется на этом устройстве')+(remote?.log.dropped?' · '+tr('Неполная запись')+': '+remote.log.dropped:'');
 }
 globalThis.ByOfflineRemote={ActionLog,Remote,mount,paint};if(typeof module!=='undefined')module.exports=globalThis.ByOfflineRemote;
})();

;
/* Local reader only: bounded live preview, no USB, cloud or uploads; BLE buttons use their dedicated leased endpoint. */
'use strict';
(() => {
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const now=()=>performance.now();
  const tr=s=>globalThis.ByI18n?.t(s)||s;
  const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
  class OfflineReader {
    constructor(schema,{request,clock=now,newToken=token}={}){
      this.schema=schema;this.clock=clock;this.newToken=newToken;this.session=newToken();
      this.rawRequest=request||this.http.bind(this);this.tail=Promise.resolve();
      this.request=(...args)=>this.serial(()=>this.rawRequest(...args));
      this.transport={connected:false};this.device={};this.liveData=new ByCanLive.Cache(schema,clock);this.spard=new BySpardCan.Assembler();
      this.cursor=0;this.owns=false;this.mayOwn=false;this.liveViewing=false;this.operation=false;this.lastState=-Infinity;this.lastLease=0;
      this.lost=0;this.error='';this.battery=null;this.closed=false;
    }
    serial(work){const next=this.tail.then(work);this.tail=next.catch(()=>{});return next;}
    async http(path,body,{timeout=4000}={}){
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeout);
      try{
        const response=await fetch(path,{method:body===undefined?'GET':'POST',cache:'no-store',signal:abort.signal,
          headers:body===undefined?{}:{'Content-Type':'application/json','X-Reader-UI':'1','X-Reader-Session':this.session,'X-Reader-Identity':this.device.ap_mac||''},
          body:body===undefined?undefined:JSON.stringify(body)});
        if(!response.ok)throw Error('HTTP '+response.status);
        const data=await response.json();if(data.ok===false)throw Error(data.error||'Request rejected');return data;
      }finally{clearTimeout(timer);}
    }
    setState(data){
      const d=data?.device;
      if(d?.product!=='BafangReader'||d.protocol!==1||!Number.isSafeInteger(d.epoch)||!/^[A-F0-9]{8}$/.test(d.boot||'')||! /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(d.ap_mac||''))throw Error('Неверный ответ ридера');
      const changed=this.device.boot!==d.boot||this.device.ap_mac!==d.ap_mac;
      if(changed){this.remote?.revoke();this.owns=false;this.mayOwn=false;this.session=this.newToken();this.cursor=0;this.battery=null;this.spard=new BySpardCan.Assembler();this.liveData.reset(d.boot,d.epoch);}
      else if(this.device.epoch!==d.epoch){this.cursor=0;this.battery=null;this.spard=new BySpardCan.Assembler();this.liveData.reset(d.boot,d.epoch);}
      this.device=d;this.network=data.network;this.transport.connected=true;this.lastState=this.clock();this.liveViewing=this.owns&&d.can==='running';
      if(d.can!=='running'){this.owns=false;this.mayOwn=false;this.liveViewing=false;}
      return data;
    }
    async refresh(){return this.setState(await this.request('/api/state'));}
    feed(data){
      if(data.boot!==this.device.boot||!Array.isArray(data.frames)||data.frames.length>64)return;
      this.lost+=Number.isSafeInteger(data.missed)&&data.missed>0?data.missed:0;if(data.missed&&this.remote?.log.active)this.remote.log.mark('CAN_gap',{missed:data.missed,incomplete:true});
      for(const f of data.frames){
        if(!ByCanLive.valid(f)||f.boot!==this.device.boot||f.epoch!==this.device.epoch||f.seq<=this.cursor)continue;
        this.cursor=f.seq;this.liveData.ingest(f);this.remote?.log.feed(f);
        for(const packet of this.spard.feed(f)){
          if(packet.status!=='checksum_valid'||packet.command!==0||packet.declared_length!==90)continue;
          const decoded=BySpardInformation.decode(packet.raw_hex);
          if(decoded.status==='decoded')this.battery={fields:decoded.fields,seen:this.clock(),boot:f.boot,epoch:f.epoch};
        }
      }
    }
    async tick(){
      if(this.closed||this.operation)return;
      try{
        if(this.clock()-this.lastState>=1000)await this.refresh();
        if(this.device.can==='running')this.feed(await this.request('/api/frames?after='+this.cursor));
        if(this.owns&&this.clock()-this.lastLease>=2000){await this.request('/api/lease',{token:this.session});this.lastLease=this.clock();}
        this.error='';
      }catch(e){this.error=String(e.message||e);this.transport.connected=false;this.lastState=-Infinity;}
    }
    async api(path){
      if(this.operation)throw Error('Операция уже выполняется');
      this.operation=true;
      try{
        if(path==='/api/live/start'){
          await this.refresh();if(this.device.can==='running')throw Error('CAN уже читается');
          this.mayOwn=true;
          await this.request('/api/command',{command:'START 250000'});
          this.owns=true;this.lastLease=this.clock();await this.refresh();
        }else if(path==='/api/live/stop'){
          if(!this.mayOwn)throw Error('Чтение запущено другим подключением');
          if(this.remote?.armed)await this.remote.off();
          await this.request('/api/command',{command:'STOP'});this.owns=this.mayOwn=this.liveViewing=false;await this.refresh();
        }else throw Error('Недоступная операция');
      }finally{this.operation=false;}
    }
    async saveWifi(ssid,channel){
      if(!/^[A-Za-z0-9 ._-]{1,32}$/.test(ssid)||!Number.isInteger(channel)||channel<1||channel>11)throw Error('Проверьте имя сети и канал');
      await this.refresh();if(this.device.can!=='stopped')throw Error('Сначала остановите чтение CAN');
      await this.request('/api/command',{command:'WIFI '+channel+' '+ssid});
    }
    release(){
      const remoteOwned=this.remote?.armed||this.remote?.enabling;this.remote?.revoke();
      if(this.mayOwn||remoteOwned)globalThis.navigator?.sendBeacon?.('/api/release',new Blob([JSON.stringify({token:this.session,...(remoteOwned?{remote_seq:++this.remote.seq}:{})})],{type:'text/plain'}));
      this.owns=this.mayOwn=this.liveViewing=false;
    }
  }
  globalThis.ByOfflineReader={OfflineReader};
  if(typeof module!=='undefined')module.exports=globalThis.ByOfflineReader;
  if(!globalThis.document)return;
  const get=id=>document.getElementById(id),text=(id,value)=>{get(id).textContent=tr(String(value));};
  let runtime=null,health=null,lastHealth=-Infinity,lastGrid=-Infinity;
  function facts(root,rows){root.replaceChildren();for(const [label,value]of rows){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=tr(label);dd.textContent=value;row.append(dt,dd);root.append(row);}}
  function paint(){
    const d=runtime?.device||{},connected=runtime?.transport.connected;
    text('offlineConnection',connected?'Подключено к ридеру':'Нет связи с ридером');
    text('offlineVersion',d.version||health?.version||'—');text('offlineMac',d.ap_mac||health?.ap_mac||'—');
    text('offlineHeap',(d.heap_free??health?.heap_free??'—')+' B');text('offlineError',runtime?.error||'');
    get('offlineWifiSave').disabled=!connected||d.can!=='stopped'||!!runtime?.operation;
    if(runtime?.network&&!get('offlineSsid').dataset.initialized){get('offlineSsid').value=runtime.network.saved_ssid;get('offlineChannel').value=runtime.network.saved_channel;get('offlineSsid').dataset.initialized='1';}
    text('offlineLoss','Пропуски просмотра: '+(runtime?.lost||0));
    if(runtime?.remote)ByOfflineRemote.paint(runtime);
    const b=runtime?.battery;get('offlineSpard').hidden=!b;
    if(b){
      const age=runtime.clock()-b.seen,stale=!connected||d.can!=='running'||age>5000,f=b.fields;
      get('offlineSpard').classList.toggle('is-stale',stale);text('offlineSpardAge',stale?'Последние полученные данные':'Текущие данные батареи');
      const n=new Intl.NumberFormat(ByI18n.locale(),{maximumFractionDigits:3});
      facts(get('offlineSpardFacts'),[['Сумма ячеек · расчёт',n.format(f.cell_sum_mv/1000)+' V'],['Ток',n.format(f.current_ma/1000)+' A'],['Заряд',n.format(f.soc_percent)+' %'],['Полная ёмкость',n.format(f.full_charge_capacity_mah)+' mAh'],['Остаток ёмкости',n.format(f.remaining_capacity_mah)+' mAh'],['Температура батареи',f.temperatures_c.map(v=>n.format(v)+' °C').join(' / ')],['Разброс ячеек · расчёт',n.format(f.delta_cell_mv)+' mV']]);
      get('offlineSpardCells').replaceChildren();f.cells_mv.forEach((mv,i)=>{const cell=document.createElement('span');cell.textContent=tr('Ячейка')+' '+(i+1)+': '+n.format(mv/1000)+' V';get('offlineSpardCells').append(cell);});
    }
    const active=!!connected&&d.can==='running';
    text('canLiveBadge',active?'CAN · живые данные':connected?'Приём остановлен':'Нет связи с ридером');
    text('canLiveOrigin','ESP32 · напрямую по Wi-Fi');text('canLiveMode','TRIPLE · 250 кбит/с');
    get('canLiveStart').hidden=active;get('canLiveStart').disabled=!connected||!!runtime?.operation;
    get('canLiveStop').hidden=!runtime?.owns;get('canLiveStop').disabled=!connected||!!runtime?.operation;
    if(runtime&&now()-lastGrid>=500){
      lastGrid=now();const snapshot=runtime.liveData.snapshot(d,!!connected),cards=ByCanLive.cards(snapshot,runtime.schema);
      const prefs=ByPreferences.snapshot(),favorites=new Set(prefs.favorites),grid=get('canLiveGrid');grid.replaceChildren();
      for(const card of cards){
        const fields=card.fields.filter(f=>prefs.view!=='favorites'||favorites.has(card.id+':'+f.key));if(!fields.length)continue;
        const article=document.createElement('article'),heading=document.createElement('div'),h=document.createElement('h3'),badge=document.createElement('span'),dl=document.createElement('dl');article.className='can-live-message'+(card.stale?' is-stale':'');heading.className='can-live-message-heading';h.textContent=tr(card.title);badge.textContent=tr(!card.observed?'Нет данных':card.stale?'Последние полученные данные':'Текущие данные');heading.append(h,badge);article.append(heading);
        for(const f of fields){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd'),star=document.createElement('button'),label=document.createElement('span'),key=card.id+':'+f.key;
          row.className='can-live-field';star.type='button';star.className='favorite-toggle';star.textContent=favorites.has(key)?'★':'☆';star.setAttribute('aria-label',tr('В избранное')+': '+tr(f.name));star.onclick=()=>ByPreferences.toggleFavorite(key);label.textContent=tr(f.name);dt.append(star,label);dd.textContent=f.note?tr('Нет показания'):f.value+(f.unit?' '+tr(f.unit):'');row.classList.toggle('is-text',dd.textContent.length>24);row.append(dt,dd);dl.append(row);}
        article.append(dl);grid.append(article);
      }
      text('canLiveCoverage',cards.filter(c=>c.observed).length+' / '+cards.length+' известных сообщений');
      text('canLiveFavoriteCount','Избрано показателей: '+favorites.size);get('canLiveAll').setAttribute('aria-pressed',String(prefs.view!=='favorites'));get('canLiveFavorites').setAttribute('aria-pressed',String(prefs.view==='favorites'));
      get('canLiveRaw').textContent=snapshot.frames.map(f=>f.id+'  '+(f.rtr?'RTR':f.data)).join('\n');
      const warnings=get('canFaultEvents');warnings.replaceChildren();
      for(const e of [...(snapshot.warning_journal?.events||[])].reverse()){const line=document.createElement('p'),ref=BafangDecoder.warningReference(parseInt(e.first.data,16));line.textContent='CAN '+e.first.id+' · 0x'+e.first.data+' · '+tr([...ByI18n.catalog].find(([,value])=>value.en===ref?.v25)?.[0]||'Неизвестный код')+' · ×'+e.count+(e.next?' · '+tr(e.next.data==='00'?'После ошибки получен код 00':'Следующий код'):'');warnings.append(line);}
      if(!warnings.children.length)warnings.textContent=tr('Ненулевые коды пока не получены. Это не проверка под нагрузкой.');
    }
  }
  async function mount(){
    const action=async mode=>{try{await runtime.api('/api/live/'+mode);text('canLiveNotice','');}catch(e){text('canLiveNotice',e.message);}finally{paint();}};
    get('canLiveStart').onclick=()=>action('start');get('canLiveStop').onclick=()=>action('stop');
    get('canLiveAll').onclick=()=>ByPreferences.update({view:'all'});get('canLiveFavorites').onclick=()=>ByPreferences.update({view:'favorites'});
    get('offlineWifiForm').addEventListener('submit',async e=>{e.preventDefault();try{await runtime.saveWifi(get('offlineSsid').value,Number(get('offlineChannel').value));text('offlineWifiResult','Сохранено. Применится после перезапуска питания.');}catch(e){text('offlineWifiResult',e.message);}});
    try{
      const response=await fetch('/decoder_reference.json',{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);const schema=await response.json();
      runtime=new OfflineReader(schema);ByOfflineRemote.mount(runtime,paint);
      addEventListener('pagehide',()=>{runtime.closed=true;runtime.release();});
      document.addEventListener('visibilitychange',()=>{if(document.hidden)runtime.release();});
      addEventListener('citybike-preferences',()=>{lastGrid=-Infinity;paint();});
      while(!runtime.closed){
        if(now()-lastHealth>5000){try{health=await runtime.request('/api/health');}catch{}lastHealth=now();}
        await runtime.tick();paint();await pause(150);
      }
    }catch(e){text('offlineError',e.message);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
