export interface TkDirectoryItem {
  number: string
  format: "ГМ" | "СМ"
  address: string
  city: string
  reconstruction?: boolean
}

export const CITIES = [
  "Санкт-Петербург",
  "Москва",
  "Новосибирск",
  "Екатеринбург",
  "Уфа",
  "Казань",
  "Красноярск",
  "Нижний Новгород",
  "Самара",
  "Краснодар",
  "Ростов-на-Дону",
  "Саратов",
]

export const TK_QUOTAS = {
  TOTAL_MAX: 180,
  PAID_MAX: 125,
  FREE_MAX: 55,
}

export const DURATION_THRESHOLDS = {
  GREEN_MAX: 179,
  YELLOW_MAX: 239,
  ORANGE_MAX: 299,
}

export const MASTER_TK_LIST: TkDirectoryItem[] = [
  { number: "2", format: "ГМ", address: "Савушкина ул., д. 112 лит. Б", city: "Санкт-Петербург" },
  { number: "3", format: "ГМ", address: "Шереметьевская ул, д.11, лит.А", city: "Санкт-Петербург" },
  { number: "4", format: "ГМ", address: "Бухарестская ул., д. 69, лит. А", city: "Санкт-Петербург" },
  { number: "5", format: "ГМ", address: "Выборгское ш., д.11 Литера А", city: "Санкт-Петербург" },
  { number: "6", format: "ГМ", address: "Таллинское ш., д. 159,  лит. А", city: "Санкт-Петербург" },
  { number: "7", format: "ГМ", address: "Дальневосточный пр., д. 16, кор. 1, лит.А", city: "Санкт-Петербург" },
  { number: "8", format: "ГМ", address: "Московское ш., д. 16 лит. А", city: "Санкт-Петербург" },
  { number: "9", format: "ГМ", address: "Уральская ул., д.29, кор.1, лит. А", city: "Санкт-Петербург" },
  { number: "10", format: "ГМ", address: "Обводного канала наб., д. 118, кор. 7 лит.А", city: "Санкт-Петербург" },
  { number: "11", format: "ГМ", address: "Руставели ул., д. 61 лит. А", city: "Санкт-Петербург" },
  { number: "12", format: "ГМ", address: "Хасанская ул.,  д.17, кор.1, лит.А", city: "Санкт-Петербург" },
  { number: "13", format: "ГМ", address: "Вербная ул., д. 21 лит. А", city: "Санкт-Петербург" },
  { number: "15", format: "ГМ", address: "п. Парголово, Выборгское ш., д. 216, кор. 1 лит. А", city: "Санкт-Петербург" },
  { number: "17", format: "ГМ", address: "Петергофское ш., д.98 лит А", city: "Санкт-Петербург" },
  { number: "18", format: "ГМ", address: "Бабушкина ул., д. 125А", city: "Санкт-Петербург" },
  { number: "19", format: "ГМ", address: "Обуховской  Обороны пр, д.305, лит А", city: "Санкт-Петербург" },
  { number: "20", format: "ГМ", address: "п. Тельмана, д. 2б, литА", city: "Санкт-Петербург" },
  { number: "27", format: "ГМ", address: "г.Балашиха, Энтузиастов ш., д.80", city: "Москва" },
  { number: "29", format: "ГМ", address: "Борисовские пруды ул., д.26, к.2", city: "Москва" },
  { number: "30", format: "ГМ", address: "Сипайловская ул., д. 1", city: "Уфа" },
  { number: "38", format: "ГМ", address: "Восточный обход, д 19", city: "Краснодар" },
  { number: "39", format: "ГМ", address: "Российская ул. д 257", city: "Краснодар" },
  { number: "45", format: "ГМ", address: "Доватора ул., д. 267", city: "Ростов-на-Дону" },
  { number: "48", format: "ГМ", address: "г. Кудрово, Строителей пр. , стр.7", city: "Санкт-Петербург" },
  { number: "49", format: "ГМ", address: "Лиговский пр, д.283, лит.А", city: "Санкт-Петербург" },
  { number: "51", format: "ГМ", address: "Родионова ул., д. 200", city: "Нижний Новгород" },
  { number: "54", format: "ГМ", address: "Московское ш., д. 30 В", city: "Нижний Новгород" },
  { number: "57", format: "ГМ", address: "Бельская ул., д. 70", city: "Уфа" },
  { number: "58", format: "ГМ", address: "Комиссара Габишева ул., д. 32", city: "Казань" },
  { number: "59", format: "ГМ", address: "п. Зональный, Молодежная ул., д. 2а", city: "Саратов" },
  { number: "71", format: "ГМ", address: "Гусинобродское ш., д. 64", city: "Новосибирск" },
  { number: "72", format: "ГМ", address: "Энергетиков пр., д. 9", city: "Новосибирск" },
  { number: "73", format: "ГМ", address: "Большевистская ул., д. 52/1", city: "Новосибирск" },
  { number: "77", format: "ГМ", address: "Кирзаводская ул., д 1а", city: "Новосибирск" },
  { number: "80", format: "ГМ", address: "Петухова ул., д.73", city: "Новосибирск" },
  { number: "95", format: "ГМ", address: "ул. Мясниковой, д.29", city: "Новосибирск" },
  { number: "116", format: "ГМ", address: "Елино, Ленинградское ш., стр. 20/2", city: "Москва" },
  { number: "124", format: "ГМ", address: "ул. 7-я Кожуховская д. 9", city: "Москва" },
  { number: "128", format: "ГМ", address: "г.Балашиха, мкр. Саввино, ул.Пригородная, стр 90", city: "Москва" },
  { number: "150", format: "ГМ", address: "Тарасовка, ул. Большая Тарасовская, СТР.6", city: "Москва" },
  { number: "164", format: "ГМ", address: "ул. Физкультурная, д.141", city: "Самара" },
  { number: "166", format: "ГМ", address: "ул. им. Блинова Ф.А., д. 50", city: "Саратов" },
  { number: "173", format: "ГМ", address: "Бердское шоссе, 2", city: "Новосибирск" },
  { number: "179", format: "ГМ", address: "ул. Западный Обход д.29", city: "Краснодар" },
  { number: "182", format: "ГМ", address: "г.Москва Ленинский пр., 123 В", city: "Москва" },
  { number: "183", format: "ГМ", address: "п. Воскресенское, Чечёрский пр-зд, д. 51", city: "Москва" },
  { number: "185", format: "ГМ", address: "Московское шоссе, д. 205", city: "Самара" },
  { number: "191", format: "ГМ", address: "ул. 14-я линия, 84", city: "Ростов-на-Дону" },
  { number: "196", format: "ГМ", address: "Домодедово, ул. Кирова, стр. 28", city: "Москва" },
  { number: "200", format: "ГМ", address: "ул. Бакалинская, д. 27", city: "Уфа" },
  { number: "201", format: "ГМ", address: "г. Видное, ул. Старо-Нагорная, д.20", city: "Москва" },
  { number: "202", format: "ГМ", address: "ул. Пархоменко, д.156", city: "Уфа" },
  { number: "203", format: "ГМ", address: "дублер Сибирского тракта 19,1", city: "Екатеринбург" },
  { number: "208", format: "ГМ", address: "г. Нижний Новгород, ул. Ореховская д. 15, кор. 1", city: "Нижний Новгород" },
  { number: "210", format: "ГМ", address: "Брантовская дорога д 3", city: "Санкт-Петербург" },
  { number: "214", format: "ГМ", address: "п. Бугры ул. Южная стр. 5", city: "Санкт-Петербург" },
  { number: "216", format: "ГМ", address: "ул.Восстановления д 17, стр. 1", city: "Санкт-Петербург" },
  { number: "217", format: "ГМ", address: "ул . Аэродромная, д. 47А", city: "Самара" },
  { number: "219", format: "ГМ", address: "ул. Адоратского, д.21А, 2", city: "Казань" },
  { number: "220", format: "ГМ", address: "ул. Копылова, д1 Б", city: "Казань" },
  { number: "221", format: "ГМ", address: "Р. Зорге ул. , 11Б", city: "Казань" },
  { number: "225", format: "ГМ", address: "ул. Ферина, 29", city: "Уфа" },
  { number: "227", format: "ГМ", address: "ул. Пр-т Академика Сахарова, д.107/1", city: "Екатеринбург" },
  { number: "228", format: "ГМ", address: "пр. Космонавтов, 1В/1", city: "Екатеринбург" },
  { number: "229", format: "ГМ", address: "Ул. 22 Партъезда, строение 2", city: "Екатеринбург" },
  { number: "230", format: "ГМ", address: "Ул. Таганская, д.60 А", city: "Екатеринбург" },
  { number: "238", format: "ГМ", address: "ул.Закиева,10", city: "Казань" },
  { number: "241", format: "ГМ", address: "ул. Красноармейская, 131", city: "Самара" },
  { number: "246", format: "ГМ", address: "Луховицы, ул Пушкина д 125, лит.Б", city: "Москва" },
  { number: "264", format: "ГМ", address: "Петергоф, Гостилицкое ш 58 лит А", city: "Санкт-Петербург" },
  { number: "265", format: "ГМ", address: "ул.Парашютная,60 лит.А", city: "Санкт-Петербург" },
  { number: "266", format: "ГМ", address: "Шуваловский пр-т, 45, лит.А", city: "Санкт-Петербург" },
  { number: "267", format: "ГМ", address: "Пискаревский пр-т., д. 59,  лит. А", city: "Санкт-Петербург" },
  { number: "268", format: "ГМ", address: "ул. Планерная д. 17 литера. А", city: "Санкт-Петербург" },
  { number: "271", format: "ГМ", address: "ул.Симонова, д.13, к.2 лит А", city: "Санкт-Петербург" },
  { number: "272", format: "ГМ", address: "Урхов пер., дом 7, лит. А", city: "Санкт-Петербург" },
  { number: "273", format: "ГМ", address: "пр. Ю.Гагарина 34 корпус 2 литера Б", city: "Санкт-Петербург" },
  { number: "286", format: "ГМ", address: "ул.Верхняя д.17", city: "Саратов" },
  { number: "291", format: "ГМ", address: "ул. Бибиревская, д.10, корп.2.", city: "Москва" },
  { number: "292", format: "ГМ", address: "п.Московский, МКАД 47км, ВЛД.31, СТР.1, лит А", city: "Москва" },
  { number: "293", format: "ГМ", address: "Дмитровское шоссе, д. 116", city: "Москва" },
  { number: "294", format: "ГМ", address: "ул. Коминтерна 11", city: "Нижний Новгород" },
  { number: "296", format: "ГМ", address: "Ореховый бульвар 22 а", city: "Москва" },
  { number: "298", format: "ГМ", address: "г. Реутов, 2-й км МКАД, д. 2", city: "Москва" },
  { number: "299", format: "ГМ", address: "пр. Михаила Нагибина 17", city: "Ростов-на-Дону" },
  { number: "302", format: "ГМ", address: "ул Черемушкинская, д 1  Б", city: "Москва" },
  { number: "304", format: "ГМ", address: "Ярославское ш., д.54", city: "Москва" },
  { number: "316", format: "ГМ", address: "Девяткино, Главная ул., д. 60, лит.А", city: "Санкт-Петербург" },
  { number: "318", format: "ГМ", address: "ул. Коллонтай, 10 лит. А Ч.П.1-Н", city: "Санкт-Петербург" },
  { number: "319", format: "ГМ", address: "п. Шушары, Колпинское ш. 32, стр. 1 Славянка", city: "Санкт-Петербург" },
  { number: "87", format: "ГМ", address: "9 Мая ул., д.62", city: "Красноярск" },
  { number: "140", format: "ГМ", address: "ул. Дмитрия Мартынова, 12", city: "Красноярск" },
  { number: "153", format: "ГМ", address: "ул.Ястынская, 19Д", city: "Красноярск" },
  { number: "223", format: "ГМ", address: "Ул. Свердловская, д.73", city: "Красноярск" },
  { number: "247", format: "ГМ", address: "ул. Мичурина, д. 77", city: "Красноярск" },
  { number: "601", format: "СМ", address: "г. Москва, ул. Останкинская 1-я, д. 55", city: "Москва" },
  { number: "603", format: "СМ", address: "г. Орехово-Зуево, ул. Ленина, д. 44 А", city: "Москва" },
  { number: "605", format: "СМ", address: "г. Москва, ул.Твардовского, д. 2 корп. 1 стр. 4", city: "Москва" },
  { number: "606", format: "СМ", address: "г. Москва, ул. Ивана Франко, д. 38 корп. 1", city: "Москва" },
  { number: "607", format: "СМ", address: "г. Москва, ул.Тушинская, д. 17", city: "Москва", reconstruction: true },
  { number: "608", format: "СМ", address: "г. Реутов, Юбилейный проспект, д. 2 А", city: "Москва", reconstruction: true },
  { number: "609", format: "СМ", address: "г. Егорьевск, ул. Советская, д. 4 стр. 4", city: "Москва" },
  { number: "616", format: "СМ", address: "г. Балашиха, мкр. Заря, ул. Гагарина, д. 7/4", city: "Москва" },
  { number: "621", format: "СМ", address: "г. Ногинск, ул. Ильича, ПР 1,6", city: "Москва", reconstruction: true },
  { number: "623", format: "СМ", address: "г. Мытищи, ул. 1ая Пролетарская, д. 12 Б", city: "Москва" },
  { number: "625", format: "СМ", address: "г. Балашиха, ул. Свердлова, д. 20/1", city: "Москва" },
  { number: "626", format: "СМ", address: "г. Москва, пр-т Буденного, д. 18 Б", city: "Москва" },
  { number: "627", format: "СМ", address: "г. Одинцово, ул.  Говорова, д. 24 Б", city: "Москва" },
  { number: "628", format: "СМ", address: "г. Красногорск, Ильинское шоссе, д. 14 к.1", city: "Москва" },
  { number: "630", format: "СМ", address: "г.Серпухов ул.Ворошилова 139а", city: "Москва" },
  { number: "632", format: "СМ", address: "г. Мытищи, ул. 3-я Крестьянская, д. 23", city: "Москва", reconstruction: true },
  { number: "636", format: "СМ", address: "Рузский р-н, п.Тучково, ул.Партизан, д.6", city: "Москва" },
  { number: "639", format: "СМ", address: "Можайское шоссе,39", city: "Москва" },
  { number: "642", format: "СМ", address: "г. Наро-Фоминск, рп Селятино, ул. Больничная д 10 А", city: "Москва" },
  { number: "643", format: "СМ", address: "г. Апрелевка, ул. Августовская  дом, 14", city: "Москва" },
  { number: "647", format: "СМ", address: "г. Королев, ул. Пионерская, 19  к.3", city: "Москва" },
  { number: "648", format: "СМ", address: "г. Долгопрудный. ул. Московская, 58 корп 2", city: "Москва" },
  { number: "649", format: "СМ", address: "г. Люберцы, ул. 3-е почтовое отделение  53 А", city: "Москва" },
  { number: "651", format: "СМ", address: "ул. Сокольническая площадь д 4 корп 1 /2", city: "Москва" },
  { number: "656", format: "СМ", address: "г.Москва, Чонгарский бульвар, д.7", city: "Москва" },
  { number: "660", format: "СМ", address: "г.Одинцово ул. Можайское шоссе д 1А", city: "Москва" },
  { number: "661", format: "СМ", address: "г. Видное, ул. Березовая, д. 1А", city: "Москва" },
  { number: "664", format: "СМ", address: "д. Лопатино, ул. Солнечный бульвар д 2", city: "Москва" },
  { number: "665", format: "СМ", address: "г. Долгопрудный, ул. Лихачевский проспект д 64", city: "Москва" },
  { number: "667", format: "СМ", address: "г. Красногорск, рп Нахабино, ул. Школьная, д. 2 стр. 1", city: "Москва" },
  { number: "669", format: "СМ", address: "г. Балашиха, шоссе Энтузиастов, вл. 11 стр. 4", city: "Москва" },
  { number: "670", format: "СМ", address: "г. Одинцово, поселок Трехгорка, ул. Трехгорная (строительный)", city: "Москва" },
  { number: "673", format: "СМ", address: "Нева,  ул. Беломорская, 16А (CINEMA)", city: "Москва" },
  { number: "675", format: "СМ", address: "Высота,  ул. Юных Ленинцев, 52 (CINEMA)", city: "Москва" },
  { number: "680", format: "СМ", address: "Рассвет, ул. Зои и Александра Космодемьянских, 23 (CINEMA)", city: "Москва" },
  { number: "702", format: "СМ", address: "ул. Уральская, д. 4 литер Б", city: "Санкт-Петербург" },
  { number: "703", format: "СМ", address: "Гражданский проспект, д. 111", city: "Санкт-Петербург" },
  { number: "704", format: "СМ", address: "проспект Юрия Гагарина, д. 71 литер А", city: "Санкт-Петербург" },
  { number: "705", format: "СМ", address: "г. Мурино, ул. Шувалова, д. 1", city: "Санкт-Петербург" },
  { number: "706", format: "СМ", address: "г. Мурино, Привокзальная площадь, д. 3 литер Б", city: "Санкт-Петербург", reconstruction: true },
  { number: "707", format: "СМ", address: "ул. Новгородская, д. 23 литер А", city: "Санкт-Петербург", reconstruction: true },
  { number: "709", format: "СМ", address: "Левашовский проспект, д. 21 литер А", city: "Санкт-Петербург" },
  { number: "710", format: "СМ", address: "Богатырский проспект, д. 35 корп. 1 литер А", city: "Санкт-Петербург", reconstruction: true },
  { number: "713", format: "СМ", address: "Чкаловский проспект, д. 50", city: "Санкт-Петербург" },
  { number: "716", format: "СМ", address: "Шуваловский проспект, д. 40 корп. 2", city: "Санкт-Петербург" },
  { number: "717", format: "СМ", address: "проспект Большевиков, д. 7 корп. 2 стр. 1", city: "Санкт-Петербург" },
  { number: "718", format: "СМ", address: "ул. Автовская, д. 15 литер А", city: "Санкт-Петербург" },
  { number: "719", format: "СМ", address: "Заневский проспект, д. 71 корп. 1 литер А", city: "Санкт-Петербург" },
  { number: "722", format: "СМ", address: "г. Ломоносов, ул. Михайловская, д. 40/7 литер А", city: "Санкт-Петербург" },
  { number: "723", format: "СМ", address: "г. Петергоф, проспект Санкт-Петербургский, д. 60", city: "Санкт-Петербург" },
  { number: "724", format: "СМ", address: "поселок Шушары, Новгородский проспект, д. 10 корп. 2", city: "Санкт-Петербург" },
  { number: "726", format: "СМ", address: "ул. Бестужевская, д. 10 литер А", city: "Санкт-Петербург" },
  { number: "727", format: "СМ", address: "пл. Конституции, д. 2 литер А", city: "Санкт-Петербург" },
  { number: "735", format: "СМ", address: "г. Мурино, ул. Оборонная, д. 37 корп. 1", city: "Санкт-Петербург" },
  { number: "738", format: "СМ", address: "Парголово, ул. Михаила Дудина д. 6к1, стр.1, ТЦ ПарнасСИТИ", city: "Санкт-Петербург" },
  { number: "739", format: "СМ", address: "Ломоносовский район, Красносельское ш. д 54, кор 3 лит А", city: "Санкт-Петербург" },
  { number: "740", format: "СМ", address: "Дунайский пр, д. 27, корпус 1, литера Б, ТЦ «Дунай»", city: "Санкт-Петербург" },
  { number: "742", format: "СМ", address: "Балканская пл. 5, лит. Е, ТРК \"Балканский\"", city: "Санкт-Петербург" },
  { number: "743", format: "СМ", address: "Колпино, ул. Пролетарская, д. 36, лит. А", city: "Санкт-Петербург" },
  { number: "801", format: "СМ", address: "пл. Карла Маркса, д. 2", city: "Новосибирск" },
  { number: "802", format: "СМ", address: "ул. Геодезическая, д. 4/1", city: "Новосибирск" },
  { number: "809", format: "СМ", address: "ул. Депутатская, д. 46", city: "Новосибирск" },
  { number: "811", format: "СМ", address: "ул. Ленина, д. 84", city: "Новосибирск" },
  { number: "812", format: "СМ", address: "ул. Дуси Ковальчук, д. 276/11", city: "Новосибирск" },
  { number: "816", format: "СМ", address: "ул. Пархоменко, д. 90/1", city: "Новосибирск" },
  { number: "817", format: "СМ", address: "ул.Троллейная, 130А", city: "Новосибирск" },
  { number: "818", format: "СМ", address: "ул. Ветлужская, 24", city: "Новосибирск" },
  { number: "821", format: "СМ", address: "ул. Дуси Ковальчук, д. 91", city: "Новосибирск" },
  { number: "823", format: "СМ", address: "ул.Тюленина, д.27", city: "Новосибирск" },
  { number: "829", format: "СМ", address: "ул.Котовского, д. 2В", city: "Новосибирск" },
  { number: "831", format: "СМ", address: "ул. Бориса Богаткова, д. 206", city: "Новосибирск" },
  { number: "832", format: "СМ", address: "ул. Трикотажная, 29", city: "Новосибирск" },
  { number: "833", format: "СМ", address: "Гусинобродское шоссе, 20", city: "Новосибирск" },
  { number: "834", format: "СМ", address: "ул. Колхидская, 11", city: "Новосибирск" },
  { number: "835", format: "СМ", address: "ул. Волховская, 30", city: "Новосибирск" },
  { number: "836", format: "СМ", address: "ул. Маяковского, 24", city: "Новосибирск" },
  { number: "849", format: "СМ", address: "ул. Проспект Дзержинского, д. 2/2", city: "Новосибирск" },
  { number: "855", format: "СМ", address: "г. Новосибирск", city: "Новосибирск" },
  { number: "904", format: "СМ", address: "ул. Кузнечная, д. 79", city: "Екатеринбург" },
  { number: "906", format: "СМ", address: "ул. Сыромолотова, д. 31", city: "Екатеринбург" },
  { number: "907", format: "СМ", address: "ул. Московская, д. 200", city: "Екатеринбург" },
]

export const MASTER_TK_SET = new Set(MASTER_TK_LIST.map((t) => t.number))

// Разбор введенной строки номеров ТК на валидные (наши) и неизвестные (чужие)
export function parseAndValidateTkNumbers(rawInput: string): {
  allEntered: string[]
  validNumbers: string[]
  unknownNumbers: string[]
} {
  const tokens = rawInput
    .split(/[,\s;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const uniqueTokens = Array.from(new Set(tokens))
  const validNumbers = uniqueTokens.filter((n) => MASTER_TK_SET.has(n))
  const unknownNumbers = uniqueTokens.filter((n) => !MASTER_TK_SET.has(n))
  return {
    allEntered: uniqueTokens,
    validNumbers,
    unknownNumbers,
  }
}

export type QuotaAlertLevel = "ok" | "orange" | "red"

export interface QuotaEvaluation {
  level: QuotaAlertLevel
  totalSec: number
  paidSec: number
  freeSec: number
  paidRemainingSec: number
  isOverTotal: boolean
  isOverPaid: boolean
  reason: string
}

// Новая бизнес-логика оценки хронометража ТК:
// 1. Суммарно > 180с или Платно > 125с -> КРАСНОЕ предупреждение ("red")
// 2. Бесплатные ролики можно грузить без предупреждений, если в платном хронометраже свободно > 20 сек (>= 25с)
// 3. Если при прогрузке бесплатных роликов в платном осталось от 10 до 20 сек (10, 15, 20с) -> ОРАНЖЕВОЕ предупреждение ("orange")
// 4. Если при прогрузке бесплатных роликов в платном осталось от 0 до 5 сек (0, 5с) -> КРАСНОЕ предупреждение ("red")
export function evaluateTkQuota(paidSec: number, freeSec: number): QuotaEvaluation {
  const totalSec = paidSec + freeSec
  const paidRemainingSec = Math.min(
    TK_QUOTAS.PAID_MAX - paidSec,
    TK_QUOTAS.TOTAL_MAX - totalSec
  )
  const isOverTotal = totalSec > TK_QUOTAS.TOTAL_MAX
  const isOverPaid = paidSec > TK_QUOTAS.PAID_MAX

  if (isOverTotal) {
    return {
      level: "red",
      totalSec,
      paidSec,
      freeSec,
      paidRemainingSec,
      isOverTotal,
      isOverPaid,
      reason: `Превышен суммарный лимит 180с (${totalSec}с)`,
    }
  }

  if (isOverPaid) {
    return {
      level: "red",
      totalSec,
      paidSec,
      freeSec,
      paidRemainingSec,
      isOverTotal,
      isOverPaid,
      reason: `Превышен платный лимит 125с (${paidSec}с)`,
    }
  }

  if (freeSec > 0) {
    if (paidRemainingSec <= 5) {
      return {
        level: "red",
        totalSec,
        paidSec,
        freeSec,
        paidRemainingSec,
        isOverTotal,
        isOverPaid,
        reason: `В платном хронометраже осталось ${Math.max(0, paidRemainingSec)}с (0–5с)`,
      }
    }
    if (paidRemainingSec >= 10 && paidRemainingSec <= 20) {
      return {
        level: "orange",
        totalSec,
        paidSec,
        freeSec,
        paidRemainingSec,
        isOverTotal,
        isOverPaid,
        reason: `В платном хронометраже осталось ${paidRemainingSec}с (10–20с)`,
      }
    }
  }

  return {
    level: "ok",
    totalSec,
    paidSec,
    freeSec,
    paidRemainingSec,
    isOverTotal,
    isOverPaid,
    reason: "В норме",
  }
}
