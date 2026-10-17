import type { Messages } from './en';
import { plural } from './plural';

const p = plural('ru');

/** Russian. Hotel rooms = "номера"; the places where stock is counted (locations) = "помещения". */
export const ru: Messages = {
  appName: 'Stock Monitor',

  common: {
    add: 'Добавить',
    remove: 'Удалить',
    cancel: 'Отмена',
    save: 'Сохранить',
    confirm: 'Подтвердить',
    close: 'Закрыть',
    loading: 'Загрузка',
    dismiss: 'Закрыть',
    today: 'Сегодня',
    stockName: 'Наименование',
    unnamedItem: 'Без названия',
    unnamedRoom: 'Без названия',
    enterNumber: 'Введите число',
    enterQty: 'Введите число 0 или больше',
    clearManual: 'Сбросить ручное значение',
    notSaved: 'Не сохранено',
    loadFailed: 'Не удалось загрузить данные',
    tryAgain: 'Повторить',
    askAdmin: 'Попросите администратора это настроить.',
  },

  errors: {
    offline: 'Нет связи с сервером. Проверьте Wi-Fi и попробуйте ещё раз.',
    badRequest: 'Сервер не принял это значение.',
    notFound: 'Это было удалено на другом устройстве.',
    server: 'Ошибка на сервере.',
    generic: 'Что-то пошло не так',
    loggedOut: 'Вы вышли из системы. Введите PIN ещё раз.',
    forbidden: 'Это может сделать только администратор.',
  },

  nav: {
    stock: 'Склад',
    counter: 'Инвентаризация',
    checklist: 'Чек-лист',
    openMenu: 'Открыть меню',
    closeMenu: 'Закрыть меню',
    logout: 'Выйти',
  },

  theme: {
    names: { light: 'светлая', dark: 'тёмная', system: 'как в системе' },
    current: (name) => `Тема: ${name}`,
    switchTo: (name) => `Сменить тему: ${name}`,
  },

  language: 'Язык',

  auth: {
    title: 'Введите PIN',
    pin: 'PIN',
    clear: 'Стереть последнюю цифру',
    wrongPin: 'Неверный PIN. Попробуйте ещё раз.',
    tooMany: 'Слишком много неверных попыток. Подождите 15 минут и попробуйте снова.',
    qrInvalid: 'Этот QR-код больше не действует. Попросите у администратора новый.',
  },

  date: {
    prev: 'Предыдущий день',
    next: 'Следующий день',
  },

  data: {
    excel: 'Excel',
    excelHint: 'Вся история по дням в Excel',
    backup: 'Копия',
    backupHint: 'Скачать резервную копию (.json)',
    restore: 'Восстановить',
    restoreHint: 'Восстановить все данные из резервной копии',
    noData: 'Пока нечего экспортировать',
    noHistory: 'Пока нет истории для экспорта',
    noBackupData: 'Пока нечего сохранять',
    exportFailed: 'Не удалось выгрузить в Excel',
    notBackup: 'Это не резервная копия',
    notBackupFile: (file) => `«${file}» — не резервная копия Stock Monitor.`,
    restoreTitle: 'Восстановить эту копию?',
    restoreDescription: (file, items, groups, rooms) =>
      `В «${file}»: ${p(items, { one: 'позиция', few: 'позиции', many: 'позиций', other: 'позиции' })}, ${p(groups, { one: 'группа', few: 'группы', many: 'групп', other: 'группы' })} и ${p(rooms, { one: 'помещение', few: 'помещения', many: 'помещений', other: 'помещения' })}. Это заменит ВСЕ текущие данные, включая подсчёты в помещениях.`,
    restored: 'Копия восстановлена',
    restoreFailed: 'Не удалось восстановить',
  },

  stock: {
    title: 'Склад',
    departures: {
      title: 'Выезды',
      description: 'Освободившиеся номера за этот день по группам',
      group: 'Группа',
      amount: 'Кол-во',
      groupName: 'Название группы',
      itemsPerDeparture: 'Расход на один выезд',
      itemsPerDepartureIn: (group) => `Расход на один выезд: ${group}`,
      removeGroup: 'Удалить группу',
      removeGroupNamed: (group) => `Удалить ${group}`,
      departuresOf: (group) => `Выезды ${group}`,
      removeTitle: (group) => `Удалить группу «${group}»?`,
      removeDescription: 'Её выезды больше не будут учитываться в расходе.',
      newGroup: 'Новая группа (напр. TRIPLE)',
    },
    items: {
      title: 'Остатки',
      description: (date) => `Расход, приход и остаток на конец дня: ${date}`,
      emptyTitle: 'Позиций пока нет',
      emptyDescription: 'Добавьте позиции ниже, напр. простыни, наволочки, полотенца.',
      consumption: 'Расход',
      income: 'Приход',
      total: 'Остаток',
      consumptionHint: 'Рассчитано по выездам; введите число, чтобы заменить',
      totalHint: 'Рассчитано; введите пересчитанное количество, чтобы заменить',
      consumptionOf: (item) => `Расход ${item}`,
      incomeOf: (item) => `Приход ${item}`,
      totalOf: (item) => `Остаток ${item}`,
      removeItem: 'Удалить позицию',
      removeItemNamed: (item) => `Удалить ${item}`,
      removeTitle: (item) => `Удалить «${item}»?`,
      removeDescription: 'Позиция и вся её история будут удалены.',
      newItem: 'Новая позиция (напр. Банное полотенце)',
      addItem: 'Добавить',
      setUpGroups: '+ Настроить группы номеров (выезды)',
      defaultGroupName: 'Новая группа',
      roomsCounted: (counted, total) => `${counted}/${total} помещ.`,
      countedIn: (rooms) => `Посчитано: ${rooms}`,
      removedRooms: 'удалённые помещения',
    },
    groupItems: {
      title: (group) => `Расход в группе ${group}`,
      description: 'Сколько каждой позиции уходит на один выезд',
      empty: 'Позиции ещё не созданы',
    },
    overview: {
      title: 'Обзор',
      description:
        'Остаток на конец дня за последние 30 и следующие 7 дней. Прокрутите вбок, чтобы увидеть другие даты; «—» = ничего не введено. Нажмите на день, чтобы открыть его.',
      goToDay: 'Открыть этот день',
      nothingEntered: 'За этот день ничего не введено',
    },
    legend: {
      calculated: 'Рассчитано',
      manual: 'Введено вручную',
      rooms: 'Посчитано в помещениях (сумма)',
      shortage: 'Недостача (ниже нуля)',
    },
  },

  counter: {
    title: 'Инвентаризация',
    allRooms: 'Все помещения',
    noItemsTitle: 'Позиций пока нет',
    noItemsDescription: 'Сначала добавьте позиции на странице «Склад».',
    goToStock: 'Открыть «Склад»',
    roomGoneTitle: 'Этого помещения больше нет',
    roomGoneDescription: 'Оно было удалено. Выберите другое помещение выше.',
    noRoomsTitle: 'Помещений пока нет',
    noRoomsDescription:
      'Добавьте места, где хранятся запасы, напр. «1 этаж», «2 этаж», «Хозкомната».',
    countedShort: (counted, total) => `посчитано ${counted}/${total}`,
    removedRooms: 'Удалённые помещения',
    removedRoomsHint: 'Количества, введённые для помещений, которые потом удалили',
    sum: 'Сумма',
    howTo: {
      before: 'Введите количество и нажмите',
      after:
        '(или Enter), чтобы перейти к следующей позиции. Если ничего нет, введите 0. Чтобы отменить подсчёт, очистите поле и сохраните.',
    },
    progress: (counted, total) => `Посчитано ${counted} из ${total}`,
    invalid: 'Введите число 0 или больше.',
    serverError: (message) => `Сервер не смог сохранить (${message}). Нажмите «Повторить».`,
    offline: 'Нет связи с сервером. Проверьте Wi-Fi и нажмите «Повторить».',
    button: {
      empty: 'Сохранить',
      draft: 'Сохранить',
      saving: 'Сохраняю…',
      saved: '✓ Сохранено',
      error: 'Повторить',
    },
    manageRooms: 'Управление помещениями',
    roomName: 'Название помещения',
    removeRoom: 'Удалить помещение',
    removeRoomNamed: (room) => `Удалить ${room}`,
    removeTitle: (room) => `Удалить помещение «${room}»?`,
    removeDescription: 'Уже введённые для него количества останутся в остатках.',
    newRoom: 'Новое помещение (напр. 1 этаж)',
    addRoom: 'Добавить',
  },

  checklist: {
    title: 'Ежедневный чек-лист',
    howTo:
      'Отмечайте задачу, когда она выполнена. Нажмите на задачу, чтобы прочитать инструкцию. Каждый день список начинается заново.',
    progress: (done, total) => `Выполнено ${done} из ${total}`,
    allDone: 'Все задачи выполнены',
    emptyTitle: 'Задач пока нет',
    emptyDescription:
      'Введите задачу выше и нажмите «Добавить задачу». Она будет появляться здесь каждый день.',
    unnamedTask: 'Задача без названия',
    showInstructions: 'Показать инструкцию',
    hideInstructions: 'Скрыть инструкцию',
    doneAt: (time) => `Выполнено в ${time}`,
    keptDays: 'Отметки и комментарии хранятся 30 дней.',
    notes: {
      title: 'Комментарий для следующей смены',
      previous: (date) => `Комментарий предыдущего дня (${date})`,
      placeholder:
        'Что нужно знать следующей смене: проблемы, незаконченные дела, заканчивающиеся запасы…',
      hint: 'Сохраняется, когда вы нажмёте за пределами поля.',
    },
    manage: {
      taskName: 'Задача',
      instructions: 'Инструкция',
      instructionsPlaceholder: 'Как это сделать (необязательно)',
      newTask: 'Новая задача (напр. Проверить минибары)',
      addTask: 'Добавить задачу',
      moveUp: 'Переместить вверх',
      moveDown: 'Переместить вниз',
      editTask: 'Изменить задачу',
      editTaskNamed: (task) => `Изменить ${task}`,
      removeTask: 'Удалить задачу',
      removeTaskNamed: (task) => `Удалить ${task}`,
      removeTitle: (task) => `Удалить задачу «${task}»?`,
      removeDescription: (date) =>
        `Задача исчезнет из списка с этого дня (${date}). В прошлых днях она останется вместе с отметками.`,
      appliesFrom: (date) => `Изменения действуют с этого дня (${date}). Прошлые дни не изменятся.`,
    },
  },

  notFound: {
    title: '404 — Страница не найдена',
    description: 'Такой страницы нет или она была перемещена.',
    goHome: 'На главную',
  },

  excel: {
    stockSheet: 'Остатки',
    departuresSheet: 'Выезды',
    date: 'Дата',
    consumption: 'Расход',
    income: 'Приход',
    stock: 'Остаток',
    unnamedItem: 'Без названия',
    itemsPerDeparture: 'Расход на выезд',
    legend: [
      'Остаток = остаток на конец дня. Жёлтым = посчитано (сумма по помещениям или введено вручную); красным = недостача.',
      'Расход включает выезды × расход на номер, если он не введён вручную.',
      'Даты серым курсивом — запланированные (в будущем).',
    ],
  },
};
