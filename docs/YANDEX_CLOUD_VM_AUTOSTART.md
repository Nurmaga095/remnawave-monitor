# Автозапуск прерываемой ВМ в Yandex Cloud

Эта инструкция настраивает автоматический запуск прерываемой ВМ, если Yandex Cloud её остановит.

Идея простая:

- есть одна или несколько прерываемых ВМ;
- Cloud Function раз в 3 минуты проверяет их статус;
- если ВМ остановлена, функция запускает её обратно.

В итоге нужны три вещи:

- сервисный аккаунт с правами на запуск ВМ;
- функция `vm-autostart`;
- таймер-триггер `vm-autostart-timer`.

---

## 1. Проверь ВМ

Открой:

```text
Compute Cloud -> Виртуальные машины
```

Проверь, что нужная ВМ создана как `Прерываемая`.

Если ВМ ещё нет:

1. Нажми `Создать виртуальную машину`.
2. Выбери нужные CPU, RAM, диск и образ ОС.
3. Включи опцию `Прерываемая`.
4. Создай ВМ.

Важно: обычная ВМ не станет дешевле от этой инструкции. Нужна именно прерываемая ВМ.

---

## 2. Скопируй ID ВМ

Функции нужен не IP и не имя ВМ, а именно `Идентификатор`.

Как найти ID:

1. Открой нужную ВМ.
2. На вкладке `Обзор` найди поле `Идентификатор`.
3. Скопируй значение.

Пример ID:

```text
epdk31dp2e43h843udo1
```

Если ВМ несколько, скопируй ID каждой.

---

## 3. Создай сервисный аккаунт

Открой:

```text
Identity and Access Management -> Сервисные аккаунты
```

Создай сервисный аккаунт:

```text
Имя: vm-autostart-sa
Описание: Автозапуск прерываемых ВМ
```

Выдай ему роли:

```text
compute.admin
functions.functionInvoker
```

Если у тебя уже есть сервисный аккаунт для этой задачи, можно использовать его. Главное, чтобы у него была роль `compute.admin`.

---

## 4. Создай функцию

Открой:

```text
Cloud Functions -> Функции
```

Создай функцию:

```text
Имя: vm-autostart
Описание: Автоматически запускает остановленные прерываемые ВМ
```

После создания открой `Редактор`.

---

## 5. Настрой код функции

В редакторе выбери:

```text
Среда выполнения: Node.js 22
Источник кода: Редактор кода
```

Создай файл `index.js` и вставь код:

```js
async function getIamToken(context) {
  const token = context && context.token;

  if (typeof token === "string" && token) {
    return token;
  }

  if (token && typeof token === "object") {
    if (token.access_token) return token.access_token;
    if (token.accessToken) return token.accessToken;
  }

  const response = await fetch(
    "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } }
  );

  if (!response.ok) {
    throw new Error(`Unable to get IAM token: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function yandexCloudRequest(path, iamToken, options = {}) {
  const response = await fetch(`https://compute.api.cloud.yandex.net/compute/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${iamToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

module.exports.handler = async function (event, context) {
  const instanceIds = Object.keys(process.env)
    .filter((key) => key.startsWith("INSTANCE_ID_"))
    .sort()
    .map((key) => process.env[key])
    .filter(Boolean);

  const iamToken = await getIamToken(context);

  console.log("Instance IDs:", instanceIds);

  for (const instanceId of instanceIds) {
    try {
      const vm = await yandexCloudRequest(`/instances/${instanceId}`, iamToken);

      console.log("VM", instanceId, "status =", vm.status);

      if (vm.status === "STOPPED" || vm.status === 4) {
        console.log("Starting VM", instanceId);

        await yandexCloudRequest(`/instances/${instanceId}:start`, iamToken, {
          method: "POST",
          body: "{}",
        });
      }
    } catch (e) {
      console.error("Failed for VM", instanceId, e.message);
    }
  }

  return {
    statusCode: 200,
    body: "ok",
  };
};
```

Создай файл `package.json`:

```json
{
  "name": "vm-autostart",
  "version": "1.0.0"
}
```

Отдельные зависимости не нужны. Не добавляй `@yandex-cloud/nodejs-sdk`.

---

## 6. Настрой параметры функции

На этой же странице укажи:

```text
Точка входа: index.handler
Таймаут: 10 секунд
Память: 128 МБ
Сервисный аккаунт: vm-autostart-sa
Сеть: Не выбрано
Запись логов: Включено
```

В блоке `Переменные окружения` добавь ID виртуальных машин:

```text
INSTANCE_ID_1 = <id первой ВМ>
INSTANCE_ID_2 = <id второй ВМ>
INSTANCE_ID_3 = <id третьей ВМ>
```

Пример:

```text
INSTANCE_ID_1 = epdk31dp2e43h843udo1
```

Каждая ВМ добавляется отдельной переменной.

После этого нажми:

```text
Сохранить изменения
```

---

## 7. Проверь функцию

Открой вкладку:

```text
Тестирование
```

Оставь:

```text
Тег версии: $latest
Шаблон данных: Без шаблона
Входные данные: пусто
```

Нажми `Запустить тест`.

Успешный ответ выглядит так:

```json
{
  "statusCode": 200,
  "body": "ok"
}
```

Если тест прошёл, код и права сервисного аккаунта настроены правильно.

---

## 8. Создай таймер

Открой у функции раздел:

```text
Триггеры
```

Нажми `Создать триггер`.

Заполни:

```text
Имя: vm-autostart-timer
Тип: Таймер
Запускаемый ресурс: Функция
Cron-выражение: */3 * ? * * *
Функция: vm-autostart
Тег версии функции: $latest
Сервисный аккаунт: vm-autostart-sa
Количество попыток: 1
```

Поле `Данные` оставь пустым.

Нажми `Создать триггер`.

Теперь функция будет запускаться каждые 3 минуты.

---

## 9. Проверь автозапуск

Самый надёжный тест:

1. Открой `Compute Cloud -> Виртуальные машины`.
2. Останови тестовую прерываемую ВМ.
3. Подожди до 3 минут.
4. Обнови список ВМ.
5. Проверь, что ВМ снова стала `Running`.

Не останавливай боевую ВМ, если на ней сейчас работает важный сервис.

---

## Как добавить ещё одну ВМ

Открой:

```text
Cloud Functions -> vm-autostart -> Редактор
```

Добавь новую переменную окружения:

```text
INSTANCE_ID_2 = <id новой ВМ>
```

или следующий свободный номер:

```text
INSTANCE_ID_3 = <id новой ВМ>
```

Сохрани изменения. Код и триггер менять не нужно.

---

## Как убрать ВМ из автозапуска

Открой функцию `vm-autostart` и удали переменную нужной машины.

Пример:

```text
INSTANCE_ID_2
```

Сохрани изменения.

---

## Если что-то не работает

Проверь по порядку:

1. Правильный ли ID ВМ указан в `INSTANCE_ID_1`.
2. Есть ли у сервисного аккаунта роль `compute.admin`.
3. Выбран ли этот сервисный аккаунт в настройках функции.
4. Включены ли логи функции.
5. Находится ли ВМ в том же каталоге, где сервисный аккаунт имеет права.

Частые ошибки:

```text
NOT_FOUND
```

Обычно означает неправильный ID ВМ или отсутствие доступа к ВМ.

```text
PERMISSION_DENIED
```

Обычно означает, что сервисному аккаунту не хватает роли `compute.admin`.

```text
Cannot destructure property 'compute' of 'cloudApi'
```

Это ошибка старого варианта инструкции через `@yandex-cloud/nodejs-sdk`. Используй код из этой инструкции без SDK.

---

## Что будет оплачиваться

Cloud Functions и Timer Trigger обычно стоят очень мало и часто укладываются в бесплатные лимиты.

Но платными остаются:

- ВМ, пока она запущена;
- диск ВМ;
- публичный IP, если он есть;
- другие подключённые ресурсы.

---

## Короткий итог

После настройки:

- функция `vm-autostart` проверяет ВМ;
- триггер `vm-autostart-timer` запускает функцию каждые 3 минуты;
- остановленные прерываемые ВМ автоматически запускаются снова.
