package com.isoft16.vigilvoice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CommandsTest {
    private fun p(s: String, st: ParserState = ParserState()) = CommandParser.parse(s, st)

    @Test fun navigation() {
        assertEquals(Command.Back, p("Назад"))
        assertEquals(Command.Home, p("домой."))
        assertEquals(Command.Notifications, p("Открой уведомления"))
        assertEquals(Command.Scroll(Dir.DOWN), p("листай вниз"))
        assertEquals(Command.Scroll(Dir.UP), p("вверх"))
        assertEquals(Command.Scroll(Dir.DOWN), p("Ещё"))
        assertEquals(Command.Lock, p("заблокируй телефон"))
    }

    @Test fun clicks() {
        assertEquals(Command.ClickText("отправить"), p("Нажми отправить"))
        assertEquals(Command.ClickText("войти"), p("нажми на кнопку Войти"))
        assertEquals(Command.ClickNumber(5), p("нажми 5"))
        assertEquals(Command.ClickNumber(23), p("нажми на двадцать три"))
        assertEquals(Command.ClickNumber(7, long = true), p("долго нажми семь"))
        assertEquals(Command.ClickText("настройки", long = true), p("удерживай настройки"))
    }

    @Test fun bareNumberOnlyWhenNumbersShown() {
        assertEquals(Command.ClickNumber(12), p("двенадцать", ParserState(numbersShown = true)))
        assertEquals(Command.ClickNumber(4), p("4", ParserState(numbersShown = true)))
        assertEquals(Command.Unknown("двенадцать"), p("двенадцать"))
    }

    @Test fun typing() {
        assertEquals(Command.Type("Привет, как дела"), p("напиши Привет, как дела"))
        assertEquals(Command.DictationOn, p("режим диктовки"))
        assertEquals(Command.DeleteWord, p("сотри"))
        assertEquals(Command.ClearText, p("сотри всё"))
        assertEquals(Command.Send, p("отправь"))
    }

    @Test fun dictationModeTypesEverythingUntilStop() {
        val st = ParserState(dictation = true)
        assertEquals(Command.Type("назад"), p("назад", st))
        assertEquals(Command.Type("Открой окно запятая пожалуйста"), p("Открой окно запятая пожалуйста", st))
        assertEquals(Command.DictationOff, p("Стоп диктовка", st))
        assertEquals(Command.DictationOff, p("телефон, стоп диктовка", ParserState(dictation = true, wakeWord = "телефон")))
    }

    @Test fun appsCallsSearch() {
        assertEquals(Command.OpenApp("ютуб"), p("Открой Ютуб"))
        assertEquals(Command.Call("маме"), p("позвони маме"))
        assertEquals(Command.Call("8 900 123 45 67"), p("набери 8 900 123-45-67"))
        assertEquals(Command.Search("погода в Москве"), p("найди погода в Москве"))
        assertEquals(Command.Search("рецепт борща"), p("найди в интернете рецепт борща"))
        assertEquals(Command.Answer, p("возьми трубку"))
        assertEquals(Command.HangUp, p("положи трубку"))
    }

    @Test fun mediaAndDevice() {
        assertEquals(Command.VolumeUp, p("громче"))
        assertEquals(Command.Media(MediaKey.PAUSE), p("пауза"))
        assertEquals(Command.Media(MediaKey.NEXT), p("следующий трек"))
        assertEquals(Command.Flashlight(true), p("включи фонарик"))
        assertEquals(Command.Flashlight(false), p("выключи фонарик"))
        assertEquals(Command.Time, p("который час?"))
        assertEquals(Command.Sleep, p("не слушай"))
        assertEquals(Command.Wake, p("проснись"))
    }

    @Test fun wakeWord() {
        val st = ParserState(wakeWord = "Телефон")
        assertEquals(Command.Ignore, p("назад", st))
        assertEquals(Command.Ignore, p("телефон", st))
        assertEquals(Command.Back, p("Телефон, назад", st))
        assertEquals(Command.Type("привет"), p("телефон напиши привет", st))
    }

    @Test fun unknownAndEmpty() {
        assertEquals(Command.Ignore, p("  "))
        assertEquals(Command.Unknown("какая сегодня погода"), p("Какая сегодня погода?"))
        assertEquals(Command.Unknown("нажми"), p("нажми"))
    }

    @Test fun numbers() {
        assertEquals(0, RuNumbers.parse("ноль"))
        assertEquals(15, RuNumbers.parse("пятнадцать"))
        assertEquals(40, RuNumbers.parse("сорок"))
        assertEquals(142, RuNumbers.parse("сто сорок два"))
        assertEquals(105, RuNumbers.parse("сто пять"))
        assertEquals(37, RuNumbers.parse("37"))
        assertNull(RuNumbers.parse("пять пять"))
        assertNull(RuNumbers.parse("двадцать пятнадцать"))
        assertNull(RuNumbers.parse("пять яблок"))
        assertNull(RuNumbers.parse("12345"))
    }

    @Test fun matching() {
        assertEquals(1.0, Match.score("настройки", "Настройки"), 0.0)
        assertTrue(Match.score("маме", "Мама") > 0)
        assertTrue(Match.score("ивану", "Иван Петров") > 0)
        assertTrue(Match.score("ок", "ОК") > 0)
        assertEquals(0.0, Match.score("камера", "Калькулятор"), 0.0)
        assertEquals(0.0, Match.score("мама работа", "Мама"), 0.0)

        val apps = listOf("YouTube", "YouTube Music", "Chrome", "Настройки")
        assertEquals("YouTube", Match.best(Match.withAliases("ютуб"), apps) { it })
        assertEquals("Chrome", Match.best(Match.withAliases("хром"), apps) { it })
        assertNull(Match.best(Match.withAliases("телеграм"), apps) { it })
    }

    @Test fun dictationFormatting() {
        assertEquals("Привет, как дела?", Dictation.format("привет запятая как дела вопросительный знак", true))
        assertEquals("Раз.\nДва", Dictation.format("раз точка новая строка два", true))
        assertEquals("и ещё", Dictation.format("и ещё", false))
        assertEquals("Привет", Dictation.append("", "привет"))
        assertEquals("Привет, мир", Dictation.append("Привет", "запятая мир"))
        assertEquals("Привет. Как дела", Dictation.append("Привет.", "как дела"))
        assertEquals("Привет мир", Dictation.append("Привет", "мир"))
        assertEquals("Привет", Dictation.dropLastWord("Привет мир"))
        assertEquals("", Dictation.dropLastWord("Привет"))
    }
}
