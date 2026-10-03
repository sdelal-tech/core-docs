# Ширины, высоты и дробные колонки

[Оглавление](../README.md) · [Правила агента](../AGENTS.md)

## Геометрические размеры

`core-w-Nx` задаёт ширину из spacing-шкалы и одновременно управляет flex-поведением: отключает рост, по умолчанию запрещает сжатие, устанавливает basis auto. `core-w-full` — ширина 100%. `core-w-auto` — особый режим, в том числе с `flex-basis: 100%`; не считайте его синонимом «обнять контент». Для содержательной ширины есть `core-fit`.

Среди проверенных значений ширины: 0–10 целиком; 12, 14, 16, 18, 20, 24, 28, 30, 32, 36, 40, 44, 48, 50, 56, 60, 64, 70, 80, 90, 96, 100, 112, 120, 128, 140, 150, 160, 180, 192, 200, 224, 250, 256, 300, 320, 384, 400, 448, 500, 512, 600, 640, 700, 768, 800, 900, 1000, 1024. Наличие промежуточного токена не добавляет промежуточный класс.

`core-h-Nx` — высота; `core-h-full`, `core-h-100dvh`, `core-h-100vh`, `core-h-unset` — специальные варианты. Высота 100% требует определённой высоты содержащего блока. Фиксированную высоту карточки не следует задавать только ради совпадения коротких демонстрационных текстов: реальные заголовки, перевод и увеличение шрифта изменяют потребность в месте.

У высот базовая и адаптивные шкалы не полностью идентичны. В v185 добавлен `--s-170x`; `core-h-170x` теперь ссылается на существующий токен (340 px при стандартном `--x: 2px`).

## Максимальная ширина

`core-m-w-xs` — 400 px; `core-m-w-s` — `--w-max-mobile` (720 px); `core-m-w-m` — `--w-max-tablet` (997 px); `core-m-w-l` — `--w-max-desktop` (1200 px). Это ограничения ширины, а не переключатели breakpoint. Секция умеет центрироваться сама; обычному блоку при необходимости нужен собственный контекст центрирования.

## `core-j`: ширина доли flex-ряда

Основание `core-j` и счётчик `core-j-3c` нужны вместе. Счётчики 1c…9c задают `--c`. Размер учитывает gap родителя: при ширине W, количестве C и gap G без overlap получается `(W − (C − 1) × G) / C`.

`core-j-ch` переносит правило ширины на всех непосредственных детей. Селектор `.core-j-ch-3c > *` напрямую задаёт `--c: 3` каждому ребёнку; это не наследование счётчика от родителя. На таком родителе **задавайте gap явным `core-g-*`**, чтобы `--parent-g` дошёл до всех детей. Базовые правила row адресуют не любых детей, а выбранные `.core-j` / `.core-j-ch`.

`core-j-over` и `core-j-ch-over` добавляют половину доли для частично видимого следующего элемента. Это полезно в горизонтальной ленте. Не применяйте такую механику поверх grid-треков без отдельного обоснования: grid уже распределяет ширины.

## Сброс счётчика: `core-j-auto`

В v194 `core-j-auto` задаёт только `--c: revert`; `t-core-j-auto` включается при ≤997 px, `m-core-j-auto` — при ≤720 px. Эти классы не задают `width: auto` напрямую и не отменяют gap, overlap или основание `core-j`.

Если у предка нет `--c`, адаптивный auto на элементе с `core-j core-j-3c` делает расчёт `--item-w` недействительным: width и flex-basis переходят к auto, ширина зависит от содержимого. Рост и сжатие проверяйте отдельно. Если предок задаёт `--c`, `revert` возвращает наследуемое значение и дробная ширина может сохраниться.

В каждом breakpoint auto расположен **до** фиксированных `j-1c…9c` / `j-ch-1c…9c`. Поэтому `core-j-auto core-j-3c` сохраняет 3, а `core-j-3c m-core-j-auto m-core-j-1c` на мобильном получает 1. У `.core-j-ch-3c > *` и `.core-j-auto` одинаковая специфичность `(0,1,0)`: базовый фиксированный счётчик побеждает базовый auto по порядку правил. Однако `t-core-j-auto` / `m-core-j-auto` на ребёнке расположены позже базового счётчика и могут сбросить его при ≤997 / ≤720 px. Фиксированный `t-core-j-ch-*` / `m-core-j-ch-*` на родителе снова побеждает auto того же breakpoint. Настоящий унаследованный `--c` предка может сохраниться после сброса; это отдельный механизм. Inline `--c` сильнее этих классов. Порядок слов в class ничего не меняет.

## Слайдер без JavaScript

`core-slider` — flex без переноса, горизонтальная прокрутка, gap 20 px, scroll-snap, скрытый scrollbar. `core-slider-center` центрирует snap-цель ребёнка. `core-slider-masked` добавляет крайние маски, внутренние поля и отрицательные внешние отступы. Параметр `--mask-padding` участвует в геометрии; часть градиентных величин в исходнике остаётся привязана к spacing-токенам.

Это **не автоматическая карусель**: без JS нет кнопочного управления, восстановления индекса и событий менеджера. [SliderManager](js-slider.md) добавляет эти возможности, но не автоматическую смену слайдов по таймеру. Прокрутка браузером работает сама. Визуально скрытый scrollbar требует другого понятного признака, что список продолжается.

## Split

`core-split` — растягиваемая flex-композиция с принудительным нулевым gap. Её прямые дети получают flex и переходы. `core-split-hidden` меняет basis, прозрачность и отображение содержимого. Не подменяйте этим семантическое скрытие или доступный коллапс; отдельного JS-менеджера split в архиве нет. Класс скрытия оставляет flex-grow; не рассчитывайте на полное исчезновение ширины без проверки конкретной композиции.

### E12. Доли ширины с согласованным gap

Один пробел HTML между тегами не создаёт gap: его задаёт core-g-8x и согласует с расчётом долей.

```html
<div class="core-row core-g-8x">
  <div class="core-card core-j core-j-3c m-core-j-1c">Первый</div>
  <div class="core-card core-j core-j-3c m-core-j-1c">Второй</div>
  <div class="core-card core-j core-j-3c m-core-j-1c">Третий</div>
</div>
```

<!-- demo:E12 -->

### E13. Конфигурация долей на родителе

Явный core-g-6x передаёт --parent-g. Первый ряд задаёт счётчик через core-j-ch-3c; второй сравнивает auto, адаптивный сброс и конфликт с фиксированным 3c.

```html
<div class="core-col core-g-8x">
  <span class="core-text core-text-s">Базовый auto на ребёнке: фиксированная доля сохраняется</span>
  <div class="core-row core-j-ch core-j-ch-3c m-core-j-ch-1c core-g-6x">
    <div class="core-card">Один</div>
    <div class="core-card">Два</div>
    <div class="core-card core-j-auto">Три · auto</div>
  </div>
  <span class="core-text core-text-s">Локальные доли: tablet/mobile возвращают ширину содержимого</span>
  <div class="core-row core-g-6x">
    <div class="core-card core-j core-j-auto">auto</div>
    <div class="core-card core-j core-j-3c t-core-j-auto">tablet auto</div>
    <div class="core-card core-j core-j-3c m-core-j-auto">mobile auto</div>
    <div class="core-card core-j core-j-auto core-j-3c">auto + 3c = 3c</div>
  </div>
</div>
```

<!-- demo:E13 -->

### E14. Нативная лента карточек с видимым продолжением

Это нативная прокрутка без SliderManager. Регион получает имя и возможность фокусировки.

```html
<div class="core-slider core-g-8x" tabindex="0" role="region" aria-label="Этапы проекта">
  <article class="core-card core-col core-j core-j-3c core-j-over m-core-j-1c"><h3 class="core-text core-text-bold">Исследование</h3><p class="core-text">Бриф и интервью</p></article>
  <article class="core-card core-col core-j core-j-3c core-j-over m-core-j-1c"><h3 class="core-text core-text-bold">Структура</h3><p class="core-text">Сценарии</p></article>
  <article class="core-card core-col core-j core-j-3c core-j-over m-core-j-1c"><h3 class="core-text core-text-bold">Дизайн</h3><p class="core-text">Компоненты</p></article>
  <article class="core-card core-col core-j core-j-3c core-j-over m-core-j-1c"><h3 class="core-text core-text-bold">Запуск</h3><p class="core-text">Проверка</p></article>
</div>
```

<!-- demo:E14 -->

### E15. Максимальная ширина без фиксированной ширины страницы

Максимум ограничивает чтение на широком экране; содержимое остаётся подвижным на узком.

```html
<section class="core-section core-m-w-s core-p-8x">
  <div class="core-card core-col">
    <h2 class="core-text core-text-l core-text-bold">Узкая форма</h2>
    <input class="core-input" aria-label="Название проекта" placeholder="Название проекта">
  </div>
</section>
```

<!-- demo:E15 -->

**Источник:** [Исходный Core CSS](https://cdn.sdelal.tech/core/latest/core.css).
