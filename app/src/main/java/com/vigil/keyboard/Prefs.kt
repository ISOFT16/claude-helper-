package com.vigil.keyboard

import android.content.Context
import android.content.SharedPreferences

/** Все настройки клавиатуры в одном месте. */
object Prefs {
    private const val NAME = "vigilboard"

    fun sp(c: Context): SharedPreferences = c.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    // Тема: auto / light / dark / amoled / dynamic (Material You)
    // (имя kbTheme, чтобы не конфликтовать со встроенным Context.getTheme())
    var Context.kbTheme: String
        get() = sp(this).getString("theme", "auto") ?: "auto"
        set(v) = sp(this).edit().putString("theme", v).apply()

    // Цвет акцента (используется, когда тема не dynamic)
    var Context.accent: Int
        get() = sp(this).getInt("accent", 0xFF1A73E8.toInt())
        set(v) = sp(this).edit().putInt("accent", v).apply()

    // Высота одного ряда клавиш, dp (40..72)
    var Context.keyHeight: Int
        get() = sp(this).getInt("keyHeight", 56)
        set(v) = sp(this).edit().putInt("keyHeight", v).apply()

    // Скругление углов клавиш, dp (0..28)
    var Context.keyRadius: Int
        get() = sp(this).getInt("keyRadius", 10)
        set(v) = sp(this).edit().putInt("keyRadius", v).apply()

    // Отдельный ряд цифр над буквами
    var Context.numberRow: Boolean
        get() = sp(this).getBoolean("numberRow", false)
        set(v) = sp(this).edit().putBoolean("numberRow", v).apply()

    // Показывать фон клавиш (false = плоский стиль, как у Gboard без рамок)
    var Context.keyBackgrounds: Boolean
        get() = sp(this).getBoolean("keyBackgrounds", true)
        set(v) = sp(this).edit().putBoolean("keyBackgrounds", v).apply()

    // Маленькие подсказки (цифры/символы) в углу клавиш
    var Context.altHints: Boolean
        get() = sp(this).getBoolean("altHints", true)
        set(v) = sp(this).edit().putBoolean("altHints", v).apply()

    // Вибрация при нажатии
    var Context.vibration: Boolean
        get() = sp(this).getBoolean("vibration", true)
        set(v) = sp(this).edit().putBoolean("vibration", v).apply()

    // Сила вибрации, мс (5..50)
    var Context.vibrationMs: Int
        get() = sp(this).getInt("vibrationMs", 15)
        set(v) = sp(this).edit().putInt("vibrationMs", v).apply()

    // Звук клавиш
    var Context.keySound: Boolean
        get() = sp(this).getBoolean("keySound", false)
        set(v) = sp(this).edit().putBoolean("keySound", v).apply()

    // Текущий язык раскладки: en / ru
    var Context.lang: String
        get() = sp(this).getString("lang", "ru") ?: "ru"
        set(v) = sp(this).edit().putString("lang", v).apply()

    // Язык, НА который переводит переводчик: en / ru
    var Context.translateTo: String
        get() = sp(this).getString("translateTo", "en") ?: "en"
        set(v) = sp(this).edit().putString("translateTo", v).apply()
}
