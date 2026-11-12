package com.vigil.keyboard

/** Описание раскладок. Каждый ряд нормализуется по сумме weight, как в Gboard. */
object Layouts {

    const val CODE_TEXT = 0
    const val CODE_SHIFT = -1
    const val CODE_DELETE = -2
    const val CODE_SYM = -3      // перейти к символам ?123
    const val CODE_ABC = -4      // вернуться к буквам
    const val CODE_LANG = -5     // глобус: следующий язык
    const val CODE_SPACE = -6
    const val CODE_ENTER = -7
    const val CODE_SYM2 = -8     // вторая страница символов =\<
    const val CODE_SYM1 = -9     // назад на первую страницу символов

    data class Key(
        val label: String,
        val code: Int = CODE_TEXT,
        val weight: Float = 1f,
        val alt: String? = null   // символ по долгому нажатию (и подсказка в углу)
    )

    enum class Mode { EN, RU, SYM1, SYM2 }

    private fun shiftKey() = Key("", CODE_SHIFT, 1.5f)
    private fun delKey() = Key("", CODE_DELETE, 1.5f)
    private fun bottomRow(symLabel: String, symCode: Int) = listOf(
        Key(symLabel, symCode, 1.5f),
        Key(","),
        Key("", CODE_SPACE, 5f),
        Key("."),
        Key("", CODE_ENTER, 1.5f)
    )

    val numberRow = "1234567890".map { Key(it.toString()) }

    val en: List<List<Key>> = listOf(
        listOf(
            Key("q", alt = "1"), Key("w", alt = "2"), Key("e", alt = "3"),
            Key("r", alt = "4"), Key("t", alt = "5"), Key("y", alt = "6"),
            Key("u", alt = "7"), Key("i", alt = "8"), Key("o", alt = "9"),
            Key("p", alt = "0")
        ),
        listOf(
            Key("a"), Key("s"), Key("d"), Key("f"), Key("g"),
            Key("h"), Key("j"), Key("k"), Key("l")
        ),
        listOf(
            shiftKey(), Key("z"), Key("x"), Key("c"), Key("v"),
            Key("b"), Key("n"), Key("m"), delKey()
        ),
        bottomRow("?123", CODE_SYM)
    )

    val ru: List<List<Key>> = listOf(
        listOf(
            Key("й", alt = "1"), Key("ц", alt = "2"), Key("у", alt = "3"),
            Key("к", alt = "4"), Key("е", alt = "ё"), Key("н", alt = "5"),
            Key("г", alt = "6"), Key("ш", alt = "7"), Key("щ", alt = "8"),
            Key("з", alt = "9"), Key("х", alt = "0")
        ),
        listOf(
            Key("ф"), Key("ы"), Key("в"), Key("а"), Key("п"), Key("р"),
            Key("о"), Key("л"), Key("д"), Key("ж"), Key("э")
        ),
        listOf(
            shiftKey(), Key("я"), Key("ч"), Key("с"), Key("м"), Key("и"),
            Key("т"), Key("ь", alt = "ъ"), Key("б"), Key("ю"), delKey()
        ),
        bottomRow("?123", CODE_SYM)
    )

    val sym1: List<List<Key>> = listOf(
        "1234567890".map { Key(it.toString()) },
        listOf(
            Key("@"), Key("#"), Key("$", alt = "₽"), Key("_"), Key("&"),
            Key("-"), Key("+"), Key("("), Key(")"), Key("/")
        ),
        listOf(
            Key("=\\<", CODE_SYM2, 1.5f), Key("*"), Key("\""), Key("'"),
            Key(":"), Key(";"), Key("!"), Key("?"), delKey()
        ),
        bottomRow("АБВ", CODE_ABC)
    )

    val sym2: List<List<Key>> = listOf(
        listOf(
            Key("~"), Key("`"), Key("|"), Key("•"), Key("√"),
            Key("π"), Key("÷"), Key("×"), Key("¶"), Key("∆")
        ),
        listOf(
            Key("£"), Key("¢"), Key("€"), Key("¥"), Key("^"),
            Key("°"), Key("="), Key("{"), Key("}"), Key("\\")
        ),
        listOf(
            Key("?123", CODE_SYM1, 1.5f), Key("%"), Key("©"), Key("®"),
            Key("™"), Key("§"), Key("["), Key("]"), delKey()
        ),
        bottomRow("АБВ", CODE_ABC)
    )

    fun rows(mode: Mode, withNumberRow: Boolean): List<List<Key>> {
        val base = when (mode) {
            Mode.EN -> en
            Mode.RU -> ru
            Mode.SYM1 -> sym1
            Mode.SYM2 -> sym2
        }
        val letters = mode == Mode.EN || mode == Mode.RU
        return if (letters && withNumberRow) listOf(numberRow) + base else base
    }
}
