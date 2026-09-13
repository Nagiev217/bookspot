// Три локали в одном файле, порядок az/ru/en. Переносы строк — LF (не CRLF,
// как в dersreport77 — там это регулярно ломало программные правки).
// Правило: любой новый пользовательский текст добавляется во все три
// локали сразу. Проверка: grep -c "^  keyName:" translations.js === 3.

export const az = {
  common: {
    save: 'Yadda saxla',
    cancel: 'Ləğv et',
    loading: 'Yüklənir…',
  },
  auth: {
    login: 'Daxil ol',
    register: 'Qeydiyyat',
    email: 'E-poçt',
    password: 'Şifrə',
    name: 'Ad',
    phone: 'Telefon',
  },
};

export const ru = {
  common: {
    save: 'Сохранить',
    cancel: 'Отмена',
    loading: 'Загрузка…',
  },
  auth: {
    login: 'Войти',
    register: 'Регистрация',
    email: 'Email',
    password: 'Пароль',
    name: 'Имя',
    phone: 'Телефон',
  },
};

export const en = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    loading: 'Loading…',
  },
  auth: {
    login: 'Log in',
    register: 'Sign up',
    email: 'Email',
    password: 'Password',
    name: 'Name',
    phone: 'Phone',
  },
};

export const LOCALES = { az, ru, en };
