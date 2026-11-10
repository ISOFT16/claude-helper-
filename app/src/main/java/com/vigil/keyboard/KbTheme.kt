package com.vigil.keyboard

import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import com.vigil.keyboard.Prefs.accent
import com.vigil.keyboard.Prefs.kbTheme

/** Палитра клавиатуры в стиле Pixel / Gboard. */
data class KbTheme(
    val bg: Int,          // фон клавиатуры
    val key: Int,         // обычные клавиши
    val keySpecial: Int,  // shift, delete, ?123 и т.п.
    val keyPressed: Int,  // подсветка нажатия
    val text: Int,        // текст на клавишах
    val textSec: Int,     // подсказки
    val accent: Int,      // цвет Enter и активных элементов
    val onAccent: Int,    // текст на акценте
    val isDark: Boolean
) {
    companion object {
        fun resolve(c: Context): KbTheme {
            val sysDark = (c.resources.configuration.uiMode and
                    Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
            val pref = c.kbTheme
            val accent = c.accent
            return when (pref) {
                "light" -> light(accent)
                "dark" -> dark(accent)
                "amoled" -> amoled(accent)
                "dynamic" ->
                    if (Build.VERSION.SDK_INT >= 31) dynamic(c, sysDark)
                    else if (sysDark) dark(accent) else light(accent)
                else -> if (sysDark) dark(accent) else light(accent) // auto
            }
        }

        private fun light(accent: Int) = KbTheme(
            bg = 0xFFF0F2F6.toInt(),
            key = 0xFFFFFFFF.toInt(),
            keySpecial = 0xFFDDE3EA.toInt(),
            keyPressed = 0xFFC6CCD4.toInt(),
            text = 0xFF202124.toInt(),
            textSec = 0xFF6B7078.toInt(),
            accent = accent,
            onAccent = 0xFFFFFFFF.toInt(),
            isDark = false
        )

        private fun dark(accent: Int) = KbTheme(
            bg = 0xFF202124.toInt(),
            key = 0xFF3C4043.toInt(),
            keySpecial = 0xFF2E3134.toInt(),
            keyPressed = 0xFF5F6368.toInt(),
            text = 0xFFE8EAED.toInt(),
            textSec = 0xFF9AA0A6.toInt(),
            accent = lighten(accent),
            onAccent = 0xFF202124.toInt(),
            isDark = true
        )

        private fun amoled(accent: Int) = KbTheme(
            bg = 0xFF000000.toInt(),
            key = 0xFF1A1C1E.toInt(),
            keySpecial = 0xFF101214.toInt(),
            keyPressed = 0xFF3A3D40.toInt(),
            text = 0xFFF1F3F4.toInt(),
            textSec = 0xFF8A9096.toInt(),
            accent = lighten(accent),
            onAccent = 0xFF000000.toInt(),
            isDark = true
        )

        /** Material You: берём системные динамические цвета (Android 12+). */
        private fun dynamic(c: Context, dark: Boolean): KbTheme {
            fun col(id: Int) = c.getColor(id)
            return if (!dark) KbTheme(
                bg = col(android.R.color.system_neutral1_50),
                key = Color.WHITE,
                keySpecial = col(android.R.color.system_accent1_100),
                keyPressed = col(android.R.color.system_accent1_200),
                text = col(android.R.color.system_neutral1_900),
                textSec = col(android.R.color.system_neutral2_500),
                accent = col(android.R.color.system_accent1_600),
                onAccent = Color.WHITE,
                isDark = false
            ) else KbTheme(
                bg = col(android.R.color.system_neutral1_900),
                key = col(android.R.color.system_neutral1_800),
                keySpecial = col(android.R.color.system_neutral1_700),
                keyPressed = col(android.R.color.system_neutral1_600),
                text = col(android.R.color.system_neutral1_50),
                textSec = col(android.R.color.system_neutral2_400),
                accent = col(android.R.color.system_accent1_200),
                onAccent = col(android.R.color.system_neutral1_900),
                isDark = true
            )
        }

        /** Осветлить акцент для тёмных тем, чтобы он читался. */
        private fun lighten(color: Int): Int {
            val r = Color.red(color); val g = Color.green(color); val b = Color.blue(color)
            return Color.rgb(
                (r + (255 - r) * 0.45f).toInt(),
                (g + (255 - g) * 0.45f).toInt(),
                (b + (255 - b) * 0.45f).toInt()
            )
        }
    }
}
