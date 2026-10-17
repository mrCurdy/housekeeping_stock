import { plural } from './plural';

const p = plural('en');

/**
 * English: the source dictionary. Its shape is the `Messages` type, so et.ts and ru.ts must have
 * exactly the same keys (a missing or extra key fails `npm run typecheck`).
 * Text with values in it is a function; plurals go through `p(n, { one, other })`.
 */
export const en = {
  appName: 'Stock Monitor',

  common: {
    add: 'Add',
    remove: 'Remove',
    cancel: 'Cancel',
    save: 'Save',
    confirm: 'Confirm',
    close: 'Close',
    loading: 'Loading',
    dismiss: 'Dismiss',
    today: 'Today',
    stockName: 'Stock name',
    unnamedItem: 'Unnamed item',
    unnamedRoom: 'Unnamed room',
    enterNumber: 'Enter a number',
    enterQty: 'Enter a number of 0 or more',
    clearManual: 'Clear manual value',
    notSaved: 'Not saved',
    loadFailed: 'Could not load the data',
    tryAgain: 'Try again',
    askAdmin: 'Ask the admin to set this up.',
  },

  errors: {
    offline: "Can't reach the server. Check the Wi-Fi and try again.",
    badRequest: 'The server did not accept this value.',
    notFound: 'It was removed on another device.',
    server: 'Something went wrong on the server.',
    generic: 'Something went wrong',
    loggedOut: 'You were logged out. Enter the PIN again.',
    forbidden: 'Only the admin can do this.',
  },

  nav: {
    stock: 'Stock',
    counter: 'Inventory count',
    checklist: 'Checklist',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    logout: 'Log out',
  },

  theme: {
    names: { light: 'light', dark: 'dark', system: 'system' },
    current: (name: string) => `Theme: ${name}`,
    switchTo: (name: string) => `Switch to ${name} theme`,
  },

  language: 'Language',

  auth: {
    title: 'Enter your PIN',
    pin: 'PIN',
    clear: 'Delete last digit',
    wrongPin: 'Wrong PIN. Try again.',
    tooMany: 'Too many wrong tries. Wait 15 minutes and try again.',
    qrInvalid: 'This QR code no longer works. Ask the admin for a new one.',
  },

  date: {
    prev: 'Previous day',
    next: 'Next day',
  },

  data: {
    excel: 'Excel',
    excelHint: 'Full day-by-day history as Excel',
    backup: 'Backup',
    backupHint: 'Download a backup file (.json)',
    restore: 'Restore',
    restoreHint: 'Restore all data from a backup file',
    noData: 'No data to export yet',
    noHistory: 'No history to export yet',
    noBackupData: 'No data to back up yet',
    exportFailed: 'Excel export failed',
    notBackup: 'Not a backup',
    notBackupFile: (file: string) => `"${file}" is not a Stock Monitor backup.`,
    restoreTitle: 'Restore this backup?',
    restoreDescription: (file: string, items: number, groups: number, rooms: number) =>
      `"${file}" contains ${p(items, { one: 'item', other: 'items' })}, ${p(groups, { one: 'group', other: 'groups' })} and ${p(rooms, { one: 'room', other: 'rooms' })}. This replaces ALL current data, including room counts.`,
    restored: 'Backup restored',
    restoreFailed: 'Restore failed',
  },

  stock: {
    title: 'Stock',
    departures: {
      title: 'Departures',
      description: 'Rooms checked out on this day, per group',
      group: 'Group',
      amount: 'Amount',
      groupName: 'Group name',
      itemsPerDeparture: 'Items used per departure',
      itemsPerDepartureIn: (group: string) => `Items used per departure in ${group}`,
      removeGroup: 'Remove group',
      removeGroupNamed: (group: string) => `Remove ${group}`,
      departuresOf: (group: string) => `Departures ${group}`,
      removeTitle: (group: string) => `Remove the group "${group}"?`,
      removeDescription: 'Its departures will no longer count as consumption.',
      newGroup: 'New group (e.g. TRIPLE)',
    },
    items: {
      title: 'Stock',
      description: (date: string) => `Consumption, income and end-of-day stock for ${date}`,
      emptyTitle: 'No items yet',
      emptyDescription: 'Add stock items below, e.g. bed sheets, pillow cases, towels.',
      consumption: 'Consumption',
      income: 'Income',
      total: 'Total stock',
      consumptionHint: 'Calculated from departures; type to override',
      totalHint: 'Calculated; type a count to override',
      consumptionOf: (item: string) => `Consumption ${item}`,
      incomeOf: (item: string) => `Income ${item}`,
      totalOf: (item: string) => `Total stock ${item}`,
      removeItem: 'Remove item',
      removeItemNamed: (item: string) => `Remove ${item}`,
      removeTitle: (item: string) => `Remove "${item}"?`,
      removeDescription: 'The item and all its history will be deleted.',
      newItem: 'New stock name (e.g. Bath towel)',
      addItem: 'Add item',
      setUpGroups: '+ Set up room groups (departures)',
      defaultGroupName: 'New group',
      roomsCounted: (counted: number, total: number) => `${counted}/${total} rooms`,
      countedIn: (rooms: string) => `Counted in: ${rooms}`,
      removedRooms: 'removed rooms',
    },
    groupItems: {
      title: (group: string) => `Items in ${group}`,
      description: 'How many of each item one departure uses',
      empty: 'No stock items created yet',
    },
    overview: {
      title: 'Overview',
      description:
        'End-of-day stock for the last 30 and next 7 days. Scroll sideways for other dates; "—" = nothing entered. Click a day to open it.',
      goToDay: 'Go to this day',
      nothingEntered: 'Nothing entered for this day',
    },
    legend: {
      calculated: 'Calculated',
      manual: 'Entered by hand',
      rooms: 'Counted in rooms (sum)',
      shortage: 'Shortage (below zero)',
    },
  },

  counter: {
    title: 'Inventory count',
    allRooms: 'All rooms',
    noItemsTitle: 'No stock items yet',
    noItemsDescription: 'Add items on the Stock page first.',
    goToStock: 'Go to Stock',
    roomGoneTitle: 'This room no longer exists',
    roomGoneDescription: 'It was removed. Pick another room above.',
    noRoomsTitle: 'No rooms yet',
    noRoomsDescription:
      'Add the places where stock is kept, e.g. "1 level", "2 level", "Cleaning room".',
    countedShort: (counted: number, total: number) => `${counted}/${total} counted`,
    removedRooms: 'Removed rooms',
    removedRoomsHint: 'Counts entered for rooms that were removed later',
    sum: 'Sum',
    // Shown as: before <strong>Save</strong> after
    howTo: {
      before: 'Type the number and tap',
      after:
        '(or Enter) to go to the next item. Enter 0 if there is none. To undo a count, empty the field and save.',
    },
    progress: (counted: number, total: number) => `${counted} of ${total} counted`,
    invalid: 'Please enter a number of 0 or more.',
    serverError: (message: string) => `The server could not save it (${message}). Tap Retry.`,
    offline: "Can't reach the server. Check the Wi-Fi, then tap Retry.",
    button: {
      empty: 'Save',
      draft: 'Save',
      saving: 'Saving…',
      saved: '✓ Saved',
      error: 'Retry',
    },
    manageRooms: 'Manage rooms',
    roomName: 'Room name',
    removeRoom: 'Remove room',
    removeRoomNamed: (room: string) => `Remove ${room}`,
    removeTitle: (room: string) => `Remove the room "${room}"?`,
    removeDescription: 'Counts already entered for it stay in the stock totals.',
    newRoom: 'New room (e.g. 1 level)',
    addRoom: 'Add room',
  },

  checklist: {
    title: 'Daily checklist',
    howTo:
      'Tick each task when it is done. Tap a task to read its instructions. Every day starts with an empty list.',
    progress: (done: number, total: number) => `${done} of ${total} done`,
    allDone: 'All tasks done',
    emptyTitle: 'No tasks yet',
    emptyDescription: 'Type a task above and tap "Add task". It will appear here every day.',
    unnamedTask: 'Unnamed task',
    showInstructions: 'Show instructions',
    hideInstructions: 'Hide instructions',
    doneAt: (time: string) => `Done ${time}`,
    keptDays: 'Ticks and notes are kept for 30 days.',
    notes: {
      title: 'Notes for the next shift',
      previous: (date: string) => `Note from the previous day (${date})`,
      placeholder: 'Anything the next shift should know: problems, unfinished work, low stock…',
      hint: 'Saved when you tap outside the box.',
    },
    manage: {
      taskName: 'Task',
      instructions: 'Instructions',
      instructionsPlaceholder: 'How to do it (optional)',
      newTask: 'New task (e.g. Check minibars)',
      addTask: 'Add task',
      moveUp: 'Move up',
      moveDown: 'Move down',
      editTask: 'Edit task',
      editTaskNamed: (task: string) => `Edit ${task}`,
      removeTask: 'Remove task',
      removeTaskNamed: (task: string) => `Remove ${task}`,
      removeTitle: (task: string) => `Remove the task "${task}"?`,
      removeDescription: (date: string) =>
        `It is taken off the list from this day (${date}). Earlier days keep it, with their ticks.`,
      appliesFrom: (date: string) =>
        `Changes apply from this day (${date}). Earlier days stay as they were.`,
    },
  },

  notFound: {
    title: '404 — Page not found',
    description: "The page you're looking for doesn't exist or was moved.",
    goHome: 'Go home',
  },

  excel: {
    stockSheet: 'Stock',
    departuresSheet: 'Departures',
    date: 'Date',
    consumption: 'Consumption',
    income: 'Income',
    stock: 'Stock',
    unnamedItem: 'Unnamed item',
    itemsPerDeparture: 'Items per departure',
    legend: [
      'Stock = end-of-day stock. Highlighted yellow = counted (sum of the room counts, or typed in); red = shortage.',
      'Consumption includes departures × items per room unless it was entered by hand.',
      'Dates in grey italics are planned (in the future).',
    ],
  },
};

export type Messages = typeof en;
