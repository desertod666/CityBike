/* UI text only. Protocol payloads, passwords and user-entered values are excluded. */
'use strict';
(() => {
  const rows=String.raw`Текущие данные батареи	Current battery data	Gjeldende batteridata
Флаги / DLC	Flags / DLC	Flagg / DLC
Длина DATA	DATA length	DATA-lengde
Объект колеса V2.5 требует 6 байт	The V2.5 wheel object requires 6 bytes	Hjulobjektet i V2.5 krever 6 byte
Длина / флаги SYM	SYM length / flags	SYM-lengde / flagg
Неподдерживаемое поле SYM; сырые данные сохранены	Unsupported SYM field; raw data retained	SYM-feltet støttes ikke; rådata er beholdt
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
