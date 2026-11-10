package com.isoft16.vigilvoice

/**
 * Разбор сказанной фразы в команду. Здесь нет ничего от Android —
 * только текст, поэтому всё проверяется обычными тестами.
 */

enum class Dir { UP, DOWN, LEFT, RIGHT }

enum class MediaKey { PLAY, PAUSE, NEXT, PREVIOUS }

sealed class Command {
    /** Фраза не для нас (нет слова-обращения или пусто). */
    data object Ignore : Command()
    data class Unknown(val text: String) : Command()

    data object Sleep : Command()
    data object Wake : Command()

    data object Back : Command()
    data object Home : Command()
    data object Recents : Command()
    data object Notifications : Command()
    data object QuickSettings : Command()
    data object Lock : Command()
    data object WakeScreen : Command()
    data object Screenshot : Command()
    data class Scroll(val dir: Dir) : Command()

    data object ShowNumbers : Command()
    data object HideNumbers : Command()
    data class ClickNumber(val n: Int, val long: Boolean = false) : Command()
    data class ClickText(val text: String, val long: Boolean = false) : Command()

    /** Текст как его услышали; знаки препинания расставляет [Dictation]. */
    data class Type(val text: String) : Command()
    data object DictationOn : Command()
    data object DictationOff : Command()
    data object DeleteWord : Command()
    data object ClearText : Command()
    data object Send : Command()
    data object Enter : Command()

    data class OpenApp(val name: String) : Command()
    data class Search(val query: String) : Command()
    data class Call(val who: String) : Command()
    data object Answer : Command()
    data object HangUp : Command()

    data object VolumeUp : Command()
    data object VolumeDown : Command()
    data object Mute : Command()
    data object Unmute : Command()
    data class Media(val key: MediaKey) : Command()
    data class Flashlight(val on: Boolean) : Command()

    data object Time : Command()
    data object Battery : Command()
    data object Help : Command()
}

class ParserState(
    val dictation: Boolean = false,
    val numbersShown: Boolean = false,
    val wakeWord: String = "",
)

object Text {
    /** Нижний регистр, «ё» → «е», всё кроме букв и цифр — пробел. */
    fun normalize(s: String): String {
        val sb = StringBuilder(s.length)
        for (ch in s.lowercase()) {
            when {
                ch == 'ё' -> sb.append('е')
                ch.isLetterOrDigit() -> sb.append(ch)
                else -> sb.append(' ')
            }
        }
        return sb.toString().trim().replace(Regex("\\s+"), " ")
    }

    fun words(s: String): List<String> = normalize(s).split(' ').filter { it.isNotEmpty() }
}

object CommandParser {

    private val exact = HashMap<String, Command>()

    private fun put(cmd: Command, vararg phrases: String) {
        for (p in phrases) exact[p] = cmd
    }

    init {
        put(Command.Sleep, "спи", "усни", "не слушай", "стоп слушать", "перестань слушать", "не слушай меня")
        put(Command.Wake, "проснись", "просыпайся", "слушай", "слушай меня")

        put(Command.Back, "назад", "вернись", "вернуться", "иди назад")
        put(Command.Home, "домой", "на главный экран", "главный экран", "рабочий стол", "на рабочий стол")
        put(Command.Recents, "недавние", "недавние приложения", "последние приложения", "открытые приложения")
        put(Command.Notifications, "уведомления", "открой уведомления", "покажи уведомления", "шторка", "открой шторку")
        put(Command.QuickSettings, "быстрые настройки", "открой быстрые настройки")
        put(Command.Lock, "заблокируй", "заблокируй экран", "заблокируй телефон", "выключи экран", "погаси экран")
        put(Command.WakeScreen, "включи экран", "разбуди экран", "разбуди телефон")
        put(Command.Screenshot, "скриншот", "сделай скриншот", "снимок экрана", "сделай снимок экрана")

        val dirs = mapOf(
            "вниз" to Dir.DOWN, "ниже" to Dir.DOWN,
            "вверх" to Dir.UP, "наверх" to Dir.UP, "выше" to Dir.UP,
            "влево" to Dir.LEFT, "налево" to Dir.LEFT,
            "вправо" to Dir.RIGHT, "направо" to Dir.RIGHT,
        )
        val verbs = listOf("", "листай", "пролистай", "полистай", "прокрути", "крути", "свайп", "смахни")
        for ((word, dir) in dirs) for (verb in verbs) {
            put(Command.Scroll(dir), if (verb.isEmpty()) word else "$verb $word")
        }
        put(Command.Scroll(Dir.DOWN), "дальше", "еще", "листай", "листай дальше")

        put(Command.ShowNumbers, "цифры", "покажи цифры", "номера", "покажи номера", "покажи числа", "включи цифры")
        put(
            Command.HideNumbers,
            "скрой цифры", "убери цифры", "спрячь цифры", "выключи цифры", "скрой номера", "убери номера",
        )

        put(Command.DictationOn, "диктовка", "режим диктовки", "включи диктовку", "начни диктовку")
        put(Command.DictationOff, *STOP_DICTATION.toTypedArray())
        put(Command.DeleteWord, "сотри", "удали", "сотри слово", "удали слово", "стереть слово")
        put(Command.ClearText, "сотри все", "удали все", "очисти", "очисти поле", "очисти текст", "стереть все")
        put(Command.Send, "отправь", "отправить", "отправь сообщение")
        put(Command.Enter, "ввод", "энтер", "нажми ввод", "нажми энтер")

        put(Command.Answer, "ответь", "ответить", "прими вызов", "прими звонок", "возьми трубку", "ответь на звонок")
        put(
            Command.HangUp,
            "сбрось", "сбросить", "сбрось вызов", "сбрось звонок", "положи трубку", "отбой", "заверши вызов",
            "заверши звонок",
        )

        put(Command.VolumeUp, "громче", "сделай громче", "прибавь звук", "погромче")
        put(Command.VolumeDown, "тише", "сделай тише", "убавь звук", "потише")
        put(Command.Mute, "без звука", "выключи звук", "отключи звук")
        put(Command.Unmute, "включи звук", "верни звук")
        put(Command.Media(MediaKey.PAUSE), "пауза", "стоп", "останови", "поставь на паузу", "останови музыку")
        put(Command.Media(MediaKey.PLAY), "играй", "продолжи", "воспроизведи", "продолжай", "включи музыку")
        put(Command.Media(MediaKey.NEXT), "следующая", "следующий", "следующий трек", "следующая песня")
        put(Command.Media(MediaKey.PREVIOUS), "предыдущая", "предыдущий", "предыдущий трек", "предыдущая песня")
        put(Command.Flashlight(true), "фонарик", "включи фонарик", "включи фонарь")
        put(Command.Flashlight(false), "выключи фонарик", "выключи фонарь")

        put(Command.Time, "который час", "сколько времени", "сколько время", "время")
        put(Command.Battery, "заряд", "сколько заряда", "батарея", "какой заряд", "заряд батареи")
        put(Command.Help, "помощь", "команды", "список команд", "что ты умеешь", "справка")
    }

    /** Команды с продолжением: «нажми …», «напиши …». Длинные приставки проверяются первыми. */
    private class Prefix(val words: List<String>, val build: (raw: String, norm: String) -> Command)

    private val prefixes: List<Prefix> = buildList {
        fun add(phrases: List<String>, build: (String, String) -> Command) {
            for (p in phrases) add(Prefix(p.split(' '), build))
        }
        add(listOf("долго нажми", "нажми и держи", "удерживай", "зажми")) { _, n -> click(n, long = true) }
        add(listOf("нажми", "нажать", "нажимай", "кликни", "тапни", "жми", "выбери")) { _, n -> click(n, long = false) }
        add(listOf("напиши", "напечатай", "введи", "пиши", "написать")) { raw, _ -> Command.Type(raw) }
        add(listOf("открой", "открыть", "запусти", "запустить")) { _, n -> Command.OpenApp(n) }
        add(listOf("позвони", "позвонить", "набери", "вызови")) { _, n -> Command.Call(n) }
        add(listOf("найди в интернете", "поищи в интернете", "найди", "поищи", "загугли")) { raw, _ ->
            Command.Search(raw)
        }
    }.sortedByDescending { it.words.size }

    private fun click(target: String, long: Boolean): Command {
        val t = target.split(' ').dropWhile { it in CLICK_FILLERS }.joinToString(" ")
        if (t.isEmpty()) return Command.Unknown(target)
        val n = RuNumbers.parse(t)
        return if (n != null) Command.ClickNumber(n, long) else Command.ClickText(t, long)
    }

    private val CLICK_FILLERS = setOf("на", "по", "кнопку", "кнопка", "номер", "цифру", "пункт")

    fun parse(raw: String, st: ParserState = ParserState()): Command {
        // Слова как сказаны (для диктовки) и они же в нормальном виде (для сравнения).
        var rawWords = raw.trim().split(Regex("\\s+")).filter { Text.normalize(it).isNotEmpty() }
        if (rawWords.isEmpty()) return Command.Ignore
        var norm = rawWords.map { Text.normalize(it) }

        val wake = Text.words(st.wakeWord)
        val hasWake = wake.isNotEmpty() && norm.size >= wake.size && norm.take(wake.size) == wake

        if (st.dictation) {
            val phrase = norm.joinToString(" ")
            val withoutWake = if (hasWake) norm.drop(wake.size).joinToString(" ") else phrase
            if (phrase in STOP_DICTATION || withoutWake in STOP_DICTATION) return Command.DictationOff
            return Command.Type(rawWords.joinToString(" "))
        }

        if (wake.isNotEmpty()) {
            if (!hasWake) return Command.Ignore
            rawWords = rawWords.drop(wake.size)
            norm = norm.drop(wake.size)
            if (norm.isEmpty()) return Command.Ignore
        }

        val phrase = norm.joinToString(" ")
        exact[phrase]?.let { return it }
        if (st.numbersShown) RuNumbers.parse(phrase)?.let { return Command.ClickNumber(it) }

        for (p in prefixes) {
            val k = p.words.size
            if (norm.size > k && norm.subList(0, k) == p.words) {
                return p.build(rawWords.drop(k).joinToString(" "), norm.drop(k).joinToString(" "))
            }
        }
        return Command.Unknown(phrase)
    }
}

private val STOP_DICTATION = setOf(
    "стоп диктовка", "стоп диктовку", "конец диктовки", "закончи диктовку", "выключи диктовку",
    "хватит диктовки", "останови диктовку",
)

/** Числа словами: «пять», «двадцать три», «сто сорок». Распознавание часто отдаёт их словами. */
object RuNumbers {
    private val units = mapOf(
        "ноль" to 0, "один" to 1, "одна" to 1, "одну" to 1, "раз" to 1, "два" to 2, "две" to 2, "три" to 3,
        "четыре" to 4, "пять" to 5, "шесть" to 6, "семь" to 7, "восемь" to 8, "девять" to 9,
    )
    private val teens = mapOf(
        "десять" to 10, "одиннадцать" to 11, "двенадцать" to 12, "тринадцать" to 13, "четырнадцать" to 14,
        "пятнадцать" to 15, "шестнадцать" to 16, "семнадцать" to 17, "восемнадцать" to 18, "девятнадцать" to 19,
    )
    private val tens = mapOf(
        "двадцать" to 20, "тридцать" to 30, "сорок" to 40, "пятьдесят" to 50, "шестьдесят" to 60,
        "семьдесят" to 70, "восемьдесят" to 80, "девяносто" to 90,
    )
    private val hundreds = mapOf(
        "сто" to 100, "двести" to 200, "триста" to 300, "четыреста" to 400, "пятьсот" to 500,
        "шестьсот" to 600, "семьсот" to 700, "восемьсот" to 800, "девятьсот" to 900,
    )

    fun parse(s: String): Int? {
        val words = Text.words(s)
        if (words.isEmpty()) return null
        if (words.size == 1 && words[0].length <= 4 && words[0].all { it in '0'..'9' }) return words[0].toInt()

        // Порядок строгий: сотни, потом десятки, потом единицы — каждое не больше одного раза.
        var sum = 0
        var stage = 0 // 0 — ничего, 1 — были сотни, 2 — были десятки, 3 — конец
        for (w in words) {
            val h = hundreds[w]
            val t = tens[w]
            val u = units[w] ?: teens[w]
            when {
                h != null && stage < 1 -> { sum += h; stage = 1 }
                t != null && stage < 2 -> { sum += t; stage = 2 }
                u != null && stage < 3 && !(stage == 2 && w in teens) -> { sum += u; stage = 3 }
                else -> return null
            }
        }
        return sum
    }
}

/** Нестрогое сравнение сказанного с подписями на экране, названиями приложений и контактами. */
object Match {
    private fun stem(w: String): String = when {
        w.length > 5 -> w.dropLast(2)
        w.length > 3 -> w.dropLast(1)
        else -> w
    }

    private fun sameWord(q: String, c: String): Boolean =
        q == c || stem(q) == stem(c) || (q.length >= 3 && c.startsWith(stem(q)))

    /** 0 — не подходит, 1 — совпало точно. Все сказанные слова должны найтись в подписи. */
    fun score(query: String, candidate: String): Double {
        val q = Text.words(query)
        val c = Text.words(candidate)
        if (q.isEmpty() || c.isEmpty()) return 0.0
        if (q == c) return 1.0
        if (q.all { qw -> c.any { cw -> sameWord(qw, cw) } }) {
            return 0.6 + 0.39 * minOf(1.0, q.size.toDouble() / c.size)
        }
        val qs = q.joinToString(" ")
        if (qs.length >= 2 && c.joinToString(" ").contains(qs)) return 0.5
        return 0.0
    }

    /** Лучший вариант из списка или null, если не подошёл ни один. */
    fun <T> best(queries: List<String>, items: Iterable<T>, label: (T) -> String?): T? {
        var best: T? = null
        var bestScore = 0.0
        var bestLen = Int.MAX_VALUE
        for (item in items) {
            val text = label(item) ?: continue
            val s = queries.maxOf { score(it, text) }
            if (s > bestScore || (s == bestScore && s > 0 && text.length < bestLen)) {
                best = item
                bestScore = s
                bestLen = text.length
            }
        }
        return best
    }

    /** Как по-русски называют приложения с латинскими именами. */
    private val aliases = mapOf(
        "ютуб" to "youtube", "ютьюб" to "youtube", "ватсап" to "whatsapp", "вацап" to "whatsapp",
        "вотсап" to "whatsapp", "телеграм" to "telegram", "телеграмм" to "telegram", "хром" to "chrome",
        "гугл" to "google", "вконтакте" to "vk", "вк" to "vk", "тикток" to "tiktok", "тик ток" to "tiktok",
        "инстаграм" to "instagram", "вайбер" to "viber", "спотифай" to "spotify", "джимейл" to "gmail",
        "плей маркет" to "play", "плеймаркет" to "play", "ютуб музыка" to "youtube music",
    )

    fun withAliases(name: String): List<String> {
        val n = Text.normalize(name)
        return listOfNotNull(n, aliases[n])
    }
}

/** Превращает продиктованное в текст: «запятая» → «,», «новая строка» → перенос. */
object Dictation {
    private val marks = listOf(
        listOf("точка", "с", "запятой") to ";",
        listOf("вопросительный", "знак") to "?",
        listOf("восклицательный", "знак") to "!",
        listOf("знак", "вопроса") to "?",
        listOf("новая", "строка") to "\n",
        listOf("с", "новой", "строки") to "\n",
        listOf("новый", "абзац") to "\n\n",
        listOf("запятая") to ",",
        listOf("точка") to ".",
        listOf("двоеточие") to ":",
        listOf("тире") to " —",
    ).sortedByDescending { it.first.size }

    fun format(raw: String, capitalizeFirst: Boolean): String {
        val words = raw.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        val norm = words.map { Text.normalize(it) }
        val sb = StringBuilder()
        var capitalize = capitalizeFirst
        var i = 0
        while (i < words.size) {
            val mark = marks.firstOrNull { (p, _) -> i + p.size <= norm.size && norm.subList(i, i + p.size) == p }
            if (mark != null) {
                sb.append(mark.second)
                if (mark.second in SENTENCE_END) capitalize = true
                i += mark.first.size
                continue
            }
            if (sb.isNotEmpty() && !sb.endsWith("\n")) sb.append(' ')
            val w = words[i]
            sb.append(if (capitalize) w.replaceFirstChar { it.uppercase() } else w)
            capitalize = false
            i++
        }
        return sb.toString()
    }

    private val SENTENCE_END = setOf(".", "?", "!", "\n", "\n\n")

    /** Дописывает новый кусок к тому, что уже есть в поле. */
    fun append(existing: String, raw: String): String {
        val trimmed = existing.trimEnd(' ')
        val startOfSentence = trimmed.isEmpty() || trimmed.last() in ".?!\n"
        val piece = format(raw, startOfSentence)
        if (piece.isEmpty()) return existing
        val glue = when {
            existing.isEmpty() || existing.last().isWhitespace() -> ""
            piece.first() in ",.;:?!\n" -> ""
            piece.startsWith(" ") -> ""
            else -> " "
        }
        return existing + glue + piece
    }

    fun dropLastWord(text: String): String {
        val t = text.trimEnd()
        val cut = t.lastIndexOfAny(charArrayOf(' ', '\n'))
        return if (cut < 0) "" else t.substring(0, cut + 1).trimEnd(' ')
    }
}
