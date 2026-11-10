package com.isoft16.vigillauncher

import android.content.ComponentName
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Typeface
import android.os.Build
import android.os.UserHandle

const val ICON_DP = 58
const val GRID_ROWS = 5

fun Context.dp(value: Float): Float = value * resources.displayMetrics.density

fun Context.dpi(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()

/** Одно приложение из списка установленных. */
class AppEntry(
    val component: ComponentName,
    val user: UserHandle,
    val label: String,
    val icon: Bitmap,
    val isSystem: Boolean,
) {
    val key: String = component.flattenToShortString()
}

/** Настройки лаунчера. */
object Prefs {
    private fun prefs(context: Context) =
        context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    fun themedIcons(context: Context): Boolean = prefs(context).getBoolean("themed", false)

    fun setThemedIcons(context: Context, value: Boolean) {
        prefs(context).edit().putBoolean("themed", value).apply()
    }

    fun columns(context: Context): Int = prefs(context).getInt("columns", 4).coerceIn(4, 5)

    fun setColumns(context: Context, value: Int) {
        prefs(context).edit().putInt("columns", value).apply()
    }
}

/** Шрифт Google Sans из ресурсов приложения. */
object Fonts {
    private var regular: Typeface? = null
    private var medium: Typeface? = null

    fun regular(context: Context): Typeface {
        regular?.let { return it }
        val font = try {
            context.resources.getFont(R.font.google_sans_regular)
        } catch (e: Exception) {
            Typeface.DEFAULT
        }
        regular = font
        return font
    }

    fun medium(context: Context): Typeface {
        medium?.let { return it }
        val font = try {
            context.resources.getFont(R.font.google_sans_medium)
        } catch (e: Exception) {
            Typeface.DEFAULT_BOLD
        }
        medium = font
        return font
    }
}

/** Цвета в стиле Material You: на Android 12+ берутся из обоев, иначе запасная палитра. */
class Palette(context: Context) {
    val dark: Boolean =
        (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES

    val surface: Int
    val container: Int
    val onSurface: Int
    val onSurfaceVariant: Int
    val accent: Int
    val pill: Int
    val themedBg: Int
    val themedFg: Int

    init {
        if (Build.VERSION.SDK_INT >= 31) {
            if (dark) {
                surface = context.getColor(android.R.color.system_neutral1_900)
                container = context.getColor(android.R.color.system_neutral2_800)
                onSurface = context.getColor(android.R.color.system_neutral1_50)
                onSurfaceVariant = context.getColor(android.R.color.system_neutral2_200)
                accent = context.getColor(android.R.color.system_accent1_200)
                pill = context.getColor(android.R.color.system_neutral1_800)
                themedBg = context.getColor(android.R.color.system_neutral1_800)
                themedFg = context.getColor(android.R.color.system_accent1_100)
            } else {
                surface = context.getColor(android.R.color.system_neutral1_50)
                container = context.getColor(android.R.color.system_neutral2_100)
                onSurface = context.getColor(android.R.color.system_neutral1_900)
                onSurfaceVariant = context.getColor(android.R.color.system_neutral2_700)
                accent = context.getColor(android.R.color.system_accent1_600)
                pill = context.getColor(android.R.color.system_neutral1_10)
                themedBg = context.getColor(android.R.color.system_accent1_100)
                themedFg = context.getColor(android.R.color.system_accent1_700)
            }
        } else if (dark) {
            surface = 0xFF1B1B1F.toInt()
            container = 0xFF2B2B30.toInt()
            onSurface = 0xFFE4E2E6.toInt()
            onSurfaceVariant = 0xFFC6C6D0.toInt()
            accent = 0xFFB4C5FF.toInt()
            pill = 0xFF2B2B30.toInt()
            themedBg = 0xFF2B2B30.toInt()
            themedFg = 0xFFDCE1FF.toInt()
        } else {
            surface = 0xFFFBF8FD.toInt()
            container = 0xFFE9E7EF.toInt()
            onSurface = 0xFF1B1B1F.toInt()
            onSurfaceVariant = 0xFF46464F.toInt()
            accent = 0xFF3F5AA9.toInt()
            pill = 0xFFFFFFFF.toInt()
            themedBg = 0xFFDCE1FF.toInt()
            themedFg = 0xFF3F4759.toInt()
        }
    }
}
